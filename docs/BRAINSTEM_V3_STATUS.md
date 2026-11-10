# Brainstem atlas v3: status and handoff

Plan: `docs/BRAINSTEM_V3.md`. This file says what is done, what is next and how to run the tools.

## Done
- WIP checkpoint (inherited from the first builder): plate data for the 8 course levels built from the course's
  Brainstem Overlay deck (the professor's outlines drawn on the section photos), `PlateArt` / `PlateStage`, the plate
  route with the photo's media URL, the cervicomedullary plate.
- The pipeline moved from a scratchpad into `tools/brainstem/atlas3/py/`; it reproduces the committed plates exactly.

## Next
- Verify every overlay shape -> structure mapping (`levels_cfg.py`) against the slide's own text and colours.
- Check every structure against a second source (Coulombe 2021 / Sobotta 1909 / Gray 1918 / course Lab 8 images);
  author the missing course structures (MLF on every level, CN nuclei the overlay leaves out) as approximate extras.
- Illustration and photo styling, contact sheet, `BrainstemRef`, Explore hook-up.

## How to run the pipeline
Python 3.11 with `opencv-python-headless numpy scipy scikit-image` (a venv anywhere; the first builder's is in the
orchestrator scratchpad `bs3/venv`). The work area is `content-build/atlas3/work/` (git-ignored, course material):
`pptx/overlay` = the unzipped `_source/raw/Brainstem Overlay.pptx`, `shapes/ovp<n>.json` = its shapes in photo pixels
(`pptx_shapes.py` then `ov_to_photo.py`), `levels/<level>/` = per-level intermediates, `view/` = debug images.

```
cd tools/brainstem/atlas3/py
python prep.py <level>      # tissue mask + midline (keeps the hand-checked *_img midline in prep.json)
python canon.py <level>     # photo -> plate frame (1000 units wide, midline x = 500, dorsal up) + overlay outlines
python build.py <level>     # plate.json (regions, fibres, outline, bands) + density.webp
python export.py <level>    # -> src/data/brainstem-plates/<level>.json and content-build/atlas3/brainstem/*.webp
node ../upload-photos.mjs   # the photos -> private bucket course-media (auth-gated /api/media), never public/
python crop.py <level> x0 y0 x1 y1 <name> [scale]   # a gridded crop of the canonical photo, for authoring extras
```
