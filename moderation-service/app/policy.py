import re
import unicodedata

from . import settings
from .schemas import ModerationFlag


WORD = re.compile(r"[a-zа-яё0-9]+", re.IGNORECASE)
GENERIC_TITLES = {
    "лучшие",
    "лучшая",
    "лучший",
    "качественно",
    "быстро и качественно",
    "услуги",
    "работа",
    "предложение",
    "недорого",
    "все виды работ",
    "профессионально",
}
STOP_WORDS = {
    "и", "или", "в", "во", "на", "по", "для", "из", "с", "со", "от", "до",
    "мы", "я", "вы", "ваш", "ваша", "ваши", "наш", "наша", "это", "как", "а",
    "но", "не", "что", "все", "всё", "очень", "самый", "самая", "лучший",
    "лучшая", "лучшие", "качественно", "быстро", "недорого", "цена", "руб",
}

CRITICAL_MEDIA_TEXT = re.compile(
    r"(?:продам|куплю|доставлю|закладк\w*).{0,45}"
    r"(?:наркотик\w*|героин\w*|кокаин\w*|мефедрон\w*|амфетамин\w*)|"
    r"(?:изготовлю|продам|сделаю).{0,45}(?:поддельн\w*\s+)?"
    r"(?:паспорт\w*|удостоверени\w*|диплом\w*)|"
    r"(?:порнограф\w*\s+с\s+несовершеннолетн\w*)",
    re.IGNORECASE | re.DOTALL,
)
REVIEW_MEDIA_TEXT = re.compile(
    r"(?:оружи\w*|боеприпас\w*|взрывчат\w*|наркотик\w*|"
    r"террорист\w*|экстремист\w*|порнограф\w*)",
    re.IGNORECASE,
)
PHONE_IN_MEDIA = re.compile(
    r"(?<!\d)(?:(?:\+?7|8)[\s().\-]*(?:\d[\s().\-]*){10}|"
    r"9\d{2}[\s().\-]*(?:\d[\s().\-]*){7})(?!\d)",
    re.IGNORECASE,
)

from .language_policy import contains_prohibited_language, contains_explicit_adult_text


def normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value or "").lower().replace("ё", "е")
    return " ".join(WORD.findall(normalized))


def meaningful_tokens(value: str) -> set[str]:
    return {
        token
        for token in normalize(value).split()
        if len(token) >= 3 and token not in STOP_WORDS and not token.isdigit()
    }


def catalog_label(section: str, category: str, subcategory: str) -> str:
    section_labels = {
        "services": "строительные услуги",
        "materials": "строительные материалы",
        "equipment": "строительная техника",
        "solutions": "комплексное строительное решение",
    }
    parts = [section_labels.get(section, section), category, subcategory]
    return ". ".join(part.strip() for part in parts if part and part.strip())


def text_quality_flags(title: str, description: str) -> list[ModerationFlag]:
    title_normalized = normalize(title)
    title_tokens = meaningful_tokens(title)
    description_tokens = meaningful_tokens(description)
    flags: list[ModerationFlag] = []
    if contains_prohibited_language(f"{title}\n{description}"):
        flags.append(
            ModerationFlag(
                code="profanity",
                field="content",
                severity="changes",
                message="Удалите оскорбления и нецензурную лексику.",
                legalBasis=settings.SERVICE_RULES,
            )
        )
    if contains_explicit_adult_text(f"{title}\n{description}"):
        flags.append(ModerationFlag(code="explicit-text", field="content", severity="changes",
                                    message="Контент для взрослых и интимные услуги запрещены в Строве."))
    if title_normalized in GENERIC_TITLES or len(title_tokens) < 2:
        flags.append(
            ModerationFlag(
                code="generic-title",
                field="title",
                severity="changes",
                message=(
                    "Уточните название: напишите конкретную услугу, материал или технику, "
                    "которую предлагаете."
                ),
                legalBasis=settings.SERVICE_RULES,
            )
        )
    if len(description_tokens) < 4:
        flags.append(
            ModerationFlag(
                code="generic-description",
                field="description",
                severity="changes",
                message=(
                    "Добавьте конкретное описание работ, материала или техники и условий предложения."
                ),
                legalBasis=settings.SERVICE_RULES,
            )
        )
    return flags


def embedded_text_flags(value: str, field: str = "media") -> list[ModerationFlag]:
    raw = unicodedata.normalize("NFKC", value or "")
    if contains_prohibited_language(raw):
        return [ModerationFlag(code="profanity-in-media", field=field, severity="changes",
                               message="В надписях или речи обнаружена нецензурная лексика. Замените вложение.")]
    if contains_explicit_adult_text(raw):
        return [ModerationFlag(code="explicit-media-text", field=field, severity="critical",
                               message="В надписях или речи обнаружен контент для взрослых.")]
    if PHONE_IN_MEDIA.search(raw):
        return [
            ModerationFlag(
                code="phone-number-in-media",
                field=field,
                severity="changes",
                message=(
                    "На фото или в видео обнаружен номер телефона. "
                    "Удалите контактные данные из медиа и загрузите файл повторно."
                ),
                legalBasis=settings.SERVICE_RULES,
            )
        ]
    normalized = normalize(value)
    if not normalized:
        return []
    if CRITICAL_MEDIA_TEXT.search(normalized):
        return [
            ModerationFlag(
                code="prohibited-media-text",
                field=field,
                severity="critical",
                message="В медиа обнаружено предложение с признаками запрещённого содержания.",
                legalBasis=f"{settings.LAW_INFORMATION}; {settings.SERVICE_RULES}",
            )
        ]
    if REVIEW_MEDIA_TEXT.search(normalized):
        return [
            ModerationFlag(
                code="suspicious-media-text",
                field=field,
                severity="review",
                message="Текст внутри фото или видео требует дополнительной проверки.",
                legalBasis=f"{settings.LAW_INFORMATION}; {settings.SERVICE_RULES}",
            )
        ]
    return []


def deduplicate_flags(flags: list[ModerationFlag]) -> list[ModerationFlag]:
    result: list[ModerationFlag] = []
    seen: set[tuple[str, str]] = set()
    for flag in flags:
        key = (flag.code, flag.field)
        if key not in seen:
            result.append(flag)
            seen.add(key)
    return result[:30]


def decision_from_flags(flags: list[ModerationFlag]) -> str:
    if any(flag.severity in {"critical", "changes"} for flag in flags):
        return "rejected"
    if any(flag.severity == "review" for flag in flags):
        return "manual_review"
    return "approved"
