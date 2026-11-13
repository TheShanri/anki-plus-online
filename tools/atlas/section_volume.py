"""Tissue volume for the Explore atlas section faces (the inside of the brain on a cut).

The Z-Anatomy meshes give the brain's outline and the deep structures but no grey/white matter. The ICBM 2009b
symmetric T1 template (0.5 mm) has the real gyral grey ribbon, white matter, sulci and ventricles. This warps the template
into the Z-Anatomy mesh space (glTF metres, Y-up) and writes one 8-bit tissue volume the cut cap samples in its shader.

Registration (MNI -> Z-Anatomy):
  1. the landmark affine from register_mni_zanat.py (_atlas/atlas2_build/registration.json)
  2. multi-channel Thirion demons on signed-distance maps: brain outline (brainfill solid vs the closed AHRA brain),
     cerebellum, brainstem, caudate, putamen, pallidum, thalamus, hippocampus, amygdala, lateral/third/fourth ventricles,
     corpus callosum (Z-Anatomy meshes vs Allen Human Reference Atlas labels). Smooth (fluid + diffusion) so the
     template's gyri are carried along without folding.

Output: public/atlas/section.bin.gz  (gzip of a 64-byte header + uint8 voxels, x fastest) and _atlas/section/*.png checks.
Header: magic 'ASEC', u16 nx, ny, nz, pad, f32 origin xyz (m), f32 spacing (m), f32 csf, gm, wm (intensity anchors /255).

Run (repo root, low priority):  tools/.venv/Scripts/python.exe -I tools/atlas/section_volume.py [--redo]
Inputs (git-ignored): _atlas/raw/mni09b (unzip sym09b.zip), _atlas/raw/ahra, _atlas/raw/glb/s, _atlas/fill (fill.npy, gross_dq.glb).
"""
import os, sys, json, csv, gzip, struct, time
import numpy as np, nibabel as nb, trimesh
from scipy import ndimage as ndi

try:
    import psutil
    psutil.Process().nice(psutil.BELOW_NORMAL_PRIORITY_CLASS if os.name == "nt" else 10)
except Exception:
    pass

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/section"); os.makedirs(W, exist_ok=True)
REDO = "--redo" in sys.argv
T0 = time.time()
def log(*a): print(f"[{time.time()-T0:6.1f}s]", *a, flush=True)

# ---------------------------------------------------------------- MNI side
T1P = os.path.join(ROOT, "_atlas/raw/mni09b/x/mni_icbm152_nlin_sym_09b/mni_icbm152_t1_tal_nlin_sym_09b_hires.nii")
AHP = os.path.join(ROOT, "_atlas/raw/ahra/annotation_full.nii.gz")
ahra_img = nb.load(AHP); AFF = ahra_img.affine  # 0.5 mm, same grid as the T1
A = np.asarray(ahra_img.dataobj)
T1 = np.asarray(nb.load(T1P).dataobj).astype(np.float32)
assert T1.shape == A.shape
R = {int(r["id"]): r for r in csv.DictReader(open(os.path.join(ROOT, "_atlas/raw/ahra/vc.csv")))}
def under(*anc):
    """AHRA ids present in the volume whose structure path passes through any of the given acronyms/ids."""
    want = {str(x) for x in anc}
    acr = {r["acronym"]: str(i) for i, r in R.items()}
    want = {acr.get(w, w) for w in want}
    out = []
    for i in np.unique(A):
        if i == 0: continue
        p = R[int(i)]["structure_id_path"].strip("/").split("/")
        if want & set(p): out.append(int(i))
    return out

