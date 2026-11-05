"""Build public/atlas/index.json and _atlas/hierarchy.json.
Usage: python -I tools/atlas/build_index.py   (run from repo root; needs _atlas/hierarchy_full.json,
_atlas/raw/glb/export_meta.json, _atlas/raw/z-anatomy/TA2.csv, and optimised GLBs in public/atlas/s/)"""
import csv, json, os, re, collections

ROOT = os.getcwd()
H = json.load(open("_atlas/hierarchy_full.json"))
META = json.load(open("_atlas/raw/glb/export_meta.json"))
E = META["entries"]

# ---- TA2 latin
latin = {}
with open("_atlas/raw/z-anatomy/TA2.csv", encoding="utf-8-sig") as f:
    for line in csv.reader(f):
        row = line[0].split(";") if len(line) == 1 else line
        if len(row) > 2:
            latin.setdefault(re.sub(r"[^a-z0-9]+", " ", row[1].lower()).strip(), row[2])

def lat(name):
    k = re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()
    if k in latin: return latin[k]
    k2 = re.sub(r"[^a-z0-9]+", " ", re.sub(r"\(.*?\)", "", name).lower()).strip()
    return latin.get(k2)

def slug(b):
    return re.sub(r"[^a-z0-9]+", "-", b.lower().replace("*", "")).strip("-")

REGIONS = [  # (group marker in parent chain, region id)
    ("Cerebellum.g", "cerebellum"), ("Brainstem.g", "brainstem"), ("Diencephalon.g", "diencephalon"),
    ("Telencephalon.g", "cerebrum"), ("Cerebrum.g", "cerebrum"), ("Spinal cord.g", "spinal-cord"),
    ("Cranial nerves.g", "cranial-nerves"), ("Meninges.g", "meninges"), ("Dura.g", "meninges"),
    ("Spinal nerves.g", "spinal-nerves"), ("Roots of nerves.g", "spinal-nerves"), ("Ganglia.g", "spinal-nerves"),
]
REGION_LABEL = {"cerebrum": "Cerebrum", "diencephalon": "Diencephalon", "brainstem": "Brainstem", "cerebellum": "Cerebellum",
                "spinal-cord": "Spinal cord", "cranial-nerves": "Cranial nerves", "spinal-nerves": "Spinal nerves & roots",
                "meninges": "Meninges", "vessels": "Vessels & sinuses", "ventricles": "Ventricles", "other": "Other"}

def region_of(e):
    n = e["name"].lower()
    if "ventricle" in n or "choroid" in n or "aqueduct" in n or "central canal" in n: return "ventricles"
    if "falx" in n or "tentorium" in n or "dura" in n: return "meninges"
    if e["coll"] and e["coll"][0].startswith("5:"): return "vessels"
    for m, r in REGIONS:
        if m in e["chain"]: return r
    return "other"

def tri(v): return [round(x, 5) for x in v]
files = {}
for sid in E:
    p = f"public/atlas/s/{sid}.glb"
    files[sid] = os.path.getsize(p) if os.path.exists(p) else None

index = {}
group_members = collections.defaultdict(list)
for sid, e in sorted(E.items()):
    if files[sid] is None: continue
    reg = region_of(e)
    parent_g = next((c[:-2] for c in e["chain"] if c.endswith(".g")), None)
    ent = {"id": sid, "file": f"s/{sid}.glb", "name": e["name"], "latin": lat(e["name"]), "region": reg,
           "side": e["side"], "parent": slug(parent_g) if parent_g else None,
           "bbox": [tri(e["bbox"][0]), tri(e["bbox"][1])], "centroid": tri(e["centroid"]), "bytes": files[sid]}
    index[sid] = ent
    for c in e["chain"]:
        if c.endswith(".g"): group_members[slug(c[:-2])].append(sid)

SKIP_GROUPS = {"nervous-system-sense-organs", "central-nervous-system", "peripheral-nervous-system", "systemic-arteries", "vessels", "arterial-system", "venous-system", "systemic-veins", "cranial-veins"}
# display names of groups
names = {}
def walk(c):
    for o in c["objects"]:
        if o["name"].endswith(".g"): names[slug(o["name"][:-2])] = o["name"][:-2]
    for x in c["children"]: walk(x)
