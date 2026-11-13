# Pathway tracer v3: status and handoff

Running note for whoever continues (design and done bar: `docs/PATHWAY_V3.md`). Updated at each milestone.

## Shipped (all 33 pathways on v3; the v2 tracer is deleted)
`V3_SHIPPED` (`v3/shipped.ts`) and the v2 `PathwayTracer` / `ReceptorLens` were removed once every slug shipped; the lesion
lab keeps its own `PathwayViewer` / `PathwayScene`.
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
- lcst: shipped 2026-11-12. Validator green (2270 samples; pyramidal decussation at the brainstem/spinal cord junction,
  the uncrossed 20 % in the anterior corticospinal tract). Sheets `_atlas/pw3_shots/lcst/` checked against lecture 10
  slides 12-15 (layer V, corona radiata, internal capsule, peduncle, longitudinal pontine fibres, pyramid, 80 % cross,
  lateral funiculus, lateral ventral horn, distal limb). Capsule limb gated (OQ2).
- corticobulbar: shipped 2026-11-12. Validator green (1602 samples; crossing just above the facial nucleus, plus motor V,
  hypoglossal and ambiguus fibres). Checked against lecture 10 slides 13-14 / lab 10 slide 2; no forehead sparing.
- umn-lmn: shipped 2026-11-12 (2008 samples; same descent and LMN as LCST).
- dsct (foot): shipped 2026-11-12. Validator green (3268 samples, no crossing; hidden seam from the MNI ICP into the
  cerebellum mesh). Checked against lecture 5 slides 15-16 (Ia/Ib in the DRG, ipsilateral column of Clarke C8-L2,
  DSCT in the lateral funiculus, ICP, ipsilateral cerebellum).
- stretch-reflex (leg): shipped 2026-11-12. Validator green (2135 samples; flagged L4 ramus and cauda equina roots).
  Checked against lecture 10 slide 9 / lecture 5 slide 9 (spindle Ia, monosynaptic onto the alpha MN, knee jerk L3-L4).
- withdrawal-reflex (hand): shipped 2026-11-12. Validator green (2679 samples; one drawn, flagged connector: the ulnar
  muscular branch into the flexor group). Checked against lecture 10 slide 9 / lecture 5 slide 8 (skin receptor, interneurons,
  alpha MN, polysynaptic, descending modulation).
- acst, rubrospinal, tectospinal, reticulospinal, vestibulospinal: shipped 2026-11-12. Validator green (acst 819 samples
  with a flagged T1 dorsal ramus; rubro/tecto cross in the midbrain). Checked against lecture 10 slides 14-15 and 19-23,
  lecture 14 slide 5 (named decussations behind Supplementary; no side claim for reticulo/vestibulospinal beyond the drawing).
  For rubrospinal and tectospinal the side buttons name the red nucleus / tectum side.
