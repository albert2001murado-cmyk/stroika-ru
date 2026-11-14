import json
import os
import subprocess
import threading
import time
import warnings
from contextvars import ContextVar
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageFile

from . import settings
from .policy import (
    catalog_label,
    deduplicate_flags,
    embedded_text_flags,
    meaningful_tokens,
    text_quality_flags,
)
from .schemas import ModerationFlag, ModerationRequest


Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
ImageFile.LOAD_TRUNCATED_IMAGES = False
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")
os.environ.setdefault("OPENNSFW2_KERAS", "tf-keras")


_deadline: ContextVar[float] = ContextVar("moderation_deadline", default=float("inf"))


def remaining_seconds(maximum: float = 200) -> float:
    remaining = _deadline.get() - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("moderation-budget-exhausted")
    return min(maximum, remaining)


@dataclass
class DownloadedMedia:
    type: str
    path: Path


@dataclass
class ClassificationResult:
    flags: list[ModerationFlag] = field(default_factory=list)
    media_checked: int = 0
    scores: dict[str, float | int | str | bool] = field(default_factory=dict)


class ModelBundle:
    def __init__(self) -> None:
        import opennsfw2 as n2
        import torch
        from sentence_transformers import SentenceTransformer

        import tensorflow as tf
        tf.config.threading.set_intra_op_parallelism_threads(settings.MODEL_THREADS)
        tf.config.threading.set_inter_op_parallelism_threads(1)
        torch.set_num_threads(settings.MODEL_THREADS)
        self.n2 = n2
        self.text_model = SentenceTransformer(settings.TEXT_MODEL, device="cpu")
        self.image_model = SentenceTransformer(settings.IMAGE_MODEL, device="cpu")
        self.image_text_model = SentenceTransformer(
            settings.IMAGE_TEXT_MODEL,
            device="cpu",
        )
        self.nsfw_model = n2.make_open_nsfw_model()
        self._whisper_model = None
        self._whisper_lock = threading.Lock()
        self._prompt_cache: OrderedDict[tuple[str, str], np.ndarray] = OrderedDict()

    def prompt_embeddings(self, kind: str, prompts: list[str]) -> np.ndarray:
        model = self.text_model if kind == "text" else self.image_text_model
        missing = list(dict.fromkeys(
            prompt for prompt in prompts if (kind, prompt) not in self._prompt_cache
        ))
        if missing:
            embeddings = model.encode(
                missing, normalize_embeddings=True, convert_to_numpy=True,
                show_progress_bar=False,
            )
            for prompt, vector in zip(missing, embeddings):
                self._prompt_cache[(kind, prompt)] = vector
        result = np.stack([self._prompt_cache[(kind, prompt)] for prompt in prompts])
        for prompt in prompts:
            self._prompt_cache.move_to_end((kind, prompt))
        while len(self._prompt_cache) > 3072:
            self._prompt_cache.popitem(last=False)
        return result

    def whisper_model(self):
        if self._whisper_model is None:
            with self._whisper_lock:
                if self._whisper_model is None:
                    from faster_whisper import WhisperModel

                    self._whisper_model = WhisperModel(
                        settings.WHISPER_MODEL,
                        device="cpu",
                        compute_type="int8",
                        cpu_threads=settings.MODEL_THREADS,
                        num_workers=1,
                    )
        return self._whisper_model


_models: ModelBundle | None = None
_models_lock = threading.Lock()


def get_models() -> ModelBundle:
    global _models
    if _models is None:
        with _models_lock:
            if _models is None:
                _models = ModelBundle()
    return _models


def _related_catalog_labels(left: str, right: str) -> bool:
    # A plain photo cannot reliably separate parent/subtype or a material from
    # work using that same material. Route these cases to review, not rejection.
    action_roots = ("монтаж", "установ", "ремонт", "работ", "строител", "уклад", "услуг", "продаж", "аренд")
    def roots(label: str) -> set[str]:
        return {
            token[:4] for token in meaningful_tokens(label)
            if not token.startswith(action_roots)
        }
    return bool(roots(left) & roots(right))


