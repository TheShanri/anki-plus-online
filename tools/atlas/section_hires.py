"""Crisp section faces: a 0.5 mm tissue field for the Explore atlas cuts (replaces the 1 mm intensity volume).

Source: the ICBM 2009b nonlinear symmetric template (0.5 mm T1, T2 and PD; McGill licence, see COPYING) and the Allen Human
Reference Atlas 3D labels (CC BY 4.0, same 0.5 mm grid). No 2009b tissue maps are published, so the three contrasts are
classified here into CSF / grey / white matter posteriors (a 3-class Gaussian mixture seeded from the Allen labels: lateral
ventricle, cortex, forebrain white matter), checked against the official 1 mm ICBM 2009c tissue probability maps.

Field: s = 0.5 * p(grey) + p(white), so the CSF|grey boundary is the s = 0.25 contour and grey|white the s = 0.75 contour. The
shader thresholds it with fwidth anti-aliasing on a tricubic sample, so every border is a sharp line at any zoom.

Aux (1 mm, RGBA): R fixed-brain tone for labelled brainstem/diencephalon parts (0 grey .. 1 white), G its weight, B the
midline-section mask (where a midsagittal cut is a true section), A the interhemispheric fissure (CSF the plane passes
through without cutting tissue: a near-midline sagittal cut shows the medial surface beyond it there).

Registration into the Z-Anatomy mesh space: the warp of section_volume.py (landmark affine + demons, _atlas/section/warp_fine.npz).

Output: public/atlas/section.bin.gz = gzip( 64-byte header + field uint8 (x fastest) + aux RGBA uint8 (x fastest) ).
Header: 'ASE2', u16 nx ny nz (field), u16 ax ay az (aux), f32 corner xyz (m, grid box corner), f32 field step, f32 aux step.

Run (repo root, low priority): tools/.venv/Scripts/python.exe -I tools/atlas/section_hires.py [--redo]
Inputs (git-ignored): _atlas/src_vol/mni09b (T2, PD from sym09b.zip), _atlas/raw/mni09b (T1), _atlas/raw/ahra, _atlas/section/*.npz
"""
import os, sys, gzip, struct, hashlib, json

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np, nibabel as nb  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402
REPACK = "--repack" in sys.argv
if REPACK:  # re-encode only: no template, labels or registration needed
    import time as _t
    _T0 = _t.time()
    ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
    W = os.path.join(ROOT, "_atlas/section")
    def log(*a): print(f"[{_t.time() - _T0:6.1f}s]", *a, flush=True)
else:
    import section_volume as sv  # noqa: E402  (loads the T1 and the Allen labels, registration helpers)
    ROOT, W, log = sv.ROOT, sv.W, sv.log

if not REPACK:
    # sv.under() runs np.unique over the whole 0.5 mm label volume on every call: memoise it (label_tones calls it per row)
    _U = [int(i) for i in np.unique(sv.A) if i]
    def _under(*anc):
        want = {str(x) for x in anc}
        acr = {r["acronym"]: str(i) for i, r in sv.R.items()}
        want = {acr.get(w, w) for w in want}
        return [i for i in _U if want & set(sv.R[i]["structure_id_path"].strip("/").split("/"))]
    sv.under = _under
SRC = os.path.join(ROOT, "_atlas/src_vol/mni09b")
REDO = "--redo" in sys.argv
FSTEP = 0.0005  # field 0.5 mm
ASTEP = 0.001   # aux 1 mm


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


