# Pathway tracer v2: handoff notes for v3

Written at the end of the v2 rounds. Paths are under `src/components/atlas/pathways/` unless noted.

## 1. Data sources

- **Course data**: `content/nsci3250/pathways.json` (the pathway cards: modality, neurons, tract, synapse, level, decussation, lesion, slide sources). `src/lib/atlas/pathways.ts` has the types and the slide-depth audit.
- **Map**: `src/data/pathway-map.json`: 33 pathways, each neuron with `stretches` (`k`, `label`, `phys` i/c/cross, `ids` = atlas structure ids to light, `path` = waypoints, `marks`). Waypoint = `[structure id, rel, t, dx, dy, dz, axis]`; `rel` i/c/m = same side / opposite side / midline relative to the body side; `t` runs along the structure's axis (see sceneCore `axisFor`). Other waypoint kinds: `["@", rel, lateralX, dy, dz, anchorRef, t, axis]` (free point relative to an anchor, used for body parts) and `["part", rel, "file:anchor", dx, dy, dz]` (an anchor of a Z-Anatomy part, world metres). `tools/pathways/patch_map_round2.py` added cochlear, vestibular, solitary, stretch-reflex, withdrawal-reflex.
- **Atlas**: `public/atlas/gross.glb` + `index.json` (one file per structure, world metres, Y up, +Z anterior, patient's left +X). Loaded by `lib/atlas/loader`. Group structures without a file are resolved with `resolveStructureIds`.
- **Z-Anatomy parts** (CC BY-SA 4.0, credit in `PathwayCredits.tsx`), extracted with the bundled Blender 4.2 (`tools/pathways/export_parts.py`, `optimize.sh` = gltf-transform meshopt, keep nodes: `--join false --flatten false`): `public/pathways/{hand,foot,leg,muscle,eye,spine,thorax,gut,head-targets}.glb` and `parts.json` (objects, bboxes, `worldOffset`, anchors). Parts are centred on their own origin; world = `worldOffset` + local anchor. `tools/pathways/build_anchor_table.py` writes `src/data/part-anchors.json` (all anchors already in world metres, `_R` = right-side variant, otherwise mirror x).
- **Eye and visual field**: `PathwayExtras.tsx` (`AnatomicalEye`, retina bowl with open dividing lines, field-coloured quadrants), `visualField.tsx` (`fieldPalette`: left field one colour, right the other, upper lighter, lower darker), `eyeScale.ts`.
- **Receptors**: `receptors.ts`, `receptorInfo.ts`, `ReceptorLens.tsx` (skin and muscle ending insets), `BodySilhouette.tsx`.

## 2. Beat model (keep this contract)

`buildPathwayScene.ts`: `buildBeatScene({mp, cp, slug, colors, limbPart})` returns `{beats, tubes, marks, layers, limbs, eyes, anatomy, infos}`.

- `Beat {kind: node|path, neuron, caption, cross, info, phys, rel, fit, view, branch, fork:{id,k}}`. One click = one beat. `info` is the key shared by 3D, the schematic and the popover (`n<i>` / `p<i>` / `b<i>`). `branch` = the beat leaves the fork point instead of continuing the previous beat. `fork` groups the beats of one split.
- Tubes carry `beat`, `info`, `meshed` (a real mesh shows this tract: the tube is slim and not clickable), `rise` (climbing run), `dx` (world x offset: lines side by side inside a nerve). Layers carry `beat` and `info` (the lit mesh is clickable and glows on its beat). Marks carry `beat`, `info`, `mid` (midline target drawn once).
- Specs: `anatomySpec.ts` (`SITES` = real anatomy at the start and end of a pathway; `LEVELS` = dorsal root ganglion level and vertebrae lit per limb; `CENTRAL` = cord-routed paths per pathway; `cordRun`, `cordP`), `AnatomyParts.tsx` (draws spine, thorax, gut, head targets by object name; `focus` ranges fade a file away from its beats; lit objects are translucent).
- Scene: `PathwayScene.tsx` (frameloop demand, TrackballControls, `Rig` camera, label projector with collision avoidance), `sceneCore.tsx` (`resolveWP`, tubes with a 2 s ease-in-out draw `DRAW_S`, marks), `PartModels.tsx` (part loader).
- Info keys, props of `Schematic.tsx` (`beats, cur, reveal, hoverKey, onHover, onPick, reduced, sideAlpha`) are unchanged. I added the fork rail to `Schematic.tsx` once (before the request not to touch it).

## 3. Tools and test hooks

- `tools/pathways/vet.mjs --port 9364 --all <slugs> [--steps <slugs>] --out <dir>`: over CDP, per pathway: every waypoint resolved, a node mark per node beat, a tube per side per path beat, continuity between beats (branches are exempt), crossings change side, schematic rows = beats with the same caption, hover on each schematic row sets the 3D highlight. `--steps` saves a screenshot of every beat. Prints nothing until it finishes. `--only` is the same as `--all` but for a short list.
- `tools/pathways/sheet.py <dir> <slug>...` (Pillow): contact sheet per pathway from the per-beat screenshots (`sheet-<slug>.png`). `_atlas/pw_shots/r5/` holds the latest, `r5before/` the ones before the routing change.
- `tools/pathways/pointer-test.mjs` (real CDP mouse drag, pan and wheel, in and out of fullscreen) and `camera-test.mjs` (the camera never fights the user: drag during a tween, right after a beat change, wheel, after Frame; logs jumps and drift).
- Hooks on `window`: `__pwBeats` (beat list), `__pwChoose(slug)`, `__pwDebug` (resolved tubes and marks), `__pwCam` (camera), `__pwRig()` (`{locked, tweening}`).
- Headless window: `node tools/ui/shot.mjs <url> <png> --port 9364` (off-screen WebView2); log in with a test account (`mkuser.mjs` in the scratchpad creates `test-pathways-1@uvm.edu`; never commit cookies). Stop it with `--stop`. Never `next build`; use the shared dev server on 3919.

## 4. Works well: keep

- One beat per click, node then path; the same beat list drives 3D, schematic, caption and popover, so they cannot drift (vet checks it).
- Real forks as separate beats (chiasm nasal vs temporal, radiations parietal vs Meyer, solitary outputs, vestibular outputs, BG direct/indirect, lcst uncrossed fibres).
- Real anatomy at starts and ends (spine with the entry level lit, tongue, carotid sinus, aortic arch, stomach, heart and lungs, larynx, masseter, eye muscles, cochlea, vestibule, olfactory epithelium, cornea) and slide-depth gating (`‹ ›` marks in info text go behind `Supplementary`).
- Camera rule: user input always wins; beats do not move a locked camera until Frame or a view button (`Rig`).
- Both sides always drawn (left solid, right dashed), the side not in focus dimmed.
- The loader finishes (ready is re-sent on every change, 15 s fallback names the problem).

## 5. Known wrong or weak

- **Routing is still centroid-based** for brain tracts: tubes run through slab centroids of the structure meshes (with the structure's own principal axis for non-vertical ones), not through true centrelines. No Blender centreline extraction was done for nerves (optic nerve, chiasm, tract), nor a mesh centreline for tracts. Cord fibres do follow the cord centreline via the spine part's `cord_<segment>` anchors; spinal roots do not pass through the intervertebral foramina (`<level>_foramen` anchors exist); peripheral nerves are straight lines from the body part to the ganglion (no median/ulnar/sciatic meshes).
- Regions vs fibres: lit meshes are clickable (info key) and the tube is slim and not clickable where a mesh exists, but there is no region hover name, no StructureInfo card, no legend for "region" vs "pathway". Not done: cut planes, 2x2 multi-view and presets from the Explore toolbar.
- Look: lit structures stack translucent blobs; the smoky context shell reduces contrast; node markers were rings (the ring is now gone); a face "egg" stands in for the face skin of the trigeminal pathways.
- Fan of targets (corticobulbar, sympathetic, parasympathetic ends) is one beat with several marks, not one beat per target.
- Camera fits can be tight on single-node beats; the first compile of the dev server is slow and the vet can time out.
- `LEVELS.rewrite` and `cordY` in `anatomySpec.ts` are leftovers of the first level approach (superseded by `CENTRAL`).
- The lcst cord level is fixed at C8 (arm) because the pathway has no limb choice.

## 6. Anatomical facts used (per pathway)

- **Levels** (slide ranges, shown at one level): DCML and ALS hand C6 to C8 (shown C7), foot L4 to S1 (shown L5); DSCT foot L4 to S1, tract to Clarke's nucleus C8 to L3 (cord level L3); stretch reflex L3 and L4 (knee jerk, shown L4); withdrawal reflex hand C7; sympathetic lateral horn T1 to L2; parasympathetic cranial (III, VII, IX, X) plus S2 to S4.
- **Crossings**: DCML at the internal arcuate fibres (caudal medulla), medial lemniscus contralateral; ALS in the anterior white commissure at the level of entry, anterolateral tract contralateral; DSCT no crossing (ipsilateral, via the inferior cerebellar peduncle); trigeminal discriminative crosses in the pons (trigeminal lemniscus), pain via the spinal trigeminal nucleus; LCST crosses at the pyramidal decussation (about 80 % per the map, the owner's earlier verified fact), the remainder uncrossed in the anterior corticospinal tract; corticobulbar fibres cross just above each motor nucleus; visual: nasal fibres cross in the chiasm, temporal stay, each optic tract carries the opposite field of both eyes, radiations split into the parietal route (lower field, cuneus) and Meyer's loop (upper field, lingual gyrus), V1 around the calcarine sulcus; gaze: FEF crosses to the contralateral PPRF, abducens then MLF to the contralateral oculomotor nucleus; pupillary: both Edinger-Westphal nuclei (consensual); corneal: bilateral facial nuclei.
- **Nuclei and relays**: gracile and cuneate nuclei (medulla); VPL (body) and VPM (face); internal capsule (the course says "internal capsule"; "posterior limb" is gated as textbook detail); Clarke's nucleus; solitary nucleus rostral for taste and caudal for cardiovascular, respiratory and GI input, with outputs to the superior and inferior salivatory nuclei, the dorsal motor nucleus of X, the nucleus ambiguus and the lateral horn; vestibular nuclei to the cerebellum (inferior cerebellar peduncle), the MLF (eye movements), the vestibulospinal tract and the thalamus; the red nucleus sits in the rostral midbrain tegmentum; cochlear nuclei (rostral medulla) to the inferior colliculus to the medial geniculate to BA 41 and 42; olfactory: receptor neurons through the cribriform plate to the bulb (mitral cells) to the olfactory tubercle, prepiriform cortex and amygdala, bypassing the thalamus first.
- Everything else comes from `content/nsci3250/pathways.json`; items beyond the slides are behind `Supplementary` (`section="pathways"` / `"lesion-lab"`).
