# 3D atlas v3: one foundation, one surface network

Owner request (2026-11-23): "scrap the current 3D atlas and rebuild it from scratch ... patchy and Frankenstein ... all
structures present, no physical gaps in the cortex, internal structures mapped and visualised in a high-quality way; if an
alternative foundation gives better results, now is the time."

## Why a new foundation

The v1/v2 atlas joins two worlds: Z-Anatomy artist meshes outside (CC BY-SA) and the Allen atlas warped into the Z-Anatomy
space inside. They never fit: holes in the cortex (filled by `fill_ctx_holes.py`, `fill_ctx_pinholes.py`,
`gap_meshes.py`, `medial_wall.py`), interior meshes that disagree with the outside, cut faces from a separately smoothed
volume, 9-18 mm misfits in the cortex (`docs/ATLAS2_SOURCES.md`).

v3 uses ONE labelled volume in ONE space for the whole brain, and derives every surface and every cut face from it.

| Source | Use | Licence (verified at the source) |
|---|---|---|
| Allen Human Reference Atlas 3D 2020 v1.0.0 (`annotation_full.nii.gz`, 141 structures, 0.5 mm, ICBM 2009b sym) | cortex by gyrus, basal ganglia, thalamic nuclei, hypothalamus, amygdala, hippocampus, ventricles, tracts, brainstem and cerebellar divisions | CC BY 4.0 |
| ICBM 2009b nonlinear symmetric template (0.5 mm) | the space (the Allen labels are drawn on it) | MNI/McGill permissive notice |
| Harvard Ascending Arousal Network v2.0 | PAG (via atlas2), locus coeruleus, raphe, VTA, LDTg, PBC, PnO, mRt, PTg | CC0 |
| Advanced Atlas of 80 Bundles (HCP-842) | medial lemniscus, MLF in the brainstem | CC BY 4.0 |

Derived structures are documented in `tools/atlas3/labels.py` (and the atlas2 ones in `tools/atlas/build_atlas2.py`).
Not used: BigBrain / Julich-Brain (NC-SA), Brainstem Navigator (no redistribution), SUIT (NC).

## Pipeline (`tools/atlas3/`, run from the repo root with `tools/.venv/Scripts/python.exe -I`)

1. `spec.py`: the structure table (one row per label; course slugs; groups).
2. `labels.py` -> `_atlas/raw/v3/labels.npy` (uint16, the Allen 0.5 mm grid) + `labels.json`: sources composed, derived
   parts, holes filled, a closed cortical shell (no white matter on the outer cerebral surface where cortex lies within
   3 mm), specks merged, left/right split at the midline (paired structures become KEY.L / KEY.R).
3. `mesh.py` -> `patches.npz`: VTK SurfaceNets (Schroeder 2022) over all labels at once. Every triangle separates exactly
   two regions; triangles are grouped into interface patches by label pair, each decimated (vtkDecimatePro) with its
   boundary vertices locked, so neighbouring patches still meet exactly: no cracks, no overlaps.
4. `bake.py`: per-vertex normals of each region's whole boundary (smooth across patch borders), ambient occlusion of the
   outer surface sampled in the volume, raw GLBs: `shell` (patches against the outside) and `inner` (all the rest).
5. `export.py` -> `public/atlas3/index.json`: label table (names, course slugs, centroid, box, anchor, best cut planes).
6. `pack.mjs` -> `public/atlas3/{shell,inner}.glb`: quantised + meshopt (no welding, no simplification).

## Rendering (`src/components/atlas3/engine/`)

One shader for the whole network (`patchMaterial.ts`). A triangle knows both of its regions (a behind, b in front of its
normal). Per fragment: viewer inside a visible region -> that region's cut face (flat section tone); else the region beyond
is visible -> its lit surface; else nothing. Hiding a hemisphere, the cortex or any structure is a state-texture update;
a clip plane turns into cut faces with no extra geometry, and the borders between cut faces are drawn from the very
triangles the plane crosses (`cutLines.ts`). Picking renders the same network with region ids into one pixel.

## Status

See the end of this file (updated as rounds land).
