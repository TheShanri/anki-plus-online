"""Atlas v3: small course structures that no source labels, derived from the template and the label volume itself.

  pituitary gland      segmented on the ICBM 2009b T1 template (the same 0.5 mm grid): the intermediate-bright body in the
                       sella, between the dorsum sellae, the cavernous sinuses and the sphenoid sinus (the template shows it
                       clearly: about 14 x 11 x 7 mm, centred near MNI 0, +3, -32)
  pituitary stalk      a 1.25 mm cylinder from the lowest midline point of the tuber cinereum to the top of the gland
  lamina terminalis    the one-voxel anterior wall of the third ventricle between the optic chiasm and the anterior
                       commissure (whatever tissue forms it in the labels)
  interventricular     the passage between each lateral ventricle and the third ventricle: ventricular voxels within reach
  foramen (Monro)      of both, beside the columns of the fornix
  obex, area postrema  the caudal tip of the fourth ventricle on the dorsal medulla (obex), and the medulla's floor of the
                       ventricle just rostral to it on either side (area postrema)
  gracile / cuneate    the outer millimetre of the dorsal medulla over the gracile and cuneate nuclei
  tubercles

add(K, KI, AFF) writes them into K before the left/right split (K holds keys, not sides) and returns a report.
"""
import os
import numpy as np
import nibabel as nib
from scipy import ndimage as ndi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
T1 = os.path.join(ROOT, "_atlas/raw/mni09b/x/mni_icbm152_nlin_sym_09b/mni_icbm152_t1_tal_nlin_sym_09b_hires.nii")
VOX = 0.5


def ball(r):
    g = np.arange(-r, r + 1)
    return (g[:, None, None] ** 2 + g[None, :, None] ** 2 + g[None, None, :] ** 2) <= r * r


