# Brainstem atlas v3: status and handoff

Plan: `docs/BRAINSTEM_V3.md`. This file says what is done, what is next, how to run the tools, and whether HEAD is
safe to deploy for the brainstem pages.

## Deploy safety
**HEAD is safe to deploy for `/atlas/brainstem` and the plate cards** (and for the Explore dock). Checked on
2026-11-12 after the last brainstem commit: `tsc` clean, eslint clean on the brainstem files (one pre-existing warning
in AtlasBrowser, not ours), `npm test` 181/181, `validate-content` 0 errors. In the headless window: every level
renders split, illustration-only and section-only (contact sheet below), hover lights both halves, Atlas labels fit,
390x844 works; the plate cards (`/study/run?scope=bslevel:<level>`) show the illustration with the asked region lit;
region ids are `<slug>-L/-R/-M` and cards address regions by slug, so every existing card resolves. The new section
photos are in the private bucket (auth-gated route), none in `public/`.

Contact sheet (course photos inside, so not committed): `_atlas/bs3_shots/contact-sheet.jpg` (8 levels x split /
illustration / section), single shots `_atlas/bs3_shots/<level>-<view>.png`, splits only `sheet-split.jpg`.
Frame-clipped edges trimmed (2026-11-12): the caudal pons peduncle stumps now end in a rounded cut inside the frame, the
midbrain-ic tectum is a rounded dome instead of the photo's straight top edge, the rostral medulla's lateral edges are
no longer frame-ruled, and the rostral pons velum notch is gone (`levels_cfg.py` clip/keep/erase).
Known weak spot, not an error: the cervical-cord illustration shows no grey-matter butterfly (the course overlay
outlines only the tracts there).

## Done
- Plates for the 8 course levels, built from the course's Brainstem Overlay deck (the professor's outlines drawn on the
  section photos) by the pipeline in `tools/brainstem/atlas3/py/` (it reproduces the plates exactly).
- Mapping check: every overlay shape -> structure mapping in `levels_cfg.py` checked against the slide's own text,
  connectors and colours (`verify_map.py`) and by eye on named check sheets (`named.py`), all 8 levels.
- Second source per level: the course atlas key pages (the DeArmond figure of the same section: Figs. 54, 52, 49,
  48, 44, 41, 40) plus Coulombe et al. 2021 (CC BY) plates 4, 8, 20, 24, 28-29, 38, 43, 45. All course outlines agree
  in position with both. Course structures the overlay does not outline are authored in `extras.py` (marked
  approximate, dashed on the plate, "(approx.)" in the callout): the MLF on every brainstem level, MGN and brachium of
  the inferior colliculus, the inferior colliculus nucleus (extended from the overlay's dorsal outline), pontine
  nuclei and transverse fibres at the IC level, spinal trigeminal nucleus (caudal pons, rostral medulla), inferior
  cerebellar peduncle (caudal pons), nucleus ambiguus, 12N/10N/solitary nucleus at the tubercle level, lateral
  corticospinal tract, pyramids (split from "Pyramids/Motor Decussation"), accessory nerve rootlets.
- Not placed (listed in the report): pineal gland, pulvinar (outside the rostral midbrain section), ICP at the
  trigeminal level (not in the section), choroid plexus and CN VIII at the rostral medulla (not in the photo), the
  fasciculus gracilis cap at the tubercle level (the overlay draws the gracile nucleus to the surface), the
  "trigeminal nerve" label at the motor decussation (it is the spinal trigeminal tract).
- The look: an inlay-style illustration (flat theme-token tones, paper-coloured gaps between structures, deeper tone
  for the peduncles as they stain, tinted grey matter, open spaces as paper, a soft shadow) and the section printed as
  ink through its density (theme-aware), one crisp outline around both halves; Atlas labels in small caps sized in
  screen px and wrapped; callout sized in screen px.
- Section photos re-toned (ink capped at 88 %, gamma 1.15) and uploaded to the private bucket (auth-gated).
- `src/data/brainstem-ref.json` + `src/lib/brainstem/ref-map.ts` (slug -> levels, sides, tracts via their carrying
  bundle, hallmark level), with tests.
- `/atlas/brainstem?level=<slug>` opens that level.

## Done (Phase 2)
- `BrainstemRef.tsx` (the plan's exact props; level picked per structure from `brainstem-ref.json`; tracts lit via
  the bundle that carries them; `side`; breathing on `brainstemPulse(performance.now())`; `pulseKey` change = short
  emphasis; compact dock) and `BrainstemRefDock.tsx`. Explore (`AtlasBrowser`) docks it above the structure info when
  the selection is on the plates (collapsible, remembered in the browser); `AtlasViewer`'s highlight breathes on the
  same clock while the dock is open (`BrainstemBreathDriver`). Checked in Explore for the MLF (caudal pons), medial
  lemniscus (rostral medulla), abducens nucleus (caudal pons) and red nucleus (rostral midbrain); 2D fill-opacity and
  the 3D highlight colour both change over time.

## Next
- Pathway tracer v3 can swap its `BrainstemInset` adapter for `BrainstemRef` (same props); not done here (its files).
- Gross toggle stays disabled: no gross section of any level in the course or the open sets.
- Isthmus (pons-rostral) has no plate (not a course level).

## How to run the pipeline
Python 3.11 with `opencv-python-headless numpy scipy scikit-image` (a venv anywhere; the first builder's is in the
orchestrator scratchpad `bs3/venv`). The work area is `content-build/atlas3/work/` (git-ignored, course material):
`pptx/overlay` = the unzipped `_source/raw/Brainstem Overlay.pptx`, `shapes/ovp<n>.json` = its shapes in photo pixels
(`pptx_shapes.py` then `ov_to_photo.py`), `levels/<level>/` = per-level intermediates, `view/` = debug images.

```
cd tools/brainstem/atlas3/py
python prep.py <level>      # tissue mask + midline (keeps the hand-checked *_img midline in prep.json)
python canon.py <level>     # photo -> plate frame (1000 units wide, midline x = 500, dorsal up) + overlay outlines
python build.py <level>     # plate.json (regions, fibres, outline, bands) + density.webp; extras.py adds/clips
python export.py <level>    # -> src/data/brainstem-plates/<level>.json and content-build/atlas3/brainstem/*.webp
node ../upload-photos.mjs   # the photos -> private bucket course-media (auth-gated /api/media), never public/
node ../build-ref-map.mjs   # src/data/brainstem-ref.json (which levels show which structure)
python verify_map.py        # overlay shape -> structure mapping against the slide's text, connectors, colours
python named.py <level> [figure]   # check sheet: the canonical photo with every region named (HALF=1: right half)
python crop.py <level> x0 y0 x1 y1 <name> [scale]   # a gridded crop of the canonical photo, for authoring extras
```
