"""The same versioned vocabulary as the website, including OCR and speech."""
import json
import re
import unicodedata
from pathlib import Path

RULES = json.loads(Path(__file__).with_name("moderation-language.json").read_text())
PATTERNS = [re.compile(p) for key in ("CYRILLIC_PROFANITY", "LATIN_PROFANITY") for p in RULES[key]]
EXPLICIT = [re.compile(p, re.IGNORECASE) for p in RULES["EXPLICIT_TEXT"]]


def candidates(value: str) -> set[str]:
    prepared = unicodedata.normalize("NFKD", value[:20000].replace("й", "и").replace("Й", "и"))
    prepared = "".join(c for c in prepared if not unicodedata.combining(c)).lower().replace("ё", "е")
    prepared = re.sub("[\u200b-\u200d\ufeff]", "", prepared)
    prepared = prepared.replace("@", "a").replace("$", "s").replace("!", "i")
    tokens = re.findall(r"[a-zа-я0-9]+", prepared)
    joined = set(tokens)
    for start, token in enumerate(tokens):
        if len(token) > 3:
            continue
        word = ""
        for offset, part in enumerate(tokens[start:start + 8]):
            if len(part) > 3:
                break
            word += part
            if offset and len(word) >= 3:
                joined.add(word)
    result = set()
    for word in joined:
        word = re.sub(r"(.)\1{2,}", r"\1\1", word)
        variants = [word] + [word.translate(str.maketrans(RULES[key])) for key in ("CYRILLIC_LOOKALIKE", "LATIN_TRANSLITERATION")]
        for variant in variants:
            result.add(variant)
            result.add(re.sub(r"(.)\1+", r"\1", variant))
    return result


def contains_prohibited_language(value: str) -> bool:
    return any(pattern.search(word) for word in candidates(value) for pattern in PATTERNS)


def contains_explicit_adult_text(value: str) -> bool:
    normalized = re.sub("[\u200b-\u200d\ufeff]", "", unicodedata.normalize("NFKC", value).lower())
    return any(pattern.search(normalized) for pattern in EXPLICIT)
