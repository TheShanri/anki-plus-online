# Check levels_cfg.py's shape -> structure mapping against the overlay slide itself: the text inside each shape, the
# text box a same-coloured connector leads to, the text boxes overlapping the shape, and the colour pairing.
#   python verify_map.py [level ...]
import json, sys
import numpy as np
from levels_cfg import LEVELS
from paths import BASE


def bbox(s):
    p = np.array([q for poly in s["polys"] for q in poly["pts"]])
    return p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()


def overlap(a, b):
    ix = max(0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0, min(a[3], b[3]) - max(a[1], b[1]))
    ar = max(1e-6, (b[2] - b[0]) * (b[3] - b[1]))
    return ix * iy / ar


def near(pt, b, pad=30):
    return b[0] - pad <= pt[0] <= b[2] + pad and b[1] - pad <= pt[1] <= b[3] + pad


for lv in sys.argv[1:] or LEVELS:
    cfg = LEVELS[lv]
    d = json.load(open(f"{BASE}/shapes/ovp{cfg['slide']}.json"))
    by = {s["i"]: s for s in d["shapes"]}
    boxes = [s for s in d["shapes"] if s["text"] and (s["prst"] == "rect" or not s.get("line"))]
    conns = [s for s in d["shapes"] if s["kind"] == "cxnSp" or (s["prst"] in ("line", "straightConnector1"))]
    print(f"\n## {lv} (slide {cfg['slide']})")
    used = set()
    for kind in ("area", "fibres"):
        for slug, ids in cfg.get(kind, {}).items():
            info = []
            for i in ids:
                used.add(i)
                s = by.get(i)
                if not s:
                    info.append(f"{i}:MISSING")
                    continue
                b = bbox(s)
                own = s["text"]
                ov = sorted(((overlap(b, bbox(t)), t["text"]) for t in boxes if t["i"] != i), reverse=True)
                ov = [t for o, t in ov if o > 0.25][:2]
                via = []
                for c in conns:
                    if (c.get("line") or "") != (s.get("line") or "-"):
                        continue
                    ends = [c["polys"][0]["pts"][0], c["polys"][0]["pts"][-1]]
                    if any(near(e, b) for e in ends):
                        for t in boxes:
                            if any(near(e, bbox(t), 12) for e in ends):
                                via.append(t["text"])
                info.append(f"{i}[{s.get('line')}] own={own!r} conn={via} over={ov}")
            print(f"  {kind[0]} {slug}:")
            for x in info:
                print("      " + x)
    rest = [s for s in d["shapes"] if s["i"] not in used and not (s["prst"] == "rect" and s["text"]) and s["kind"] != "cxnSp"]
    for s in rest:
        print(f"  UNUSED {s['i']} [{s.get('line')}] {s['prst']} text={s['text']!r} dash={s.get('dash')} bbox={tuple(int(v) for v in bbox(s))}")