def _text_relevance(
    request: ModerationRequest,
    models: ModelBundle,
) -> tuple[list[ModerationFlag], dict[str, float | str]]:
    label = catalog_label(
        request.catalog.section,
        request.catalog.category,
        request.catalog.subcategory,
    )
    if not label:
        return [
            ModerationFlag(
                code="missing-catalog-context",
                field="category",
                severity="review",
                message="Не удалось определить выбранную категорию для проверки.",
            )
        ], {"textCategory": 0.0}

    content = f"{request.title}. {request.description}".strip()
    risk_prompts = [
        "предложение купить или продать наркотики и запрещённые вещества",
        "продажа оружия, боеприпасов или взрывчатки",
        "мошенничество, кража денег, банковских карт или паролей",
        "порнография, сексуальная эксплуатация или интимные услуги",
        "экстремизм, терроризм, разжигание ненависти или призывы к насилию",
        "инструкция по самоубийству или причинению вреда человеку",
        "изготовление поддельных документов или незаконный обход разрешений",
    ]
    selected = request.catalog.subcategory or request.catalog.category
    displayed_category = selected[:100]
    alternatives = [value for value in dict.fromkeys(request.catalog.alternatives) if ": " not in value][:800]
    construction_prompts = [
        "строительство, ремонт, строительные материалы, спецтехника и благоустройство",
        "отделка, инженерные системы, сантехника, мебель и строительные работы",
    ]
    unrelated_prompts = [
        "продажа телефона, компьютера, игровой приставки или другой электроники",
        "одежда, косметика, еда, животные или личные знакомства",
        "развлечения, реклама сторонних услуг, не связанных со строительством",
        "продажа воздушного судна, вертолёта, самолёта или авиационной техники",
    ]
    prompts = [
        selected, label, *construction_prompts, *unrelated_prompts,
        *risk_prompts, *alternatives,
    ]
    prompt_vectors = models.prompt_embeddings("text", prompts)
    embeddings = models.text_model.encode(
        [content, request.title, request.description],
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
    )
    matrix = np.matmul(embeddings, prompt_vectors.T)
    construction_start = 2
    unrelated_start = construction_start + len(construction_prompts)
    risk_start = unrelated_start + len(unrelated_prompts)
    alternatives_start = risk_start + len(risk_prompts)
    score = float(matrix[0, 0])
    risk_scores = matrix[:, risk_start:alternatives_start]
    maximum_risk = float(np.max(risk_scores))
    flags: list[ModerationFlag] = []
    closest_label = ""
    closest_score = 0.0
    for row_index, field_name in ((1, "title"), (2, "description"), (0, "category")):
        row = matrix[row_index]
        selected_score = float(row[0])
        construction_score = float(np.max(row[construction_start:unrelated_start]))
        unrelated_score = float(np.max(row[unrelated_start:risk_start]))
        if alternatives:
            alternative_index = int(np.argmax(row[alternatives_start:]))
            alternative_score = float(row[alternatives_start + alternative_index])
            alternative_label = alternatives[alternative_index]
        else:
            alternative_score, alternative_label = 0.0, ""
        if alternative_score > closest_score:
            closest_score, closest_label = alternative_score, alternative_label

        # The title and description are checked separately: a copied correct
        # description must not hide an unrelated title, and vice versa.
        if (
            unrelated_score > selected_score + settings.TEXT_CATEGORY_REJECT_MARGIN
            and unrelated_score > construction_score + 0.08
        ):
            flags.append(ModerationFlag(
                code="text-outside-catalog", field=field_name, severity="changes",
                message=(
                    f"Текст не относится к выбранной подкатегории «{displayed_category}» и строительным предложениям. "
                    "Размещайте только услуги, материалы или технику из каталога Стровы. "
                    "Измените название и описание; случайный выбор категории не подходит."
                ),
            ))
            break
        if (
            alternative_score >= 0.30
            and alternative_score > selected_score + settings.TEXT_CATEGORY_REJECT_MARGIN
            and selected_score < 0.34
            and not _related_catalog_labels(selected, alternative_label)
        ):
            flags.append(ModerationFlag(
                code="text-category-mismatch", field=field_name, severity="changes",
                message=(
                    f"Выбрана подкатегория «{displayed_category}», но текст больше соответствует «{alternative_label[:100]}». "
                    "Исправьте название и описание. Если предлагаете другое, создайте новое объявление в подходящей подкатегории."
                ),
            ))
            break

    if not flags and score < settings.TEXT_CATEGORY_REVIEW_THRESHOLD:
        flags.append(
            ModerationFlag(
                code="text-category-uncertain",
                field="category",
                severity="review",
                message=(
                    f"Уточните, как ваше предложение связано с подкатегорией «{displayed_category}». "
                    "Неоднозначное объявление проверит модератор; до решения оно не публикуется."
                ),
            )
        )
    if maximum_risk >= settings.TEXT_RISK_REVIEW_THRESHOLD:
        flags.append(
            ModerationFlag(
                code="semantic-risk-review",
                field="content",
                severity="review",
                message="Смысл текста похож на запрещённое предложение и требует проверки модератором.",
                legalBasis=f"{settings.LAW_INFORMATION}; {settings.SERVICE_RULES}",
            )
        )
    return flags, {
        "textCategory": round(score, 4),
        "textRisk": round(maximum_risk, 4),
        "textClosestCategory": closest_label,
        "textClosestCategoryScore": round(closest_score, 4),
    }


