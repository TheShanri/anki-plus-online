# Skull + spine layer for the Explore atlas, from Z-Anatomy (CC BY-SA 4.0). Same frame as public/atlas/gross.glb:
# Blender world baked into the vertices (no centring), exported Y-up (x, z, -y), so it lines up with the brain.
#   blender --factory-startup --disable-autoexec -b Startup.blend -P export_skull.py -- <outdir>
# writes <outdir>/skull.glb, <outdir>/spine-atlas.glb, <outdir>/skull-landmarks.json ; then meshopt (tools/pathways/optimize.sh).
import bpy, bmesh, sys, os, re, json, math
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)
OB = bpy.data.objects
tmp = bpy.data.collections.new("_tmp"); bpy.context.scene.collection.children.link(tmp)

def bake(o, max_verts=None):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me.flip_normals()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if bm.faces and not any(e.is_boundary for e in bm.edges):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    if max_verts and len(me.vertices) > max_verts and len(me.polygons):
        t = bpy.data.objects.new("_t", me); tmp.objects.link(t)
        m = t.modifiers.new("d", "DECIMATE"); m.ratio = max(0.04, max_verts / len(me.vertices))
        bpy.context.view_layer.update()
        d2 = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(t.evaluated_get(d2), depsgraph=d2)
        bpy.data.objects.remove(t); bpy.data.meshes.remove(me); me = me2
    for p in me.polygons: p.use_smooth = True
    return me

def verts(o):
    me = bake(o); vs = [v.co.copy() for v in me.vertices]; bpy.data.meshes.remove(me); return vs

def mean(vs): return sum(vs, Vector()) / len(vs)

def tree_of(names):
    bm = bmesh.new()
    for n in names:
        me = bake(OB[n]); bm.from_mesh(me); bpy.data.meshes.remove(me)
    bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    t = BVHTree.FromBMesh(bm); return t

def canal_gap(vs, z, half=0.003, xw=0.009):
    ys = sorted(v.y for v in vs if abs(v.z - z) < half and abs(v.x) < xw)
    if len(ys) < 4: return None
    return max((ys[i + 1] - ys[i], (ys[i + 1] + ys[i]) / 2) for i in range(len(ys) - 1))[1]

def tube(name, pts, r, sides=6):
    bm = bmesh.new(); rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.cross(Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))).normalized(); b = t.cross(a)
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * r) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me

def export(fname, items):
    """items: [(node name, mesh)] -> one glb, nodes named, world placement kept."""
    created = []
    for nm, me in items:
        t = bpy.data.objects.new(nm, me); tmp.objects.link(t); created.append(t)
    bpy.ops.object.select_all(action="DESELECT")
    for t in created: t.select_set(True)
    bpy.context.view_layer.objects.active = created[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, fname), export_format="GLB", use_selection=True, export_apply=False,
        export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True, export_cameras=False, export_lights=False, export_extras=False)
    print("EXPORT", fname, {n: len(m.vertices) for n, m in items})
    for t in created: bpy.data.objects.remove(t)

def merged_mesh(srcs, max_verts):
    bm = bmesh.new()
    for n in srcs:
        me = bake(OB[n]); bm.from_mesh(me); bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new("m"); bm.to_mesh(me); bm.free()
    t = bpy.data.objects.new("_m", me); tmp.objects.link(t)
    if len(me.vertices) > max_verts:
        m = t.modifiers.new("d", "DECIMATE"); m.ratio = max_verts / len(me.vertices)
        bpy.context.view_layer.update(); d2 = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(t.evaluated_get(d2), depsgraph=d2); bpy.data.objects.remove(t); bpy.data.meshes.remove(me); me = me2
    else:
        bpy.data.objects.remove(t)
    for p in me.polygons: p.use_smooth = True
    return me

gl = lambda p: [round(p.x, 5), round(p.z, 5), round(-p.y, 5)]    # Blender world -> glTF world (the atlas frame)

