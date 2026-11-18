# Dumps the Z-Anatomy (CC BY-SA 4.0) venous splines, the ICA and a few dura bboxes in glTF metres (x, z, -y) for build.py.
# Run: tools/blender/blender-4.2.9-windows-x64/blender.exe --factory-startup --disable-autoexec -b
#   _atlas/raw/z-anatomy-extract/Z-Anatomy/Startup.blend -P tools/atlas/veins/dump_splines.py -- _atlas/raw/veins/splines.json
import bpy, json, sys
from mathutils import geometry, Vector
out = sys.argv[sys.argv.index("--") + 1]
names = ["Superior sagittal sinus","Inferior sagittal sinus","Straight sinus","Transverse sinus.l","Transverse sinus.r","Sigmoid sinus.l","Sigmoid sinus.r","Occipital sinus","Superior petrosal sinus.l","Superior petrosal sinus.r","Inferior petrosal sinus.l","Inferior petrosal sinus.r","Anterior intercavernous sinus","Posterior intercavernous sinus","Internal jugular vein.l","Internal jugular vein.r","Internal carotid artery.l","Internal carotid artery.r","Superior ophthalmic vein.l"]
g = lambda v: [round(v.x,5), round(v.z,5), round(-v.y,5)]
res = {}
for n in names:
    o = bpy.data.objects[n]; M = o.matrix_world
    s = o.data.splines[0]
    ctrl = []
    if s.type == "BEZIER":
        bp = s.bezier_points
        pts = []
        for i in range(len(bp)-1):
            seg = geometry.interpolate_bezier(M@bp[i].co, M@bp[i].handle_right, M@bp[i+1].handle_left, M@bp[i+1].co, 17)
            for k, p in enumerate(seg[:-1] if i < len(bp)-2 else seg):
                t = k/16; r = bp[i].radius*(1-t)+bp[i+1].radius*t
                pts.append(g(p)+[round(r,3)])
        ctrl = [g(M@b.co)+[round(b.radius,3)] for b in bp]
    else:
        pts = [g(M@Vector(p.co[:3]))+[round(p.radius,3)] for p in s.points]
        ctrl = pts
    res[n] = {"type": s.type, "bevel": o.data.bevel_depth, "scale": list(M.to_scale()), "ctrl": ctrl, "pts": pts}
for n in ["Cavernous sinus.l","Falx cerebri","Tentorium cerebelli.l","Basilar venous plexus"]:
    o = bpy.data.objects[n]; vs = [o.matrix_world@v.co for v in o.data.vertices]
    res[n] = {"bbox": [g(Vector((min(v.x for v in vs),min(v.y for v in vs),min(v.z for v in vs)))), g(Vector((max(v.x for v in vs),max(v.y for v in vs),max(v.z for v in vs))))], "n": len(vs)}
json.dump(res, open(out,"w"))
print("DONE")