def _open_images(paths: list[Path]) -> list[Image.Image]:
    images: list[Image.Image] = []
    for path in paths:
        remaining_seconds()
        with Image.open(path) as source:
            if getattr(source, "n_frames", 1) > 1:
                raise ValueError("animated-image-needs-review")
            source.verify()
        with Image.open(path) as source:
            source.thumbnail((1280, 1280))
            images.append(source.convert("RGB"))
    return images


def _nsfw_scores(images: list[Image.Image], models: ModelBundle) -> list[float]:
    prepared = np.stack(
        [
            models.n2.preprocess_image(image, models.n2.Preprocessing.YAHOO)
            for image in images
        ]
    )
    predictions = models.nsfw_model.predict(
        prepared,
        batch_size=min(8, len(images)),
        verbose=0,
    )
    return [float(row[1]) for row in predictions]


UNRELATED_PROMPTS = [
    "личное селфи или семейная фотография",
    "домашнее животное",
    "еда и напитки",
    "пейзаж или фотография из путешествия",
    "мем, переписка или случайный снимок экрана",
    "вертолёт или самолёт в полёте, авиационная техника",
    "легковой автомобиль, одежда или бытовая электроника",
]
EXPLICIT_PROMPTS = [
    "порнографическая фотография",
    "полностью обнажённый человек с видимыми половыми органами",
    "сексуальный акт или интимная сцена",
    "откровенное изображение для взрослых 18+",
]
RISK_PROMPTS = [
    "оружие, боеприпасы или взрывчатые вещества",
    "наркотики или запрещённые вещества",
    "жестокое насилие, кровь или травмы",
    "экстремистская или террористическая символика",
]


def _visual_scores(
    images: list[Image.Image],
    category: str,
    models: ModelBundle,
    alternatives: list[str] | None = None,
    listing_text: str = "",
) -> list[dict[str, float | str]]:
    alternatives = [value for value in dict.fromkeys(alternatives or []) if ": " not in value][:800]
    selected_prompts = [
        category,
        f"Фотография товара, техники или выполненной работы: {category}",
    ]
    safe_prompts = [
        "обычная безопасная фотография строительных работ, материалов или техники",
        "фотография ремонта, мебели, инженерных систем или благоустройства",
    ]
    prompts = [
        *selected_prompts,
        *safe_prompts,
        *UNRELATED_PROMPTS,
        *EXPLICIT_PROMPTS,
        *RISK_PROMPTS,
        *alternatives,
        *([listing_text] if listing_text else []),
    ]
    image_embeddings = models.image_model.encode(
        images,
        normalize_embeddings=True,
        convert_to_numpy=True,
        show_progress_bar=False,
        batch_size=min(8, len(images)),
    )
    text_embeddings = models.prompt_embeddings("image", prompts)
    matrix = np.matmul(image_embeddings, text_embeddings.T)
    safe_start = len(selected_prompts)
    unrelated_start = safe_start + len(safe_prompts)
    explicit_start = unrelated_start + len(UNRELATED_PROMPTS)
    risk_start = explicit_start + len(EXPLICIT_PROMPTS)
    alternatives_start = risk_start + len(RISK_PROMPTS)
    return [
        {
            "category": float(np.max(row[:safe_start])),
            "safe": float(np.max(row[safe_start:unrelated_start])),
            "unrelated": float(np.max(row[unrelated_start:explicit_start])),
            "explicit": float(np.max(row[explicit_start:risk_start])),
            "risk": float(np.max(row[risk_start:alternatives_start])),
            "alternative": float(np.max(row[alternatives_start:alternatives_start + len(alternatives)])) if alternatives else 0.0,
            "alternativeLabel": alternatives[int(np.argmax(row[alternatives_start:alternatives_start + len(alternatives)]))] if alternatives else "",
            "listing": float(row[-1]) if listing_text else float(np.max(row[:safe_start])),
        }
        for row in matrix
    ]


