# ATLAS-2 sources (2026-11-05)

Everything below was downloaded to `_atlas/raw/` (git-ignored), read only as data, never executed. Licences were checked at the official source named in each row.

| Source | Used for | Licence (where verified) | Required citation |
|---|---|---|---|
| Allen Human Reference Atlas - 3D, 2020 v1.0.0 (`annotation_full.nii.gz`, 141 structures, 0.5 mm, ICBM 2009b sym space) | Exact labels: substantia nigra, red nucleus, subthalamic nucleus, pineal, mammillary region, hypothalamus, colliculi, cerebral/superior/middle/inferior cerebellar peduncles, inferior olive, pyramids, cerebellar deep nuclei (merged), thalamic nuclei, basal ganglia, hippocampus, amygdala, ventricle parts, fornix, commissures, optic radiation/tract, cortical gyri, pons/medulla/midbrain tegmentum | CC BY 4.0, stated in the atlas README.pdf at download.alleninstitute.org/informatics-archive/allen_human_reference_atlas_3d_2020/version_1/ | Ding SL, Royall JJ, Sunkin SM, Facer BAC, Lesnar P, Bernard A, Ng L, Lein ES (2020). Allen Human Reference Atlas - 3D, 2020, RRID:SCR_017764, v1.0.0. Ontology: Ding et al. 2016 J Comp Neurol 524:3127-3481, doi:10.1002/cne.24080. (c) 2019 Allen Institute for Brain Science |
| Advanced Atlas of 80 Bundles in MNI space (figshare 7375883, doi:10.6084/m9.figshare.7375883.v2), curated from HCP-842 (Yeh 2018) | Medial lemniscus, MLF, spinothalamic, corticospinal, corticopontine, association bundles (streamlines to smoothed density, thresholded at 20-30 % of each bundle's peak, argmax between bundles) | CC BY 4.0 (figshare metadata + LICENSE file in the zip) | Garyfallidis E et al. (2017) NeuroImage 170:283-297; Yeh FC et al. (2018) NeuroImage 178:57-68. Space is ICBM 2009a; checked against AHRA (ML voxels 68 % in pontine tegmentum, CST in white matter/cerebral peduncle): no shift applied |
| ICBM 2009b nonlinear symmetric T1 (MNI/BIC) | Background MRI (brain-only, 1 mm, 8-bit) | Permission to use, copy, modify and distribute for any purpose provided the copyright notice is kept (bic.mni.mcgill.ca/ServicesAtlases/ICBM152NLin2009) | (c) 1993-2004 Louis Collins, McConnell Brain Imaging Centre, MNI, McGill University; Fonov et al. 2009 NeuroImage 47:S102, 2011 NeuroImage 54:313-327 |
| NiiVue 0.69.0 | Slice viewer | BSD-2-Clause | github.com/niivue/niivue |

## Considered and not used
- **Harvard AAN atlas v2.0** (Dryad doi:10.5061/dryad.zw3r228d2, CC0, has PAG, LC, DR, PBC, LDTg, mRt...): the Dryad file API returns 401 without a bearer token and I did not create an account. Owner decision: download the NIfTIs by hand (free Dryad login) and drop them in `_atlas/raw/aan/`; they are in MNI152 1 mm space and would replace the derived PAG and add LC/raphe/etc.
- **Brainstem Navigator** (NITRC): requires accepting a usage licence on login. Not downloaded.
- **JHU ICBM-DTI-81 / XTRACT / CIT168**: distributed with FSL / need a licence click-through; the AHRA + 80-bundle pair already covers the same gaps. CIT168 would only refine SN into pars compacta/reticulata.
- **SUIT / Diedrichsen cerebellar atlases** (GitHub, no licence file): lobular parcellations, no nuclei; dentate is therefore only shown as "cerebellar deep nuclei".

## Derived structures (documented in `tools/atlas/build_atlas2.py`)
- Periaqueductal grey: AHRA midbrain-tegmentum voxels within 4 mm of the aqueduct.
- Internal capsule: AHRA forebrain white matter within 4.5 mm of both (caudate+thalamus+hypothalamus) and (putamen+globus pallidus), opened and size-filtered; split at the anterior thalamic pole (genu = +/-3 mm).
- Longitudinal fibres of the pons: corticospinal/corticopontine density inside the AHRA basilar pons.
- "Regional" structures (cranial-nerve nuclei, pontine nuclei, dentate...) light up the whole enclosing AHRA region and are flagged as such in the UI.

## MNI to Z-Anatomy registration (`tools/atlas/register_mni_zanat.py`)
Affine fitted on centroids of 20 central landmarks (thalamus, putamen, pallidum, hippocampus, amygdala, ventricles, habenula, hypothalamus, pons, medulla, per hemisphere): RMS 2.94 mm, max 4.2 mm, leave-one-out RMS 3.68 mm. Held-out check (not in the fit): midbrain centroid 1.5 mm. Cortex, fornix, caudate, callosum and cuneus fit badly (9-18 mm; Z-Anatomy's BodyParts3D brain differs in shape), so only central structures got a registered 3D mesh (19 meshes, 380 KB); everything else stays MRI-only in the slice tab.
