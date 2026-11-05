# Z-Anatomy nervous-system exporter. Run headless with Blender:
#   blender --factory-startup --disable-autoexec -b Startup.blend -P export_atlas.py -- <outdir>
# Writes <outdir>/s/<id>.glb (one per structure / L-R pair), <outdir>/context.glb, <outdir>/export_meta.json
import bpy, bmesh, sys, os, re, json, math
from mathutils import Vector
out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(os.path.join(out, "s"), exist_ok=True)

objs = {o.name: o for o in bpy.data.objects}
def chain(o):
    c = []
    while o.parent:
        o = o.parent; c.append(o.name)
    return c
def in_coll(o, prefix):
    return any(c.name.startswith(prefix) for c in o.users_collection)

EXCL = re.compile(r"eyeball|chamber|cornea|iris\b|^lens|retina|sclera|vitreous|lacrimal|canaliculus|cochlea\b|vestibule\b|tympanic|auditory tube|ampulla|suspensory|sympathetic|Ciliary|Nervous system & Sense|^Take a picture|^HOW TO", re.I)
VASC = re.compile(r"cerebral art|communicating artery|basilar artery|vertebral artery|internal carotid|cerebellar artery|pericallosal|pontine branches|sinus|sagittal|confluence|basilar venous plexus", re.I)
VASC_X = re.compile(r"coronary|renal|paranasal|lymph|sinus venosus|sinus of|carotid sinus|aortic", re.I)
ROOTS = re.compile(r"root of spinal nerve|^Cauda equina|^Central canal|^Cochlear nerve|^Vestibular nerve|trigeminal nerve", re.I)

sel = []
for o in objs.values():
    if o.type not in ("MESH", "CURVE"): continue
    if o.name.endswith((".j", ".g", ".t", ".i", ".st")): continue
    if o.type == "MESH" and len(o.data.vertices) <= 10: continue
    if EXCL.search(o.name): continue
    ch = chain(o)
    ok = False
    if in_coll(o, "7:"):
        if o.type == "CURVE":
            ok = ("Cranial nerves.g" in ch) or bool(ROOTS.search(o.name))
        else:
            ok = "Peripheral nervous system.g" not in ch or "Ganglia.g" in ch or bool(ROOTS.search(o.name)) or "Cranial nerves.g" in ch
    elif in_coll(o, "5:"):
        ok = bool(VASC.search(o.name)) and not VASC_X.search(o.name)
    if ok: sel.append(o)
print("SELECTED", len(sel))

dg = bpy.context.evaluated_depsgraph_get()
tmpcoll = bpy.data.collections.new("_tmp"); bpy.context.scene.collection.children.link(tmpcoll)

def world_bbox(me):
    xs = [v.co for v in me.vertices]
    mn = Vector((min(v.x for v in xs), min(v.y for v in xs), min(v.z for v in xs)))
    mx = Vector((max(v.x for v in xs), max(v.y for v in xs), max(v.z for v in xs)))
    return mn, mx
th = [o for o in sel if o.name.startswith(("Thalamus", "Pons.l"))]
brain_ext = 0.17
if th:
    me0 = bpy.data.meshes.new_from_object(th[0].evaluated_get(dg), depsgraph=dg); me0.transform(th[0].matrix_world)
    mn, mx = world_bbox(me0); print("PROBE", th[0].name, tuple(mn), tuple(mx), "unit_scale", bpy.context.scene.unit_settings.scale_length)
    brain_ext = (mx - mn).length / 0.05 * 0.17
print("brain_ext", brain_ext)

def bake(o, max_verts=None):
    if o.type == "CURVE":
        d = o.data
        if d.bevel_depth == 0 and d.extrude == 0 and not d.bevel_object:
            d.bevel_depth = brain_ext * 0.0025; d.bevel_resolution = 1
            print("BEVELED", o.name)
    oe = o.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(oe, depsgraph=dg)
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0: me.flip_normals()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    if max_verts and len(me.vertices) > max_verts and len(me.polygons) > 0:
        t = bpy.data.objects.new("_t", me); tmpcoll.objects.link(t)
        m = t.modifiers.new("d", "DECIMATE"); m.ratio = max(0.03, max_verts / len(me.vertices))
        bpy.context.view_layer.update()
        d2 = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(t.evaluated_get(d2), depsgraph=d2)
        bpy.data.objects.remove(t); bpy.data.meshes.remove(me); me = me2
    for p in me.polygons: p.use_smooth = True
    return me

def norm_base(name):
    b = re.sub(r"\.[lr]$", "", name)
    b = re.sub(r"[ -]segment", "", b)
    return b
def side_of(name):
    m = re.search(r"\.([lr])$", name); return m.group(1) if m else "m"