def _visual_alignment_flags(
    scores: list[dict[str, float | str]],
    category: str,
    field: str,
    video_label: str = "",
) -> tuple[list[ModerationFlag], int, int]:
    flags: list[ModerationFlag] = []
    relevant = 0
    mismatched = 0
    for index, score in enumerate(scores):
        selected = float(score["category"])
        safe = float(score["safe"])
        unrelated = float(score["unrelated"])
        alternative = float(score.get("alternative", 0.0))
        margin = settings.IMAGE_CATEGORY_REJECT_MARGIN
        outside_construction = (
            unrelated >= settings.IMAGE_CATEGORY_REVIEW_THRESHOLD
            and unrelated > selected + margin
            and unrelated > safe + margin
        )
        other_category = (
            alternative >= settings.IMAGE_CATEGORY_REVIEW_THRESHOLD
            and alternative > selected + margin
            and not _related_catalog_labels(category, str(score.get("alternativeLabel") or ""))
        )
        media_label = video_label or f"Фото №{index + 1}"
        media_field = field if video_label else f"{field}.photo.{index + 1}"
        if outside_construction or other_category:
            mismatched += 1
            detail = (
                "изображение не относится к строительному предложению"
                if outside_construction
                else f"изображение больше похоже на «{str(score.get('alternativeLabel') or 'другую категорию')[:80]}»"
            )
            flags.append(ModerationFlag(
                code="media-category-mismatch", field=media_field, severity="changes",
                message=(
                    f"{media_label} не соответствует подкатегории «{category[:80]}»: {detail}. "
                    "Замените вложение на фото или видео выбранного материала, техники или результата работы. "
                    "Если предлагаете другое — создайте новое объявление в подходящей подкатегории каталога."
                ),
            ))
        elif float(score.get("listing", selected)) < 0.12:
            flags.append(ModerationFlag(
                code="media-description-uncertain", field=media_field, severity="review",
                message=f"{media_label}: не удалось подтвердить соответствие названию и описанию. Нужна проверка модератором.",
            ))
        elif selected >= settings.IMAGE_CATEGORY_REVIEW_THRESHOLD and selected + 0.015 >= max(unrelated, alternative):
            relevant += 1
        else:
            flags.append(ModerationFlag(
                code="media-category-uncertain", field=media_field, severity="review",
                message=(
                    f"По {media_label.lower()} нельзя уверенно подтвердить подкатегорию «{category[:100]}». "
                    "Добавьте понятное изображение выбранного предложения. До решения модератора объявление не публикуется."
                ),
            ))
    return deduplicate_flags(flags), relevant, mismatched


def _ocr(path: Path) -> str:
    if not settings.OCR_ENABLED:
        raise RuntimeError("OCR-disabled")
    result = subprocess.run(
        ["tesseract", str(path), "stdout", "-l", "rus+eng", "--psm", "11"],
        check=True, capture_output=True, text=True, timeout=remaining_seconds(5),
    )
    if len(result.stdout) > 8000:
        raise ValueError("ocr-text-exceeds-limit")
    return result.stdout