GROUPS = {
    "caudate": under("CaH", "CaB", "CaT"),
    "putamen": under("Pu", "PuPV"),
    "pallidum": under("GPe", "GPi"),
    "thalamus": under("THM"),
    "hippocampus": under("HiH", "HiB", "HiT"),
    "amygdala": under("AMY"),
    "latvent": under("LV"),
    "v3": under("3V"),
    "v4": under("4V"),
    "cc": under("cc"),
    "cerebellum": under("CBV", "CBPV", "CBL", "CbDN"),
    "brainstem": under("MGM", "MWM", "MV", "PnBa", "PnTg", "Mo", "icp"),
}
for k, v in GROUPS.items(): log(k, [R[i]["acronym"] for i in v])

def ball(r):
    g = np.mgrid[-r:r + 1, -r:r + 1, -r:r + 1]
    return (g ** 2).sum(0) <= r * r

MNI_STEP = 2  # masks on a 1 mm MNI grid
def mni_masks():
    cache = os.path.join(W, "mni_masks.npz")
    if os.path.exists(cache) and not REDO:
        z = np.load(cache); return {k: z[k] for k in z.files}
    a = A[::MNI_STEP, ::MNI_STEP, ::MNI_STEP]
    out = {}
    brain = a > 0
    brain = ndi.binary_closing(np.pad(brain, 6), ball(5))[6:-6, 6:-6, 6:-6]
    out["brain"] = ndi.binary_fill_holes(brain)
    for k, ids in GROUPS.items(): out[k] = np.isin(a, ids)
    # the cerebellum label is grey matter only: close it so its white matter (HWM) counts too
    out["cerebellum"] = ndi.binary_fill_holes(ndi.binary_closing(np.pad(out["cerebellum"], 5), ball(4))[5:-5, 5:-5, 5:-5])
    out["brainstem"] &= ~out["cerebellum"]
    np.savez_compressed(cache, **out)
    return out

# ---------------------------------------------------------------- Z-Anatomy side
FILL_LO = np.load(os.path.join(ROOT, "_atlas/fill/origin.npy")).astype(float)
FILL = np.load(os.path.join(ROOT, "_atlas/fill/fill.npy"))
FP = 0.0007
ZMESH = {
    "caudate": ["caudate-nucleus"], "putamen": ["putamen"], "pallidum": ["globus-pallidus"], "thalamus": ["thalamus"],
    "hippocampus": ["hippocampus"], "amygdala": ["amygdaloid-body"], "latvent": ["lateral-ventricle"], "v3": ["third-ventricle"],
    "v4": ["fourth-ventricle"], "cc": ["corpus-callosum"],
}
def load_mesh(name):
    sc = trimesh.load(os.path.join(ROOT, "_atlas/raw/glb/s", name + ".glb"), force="scene")
    return [g for g in sc.dump()]
def gross_meshes(names):
    sc = trimesh.load(os.path.join(ROOT, "_atlas/fill/gross_dq.glb"), force="scene")
    return [m for m in sc.dump() if (m.metadata or {}).get("name") in names]
def voxelize(meshes, close=0):
    g = np.zeros(FILL.shape, bool)
    for m in meshes:
        pts = m.voxelized(FP * 0.7).points
        i = np.round((pts - FILL_LO) / FP).astype(int)
        i = i[(i >= 0).all(1) & (i < FILL.shape).all(1)]
        g[i[:, 0], i[:, 1], i[:, 2]] = True
    if close: g = ndi.binary_closing(np.pad(g, close + 1), ball(close))[close + 1:-close - 1, close + 1:-close - 1, close + 1:-close - 1]
    return ndi.binary_fill_holes(g)
def z_masks():
    cache = os.path.join(W, "z_masks.npz")
    if os.path.exists(cache) and not REDO:
        z = np.load(cache); return {k: z[k] for k in z.files}
    idx = json.load(open(os.path.join(ROOT, "public/atlas/index.json")))["structures"]
    out = {"brain": FILL.copy()}
    for k, names in ZMESH.items():
        out[k] = voxelize([m for n in names for m in load_mesh(n)])
        log("z mask", k, int(out[k].sum()))
    out["cerebellum"] = voxelize(gross_meshes(set(idx["cerebellum"]["members"])), close=4)
    out["brainstem"] = voxelize(gross_meshes({"pons", "midbrain", "medulla-oblongata"}), close=2) & ~out["cerebellum"]
    np.savez_compressed(cache, **out)
    return out

