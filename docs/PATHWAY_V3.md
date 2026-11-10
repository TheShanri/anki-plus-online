# Pathway tracer v3: design

The owner's verdict on v2 (2026-11-09): "nebulous", "blurry and not lucid", "not crisp", with "lines outside the
nerves", "circles outside the brain" and "left and right hard to tease apart". v3 must be **crisp, accurate,
lucid, cogent, not ambiguous**. Each beat is a clean textbook figure brought to life. At any moment a student can
answer four questions at a glance: **where is the signal, which neuron is carrying it, which side of the body
it is on, and what happens next.**

## Why v2 reads as fog (do not repeat)
1. **Stacked translucency.** Context anatomy is drawn as stacked translucent surfaces: a smoky brain, ghost
   muscles and translucent highlights on top of each other. Nothing has an edge, and depth is mush.
2. **Two encodings collide.** Blue/orange meant both "left/right" and "highlighted region", so fibres and
   regions blur together.
3. **Markers and labels float.** Ring markers sit outside the anatomy, dashed lines run through empty space,
   and the LEFT/RIGHT pills repeat.
4. **Weak fibres.** Fibres are thin lines that don't follow the visible structure (the cord trace leaves the
   vertebral canal), and crossings are small glyphs.

## Visual language
| Thing | How it is drawn |
|---|---|
| Neurons (fibres) | Opaque tubes, toon-lit (bright core, dark rim), colour = neuron order (`src/lib/atlas/pathwayPalette.ts`). Soma = sphere at the start, synapse = small cup at the end, order badge "1°/2°/3°" (or UMN/LMN). Direction = travelling light pulses along the tube. |
| Regions (stops) | Opaque, neutral fill (REGION_COLORS) with a crisp dark outline. The current stop is brighter. Hover = outline glow + name; click = StructureInfo (as in Explore). Never in a neuron colour. |
| Context anatomy | Opaque matte "clay" (light neutral, low saturation), crisp silhouette edges. A **section cut** opens it so the pathway is visible inside, never fog. At most ONE ghost layer: an outline-only silhouette of brain and body for orientation. |
| Side | One instance by default ("from the LEFT hand"). A drawn midline plane/line with fixed **L | R** chips at the screen edges. The crossing is an event: the tube visibly crosses the midline, with a callout "crosses here: <structure>, <level>". "Both sides" adds the mirror instance in the same colours, dimmer, dashed pulses. |
| Labels | Crisp DOM text, 1-3 words, in left/right gutters with leader lines (no overlap, no floating pills, no truncation). One label per visible stop; the current one bold. One small legend. |
| Visual pathway | Colour by visual field (FIELD_COLORS). The eyes, chiasm, tracts, LGN, radiations (Meyer's loop vs parietal) and calcarine banks are drawn as real structures. |

## Accuracy rules (hard)
- **Fibres inside their hosts.** Every fibre sample lies INSIDE its host structure: nerve, root, cord column,
  tract, capsule, radiation, nucleus. Centrelines come from the real meshes (Z-Anatomy curves, or mesh-slice
  centrelines). Inside the cord, the posterior columns run dorsal, the lateral corticospinal tract lateral and
  the ALS anterolateral, each offset within the cord's real cross-section along its real curve.
- **Validation is automatic.**
  - `tools/pathways/validate-v3.mjs` checks every pathway: each fibre sample is inside its declared host mesh
    (ray-parity point-in-mesh), with tolerance 0.5 mm for thin nerves.
  - It also checks that every soma and synapse sits inside its nucleus mesh, and that every crossing happens
    inside the decussation structure at the slide's level.
  - The build of the pathway data fails when any check fails.
- **Depth matches the course slides:** not more, not less (docs/PATHWAY_AUDIT.md). Beyond-slide facts go behind
  the Supplementary gate.

## Each beat
- **Copy.** A title (5 words or fewer) plus one sentence, plus the neuron badge, plus the side ("Left
  cuneatus").
- **Camera.** A canonical camera per beat: lateral for cord ascent, anterior for crossings, inferior for the
  chiasm, and so on. Smooth 0.8 s moves. **User input wins**: any rotate, zoom or pan locks the view until
  "Frame" (F). There is never a snap-back.
- **Cut.** The section cut follows the beat, e.g. a transverse cut at the medulla for the internal arcuate
  fibres. The user can switch it (none / coronal / sagittal / transverse, draggable), and toggle **2x2
  multi-view** (anterior, lateral, top, free), as in Explore.
- **Section inset.** At cord and brainstem beats, a small inset shows the course's cross-section plate for that
  level (the brainstem atlas plates, `src/components/atlas/brainstem/*`; a cord section for the spinal levels),
  with the tract's position lit and the signal dot in the right quadrant, synced with the 3D.
- **2D diagram.** The textbook diagram (`Schematic.tsx` and `diagram/*`) sits in the side rail, synced both
  ways.

## Rendering
- `dpr = min(devicePixelRatio, 2)`, MSAA (`antialias`) plus an outline pass for silhouettes, no fog, neutral
  tone mapping, and key/fill/rim lights.
- No transparency stacking: the only transparent element is the single ghost silhouette, rendered last with
  `depthWrite` off.
- Preload everything behind the loader. The loader always finishes (timeout fallback).
- Theme-aware background and labels. `prefers-reduced-motion` and `html[data-effects="off"]` are respected
  (no pulses, instant moves).

## Done means
- **Contact sheets.** For every pathway and every beat: a screenshot (desktop 1440x900 and phone 390x844),
  reviewed by eye against the slides. The sheets live in `_atlas/pw3_shots/<pathway>/`.
- **Validator.** `validate-v3.mjs` passes for all pathways.
- **Questions on any frame.** Any frame answers the four questions at a glance: where, which neuron, which side,
  what's next.
