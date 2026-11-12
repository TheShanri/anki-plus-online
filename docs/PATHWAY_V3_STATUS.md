# Pathway tracer v3: status and handoff

Running note for whoever continues (design and done bar: `docs/PATHWAY_V3.md`). Updated at each milestone.

## Shipped (v3 live on /atlas/pathways; every other pathway still shows v2)
The list lives in `src/components/atlas/pathways/v3/shipped.ts` (`V3_SHIPPED`); keep this section in step with it.
A pathway ships when its spec builds, the validator is green, and its per-beat contact sheets (1440x900 and 390x844,
`_atlas/pw3_shots/<slug>/`) were looked at and checked against the slides.
- dcml (hand, foot): shipped 2026-11-12. Validator green (hand 2174 samples, foot 3763; 2 crossings each, internal
  arcuate fibres in the caudal medulla). Sheets `_atlas/pw3_shots/dcml-{hand,foot}/sheet-*.png` checked against lecture 5
  slides 17-18 (cuneate lateral / gracile medial, ipsilateral nucleus, contralateral VPL and S1, internal capsule).
- alst (hand, foot): shipped 2026-11-12. Validator green (hand 2162, foot 3736; crossing in the anterior white commissure
  near the level of entry). Sheets `_atlas/pw3_shots/alst-{hand,foot}/` checked against lecture 5 slides 21-23 (marginal
  zone / substantia gelatinosa onto nucleus proprius, ventral white commissure, anterior/lateral funiculi, VPL, internal
  capsule, BA 3,1,2); Lissauer's tract only behind Supplementary.
- visual: shipped 2026-11-12. Validator green (1577 samples, 28 fibres; the nasal fibres cross inside the optic chiasm).
  Fibres coloured by visual field (upper lighter, lower darker), both eyes' halves drawn. Sheets `_atlas/pw3_shots/visual/`
  checked against lecture 11 slides 8 and 18-20 (bipolar 1st, ganglion 2nd, LGN 3rd; nasal fibres cross; tract carries the
  opposite field; upper field to the inferior bank). Meyer's loop / parietal route names behind Supplementary.
- Next: LCST (helper, motor.mjs), corticobulbar (helper), then u1: dsct (spec written),
  sympathetic, parasympathetic, stretch and withdrawal reflexes.

Order (owner, 2026-11-11): DCML, ALS, LCST, visual, corticobulbar, then the rest in the order of the course units.

## Where things are
- UI: `src/components/atlas/pathways/v3/` (Tracer3 = page shell, Scene3 = 3D scene, fibres/layers/labels/rig/insets).
  `/atlas/pathways?v=3` opens v3; v2 (`PathwayTracer.tsx`) is still the default until the switch-over.
- Data: `public/pathways/v3/<slug>[-<limb>].json`, built offline from `tools/pathways/v3/spec/*.mjs` (one spec per pathway,
  same beat list as the shared beat model `buildPathwayScene.ts`, so 3D, the 2D diagram and the copy cannot drift).
- Inputs: `_atlas/pw3_raw/nerves.json` (Z-Anatomy nerve centrelines + radii, from `export_v3.py` in Blender),
  `_atlas/pw3_raw/beats.json` (from `dump-beats.mjs`), `public/atlas/*` meshes, `public/pathways/*.glb` parts,
  `public/pathways/v3/body.glb`.

## How to run the tools
- Beat list: `node --import ./tools/pathways/v3/lib/register.mjs tools/pathways/v3/dump-beats.mjs > _atlas/pw3_raw/beats.json`
- Build + validate: `node --import ./tools/pathways/v3/lib/register.mjs tools/pathways/v3/build.mjs [slug ...]`
  (fails when any fibre sample leaves its host, a soma/synapse is outside its nucleus, or a crossing is outside its
  decussation structure / level). Validator alone: `node tools/pathways/v3/validate.mjs [slug ...] [--verbose]`.
- Host bounding boxes while writing specs: `node tools/pathways/v3/lib/inspect.mjs a:pons part:head-targets/organ_cornea`.
- Screens: sign in once (`probecookie.mjs` in the scratchpad writes `probecookie.js`; eval it on /about with
  `node tools/ui/shot.mjs http://localhost:3919/about x.png --port 9381 --eval "$(cat probecookie.js)"`), then
  `node tools/pathways/v3/shoot.mjs --port 9381 --only dcml:hand,visual --sizes 1440x900,390x844`.
- Navigation: `MSYS_NO_PATHCONV=1 node tools/pathways/v3/navtest.mjs --port 9381 --from "/atlas/pathways?v=3&p=dcml&limb=hand" --to /atlas/lesion,/study [--pre "window.__pwGo(3)"] [--play] [--click]`
  (from Git Bash, MSYS_NO_PATHCONV stops "/atlas/..." being rewritten to a Windows path).

## Navigation bug: root cause (fixed in v2, absent in v3)
v2 `PathwayTracer` passed `onLoad={(done, total) => setLoad({ done, total })}` to `PathwayScene`, whose report effect
depends on `onLoad`. Each render made a new callback, the effect re-ran and set a new object, which re-rendered the tracer:
a self-sustaining loop of ~10 React commits a second, even when idle (navtest: 638 commits in 60 s, hook #17 = `load`).
The App Router navigation is a transition; React kept serving the loop's default-lane updates first and restarting the
slow (dev) render of the new route, which could only complete by lane expiry, and every suspension of the new route
(chunks, styles, data) reset that clock: 15-40 s, or never (60 s timeout in the test). With a stable, no-op-when-equal
callback: lesion lab 1.2 s, study 0.24 s. v3 idle: lesion lab 3.3 s (dev compile), study 8.1 s (cold), 4 main-root
commits while pending. Commit 6c4494a.

## Done
- ff51db6 checkpoint of the inherited WIP (scene renders, DCML hand/foot data validates).
- 6c4494a navigation root cause + `navtest.mjs`.

## Page wiring
`/atlas/pathways` renders `PathwayHub`: v3 (`Tracer3`) for shipped slugs, v2 (`PathwayTracer`) for the rest, one picker and
one URL scheme; picking a pathway of the other version swaps the tracer in place. `?v=3` / `?v=2` pins a version.
The hard-navigation workaround in AtlasModes.tsx and NavMenu.tsx is removed: real mid-beat clicks commit (v3 lesion lab
3.5 s / study 2.1 s on the dev server, v2 1.5 s / 0.34 s while playing).

## Next
- Specs for the remaining 33 pathway variants (only DCML exists), validator green for all.
- UI: side chip in Both mode, one diagram expand button, phone height for the diagram, branch names, framing/labels.
- Contact sheets per beat at 1440x900 and 390x844 in `_atlas/pw3_shots/<slug>/`, reviewed against the slides.
- Mid-beat navigation test with the workaround removed (AtlasModes.tsx, NavMenu.tsx), then remove it.
- Switch `/atlas/pathways` to v3; lesion lab stays on its own scene (PathwayViewer); delete replaced v2 code.
