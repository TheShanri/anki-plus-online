# Explore atlas: the inside of the brain (plan and definition of done)

Owner request (2026-11-15): the 3D Explore atlas models only the surface; the cuts must show the inside like a textbook
midsagittal plate and a coronal atlas plate. Decision: keep the Z-Anatomy outside (gyri, brainstem, cerebellum, nerves),
rebuild the inside from ONE labelled atlas volume that drives both the cut faces and the interior 3D meshes.

## 1. Definition of done: what a student must be able to identify, per standard view

Sources: course lab decks in `content-build/decks/*/slides.json` (extracted from `_source/raw/Lab *.pdf`) and
`content/nsci3250/structures.json` (`lists[].lab`). "Lab 14 s15" = Lab 14 deck, slide 15.

### Midsagittal (Lab 2 s3, s4, s12, s16, s17, s18, s20; Lab 13 s2; owner's textbook plate)
Cut (true section at the midline): corpus callosum (genu, body, splenium; Lab 14 s15), fornix (body, columns), septum
pellucidum, anterior commissure, lamina terminalis, optic chiasm, hypothalamus (floor, between chiasm and mammillary body),
mammillary body, pituitary stalk (stump), interthalamic adhesion (massa intermedia), posterior commissure, habenula, pineal
gland, tectum / corpora quadrigemina (superior and inferior colliculus), cerebral aqueduct, periaqueductal grey, midbrain
tegmentum, pons (basilar part and tegmentum), medulla, fourth ventricle, cerebellum (vermis) with arbor vitae.
Seen as surface beyond the cut: thalamus (wall of the third ventricle), hypothalamic sulcus, interventricular foramen,
medial surface of the hemisphere (cingulate gyrus, gyri of the medial surface), lateral ventricle through the septum gap.

### Ventral surface (Lab 7 s13, s23-26; Lab 2 s15, s18)
3D surface (Z-Anatomy outside, unchanged): optic nerve, chiasm and tracts, pituitary stalk, mammillary bodies, floor of the
hypothalamus, anterior perforated substance, cerebral peduncles, interpeduncular fossa, pons (transverse fibres), middle
cerebellar peduncle, pyramids, olives, cranial nerve roots, parahippocampal gyrus and uncus, olfactory bulb and tract.

### Coronal series (Lab 14 s3-s16; owner's coronal atlas plate)
- At the anterior commissure (Lab 14 s7, s8): interhemispheric fissure, cortical ribbon, cingulate gyrus, corpus callosum
  (body), septum pellucidum, lateral ventricle (anterior horn), caudate head, internal capsule anterior limb, putamen,
  globus pallidus, nucleus accumbens / basal forebrain, anterior commissure, columns of the fornix, third ventricle,
  hypothalamus, optic chiasm, insula, lateral fissure, amygdala, uncus.