# ---------------------------------------------------------------- registration
REG = json.load(open(os.path.join(ROOT, "_atlas/atlas2_build/registration.json")))
M_mni2z = np.array(REG["mni_mm_to_zanat_m"])  # 4x4, mm -> m
M_z2mni = np.linalg.inv(M_mni2z)

def sdf(mask, step_mm, clip=15.0):
    if not mask.any(): return np.full(mask.shape, clip, np.float32)
    d_out = ndi.distance_transform_edt(~mask) * step_mm
    d_in = ndi.distance_transform_edt(mask) * step_mm
    return np.clip(d_out - d_in, -clip, clip).astype(np.float32)

def z_grid(step_m):
    hi = FILL_LO + np.array(FILL.shape) * FP
    shape = np.ceil((hi - FILL_LO) / step_m).astype(int)
    return FILL_LO, shape

def z_points(lo, shape, step_m):
    g = np.indices(shape, dtype=np.float32).reshape(3, -1).T * step_m + lo
    return g  # (N,3) metres

def to_mni_vox(pz_m, mni_aff):
    """Z metres (N,3) -> MNI voxel indices for an MNI grid with affine mni_aff."""
    q = pz_m @ M_z2mni[:3, :3].T + M_z2mni[:3, 3]  # MNI mm
    inv = np.linalg.inv(mni_aff)
    return q @ inv[:3, :3].T + inv[:3, 3]

def resample_z_mask(mask_fill, lo, shape, step_m):
    """Nearest sample of a fill-grid mask on another Z grid."""
    p = z_points(lo, shape, step_m)
    i = np.round((p - FILL_LO) / FP).astype(int)
    ok = (i >= 0).all(1) & (i < FILL.shape).all(1)
    out = np.zeros(len(p), bool)
    out[ok] = mask_fill[i[ok, 0], i[ok, 1], i[ok, 2]]
    return out.reshape(shape)

KEYS = ["brain", "cerebellum", "brainstem", "caudate", "putamen", "pallidum", "thalamus", "hippocampus", "amygdala", "latvent", "v3", "v4", "cc"]
WEIGHT = {"brain": 2.0, "cerebellum": 1.0, "brainstem": 1.0, "latvent": 1.5, "v3": 0.7, "v4": 0.7, "cc": 1.0}