def _evaluate_images(
    paths: list[Path],
    category: str,
    models: ModelBundle,
    field: str,
    alternatives: list[str] | None = None,
    video_label: str = "",
    listing_text: str = "",
) -> tuple[list[ModerationFlag], dict[str, float | int]]:
    if not paths:
        return [], {}
    images = _open_images(paths)
    nsfw = _nsfw_scores(images, models)
    visual = _visual_scores(images, category, models, alternatives, listing_text)
    flags: list[ModerationFlag] = []
    maximum_nsfw = max(nsfw, default=0.0)
    # Existing installations may still carry the old permissive values in
    # .env. Keep those from weakening the new hard 18+ policy.
    nsfw_reject_threshold = min(settings.NSFW_REJECT_THRESHOLD, 0.72)
    nsfw_review_threshold = min(settings.NSFW_REVIEW_THRESHOLD, 0.48)
    maximum_explicit = max((score["explicit"] for score in visual), default=0.0)
    explicit_frames = sum(
        1
        for score in visual
        if score["explicit"] >= settings.EXPLICIT_VISUAL_REJECT_THRESHOLD
        and score["explicit"] > score["safe"] + 0.015
        and score["explicit"] > score["category"] + 0.015
    )
    if maximum_nsfw >= nsfw_reject_threshold or explicit_frames > 0:
        flags.append(
            ModerationFlag(
                code="explicit-media",
                field=field,
                severity="critical",
                message="На фото или кадрах видео обнаружен откровенный контент.",
                legalBasis=f"{settings.LAW_INFORMATION}; {settings.SERVICE_RULES}",
            )
        )
    elif maximum_nsfw >= nsfw_review_threshold:
        flags.append(
            ModerationFlag(
                code="possible-explicit-media",
                field=field,
                severity="review",
                message="Фото или видео требует проверки на откровенный контент.",
                legalBasis=f"{settings.LAW_INFORMATION}; {settings.SERVICE_RULES}",
            )
        )

    alignment_flags, relevant, mismatched = _visual_alignment_flags(
        visual, category, field, video_label
    )
    flags.extend(alignment_flags)
    suspicious = 0
    for score in visual:
        if (
            score["risk"] >= 0.22
            and score["risk"] > score["category"] + 0.04
            and score["risk"] > score["safe"] + 0.025
        ):
            suspicious += 1

    if suspicious > 0:
        flags.append(
            ModerationFlag(
                code="visual-risk-review",
                field=field,
                severity="review",
                message="На фото или в видео обнаружены объекты, требующие проверки модератором.",
                legalBasis=f"{settings.LAW_INFORMATION}; {settings.SERVICE_RULES}",
            )
        )

    for index, path in enumerate(paths):
        # A seventh photo must not bypass the contact/profanity check.
        media_field = field if video_label else f"{field}.photo.{index + 1}"
        try:
            flags.extend(embedded_text_flags(_ocr(path), media_field))
        except (OSError, ValueError, subprocess.SubprocessError):
            flags.append(ModerationFlag(code="media-text-analysis-failed", field=media_field,
                                       severity="review", message="Не удалось проверить надписи во вложении. Нужна дополнительная проверка."))
    return flags, {
        "frames": len(paths),
        "relevantFrames": relevant,
        "mismatchedFrames": mismatched,
        "maxNsfw": round(maximum_nsfw, 4),
        "maxExplicit": round(maximum_explicit, 4),
        "explicitFrames": explicit_frames,
        "suspiciousFrames": suspicious,
    }


def _video_metadata(path: Path) -> tuple[float, bool]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-protocol_whitelist", "file,pipe",
            "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm",
            "-show_entries",
            "format=duration:stream=codec_type",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=remaining_seconds(30),
    )
    payload = json.loads(result.stdout)
    duration = float(payload.get("format", {}).get("duration") or 0.0)
    has_audio = any(
        stream.get("codec_type") == "audio" for stream in payload.get("streams", [])
    )
    return duration, has_audio


def _video_frames(path: Path, output: Path, duration: float) -> list[Path]:
    checked_duration = min(
        max(duration, 1.0),
        float(settings.MAX_VIDEO_SECONDS),
    )
    # Do not let an old .env keep the former sparse 24-frame scan.
    frame_limit = max(48, settings.MAX_VIDEO_FRAMES)
    interval = max(1.0, checked_duration / frame_limit)
    pattern = output / "frame-%03d.jpg"
    subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-protocol_whitelist", "file,pipe",
            "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm",
            "-i",
            str(path),
            "-t",
            f"{checked_duration:.3f}",
            "-vf",
            f"fps=1/{interval:.5f},scale=640:-2:force_original_aspect_ratio=decrease",
            "-frames:v",
            str(frame_limit),
            "-q:v",
            "3",
            str(pattern),
        ],
        check=True,
        timeout=remaining_seconds(60),
    )
    return sorted(output.glob("frame-*.jpg"))


