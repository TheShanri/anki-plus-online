"""Shared helpers: text normalisation + hashing (must match src/lib/tts/hash.ts), source texts, speakable text."""
import hashlib
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CFG = json.loads((ROOT / "src/lib/tts/config.json").read_text(encoding="utf8"))
LEX = json.loads((ROOT / "src/data/pronunciations.json").read_text(encoding="utf8"))


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text).lower()).strip()


def clip_hash(text: str) -> str:
    key = f'{CFG["voice"]}|{CFG["lexicon"]}|{norm(text)}'
    return hashlib.sha256(key.encode("utf8")).hexdigest()[:20]


def source_texts() -> dict:
    """norm text -> a display form, for every live card answer and structure name."""
    out = {}
    for f in sorted((ROOT / "content/nsci3250/cards").glob("*.json")):
        for c in json.loads(f.read_text(encoding="utf8")):
            if c.get("status", "live") != "live":
                continue
            a = (c.get("answer") or "").strip()
            if a:
                out.setdefault(norm(a), a)
    for s in json.loads((ROOT / "content/nsci3250/structures.json").read_text(encoding="utf8")):
        n = (s.get("name") or "").strip()
        if n:
            out.setdefault(norm(n), n)
    return out


ROMAN = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12}
NUM = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"]
ORD = {"1st": "first", "2nd": "second", "3rd": "third", "4th": "fourth", "5th": "fifth"}


def speakable(text: str) -> str:
    """Display text -> what to say, with Kokoro's [word](/ipa/) overrides for the lexicon."""
    t = text
    t = re.sub(r"\bCN\s+([IVX]+)\b(?:\s*,\s*([IVX]+)\b)?", lambda m: "cranial nerve " + NUM[ROMAN.get(m.group(1), 0)] + (" and " + NUM[ROMAN.get(m.group(2), 0)] if m.group(2) else ""), t)
    t = re.sub(r"\b([CTLS])(\d)\s*[-–]\s*([CTLS])?(\d)\b", lambda m: f"{m.group(1)} {NUM[int(m.group(2))]} to {m.group(3) or m.group(1)} {NUM[int(m.group(4))]}", t)
    t = re.sub(r"\b([CTLSV])(\d)\b", lambda m: f"{m.group(1)} {NUM[int(m.group(2))]}", t)
    for k, v in ORD.items():
        t = re.sub(rf"\b{k}\b", v, t)
    for k, v in LEX["say"].items():
        t = re.sub(rf"\b{k}\b", v, t)
    t = t.replace("/", ", ").replace("–", " ").replace("—", ", ")
    # lexicon overrides, longest first, whole words (an optional 's stays outside the markup)
    ipa = LEX["ipa"]
    keys = sorted(ipa, key=len, reverse=True)
    pat = re.compile(r"(?<![\w\[])(" + "|".join(re.escape(k) for k in keys) + r")(?![\w\]])", re.I)

    def sub(m):
        word = m.group(1)
        return f"[{word}](/{ipa[word.lower()]}/)"

    t = pat.sub(sub, t)
    return re.sub(r"\s+", " ", t).strip()