- At the thalamus (Lab 14 s9; owner's plate): body of the corpus callosum, body of the fornix, choroid plexus, body of the
  lateral ventricle, caudate body, thalamus (anterior nucleus, interthalamic adhesion), internal capsule (posterior limb),
  putamen, globus pallidus external and internal segments, claustrum, external and extreme capsules, insula, third
  ventricle, mammillary bodies, optic tract, temporal horn with hippocampus, tail of caudate.
- At the substantia nigra (Lab 14 s10; owner's plate): cingulate gyrus, fornix body, thalamus, third ventricle, internal
  capsule (posterior limb), subthalamic nucleus, substantia nigra, red nucleus, cerebral peduncle, opening of the cerebral
  aqueduct, posterior commissure, hippocampus in the inferior horn, insula, caudate body.
- Posterior (Lab 14 s11-s14): pulvinar, medial and lateral geniculate nuclei, tail of caudate, crus of the fornix, atrium
  (trigone), splenium, pineal gland, choroid plexus, cerebral aqueduct, middle cerebellar peduncle, fourth ventricle,
  pyramids, posterior horn, dentate nucleus.

### Horizontal series (Lab 13 s6-s14)
Above the corpus callosum: centrum semiovale, cortical ribbon, interhemispheric fissure. Through the thalamus: genu and
splenium of the corpus callosum, anterior horn and atrium, septum pellucidum, caudate head, internal capsule anterior limb,
genu and posterior limb, putamen, globus pallidus, thalamus, anterior nucleus, fornix (body, columns, crus), insula.
Through the hypothalamus: anterior commissure, third ventricle, pineal gland, medial and lateral geniculate nuclei, posterior
limb turning into the cerebral peduncle. Lowest: amygdala, hippocampus, inferior horn, mammillary bodies, anterior
perforated substance, floor of the hypothalamus, midbrain (cerebral peduncles, substantia nigra, superior colliculi,
cerebral aqueduct).

## 2. Single source of truth for the interior

| Source | Use | Licence (verified at the source) |
|---|---|---|
| Allen Human Reference Atlas 3D 2020 v1.0.0 (`annotation_full.nii.gz`, 0.5 mm, ICBM 2009b sym) | every named region: nuclei, thalamic nuclei, hypothalamic regions, GPe/GPi, claustrum, STN, SN, RN, tracts (cc, ac, fornix, mtt, optic tract/radiation), ventricle parts, brainstem and cerebellar divisions, cortical gyri, forebrain/hindbrain white matter | CC BY 4.0 (README.pdf at download.alleninstitute.org/informatics-archive/allen_human_reference_atlas_3d_2020/version_1/, verified 2026-11-05) |
| Harvard Ascending Arousal Network atlas v2.0 | periaqueductal grey, raphe, LC, VTA (brainstem nuclei) | CC0 1.0 (Dryad README) |
| Advanced Atlas of 80 Bundles (HCP-842) | medial lemniscus, MLF (brainstem tracts) | CC BY 4.0 (figshare LICENSE) |
| ICBM 2009b nonlinear symmetric T1/T2/PD | grey/white/CSF tissue field (cortical ribbon, sulci) | MNI/McGill permissive notice (copy, modify, distribute with the notice) |
| Z-Anatomy | outside (gyri, brainstem, cerebellum surfaces), registration targets | CC BY-SA 4.0 |

Not used: BigBrain / Julich-Brain (CC BY-NC-SA), Brainstem Navigator (no redistribution), SUIT (CC BY-NC). No new download
was needed: everything above was already in `_atlas/raw` and verified (see `_atlas/ATLAS2_SOURCES.md`).

Derived labels (documented in `tools/atlas/interior_labels.py`): internal capsule limbs, external and extreme capsules,
septum pellucidum, interthalamic adhesion, corpus callosum genu/body/splenium, fornix columns/body/crus/fimbria, choroid
plexus, optic chiasm, posterior commissure, lamina terminalis, centrum semiovale, cerebellar white matter (arbor vitae).

## 3. Pipeline

1. `tools/atlas/interior_labels.py` builds the integer label volume in MNI space (0.5 mm), maps every label to a course
   slug and an atlas id, warps it into the Z-Anatomy mesh space with the registration of `section_volume.py`
   (landmark affine + multi-channel demons), clips it to the Z-Anatomy brain and fills the rim from the nearest label.
2. The same script writes `public/atlas/interior.bin.gz` (0.5 mm label + smooth boundary channel, interior box) and
   `public/atlas/interior.json` (structure table: name, slug, ids, tissue, tone, centroid, bounds, best cut per axis),
   plus Dice per structure against the Z-Anatomy meshes and overlay PNGs in `_atlas/interior/`.
3. Cut faces (`src/components/atlas/section/labels.ts`, `shader.ts`): each fragment picks its label from the 8 nearest
   voxels with a signed smooth boundary value (crisp, anti-aliased borders at any zoom); nuclei are flat grey, tracts
   white, CSF dark, choroid plexus its own tone; cortex and generic white matter keep the tissue field. Hover, click and
   the section key use the same labels on the CPU.
4. Interior meshes: marching cubes per label in the Z-Anatomy space, Taubin smoothing, decimation, meshopt; they replace
   the Z-Anatomy deep meshes so the 3D shapes and the cut faces are the same object.

## 4. API for the interaction code (`src/components/atlas/section/api.ts`)
- `sectionOnly(ids | null, opts?)`: paint only those structures' cut faces (others hidden or dimmed).
- `structureBounds(id)`: centroid, min, max (metres, world) of a labelled structure; `bestCut(id, axis)`: plane position
  through its largest cross-section.
- `labelAt(point)`, `sectionPickRay(ray)`, `sectionKeyFor(...)`.

## 5. Rounds
1. Midsagittal + ventral (foundation, labels, shader, pick, key).
2. Coronal series (AC, thalamus, SN levels).
3. Horizontal / oblique, interior meshes from labels.

Status, numbers and shots: `docs/ATLAS_INTERIOR_STATUS.md`.
