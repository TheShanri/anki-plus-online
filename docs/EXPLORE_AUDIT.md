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

### Student audit status

Walked so far (1440x900 unless noted):

| Item | Finding | Status |
| --- | --- | --- |
| Cold load | The dynamic-import fallback showed a fake 50% bar on "Starting the 3D viewer", then the real loader restarted near 10%: the bar went backwards. | fixed: fallback bar starts at 4% |
| Cold load, mobile | 390x844 layout is clean: icon-only mode tabs, brain framed, toolbar collapsed behind the chevron | ok |
| Navigator + search | Opens beside the viewer with a search box, region filter and availability icons | ok |
| Select | Selecting keeps the viewing direction (Lateral R stayed Lateral R), eased move settles inside 0.5 s | ok (retested in the browser) |
| Select, framing | A small deep structure (amygdala) frames with the brain so close that the context is cropped | open: widen the context margin for deep structures |
| Toolbar with the info panel open | The toolbar wraps to two rows and the layout icons drop to the bottom-left | open: collapse the groups into the chevron bar at narrow widths |
| Stale "curious" card | A skull bone card stayed open after the skull layer was hidden | fixed: the viewer reports layer changes (`onLayerChange`), the card closes |
| Deep structures in sections | Midsagittal and every cut now draw the corpus callosum, fornix, septum, anterior commissure, internal capsule, caudate, putamen, globus pallidus, thalamus, hypothalamus, hippocampus, amygdala and the ventricles (dark slate), loaded lazily on the first cut (chip: Loading deep structures), clipped by the cut, each showing its inside flat in its own colour; the pale section face is the white matter between them; hover and click pick them. Cut defaults: transverse at the thalamus, coronal at the anterior commissure, and the view turns to superior / anterior | fixed (`_atlas/explore_shots/f1`, `f2`) |
| Midsagittal | Section face is 12 mm behind the plane: medial cortex, brainstem and cerebellum folia stay visible, only the callosal/thalamic window is filled; cut meshes show their inside flat in their own colour | fixed |
| Outlines while cut | Dark hull back faces showed through sections | fixed: outlines off while a cut is active |
| Locked tint | Locked meshes read as grey patches | softened toward the cortex tint |

More checks (1440x900, headless, shots in `_atlas/explore_shots/h1`, `h2`, `g2`):

| Item | Result |
| --- | --- |
| Multi-view | 2x2 (anterior, lateral, superior, free orbit) with the selection and labels; `M` toggles | ok |
| 3D to MRI switch | The selected structure carries over as a slice overlay, 3D render pane in the MRI view | ok (modality kept when switching structure not re-tested after the audit fixes) |
| Skull layer auto | Selecting the temporal bone turns the skull layer on; selecting the thalamus turns it off | ok |
| Lock view | The lock icon engages, the view stays Lateral R after a new selection | ok |
| Sagittal / coronal / transverse cuts | Default planes through caudate/putamen/thalamus, the anterior commissure, and the thalamus; the view turns to face the cut; a collapsible section key lists the structures in the plane | done (`g2`) |
| Toolbar with the info panel open | One row (view name and dividers drop below 880 px) | fixed |
| Small deep structures | Framing keeps 76% of the brain around the target (amygdala no longer crops the brain) | fixed |

Lab-slide comparison (`_atlas/explore_shots/g1/compare.png`, course atlas pages `atlas-coronal-atlas-images` p009 rotated to brainstem-down, `atlas-horizontal-atlas-images` p011):
- Level and orientation agree: the coronal at z = +12 mm shows thalamus, putamen, pallidum, third ventricle, hippocampus and amygdala like the lab slice; the horizontal at the thalamus level shows the frontal horns up, genu and posterior limb of the capsule, thalami and the third ventricle.
- Mesh limitations (not fixable in the viewer): the cortex is a thin ribbon of separate gyral patches, so the sections have no grey/white contrast and a big pale white-matter fill; the cerebral peduncles and midbrain are part of the gross brainstem mesh, which is not capped, so the brainstem appears as an exterior surface in a coronal section; the lateral ventricle is one mesh, so its horns read longer than in the lab image; no putaminal/pallidal lamina detail.

Not walked: the curious flow end to end, keyboard beyond the shortcuts used above, the other themes, 390x844 multi-view and cut states.

### Known remaining gaps

- Surface spots in `_atlas/explore_shots/c1/sheet_b.png`: the grey parietal patch with a dark centre (Lateral R) is a mesh with a normal singularity from `smoothGeometry`; the pale blobs (Anterior, Superior) are locked meshes. Not rebuilt at source yet.
- A few pinholes at the orbital roof (context shell), and the medial frontal window in the X-ray look and in translucent context mode (no cap there).
- /atlas/supply Lateral shows a large pale-blue quad. Reproduced with `CutCap` disabled and `brainfill.glb` not loaded (supply does not pass `solidCuts`), so it comes from the supply scene, not from the cap.
