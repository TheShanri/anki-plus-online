# Lists the Z-Anatomy nerve curves the v3 tracer needs: splines, points, radius, bevel. Read-only.
#   blender --factory-startup --disable-autoexec -b Startup.blend -P probe_curves.py -- out.json
import bpy, sys, json, re
out = sys.argv[sys.argv.index("--") + 1]
RX = re.compile(r"(nerve|plexus|trunk of brachial|cord of brachial|division of|root of spinal|Roots of|Cauda|ganglion|Chorda|rami)", re.I)
res = []
for o in bpy.data.objects:
    if o.type != "CURVE" or not RX.search(o.name):
        continue
    d = o.data
    sp = []
    for s in d.splines:
        pts = s.bezier_points if s.type == "BEZIER" else s.points
        co = [list(o.matrix_world @ (p.co if s.type == "BEZIER" else p.co.xyz)) for p in pts]
        sp.append({"type": s.type, "n": len(pts), "a": [round(v, 4) for v in co[0]], "b": [round(v, 4) for v in co[-1]], "r": round(sum(p.radius for p in pts) / max(1, len(pts)), 3)})
    res.append({"name": o.name, "parent": o.parent.name if o.parent else None, "bevel": round(d.bevel_depth, 5), "bevobj": d.bevel_object.name if d.bevel_object else None, "splines": sp})
json.dump(res, open(out, "w"), indent=0)
print("curves", len(res))
