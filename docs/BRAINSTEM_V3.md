# Brainstem atlas v3: atlas plates + a brainstem reference everywhere

What the owner said (2026-11-09):
- **The look.** "The professor's cartoons are mid. We need something way chicer. And it needs to be atlas-like."
- **The default view.** "I'd love the half illustration, half gross/histological view by default."
- **The sources.** "You have the slides and so many pictures… use those and remove the PowerPoint labels to
  create something beautiful."
- **The integration.** "It'd be cool to just pull up the brainstem atlas as a reference for anything that
  relates to the brainstem (pathways and such). For example, if the MLF gets selected, the related half of the
  brainstem region gets highlighted, the brainstem atlas gets pulled up automatically and highlights it, with
  an accurate (if possible) or approximate structure in 3D pulsating with the 2D brainstem atlas."

Earlier decisions that still hold:
- The plates are quiet, with labels on hover and click for info.
- "Compare" shows other sources.
- There is no quiz mode. Instead, a mastery path: first look, then spell, then facts; level, then region,
  then the whole brainstem (`MasteryPanel.tsx`).
- Course images stay auth-gated.

## Phase 1: the split plate
For each level in `src/data/brainstem-levels.json` (the 7 with plates now, plus the missing ones), one plate:

| Left half: illustration | Right half: the real section |
|---|---|
| A newly drawn vector illustration in a refined atlas style: hairline outlines, restrained tonal fills that separate grey matter (nuclei), white matter (tracts, lemnisci, peduncles) and spaces (ventricle, aqueduct), with a subtle paper and ink feel that is theme-aware. Drawn from the region geometry in `src/data/brainstem-plates/*.json` and the Lab 8 drawings, then refined, never traced from copyrighted art. | Histology (myelin-stained) by default, with a toggle to gross. Cleaned of PowerPoint labels, arrows and leader lines by inpainting, colour-graded consistently across levels, and registered to the illustration so the midline, outline and landmarks line up (affine or thin-plate warp). |

**Interaction:**
- Hovering a structure on either half lights the same structure on BOTH halves; the photo half uses the
  registered and mirrored polygon. Clicking opens its info.
- A level locator: a small sagittal brainstem silhouette with the cut line. Up/Down keys change level with a
  crossfade.
- View toggles: Split (default), Illustration, Photo; Histology or Gross; and "Atlas labels", which shows
  print-style small-caps labels with hairline leaders in the margins. Quiet hover mode stays available.

**Sources:**
- Course: the slides, the Lab 8 drawings and the overlay decks in `content-build/` (decks, apkg, ocr) and
  `brainstem-course.json`. These stay auth-gated through the existing media route.
- Open-licensed: `content-build/brainstem-open/` (Sobotta 1909, public domain; Coulombe et al. 2021,
  CC BY; Wikimedia Commons). Gray's Anatomy 1918 figures are public domain. Credit everything in
  `BrainstemCredits.tsx`.

**Cleaning:**
- Find the labels with the existing OCR boxes plus colour and shape detection of leader lines and arrows,
  then inpaint: OpenCV Telea or NS for thin lines, LaMa (torch is in `C:\Users\info\ankiplus-tts\venv`) for
  boxes.
- Heavy jobs run at Idle priority. Keep the originals.

**Quality bar:**
- A contact sheet of every plate; inspect each one at 100% with no visible smudges.
- The halves line up at the midline, and every course structure on the level is hoverable on both halves.

## Phase 2: `BrainstemRef`, the brainstem reference anywhere
**Component.** `src/components/atlas/brainstem/BrainstemRef.tsx` has the props
`{ level?: string; structures?: string[]; side?: "L" | "R" | "both"; pulseKey?: number; compact?: boolean; onPick?: (slug: string) => void }`.
The pathway tracer v3 already codes against this exact interface; don't change it without telling the
orchestrator.
- `level` omitted: the component picks the most representative level for the structures.
- `side` lights only that half.
- `compact`: a docked inset of about 260-340 px.
- `pulseKey`: a shared pulse clock.
  - The highlight pulses with phase `(performance.now() / 1400) % 1`.
  - Any 3D view pulsing the same structure uses the same phase helper, exported as `brainstemPulse(t)`, so
    2D and 3D breathe together.

**Mapping.** A slug → levels + plate regions + sidedness table, e.g. MLF at every level, medial lemniscus,
the CN nuclei, the decussations, the cerebellar peduncles. Build it from the plate region ids and
`atlas-links.json`.

**Explore.** Selecting a brainstem structure, or a tract that runs through the brainstem:
- docks the reference automatically (collapsible, remembered per user);
- lights the structure on the correct half;
- pulses the 3D structure (exact mesh if there is one, else the approximate one) in sync.

`AtlasViewer.tsx` is shared code, so keep that edit small and well-contained.

**Pathways.** The v3 tracer shows `BrainstemRef` as its brainstem-level inset.