def register():
    cache = os.path.join(W, "warp.npz")
    if os.path.exists(cache) and not REDO:
        z = np.load(cache); return z["v"], float(z["step"])
    mm = mni_masks(); zm = z_masks()
    mni_aff1 = AFF.copy(); mni_aff1[:3, :3] *= MNI_STEP
    MS = {k: sdf(mm[k], 1.0) for k in KEYS}  # 1 mm grid
    v = None
    for step_mm, iters, sig_fluid, sig_diff in ((4.0, 120, 1.0, 1.5), (2.0, 120, 1.0, 1.5)):
        step = step_mm / 1000
        lo, shape = z_grid(step)
        P = z_points(lo, shape, step)
        base = to_mni_vox(P, mni_aff1).T.reshape((3,) + tuple(shape))  # MNI vox of the affine map
        # displacement v is in Z millimetres; MNI vox per Z mm: Jacobian of the affine map
        J = (np.linalg.inv(mni_aff1)[:3, :3] @ M_z2mni[:3, :3]) / 1000  # MNI vox per Z m -> per mm
        FS = {k: sdf(resample_z_mask(zm[k], lo, shape, step), step_mm) for k in KEYS}
        G = {k: np.stack(np.gradient(FS[k], step_mm)) for k in KEYS}
        if v is None: v = np.zeros((3,) + tuple(shape), np.float32)
        else: v = np.stack([ndi.zoom(c, np.array(shape) / np.array(c.shape), order=1) for c in v]).astype(np.float32)
        log(f"level {step_mm} mm grid {shape}")
        for it in range(iters):
            coords = base + np.tensordot(J, v, axes=1)
            num = np.zeros_like(v); den = np.zeros(shape, np.float32); err = 0.0
            for k in KEYS:
                w = WEIGHT.get(k, 1.0)
                Mk = ndi.map_coordinates(MS[k], coords, order=1, mode="nearest")
                d = Mk - FS[k]
                band = (np.abs(FS[k]) < 14) | (np.abs(Mk) < 14)
                d = np.where(band, d, 0)
                num += -w * d * G[k]
                den += w * ((G[k] ** 2).sum(0) + 0.25 * d * d)
                err += w * float((d[band] ** 2).mean()) if band.any() else 0
            du = num / (den + 1e-3)
            du = np.stack([ndi.gaussian_filter(c, sig_fluid) for c in du])
            v = v + du
            v = np.stack([ndi.gaussian_filter(c, sig_diff) for c in v]).astype(np.float32)
            if it % 20 == 0 or it == iters - 1: log(f"  it {it} err {err:.2f}")
        jac = np.linalg.det(np.moveaxis(np.stack([np.stack(np.gradient(v[i], step_mm)) for i in range(3)]), (0, 1), (-2, -1)) + np.eye(3))
        log(f"  jacobian min {jac.min():.3f} max {jac.max():.3f}  (<=0: {(jac <= 0).sum()})")
    np.savez_compressed(cache, v=v, step=step_mm / 1000)
    return v, step_mm / 1000

def mapping(v, vstep, lo, shape, step):
    """MNI 0.5 mm voxel coords for every point of a Z grid (lo, shape, step), through affine + warp."""
    P = z_points(lo, shape, step)
    vlo, vshape = z_grid(vstep)
    vi = ((P - vlo) / vstep).T
    disp = np.stack([ndi.map_coordinates(c, vi, order=1, mode="nearest") for c in v]).T / 1000  # Z metres
    return to_mni_vox(P + disp, AFF).T.reshape((3,) + tuple(shape))

def report(v, vstep):
    """Dice of every warped AHRA group vs the Z-Anatomy mask, before (affine) and after the warp."""
    zm = z_masks(); step = 0.001
    lo, shape = z_grid(step)
    c_after = mapping(v, vstep, lo, shape, step)
    c_before = mapping(np.zeros_like(v), vstep, lo, shape, step)
    res = {}
    labs = {nm: ndi.map_coordinates(A, c, order=0, mode="constant") for nm, c in (("affine", c_before), ("warp", c_after))}
    for k in KEYS:
        ids = GROUPS.get(k)
        zk = resample_z_mask(zm[k], lo, shape, step)
        for nm, L in labs.items():
            if ids is None: lab = ndi.binary_fill_holes(ndi.binary_closing(L > 0, ball(4)))
            else:
                lab = np.isin(L, ids)
                if k == "cerebellum": lab = ndi.binary_fill_holes(ndi.binary_closing(lab, ball(4)))
            dice = 2 * (lab & zk).sum() / max(1, lab.sum() + zk.sum())
            res.setdefault(k, {})[nm] = round(float(dice), 3)
        log(f"  {k:12s} dice affine {res[k]['affine']:.3f} -> warp {res[k]['warp']:.3f}")
    json.dump(res, open(os.path.join(W, "dice.json"), "w"), indent=1)

