"""Atlas v3: tracts as fibres, for the course tracts no label can hold (they run through other structures and overlap).

Sources:
  HCP-842 "Advanced atlas of 80 bundles" (Yeh 2018, CC BY 4.0): population tractography in MNI space, the same space as
  the atlas, so its streamlines need no warp. A few dozen streamlines per bundle, spread over its extent.
  The course's Pathway tracer (public/pathways/v3/*.json, re-hosted onto the v3 anatomy by tools/pathways/v3/rehost.py):
  the pathway's own course through the brain, one line per side, carried from the tracer's frame into MNI space by
  zmap.frame_to_mni (approximate, a few mm).

Writes public/atlas3/fibres/<course-slug>.json: {"src", "credit", "lines": [[x0, y0, z0, x1, ...], ...]} in v3 world
metres (X = patient's left, Y = up, Z = anterior), and public/atlas3/fibres/index.json (the slugs).
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/fibres.py
"""
import os, sys, json, glob
import numpy as np
import nibabel as nib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zmap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HCP = os.path.join(ROOT, "_atlas/raw/hcp80/x/Atlas_80_Bundles/bundles")
PW = os.path.join(ROOT, "public/pathways/v3")
OUT = os.path.join(ROOT, "public/atlas3/fibres")
ZMIN = -72.0  # the atlas's lowest slice (MNI z, mm)
STEP = 2.0  # mm between points

HCP_CREDIT = "HCP-842 tractography atlas (Yeh et al. 2018), CC BY 4.0"
PW_CREDIT = "The course's Pathway tracer, warped onto this brain (approximate)"

# course slug -> HCP bundle files (both sides), streamlines per file
FROM_HCP = {
    "rubrospinal-tract": (["RST_L", "RST_R"], 30),
    "corticopontine-tract": (["FPT_L", "FPT_R", "PPT_L", "PPT_R", "OPT_L", "OPT_R", "TPT_L", "TPT_R"], 14),
    "association-fibers": (["AF_L", "AF_R", "SLF_L", "SLF_R", "ILF_L", "ILF_R", "IFOF_L", "IFOF_R", "UF_L", "UF_R", "C_L", "C_R"], 10),
}
# course slug -> pathway file and the indices of its path beats that are the tract (None: every path beat except the
# periphery: roots, nerves, muscles)
FROM_PATHWAY = {
    "tectospinal-tract": ("tectospinal", [1, 2]),
    "vestibulospinal-tract": ("vestibulospinal", [1]),
    "reticulospinal-tract": ("reticulospinal", [1]),
    "corticobulbar-tract": ("corticobulbar", [1, 2, 3, 4, 5]),
    "trigeminothalamic-tract": ("trigeminal-discriminative", [6, 7]),
    "medial-forebrain-bundle": ("reward", [1]),
    "stria-terminalis": ("limbic-amygdala", [1]),
    "stria-medullaris-thalami": ("limbic-septal", [1]),
    "lateral-corticospinal-tract": ("lcst", None),
    "anterior-corticospinal-tract": ("acst", None),
}
PERIPHERY = ("root", "spinal nerve", "muscle", "nerve to", "ganglion", "peripheral")


def resample(p, step=STEP):
    """Points every `step` mm along a polyline (MNI mm, N x 3)."""
    if len(p) < 2:
        return p
    seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < step:
        return p[[0, -1]]
    t = np.arange(0, s[-1], step).tolist() + [s[-1]]
    return np.stack([np.interp(t, s, p[:, k]) for k in range(3)], 1)


def clip(p):
    """Pieces of a polyline inside the atlas (above its lowest slice)."""
    ok = p[:, 2] >= ZMIN
    out, cur = [], []
    for q, k in zip(p, ok):
        if k:
            cur.append(q)
        elif cur:
            out.append(np.array(cur)); cur = []
    if cur:
        out.append(np.array(cur))
    return [c for c in out if len(c) >= 2]


def to_world(p):
    w = zmap.mni_to_world(p)
    return [round(float(v), 4) for v in w.ravel()]


def hcp_lines(files, n):
    rng = np.random.default_rng(11)
    lines = []
    for f in files:
        sl = nib.streamlines.load(os.path.join(HCP, f + ".trk")).streamlines
        L = np.array([np.linalg.norm(np.diff(s, axis=0), axis=1).sum() for s in sl])
        keep = np.nonzero(L >= np.percentile(L, 40))[0]  # the long ones carry the bundle's shape
        pick = rng.choice(keep, size=min(n, len(keep)), replace=False)
        for i in pick:
            for piece in clip(resample(np.asarray(sl[i], float))):
                lines.append(to_world(piece))
    return lines


def pathway_lines(name, beats):
    pw = json.load(open(os.path.join(PW, name + ".json"), encoding="utf8"))
    lines = []
    for i, b in enumerate(pw["beats"]):
        if b.get("kind") != "path":
            continue
        if beats is not None and i not in beats:
            continue
        if beats is None and any(w in (b.get("caption") or "").lower() for w in PERIPHERY):
            continue
        for side in ("L", "R"):
            for f in (b.get(side) or {}).get("f", []):
                z = np.array(f["pts"], float).reshape(-1, 3)
                if len(z) < 2:
                    continue
                for piece in clip(resample(zmap.frame_to_mni(z))):
                    lines.append(to_world(piece))
    return lines


def main():
    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*.json")):
        os.remove(f)
    index = {}
    for slug, (files, n) in FROM_HCP.items():
        lines = hcp_lines(files, n)
        json.dump(dict(src="hcp", credit=HCP_CREDIT, lines=lines), open(os.path.join(OUT, slug + ".json"), "w"), separators=(",", ":"))
        index[slug] = "hcp"
        print(f"{slug:32s} hcp      {len(lines):4d} lines")
    for slug, (name, beats) in FROM_PATHWAY.items():
        lines = pathway_lines(name, beats)
        if not lines:
            print(f"{slug:32s} pathway  no lines")
            continue
        json.dump(dict(src="pathway", credit=PW_CREDIT, lines=lines), open(os.path.join(OUT, slug + ".json"), "w"), separators=(",", ":"))
        index[slug] = "pathway"
        print(f"{slug:32s} pathway  {len(lines):4d} lines")
    json.dump(index, open(os.path.join(OUT, "index.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
