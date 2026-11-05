"""Link ATLAS-2 into the app data: gap meshes into public/atlas/index.json (+3D neighbours), per-structure 'where exact'
into src/data/atlas-map.json, and a slug-keyed src/data/atlas-links.json used by the viewer.
Run after build_atlas2.py, gap_meshes.py and optimize_gap.sh:
  tools/.venv/Scripts/python.exe -I tools/atlas/link_atlas2.py"""
import json, os, re, numpy as np
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
norm = lambda s: re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()
structs = json.load(open(os.path.join(ROOT, "content/nsci3250/structures.json"), encoding="utf8"))
amap = json.load(open(os.path.join(ROOT, "src/data/atlas-map.json"), encoding="utf8"))
at = json.load(open(os.path.join(ROOT, "public/atlas2/atlas2.json")))
idx_path = os.path.join(ROOT, "public/atlas/index.json")
idx = json.load(open(idx_path, encoding="utf8"))
gap_path = os.path.join(ROOT, "_atlas/atlas2_build/gap_entries.json")
gaps = json.load(open(gap_path)) if os.path.exists(gap_path) else []
reg = json.load(open(os.path.join(ROOT, "_atlas/atlas2_build/registration.json")))

# 1. gap meshes into the index (only if the optimized GLB exists)
S = idx["structures"]
for k in [k for k in S if k.startswith("mni-")]: del S[k]
added = {}
for g in gaps:
    f = f"s/{g['id']}.glb"
    fp = os.path.join(ROOT, "public/atlas", f)
    if not os.path.exists(fp): print("missing glb", fp); continue
    S[g["id"]] = dict(id=g["id"], file=f, name=g["name"], latin=None, region=g["region"], side="lr", parent=None, bbox=g["bbox"], centroid=g["centroid"],
                      bytes=os.path.getsize(fp), registered=True)
    added[g["slug"]] = g["id"]

# 2. 3D neighbours (bbox gap), among curriculum meshes
cur = set(i for v in amap.values() for i in v["meshIds"]) | set(added.values())
def box(e): return np.array(e["bbox"][0]), np.array(e["bbox"][1])
def gap(a, b):
    (a0, a1), (b0, b1) = box(a), box(b)
    d = np.maximum(0, np.maximum(a0 - b1, b0 - a1)); return float(np.linalg.norm(d))
def vol(a): (a0, a1) = box(a); return float(np.prod(a1 - a0))
def inside(c, a):
    a0, a1 = box(a); return bool(np.all(c >= a0) and np.all(c <= a1))
def contains(a, b):
    # a encloses b: b's centroid lies in a's box and a is the bigger one (registered meshes may poke out a few mm)
    return inside(np.array(b["centroid"]), a) and vol(a) > vol(b) * 1.5
cands = [k for k in cur if k in S and S[k].get("file") and np.linalg.norm(box(S[k])[1] - box(S[k])[0]) < 0.13
         and not re.search(r"sulcus|fis|fissure|^lat_|ramus|nerve|artery|sinus|root", S[k]["name"], re.I)]
for k, e in S.items():
    e.pop("neighbors", None)
    if not e.get("file") or k not in cur: continue
    rows = []
    for o in cands:
        if o == k: continue
        if contains(S[o], e) or contains(e, S[o]): continue
        rows.append((gap(e, S[o]), float(np.linalg.norm(np.array(e["centroid"]) - np.array(S[o]["centroid"]))), o))
    rows.sort()
    e["neighbors"] = [o for _, _, o in rows[:6]]
idx["registration"] = dict(rms_mm=round(reg["rms_mm"], 2), loo_rms_mm=round(reg["loo_rms_mm"], 2), max_mm=round(reg["max_mm"], 1), n=reg["n"])
json.dump(idx, open(idx_path, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)

# 3. atlas-map: slug + where-exact
BYN = {}
for k, v in amap.items(): BYN.setdefault(norm(k), []).append(k)
links = {}
for st in structs:
    slug = st["slug"]; sl = at["structures"].get(slug)
    names = [st["name"]] + st.get("synonyms", []) + st.get("abbreviations", [])
    keys = []
    for n in names:
        keys += BYN.get(norm(n), [])
    keys = list(dict.fromkeys(keys))
    if not keys and sl and slug not in ("cerebellum",):
        amap[st["name"]] = dict(meshIds=[], approximate=False, synonyms=[]); keys = [st["name"]]; BYN.setdefault(norm(st["name"]), []).append(st["name"])
    mesh = added.get(slug)
    for k in keys:
        e = amap[k]
        e["slug"] = slug
        if mesh:
            e.setdefault("fallbackParentId", e.get("fallbackParentId"))
            if e["fallbackParentId"] is None: e.pop("fallbackParentId")
            e["approxMeshIds"] = e.get("approxMeshIds") or e["meshIds"]
            e["meshIds"] = [mesh]; e["approximate"] = False; e["registered"] = True
        e["slices"] = sl["quality"] if sl else None
        where = []
        if e["meshIds"] and not e["approximate"]: where.append("3d")
        if sl and sl["quality"] in ("exact", "derived"): where.append("slices")
        e["exactIn"] = where
    if keys:
        e = amap[keys[0]]
        links[slug] = dict(name=st["name"], meshIds=e["meshIds"], approximate=e["approximate"], fallbackParentId=e.get("fallbackParentId"),
                           slices=sl["quality"] if sl else None, exactIn=e["exactIn"], registered=bool(e.get("registered")))
    elif sl:
        links[slug] = dict(name=st["name"], meshIds=[], approximate=False, fallbackParentId=None, slices=sl["quality"], exactIn=["slices"] if sl["quality"] != "regional" else [], registered=False)
json.dump(amap, open(os.path.join(ROOT, "src/data/atlas-map.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
json.dump(links, open(os.path.join(ROOT, "src/data/atlas-links.json"), "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
ap = [k for k, v in amap.items() if v.get("approximate")]
print("gap meshes:", len(added), "| links:", len(links), "| approximate entries left:", len(ap))
print("approximate names now exact in slices:", sum(1 for k in amap if amap[k].get("approximate") is not None and "slices" in amap[k].get("exactIn", []) and "3d" not in amap[k]["exactIn"]))
