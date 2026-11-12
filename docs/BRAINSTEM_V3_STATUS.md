# Brainstem atlas v3: status and handoff

Plan: `docs/BRAINSTEM_V3.md`. This file says what is done, what is next, how to run the tools, and whether HEAD is
safe to deploy for the brainstem pages.

## Deploy safety
**HEAD is safe to deploy for the brainstem pages** (`/atlas/brainstem`, the plate study cards, Explore). Checked in the
headless window at 1440x900, 1900x1100 and 390x844: the atlas page renders every plate split, illustration-only and
photo-only, hover lights both halves, Atlas labels fit; the plate cards (`/study/run?scope=bslevel:<level>`) render
the illustration with the asked region lit. `validate-content` 0 errors, `tsc` clean, the brainstem tests pass.
Region ids are `<slug>-L/-R/-M` and the cards address regions by slug, so every existing plate card still resolves.

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

## Next
- `BrainstemRef.tsx` and `BrainstemRefDock.tsx` are written (tsc clean) but not yet shown anywhere; then the Explore
  hook-up (dock in `AtlasBrowser`, the 3D highlight breathing via `brainstemBreath` in `AtlasViewer`).
- Contact sheet in `_atlas/bs3_shots/`.

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