# ---------------------------------------------------------------- skull
BONES = [  # node name, source objects, max verts
    ("frontal-bone", ["Frontal bone"], 2600), ("parietal-bone_l", ["Parietal bone.l"], 2200), ("parietal-bone_r", ["Parietal bone.r"], 2200),
    ("temporal-bone_l", ["Temporal bone.l"], 3600), ("temporal-bone_r", ["Temporal bone.r"], 3600),
    ("occipital-bone", ["Occipital bone"], 2800), ("sphenoid-bone", ["Sphenoid bone"], 2800), ("ethmoid-bone", ["Ethmoid bone"], 1800),
    ("maxilla_l", ["Maxilla.l"], 2200), ("maxilla_r", ["Maxilla.r"], 2200), ("zygomatic-bone_l", ["Zygomatic bone.l"], 700), ("zygomatic-bone_r", ["Zygomatic bone.r"], 700),
    ("nasal-bone_l", ["Nasal bone.l"], 220), ("nasal-bone_r", ["Nasal bone.r"], 220), ("lacrimal-bone_l", ["Lacrimal bone.l"], 300), ("lacrimal-bone_r", ["Lacrimal bone.r"], 300),
    ("palatine-bone_l", ["Palatine bone.l"], 600), ("palatine-bone_r", ["Palatine bone.r"], 600), ("vomer", ["Vomer"], 350),
    ("inferior-nasal-concha_l", ["Inferior nasal concha bone.l"], 250), ("inferior-nasal-concha_r", ["Inferior nasal concha bone.r"], 250),
    ("mandible", ["Mandible"], 4000),
]
DURA = [("falx-cerebri", ["Falx cerebri"], 800), ("tentorium-cerebelli_l", ["Tentorium cerebelli.l"], 700), ("tentorium-cerebelli_r", ["Tentorium cerebelli.r"], 700)]

V = {n: verts(OB[s[0]]) for n, s, _ in BONES}
def region(name): return V[name]

# ---- sutures: contact lines between neighbouring bones (midpoints of vertex pairs closer than d), binned along the suture
def contact(a, b, d=0.0032):
    t = tree_of([dict((n, s[0]) for n, s, _ in BONES)[b]])
    pts = []
    for v in V[a]:
        loc, nrm, idx, dist = t.find_nearest(v)
        if loc is not None and dist < d: pts.append((v + loc) / 2)
    return pts

def path(pts, axis, n=36):
    lo, hi = min(p[axis] for p in pts), max(p[axis] for p in pts)
    bins = {}
    for p in pts: bins.setdefault(min(n - 1, int((p[axis] - lo) / (hi - lo + 1e-9) * n)), []).append(p)
    return [mean(bins[k]) for k in sorted(bins)]

sut = {}
sut["sagittal"] = path(contact("parietal-bone_l", "parietal-bone_r"), 1)
cor = contact("frontal-bone", "parietal-bone_l") + contact("frontal-bone", "parietal-bone_r"); sut["coronal"] = path(cor, 0, 44)
lam = contact("occipital-bone", "parietal-bone_l") + contact("occipital-bone", "parietal-bone_r"); sut["lambdoid"] = path(lam, 0, 44)
sut["squamous_l"] = path(contact("temporal-bone_l", "parietal-bone_l"), 1, 20); sut["squamous_r"] = path(contact("temporal-bone_r", "parietal-bone_r"), 1, 20)
print("SUTURE counts", {k: len(v) for k, v in sut.items()})

# ---- landmarks
LM = {}
sag = sut["sagittal"]; cr = sut["coronal"]; lb = sut["lambdoid"]
sag_ant = min(sag, key=lambda p: p.y); sag_post = max(sag, key=lambda p: p.y)
cmid = min(cr, key=lambda p: abs(p.x)); lmid = min(lb, key=lambda p: abs(p.x))
LM["bregma"] = (sag_ant + cmid) / 2; LM["lambda"] = (sag_post + lmid) / 2
bone_t = {n: tree_of([dict((n2, s[0]) for n2, s, _ in BONES)[n]]) for n in ("parietal-bone_l", "parietal-bone_r", "sphenoid-bone", "temporal-bone_l", "temporal-bone_r", "frontal-bone")}
for side, sx in (("l", 1), ("r", -1)):
    best = None
    for v in V["frontal-bone"]:
        if v.x * sx < 0.03: continue
        ds = []; ps = []
        for n in (f"parietal-bone_{side}", "sphenoid-bone", f"temporal-bone_{side}"):
            loc, _, _, dist = bone_t[n].find_nearest(v); ds.append(dist); ps.append(loc)
        sc = sum(ds)
        if best is None or sc < best[0]: best = (sc, (v + ps[0] + ps[1] + ps[2]) / 4)
    LM["pterion" + ("" if side == "l" else "_R")] = best[1]