# ---------------------------------------------------------------- stage 1: tissue classes in MNI space (0.5 mm)
def classify():
    cache = os.path.join(W, "hires_mni.npz")
    if os.path.exists(cache) and not REDO:
        z = np.load(cache)
        return z["s"].astype(np.float32), z["pc"].astype(np.float32), tuple(int(i) for i in z["o"])
    A = sv.A
    mm = sv.mni_masks()
    # 1 mm brain / cerebellum masks to the 0.5 mm grid
    def up(m):
        u = np.repeat(np.repeat(np.repeat(m, 2, 0), 2, 1), 2, 2)
        return u[: A.shape[0], : A.shape[1], : A.shape[2]]
    brain = up(mm["brain"])
    ax = [np.flatnonzero(brain.any(axis=tuple(j for j in range(3) if j != i))) for i in range(3)]
    o = [max(0, a[0] - 8) for a in ax]
    e = [min(A.shape[i], ax[i][-1] + 9) for i in range(3)]
    sl = tuple(slice(o[i], e[i]) for i in range(3))
    log("MNI crop", o, e)
    brain = np.ascontiguousarray(brain[sl])
    cb = np.ascontiguousarray(up(mm["cerebellum"])[sl])
    lab = np.ascontiguousarray(A[sl])
    t1 = np.ascontiguousarray(sv.T1[sl])
    t2 = np.asarray(nb.load(os.path.join(SRC, "mni_icbm152_t2_tal_nlin_sym_09b_hires.nii")).dataobj[sl]).astype(np.float32)
    pd = np.asarray(nb.load(os.path.join(SRC, "mni_icbm152_pd_tal_nlin_sym_09b_hires.nii")).dataobj[sl]).astype(np.float32)
    feats = [t1, t2, pd]
    ids_csf = sv.GROUPS["latvent"]; ids_gm = sv.under("CeG"); ids_wm = sv.under("FWM")
    seeds = [np.isin(lab, ids_csf), np.isin(lab, ids_gm), np.isin(lab, ids_wm)]
    # robust scale per feature (seed medians) so the mixture works in comparable units
    for f in feats:
        lo_, hi_ = np.percentile(f[brain][::50], [1, 99])
        f -= lo_; f /= (hi_ - lo_)
    # one contrast that orders the three tissues (T1 up, T2 down): CSF < grey < white. The field is linear in it between the
    # label medians, so s = 0.25 / 0.75 are the 50 % partial-volume points between CSF and grey, grey and white.
    c = feats[0] - feats[1]
    mC, mG, mW = (float(np.median(c[s_][::3])) for s_ in seeds)
    log(f"contrast medians csf {mC:.3f} grey {mG:.3f} white {mW:.3f}")
    s = np.interp(c, [mC, mG, mW], [0.0, 0.5, 1.0]).astype(np.float32)
    del c, feats, t2, pd
    # cerebellum: the folia's white core is only a little brighter than their cortex in the averaged template, so grey/white
    # is decided on the local T1 contrast (3 mm neighbourhood); the CSF|grey part of the field is kept
    t1n = np.interp(t1, [0, float(np.median(t1[seeds[0]])), float(np.median(t1[seeds[1]])), float(np.median(t1[seeds[2]]))], [0, 30, 130, 220]).astype(np.float32)
    cbf = cb.astype(np.float32)
    m = ndi.gaussian_filter(t1n * cbf, 6) / np.maximum(ndi.gaussian_filter(cbf, 6), 1e-3)
    wl = np.clip(0.5 + (t1n - m - 7.0) / 8.0, 0, 1)
    s = np.where(cb & (s >= 0.5), 0.5 + 0.5 * wl, s).astype(np.float32)
    del m, wl, cbf, t1n
    # outside the closed Allen brain (dura, sinuses): carry the nearest template tissue outward, so a cut edge inside the
    # Z-Anatomy brain solid is cortex, not a dark rim (as in section_volume.py)
    ind = ndi.distance_transform_edt(~brain, return_distances=False, return_indices=True)
    s = s[tuple(ind)]
    del ind
    pc = (s < 0.25).astype(np.float32)
    validate(s, o, brain)
    try:  # quick look: coronal, axial and near-midline sagittal slices of the classified field, MNI space
        from PIL import Image
        for nm, ax_, mmv in (("cor", 1, 0.0), ("ax", 2, 8.0), ("sag", 0, -5.0)):
            k = int(round((mmv - sv.AFF[ax_, 3]) / 0.5)) - o[ax_]
            sl2 = np.take(s, k, axis=ax_)
            img = np.where(sl2 < 0.25, 40, np.where(sl2 < 0.75, 140, 235)).astype(np.uint8)
            Image.fromarray(img.T[::-1]).save(os.path.join(W, f"hires_mni_{nm}.png"))
    except Exception as ex:
        log("preview skipped", ex)
    np.savez_compressed(cache, s=s.astype(np.float16), pc=pc.astype(np.float16), o=np.array(o))
    return s, pc, tuple(o)


