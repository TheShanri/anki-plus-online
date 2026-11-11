# Lists Z-Anatomy object names matching a regex (meshes and curves), with their side suffix. Read-only.
#   blender --factory-startup --disable-autoexec -b Startup.blend -P probe_names.py -- "<regex>" out.txt
import bpy, sys, re
rx = re.compile(sys.argv[sys.argv.index("--") + 1], re.I)
out = sys.argv[sys.argv.index("--") + 2]
names = sorted(f"{o.type}\t{o.name}\t{len(o.data.vertices) if o.type == 'MESH' else ''}" for o in bpy.data.objects if rx.search(o.name))
open(out, "w", encoding="utf8").write("\n".join(names))
print("matches", len(names))
