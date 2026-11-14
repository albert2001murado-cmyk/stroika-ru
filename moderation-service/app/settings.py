import os


def _integer(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


def _number(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        value = default
    return max(minimum, min(maximum, value))


SHARED_SECRET = os.getenv("MODERATION_SHARED_SECRET", "").strip()
ALLOWED_HOSTS = {
    value.strip().lower()
    for value in os.getenv(
        "MODERATION_ALLOWED_MEDIA_HOSTS",
        "strovaru.ru,www.strovaru.ru,stroika-ru.ru,www.stroika-ru.ru",
    ).split(",")
    if value.strip()
}

MAX_IMAGE_BYTES = _integer("MAX_IMAGE_BYTES", 20 * 1024 * 1024, 1_000_000, 50 * 1024 * 1024)
MAX_VIDEO_BYTES = _integer("MAX_VIDEO_BYTES", 220 * 1024 * 1024, 10_000_000, 500 * 1024 * 1024)
MAX_VIDEO_SECONDS = _integer("MAX_VIDEO_SECONDS", 180, 10, 600)
MAX_VIDEO_FRAMES = _integer("MAX_VIDEO_FRAMES", 48, 4, 90)
DOWNLOAD_TIMEOUT_SECONDS = _number("DOWNLOAD_TIMEOUT_SECONDS", 45.0, 5.0, 120.0)
OCR_ENABLED = os.getenv("OCR_ENABLED", "true").lower() == "true"
VIDEO_AUDIO_ENABLED = os.getenv("VIDEO_AUDIO_ENABLED", "true").lower() == "true"

TEXT_MODEL = os.getenv(
    "TEXT_MODEL",
    "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
)
IMAGE_MODEL = os.getenv("IMAGE_MODEL", "sentence-transformers/clip-ViT-B-32")
IMAGE_TEXT_MODEL = os.getenv(
    "IMAGE_TEXT_MODEL",
    "sentence-transformers/clip-ViT-B-32-multilingual-v1",
)
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "tiny")

TEXT_CATEGORY_REVIEW_THRESHOLD = _number(
    "TEXT_CATEGORY_REVIEW_THRESHOLD", 0.20, 0.05, 0.80
)
TEXT_CATEGORY_REJECT_MARGIN = _number(
    "TEXT_CATEGORY_REJECT_MARGIN", 0.16, 0.08, 0.50
)
TEXT_RISK_REVIEW_THRESHOLD = _number(
    "TEXT_RISK_REVIEW_THRESHOLD", 0.52, 0.20, 0.90
)
IMAGE_CATEGORY_REVIEW_THRESHOLD = _number(
    "IMAGE_CATEGORY_REVIEW_THRESHOLD", 0.18, 0.05, 0.80
)
IMAGE_CATEGORY_REJECT_MARGIN = _number(
    "IMAGE_CATEGORY_REJECT_MARGIN", 0.06, 0.03, 0.30
)
NSFW_REJECT_THRESHOLD = _number("NSFW_REJECT_THRESHOLD", 0.72, 0.50, 0.99)
NSFW_REVIEW_THRESHOLD = _number("NSFW_REVIEW_THRESHOLD", 0.48, 0.25, 0.95)
EXPLICIT_VISUAL_REJECT_THRESHOLD = _number(
    "EXPLICIT_VISUAL_REJECT_THRESHOLD", 0.22, 0.10, 0.80
)

MODEL_THREADS = _integer("MODEL_THREADS", 4, 1, 8)
PROCESS_TIMEOUT_SECONDS = _integer("PROCESS_TIMEOUT_SECONDS", 200, 30, 240)
SERVICE_RULES = "Правила публикации Строва"
LAW_INFORMATION = "149-ФЗ «Об информации, информационных технологиях и о защите информации»"