def slug(b):
    return re.sub(r"[^a-z0-9]+", "-", b.lower().replace("*", "")).strip("-")

def export_objs(path, items):
    created = []
    for nm, me in items:
        t = bpy.data.objects.new(nm, me); tmpcoll.objects.link(t); created.append(t)
    bpy.ops.object.select_all(action="DESELECT")
    for t in created: t.select_set(True)
    bpy.context.view_layer.objects.active = created[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=False,
        export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True,
        export_cameras=False, export_lights=False, export_extras=False)
    for t in created: bpy.data.objects.remove(t)

def stats(me):
    return [(v.co.x, v.co.z, -v.co.y) for v in me.vertices]  # glTF Y-up

groups = {}
for o in sel: groups.setdefault(norm_base(o.name), []).append(o)
meta = {"entries": {}, "brain_ext": brain_ext}
used = set()
for base, lst in sorted(groups.items()):
    sid = slug(base)
    if sid in used: sid = sid + "-2"
    used.add(sid)
    items = []; allv = []; tris = 0; srcs = []
    for o in lst:
        me = bake(o, max_verts=3000 if "Spinal dura" in o.name else 3500)
        if len(me.vertices) == 0 or len(me.polygons) == 0:
            print("EMPTY", o.name); bpy.data.meshes.remove(me); continue
        items.append((o.name, me)); allv += stats(me); tris += len(me.polygons); srcs.append(o.name)
    if not items: continue
    export_objs(os.path.join(out, "s", sid + ".glb"), items)
    for _, me in items: bpy.data.meshes.remove(me)
    mn = [min(v[i] for v in allv) for i in range(3)]; mx = [max(v[i] for v in allv) for i in range(3)]
    cen = [sum(v[i] for v in allv) / len(allv) for i in range(3)]
    sides = sorted({side_of(s) for s in srcs})
    meta["entries"][sid] = {"id": sid, "name": re.sub(r"\s+", " ", base.replace("*", "")).strip(), "sources": srcs,
        "side": "lr" if sides == ["l", "r"] else sides[0], "chain": chain(lst[0]), "bbox": [mn, mx], "centroid": cen,
        "tris": tris, "coll": [c.name for c in lst[0].users_collection][:1]}
print("EXPORTED", len(meta["entries"]))
json.dump(meta, open(os.path.join(out, "export_meta.json"), "w"))

# ---- context shell
CORT = ("Frontal lobe.g", "Parietal lobe.g", "Temporal lobe.g", "Occipital lobe.g", "Limbic lobe.g", "Insula.g")
ctx = {"ctx_cerebrum": [], "ctx_cerebellum": [], "ctx_brainstem": [], "ctx_cord": []}
for o in sel:
    ch = chain(o); n = o.name
    if any(c in ch for c in CORT):
        if re.search(r"sulc", n, re.I) and not re.search(r"gyr|pole|plane", n, re.I): continue
        ctx["ctx_cerebrum"].append(o)
    elif "Cerebellum.g" in ch and "Cerebellar peduncles.g" not in ch: ctx["ctx_cerebellum"].append(o)
    elif re.match(r"(Pons|Medulla oblongata|Midbrain)\.[lr]$", n): ctx["ctx_brainstem"].append(o)
    elif n == "White matter of spinal cord": ctx["ctx_cord"].append(o)
items = []; sizes = {}
for key, lst in ctx.items():
    if not lst: continue
    bm = bmesh.new()
    for o in lst:
        me = bake(o, max_verts=None if key == "ctx_cerebrum" else 2000)
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    if key == "ctx_cord":
        lows = [v.co.z for o in ctx["ctx_brainstem"] if o.name.startswith("Medulla") for v in bake(o).vertices]
        zmin = min(lows) - brain_ext * 0.45
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, zmin), plane_no=(0, 0, 1), clear_inner=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=brain_ext * 0.0003)
    me = bpy.data.meshes.new(key); bm.to_mesh(me); bm.free()
    nv = len(me.vertices)
    t = bpy.data.objects.new("_t", me); tmpcoll.objects.link(t)
    m = t.modifiers.new("d", "DECIMATE"); m.ratio = 0.5 if key == "ctx_cerebrum" else 0.7
    bpy.context.view_layer.update(); dg2 = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(t.evaluated_get(dg2), depsgraph=dg2)
    bpy.data.objects.remove(t); bpy.data.meshes.remove(me)
    for p in me2.polygons: p.use_smooth = True
    items.append((key, me2)); sizes[key] = (nv, len(me2.vertices))
print("CTX", sizes)
export_objs(os.path.join(out, "context.glb"), items)
print("ALLDONE")
