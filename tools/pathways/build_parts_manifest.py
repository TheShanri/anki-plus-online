"""Builds public/pathways/parts.json from the *.anchors.json fragments that export_parts.py writes (new parts) and from the
glb files themselves (the original five: objects + bounding boxes only).
usage: python -I tools/pathways/build_parts_manifest.py _atlas/pathways_raw public/pathways"""
import json, os, struct, sys

raw, pub = sys.argv[1], sys.argv[2]

def glb_json(p):
    b = open(p, "rb").read(); n = struct.unpack("<I", b[12:16])[0]; return json.loads(b[20:20 + n])

def qmul(q, v):
    x, y, z, w = q
    ix, iy, iz = w * v[0] + y * v[2] - z * v[1], w * v[1] + z * v[0] - x * v[2], w * v[2] + x * v[1] - y * v[0]
    iw = -x * v[0] - y * v[1] - z * v[2]
    return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]

def glb_objects(p):
    j = glb_json(p); out = {}; lo = [1e9] * 3; hi = [-1e9] * 3
    for n in j["nodes"]:
        if "mesh" not in n: continue
        prim = j["meshes"][n["mesh"]]["primitives"][0]; a = j["accessors"][prim["attributes"]["POSITION"]]
        mn, mx = a.get("min"), a.get("max")
        if mn is None: continue
        if a.get("normalized"):
            d = 65535.0 if a["componentType"] == 5123 else 32767.0 if a["componentType"] == 5122 else 255.0
            mn = [v / d for v in mn]; mx = [v / d for v in mx]
        s = n.get("scale", [1, 1, 1]); t = n.get("translation", [0, 0, 0])
        bmn = [mn[i] * s[i] + t[i] for i in range(3)]; bmx = [mx[i] * s[i] + t[i] for i in range(3)]
        out[n.get("name", "?")] = {"bbox": [[round(v, 5) for v in bmn], [round(v, 5) for v in bmx]],
                                   "centre": [round((bmn[i] + bmx[i]) / 2, 5) for i in range(3)], "verts": a["count"]}
        lo = [min(lo[i], bmn[i]) for i in range(3)]; hi = [max(hi[i], bmx[i]) for i in range(3)]
    return out, [[round(v, 5) for v in lo], [round(v, 5) for v in hi]]

TISSUE = {  # object-name prefix -> suggested material (hex colour), matching the existing parts' palette
    "bone": "#ece4cf", "muscle": "#b9444c", "vessel": "#c8453f", "nerve": "#e8d27a", "organ": "#d99a9a", "gland": "#d9ab72",
    "cartilage": "#a9c3d6", "disc": "#6fb8b8", "dura": "#8fa0e0", "skin": "#e4b49b", "tendon": "#efe9d8"}
VIEW = {"frame": "metres; Y up, anterior +Z, patient's left +X, centred on the part's bounding box; the left-sided structures only unless a name ends _R",
        "front": {"cameraAxis": "+Z", "rotation": [0, 0, 0]}, "left": {"cameraAxis": "+X", "rotation": [0, 1.5708, 0]}}
DESC = {
    "spine": "Vertebral column C1-L5, sacrum, coccyx (each a separate object), intervertebral discs, spinal cord with enlargements, dorsal root ganglia (C2-L2 from Z-Anatomy, L3-S5 generated), cauda equina, dura.",
    "thorax": "Heart (four chambers), pulmonary trunk, ascending aorta, arch, descending aorta, brachiocephalic, subclavian and both carotids with generated carotid sinus bulbs, lungs, trachea and bronchi, diaphragm.",
    "gut": "Oesophagus, stomach, duodenum, small intestine (one tube) and the four colon segments.",
    "head-targets": "Tongue, parotid/submandibular/sublingual/lacrimal glands, larynx cartilages, pharyngeal constrictors, soft palate, mandible, masseter, temporalis, eyeball and extraocular muscles, cochlea, vestibule, generated semicircular canals, ossicles, nasal cavity with olfactory epithelium, olfactory nerve and generated bulb (left side).",
    "hand": "Left hand and forearm (skin, bone, forearm muscle).", "foot": "Left foot and lower leg (skin, bone, calcaneal tendon).",
    "leg": "Left thigh and knee (skin, bone, quadriceps muscle, patellar tendon).", "muscle": "Brachioradialis, a single muscle for the stretch-reflex pathway.",
    "eye": "Left eyeball (sclera, cornea, iris, lens, retina)."}

parts = {}
for name in ["hand", "foot", "leg", "muscle", "eye", "spine", "thorax", "gut", "head-targets"]:
    f = os.path.join(pub, name + ".glb")
    if not os.path.exists(f): continue
    objs, bbox = glb_objects(f)
    ent = {"file": f"/pathways/{name}.glb", "bytes": os.path.getsize(f), "description": DESC[name], "objects": {k: v["verts"] for k, v in objs.items()},
           "objectCentres": {k: v["centre"] for k, v in objs.items()}, "bbox": bbox, "orientation": VIEW}
    fr = os.path.join(raw, name + ".anchors.json")
    if os.path.exists(fr):
        m = json.load(open(fr)); ent["bbox"] = m["bbox"]; ent["worldOffset"] = m["worldOffset"]; ent["anchors"] = m["anchors"]; ent["notes"] = m["notes"]
        ent["objects"] = {k: v[0] for k, v in m["objects"].items()}
    else:
        ent["anchors"] = {k: v["centre"] for k, v in objs.items()}
        ent["notes"] = {"anchors": "object centres only (existing part; the pathway code positions it with PartModels props)"}
    ent["tissues"] = {p: c for p, c in TISSUE.items() if any(o.startswith(p) for o in ent["objects"])}
    parts[name] = ent
json.dump({"version": 1, "source": "Z-Anatomy (with BodyParts3D), CC BY-SA 4.0", "worldOffsetNote": "worldOffset = the part's centre in the Z-Anatomy/atlas world frame (same frame as public/atlas/gross.glb), for aligning to the body",
           "parts": parts}, open(os.path.join(pub, "parts.json"), "w"), indent=1)
print("parts.json:", {k: (len(v["objects"]), len(v["anchors"])) for k, v in parts.items()})
