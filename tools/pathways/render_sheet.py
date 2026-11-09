# Contact sheet of exported glb parts (Blender Workbench, headless).
#   blender -b -P render_sheet.py -- out_prefix a.glb[;b.glb...] [points.json]
# Writes <out_prefix>_<view>.png for front/left/top/oblique; combine with PIL. points.json: {name:[x,y,z]} in glTF space (drawn as small spheres).
import bpy, sys, json, math, re
from mathutils import Vector
argv = sys.argv[sys.argv.index("--") + 1:]
prefix, glbs = argv[0], argv[1].split(";")
pts = json.load(open(argv[2])) if len(argv) > 2 else {}
bpy.ops.wm.read_factory_settings(use_empty=True)
for g in glbs: bpy.ops.import_scene.gltf(filepath=g)
COL = [("bone", (0.93, 0.89, 0.78)), ("muscle", (0.72, 0.25, 0.28)), ("vessel", (0.85, 0.15, 0.15)), ("nerve", (0.95, 0.85, 0.3)), ("gland", (0.85, 0.65, 0.4)),
       ("cartilage", (0.6, 0.75, 0.85)), ("disc", (0.3, 0.7, 0.7)), ("dura", (0.55, 0.6, 0.9)), ("suture", (0.1, 0.1, 0.1)), ("organ", (0.9, 0.55, 0.55))]
def colour(n):
    n = n.lower()
    if re.match(r"(vertebra|sacrum|coccyx|.*bone|vomer|mandible)", n) and not n.startswith("bone_") is False: pass
    for k, c in COL:
        if n.startswith(k): return c + (1,)
    if "suture" in n: return (0.05, 0.05, 0.05, 1)
    if "falx" in n or "tentorium" in n or "dura" in n: return (0.5, 0.6, 0.95, 1)
    if "disc" in n: return (0.3, 0.7, 0.7, 1)
    if "ganglion" in n: return (0.95, 0.85, 0.3, 1)
    return (0.93, 0.89, 0.78, 1)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
allp = []
for o in meshes:
    o.color = colour(o.name)
    for v in o.data.vertices: allp.append(o.matrix_world @ v.co)
mn = Vector((min(p.x for p in allp), min(p.y for p in allp), min(p.z for p in allp))); mx = Vector((max(p.x for p in allp), max(p.y for p in allp), max(p.z for p in allp)))
c = (mn + mx) / 2; ext = max(mx - mn)
for k, p in pts.items():
    bpy.ops.mesh.primitive_uv_sphere_add(radius=ext * 0.012, location=(p[0], -p[2], p[1]), segments=10, ring_count=6)
    s = bpy.context.object; s.color = (0.1, 0.9, 0.2, 1)
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x = 700; sc.render.resolution_y = 700
sh = sc.display.shading; sh.light = "STUDIO"; sh.color_type = "OBJECT"; sh.show_cavity = True; sh.cavity_type = "BOTH"
sc.view_settings.view_transform = "Standard"; sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.06, 0.05, 0.09)
sc.render.film_transparent = False
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = ext * 1.15
views = {"front": (0, -1, 0), "left": (1, 0, 0), "top": (0, 0, 1), "oblique": (0.9, -1, 0.5)}
for name, d in views.items():
    d = Vector(d).normalized(); cam.location = c + d * ext * 3
    up = Vector((0, 1, 0)) if name == "top" else Vector((0, 0, 1))
    cam.rotation_euler = (c - cam.location).to_track_quat("-Z", "Y").to_euler()
    if name == "top": cam.rotation_euler = (0, 0, 0)
    sc.render.filepath = f"{prefix}_{name}.png"; bpy.ops.render.render(write_still=True)
print("RENDERED", len(meshes), "meshes, extent", ext)
