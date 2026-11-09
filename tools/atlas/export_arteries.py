# Exports the cerebral arteries from Z-Anatomy (CC BY-SA 4.0) for the Blood supply mode:
#   public/atlas/arteries.glb        one named tube mesh per artery segment, SAME world space as gross.glb
#                                    (Blender world (x, y, z) -> glTF (x, z, -y), no re-centring)
#   public/atlas/arteries-flow.json  per segment: artery id, side, flow mode, radius, and centrelines
#                                    (oriented proximal -> distal, glTF metres) read from the source splines
# Run (about 2 minutes):
#   tools/blender/blender-4.2.9-windows-x64/blender.exe --factory-startup --disable-autoexec -b \
#     _atlas/raw/z-anatomy-extract/Z-Anatomy/Startup.blend -P tools/atlas/export_arteries.py -- <outdir>
# then: npx @gltf-transform/cli optimize <outdir>/arteries.glb public/atlas/arteries.glb --compress meshopt \
#         --texture-compress false --simplify false --instance false --palette false
# and copy <outdir>/arteries-flow.json to public/atlas/.
import bpy, bmesh, sys, os, re, json, math
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)

# (regex on the source object name, slug, supply-map artery id, parent slug (for proximal orientation), tube radius in mm, flow)
# flow: "fwd" = proximal -> distal, "both" = communicating artery (direction depends on pressure), "up" = vertebral/ICA (blood goes up)
SEG = [
    (r"^Internal carotid artery", "ica", "ica", None, 2.6, "fwd"),
    (r"^Vertebral artery", "vertebral", "vert", None, 1.9, "fwd"),
    (r"^Basilar artery$", "basilar", "pontine", "vertebral", 2.0, "fwd"),
    (r"^Anterior cerebral artery", "aca", "aca", "ica", 1.5, "fwd"),
    (r"^Anterior communicating artery$", "acom", "aca", None, 0.9, "both"),
    (r"^Pericallosal artery", "pericallosal", "aca", "aca", 1.0, "fwd"),
    (r"^Callosomarginal artery", "callosomarginal", "aca", "aca", 0.7, "fwd"),
    (r"^Frontal branches of callosomarginal", "callosomarginal-frontal", "aca", "callosomarginal", 0.45, "fwd"),
    (r"^Orbitofrontal branches of anterior cerebral", "orbitofrontal", "aca", "aca", 0.6, "fwd"),
    (r"^Middle cerebral artery \(M1", "mca-m1", "mca", "ica", 1.8, "fwd"),
    (r"^Insular branches of middle cerebral", "mca-m2", "mca", "mca-m1", 0.9, "fwd"),
    (r"^Middle cerebral artery \(M3", "mca-m3", "mca", "mca-m2", 0.8, "fwd"),
    (r"^Temporal branches of middle cerebral", "mca-temporal", "mca", "mca-m1", 0.7, "fwd"),
    (r"^Parietal branches of middle cerebral", "mca-parietal", "mca", "mca-m3", 0.6, "fwd"),
    (r"^Artery of central sulcus", "central-sulcus", "mca", "mca-m3", 0.45, "fwd"),
    (r"^Artery of precentral sulcus", "precentral-sulcus", "mca", "mca-m3", 0.45, "fwd"),
    (r"^Proximal lateral striate", "lenticulostriate-prox", "lenti", "mca-m1", 0.4, "fwd"),
    (r"^Distal lateral striate", "lenticulostriate-dist", "lenti", "mca-m1", 0.35, "fwd"),
    (r"^Posterior communicating artery", "pcom", "pcomm", "ica", 0.9, "both"),
    (r"^Posterior cerebral artery", "pca", "pca", "basilar", 1.5, "fwd"),
    (r"^Superior cerebellar artery", "sca", "sca", "basilar", 0.9, "fwd"),
    (r"^Anterior inferior cerebellar artery", "aica", "aica", "basilar", 0.8, "fwd"),
    (r"^Posterior inferior cerebellar artery", "pica", "pica", "vertebral", 1.0, "fwd"),
    (r"^Medial pontine branches of basilar", "pontine-medial", "pontine", "basilar", 0.45, "fwd"),
    (r"^Lateral pontine branches of basilar", "pontine-lateral", "pontine", "basilar", 0.5, "fwd"),
    (r"^Anterior spinal artery", "anterior-spinal", "asa", "vertebral", 0.6, "fwd"),
]
SIZE_SCALE = 1.25  # tubes a little thicker than life so they read at atlas zoom

objs = [o for o in bpy.data.objects if o.type in ("MESH", "CURVE")
        and any(c.name.startswith("5:") for c in o.users_collection)]
dg = bpy.context.evaluated_depsgraph_get()
tmp = bpy.data.collections.new("_tmp")
bpy.context.scene.collection.children.link(tmp)

def gl(v):  # Blender world -> glTF Y-up
    return (v.x, v.z, -v.y)

def sample_spline(sp, mw, per_seg=6):
    """World-space polyline (Vector list) of one spline."""
    pts = []
    if sp.type == "BEZIER":
        bp = sp.bezier_points
        for i in range(len(bp) - 1):
            a, b = bp[i], bp[i + 1]
            p0, p1, p2, p3 = a.co, a.handle_right, b.handle_left, b.co
            for k in range(per_seg):
                t = k / per_seg
                u = 1 - t
                pts.append(u**3 * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t**3 * p3)
        pts.append(bp[-1].co.copy())
    else:
        pts = [Vector(p.co[:3]) for p in sp.points]
    return [mw @ p for p in pts]

