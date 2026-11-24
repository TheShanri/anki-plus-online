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

Inside `labels.py`:

- `bsnuclei.py`: the cranial-nerve nuclei and brainstem tracts the Allen atlas lacks (III, EW, IV, V motor and principal
  sensory, VI, VII, VCx, Sp5, Sol, DMX, XII, ambiguus, gracile, cuneate, PPRF, facial colliculus, ALS, DSCT, IAF,
  decussations ...), from the course's own level plates (`src/data/brainstem-plates`). Each plate is fitted into its
  section plane by landmarks it shares with the atlas (only those the atlas has at that level; planes ordered, never
  crossing); shapes are made symmetric (mean of a drawing and the mirror of the other side, or the mirror where one side
  is drawn), grown to a minimum thickness, moved (mirror-wise per side) into their host tissue, and swept between levels
  centre-on-centre. `BS_DUMP=1 labels.py` + `bsdev.py` / `bsplot.py` work on this step alone (plate overlays as PNG).
- `surfregions.py` (in `bake.py`): sulci (the walls of the groove between two gyri) and functional areas (Broca, Wernicke,
  M1, V1 ...) as per-vertex masks of the outer surface.
- `zmap.py`: Z-Anatomy space -> MNI (the v2 warp), for objects only Z-Anatomy has (cerebellar lobules, cranial nerves).
- `cblobes.py`: the Allen cerebellar zones (vermis, paravermis, lateral) split by lobe (anterior, posterior, tonsil,
  flocculonodular): every cortex voxel takes the lobe of the nearest Z-Anatomy lobule surface (zone x lobe leaves; the
  zone keys are `stage` rows, rewritten before the split).
- `cnerves.py`: cranial nerves II-X, XII from Z-Anatomy, kept from where they leave the brainstem (or the chiasm) along
  the nerve for their cisternal length, outside the brain only.
- `extras.py`: pituitary gland (segmented on the template's T1 in the sella) and stalk, lamina terminalis,
  interventricular foramina, obex, area postrema, gracile and cuneate tubercles, derived from the labels.

- `fibres.py` (after the pipeline, before `export.py`): tracts no label can hold (they run through other structures and
  overlap) as fibres in `public/atlas3/fibres/<slug>.json`: HCP-842 streamlines (rubrospinal, corticopontine,
  association fibres; MNI space, no warp) or the Pathway tracer's own course of the tract warped by `zmap.py`
  (tectospinal, vestibulospinal, reticulospinal, corticobulbar, trigeminothalamic, medial forebrain bundle, striae,
  corticospinal tracts). `export.py` flags those catalog items (`fibre`).

The viewer at `/atlas` (`src/components/atlas3/Explore3.tsx`) shows the same selection as 3D, MRI slices (the atlas2
viewer) or the course's brainstem sections; structures beyond the syllabus open behind the "just curious" gate; each
derived structure says where its shape comes from. `present.ts` decides how one structure is shown (best view, deep
view, see-through brainstem) for Explore and `StructureView3` (Name that structure); the atlas peek over study cards
embeds Explore; My memory map (`MemoryMap3D`) and Slice match (`CutView3`, exact: the atlas is in the MRI's own space)
use the new canvas. The previous browser lives on at `/atlas/classic`; Blood supply still uses the old engine (its
vessels and territories are not in v3 yet).

Before the left/right split only midline structures are despeckled (the smaller side of a small pair is otherwise taken for
a speck).

## Rendering (`src/components/atlas3/engine/`)

One shader for the whole network (`patchMaterial.ts`). A triangle knows both of its regions (a behind, b in front of its
normal). Per fragment: viewer inside a visible region -> that region's cut face (flat section tone); else the region beyond
is visible -> its lit surface; else nothing. Hiding a hemisphere, the cortex or any structure is a state-texture update;
a clip plane turns into cut faces with no extra geometry, and the borders between cut faces are drawn from the very
triangles the plane crosses (`cutLines.ts`). Picking renders the same network with region ids into one pixel.

A second, transparent pass of the same network (`GHOST`) draws hidden-but-ghosted labels as a fresnel veil: a face is drawn
when the region beyond it is ghosted and the viewer's side is not of the same ghost class, so a whole group (the
brainstem) reads as one see-through body with its ventricles as a second veil inside. A brainstem nucleus or tract opens
in this view, from behind, framed on the whole brainstem.

## Status

See the end of this file (updated as rounds land).