def add(K, KI, AFF, log=print):
    rep = {}
    shape = np.array(K.shape)

    def vox(x, y, z):
        return np.round((np.array([x, y, z], float) - AFF[:3, 3]) / VOX).astype(int)

    def box(lo, hi):
        a, b = vox(*lo), vox(*hi) + 1
        return tuple(slice(max(int(i), 0), min(int(j), int(s))) for i, j, s in zip(a, b, shape))

    def mm3(m):
        return round(float(m.sum()) * VOX ** 3, 1)

    # ---------------------------------------------------------------- pituitary gland and stalk
    if "Pit" in KI:
        T = np.asarray(nib.load(T1).dataobj, dtype=np.float32)
        B = box((-8, -6, -38), (8, 12, -25))
        sub, t = K[B], T[B]
        cand = (t > 48.0) & (sub == 0)
        lab, _ = ndi.label(cand)
        s = vox(0, 3, -32) - np.array([b.start for b in B])
        g = lab == lab[tuple(s)] if lab[tuple(s)] else np.zeros_like(cand)
        g = ndi.binary_closing(ndi.binary_opening(g, ball(1)), ball(2)) & (sub == 0)
        sub[g] = KI["Pit"]
        rep["Pit"] = mm3(g)
        del T
        if "PitS" in KI and g.any():
            # stalk: from the tuber cinereum's lowest midline point to the gland's top centre
            ij = np.argwhere(g) + [b.start for b in B]
            mni = ij * VOX + AFF[:3, 3]
            mid = np.abs(mni[:, 0]) < 1.5
            top = (mni[mid][np.argmax(mni[mid][:, 2])] if mid.any() else mni[np.argmax(mni[:, 2])]) * [0, 1, 1]
            tu = np.argwhere(np.isin(K, [KI[k] for k in ("HTtu",) if k in KI]))
            tm = tu * VOX + AFF[:3, 3]
            tm = tm[np.abs(tm[:, 0]) < 1.5]
            if len(tm):
                bot = tm[np.argmin(tm[:, 2])] * [0, 1, 1]  # both ends on the midline
                B2 = box(np.minimum(top, bot) - 3, np.maximum(top, bot) + 3)
                sub2 = K[B2]
                P = (np.indices(sub2.shape).reshape(3, -1).T + [b.start for b in B2]) * VOX + AFF[:3, 3]
                d = bot - top
                tt = np.clip(((P - top) @ d) / (d @ d), 0, 1)
                r = np.linalg.norm(P - (top + tt[:, None] * d), axis=1)
                stalk = (r <= 1.25).reshape(sub2.shape) & np.isin(sub2, [0] + [KI[k] for k in ("V3",) if k in KI])
                sub2[stalk] = KI["PitS"]
                rep["PitS"] = mm3(stalk)

    # ---------------------------------------------------------------- lamina terminalis
    if "LT" in KI and all(k in KI for k in ("V3", "OCh", "AC")):
        v3 = K == KI["V3"]
        och = np.argwhere(K == KI["OCh"]) * VOX + AFF[:3, 3]
        ac = np.argwhere(K == KI["AC"]) * VOX + AFF[:3, 3]
        ac = ac[np.abs(ac[:, 0]) < 2]
        z0, z1 = och[:, 2].max() - 1.0, ac[:, 2].min() + 0.5
        B = box((-2, -20, z0), (2, 20, z1))
        sub, vv = K[B], v3[B]
        # the first voxel in front (+y) of the ventricle's foremost voxel, in every (x, z) column
        lt = np.zeros_like(vv)
        has = vv.any(axis=1)
        last = vv.shape[1] - 1 - np.argmax(vv[:, ::-1, :], axis=1)  # the foremost ventricle voxel per column
        ii, kk = np.nonzero(has)
        jj = last[ii, kk] + 1
        ok = jj < vv.shape[1]
        lt[ii[ok], jj[ok], kk[ok]] = True
        lt &= ~np.isin(sub, [KI[k] for k in ("OCh", "AC", "V3") if k in KI])
        # the anterior wall only: within 2.5 mm of the foremost front at each height (not the side walls of a narrow
        # ventricle, whose fronts lie further back)
        for k in range(lt.shape[2]):
            jj = np.nonzero(lt[:, :, k].any(axis=0))[0]
            if len(jj):
                lt[:, : max(0, jj.max() - 5), k] = False
        sub[lt] = KI["LT"]
        rep["LT"] = mm3(lt)

    # ---------------------------------------------------------------- interventricular foramina (Monro)
    if "IVF" in KI and "V3" in KI:
        lv = np.isin(K, [KI[k] for k in ("aLV", "bLV") if k in KI])
        v3 = K == KI["V3"]
        B = box((-10, -15, -5), (10, 15, 25))
        sub, l, v = K[B], lv[B], v3[B]
        dl = ndi.distance_transform_edt(~l, sampling=VOX)
        dv = ndi.distance_transform_edt(~v, sampling=VOX)
        xs_ = (np.arange(sub.shape[0]) + B[0].start) * VOX + AFF[0, 3]
        lateral = (np.abs(xs_) >= 1.5)[:, None, None]  # one foramen each side, apart across the midline
        ivf = (l | v) & (dl <= 1.5) & (dv <= 1.5) & lateral
        ivf = ndi.binary_dilation(ivf, ball(2)) & (l | v) & lateral
        sub[ivf] = KI["IVF"]
        rep["IVF"] = mm3(ivf)

    # ---------------------------------------------------------------- obex, area postrema, tubercles (dorsal medulla)
    med = [KI[k] for k in ("MoTg", "BSW", "Gr", "Cu", "DMX", "Sol", "XII") if k in KI]
    if "V4" in KI:
        v4 = np.argwhere(K == KI["V4"]) * VOX + AFF[:3, 3]
        v4m = v4[np.abs(v4[:, 0]) < 1.5]
        if len(v4m):
            ob = v4m[np.argmin(v4m[:, 2])]  # the caudal tip of the ventricle on the midline
            B = box(ob - 8, ob + 8)
            sub = K[B]
            P = (np.indices(sub.shape).reshape(3, -1).T + [b.start for b in B]) * VOX + AFF[:3, 3]
            near4 = ndi.binary_dilation(sub == KI["V4"], ball(2)) | ndi.binary_dilation(sub == 0, ball(2))
            if "Obex" in KI:
                o = (np.linalg.norm(P - ob, axis=1) <= 1.75).reshape(sub.shape) & np.isin(sub, med) & near4
                sub[o] = KI["Obex"]
                rep["Obex"] = mm3(o)
            if "AP" in KI:
                rel = P - ob
                a = ((rel[:, 2] >= 0.5) & (rel[:, 2] <= 5.0) & (np.abs(rel[:, 0]) >= 0.5) & (np.abs(rel[:, 0]) <= 3.5)).reshape(sub.shape)
                ap = a & np.isin(sub, med) & ndi.binary_dilation(sub == KI["V4"], ball(2))
                sub[ap] = KI["AP"]
                rep["AP"] = mm3(ap)
    for nuc, key in (("Gr", "GrT"), ("Cu", "CuT")):
        if key in KI and nuc in KI:
            n = K == KI[nuc]
            if not n.any():
                continue
            ij = np.argwhere(n)
            B = tuple(slice(max(int(a) - 6, 0), min(int(b) + 7, int(s))) for a, b, s in zip(ij.min(0), ij.max(0), shape))
            sub = K[B]
            outside = ndi.binary_dilation(sub == 0, ball(2))
            over = ndi.binary_dilation(sub == KI[nuc], ball(4))
            tub = outside & over & np.isin(sub, [KI[k] for k in ("MoTg", "BSW", nuc) if k in KI])
            sub[tub] = KI[key]
            rep[key] = mm3(tub)
    log("extras (mm3):", rep)
    return rep
