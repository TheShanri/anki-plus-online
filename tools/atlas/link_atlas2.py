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


# 1b. bbox sanity: recompute every bbox from the GLB itself (a stale index bbox, e.g. the hypothalamus one that
# reached down to the spinal cord, makes the viewer frame empty space and show nothing).
import struct
def glb_bbox(fp):
    b = open(fp, "rb").read(); n = struct.unpack("<I", b[12:16])[0]; j = json.loads(b[20:20 + n])
    lo, hi = np.full(3, 1e9), np.full(3, -1e9)
    for nd in j["nodes"]:
        if nd.get("mesh") is None or "rotation" in nd: continue
        for p in j["meshes"][nd["mesh"]]["primitives"]:
            a = j["accessors"][p["attributes"]["POSITION"]]
            sc = {5122: 32767, 5120: 127, 5123: 65535, 5121: 255}.get(a["componentType"], 1) if a.get("normalized") else 1
            s_, t_ = np.array(nd.get("scale", [1, 1, 1])), np.array(nd.get("translation", [0, 0, 0]))
            for m_ in (np.array(a["min"]) / sc * s_ + t_, np.array(a["max"]) / sc * s_ + t_):
                lo, hi = np.minimum(lo, m_), np.maximum(hi, m_)
    return lo, hi
for k, e in S.items():
    fp = os.path.join(ROOT, "public/atlas", e.get("file") or "")
    if not e.get("file") or not os.path.exists(fp): continue
    lo, hi = glb_bbox(fp)
    if hi[0] < lo[0]: continue
    old = np.array(e["bbox"])
    if np.abs(np.array([lo, hi]) - old).max() > 0.003:
        print("bbox fixed:", k)
        e["bbox"] = [[round(float(x), 5) for x in lo], [round(float(x) , 5) for x in hi]]