# foramen magnum: ring of the occipital margin around the canal centre above the atlas
atlas = verts(OB["Atlas (C1)"]); zc = (OB["Foramen magnum.j"].matrix_world @ OB["Foramen magnum.j"].data.vertices[0].co).z
zc = 0.5 * (zc + (OB["Foramen magnum.j"].matrix_world @ OB["Foramen magnum.j"].data.vertices[1].co).z)
yc = canal_gap(atlas, max(v.z for v in atlas) - 0.004) or 0.03
occ = V["occipital-bone"]; ringp = []
for k in range(24):
    a = 2 * math.pi * k / 24; dv = Vector((math.cos(a), math.sin(a), 0))
    cand = [v for v in occ if abs(v.z - zc) < 0.005 and (Vector((v.x, v.y - yc, 0)).length > 0.003) and Vector((v.x, v.y - yc, 0)).normalized().dot(dv) > 0.96]
    if cand: ringp.append(min(cand, key=lambda v: Vector((v.x, v.y - yc, 0)).length));
LM["foramen_magnum"] = Vector((0, yc, zc)); ring = ringp
# cranial fossae: floor of the cranial cavity by ray-casting down from inside the vault
allb = tree_of([s[0] for n, s, _ in BONES if n not in ("mandible",)])
def floor(x, y):
    h = allb.ray_cast(Vector((x, y, 1.665)), Vector((0, 0, -1)), 0.12); up = allb.ray_cast(Vector((x, y, 1.665)), Vector((0, 0, 1)), 0.08)
    return h[0] if (h[0] is not None and up[0] is not None) else None
def fossa(x0, x1, y0, y1):
    pts = []
    for i in range(14):
        for j in range(14):
            f = floor(x0 + (x1 - x0) * i / 13, y0 + (y1 - y0) * j / 13)
            if f is not None: pts.append(f)
    return mean(pts) + Vector((0, 0, 0.0015)) if pts else None
FOS = {"fossa_anterior": (0.008, 0.032, -0.080, -0.030), "fossa_middle": (0.015, 0.050, -0.024, 0.0), "fossa_posterior": (-0.020, 0.020, 0.006, 0.060)}
for k, (x0, x1, y0, y1) in FOS.items():
    p = fossa(x0, x1, y0, y1)
    if p is None: continue
    if k == "fossa_posterior":
        LM[k] = p
        q = fossa(0.004, 0.030, y0, y1); LM[k + "_L"] = q; r = fossa(-0.030, -0.004, y0, y1); LM[k + "_R"] = r
    else:
        LM[k + "_L"] = p; LM[k + "_R"] = fossa(-x1, -x0, y0, y1)
# named foramina / canals / sella from Z-Anatomy's own leader lines, snapped to the nearest bone surface
LAB = {"foramen_ovale": "Foramen ovale", "foramen_spinosum": "Foramen spinosum", "optic_canal": "Optic canal", "hypoglossal_canal": "Hypoglossal canal",
       "jugular_foramen": "Jugular notch of occipital bone", "foramen_caecum": "Foramen caecum of frontal bone", "sella_turcica": "Sella turcica",
       "dorsum_sellae": "Dorsum sellae", "tuberculum_sellae": "Tuberculum sellae"}
