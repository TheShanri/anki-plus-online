"""Incremental TTS pipeline: Kokoro -> Opus (.webm) + AAC (.m4a) -> Supabase Storage bucket `tts`.

  python generate.py              generate + upload only the clips missing from the bucket
  python generate.py --dry        list what is missing, do nothing
  python generate.py --local      generate into out/ but do not upload
  python generate.py --limit 20   cap the number of clips this run (for trials)
See docs/TTS.md.
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

from ttslib import CFG, ROOT, clip_hash, norm, source_texts, speakable

HERE = Path(__file__).parent
OUT = HERE / "out"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")


def env():
    e = {}
    for line in (ROOT / ".env.local").read_text(encoding="utf8").splitlines():
        if "=" in line and not line.startswith("#"):
            k, v = line.split("=", 1)
            e[k.strip()] = v.strip().strip('"')
    return e


E = env()
BASE = E["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
KEY = E["SUPABASE_SERVICE_ROLE_KEY"]
BUCKET = CFG["bucket"]


def api(method, path, body=None, headers=None, raw=False):
    h = {"Authorization": f"Bearer {KEY}", "apikey": KEY}
    h.update(headers or {})
    data = body if isinstance(body, (bytes, type(None))) else json.dumps(body).encode()
    if isinstance(body, (dict, list)):
        h["Content-Type"] = "application/json"
    # network blips (DNS failures, resets) used to kill a multi-hour run: retry with backoff
    import time
    for attempt in range(8):
        req = urllib.request.Request(BASE + path, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                b = r.read()
                return b if raw else (json.loads(b) if b else None)
        except urllib.error.HTTPError as ex:
            if ex.code >= 500 and attempt < 7:
                time.sleep(min(60, 2 ** attempt))
                continue
            return {"_error": ex.code, "_body": ex.read().decode(errors="replace")[:300]}
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError):
            if attempt == 7:
                raise
            time.sleep(min(60, 2 ** attempt))


def ensure_bucket():
    r = api("GET", f"/storage/v1/bucket/{BUCKET}")
    if isinstance(r, dict) and r.get("_error"):
        r = api("POST", "/storage/v1/bucket", {"id": BUCKET, "name": BUCKET, "public": True,
                                                "file_size_limit": 524288,
                                                "allowed_mime_types": ["audio/webm", "audio/mp4", "audio/mpeg", "audio/ogg"]})
        print("bucket created:", r)


def remote_names():
    names, offset = set(), 0
    while True:
        r = api("POST", f"/storage/v1/object/list/{BUCKET}", {"prefix": "", "limit": 1000, "offset": offset})
        if not isinstance(r, list):
            print("list failed", r)
            sys.exit(1)
        names.update(x["name"] for x in r)
        if len(r) < 1000:
            return names
        offset += 1000


def upload(name, path, mime):
    r = api("POST", f"/storage/v1/object/{BUCKET}/{name}", path.read_bytes(),
            {"Content-Type": mime, "x-upsert": "true", "cache-control": "max-age=31536000, immutable"})
    if isinstance(r, dict) and r.get("_error"):
        print("upload failed", name, r)
        return False
    return True


_pipe = None


def synth(text):
    global _pipe
    import numpy as np
    if _pipe is None:
        from kokoro import KPipeline
        _pipe = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M")
    parts = []
    for _, _, audio in _pipe(speakable(text), voice=CFG["voice"], speed=0.95):
        parts.append(audio.cpu().numpy() if hasattr(audio, "cpu") else audio)
    return np.concatenate(parts) if parts else None


def encode(wav_path, base):
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", "-ar", "24000", "-c:a", "libopus", "-b:a", "28k", "-application", "voip", str(base.with_suffix(".webm"))], check=True)
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(wav_path), "-ac", "1", "-ar", "24000", "-c:a", "aac", "-b:a", "40k", "-movflags", "+faststart", str(base.with_suffix(".m4a"))], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry", action="store_true")
    ap.add_argument("--local", action="store_true")
    ap.add_argument("--limit", type=int, default=0)
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    texts = source_texts()
    manifest = {display: clip_hash(display) for display in texts.values()}
    (HERE / "manifest.json").write_text(json.dumps({"voice": CFG["voice"], "lexicon": CFG["lexicon"], "clips": manifest}, ensure_ascii=False, indent=0), encoding="utf8")
    print(len(manifest), "clips wanted")
    if a.local:
        have = set()
    else:
        ensure_bucket()
        have = remote_names()
    todo = [(t, h) for t, h in manifest.items() if not (f"{h}.webm" in have and f"{h}.m4a" in have)]
    print(len(todo), "missing")
    if a.dry:
        return
    if a.limit:
        todo = todo[: a.limit]
    import soundfile as sf
    for i, (t, h) in enumerate(todo, 1):
        base = OUT / h
        if not base.with_suffix(".webm").exists() or not base.with_suffix(".m4a").exists():
            audio = synth(t)
            if audio is None:
                print("no audio for", t)
                continue
            wav = OUT / f"{h}.wav"
            sf.write(wav, audio, 24000)
            encode(wav, base)
            wav.unlink()
        if not a.local:
            ok = upload(f"{h}.webm", base.with_suffix(".webm"), "audio/webm") and upload(f"{h}.m4a", base.with_suffix(".m4a"), "audio/mp4")
            if not ok:
                continue
        if i % 25 == 0 or i == len(todo):
            print(f"{i}/{len(todo)}", flush=True)
    sizes = [p.stat().st_size for p in OUT.glob("*.webm")]
    print("local webm:", len(sizes), "clips,", sum(sizes) // 1024, "KB")


if __name__ == "__main__":
    main()