# 2. 3D neighbours: per hemisphere, from real mesh geometry (tools/atlas/neighbors3d.py). The old bbox/centroid version
# gave paired meshes (one bbox spanning both hemispheres) midline neighbours, e.g. middle temporal gyrus -> pons.
cur = set(i for v in amap.values() for i in v["meshIds"]) | set(added.values()) | set(k for k in S if k.startswith("mni-"))
import sys; sys.path.insert(0, os.path.dirname(__file__))
import neighbors3d
neighbors3d.apply(S, neighbors3d.compute(S, cur))
idx["registration"] = dict(rms_mm=round(reg["rms_mm"], 2), loo_rms_mm=round(reg["loo_rms_mm"], 2), max_mm=round(reg["max_mm"], 1), n=reg["n"])
json.dump(idx, open(idx_path, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)

# 3. atlas-map: slug + where-exact
# Curriculum structures whose names did not match an existing course-list entry got a new entry with no 3D ids,
# so the 3D tab showed nothing. Give them their Z-Anatomy meshes: by exact index name, or by this table
# (approximate = the structure lies inside the shown mesh, which is then also its fallback parent).
OVERRIDE = {
    "basal-ganglia": (["caudate-nucleus", "putamen", "globus-pallidus"], False),
    "corpus-striatum": (["caudate-nucleus", "putamen", "globus-pallidus"], False),
    "primary-motor-cortex": (["precentral-gyrus"], False),
    "primary-somatosensory-cortex": (["postcentral-gyrus"], False),
    "primary-auditory-cortex": (["transverse-temporal-gyri"], False),
    "inferior-frontal-gyrus": (["opercular-part-of-inferior-frontal-gyrus", "triangular-part-of-inferior-frontal-gyrus", "orbital-part-of-inferior-frontal-gyrus"], False),
    "superior-temporal-gyrus": (["superior-temporal-gyrus-lateral-part", "transverse-temporal-gyri"], False),
    "dorsal-motor-nucleus-of-the-vagus": (["posterior-nucleus-of-vagus-nerve"], False),
    "head-of-caudate-nucleus": (["caudate-nucleus"], True),
    "body-of-caudate-nucleus": (["caudate-nucleus"], True),
    "tail-of-caudate-nucleus": (["caudate-nucleus"], True),
    "basal-forebrain-nuclei": (["septal-nuclei"], True),
    "cuneate-tubercle": (["medulla-oblongata"], True),
    "gracile-tubercle": (["medulla-oblongata"], True),
    "solitary-nucleus": (["medulla-oblongata"], True),
    "paramedian-pontine-reticular-formation": (["pons"], True),
    "dentate-nucleus": (["cerebellum"], True),
    # structures with no MRI label either (cortical areas, parts, roots, nerves named without their numeral)
    "primary-visual-cortex": (["cuneus", "lingual-gyrus"], True),
    "visual-association-cortex": (["lateral-occipital-gyrus-middle-occipital-gyrus", "superior-occipital-gyri", "inferior-occipital-gyrus-and-sulcus"], True),
    "premotor-cortex": (["precentral-gyrus"], True),
    "motor-homunculus": (["precentral-gyrus"], True),
    "somatosensory-homunculus": (["postcentral-gyrus"], True),
    "somatosensory-association-cortex": (["superior-parietal-lobule"], True),
    "parietal-lobe-general-association-area": (["supramarginal-gyrus", "angular-gyrus"], True),
    "auditory-association-area": (["superior-temporal-gyrus-lateral-part"], True),
    "interthalamic-adhesion": (["thalamus"], True),
    "suprachiasmatic-nucleus": (["hypothalamus"], True),
    "foramina-of-monro": (["third-ventricle", "lateral-ventricle"], True),
    "foramen-of-magendie": (["fourth-ventricle"], True),
    "foramina-of-luschka": (["fourth-ventricle"], True),
    "decussation-of-the-superior-cerebellar-peduncle": (["superior-cerebellar-peduncle"], True),
    "motor-decussation": (["pyramid-of-medulla-oblongata"], True),
    "dorsal-root": (["posterior-root-of-spinal-nerve"], False),
    "ventral-root": (["anterior-root-of-spinal-nerve"], False),
    "dorsal-rootlets": (["posterior-root-of-spinal-nerve"], True),
    "ventral-rootlets": (["anterior-root-of-spinal-nerve"], True),
    "accessory-nerve": (["nucleus-of-accessory-nerve"], True),
    # course label audit 2026-11-13: the Z-Anatomy "Olfactory nerve (I)" mesh is the bulb + tract; cochlear nuclei split out of the complex
    "olfactory-bulb": (["olfactory-nerve-i"], True),
    "olfactory-tract": (["olfactory-nerve-i"], True),
    "cochlear-nuclei": (["anterior-cochlear-nucleus", "posterior-cochlear-nucleus"], False),
}

# Vetting fixes (atlas screenshot review): the mapped mesh was either the whole parent shown as if exact, or a mesh
# so tiny / the wrong shape that the highlight was invisible or misleading. Shown as approximate on the containing mesh.
APPROX_FIX = {
    # pulvinar / anterior nucleus of the thalamus are now exact: tools/atlas/carve_parts.py carves them out of the thalamus mesh
    "facial-colliculus": (["pons"], True),
    "interpeduncular-fossa": (["midbrain"], True),
    "interpeduncular-cistern": (["midbrain"], True),
    "motor-trigeminal-nucleus": (["pons"], True),
    "principal-sensory-nucleus-of-trigeminal": (["pons"], True),
    # (the corpus callosum and fornix parts are exact since 2026-11-22: carved by tools/atlas/carve_parts.py)
    "callosomarginal-artery": (["pericallosal-artery"], True),
    "circle-of-willis": (["cerebral-arterial-circle", "anterior-communicating-artery", "posterior-communicating-artery", "anterior-cerebral-artery", "posterior-cerebral-artery", "basilar-artery"], False),
    "cerebral-blood-vessels": (["cerebral-arterial-circle", "anterior-cerebral-artery", "pericallosal-artery", "middle-cerebral-artery-m1", "middle-cerebral-artery-m3", "posterior-cerebral-artery", "basilar-artery", "superior-cerebellar-artery"], False),
}
# Made exact in the 3D round: these names are the very structures the meshes are (a peduncle trio, the pons itself, the hemispheric lobules)
APPROX_FIX.update({
    "cerebellar-peduncles": (["superior-cerebellar-peduncle", "mni-middle-cerebellar-peduncle", "mni-inferior-cerebellar-peduncle"], False),
    "pontine-protuberance": (["pons"], False),
    "cerebellar-lateral-hemisphere": (["anterior-quadrangular-lobule", "posterior-quadrangular-lobule", "superior-semilunar-lobule", "inferior-semilunar-lobule", "biventral-lobule", "gracile-lobule"], False),
})
# Sweep 2026-11-20 (content accuracy): shown as exact but the mesh is the whole containing structure; the epithalamus is
# the habenula and the pineal gland
APPROX_FIX.update({
    "brachium-of-the-inferior-colliculus": (["inferior-colliculus"], True),
    "temporal-lobe-general-association-area": (["temporal-lobe"], True),
    "inferior-olivary-nucleus": (["olive"], True),
    "epithalamus": (["habenula", "mni-pineal-gland"], False),
})
IDX_BY_NAME = {}
for k, e in S.items():
    IDX_BY_NAME.setdefault(norm(e["name"]), k)
    IDX_BY_NAME.setdefault(norm(re.sub(r"\(.*?\)", "", e["name"])), k)  # "Vagus nerve (X)" also as "vagus nerve"
def mesh_for(st):
    if st["slug"] in OVERRIDE: return OVERRIDE[st["slug"]]
    for n in [st["name"]] + st.get("synonyms", []):
        k = IDX_BY_NAME.get(norm(n))
        if k and S[k].get("file") or k and S[k].get("members"): return ([k], False)
    return ([], False)

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
    if not keys and slug not in ("cerebellum",) and (sl or mesh_for(st)[0]):
        amap[st["name"]] = dict(meshIds=[], approximate=False, synonyms=[]); keys = [st["name"]]; BYN.setdefault(norm(st["name"]), []).append(st["name"])
    mesh = added.get(slug)
    for k in keys:
        e = amap[k]
        e["slug"] = slug
        if not mesh and not e["meshIds"] and not e.get("fallbackParentId"):
            ids, approx = mesh_for(st)
            if ids:
                e["meshIds"] = ids; e["approximate"] = approx
                if approx: e["fallbackParentId"] = ids[0]
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

# apply the vetting fixes to the final links (and to the atlas-map entry only when it belongs to this slug alone)
for slug, (ids, ap) in APPROX_FIX.items():
    l = links.get(slug)
    if not l: print("APPROX_FIX: unknown slug", slug); continue
    assert all(i in S for i in ids), (slug, ids)
    l["registered"] = False
    l["meshIds"] = list(ids); l["approximate"] = ap; l["fallbackParentId"] = ids[0] if ap else None
    l["exactIn"] = [w for w in l["exactIn"] if w != "3d"] + ([] if ap else ["3d"])
    for e in amap.values():
        if e.get("slug") == slug:
            e["meshIds"] = list(ids); e["approximate"] = ap; e["exactIn"] = l["exactIn"]
            if ap: e["fallbackParentId"] = ids[0]
            else: e.pop("fallbackParentId", None)
# 2026-11-22 ----------------------------------------------------------------------------------------------------------
# Atlas-only structures: landmarks with an exact MRI label and a 3D mesh (tools/atlas/wm_meshes.py) that are not on the
# course's structure list (the arcuate fasciculus and the other association tracts, the corticospinal tract through the
# brain, the locus coeruleus and raphe nuclei). They are searchable and highlightable; their info card is the app's own.
course = {st["slug"] for st in structs}
for slug, mid in added.items():
    if slug in course or slug in links: continue
    sl = at["structures"].get(slug)
    links[slug] = dict(name=sl["name"] if sl else S[mid]["name"], meshIds=[mid], approximate=False, fallbackParentId=None, slices=sl["quality"] if sl else None,
                       exactIn=["3d"] + (["slices"] if sl and sl["quality"] in ("exact", "derived") else []), registered=True, atlasOnly=True)
# the fibre groups are now the union of their own tracts (they used to light the whole white matter, as approximate)
GROUP_MESHES = {
    "association-fibers": ["mni-arcuate-fasciculus", "mni-superior-longitudinal-fasciculus", "mni-inferior-longitudinal-fasciculus", "mni-inferior-fronto-occipital-fasciculus", "mni-uncinate-fasciculus", "mni-cingulum"],
    "projection-fibers": ["mni-corona-radiata", "mni-internal-capsule", "mni-corticospinal-tract", "mni-corticopontine-tract"],
}
for slug, ids in GROUP_MESHES.items():
    l = links.get(slug)
    if not l or not all(i in S for i in ids): print("GROUP_MESHES skipped", slug); continue
    l.update(meshIds=ids, approximate=False, fallbackParentId=None, registered=True)
    l["exactIn"] = sorted(set(l["exactIn"]) | {"3d"})
# Parts nested under their whole in the search list (the whole lights everything, each part can be picked on its own).
# Besides this table, a structure made of several meshes lists those meshes as its parts (see src/lib/atlas/catalog.ts).
CHILDREN = {
    "corpus-callosum": ["genu-of-corpus-callosum", "body-of-corpus-callosum", "splenium-of-corpus-callosum"],
    "fornix": ["crus-of-fornix", "body-of-fornix", "columns-of-the-fornix"],
    "internal-capsule": ["anterior-limb-of-internal-capsule", "genu-of-internal-capsule", "posterior-limb-of-internal-capsule"],
    "caudate-nucleus": ["head-of-caudate-nucleus", "body-of-caudate-nucleus", "tail-of-caudate-nucleus"],
    "thalamus": ["anterior-nucleus-of-thalamus", "pulvinar", "lateral-geniculate-nucleus", "medial-geniculate-nucleus"],
    "lateral-ventricle": ["anterior-horn-of-lateral-ventricle", "body-of-lateral-ventricle", "atrium-of-lateral-ventricle", "posterior-horn-of-lateral-ventricle", "inferior-horn-of-lateral-ventricle"],
    "association-fibers": ["arcuate-fasciculus", "superior-longitudinal-fasciculus", "inferior-longitudinal-fasciculus", "inferior-fronto-occipital-fasciculus", "uncinate-fasciculus", "cingulum"],
    "projection-fibers": ["corona-radiata", "internal-capsule", "corticospinal-tract", "corticopontine-tract"],
    "commissural-fibers": ["corpus-callosum", "anterior-commissure"],
    "basal-ganglia": ["caudate-nucleus", "putamen", "globus-pallidus"],
    "lentiform-nucleus": ["putamen", "globus-pallidus"],
    "cerebellar-peduncles": ["superior-cerebellar-peduncle", "middle-cerebellar-peduncle", "inferior-cerebellar-peduncle"],
    "epithalamus": ["habenula", "pineal-gland"],
    "dorsal-columns": ["fasciculus-gracilis", "fasciculus-cuneatus"],
    # mesh ids: the gyral parts that make up a functional area
    "broca-s-area": ["opercular-part-of-inferior-frontal-gyrus", "triangular-part-of-inferior-frontal-gyrus"],
    "inferior-parietal-lobule": ["supramarginal-gyrus", "angular-gyrus"],
}
for parent, kids in CHILDREN.items():
    if parent not in links: print("CHILDREN: no link", parent); continue
    ok = [k for k in kids if k in links or k in S]
    if len(ok) < len(kids): print("CHILDREN: missing", parent, [k for k in kids if k not in links and k not in S])
    links[parent]["children"] = ok
json.dump(amap, open(os.path.join(ROOT, "src/data/atlas-map.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
# the index is cached for an hour (next.config.ts): the app asks for index.json?v=<this>, so links that name a new mesh
# never meet a stale index
import hashlib
json.dump({"index": hashlib.sha1(open(idx_path, "rb").read()).hexdigest()[:10]}, open(os.path.join(ROOT, "src/data/atlas-version.json"), "w"))
json.dump(links, open(os.path.join(ROOT, "src/data/atlas-links.json"), "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
ap = [k for k, v in amap.items() if v.get("approximate")]
print("gap meshes:", len(added), "| links:", len(links), "| approximate entries left:", len(ap))
print("approximate names now exact in slices:", sum(1 for k in amap if amap[k].get("approximate") is not None and "slices" in amap[k].get("exactIn", []) and "3d" not in amap[k]["exactIn"]))

# skull / spine / meninges layer entries (survive a re-run of this script)
sys.path.insert(0, os.path.dirname(__file__))
import skull_links
skull_links.main()
