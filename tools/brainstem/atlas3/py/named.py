# Accuracy check sheet: the canonical photo with every plate region outlined and named (both halves as the plate draws
# them: R = the professor's outline, L = its mirror), the open atlas figure for the same level beside it.
#   python named.py <level> [open figure path] [width]   -> view/check_<level>.jpg
import json, os, sys
import cv2
import numpy as np
from paths import BASE, REPO

AB = {
    "red-nucleus": "RN", "interpeduncular-fossa": "IPF", "cerebral-peduncles": "CP", "oculomotor-nucleus": "3N",
    "edinger-westphal-nucleus": "EW", "cerebral-aqueduct": "Aq", "superior-colliculus": "SC", "periaqueductal-gray": "PAG",
    "substantia-nigra": "SN", "medial-lemniscus": "ml", "anterolateral-spinothalamic-tract": "ALT", "oculomotor-nerve": "3n",
    "decussation-of-the-superior-cerebellar-peduncle": "xscp", "trochlear-nucleus": "4N", "inferior-colliculus": "IC",
    "trochlear-nerve": "4n", "fourth-ventricle": "4V", "superior-cerebellar-peduncle": "scp", "motor-trigeminal-nucleus": "5N",
    "principal-sensory-nucleus-of-trigeminal": "Pr5", "middle-cerebellar-peduncle": "mcp", "longitudinal-fibers-of-the-pons": "lfp",
    "pontine-nuclei": "Pn", "transverse-fibers-of-the-pons": "tfp", "trigeminal-nerve": "5n", "facial-colliculus": "FC",
    "vestibulocochlear-complex": "Ve", "abducens-nucleus": "6N", "facial-nucleus": "7N", "facial-nerve": "7n",
    "vestibulocochlear-nerve": "8n", "abducens-nerve": "6n", "inferior-cerebellar-peduncle": "icp", "solitary-nucleus": "Sol",
    "dorsal-motor-nucleus-of-the-vagus": "10N", "hypoglossal-nucleus": "12N", "inferior-olivary-nucleus": "IO", "pyramids": "py",
    "dorsal-spinocerebellar-tract": "dsct", "vagus-nerve": "10n", "glossopharyngeal-nerve": "9n", "hypoglossal-nerve": "12n",
    "gracile-nucleus": "Gr", "cuneate-nucleus": "Cu", "fasciculus-cuneatus": "cu", "fasciculus-gracilis": "gr",
    "spinal-trigeminal-nucleus": "Sp5", "internal-arcuate-fibers": "ia", "motor-decussation": "pyx",
    "medial-longitudinal-fasciculus": "mlf", "nucleus-ambiguus": "Amb", "lateral-corticospinal-tract": "lcst",
    "spinal-trigeminal-tract": "sp5", "brachium-of-the-inferior-colliculus": "bic", "medial-geniculate-nucleus": "MGN",
    "lateral-lemniscus": "ll", "locus-coeruleus": "LC", "choroid-plexus": "chp", "accessory-nerve": "11n",
}
SS = 1.6
COLS = [(0, 0, 230), (0, 140, 0), (200, 0, 0), (0, 120, 200), (160, 0, 160), (0, 150, 150), (30, 30, 30), (200, 100, 0)]


def draw_path(img, d, col, th):
    # the plate paths are M x y C ... Z; sample the Bezier end points (enough for a check sheet)
    import re
    for part in re.split(r"(?=M)", d):
        if not part:
            continue
        nums = [float(v) for v in re.findall(r"-?\d+(?:\.\d+)?", part)]
        pts = np.array(nums).reshape(-1, 2)
        pts = (pts * SS).astype(np.int32)
        cv2.polylines(img, [pts], part.strip().endswith("Z"), col, th, cv2.LINE_AA)


def main(level, fig=None, width=1500):
    plate = json.load(open(f"{BASE}/levels/{level}/plate.json"))
    img = cv2.imread(f"{BASE}/levels/{level}/canon.png")
    vis = img.copy()
    draw_path(vis, plate["outline"], (0, 170, 0), 2)
    slugs = sorted({r["slug"] for r in plate["regions"]} | {f["slug"] for f in plate["fibres"]})
    for k, s in enumerate(slugs):
        col = COLS[k % len(COLS)]
        for r in plate["regions"]:
            if r["slug"] != s:
                continue
            draw_path(vis, r["d"], col, 2 if not r.get("approx") else 1)
            ax, ay = r["a"]
            t = AB.get(s, s[:6]) + ("*" if r.get("approx") else "")
            p = (int(ax * SS) - 12, int(ay * SS) + 6)
            cv2.putText(vis, t, p, cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 5, cv2.LINE_AA)
            cv2.putText(vis, t, p, cv2.FONT_HERSHEY_SIMPLEX, 0.75, col, 2, cv2.LINE_AA)
        for f in plate["fibres"]:
            if f["slug"] == s:
                draw_path(vis, f["d"], col, 1)
    h = vis.shape[0]
    cv2.line(vis, (vis.shape[1] // 2, 0), (vis.shape[1] // 2, h), (0, 200, 255), 1)
    panels = [vis]
    if fig and os.path.exists(fig):
        f = cv2.imread(fig)
        f = cv2.resize(f, (int(f.shape[1] * h / f.shape[0]), h), interpolation=cv2.INTER_AREA)
        panels.append(f)
    out = np.hstack(panels)
    sc = width / out.shape[1]
    out = cv2.resize(out, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA)
    cv2.imwrite(f"{BASE}/view/check_{level}.jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    print(level, out.shape, ", ".join(f"{AB.get(s, s)}={s}" for s in slugs))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None, int(sys.argv[3]) if len(sys.argv) > 3 else 1500)