walk(H["scene"])
for g, mem in group_members.items():
    if g in SKIP_GROUPS or len(mem) < 2: continue
    mn = [min(index[m]["bbox"][0][i] for m in mem) for i in range(3)]
    mx = [max(index[m]["bbox"][1][i] for m in mem) for i in range(3)]
    cen = [round(sum(index[m]["centroid"][i] for m in mem) / len(mem), 5) for i in range(3)]
    gid = g
    if gid in index:  # a mesh already has this id (e.g. midbrain): keep the mesh, record members on it
        index[gid]["members"] = [m for m in mem if m != gid]
        continue
    reg = index[mem[0]]["region"] if len({index[m]["region"] for m in mem}) == 1 else         {"brainstem": "brainstem", "brain": "cerebrum", "telencephalon": "cerebrum", "cerebrum": "cerebrum",
         "spinal-cord": "spinal-cord", "meninges": "meninges", "diencephalon": "diencephalon"}.get(gid, "other")
    index[gid] = {"id": gid, "name": names.get(g, g), "latin": lat(names.get(g, g)), "region": reg, "side": "lr",
                  "parent": None, "bbox": [mn, mx], "centroid": cen, "members": sorted(mem)}
# fix group parents: nearest ancestor group that exists
objs = {}
def collect(c):
    for o in c["objects"]: objs.setdefault(o["name"], o)
    for x in c["children"]: collect(x)
collect(H["scene"])
for gid, ent in index.items():
    if "members" in ent and "file" not in ent:
        n = names.get(gid)
        p = objs.get(n + ".g", {}).get("parent") if n else None
        while p:
            if slug(p[:-2]) in index and "members" in index[slug(p[:-2])]: ent["parent"] = slug(p[:-2]); break
            p = objs.get(p, {}).get("parent")

ctx = "context.glb"
out = {"version": 1, "context": {"file": ctx, "bytes": os.path.getsize("public/atlas/context.glb") if os.path.exists("public/atlas/context.glb") else None},
       "regions": REGION_LABEL, "structures": index}
json.dump(out, open("public/atlas/index.json", "w"), separators=(",", ":"))
print("index entries", len(index), "groups", sum(1 for e in index.values() if "file" not in e))

# ---- hierarchy.json: collections + nervous-system group tree
kids = collections.defaultdict(list)
for n, o in objs.items():
    if o.get("parent"): kids[o["parent"]].append(n)
exported_src = {s for e in E.values() for s in e["sources"]}
def gtree(g):
    leaves = [k for k in kids[g] if not k.endswith((".g", ".j", ".t"))]
    return {"group": g[:-2], "objects": [{"name": k, "type": objs[k]["type"], "verts": objs[k].get("v"), "exported": k in exported_src} for k in sorted(leaves)],
            "children": [gtree(k) for k in sorted(kids[g]) if k.endswith(".g") and (kids[k])]}
def ctree(c, d=0):
    ms = [o for o in c["objects"] if o["type"] in ("MESH", "CURVE") and not o["name"].endswith((".j", ".g", ".t", ".i"))]
    r = {"collection": c["name"], "objects": len(c["objects"]), "geometry_objects": len(ms)}
    if c["children"] and d < 2: r["children"] = [ctree(x, d + 1) for x in c["children"]]
    return r
hier = {"note": "Z-Anatomy Startup.blend (Blender 3.05). Real structure = object parenting through hidden FONT objects named '*.g'; collections are flat per body system.",
        "suffixes": {".l/.r": "left/right geometry (mesh or curve), mirrored copies with identical vertex counts",
                     ".g": "hidden FONT object = group node; the parent of its members (this carries the real hierarchy)",
                     ".j": "hidden 2-vertex MESH anchor child of its .g group (junction/pivot, no anatomy)",
                     ".t": "FONT text label for a sub-part (hidden/helper)",
                     ".i": "tiny bone-landmark marker meshes (skeletal system only; none in nervous system)",
                     ".st": "FONT tutorial text on the loose Scene Collection (HOW TO ...)",
                     "no suffix": "midline / unpaired structure with its own geometry (e.g. Corpus callosum, Third ventricle)",
                     "'": "trailing apostrophe = duplicate-name disambiguation (Central canal')",
                     "*": "asterisk = Terminologia Neuroanatomica / FreeSurfer-derived alternative name for the patch"},
        "collections": ctree(H["scene"]),
        "nervous_system_groups": gtree("Nervous system & Sense organs.g"),
        "cardiovascular_groups_cerebral": [gtree(g) for g in ("Cerebral arterial circle.g", "Dural venous sinuses.g") if g in objs],
        "meninges_group": gtree("Dura.g") if "Dura.g" in objs else None,
        "exported_structures": len(E)}
json.dump(hier, open("_atlas/hierarchy.json", "w"), indent=1)