for k, nme in LAB.items():
    o = OB[nme + ".j"]; ps = [o.matrix_world @ v.co for v in o.data.vertices]
    lo = min(ps, key=lambda p: p.z); hi = max(ps, key=lambda p: p.z)
    loc, _, _, d = allb.find_nearest(hi if k not in ("sella_turcica", "dorsum_sellae", "tuberculum_sellae") else lo)
    LM[k] = loc if loc is not None else hi
    print("LABEL", k, "dist to bone", round(d, 4))

export_sut = []
for k, pts in sut.items():
    if len(pts) > 2: export_sut.append(("suture-" + k, tube("s", pts, 0.0007)))

items = []
for n, s, mv in BONES: items.append((n, merged_mesh(s, mv)))
for n, s, mv in DURA: items.append((n, merged_mesh(s, mv)))
items += export_sut
export("skull.glb", items)

# ---------------------------------------------------------------- spine for the atlas
lv = ["C1", "C2"] + [f"C{i}" for i in range(3, 8)] + [f"T{i}" for i in range(1, 13)] + [f"L{i}" for i in range(1, 6)]
nm = {"C1": "Atlas (C1)", "C2": "Axis (C2)"}
items = []; SP = {}
for l in lv:
    n = nm.get(l, f"Vertebra {l}"); vs = verts(OB[n]); items.append(("vertebra-" + l.lower(), merged_mesh([n], 800)))
    ys = sorted(v.y for v in vs); body = [v for v in vs if v.y < ys[int(len(ys) * 0.28)]]; b = mean(body)
    yf = canal_gap(vs, b.z); near = [v for v in vs if abs(v.z - b.z) < 0.01]
    SP[l] = {"body": gl(b), "foramen": gl(Vector((0, yf if yf is not None else (ys[0] + ys[-1]) / 2, b.z))), "spinous": gl(max(vs, key=lambda v: v.y)),
             "transverse_l": gl(max(near, key=lambda v: v.x)), "transverse_r": gl(min(near, key=lambda v: v.x))}
items.append(("sacrum", merged_mesh(["Sacrum"], 1500))); items.append(("coccyx", merged_mesh(["Coccyx"], 400)))
for o in [o for o in OB if o.name.startswith("Intervertebral disc ") and o.type == "MESH"]:
    items.append(("disc-" + o.name.split()[-1].lower(), merged_mesh([o.name], 200)))
items.append(("spinal-dura", merged_mesh(["Spinal dura"], 3500)))
items.append(("spinal-ganglion_l", merged_mesh(["Spinal ganglion.l"], 1200))); items.append(("spinal-ganglion_r", merged_mesh(["Spinal ganglion.r"], 1200)))
export("spine-atlas.glb", items)

meta = {"frame": "glTF world, identical to public/atlas/gross.glb: metres, Y up, anterior +Z, patient's left +X (x, z, -y of Blender world)",
        "landmarks": {k: gl(v) for k, v in LM.items()},
        "foramen_magnum_ring": [gl(p) for p in ring],
        "sutures": {k: [gl(p) for p in pts] for k, pts in sut.items()},
        "vertebrae": SP,
        "notes": {"sutures": "Z-Anatomy has no suture geometry; the paths are the contact lines between neighbouring bone meshes (midpoints of vertex pairs under 3.2 mm), binned along the suture, and drawn as thin tubes (suture-*).",
                  "foramina": "Snapped to the nearest bone surface from Z-Anatomy's own leader-line labels. foramen_rotundum is not given: its label sits on the orbit, not the foramen.",
                  "fossae": "Mean of the cranial floor sampled by ray-casting down from inside the vault: fossa_anterior / middle (L, R) and fossa_posterior (centre, L, R).",
                  "vertebrae": "Each vertebra is ONE mesh in Z-Anatomy (body, arch and processes are not separate meshes). Per-vertebra points: body centre, vertebral foramen centre, spinous tip, left/right transverse process tips.",
                  "missing": "No arachnoid or pia meshes in Z-Anatomy; dura exists as falx cerebri, tentorium cerebelli (L, R) and spinal dura."}}
json.dump(meta, open(os.path.join(out, "skull-landmarks.json"), "w"), indent=1)
print("ALLDONE")
