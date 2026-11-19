"""Re-smooth the borders of the labelled interior (public/atlas/interior.bin.gz) in place, without the full warp pipeline.

interior_labels.py smooths every label's indicator with sigma = 0.6 voxel: borders then follow the 0.5 mm voxel staircase,
which shows as jagged steps when the Explore cut is zoomed. This pass re-smooths with a per-label sigma: 1.3 voxel for
every label that keeps its volume and its connected shape at that width (smooth, round borders, sub-voxel), falling back
to 0.9 and then the original 0.6 for thin structures (fornix, septum, aqueduct, small nuclei) that a wide filter would erode.
Rows in interior.json keep their indices; only the volume, the version hash and interior-version.ts change.
   usage: python -I tools/atlas/interior_smooth.py <repo root>
"""
import gzip, hashlib, json, os, struct, sys
import numpy as np
from scipy import ndimage as ndi

root = sys.argv[1]
src = f"{root}/public/atlas/interior.bin.gz"
raw = gzip.open(src, "rb").read()
assert raw[:4] == b"AIL1"
nx, ny, nz = struct.unpack_from("<3H", raw, 4)
head = raw[:64]
vol = np.frombuffer(raw, np.uint8, nx * ny * nz * 2, 64).reshape(nz, ny, nx, 2)
lab = vol[..., 0].copy()
del vol, raw

SIGMAS = (1.3, 0.9, 0.6)


def smooth(lab, sig_of):
    best = np.zeros(lab.shape, np.float32); second = np.zeros(lab.shape, np.float32); win = np.zeros(lab.shape, np.uint8)
    pad = 6
    for k in np.unique(lab):
        s = sig_of.get(int(k), SIGMAS[0])
        if k == 0:
            sl = tuple(slice(0, n) for n in lab.shape)
        else:
            nz_ = np.argwhere(lab == k)
            a0 = np.maximum(nz_.min(0) - pad, 0); a1 = np.minimum(nz_.max(0) + pad + 1, lab.shape)
            sl = tuple(slice(a, b) for a, b in zip(a0, a1))
        g = ndi.gaussian_filter((lab[sl] == k).astype(np.float32), s)
        b = best[sl]; sc = second[sl]; w = win[sl]
        up = g > b
        sc[up] = b[up]; sc[~up] = np.maximum(sc[~up], g[~up])
        b[up] = g[up]; w[up] = k
    return win, np.clip(best - second, 0, 1)


ids = [int(k) for k in np.unique(lab)]
count = {k: int((lab == k).sum()) for k in ids}
ncomp = {k: ndi.label(lab == k)[1] for k in ids if k}
sig = {k: SIGMAS[0] for k in ids}
for rnd in range(len(SIGMAS)):
    win, m = smooth(lab, sig)
    bad = []
    for k in ids:
        if k == 0: continue
        wk = win == k
        kept = int(wk.sum()) / max(count[k], 1)
        # thin or small: the wider filter erodes it (volume) or breaks it apart (a thin sheet or tube splits)
        if kept < 0.9 or ndi.label(wk)[1] > ncomp[k] + 1:
            bad.append(k)
    print(f"round {rnd}: {len(bad)} labels need a narrower filter")
    nxt = [k for k in bad if sig[k] != SIGMAS[-1]]
    if not nxt: break
    for k in nxt:
        sig[k] = SIGMAS[min(SIGMAS.index(sig[k]) + 1, len(SIGMAS) - 1)]

# the margin only places the border inside a voxel cell: steps of 6/255 and flat deep values keep the file small
m8 = np.clip(np.round(m * 255 / 6) * 6, 0, 255).astype(np.uint8)
m8[m * 255 > 150] = 255
data = head + np.ascontiguousarray(np.stack([win, m8], -1)).tobytes()
with gzip.open(src, "wb", compresslevel=9) as f: f.write(data)
ver = hashlib.sha1(data).hexdigest()[:10]
jp = f"{root}/public/atlas/interior.json"
meta = json.load(open(jp, encoding="utf8"))
meta["version"] = ver
json.dump(meta, open(jp, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
open(f"{root}/src/components/atlas/section/interior-version.ts", "w", newline="\n").write(
    "/** Content hash of public/atlas/interior.bin.gz (written by tools/atlas/interior_labels.py), used as a cache key. */\n"
    f'export const INTERIOR_VERSION = "{ver}";\n')
narrow = {s: sum(1 for k in sig if k and sig[k] == s) for s in SIGMAS}
print("sigma per label:", narrow, "version", ver, "size", os.path.getsize(src) // 1024, "KB")