# ---------------------------------------------------------------- tissue volume
def tissue(v, vstep, step=0.001):
    lo, shape = z_grid(step)
    # crop to the brain solid (+2 voxels)
    fm = resample_z_mask(FILL, lo, shape, step)
    nz = np.argwhere(fm); a0 = nz.min(0) - 2; a0[1] -= 14; a1 = nz.max(0) + 3  # 1 cm more below: the medulla hangs below the fill
    lo = lo + a0 * step; shape = a1 - a0
    log("tissue grid", shape, "voxels", int(np.prod(shape)))
    c = mapping(v, vstep, lo, shape, step)
    t = ndi.map_coordinates(T1, c, order=3, mode="constant")
    lab = ndi.map_coordinates(A, c, order=0, mode="constant")
    # intensity anchors from the labels: CSF (ventricles), cortical grey matter, forebrain white matter
    def med(ids): return float(np.median(T1[np.isin(A, ids)]))
    csf = med(GROUPS["latvent"]); wm = med(under("FWM")); gm = med(under("CeG"))
    log(f"T1 anchors csf {csf:.1f} gm {gm:.1f} wm {wm:.1f}")
    # map so csf -> 30, gm -> 130, wm -> 220 (piecewise linear), keep headroom
    x = np.interp(t, [0, csf, gm, wm, wm * 1.25], [0, 30, 130, 220, 250]).astype(np.float32)
    # outside the closed AHRA brain (dura, sinus, skull) is CSF-dark
    brainA = ndi.map_coordinates(mni_masks()["brain"].astype(np.uint8), mapping_to_1mm(c), order=0, mode="constant") > 0
    x[~brainA] = np.minimum(x[~brainA], 30)
    # inside the Z-Anatomy brain solid but outside the template brain (the fill's outer rim, the lower medulla): carry the
    # nearest template tissue outward, so the cut edge is cortex (or brainstem), not a dark rim
    gap = ~brainA  # everything outside: only ever seen inside the solid, or through clamped samples at the grid edge
    if gap.any():
        _, ind = ndi.distance_transform_edt(~brainA, return_indices=True)
        x[gap] = x[tuple(i[gap] for i in ind)]
        log(f"  {int(gap.sum())} rim voxels filled from the nearest template tissue")
    # The Z-Anatomy meshes are the truth for the deep structures (their cut faces are painted from the mesh, and picked by it).
    # Where the warped template still has caudate/putamen/pallidum/thalamus grey or ventricle CSF outside the matching mesh,
    # it would show as a doubled edge or a second ventricle beside the mesh: those voxels become white matter.
    zm = z_masks()
    for g in ("caudate", "putamen", "pallidum", "thalamus", "latvent"):  # not the third ventricle: a thin midline slit the mesh only half covers
        zk = ndi.binary_dilation(resample_z_mask(zm[g], lo, shape, step), iterations=1)
        rem = np.isin(lab, GROUPS[g]) & ~zk
        x[rem] = np.maximum(x[rem], 200 if g == "latvent" else 215)
        log(f"  {g}: {int(rem.sum())} template voxels outside the mesh set to white matter")
    x = ndi.gaussian_filter(x, 0.6)
    # far outside the brain solid (never seen, only reached by clamped samples): one flat value, which also keeps the file small
    far = ndi.distance_transform_edt(~resample_z_mask(FILL, lo, shape, step)) * step > 0.004
    far[:, : int(0.012 / step), :] = False  # the band below the fill, where the medulla hangs
    x[far] = 215
    # the Z-Anatomy medulla runs lower than the template brain: there, a pale brainstem tone (mostly white matter)
    bs = ndi.binary_dilation(resample_z_mask(zm["brainstem"], lo, shape, step), iterations=2) & ~brainA
    x[bs] = 185
    log(f"  {int(bs.sum())} brainstem voxels below the template set to brainstem tone")
    vol = np.clip(np.round(x), 0, 255).astype(np.uint8)
    return vol, lo, step, lab, (30, 130, 220)

def mapping_to_1mm(c05):
    return c05 / MNI_STEP

