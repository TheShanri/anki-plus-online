# Exports the body parts used by the pathway tracer from Z-Anatomy (CC BY-SA 4.0), centred on their own origin, real
# size in metres, Y up, anterior = +Z (same convention as the atlas glb files). One merged mesh per tissue group.
#   blender --factory-startup --disable-autoexec -b Startup.blend -P export_parts.py -- <outdir>
# then: tools/pathways/optimize.sh <outdir>/*.glb  (meshopt)
import bpy, bmesh, sys, os, re, json
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
WANT = os.environ.get("PARTS")
def want(n): return WANT is None or n in WANT.split(",")
os.makedirs(out, exist_ok=True)
dg = bpy.context.evaluated_depsgraph_get()
tmp = bpy.data.collections.new("_tmp")
bpy.context.scene.collection.children.link(tmp)

ALL = [o for o in bpy.data.objects if o.type == "MESH" and len(o.data.vertices) > 10]

def pick(rx, side=".l", excl=None):
    r = re.compile(rx, re.I)
    x = re.compile(excl, re.I) if excl else None
    return [o for o in ALL if o.name.endswith(side) and r.search(o.name) and not (x and x.search(o.name))]

def bake(o, max_verts):
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), depsgraph=dg)
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0:
        me.flip_normals()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    if len(me.vertices) > max_verts and len(me.polygons):
        t = bpy.data.objects.new("_t", me); tmp.objects.link(t)
        m = t.modifiers.new("d", "DECIMATE"); m.ratio = max(0.04, max_verts / len(me.vertices))
        bpy.context.view_layer.update()
        d2 = bpy.context.evaluated_depsgraph_get()
        me2 = bpy.data.meshes.new_from_object(t.evaluated_get(d2), depsgraph=d2)
        bpy.data.objects.remove(t); bpy.data.meshes.remove(me); me = me2
    for p in me.polygons:
        p.use_smooth = True
    return me

def merged(name, objs, max_verts):
    """Bake every object, join into one mesh object called `name`."""
    parts = []
    for o in objs:
        me = bake(o, max_verts)
        if not len(me.vertices):
            bpy.data.meshes.remove(me); continue
        t = bpy.data.objects.new(name, me); tmp.objects.link(t); parts.append(t)
    if not parts:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for t in parts: t.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    return ob

def export(fname, groups, centre_on=None):
    """groups: {name: (objs, max_verts)}. Centre on the bbox centre of `centre_on` (or of everything)."""
    obs = {n: merged(n, o, mv) for n, (o, mv) in groups.items() if o}
    obs = {n: o for n, o in obs.items() if o}
    pts = []
    for n, o in obs.items():
        if centre_on is None or n == centre_on:
            pts += [o.matrix_world @ v.co for v in o.data.vertices]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (mn + mx) / 2
    for o in obs.values():
        o.data.transform(__import__("mathutils").Matrix.Translation(-c))
        o.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    for o in obs.values(): o.select_set(True)
    bpy.context.view_layer.objects.active = list(obs.values())[0]
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, fname), export_format="GLB", use_selection=True, export_apply=False,
                              export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True)
    info = {n: [len(o.data.vertices), len(o.data.polygons)] for n, o in obs.items()}
    print("EXPORT", fname, "size(m)", tuple(round(x, 3) for x in (mx - mn)), info)
    for o in obs.values():
        bpy.data.objects.remove(o)

HAND_SKIN = r"^(Dorsum of hand|Dorsal surfaces of digits of hand|Palmar surfaces of digits of hand|Anterior region of forearm|Posterior region of forearm|Lateral border of forearm|Medial border of forearm)\.l$"
HAND_BONE = r"^(distal|middle|proximal) phalanx.*hand|^(first|second|third|fourth|fifth) metacarpal bone|^(scaphoid|lunate|triquetrum|pisiform|trapezium|trapezoid|capitate|hamate)( bone)?\.l|^radius\.l|^ulna\.l"
HAND_X = r"ligament|capsule|muscle|tendon|foot"
FOOT_SKIN = r"^(Dorsum of foot|Dorsal surfaces of digits of foot|Plantar surfaces of digits of foot|Lateral border of foot|Medial border of foot|Anterior region of leg|Posterior region of leg|Distal transverse arch of foot|Proximal transverse arch of foot|Lateral part of longitudinal arch of foot|Medial part of longitudinal arch of foot|Nail plate \(foot\))\.l$"
FOOT_BONE = r"^(distal|middle|proximal) phalanx.*foot|^(first|second|third|fourth|fifth) metatarsal bone|^(calcaneus|talus|navicular bone|cuboid bone|(medial|intermediate|lateral) cuneiform bone)\.l|^tibia\.l|^fibula\.l"

print("HAND skin", [o.name for o in pick(HAND_SKIN)])
print("HAND bone", [o.name for o in pick(HAND_BONE, excl=HAND_X)][:40])
print("FOOT bone", [o.name for o in pick(FOOT_BONE, excl="ligament|capsule|muscle|tendon")][:40])

if want("hand"): export("hand.glb", {
    "skin": (pick(HAND_SKIN), 900),
    "bone": (pick(HAND_BONE, excl=HAND_X), 350),
    "muscle": (pick(r"^(Flexor carpi radialis|Brachioradialis muscle|Extensor carpi radialis longus|Palmaris longus|Flexor digitorum superficialis|Pronator teres)\.l$"), 700),
}, centre_on="skin")
if want("foot"): export("foot.glb", {
    "skin": (pick(FOOT_SKIN), 900),
    "bone": (pick(FOOT_BONE, excl="ligament|capsule|muscle|tendon"), 350),
    "tendon": (pick(r"^Calcaneal tendon\.l$"), 900),
}, centre_on="skin")
if want("muscle"): export("muscle.glb", {
    "muscle": (pick(r"^Brachioradialis muscle\.l$"), 2500),
}, centre_on="muscle")
if want("eye"): export("eye.glb", {
    "sclera": (pick(r"^Sclera\.l$"), 900),
    "cornea": (pick(r"^Cornea\.l$"), 500),
    "iris": (pick(r"^Iris\.l$"), 900),
    "lens": (pick(r"^Lens\.l$"), 500),
    "retina": (pick(r"^Retina\.l$"), 900),
}, centre_on="sclera")

LEG_SKIN = r"^(Anterior region of thigh|Anterior region of knee|Anterior region of leg|Lateral region of thigh|Medial region of thigh)\.l$"
print("LEG skin", [o.name for o in pick(r"region of (thigh|knee)\.l$")])
print("LEG quad", [o.name for o in pick(r"femoris|vastus|patell|quadriceps|^femur")])
if want("leg"):
    export("leg.glb", {
        "skin": (pick(r"region of (thigh|knee|leg)\.l$", excl="posterior|calcaneal"), 900),
        "bone": (pick(r"^(Femur|Patella|Tibia|Fibula)\.l$"), 1200),
        "muscle": (pick(r"^(Rectus femoris|Vastus lateralis|Vastus medialis|Vastus intermedius) muscle\.l$|^Sartorius muscle\.l$"), 1000),
        "tendon": (pick(r"patellar ligament|quadriceps femoris tendon|tendon of quadriceps"), 600),
    }, centre_on="bone")