- sympathetic: shipped 2026-11-12. Validator green (662 samples). Lateral horn T2 (intermediolateral nucleus mesh), ventral
  root, intercostal nerve and the T2 white ramus (real curves) to a chain ganglion; grey ramus back into the intercostal nerve
  to the skin (L6/21) and a long cardiac nerve to the heart. Drawn, flagged connectors: the sympathetic chain (Z-Anatomy has
  the rami but no trunk: a tube through the rami's chain ends), the thoracic cardiac nerve; hidden seam ramus onto the
  intercostal nerve (1-2 mm). Badge "Pre"/"Post". Checked against lecture 6 slides 16-21 and 24. Views: anterior with a
  coronal cut for the cord/chain beats.
- parasympathetic: shipped 2026-11-12. Validator green (1271 samples). Dorsal motor nucleus of X, the vagus (real curve) to
  a cardiac ganglion in the atrial wall and a pulmonary ganglion in the main bronchus wall (proxies inside the organ meshes),
  short postganglionic fibres. Flagged connectors: cardiac and pulmonary branches of the vagus. CN III/VII/IX and S2-S4 named
  in the copy only (an EW -> ciliary ganglion -> pupil chain is in autonomic.mjs, `edingerWestphal`, for the pupillary
  reflex: the ciliary ganglion is a proxy with no parent mesh, which the validator now flags as a connector). Checked
  against lecture 6 slides 22-24, lecture 7 slide 28.
- trigeminal-discriminative, trigeminal-pain: shipped 2026-11-12. Validator green (647 / 779 samples; crossings in the pons
  and in the caudal medulla, hidden midline seams). Cheek skin (V2, real maxillary curves), trigeminal ganglion (a flagged
  ellipsoid: the atlas nerve mesh is a thin cord without a ganglion), sensory root into the pons; principal sensory nucleus
  -> cross in the pons -> trigeminal lemniscus with the medial lemniscus -> contralateral VPM; or spinal trigeminal tract ->
  spinal nucleus (caudal medulla) -> cross -> trigeminothalamic tract beside the ALS -> VPM; VPM -> capsule -> S1 face area.
  Checked against lecture 9 slides 16-17 and 21-24 (OQ5: all 2nd-order fibres cross, as the slides say).
- corneal, jaw-jerk: shipped 2026-11-12. Validator green (corneal 511 samples, crossing in the medulla to the other facial
  nucleus; jaw-jerk 451). Corneal: cornea -> long ciliary / nasociliary connector (flagged) -> ophthalmic nerve -> ganglion ->
  root -> spinal tract -> spinal V -> both facial nuclei. Jaw jerk: masseter spindle -> masseteric connector (flagged) -> V3
  -> through the ganglion (no cell body) -> root -> mesencephalic nucleus -> motor nucleus of V -> motor root -> masseter.
  Checked against lecture 12 slides 3 and 5 and lecture 9 slide 10. Spec: trigeminal-reflex.mjs.
- pupillary, gaze: shipped 2026-11-12. Validator green (pupillary 1444 samples, nasal fibres cross in the chiasm, pretectal
  fibres cross in the midbrain; gaze 926, FEF fibres cross in the pons, abducens interneurons cross into the MLF). Pupillary:
  lit retina -> optic nerve -> chiasm/tract -> pretectal nuclei (hidden seam for the brachium of the SC) -> both EW -> CN III
  -> ciliary ganglion (flagged) -> short ciliary nerves (flagged) -> sphincter of both eyes; colours 1-4 = RGC, pretectal,
  EW, ciliary. Gaze: FEF (BA 8, caudal middle frontal gyrus, CORTEX "fef") -> capsule (seam) -> peduncle -> pons -> opposite
  PPRF -> abducens nucleus -> CN VI -> lateral rectus; internuclear axon across into the MLF -> other oculomotor nucleus ->
  CN III -> medial rectus. Checked against lecture 11 slides 7 and 25-27, lecture 12 slide 10.
- cochlear, vestibular: shipped 2026-11-12. Validator green (cochlear 568 samples; vestibular 830). Cochlear: hair cells ->
  spiral ganglion (proxy inside the cochlea) -> cochlear nerve (right side: a flagged mirror of the left curve, Z-Anatomy has
  only the left) -> CN VIII -> cochlear nuclei -> bilateral ascent (one fibre crosses in the pons, marked; OQ8) -> inferior
  colliculus -> MGN -> internal capsule -> transverse temporal gyrus (BA 41/42). Vestibular: vestibule -> vestibular nerve ->
  vestibular ganglion (flagged ellipsoid) -> vestibular nuclei; direct branch by the ICP to the flocculus (seam ICP ->
  cerebellum); ascending MLF to the other abducens nucleus (crossing) and the same-side oculomotor nucleus; lateral
  vestibulospinal tract to the C8 ventral horn; ascent to the thalamus. Checked against lecture 8 slides 18-19, lecture 14
  slides 7-10, lecture 11 slide 28.
- solitary, corticopontocerebellar: shipped 2026-11-12. Validator green (solitary 1077 samples; corticopontocerebellar 579,
  transverse pontine fibres cross in the basis pontis). Solitary: posterior tongue (lingual branch of IX) and carotid sinus
  (flagged carotid sinus branch) -> inferior ganglion of IX (flagged ellipsoid) -> solitary nucleus -> inferior salivatory
  nucleus, nucleus ambiguus (-> vagus -> flagged pharyngeal branch -> constrictors), superior salivatory nucleus, and down the
  lateral funiculus (lateral reticulospinal tract mesh as host) to the T1 lateral horn. Corticopontocerebellar: M1 layer V ->
  capsule -> peduncle -> same-side pontine nuclei -> cross -> opposite MCP -> (seam) -> posterior quadrangular lobule.
  Checked against lecture 7 slides 22-24, lecture 8 slide 22, lecture 10 slide 11, lecture 14 slide 11.
- cerebellar, basal-ganglia: shipped 2026-11-12. Validator green (cerebellar 830 samples, decussation of the SCP in the
  caudal midbrain; basal ganglia 714). Cerebellar: mossy (opposite pontine nuclei, cross, MCP) and climbing (opposite olive,
  cross, ICP) fibres -> posterior quadrangular lobule (Purkinje, "inhibitory") -> deep cerebellar nuclei ("excitatory") ->
  SCP -> decussation -> opposite red nucleus -> VA/VL. Basal ganglia (one hemisphere, coronal view with a z cut): cortex ->
  putamen; direct putamen -> GPi; indirect putamen -> GPe -> STN -> GPi; SNc -> putamen; GPi -> VA/VL -> motor cortex. GPi and
  GPe are ellipsoids inside the one atlas pallidum (medial / lateral). Excitatory / inhibitory are named in the stops and the
  copy only: the fibres have no inhibitory style (a possible follow-up: a bar instead of the synapse cup). Checked against
  lecture 14 slides 11-18 and 23-31, lab 10 slides 4 and 9.
- limbic-fornix, limbic-amygdala, limbic-septal, reward, olfactory: shipped 2026-11-12. Validator green (227 / 279 / 164 / 282
  / 193 samples). Fornix: hippocampus -> fimbria/crus -> body -> column -> mammillary body (waypoints inside the fornix mesh).
  Amygdala: amygdala -> stria terminalis -> BNST (an ellipsoid inside the stria's anterior end) -> hypothalamus. Septal:
  septal nuclei -> stria medullaris (the thalamus's edge where the SM mesh breaks) -> habenula. Reward: VTA -> lateral
  hypothalamus (medial forebrain bundle) -> nucleus accumbens -> prefrontal (orbital) cortex. Olfactory: a filament of CN I
  (epithelium) -> cribriform plate -> bulb (mitral cell, in the Z-Anatomy olfactory nerve mesh) -> tract -> lateral stria ->
  prepiriform cortex (anterior parahippocampal gyrus / uncus) and a branch to the olfactory tubercle (flagged ellipsoid).
  Hidden seams here are longer than elsewhere (validated, listed in the validator report): septal->SM 3-4 mm, thalamus->
  habenula 2 mm, hypothalamus->accumbens 5.4 mm, accumbens->orbital cortex 6 mm, stria->cortex 7 mm (basal forebrain and
  anterior perforated substance have no atlas mesh). Checked against lecture 15 slides 11-18, 23, 25-26, lecture 2 slide 33.
- Proxies may now have a host key as parent (a tube, a part mesh) or none (flagged); labels of multi-stop node beats anchor
  on each stop's own mark (proxy centre, or a soma/synapse inside it), no longer all on the beat's soma.
- Hidden seams (validated, not drawn) are where two source meshes do not touch: capsule to crus 6-7 mm, brainstem midline
  3 mm, nerve endings to targets up to 4.5 mm, ICP to cerebellum 3.6 mm.
- Limb-end node beats (receptor, target muscle) are framed with 9 cm of context.

Order (owner, 2026-11-11): DCML, ALS, LCST, visual, corticobulbar, then the rest in the order of the course units.

## Where things are
- UI: `src/components/atlas/pathways/v3/` (Tracer3 = page shell, Scene3 = 3D scene, fibres/layers/labels/rig/insets).
  `/atlas/pathways` always opens v3 (`PathwayHub` renders `Tracer3`).
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
(History) `/atlas/pathways` rendered `PathwayHub`: v3 (`Tracer3`) for shipped slugs, v2 (`PathwayTracer`) for the rest, one picker and
one URL scheme; picking a pathway of the other version swaps the tracer in place. `?v=3` / `?v=2` pins a version.
The hard-navigation workaround in AtlasModes.tsx and NavMenu.tsx is removed: real mid-beat clicks commit (v3 lesion lab
3.5 s / study 2.1 s on the dev server, v2 1.5 s / 0.34 s while playing).

## Next
All 33 pathways are on v3.
Pattern per pathway: spec -> build (validator green) -> copy in copy/<group>.json + copycheck -> shoot.mjs both sizes ->
sheet.py -> look and compare with the slides -> add to V3_SHIPPED and the Shipped list -> commit.
Done: v2 tracer code deleted. Still open: the hidden seams listed above; the dev overlay shows "3 issues" on every sheet (pre-existing, not from the tracer specs).

## Polish pass (2026-11-12)
- Inhibitory synapses: a spec fibre marked `.inhibits()` (fibre.mjs) carries `inh: true` into the JSON; the scene draws a short
  bar across the fibre's end (Mark kind "inh", turned across the fibre and the view each frame) instead of the cup, and the key
  adds an "inhibits" row only when the pathway has one. Marked (lecture 14 slides 11-18 and 23-31, as cited in circuits.mjs):
  Purkinje -> deep cerebellar nuclei; striatum -> GPi (direct); striatum -> GPe and GPe -> STN (indirect); GPi -> VA/VL.
  Cups stay for STN -> GPi, cortex -> striatum, thalamus -> cortex, mossy / climbing fibres and the deep nuclei -> red nucleus /
  VA/VL (all excitatory). SNc dopamine is left as is (the 2D diagram key already says "modulates"). Sheets: basal-ganglia and
  cerebellar, both sizes. Known weakness, not from this change: in the basal ganglia coronal beats the short striatum -> GPi
  fibres are partly hidden behind the putamen shell at the section plane; the bars (depth-test off) still show the endings.
- Labels: the open key box (`[data-pw-key]`) is an obstacle: the left gutter stacks below its measured bottom edge.
  Label tags are keyed by stop key plus name: two stops on one patch ("Spindles in the masseter", "Masseter contracts") used to
  share a tag and drew over each other.
- Olfactory beats 0-4: a coronal cut seen from the front (was a midsagittal cut that left the nerve on an empty background).
  Both nerves read against the ethmoid, cribriform plate and frontal lobes.
- Jaw jerk: the beat badge named the motor neuron "1st" while the scene draws it 2nd-order (the course map counts one neuron).
  The badge now takes the drawn order when it is higher (and a target beat keeps the previous beat's order); this also makes
  the basal ganglia thalamocortical beat read "4th". Left: the side rail's neuron card still follows the course map (jaw jerk
  lists only the mesencephalic neuron).