def _video_transcript(path: Path, output: Path, models: ModelBundle) -> str:
    if not settings.VIDEO_AUDIO_ENABLED:
        raise RuntimeError("audio-check-disabled")
    audio_path = output / "audio.wav"
    extracted = subprocess.run(
        [
            "ffmpeg",
            "-nostdin",
            "-v",
            "error",
            "-protocol_whitelist", "file,pipe",
            "-format_whitelist", "mov,mp4,m4a,3gp,3g2,mj2,matroska,webm",
            "-i",
            str(path),
            "-t",
            str(settings.MAX_VIDEO_SECONDS),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(audio_path),
        ],
        check=False,
        timeout=remaining_seconds(45),
    )
    if extracted.returncode != 0 or not audio_path.exists():
        raise ValueError("audio-extraction-failed")
    segments, _ = models.whisper_model().transcribe(
        str(audio_path),
        language=None,
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    transcript = []
    for segment in segments:
        remaining_seconds()
        transcript.append(segment.text.strip())
    value = " ".join(transcript)
    if len(value) > 8000:
        raise ValueError("transcript-exceeds-limit")
    return value


def classify(
    request: ModerationRequest,
    media: list[DownloadedMedia],
    work_dir: Path,
) -> ClassificationResult:
    _deadline.set(time.monotonic() + settings.PROCESS_TIMEOUT_SECONDS)
    models = get_models()
    result = ClassificationResult(media_checked=0)
    result.flags.extend(text_quality_flags(request.title, request.description))
    relevance_flags, relevance_scores = _text_relevance(request, models)
    result.flags.extend(relevance_flags)
    result.scores.update(relevance_scores)

    category = request.catalog.subcategory or request.catalog.category
    listing_text = f"{request.title}. {request.description[:240]}"
    remaining_seconds()
    image_paths = [item.path for item in media if item.type == "image"]
    if image_paths:
        flags, scores = _evaluate_images(
            image_paths, category, models, "media", request.catalog.alternatives,
            listing_text=listing_text,
        )
        result.flags.extend(flags)
        result.media_checked += len(image_paths)
        result.scores.update({f"photos{key[0].upper()}{key[1:]}": value for key, value in scores.items()})

    videos = [item.path for item in media if item.type == "video"]
    total_frames = 0
    max_video_nsfw = 0.0
    max_video_explicit = 0.0
    explicit_video_frames = 0
    relevant_video_frames = 0
    for index, video_path in enumerate(videos):
        video_dir = work_dir / f"video-{index}"
        video_dir.mkdir(parents=True, exist_ok=True)
        try:
            remaining_seconds()
            duration, has_audio = _video_metadata(video_path)
            if duration <= 0:
                raise ValueError("invalid duration")
            if duration > settings.MAX_VIDEO_SECONDS:
                result.flags.append(
                    ModerationFlag(
                        code="video-duration-review",
                        field="media",
                        severity="review",
                        message=(
                            f"Видео длиннее {settings.MAX_VIDEO_SECONDS} секунд: "
                            "для публикации нужна дополнительная проверка."
                        ),
                    )
                )
            frames = _video_frames(video_path, video_dir, duration)
            if not frames:
                raise ValueError("video has no decodable frames")
            flags, scores = _evaluate_images(
                frames, category, models, f"media.video.{index + 1}",
                request.catalog.alternatives, f"Видео №{index + 1}", listing_text,
            )
            result.flags.extend(flags)
            total_frames += int(scores.get("frames", 0))
            relevant_video_frames += int(scores.get("relevantFrames", 0))
            max_video_nsfw = max(max_video_nsfw, float(scores.get("maxNsfw", 0.0)))
            max_video_explicit = max(max_video_explicit, float(scores.get("maxExplicit", 0.0)))
            explicit_video_frames += int(scores.get("explicitFrames", 0))
            if has_audio:
                transcript = _video_transcript(video_path, video_dir, models)
                result.flags.extend(embedded_text_flags(transcript, f"media.video.{index + 1}"))
            result.media_checked += 1
        except (OSError, ValueError, subprocess.SubprocessError, json.JSONDecodeError):
            result.flags.append(
                ModerationFlag(
                    code="video-analysis-failed",
                    field="media",
                    severity="review",
                    message="Не удалось полностью проверить видео; оно передано модератору.",
                )
            )

    result.scores.update(
        {
            "videos": len(videos),
            "videoFrames": total_frames,
            "relevantVideoFrames": relevant_video_frames,
            "maxVideoNsfw": round(max_video_nsfw, 4),
            "maxVideoExplicit": round(max_video_explicit, 4),
            "explicitVideoFrames": explicit_video_frames,
        }
    )
    result.flags = deduplicate_flags(result.flags)
    return result