def write(vol, lo, step, anchors):
    nx, ny, nz = vol.shape
    head = b"ASEC" + struct.pack("<4H", nx, ny, nz, 0) + struct.pack("<3f", *lo) + struct.pack("<f", step) + struct.pack("<3f", *(a / 255 for a in anchors))
    head = head.ljust(64, b"\0")
    data = head + np.ascontiguousarray(vol.transpose(2, 1, 0)).tobytes()  # x fastest
    out = os.path.join(ROOT, "public/atlas/section.bin.gz")
    with gzip.open(out, "wb", compresslevel=9) as f: f.write(data)
    log("wrote", out, os.path.getsize(out) // 1024, "KB")
    # atlas files are cached for an hour (next.config.ts): the client asks for this exact version
    import hashlib
    ver = hashlib.sha1(data).hexdigest()[:10]
    src = ("/** Content hash of public/atlas/section.bin.gz (written by tools/atlas/section_volume.py), used as a cache key. */\n"
           f'export const SECTION_VOLUME_VERSION = "{ver}";\n')
    open(os.path.join(ROOT, "src/components/atlas/section/version.ts"), "w", newline="\n").write(src)

def previews(vol, lo, step):
    from PIL import Image
    zm = z_masks()
    def sl(axis, world):
        k = int(round((world - lo[axis]) / step))
        s = np.take(vol, k, axis=axis)
        return s
    outs = {"cor_ac": (2, 0.0141), "cor_thal": (2, -0.008), "ax_thal": (1, 1.625), "sag": (0, -0.022), "mid": (0, -0.001)}
    for nm, (ax, w) in outs.items():
        s = sl(ax, w).astype(np.float32)
        img = np.stack([s] * 3, -1)
        # Z-Anatomy mesh outlines on top
        for key, col in (("caudate", (60, 120, 255)), ("putamen", (255, 80, 80)), ("pallidum", (255, 200, 0)), ("thalamus", (200, 0, 255)),
                         ("hippocampus", (0, 200, 100)), ("amygdala", (255, 0, 120)), ("latvent", (0, 220, 255)), ("v3", (0, 220, 255)),
                         ("cc", (255, 140, 0)), ("brain", (0, 255, 0))):
            m = zm[key]
            kk = int(round((w - FILL_LO[ax]) / FP))
            ms = np.take(m, kk, axis=ax)
            # fill-grid slice -> tissue grid slice
            axes = [i for i in range(3) if i != ax]
            yy, xx = np.indices(s.shape)
            wx = lo[axes[0]] + yy * step; wy = lo[axes[1]] + xx * step
            iy = np.clip(np.round((wx - FILL_LO[axes[0]]) / FP).astype(int), 0, ms.shape[0] - 1)
            ix = np.clip(np.round((wy - FILL_LO[axes[1]]) / FP).astype(int), 0, ms.shape[1] - 1)
            mm = ms[iy, ix]
            edge = mm & ~ndi.binary_erosion(mm)
            img[edge] = col
        img = np.clip(img, 0, 255).astype(np.uint8)
        # display: x axis (left=+x) on the image's ... orient so up is up
        if ax == 2: img = img.transpose(1, 0, 2)[::-1, ::-1]      # rows = y (up), cols = -x
        elif ax == 1: img = img.transpose(1, 0, 2)[::-1, ::-1]    # rows = z (anterior up)
        else: img = img.transpose(1, 0, 2)[::-1]                  # rows = y, cols = z
        Image.fromarray(img).resize((img.shape[1] * 3, img.shape[0] * 3), Image.NEAREST).save(os.path.join(W, f"chk_{nm}.png"))

if __name__ == "__main__":
    v, vstep = register()
    if "--report" in sys.argv or REDO: report(v, vstep)
    step = 0.001
    for a in sys.argv:
        if a.startswith("--step="): step = float(a.split("=")[1]) / 1000
    vol, lo, step, lab, anchors = tissue(v, vstep, step)
    write(vol, lo, step, anchors)
    previews(vol, lo, step)
    log("done")
