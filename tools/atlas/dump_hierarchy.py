# Run: blender --factory-startup --disable-autoexec -b Startup.blend -P dump_hierarchy.py -- out.json
import bpy, sys, json
out = sys.argv[sys.argv.index("--")+1]
def coll(c):
    objs=[]
    for o in c.objects:
        d={"name":o.name,"type":o.type}
        if o.type=="MESH":
            d["v"]=len(o.data.vertices); d["f"]=len(o.data.polygons); d["data"]=o.data.name
            d["mods"]=[m.type for m in o.modifiers]
        if o.parent: d["parent"]=o.parent.name
        d["hide"]=bool(o.hide_viewport or o.hide_get() if hasattr(o,'hide_get') else o.hide_viewport)
        objs.append(d)
    return {"name":c.name,"objects":objs,"children":[coll(x) for x in c.children]}
root=bpy.context.scene.collection
data={"scene":coll(root),"orphans":[o.name for o in bpy.data.objects if not o.users_collection]}
json.dump(data,open(out,"w"))
print("DONE",len(bpy.data.objects))