def validate(s, o, brain):
    """Hard labels of the 0.5 mm classes, block-averaged to 1 mm, against the official ICBM 2009c 1 mm tissue maps."""
    try:
        d = os.path.join(ROOT, "_atlas/src_vol/tf2009cSym")
        ref = [np.asarray(nb.load(os.path.join(d, f"tpl-MNI152NLin2009cSym_res-1_label-{k}_probseg.nii.gz")).dataobj).astype(np.float32) for k in ("CSF", "GM", "WM")]
        raff = nb.load(os.path.join(d, "tpl-MNI152NLin2009cSym_res-1_label-GM_probseg.nii.gz")).affine
        # our crop voxel centres (2x2x2 blocks) in the 2009c voxel grid
        n = [k // 2 for k in s.shape]
        def blk(p): return p[: 2 * n[0], : 2 * n[1], : 2 * n[2]].reshape(n[0], 2, n[1], 2, n[2], 2).mean((1, 3, 5))
        ours = np.stack([blk(p.astype(np.float32)) for p in (s < 0.25, (s >= 0.25) & (s < 0.75), s >= 0.75)])
        bm = blk(brain.astype(np.float32)) > 0.5
        g = np.indices(n).reshape(3, -1).astype(np.float64)
        vox05 = 2 * g + 0.5 + np.array(o)[:, None]
        mm_ = sv.AFF[:3, :3] @ vox05 + sv.AFF[:3, 3:4]
        rv = np.linalg.inv(raff)[:3, :3] @ mm_ + np.linalg.inv(raff)[:3, 3:4]
        rs = np.stack([ndi.map_coordinates(r, rv, order=1).reshape(n) for r in ref])
        a = ours.argmax(0)[bm]; b = rs.argmax(0)[bm]
        out = {}
        for k, nm in enumerate(("csf", "grey", "white")):
            out[nm] = round(float(2 * ((a == k) & (b == k)).sum() / max(1, (a == k).sum() + (b == k).sum())), 3)
        out["agreement"] = round(float((a == b).mean()), 3)
        log("vs ICBM 2009c tissue maps (1 mm):", out)
        json.dump(out, open(os.path.join(W, "hires_vs_2009c.json"), "w"), indent=1)
    except Exception as ex:  # validation only
        log("validation skipped:", ex)


# ---------------------------------------------------------------- grids in Z-Anatomy space
def grids():
    lo, shape = sv.z_grid(ASTEP)
    fm = sv.resample_z_mask(sv.FILL, lo, shape, ASTEP)
    nz = np.argwhere(fm); a0 = nz.min(0) - 2; a0[1] -= 14; a1 = nz.max(0) + 3
    lo1 = lo + a0 * ASTEP; shape1 = a1 - a0           # 1 mm voxel centres
    corner = lo1 - ASTEP / 2
    shape05 = shape1 * 2
    lo05 = corner + FSTEP / 2
    return corner, lo1, shape1, lo05, shape05


def fill_grid_float(mask, sigma=0.8):
    return ndi.gaussian_filter(mask.astype(np.float32), sigma)


def sample_fill(f, lo, shape, step, order=1):
    p = sv.z_points(lo, shape, step)
    i = ((p - sv.FILL_LO) / sv.FP).T
    return ndi.map_coordinates(f, i, order=order, mode="constant").reshape(shape).astype(np.float32)


# ---------------------------------------------------------------- stage 2: the 0.5 mm field in Z space
def field(s_mni, o, v, vstep, lo05, shape05):
    coef = ndi.spline_filter(s_mni, order=3, output=np.float32)
    zm = sv.z_masks()
    # mesh truths on the 0.7 mm fill grid, smoothed so the 0.5 mm sample has no staircase
    NUC = ("caudate", "putamen", "pallidum", "thalamus", "latvent")
    nuc_d = {g: ndi.binary_dilation(zm[g], iterations=2) for g in NUC}  # ~1.4 mm: the mesh's own cut face covers the rest
    csf_f = fill_grid_float(zm["aq"] | zm["v4"])
    bs_f = fill_grid_float(zm["brainstem"] & ~zm["cerebellum"])
    brain1 = sv.mni_masks()["brain"].astype(np.float32)
    aq_ids = sv.under("Aq")  # under() scans the whole label volume: once, not per slab
    out = np.empty(tuple(shape05), np.float32)
    CH = 16
    for x0 in range(0, shape05[0], CH):
        n = min(CH, shape05[0] - x0)
        lo_s = lo05 + np.array([x0 * FSTEP, 0, 0]); sh = np.array([n, shape05[1], shape05[2]])
        c = sv.mapping(v, vstep, lo_s, sh, FSTEP)  # MNI 0.5 mm voxel coords
        s = ndi.map_coordinates(coef, c - np.array(o)[:, None, None, None], order=3, prefilter=False, mode="nearest").astype(np.float32)
        lab = ndi.map_coordinates(sv.A, c, order=0, mode="constant")
        brainA = ndi.map_coordinates(brain1, c / 2, order=1, mode="constant") > 0.5
        # template nuclei / lateral ventricle outside the matching mesh: white matter (the mesh is the truth there)
        for g in NUC:
            zk = sv.resample_z_mask(nuc_d[g], lo_s, sh, FSTEP)
            rem = np.isin(lab, sv.GROUPS[g]) & ~zk
            s[rem] = 1.0
        # aqueduct and fourth ventricle from the meshes (the Allen aqueduct lands off the mesh one)
        k = np.clip((sample_fill(csf_f, lo_s, sh, FSTEP) - 0.3) / 0.4, 0, 1)
        s *= 1 - k
        stray = np.isin(lab, aq_ids) & (k < 0.05)
        s[stray] = np.maximum(s[stray], 0.6)
        # the Z-Anatomy medulla hangs below the template brain: tissue there
        bsm = (sample_fill(bs_f, lo_s, sh, FSTEP) > 0.5) & ~brainA
        s[bsm] = np.maximum(s[bsm], 0.6)
        out[x0:x0 + n] = s
        if x0 % 64 == 0: log(f"  field slab {x0}/{shape05[0]}")
    del coef
    # a light smoothing (0.25 mm) takes the 0.5 mm label staircase off the forced edges; the tissue contours are already smooth
    out = ndi.gaussian_filter(out, 0.5, output=np.float32)
    return out


# ---------------------------------------------------------------- stage 3: 1 mm aux (label tones, midline mask, fissure)
def aux(pc_mni, o, v, vstep, lo1, shape1):
    c = sv.mapping(v, vstep, lo1, shape1, ASTEP)
    t = ndi.map_coordinates(sv.T1, c, order=3, mode="constant")
    lab = ndi.map_coordinates(sv.A, c, order=0, mode="constant")
    def med(ids): return float(np.median(sv.T1[np.isin(sv.A, ids)]))
    csf = med(sv.GROUPS["latvent"]); wm = med(sv.under("FWM")); gm = med(sv.under("CeG"))
    x = np.interp(t, [0, csf, gm, wm, wm * 1.25], [0, 30, 130, 220, 250]).astype(np.float32)
    x = sv.label_tones(x, lab, ASTEP)
    x = sv.mesh_truths(x, lab, lo1, shape1, ASTEP)
    u = np.clip((x - 130) / 90, 0, 1)
    zm = sv.z_masks()
    w = np.zeros(tuple(shape1), np.float32)
    bs = sv.resample_z_mask(zm["brainstem"], lo1, shape1, ASTEP) & ~sv.resample_z_mask(zm["cerebellum"], lo1, shape1, ASTEP)
    w[bs] = 1.0
    for acrs, _tone, wgt in sv.LABEL_TONES:
        if "Aq" in acrs: continue  # CSF spaces are in the field
        m = np.isin(lab, sv.under(*acrs))
        w[m] = np.maximum(w[m], wgt)
    w = np.clip(ndi.gaussian_filter(w, 0.7), 0, 1)
    mid = sv.midline_mask(lo1, shape1, ASTEP)
    # interhemispheric fissure: CSF within 6 mm of the midline that is not a ventricle (MNI x from the template affine)
    lab05 = sv.A[o[0]:o[0] + pc_mni.shape[0], o[1]:o[1] + pc_mni.shape[1], o[2]:o[2] + pc_mni.shape[2]]
    vent = ndi.binary_dilation(np.isin(lab05, sv.GROUPS["latvent"] + sv.GROUPS["v3"] + sv.GROUPS["v4"] + sv.GROUPS["aq"]), iterations=6)
    xmm = (np.arange(pc_mni.shape[0]) + o[0]) * sv.AFF[0, 0] + sv.AFF[0, 3]
    near = (np.abs(xmm) < 6.0)[:, None, None]
    fis = ((pc_mni > 0.5) & ~vent & near).astype(np.float32)
    del vent, lab05
    fis = ndi.gaussian_filter(fis, 0.7)
    fz = ndi.map_coordinates(fis, c - np.array(o)[:, None, None, None], order=1, mode="constant")
    del fis
    to8 = lambda a: np.clip(np.round(a * 255), 0, 255).astype(np.uint8)  # noqa: E731
    return np.stack([to8(u), to8(w), mid, to8(fz)], -1)


def band(f8, corner):
    """Only the field near its two contours (s = 0.25, 0.75) matters to the shader: further away it is flattened to the class
    plateau (0, 0.5, 1). A band of +-0.075 (about one voxel each side) keeps the contours through the tricubic filter. More than
    3 mm outside the brain solid (never on a section face, except the band below it where the medulla hangs) is one flat value."""
    out = f8.copy()
    out[f8 <= 45] = 0
    out[(f8 >= 83) & (f8 <= 172)] = 128
    out[f8 >= 210] = 255
    fill = np.load(os.path.join(ROOT, "_atlas/fill/fill.npy")); lo = np.load(os.path.join(ROOT, "_atlas/fill/origin.npy")).astype(float); fp = 0.0007
    g = [corner[i] + (np.arange(n) + 0.5) * FSTEP for i, n in enumerate(f8.shape)]
    ii = [np.clip(np.round((g[i] - lo[i]) / fp).astype(int), 0, fill.shape[i] - 1) for i in range(3)]
    ok = [((g[i] - lo[i]) / fp >= -0.5) & ((g[i] - lo[i]) / fp <= fill.shape[i] - 0.5) for i in range(3)]
    fm = fill[np.ix_(*ii)] & ok[0][:, None, None] & ok[1][None, :, None] & ok[2][None, None, :]
    far = ndi.distance_transform_edt(~fm) * FSTEP > 0.003
    far[:, : int(0.007 / FSTEP), :] = False
    out[far] = 128
    return out


def clean_aux(ax):
    """Tone (R) only where it has weight (G); masks below 2/255 are zero. The tone is smoothed (1.5 mm, weighted by G) so the
    brainstem reads as regions (tegmentum, basilar pons, pyramids, colliculi), not as the 1 mm ripples of the pontine
    striation pattern, which look like rings on a sagittal cut."""
    ax = ax.copy()
    r = ax[..., 0].astype(np.float32) / 255; g = ax[..., 1].astype(np.float32) / 255
    rs = ndi.gaussian_filter(r * g, 1.5) / np.maximum(ndi.gaussian_filter(g, 1.5), 1e-3)
    ax[..., 0] = np.clip(np.round(rs * 255), 0, 255).astype(np.uint8)
    ax[..., 0][ax[..., 1] < 2] = 0
    for c in (1, 2, 3): ax[..., c][ax[..., c] < 2] = 0
    return ax


def repack():
    """Re-encode the written file with the banding / aux cleanup (no rebuild)."""
    p = os.path.join(W, "section_hires_raw.bin.gz")  # the build's own output, kept before any repack
    raw = gzip.open(p).read()
    nx, ny, nz, ax_, ay, az = struct.unpack("<6H", raw[4:16])
    corner = struct.unpack("<3f", raw[16:28])
    nf = nx * ny * nz
    f8 = np.frombuffer(raw, np.uint8, nf, 64).reshape(nz, ny, nx).transpose(2, 1, 0)
    ax = np.frombuffer(raw, np.uint8, ax_ * ay * az * 4, 64 + nf).reshape(az, ay, ax_, 4).transpose(2, 1, 0, 3)
    write(f8.astype(np.float32) / 255, ax, corner)


def write(fld, ax, corner):
    f8 = np.clip(np.round(fld * 255), 0, 255).astype(np.uint8)
    if not REPACK:  # keep the unbanded build output, so the encoding can be re-tuned with --repack without a rebuild
        nx, ny, nz = f8.shape; ax_, ay, az, _ = ax.shape
        head = (b"ASE2" + struct.pack("<6H", nx, ny, nz, ax_, ay, az) + struct.pack("<3f", *corner) + struct.pack("<2f", FSTEP, ASTEP)).ljust(64, b"\0")
        with gzip.open(os.path.join(W, "section_hires_raw.bin.gz"), "wb", compresslevel=1) as f:
            f.write(head + np.ascontiguousarray(f8.transpose(2, 1, 0)).tobytes() + np.ascontiguousarray(ax.transpose(2, 1, 0, 3)).tobytes())
    f8 = band(f8, corner)
    ax = clean_aux(ax)
    nx, ny, nz = f8.shape; ax_, ay, az, _ = ax.shape
    head = b"ASE2" + struct.pack("<6H", nx, ny, nz, ax_, ay, az) + struct.pack("<3f", *corner) + struct.pack("<2f", FSTEP, ASTEP)
    head = head.ljust(64, b"\0")
    data = head + np.ascontiguousarray(f8.transpose(2, 1, 0)).tobytes() + np.ascontiguousarray(ax.transpose(2, 1, 0, 3)).tobytes()
    out = os.path.join(ROOT, "public/atlas/section.bin.gz")
    with gzip.open(out, "wb", compresslevel=9) as f: f.write(data)
    log("wrote", out, os.path.getsize(out) // 1024, "KB;", "field", f8.shape, "aux", ax.shape, "raw", len(data) // 1024, "KB")
    ver = hashlib.sha1(data).hexdigest()[:10]
    src = ("/** Content hash of public/atlas/section.bin.gz (written by tools/atlas/section_hires.py), used as a cache key. */\n"
           f'export const SECTION_VOLUME_VERSION = "{ver}";\n')
    open(os.path.join(ROOT, "src/components/atlas/section/version.ts"), "w", newline="\n").write(src)
    return f8


def previews(f8, ax, lo05):
    """Classified slices (CSF dark, grey mid, white light; crisp at 0.5 mm) with the Z-Anatomy mesh outlines."""
    from PIL import Image
    zm = sv.z_masks()
    outs = {"cor_ac": (2, 0.0141), "cor_thal": (2, -0.008), "ax_thal": (1, 1.625), "sag": (0, -0.022), "near_mid": (0, -0.005), "mid": (0, -0.001)}
    for nm, (axis, wv) in outs.items():
        k = int(round((wv - lo05[axis]) / FSTEP))
        s = np.take(f8, k, axis=axis).astype(np.float32) / 255
        tone = np.where(s < 0.25, 40, np.where(s < 0.75, 140, 235)).astype(np.float32)
        img = np.stack([tone] * 3, -1)
        axes = [i for i in range(3) if i != axis]
        kk = int(round((wv - sv.FILL_LO[axis]) / sv.FP))
        yy, xx = np.indices(s.shape)
        wx = lo05[axes[0]] + yy * FSTEP; wy = lo05[axes[1]] + xx * FSTEP
        for key, col in (("caudate", (60, 120, 255)), ("putamen", (255, 80, 80)), ("pallidum", (255, 200, 0)), ("thalamus", (200, 0, 255)),
                         ("hippocampus", (0, 200, 100)), ("amygdala", (255, 0, 120)), ("latvent", (0, 220, 255)), ("v3", (0, 220, 255)),
                         ("cc", (255, 140, 0)), ("brain", (0, 255, 0))):
            ms = np.take(zm[key], kk, axis=axis)
            iy = np.clip(np.round((wx - sv.FILL_LO[axes[0]]) / sv.FP).astype(int), 0, ms.shape[0] - 1)
            ix = np.clip(np.round((wy - sv.FILL_LO[axes[1]]) / sv.FP).astype(int), 0, ms.shape[1] - 1)
            mm = ms[iy, ix]
            img[mm & ~ndi.binary_erosion(mm)] = col
        img = np.clip(img, 0, 255).astype(np.uint8)
        img = img.transpose(1, 0, 2)[::-1, ::-1] if axis != 0 else img.transpose(1, 0, 2)[::-1]
        Image.fromarray(img).resize((img.shape[1] * 2, img.shape[0] * 2), Image.NEAREST).save(os.path.join(W, f"hires_{nm}.png"))


if __name__ == "__main__":
    if "--repack" in sys.argv:
        repack(); sys.exit(0)
    v, vstep = sv.register()
    s_mni, pc_mni, o = classify()
    corner, lo1, shape1, lo05, shape05 = grids()
    log("field grid", shape05.tolist(), "aux grid", shape1.tolist())
    ax = aux(pc_mni, o, v, vstep, lo1, shape1)
    fld = field(s_mni, o, v, vstep, lo05, shape05)
    del s_mni, pc_mni
    f8 = write(fld, ax, corner)
    previews(f8, ax, lo05)
    log("done")