def resample(pts, n):
    d = [0.0]
    for i in range(1, len(pts)):
        d.append(d[-1] + (pts[i] - pts[i - 1]).length)
    L = d[-1]
    if L <= 0:
        return pts, 0.0
    res = []
    j = 0
    for k in range(n):
        s = L * k / (n - 1)
        while j < len(d) - 2 and d[j + 1] < s:
            j += 1
        seg = d[j + 1] - d[j] or 1
        t = (s - d[j]) / seg
        res.append(pts[j].lerp(pts[j + 1], min(1, max(0, t))))
    return res, L

segments = {}   # name -> record
to_export = []  # (name, mesh)
info = []
for o in sorted(objs, key=lambda o: o.name):
    hit = None
    for rx, slug, art, parent, rad, flow in SEG:
        if re.search(rx, o.name):
            hit = (slug, art, parent, rad, flow)
            break
    if not hit:
        continue
    slug, art, parent, rad, flow = hit
    m = re.search(r"\.([lr])$", o.name)
    side = m.group(1) if m else "m"
    name = slug + ("." + side if side != "m" else "")
    mw = o.matrix_world
    lines = []
    if o.type == "CURVE":
        d = o.data
        info.append("%s bevel=%.5f ext=%.5f res=%d taper=%s splines=%d" % (o.name, d.bevel_depth, d.extrude, d.bevel_resolution, d.taper_object, len(d.splines)))
        for sp in d.splines:
            pts = sample_spline(sp, mw)
            if len(pts) >= 2:
                lines.append(pts)
        # re-bevel to a controlled radius; drop any taper so the tube is even
        d.taper_object = None
        d.bevel_mode = "ROUND"
        d.bevel_depth = rad * 0.001 * SIZE_SCALE
        d.extrude = 0
        d.bevel_resolution = 2
        d.resolution_u = 5
        d.use_fill_caps = True
    else:  # ACom is a small mesh: centreline = principal axis
        me0 = o.data
        vs = [mw @ v.co for v in me0.vertices]
        c = sum(vs, Vector()) / len(vs)
        ax = max(((a - b) for a in vs for b in vs), key=lambda v: v.length)
        lo = min(vs, key=lambda v: (v - c).dot(ax))
        hi = max(vs, key=lambda v: (v - c).dot(ax))
        lines.append([lo, hi])
    if not lines:
        continue
    oe = o.evaluated_get(dg) if o.type == "MESH" else None
    if o.type == "CURVE":
        bpy.context.view_layer.update()
        dg2 = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(o.evaluated_get(dg2), depsgraph=dg2)
    else:
        me = bpy.data.meshes.new_from_object(oe, depsgraph=dg)
    me.transform(mw)
    if mw.determinant() < 0:
        me.flip_normals()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    if not len(me.vertices):
        bpy.data.meshes.remove(me)
        continue
    to_export.append((name, me))
    segments[name] = {"slug": slug, "artery": art, "side": side, "parent": parent, "radius": rad, "flow": flow, "raw": lines}
print("INFO\n" + "\n".join(info))

# ---- orientation: proximal end = the end of each line nearest the parent's polyline (roots: lowest point)
def poly_all(nm):
    r = []
    for ln in segments[nm]["raw"]:
        r += ln
    return r

def parent_name(nm, side):
    p = segments[nm]["parent"]
    if not p:
        return None
    for cand in (p + "." + side, p):
        if cand in segments:
            return cand
    return None

def mind(pt, pts):
    return min((pt - q).length for q in pts)

out_segs = {}
for name, rec in segments.items():
    pn = parent_name(name, rec["side"])
    oriented = []
    for ln in rec["raw"]:
        a, b = ln[0], ln[-1]
        if pn:
            pp = poly_all(pn)
            flip = mind(b, pp) < mind(a, pp)
        elif rec["flow"] == "both":
            flip = False
        else:
            flip = b.z < a.z  # roots (ICA, vertebral): blood enters low (Blender z up)
        if rec["slug"] == "anterior-spinal":
            flip = a.z < b.z  # runs down the cord
        if flip:
            ln = ln[::-1]
        plen = sum((ln[i] - ln[i - 1]).length for i in range(1, len(ln)))
        pts, L = resample(ln, max(6, min(28, int(plen / 0.0035) + 2)))
        oriented.append((pts, L))
    # communicating arteries: orient left -> right / anterior -> posterior for a stable arrow
    out_segs[name] = {
        "artery": rec["artery"], "side": rec["side"], "flow": rec["flow"], "radius": round(rec["radius"] * 0.001 * SIZE_SCALE, 5),
        "parent": pn,
        "lines": [[round(c, 5) for p in pts for c in gl(p)] for pts, L in oriented if L > 0],
    }

# ---- glb: one named object per segment, no recentring
created = []
for name, me in to_export:
    t = bpy.data.objects.new(name, me); tmp.objects.link(t); created.append(t)
bpy.ops.object.select_all(action="DESELECT")
for t in created:
    t.select_set(True)
bpy.context.view_layer.objects.active = created[0]
bpy.ops.export_scene.gltf(filepath=os.path.join(out, "arteries.glb"), export_format="GLB", use_selection=True, export_apply=False,
                          export_materials="NONE", export_normals=True, export_texcoords=False, export_yup=True,
                          export_cameras=False, export_lights=False, export_extras=False)
json.dump({"version": 1, "note": "Centrelines oriented proximal -> distal, glTF metres, flat xyz arrays, same space as gross.glb. Source: Z-Anatomy (CC BY-SA 4.0).", "segments": out_segs},
          open(os.path.join(out, "arteries-flow.json"), "w"), separators=(",", ":"))
print("EXPORTED", len(created), sorted(out_segs))
print("ALLDONE")
