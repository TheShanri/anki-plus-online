# Explore atlas: 3D gaps and student audit

Status file for the "close the 3D model gaps and polish Explore" job. Z-Anatomy meshes are CC BY-SA 4.0 (credits stay in the atlas footer and `AtlasAttribution`).

## 3D model gaps

| Gap (where seen) | Cause | Fix | Status |
| --- | --- | --- | --- |
| Midsagittal cut: see-through window at the medial frontal region, hollow shell | gyral meshes have no medial wall; cut planes show the inside of a shell | `public/atlas/brainfill.glb` (watertight solid) is stencil-counted behind each cut plane and a quad on the plane paints the section with the tissue volume (`SectionFace` in `src/components/atlas/section/`, see "Section faces" below). Explore only (`solidCuts` prop) | done (solid look); translucent look still shows the window |
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
- Mesh limitations (superseded by the tissue section faces below; kept for the record): the cortex is a thin ribbon of separate gyral patches, so the sections have no grey/white contrast and a big pale white-matter fill; the cerebral peduncles and midbrain are part of the gross brainstem mesh, which is not capped, so the brainstem appears as an exterior surface in a coronal section; the lateral ventricle is one mesh, so its horns read longer than in the lab image; no putaminal/pallidal lamina detail.

Later round (shots `i1` cuts, `j1` phone, `k1` X-ray/context cuts, `l1` patch, `m1` context repair, `n1` themes, `o1` MRI):
- Coronal default now z = -8 mm (thalamus, hippocampal head, midbrain): the brainstem is sectioned with its own cap colour; transverse default y = 1.619 (thalamus and upper midbrain); brainstem and cerebellum are in the section key.
- X-ray midsagittal: the window is filled by a translucent ghost section face (`CutCap ghost`); deep structures also show in context-mode cuts (a selected structure stays highlighted among them); the key starts collapsed on phones.
- `context.glb`: 954 small boundary loops (pinholes, cracks) closed with `tools/atlas/fill_ctx_holes.py` (original in `_atlas/backup/context.glb`, 556 KB vs 541 KB). The orbital pinholes drop to two or three specks; a lighter patch over the frontal operculum in X-ray remains.
- The grey parietal patch with a dark centre (Lateral R) was a locked mesh: gone after the locked tint change.
- Themes: the section, the key and the cut slider follow Dark Academia and Synthwave Cortex tokens.
- MRI modality memory: choosing another structure in the navigator while in MRI keeps MRI and jumps the slices to the new structure.

Final pass:
- X-ray midsagittal: the ghost section face is now 93% opaque in the X-ray's own dark tone (`#1d2522`), so the former pale patch no longer stands out (`_atlas/explore_shots/q1/xray_mid.png`). The brain reads as one dark mass in that cut; the internal fold detail behind the plane is hidden, as in a real section.
- Keyboard: Tab from the viewer walks Hide controls, Camera view, Frame selection, Lock view and on; every toolbar button shows the yellow focus ring; the section key button now has the same ring. Enter activates, Esc closes popovers (checked: no open menu after Esc). Shortcuts used and confirmed: 1-7 views, B/R/X looks, C/S/T cuts, M multi-view, F frame, Z full screen. Lock view has no shortcut.
- Curious flow: a deep link to a non-syllabus structure (`/atlas?s=occipital-pole`) opens the structure directly (MRI and Sections tabs dim); it does not go through the lock. The lock card appears only when a locked mesh is clicked in 3D; the headless run did not reliably land on one, so the heads-up, "Oh, I'm just curious", re-lock on click-out and the stale-card fix (closes with its layer) were not exercised end to end in a browser. Code path: `pickMesh` -> `touchLocked` -> `useSupplementaryGate` -> `relock`.

### Curious flow, deep link, orbital pinholes (second pass, headless)

- Curious flow, run end to end at 1440x900: a greyed structure opens the "Not part of your syllabus" card; "Oh, I'm just curious" (heads-up the first time, then direct) selects it and opens the info card headed "Supplementary - not in your slides"; the MRI and Sections tabs dim. Choosing a course structure afterwards drops the card and the unlock. Fixed: (1) "lock", Esc and click-out re-locked the card but left the structure selected (highlighted, no info); re-locking now drops that selection too. (2) The "Pick a structure" hint sat on top of the lock card; it is hidden while a lock card is up.
- Deep link (`/atlas?s=occipital-pole`) to a non-syllabus structure no longer bypasses the lock: nothing is selected, the lock card with the curious offer shows, and the URL keeps `s=` so a reload shows the same offer (an unlock is never restored by a reload). Course structures and skull nodes are unaffected.
- Orbital pinholes: `context.glb` had no open boundary loops left (edge counting). The remaining specks were gaps between long triangles, found by rasterising the shell from below (`tools/atlas/fill_ctx_pinholes.py`): three mirrored pairs near the orbital roof (476 px, 160 px, and a 15 px crack chain at the lateral orbital sulcus). Each is patched with a local Delaunay triangulation of the surrounding vertices: 70 faces added, no vertex moved. Previous file kept in `_atlas/backup/context_pre_pinholes.glb`. Remaining: the midline fissure gap, and a tiny dark mark in the gross orbitofrontal mesh (not the shell).
- Student pass 1440x900 and 390x844: selection with labels (pons, caudate), multi-view 2x2 with the selection, X-ray look, notes drawer on the phone, tab dimming, lock and curious card layouts, inferior view of the orbit. Not exercised: the brainstem reference dock and signed-in course notes (the headless window did not stay signed in on /atlas); cut/section rendering is left to the section agent.
- Open, minor: for low structures (pons, Lateral L at 1440x900) the framing centres on the target so the top of the brain touches the canvas edge (`frameBox` margin); on the phone the Feedback button sits over the notes strip.

