# Pathway tracer v3: status and handoff

Running note for whoever continues (design and done bar: `docs/PATHWAY_V3.md`). Updated at each milestone.

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

## Next
- Specs for the remaining 33 pathway variants (only DCML exists), validator green for all.
- UI: side chip in Both mode, one diagram expand button, phone height for the diagram, branch names, framing/labels.
- Contact sheets per beat at 1440x900 and 390x844 in `_atlas/pw3_shots/<slug>/`, reviewed against the slides.
- Mid-beat navigation test with the workaround removed (AtlasModes.tsx, NavMenu.tsx), then remove it.
- Switch `/atlas/pathways` to v3; lesion lab stays on its own scene (PathwayViewer); delete replaced v2 code.
