# blender -b Startup.blend -P list_objs.py -- out.txt   : lists candidate objects for the pathway body parts
import bpy, sys, re
out = sys.argv[sys.argv.index("--") + 1]
pat = re.compile(r"eyeball|retina|cornea|iris|lens|sclera|optic nerve|^skin|hand|forearm|biceps brachii|brachioradialis|flexor carpi|extensor carpi|foot|leg|gastrocnemius|achilles|calcaneal tendon|head|face|facial skin|skull|palmar", re.I)
rows = []
for o in bpy.data.objects:
    if o.type != "MESH":
        continue
    if pat.search(o.name):
        rows.append((o.name, len(o.data.vertices), [c.name for c in o.users_collection][:2], o.parent.name if o.parent else ""))
rows.sort()
with open(out, "w", encoding="utf8") as f:
    for r in rows:
        f.write(f"{r[0]} | {r[1]} | {r[2]} | {r[3]}\n")
print("WROTE", len(rows))
