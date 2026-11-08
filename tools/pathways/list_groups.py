# blender -b Startup.blend -P list_groups.py -- out.txt : group (.g empty) names that look like hand / foot / face / eye parts, with mesh counts
import bpy, sys, re
out = sys.argv[sys.argv.index("--") + 1]
pat = re.compile(r"hand|foot|forearm|\bleg\b|face|facial|head|eyeball|skin|integument|nail|muscles of|bones of|skeleton of|tendon", re.I)
groups = {}
for o in bpy.data.objects:
    if o.type == "EMPTY" and o.name.endswith(".g") and pat.search(o.name):
        kids = [c for c in o.children_recursive if c.type == "MESH" and c.name.endswith((".l", ".r")) is not None]
        verts = sum(len(c.data.vertices) for c in kids if c.type == "MESH")
        groups[o.name] = (len(kids), verts)
with open(out, "w", encoding="utf8") as f:
    for k in sorted(groups):
        f.write(f"{k} | meshes {groups[k][0]} | verts {groups[k][1]}\n")
print("WROTE", len(groups))
