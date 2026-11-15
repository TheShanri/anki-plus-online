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
The cervical cord's grey-matter H was the weak spot; round 3 (below) traces it from the section.

## Round 3: atlas resolution (2026-11-14/15, owner feedback)
Owner: "more resolution and specific highlights, such as for the substantia nigra or the internal arcuate fibers";
"the horns are missing from the spinal section"; "polish and make the brainstem comprehensive"; Roman numerals on
cranial nerves. Shots (course photos inside, not committed): `_atlas/bs3_shots/r3/before/` and `r3/after/`
(`<level>-<width>[-<hovered structure>].png`, 1440x900 and 390x844).

**Pipeline** (`build.py`, `extras.py` round-3 block at the end): `pale`/`dense` traces a structure from the stain
inside a bounding polygon (Weil stains myelin, so pale = grey matter); `_masks` are hidden helper masks cut into named
parts with `from` + `pts_cut`; `parent` marks a sub-part (opens the parent's course notes, `infoSlugOf` in `data.ts`);
`_skip_fibres` drops the overlay's few lines for a fibre system and `_bundle()` draws it as 6-13 fine fibres between two
guide curves laid along the stain's own streaks (`fine: true`, hairline in `PlateArt`).

**Per level**
- Cervical cord: the whole grey matter traced from the section and cut into dorsal horn (apex to the dorsal root entry
  zone), substantia gelatinosa (the palest cap; continues as the caudal spinal trigeminal nucleus), intermediate zone
  (with the grey commissure), ventral horn (the course's limb and trunk pools are now its lateral and medial parts),
  central canal (marked: obliterated), ventral white commissure, dorsal columns (outline around gracilis + cuneatus).
  Lateral horn not drawn: T1-L2 only (said in the intermediate-zone note). Sources: Lecture 4 slides 30-31, Lab 5,
  Lecture 7 slide 9, Coulombe pl. 45.
- Motor decussation: central grey and central canal, the ventral horn (the pale islands lateral to the crossing
  fibres, XI rootlets), the pyramidal decussation as 10 interlacing fibres per side from the pyramid across the midline
  into the opposite lateral funiculus (Lecture 10 slide 22, DeArmond Fig. 40).
- Caudal medulla (tubercles): internal arcuate fibres as 13 fine arcs per side from the gracile/cuneate nuclei around
  the central grey, crossing in the medial lemniscus (Lab 8 slide 9, Lab 9 slide 7, Fig. 41); central grey (traced) and
  central canal.
- Rostral medulla: reticular formation zone (Lab 10 slide 15 puts nucleus ambiguus in it; shown only when lit).
- Caudal pons: PPRF / lateral gaze center (Lab 11 slide 4 and the Lab 11 histology list; approximate), reticular
  formation zone, transverse pontine fibres as fine bundles dorsal and ventral to the longitudinal bundle.
- Rostral pons: transverse pontine fibres as three fine bundles along the stain's streaks into the middle cerebellar
  peduncle; reticular formation zone.
- Caudal midbrain: substantia nigra traced from the pale band, split into pars compacta (dorsal strip) and pars
  reticulata (ventral, interdigitating with the crus); decussation of the superior cerebellar peduncles as crossing
  fibres; transverse pontine fibres at the rostral basis pontis.
- Rostral midbrain: substantia nigra traced and split the same way. SNc/SNr are taught (Lecture 14 slides 28-29, Unit 3
  lab assignment answer key); the border between them is not visible in a myelin stain, so the parts are approximate
  while the whole nigra is traced.
- Names: cranial nerves "Hypoglossal nerve (XII)", nuclei "Hypoglossal nucleus (CN XII)" (`build-levels.mjs`).
- `coverage.mjs`: still 0 gaps; now prints per level what is listed, what is drawn beyond the list, approximate (*) and
  fine-bundle (~) structures.
- Hover test hook for headless shots: React ignores synthetic pointer events in the WebView, so the shot script calls
  the hit path's React `onFocus` prop (`__reactProps*`); the plate API is cached for an hour, so refetch it with
  `cache: "reload"` after re-exporting.

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

## Coverage pass (2026-11-12): every brainstem structure on the course lists is on a plate
`node tools/brainstem/coverage.mjs` lists every brainstem-relevant structure on the official lists and the plates
that show it (exit 1 on a gap; `--rev <git rev>` checks the plates as committed then). Before: 49 list entries
(33 structures) missing on 8 plates. Now: 0 gaps on 12 plates (76 structures, 182 list entries), one justified
exception (below).

**Added to the section plates** (`extras.py`, rebuilt with `build.py` / `export.py`):
- Cervical cord: dorsal and ventral horn (context, drawn on the section's pale grey matter), lateral funiculus (dorsal
  root entry zone to ventral root exit zone), anterior funiculus, limb LMN pool = lateral ventral horn, trunk LMN pool =
  medial ventral horn, anterior corticospinal tract along the anterior median fissure. Source: Lab 10 slide 22 and its
  answer key (course), Lecture 10 slides 15/24, Unit 2 lab assignment slide 17; Coulombe pl. 45. The funiculi are
  containers: the tracts inside stay hoverable on top, the funiculus label sits beside them. The motor pools and the
  ACST are approximate (not visible in a myelin stain).
- Motor decussation: anterior corticospinal tract = the ventral part of the pyramid (Lab 10 slide 20 answer key: the
  uncrossed fibres "stay on the ventral aspect"); overlaps the pyramid on purpose.
- Caudal pons: the clip now keeps the strip of cerebellum (vermis) roofing the fourth ventricle in this photo; the course
  lists the cerebellum here (Lab 8 slide 7 shows the same level with the cerebellum attached).
- Pontine protuberance (rostral and caudal pons): the outline of the basilar pons ("the ventral pons is dominated by the
  pontine protuberance", Lab 10 slide 11); dotted, the structures inside stay hoverable. "Level of Pons (cross-section)"
  (a wet gross section, Lab 10 slide 25) is satisfied by the two pons plates together.

**New plates** (`/atlas/brainstem?level=...`, listed under Surface views; region "surface" in the mastery path):
- `external-anterior` (ventral) and `external-posterior` (dorsal, cerebellum removed): `surface_canon.py` puts the
  Lab 7 specimen photo in the plate frame and straightens the bent specimen (row shifts up to ~35 units in the
  midbrain, printed by the script); regions are authored on the right half and mirrored, using the course's own marks
  on the same photo (Lab 7 slides: peduncles, IPF, CN III box, CN V-VIII arrows, transverse fibres, pyramids, olives,
  IX/X, XII; SC/IC circles, SCP/MCP/ICP outlines, facial colliculus, obex, gracile/cuneate tubercles) mapped onto the
  canonical photo by SIFT registration. Second sources: the Lab 8 surface line drawing, the Lab 7 summary drawings,
  Sobotta 1909 figs. 647/659 (public domain).
- `midsagittal` (one-sided, anterior left): the course's Lab 2 midsagittal photo frame with its midbrain/pons/medulla
  outlines; aqueduct, fourth ventricle, tectum, cerebellum after OpenStax fig. 13.11 (CC BY, in the Lab 2 deck) and
  Sobotta 648; pyramid, olive and longitudinal fibres as in the course's longitudinal section (Lab 10 slide 26);
  mesencephalic flexure as a marked band at the midbrain bend (approximate: a concept, not a structure).
- `external-lateral` (one-sided, anterior left): drawn after Sobotta 1909 fig. 661 (public domain) because the course has
  no lateral brainstem image; everything on it is marked approximate. Weakest plate visually (schematic), but it is
  where the trochlear nerve's course and the cut cerebellar peduncles (the collective "cerebellar peduncles") show.

**Second pass on the surface plates (2026-11-13, after review):**
- Midsagittal redrawn on Sobotta 1909 fig. 648 (public domain; the course's Lab 2 photo is too coarse inside: it is
  used for the midbrain/pons/medulla division lines): tectum with superior and inferior colliculi, the cerebral aqueduct,
  the tent-shaped fourth ventricle with its vela up to the fastigium, the obex and central canal, the basilar pons
  (pontine protuberance, a zone) with transverse striations and the longitudinal fibres, pyramid and olive, the cerebellum
  with folia and the arbor vitae (drawing detail, not hoverable).
- Ventral/dorsal: authored outlines become smooth curves; a `detail` layer draws sulci and striations (basilar sulcus,
  anterior median fissure, pre- and postolivary sulci, pontomedullary groove, transverse striations, peduncle fibres;
  median sulcus, sulcus limitans, striae medullares, posterior median/intermediate sulci, the cruciform groove of the
  colliculi). The ventral midbrain level was re-read on the straightened photo (the first pass had read it before the
  straightening; everything below it is carried through the same row shift), and the specimen's mammillary bodies,
  infundibulum, optic chiasm and optic tract were added as context. Hypoglossal/vagal trigones are not drawn: they are
  not on the course slides or lists. Surface plates use lighter tones (`.bsp-surface`).
- Midsagittal last pass: the fourth ventricle, aqueduct and other CSF spaces of the surface plates are a dark CSF tone;
  the cerebellum's outer contour is scaled to 0.84 about its attachment (closer to Sobotta 648 and the Lab 2 photo); the
  arbor vitae branches from a central white core with alternating twigs; the aqueduct is a thin channel opening into
  the fourth ventricle; a fine line marks the tegmentum's front border.
- Lateral view kept, labelled on the plate as a schematic after Sobotta fig. 661 (no course image): it is the only plate
  with the collective "cerebellar peduncles" (Lab 7 list) as the cut stump, and the trochlear nerve's course.
- Toggles: without a published photo the view shows Illustration selected, Split/Photo disabled, and neither Histology
  nor Gross lit.

**Photo halves of the surface plates are not published yet.** The upload was denied by the permission system in this
session (not retried). For the owner, from the repo root:
```
node tools/brainstem/atlas3/upload-photos.mjs
cd tools/brainstem/atlas3/py && python export.py external-anterior external-posterior pons-caudal
node ../build-ref-map.mjs
```
The second command needs the atlas3 venv (opencv, numpy, scipy, scikit-image). After it, the two surface plates get
Split/Photo/Gross and the caudal pons photo shows the cerebellum strip; check registration in Split view. The gross photos are built
(`content-build/atlas3/brainstem/external-{anterior,posterior}-gross-*.webp`) but not uploaded (this pass never wrote
to Storage). `export.py` now only names photos listed in `photos-manifest.json`: until `node tools/brainstem/atlas3/
upload-photos.mjs` runs and the levels are exported again, the surface plates show the illustration only (Split/Photo
disabled), and the caudal pons keeps its previous photo (the new cerebellum strip shows on the illustration half only).

**Course vs source:** where they differ the course wins: the IPF/cistern follow the course's triangle (the specimen's
upper brainstem is bent, so they are approximate); IX and X are drawn as two adjacent rootlet bundles because the course
says they are difficult to distinguish; the accessory nerve is drawn after the course line drawing and noted as absent on
the course specimens (the course list's own note).

**Exception:** the subthalamic nucleus (Lab 14 "Brainstem Structures") is diencephalic: Lab 14 shows it on coronal
section #8 above and lateral to the substantia nigra, not in any transverse brainstem section. No placement is invented:
the rostral midbrain plate carries a note with an Explore link (`offplate.ts`).

**Mastery path:** the panel now lists every structure on the plate (pickable, hover lights it), with mastery where a
live plate card exists. Plate cards for the 138 (plate, structure) pairs without one are in
`content/nsci3250/cards/brainstem-plates-draft.json` as **DRAFT** (`node tools/brainstem/build-plate-cards-draft.mjs`,
never touches existing cards; fibre-only structures get none). They join the mastery path once reviewed and set live
and seeded. Do not re-run `build-plate-cards.mjs` without merging: it would mint live cards with the same slugs.

**BrainstemRef:** `brainstem-ref.json` now has the surface plates after the sections (`surfaces`); a section always wins
when it shows the structure, surfaces are used for olives, obex, tubercles, area postrema, mesencephalic flexure, etc.

Screens checked headless (1440x900 and 390x844): every new and changed plate, hover callouts on both halves, the info
drawer. Shots (course images inside, not committed) were saved to the agent scratchpad.

## 3D brainstem (2026-11-15): external landmarks, level planes, Explore focus

**Where.** `/atlas/brainstem` has a Plates | 3D toggle (`V`, deep link `?view=3d&level=<slug>`); in Plates view a small 3D
locator (oblique view) sits under the level list (below the plate on phones) with every plane and the current one lit.
Explore has a **Brainstem** tab (`/atlas?view=brainstem`): same model and planes; a landmark click becomes Explore's
selection (notes + the docked plate follow), a plane or level click opens that plate beside the model with a link to the
atlas. Code: `src/components/atlas/brainstem/three/` (`Brainstem3D.tsx`, `BrainstemFocus.tsx`, `model.ts`, `bs3d.css`),
lazy-loaded (`next/dynamic`); the hook into `AtlasBrowser` is one tab + one dynamic import.

**Model.** `tools/brainstem/bs3d/build.py` -> `public/atlas/brainstem3d.glb` (593 KB, meshopt, 81 parts, ~101k triangles,
Z-Anatomy space = gross.glb space) + `src/data/brainstem-3d.json` (parts, label anchors, planes, sources). Real Z-Anatomy
meshes (CC BY-SA 4.0): midbrain, pons, medulla, cerebral peduncles, SCP (cut at z -31 mm), ICP, brachium of the IC (the
part of the Z-Anatomy IC mesh outside the tectum), MGN, LGN, pineal, mammillary bodies, optic chiasm/tract/nerve stubs,
olfactory tract stub, thalamus, upper cervical cord, nerves III, IV, VI, VII, VIII, IX, X, XII (roots clipped outside the
brainstem within 9-16 mm of the exit, thickened 0.1-0.45 mm to be pickable). Patches cut out of the real surface along a
smooth field (exact triangle splitting, so outlines are curves): superior/inferior colliculi (the tectal bumps of the
midbrain mesh), facial colliculus, floor of the 4th ventricle (surface under the Z-Anatomy ventricle cast), obex, area
postrema, gracile/cuneate tubercles, olives / pyramids (surface over the buried Z-Anatomy olive / pyramid meshes),
pyramidal decussation, interpeduncular fossa, basilar pons (transverse fibres), MCP (pons lateral to the trigeminal
roots), pulvinar (thalamus over the MRI-carved mni-pulvinar). Authored (approximate, flagged in the hover chip):
trochlear nerve's dorsal exit and turn round the midbrain, accessory nerve (course: absent on the lab brainstems),
trigeminal root (see below). Hypothalamus left out (it hid the mammillary bodies and the IPF).

**Landmark sources.** The model's own relief (depth maps of the dorsal midbrain and the 4th-ventricle floor), the
course Lab 7 photos (relative positions on the external-anterior/-posterior plates: FC at the level of the MCP/ICP
stumps 2-3 mm off the midline, area postrema just above the obex, gracile tubercle beside the posterior median sulcus at
the obex, cuneate lateral and slightly higher, V at 43 % of the pons height), Sobotta 1909 figs. 647/659/661 (public
domain), Coulombe et al. 2021 (CC BY; decussation from plates 40-43). Course vs Z-Anatomy: the Z-Anatomy trigeminal root
attaches at 22 % of the pons height; the course specimen and the model's own intrapontine motor root put it at ~43 %, so
the root is drawn there (course wins). Side-by-side: `_atlas/bs3d_shots/cmp_lab7_side_by_side.png` (course photos inside,
not committed).

**Planes (calibration).** Each plate level is a plane through landmarks the plate itself shows, oriented across the long
axis (a line fitted over +-8 mm of the brainstem's midline sagittal centre line). Axis distance from the ventral
pontomesencephalic junction vs Coulombe et al. 2021 scaled by pons length (model 25.5 mm / theirs ~24 mm = 1.16):

| Level | Through | Axis mm | Coulombe (scaled) |
|---|---|---|---|
| midbrain-sc | superior colliculi + oculomotor roots in the IPF | +5.2 | +10.1 (+11.8) |
| midbrain-ic | inferior colliculi + top of the basilar pons | 0.0 | +3.2 (+3.7) |
| pons-mid | trigeminal roots (and intrapontine motor roots) | -13.2 | -17.1 (-19.9) |
| pons-caudal | facial colliculi + caudal basilar pons 2.5 mm above the PoMJ | -24.2 | -21.3 (-24.8) |
| medulla-rostral | mid-height of the olives | -35.8 | -26.3 (-30.6) |
| medulla-mid | gracile/cuneate tubercles, below the obex | -44.1 | -36.9 (-42.9) |
| medulla-caudal | pyramidal decussation | -50.8 | -42.2 (-49.1) |
| cervicomedullary | 7 mm below the decussation | -59.3 | -51.7 (-60.2) |
| midsagittal | median plane (shown when current or hovered) | - | - |

Differences: the Z-Anatomy midbrain is short (16 mm), so the SC plane sits closer to the PMJ; Coulombe's plate 28 is the
rostral tip of the olive, the course level is its middle.

**Coverage.** `node tools/brainstem/coverage.mjs` now ends with a 3D section: 43 external landmarks and nerves pickable,
0 gaps; not drawn in 3D (internal, plates only): third ventricle, cerebral aqueduct, anterior nucleus of the thalamus,
epithalamus (pineal is pickable), hypothalamus, pituitary stalk, mesencephalic flexure; every plate level has a plane.

**Shots** (`_atlas/bs3d_shots/`, 1440x900 `w_*`, 390x844 `p_*`): `w_3d_anterior`, `w_3d_posterior`, `w_3d_lateral`,
`w_ant_hover`, `w_lat_hover`, `w_plane_hover_a` (plane preview), `w_3d_click_olive` (landmark -> plates list),
`w_plate_to_3d_selected` (plate pick -> lit in 3D), `w_plate_inset`, `w_explore_focus`, `w_explore_plane_plate`,
`p_sheet` (phone: 3D, plate + locator, Explore focus).

**Open.** Lighting is quiet but flat-ish at a distance; patch outlines are faint by design. The 3D view has no labels
pinned on screen (hover only). Rebuild: `tools/.venv/Scripts/python.exe -I tools/brainstem/bs3d/build.py` (~2 min).

## Next
- Pathway tracer v3 can swap its `BrainstemInset` adapter for `BrainstemRef` (same props); not done here (its files).
- Gross toggle stays disabled: no gross section of any level in the course or the open sets.
- Isthmus (pons-rostral) has no plate (not a course level).
- Upload the two gross photos and the caudal pons photo, then `python export.py external-anterior external-posterior pons-caudal`.
- Review and promote the draft plate cards.

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
python surface_canon.py     # surface photos -> plate frame (then build.py / export.py external-anterior external-posterior)
python surface_free.py      # midsagittal and lateral one-sided plates -> src/data/brainstem-plates/
node ../../coverage.mjs     # course-list coverage of the plates
node ../upload-photos.mjs   # the photos -> private bucket course-media (auth-gated /api/media), never public/
node ../build-ref-map.mjs   # src/data/brainstem-ref.json (which levels show which structure)
python verify_map.py        # overlay shape -> structure mapping against the slide's text, connectors, colours
python named.py <level> [figure]   # check sheet: the canonical photo with every region named (HALF=1: right half)
python crop.py <level> x0 y0 x1 y1 <name> [scale]   # a gridded crop of the canonical photo, for authoring extras
```