### Known remaining gaps

- Orbital roof pinholes: closed in the second pass (above). Still open: the medial frontal window in the X-ray look and in translucent context mode (no cap there).
- /atlas/supply Lateral shows a large pale-blue quad. Reproduced with `CutCap` disabled and `brainfill.glb` not loaded (supply does not pass `solidCuts`), so it comes from the supply scene, not from the cap.

## Section faces: real tissue (2026-11-12, shots `_atlas/explore_shots/s1`)

Owner feedback: the surface looked good but the inside was "a ghost town" of "coloured blobs". The cut faces now show tissue.

- **Volume.** `tools/atlas/section_volume.py` warps the ICBM 2009b symmetric T1 (0.5 mm) into the Z-Anatomy mesh space: the landmark affine of `register_mni_zanat.py`, then multi-channel demons (4 mm then 2 mm, smoothed, no folding: Jacobian 0.49-2.1) on signed-distance maps of the brain outline (brainfill vs the closed Allen brain), cerebellum, brainstem, caudate, putamen, pallidum, thalamus, hippocampus, amygdala, lateral/third/fourth ventricles and callosum. Dice affine -> warp: brain 0.87 -> 0.98, cerebellum 0.57 -> 0.93, putamen 0.79 -> 0.86, thalamus 0.83 -> 0.87, amygdala 0.73 -> 0.80, callosum 0.53 -> 0.73, lateral ventricle 0.57 -> 0.74, caudate 0.47 -> 0.61, pallidum 0.55 -> 0.61, hippocampus 0.28 -> 0.59, third ventricle 0.41 -> 0.43, fourth ventricle 0.22 -> 0.27 (`_atlas/section/dice.json`). Overlays of the warped template with the mesh outlines: `s1/reg_*.png`. Template caudate/putamen/pallidum/thalamus/lateral-ventricle voxels outside the matching mesh are set to white matter (the mesh is the truth for those, no doubled edges); the rim and the lower medulla outside the template brain carry the nearest tissue. Output: `public/atlas/section.bin.gz` (1 mm, 142x180x184, 1.9 MB, fetched with its content hash from `section/version.ts`, lazily on the first cut).
- **Rendering** (`src/components/atlas/section/`): one stencil count of the brain solid, then one quad per plane on the plane (not 12 mm behind it any more) whose shader samples the volume: anti-aliased CSF|grey and grey|white steps, a little intensity kept inside each class, fixed-brain tones (grey-brown ribbon, ivory white matter, dark CSF; cooler in Regions). Deep structures paint their own cut face (back faces, projected on the plane, clearing the stencil) in the same language: nuclei grey (pallidum and thalamus paler), tracts white, ventricles dark, with 1 px hairline outlines from a CPU plane-mesh intersection. Colour only for hover (hover colour on the cut face), selection (accent cut face; a cut keeps the brain solid) and the optional "Colour structures" box in the section key. Brainstem and cerebellum cut faces sample the same volume (arbor vitae in sagittal and midsagittal views). Midsagittal keeps its face 12 mm behind the midline (the medial surface stays visible) and shows the fissure as medial grey.
- **Transverse** now turns to the "top" view (front at the top, as in the course's horizontal sections) at y = 1.625 (caudate head, lentiform nucleus, thalamus, splenium).
- **Checked** (1440x900 and 390x844, headless): coronal at the anterior commissure and at the thalamus, transverse, sagittal, midsagittal (`s1/w_*`, `s1/p_*`, before: `s1/before_*`, side by side: `s1/before_after_w.png`, `s1/before_after_p.png`), hover and click (`s1/hover_thalamus.png`, `s1/click_thalamus.png`), Synthwave / Dark Academia / Regions (`s1/theme_*`, `s1/regions_cor.png`), lab comparison (`s1/compare_lab.png`: lab 14 sections 6 and 7, lab 13 "through the thalamus", atlas pages p009 / p011).
- **Licence.** ICBM 2009b: permission to use, copy, modify and distribute with the McGill notice; Allen labels CC BY 4.0 (used for the registration); the warped volume is fitted to the CC BY-SA Z-Anatomy meshes and is shared under CC BY-SA 4.0. Noted in `AtlasAttribution`.
- **Open.** The template is an average young-adult brain: its ventricles are smaller than in the lab specimens, and its gyri are not the Z-Anatomy gyri (the section's sulci do not continue into the 3D surface right behind the cut edge). Third and fourth ventricle and hippocampus fit least (thin structures at a 2 mm warp); a 1 mm demons level would tighten them (about 20 min offline). The Z-Anatomy horizontal plane is pitched against AC-PC, so a transverse cut is slightly oblique to the course's slabs.

