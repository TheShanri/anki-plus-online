"""Rebuild src/data/pronunciations.json from tools/tts/lexicon.txt (IPA) plus the spoken-abbreviation table below."""
import json
from pathlib import Path

HERE = Path(__file__).parent
SAY = {
    "DCML": "D C M L", "DSCT": "D S C T", "DRG": "D R G", "CSF": "C S F", "CNS": "C N S", "PNS": "P N S",
    "MRI": "M R I", "PET": "P E T", "LMN": "L M N", "UMN": "U M N", "ACA": "A C A", "MCA": "M C A",
    "PCA": "P C A", "AICA": "A I C A", "PICA": "P I C A", "VPL": "V P L", "VPM": "V P M", "LGN": "L G N",
    "MGN": "M G N", "REM": "R E M", "EEG": "E E G", "EMG": "E M G", "ALS": "A L S",
}
ipa = {}
for line in (HERE / "lexicon.txt").read_text(encoding="utf8").splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    k, v = line.split("|")
    ipa[k.strip().lower()] = v.strip()
out = {
    "note": "ipa: Kokoro/misaki US phoneme strings. say: plain-text respellings applied before synthesis. Edit tools/tts/lexicon.txt, run build_lexicon.py, bump lexicon in src/lib/tts/config.json.",
    "ipa": ipa,
    "say": SAY,
}
(HERE.parent.parent / "src" / "data" / "pronunciations.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf8")
print(len(ipa), "terms")
