# Answer audio (text-to-speech)

Answers are spoken by pre-generated clips, never synthesised in the browser or on Vercel.

## How it fits together

- Engine: Kokoro-82M (Apache-2.0), US English voice `af_heart`. Runs offline on the owner's machine (GPU if present, else CPU).
- Clips: Opus in `.webm` (about 28 kbps mono) plus AAC `.m4a` (40 kbps) for browsers that cannot play Opus-in-WebM. The client asks `canPlayType` and picks one.
- Host: public Supabase Storage bucket `tts`, objects named `<hash>.<ext>`, `cache-control: max-age=31536000, immutable`.
- Name: `sha256("voice|lexicon|normalised text")[:20]`. Normalised = NFKC, lower-case, whitespace collapsed. The browser computes the same hash (`src/lib/tts/hash.ts`), so the database never stores anything about audio.
- What is spoken: the `answer` of every live card (deduplicated by normalised text) and every structure name. `tools/tts/manifest.json` lists text -> hash.
- Pronunciation: `src/data/pronunciations.json` (built from `tools/tts/lexicon.txt`): `ipa` maps a term to a Kokoro phoneme string, applied as `[term](/ipa/)`; `say` respells abbreviations (DCML -> "D C M L"). `speakable()` in `tools/tts/ttslib.py` also turns "CN III" into "cranial nerve three", "C3-C5" into "C three to C five", "1st" into "first" and "/" into a pause.

## Regenerate after content changes

```powershell
cd tools/tts
.venv\Scripts\python generate.py --dry     # what is missing from the bucket
.venv\Scripts\python generate.py           # generate + upload only the missing clips
```

It lists the bucket first, so re-running only does new answers. Needs `.env.local` (service key); it creates the bucket if absent. `--local` renders into `tools/tts/out/` without uploading; `--limit N` caps a trial run.

Set-up on a fresh machine: create a venv (outside OneDrive is faster on Windows, e.g. `C:SERSINFONKIPLUS-TTSENV`; `PYTHON -M VENV --WITHOUT-PIP` THEN `PYTHON -M PIP --PYTHON <VENV PYTHON> INSTALL` AVOIDS A VERY SLOW ENSUREPIP), THEN INSTALL kokoro soundfile faster-whisper torch` (CPU is fine for an 82M model; use `--index-url https://download.pytorch.org/whl/cpu` for torch to avoid the 2 GB CUDA wheel), and ffmpeg on PATH (libopus + aac).

## Changing a pronunciation

1. Edit `tools/tts/lexicon.txt` (one `term|IPA` per line; phonemes are Kokoro's: `A`=eɪ, `I`=aɪ, `W`=aʊ, `Y`=ɔɪ, `O`=oʊ, `ˈ`/`ˌ` stress). To see what Kokoro does with a word now, run its G2P alone (no model load): `KPipeline(lang_code="a", model=False)` over `speakable(text)`.
2. `python tools/tts/build_lexicon.py`.
3. Add or bump the term in `revs` in `src/lib/tts/config.json` (`"medulla": 1`, then 2 on the next fix). A text containing the term hashes with `|term@rev` (hash.ts `revSuffix`, ttslib `rev_suffix`), so only those clips get new names: the next `generate.py` run makes just them, and no browser keeps the old clip (clips are cached as immutable). Bumping the global `lexicon` number instead re-makes every clip.
4. `python tools/tts/verify.py` round-trips ~55 hard terms through faster-whisper (`small.en`) and prints any that do not come back as the intended word. Listen to `tools/tts/test/*.wav` for the final word on a term; a recogniser cannot judge stress.

Fixed so far: midsagittal (Kokoro stressed "mid-suh-JIT-ul"), medulla (now /məˈduːlə/, "muh-DOO-luh", the owner's choice over /məˈdʌlə/).

What is spoken: `tools/tts/spoken.ts` lists every text the app speaks, through the app's own `toStudyCard` (a plane card's
"Midsagittal plane" is spoken "Midsagittal"), plus every structure name; `ttslib.source_texts()` reads it. A text with no clip
falls back to the browser's own voice, which mispronounces anatomy: keep the bucket complete after content changes.

## Client

- `src/lib/tts/player.ts`: one `<audio>`, an in-memory LRU of 40 clip blobs, CacheStorage `tts-v1` for repeat sessions. A missing clip (404) is remembered and falls back quietly to the browser's speech synthesis; nothing ever shows an error.
- Preloading (`StudyRunner`): when the run starts and on every card change, `prefetch` fetches the current answer plus the next 5 (`SessionQueue.peek`), at `priority: "low"`, during idle time. Skipped when `navigator.connection.saveData` is on or the link is 3g or slower (then a clip loads when you press play). The whole deck is never downloaded.
- UI: speaker button beside the verdict on the reveal screen, key `P` (not while typing), toggle "Read answers aloud" in the study gear (`scaffold.speak`, default off, also requires Sounds on), speaker button on the atlas structure name.
