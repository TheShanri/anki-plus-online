# Explore atlas: 3D gaps and student audit

Status file for the "close the 3D model gaps and polish Explore" job. Z-Anatomy meshes are CC BY-SA 4.0 (credits stay in the atlas footer and `AtlasAttribution`).

## 3D model gaps

| Gap (where seen) | Cause | Fix | Status |
| --- | --- | --- | --- |
| Midsagittal cut: see-through window at the medial frontal region, hollow shell | gyral meshes have no medial wall; cut planes show the inside of a shell | `public/atlas/brainfill.glb` (watertight solid) is stencil-counted behind each cut plane and a brain-coloured quad paints the section (`CutCap` in `AtlasViewer.tsx`). Explore only (`solidCuts` prop) | done (solid look); translucent look still shows the window |
| Orbital / inferior surface: dark star-shaped gaps | missing patches between orbitofrontal gyri; backer was a dark flat shell | backer vertices are tinted by the nearest gross mesh (lobe colour in Regions), so a gap reads as continuous cortex (`tintByNearest`) | done |
| Pin-holes (a few white specks) through the context shell at the orbital roof | holes in `context.glb` | tried the closed fill solid behind the shell: its hull-sealed base bulges past the orbital surface at any scale down to 0.88, so rejected | open (rebuild the base seal, or repair context.glb) |
| Dark patches in sulci (superior view) in the first WIP | hull-sealed fill drawn as the visible backer bridged the sulci | the fill is no longer the visible backer; it only caps cuts and backs pinholes | done |
| Cut planes hollow | see above | stencil caps for the midsagittal plane and the Explore coronal/sagittal/transverse cut | done |

### How the fill is built

```
npx @gltf-transform/cli copy public/atlas/gross.glb _atlas/fill/gross_raw.glb   # decode meshopt (use _atlas/backup/gross.glb if gross was rebuilt)
npx @gltf-transform/cli dequantize _atlas/fill/gross_raw.glb _atlas/fill/gross_dq.glb
tools/.venv/Scripts/python.exe -I tools/atlas/fill_brain.py
tools/atlas/optimize_fill.sh      # meshopt, named nodes kept (--join false --flatten false)
```

`brainfill.glb` is 171 KB. The glb is quantised: positions are normalised integers plus a node scale and offset, so any code that reads its geometry must bake both into floats (`bakeFill`). The Python mesh reports `watertight False` after simplification; the stencil count tolerates the few open edges.

## Camera

- Selecting a structure: eased move (480 ms, honours `prefers-reduced-motion`) that keeps the viewing direction.
- Lock-view toggle (lock icon in the view group) stops all automatic moves; `F` frames the selection from the current side; full screen moved to `Z`.

## Student audit (1440x900 and 390x844)

See the list below; each item is marked done or open.

(Audit list is filled in as it is walked.)
