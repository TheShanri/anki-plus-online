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

NORM = {"Ascending aorta", "Aortic arch", "Thoracic aorta", "Brachiocephalic trunk", "Left common carotid artery", "Right common carotid artery", "Left subclavian artery", "Right subclavian artery", "Internal carotid artery.l", "Internal carotid artery.r", "External carotid artery.l", "External carotid artery.r", "Left main bronchus", "Right main bronchus", "Left superior lobar bronchus", "Left inferior lobar bronchus", "Right superior lobar bronchus", "Intermediate bronchus.r", "Middle lobar bronchus.r", "Right inferior lobar bronchus"}
WELD = False   # new parts (spine/thorax/gut/head-targets): weld + recompute normals; the original five stay byte-reproducible

def bake(o, max_verts, radius=None, clip=None):
    if o.type == "CURVE" and radius:
        d = o.data
        if o.name in NORM:   # Z-Anatomy keeps its vessel calibre in the per-point radii: scale to a target mean radius
            rs = [p.radius for sp in d.splines for p in (sp.bezier_points if sp.type == "BEZIER" else sp.points)]
            radius = radius / (sum(rs) / len(rs))
        d.bevel_depth = radius; d.bevel_resolution = 2; d.use_fill_caps = True
        o.update_tag(); bpy.context.view_layer.update()
    dgl = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dgl), depsgraph=dgl)
    me.transform(o.matrix_world)
    if o.matrix_world.determinant() < 0:
        me.flip_normals()
    bm = bmesh.new(); bm.from_mesh(me)
    if WELD:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    if clip:   # (axis, value, keep_below): cut the mesh with a plane
        ax, val, below = clip
        no = [0, 0, 0]; no[ax] = 1
        co = [0, 0, 0]; co[ax] = val
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=below, clear_inner=not below)
    if WELD and bm.faces and not any(e.is_boundary for e in bm.edges):
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.triangulate(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
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

def merged(name, objs, max_verts, radius=None, clip=None):
    """Bake every object, join into one mesh object called `name`."""
    parts = []
    for o in objs:
        me = bake(o, max_verts, radius, clip)
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

def export(fname, groups, centre_on=None, anchors=None, notes=None):
    """groups: {name: (objs, max_verts[, radius[, clip]])}. Centre on the bbox centre of `centre_on` (or of everything).
    anchors: {name: Vector in Blender world}; written (converted to the part's glTF frame) to <fname>.anchors.json."""
    obs = {n: merged(n, g[0], g[1], *(g[2:4])) for n, g in groups.items() if g[0]}
    obs = {n: o for n, o in obs.items() if o}
    pts = []; allp = []
    for n, o in obs.items():
        ps = [o.matrix_world @ v.co for v in o.data.vertices]
        allp += ps
        if centre_on is None or n == centre_on:
            pts += ps
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
    g = lambda p: [round(p.x - c.x, 5), round(p.z - c.z, 5), round(-(p.y - c.y), 5)]   # Blender world -> glTF (Y up, anterior +Z), part-centred
    allg = [g(p) for p in allp]
    meta = {"file": fname, "objects": info,
            "bbox": [[min(a[i] for a in allg) for i in range(3)], [max(a[i] for a in allg) for i in range(3)]],
            "worldOffset": [round(c.x, 5), round(c.z, 5), round(-c.y, 5)],
            "anchors": {k: g(v) for k, v in (anchors or {}).items()}, "notes": notes or {}}
    json.dump(meta, open(os.path.join(out, fname.replace(".glb", ".anchors.json")), "w"), indent=1)
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

# ======================================================================================================================
# Round 2 parts: spine, thorax, gut, head-targets. Object names are "<tissue>_<thing>" so the prefix painting in
# PartModels works (bone_, muscle_, vessel_, organ_, nerve_, gland_, cartilage_, disc_ ...). Anchors are computed from
# the real mesh geometry (centroids, extreme/surface points, centre lines). All coordinates are Blender world here and
# converted to the part's glTF frame by export(): Y up, anterior +Z, patient's left +X, centred on the part.
# ======================================================================================================================
import math
from mathutils import Matrix
WELD = True
OB = bpy.data.objects
Z_UP = Vector((0, 0, 1))

def G(name):
    return OB[name]

def raw(o_or_name, radius=None):
    """Undecimated world-space baked mesh vertices of an object (list of Vector)."""
    o = G(o_or_name) if isinstance(o_or_name, str) else o_or_name
    me = bake(o, 10 ** 9, radius)
    vs = [v.co.copy() for v in me.vertices]; bpy.data.meshes.remove(me)
    return vs

def line(o_or_name):
    """Centre line of a curve object (bevel off), world space, in spline order."""
    o = G(o_or_name) if isinstance(o_or_name, str) else o_or_name
    d = o.data; keep = (d.bevel_depth, d.bevel_object, d.extrude)
    d.bevel_depth = 0; d.bevel_object = None; d.extrude = 0
    o.update_tag(); bpy.context.view_layer.update()
    dgl = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dgl), depsgraph=dgl); me.transform(o.matrix_world)
    pts = [v.co.copy() for v in me.vertices]; bpy.data.meshes.remove(me)
    d.bevel_depth, d.bevel_object, d.extrude = keep
    o.update_tag(); bpy.context.view_layer.update()
    return pts

def mean(vs):
    return sum(vs, Vector()) / len(vs)

def bbc(vs):
    return Vector(((min(v.x for v in vs) + max(v.x for v in vs)) / 2, (min(v.y for v in vs) + max(v.y for v in vs)) / 2, (min(v.z for v in vs) + max(v.z for v in vs)) / 2))

def snap(vs, p):
    """The mesh vertex closest to point p (puts an anchor ON the surface)."""
    return min(vs, key=lambda v: (v - p).length_squared)

def facing(vs, d, k=40, around=None, r=None):
    """Surface point on the side of `vs` that faces direction d (mean of the k most d-ward vertices, snapped to the mesh)."""
    d = Vector(d).normalized()
    pool = vs if around is None else ([v for v in vs if (v - around).length < r] or vs)
    top = sorted(pool, key=lambda v: -v.dot(d))[:k]
    return snap(vs, mean(top))

def ring_pts(c, n, R, a0, a1, N, e):
    n = n.normalized(); e = (e - n * e.dot(n)).normalized(); f = n.cross(e)
    return [c + (e * math.cos(a) + f * math.sin(a)) * R for a in [a0 + (a1 - a0) * i / (N - 1) for i in range(N)]]

def tube(name, pts, r, sides=8, caps=True):
    """Procedural tube (bmesh) along a polyline; returns a Blender object in the tmp collection."""
    bm = bmesh.new(); rings = []
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        a = t.cross(Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))).normalized(); b = t.cross(a)
        rr = r(i / (len(pts) - 1)) if callable(r) else r
        rings.append([bm.verts.new(p + (a * math.cos(2 * math.pi * k / sides) + b * math.sin(2 * math.pi * k / sides)) * rr) for k in range(sides)])
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    if caps:
        bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); tmp.objects.link(ob); return ob

def ellipsoid(name, c, radii, axes=None, seg=14, rings=8):
    """Procedural ellipsoid at c; semi-axis i runs along column i of `axes` (default world axes)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    M = (axes or Matrix.Identity(3)).to_4x4() @ Matrix.Diagonal(Vector((*radii, 1.0)))
    bmesh.ops.transform(bm, matrix=Matrix.Translation(c) @ M, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); tmp.objects.link(ob); return ob

def mesh_obj(name, vs, faces):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in vs], [], faces); me.update()
    ob = bpy.data.objects.new(name, me); tmp.objects.link(ob); return ob

def canal_gap(vs, z, half=0.003, xw=0.009, skip=0.012):
    """Vertebral canal centre y at height z: the widest empty gap in y among vertices near the midline, ignoring the hollow
    inside the body (gaps that start within `skip` of the anterior surface)."""
    ys = sorted(v.y for v in vs if abs(v.z - z) < half and abs(v.x) < xw)
    if len(ys) < 4:
        return None
    gs = [(ys[i + 1] - ys[i], (ys[i + 1] + ys[i]) / 2) for i in range(len(ys) - 1) if ys[i] > ys[0] + skip]
    return max(gs)[1] if gs else None

def comps_of(o):
    """Loose parts of an object's evaluated mesh as lists of world vertices."""
    me = bpy.data.meshes.new_from_object(o.evaluated_get(bpy.context.evaluated_depsgraph_get())); me.transform(o.matrix_world)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    seen = set(); out_ = []
    for v in bm.verts:
        if v.index in seen: continue
        st = [v]; seen.add(v.index); cc = []
        while st:
            a = st.pop(); cc.append(a.co.copy())
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen: seen.add(b.index); st.append(b)
        out_.append(cc)
    bm.free(); return out_

def build_spine():
    lv = ["C1", "C2"] + [f"C{i}" for i in range(3, 8)] + [f"T{i}" for i in range(1, 13)] + [f"L{i}" for i in range(1, 6)]
    nm = {"C1": "Atlas (C1)", "C2": "Axis (C2)"}
    groups = {}; A = {}; V = {}
    for l in lv:
        n = nm.get(l, f"Vertebra {l}")
        vs = raw(n); V[l] = vs
        groups["bone_" + l] = ([G(n)], 700)
        ys = sorted(v.y for v in vs)
        body = [v for v in vs if v.y < ys[int(len(ys) * 0.28)]]          # anterior third = the vertebral body
        A[l] = mean(body)
        zc = A[l].z; yf = canal_gap(vs, zc)
        A[l + "_foramen"] = Vector((0, yf if yf is not None else (ys[0] + ys[-1]) / 2, zc))   # centre of the vertebral foramen
        A[l + "_spinous"] = max(vs, key=lambda v: v.y)                     # tip of the spinous process
        near = [v for v in vs if abs(v.z - zc) < 0.01]
        A[l + "_transverse"] = max(near, key=lambda v: v.x)                # patient-left transverse process tip (+x)
        A[l + "_transverse_R"] = min(near, key=lambda v: v.x)
    sac = raw("Sacrum"); coc = raw("Coccyx")
    groups["bone_sacrum"] = ([G("Sacrum")], 1500); groups["bone_coccyx"] = ([G("Coccyx")], 400)
    p0 = mean(sorted(sac, key=lambda v: -v.z)[:200]); p1 = mean(sorted(sac, key=lambda v: v.z)[:200])
    sacral = {}
    for i in range(5):
        p = p0 + (p1 - p0) * ((i + 0.5) / 5)
        sl = [v for v in sac if abs(v.z - p.z) < 0.004]
        yc = canal_gap(sac, p.z, 0.004, 0.006)
        ant = min(sl, key=lambda v: v.y) if sl else p
        A[f"S{i+1}"] = Vector((0, ant.y, p.z))                              # ventral (pelvic) face of that sacral segment
        sacral[f"S{i+1}"] = Vector((0, yc if yc is not None else p.y, p.z))
        A[f"S{i+1}_foramen"] = sacral[f"S{i+1}"]
    A["Co1"] = mean(coc)
    # spinal cord and its enlargements
    cord = raw("White matter of spinal cord")
    groups["nerve_cord"] = ([G("White matter of spinal cord")], 3500)
    zmin, zmax = min(v.z for v in cord), max(v.z for v in cord)
    bins = {}
    for v in cord: bins.setdefault(int((v.z - zmin) / 0.004), []).append(v)
    width = {b: max(v.x for v in vs) - min(v.x for v in vs) for b, vs in bins.items() if len(vs) > 8}
    zof = lambda b: zmin + (b + 0.5) * 0.004
    cb = max((b for b in width if zof(b) > 1.33), key=lambda b: width[b]); lb = max((b for b in width if zof(b) < 1.2), key=lambda b: width[b])
    def cpt(z):
        sl = [v for v in cord if abs(v.z - z) < 0.003]
        return Vector((0, mean(sl).y, z)) if sl else Vector((0, 0.03, z))
    A["cord_cervical_enlargement"] = cpt(zof(cb)); A["cord_lumbar_enlargement"] = cpt(zof(lb))
    A["cord_top"] = cpt(zmax - 0.003); A["conus_medullaris"] = cpt(zmin + 0.003)
    # dorsal root ganglia: Z-Anatomy has 21 pairs (C2..L2); L3..S5 are added procedurally in the same size
    order = [f"C{i}" for i in range(2, 9)] + [f"T{i}" for i in range(1, 13)] + ["L1", "L2"]
    for side, sfx in (("l", ""), ("r", "_R")):
        comps = sorted(comps_of(G("Spinal ganglion." + side)), key=lambda c: -mean(c).z)
        for l, cc in zip(order, comps):
            A["drg_" + l + sfx] = mean(cc)
            if not sfx: A["cord_" + l] = cpt(mean(cc).z)
    groups["nerve_drg"] = ([G("Spinal ganglion.l"), G("Spinal ganglion.r")], 1400)
    bz = {l: A[l].z for l in lv}
    plan = {"L3": (bz["L3"] + bz["L4"]) / 2, "L4": (bz["L4"] + bz["L5"]) / 2, "L5": (bz["L5"] + A["S1"].z) / 2}
    for l in ("S1", "S2", "S3", "S4", "S5"): plan[l] = sacral[l].z
    procs = []
    for k, (l, z) in enumerate(plan.items()):
        if l[0] == "S":
            y = sacral[l].y; xo = 0.0085
        else:
            nl = {"L3": "L4", "L4": "L5"}.get(l)
            y = (A[l + "_foramen"].y + (A[nl + "_foramen"].y if nl else sacral["S1"].y)) / 2; xo = 0.0145   # between this level's and the next foramen
        for sx, sfx in ((1, ""), (-1, "_R")):
            c = Vector((sx * xo, y, z)); A["drg_" + l + sfx] = c
            procs.append(ellipsoid("p_drg_" + l + sfx, c, (0.0032, 0.0028, 0.0042), seg=10, rings=6))
        A["cord_" + l] = Vector((0, cpt(zmin + 0.01).y, zmin + 0.004 + 0.0007 * k))
    A["cord_Co1"] = A["conus_medullaris"]
    groups["nerve_drg_procedural"] = (procs, 600)
    for o in [o for o in ALL if o.name.startswith("Intervertebral disc ")]:
        groups["disc_" + o.name.split()[-1].replace("-", "_")] = ([o], 200)
    groups["dura"] = ([G("Spinal dura")], 3000)
    cauda = G("Cauda equina"); groups["nerve_cauda_equina"] = ([cauda], 3000, 0.0005)
    A["cauda_equina"] = mean(line(cauda))
    A["dura_sac_end"] = Vector((0, cpt(zmin + 0.003).y, zmin))
    return groups, A, [p.name for p in procs]

def build_thorax():
    groups = {}; A = {}
    R = {"Ascending aorta": 0.0095, "Aortic arch": 0.0090, "Thoracic aorta": 0.0080, "Brachiocephalic trunk": 0.0062,
         "Left common carotid artery": 0.0042, "Right common carotid artery": 0.0042, "Left subclavian artery": 0.0045, "Right subclavian artery": 0.0045}
    def vessel(name, src, r, clip=None): groups[name] = ([G(src)], 1500, r, clip)
    vessel("vessel_aorta_ascending", "Ascending aorta", R["Ascending aorta"])
    vessel("vessel_aortic_arch", "Aortic arch", R["Aortic arch"])
    vessel("vessel_aorta_descending", "Thoracic aorta", R["Thoracic aorta"])
    vessel("vessel_brachiocephalic", "Brachiocephalic trunk", R["Brachiocephalic trunk"])
    vessel("vessel_subclavian_L", "Left subclavian artery", R["Left subclavian artery"])
    vessel("vessel_subclavian_R", "Right subclavian artery", R["Right subclavian artery"])
    procs = []
    for s, sx in (("L", 1), ("R", -1)):
        cca = G(f"{'Left' if s == 'L' else 'Right'} common carotid artery")
        ica = G("Internal carotid artery." + s.lower()); eca = G("External carotid artery." + s.lower())
        il = line(ica); st = min(il, key=lambda p: p.z); en = max(il, key=lambda p: p.z)
        zc = st.z + 0.026
        vessel(f"vessel_common_carotid_{s}", f"{'Left' if s == 'L' else 'Right'} common carotid artery", 0.0042)
        groups[f"vessel_internal_carotid_{s}"] = ([ica], 900, 0.0035, (2, zc, True))
        groups[f"vessel_external_carotid_{s}"] = ([eca], 700, 0.0030, (2, zc, True))
        d = (en - st).normalized(); a1 = d.cross(Vector((1, 0, 0))).normalized(); a2 = d.cross(a1)
        # the carotid sinus: the baroreceptor bulb at the origin of the internal carotid
        c = st + d * 0.0055
        procs.append(ellipsoid(f"vessel_carotid_sinus_{s}", c, (0.0050, 0.0050, 0.0070), axes=Matrix((a1, a2, d)).transposed(), seg=14, rings=8))
        A["carotid_sinus" + ("" if s == "L" else "_R")] = c + (Vector((sx * 0.8, -0.6, 0))).normalized() * 0.0050
        A["carotid_bifurcation" + ("" if s == "L" else "_R")] = st
        A["common_carotid" + ("" if s == "L" else "_R")] = snap(raw(cca, 0.0042), mean(line(cca)))
    groups["vessel_carotid_sinus"] = (procs, 400)
    ap = max(line(G("Aortic arch")), key=lambda p: p.z)
    A["aortic_arch"] = ap + Z_UP * R["Aortic arch"]                       # top of the arch (aortic baroreceptors)
    A["aorta_ascending"] = mean(line(G("Ascending aorta")))
    A["aorta_descending"] = mean(line(G("Thoracic aorta")))
    # heart
    H = {"organ_heart_ra": "Right atrium", "organ_heart_la": "Left atrium", "organ_heart_rv": "Right ventricle", "organ_heart_lv": "Left ventricle"}
    hv = []
    for k, n in H.items():
        groups[k] = ([G(n)], 1800); hv += raw(n)
    groups["vessel_pulmonary_trunk"] = ([G("Pulmonary trunk")], 600)
    A["heart"] = bbc(hv)
    A["heart_apex"] = facing(raw("Left ventricle"), (0.5, -0.4, -0.8), 25)
    A["heart_sa_node"] = facing(raw("Right atrium"), (-0.5, -0.2, 0.85), 25)     # sinoatrial node region: top of the right atrium by the SVC
    A["heart_av_node"] = snap(hv, mean(raw("Right atrium")) * 0.5 + mean(raw("Left ventricle")) * 0.5)
    A["heart_left_ventricle"] = facing(raw("Left ventricle"), (1, -0.6, 0), 30)
    A["heart_right_atrium"] = facing(raw("Right atrium"), (-1, -0.3, 0), 30)
    # lungs, airway
    lungL = ["Superior lobe of left lung", "Inferior lobe of left lung"]
    lungR = ["Superior lobe of right lung", "Middle lobe of right lung", "Inferior lobe of right lung"]
    groups["organ_lung_L"] = ([G(n) for n in lungL], 1500); groups["organ_lung_R"] = ([G(n) for n in lungR], 1400)
    groups["organ_trachea"] = ([G("Trachea")], 1500)
    groups["organ_bronchus_main"] = ([G("Left main bronchus"), G("Right main bronchus")], 900, 0.0055)
    groups["organ_bronchus_lobar"] = ([G(n) for n in ["Left superior lobar bronchus", "Left inferior lobar bronchus", "Right superior lobar bronchus", "Intermediate bronchus.r", "Middle lobar bronchus.r", "Right inferior lobar bronchus"]], 1200, 0.0038)
    lL = sum((raw(n) for n in lungL), []); lR = sum((raw(n) for n in lungR), [])
    A["lung_L"] = facing(lL, (1, -0.2, 0), 60); A["lung_R"] = facing(lR, (-1, -0.2, 0), 60)
    A["lung_L_centre"] = bbc(lL); A["lung_R_centre"] = bbc(lR)
    A["bronchus_L"] = max(line(G("Left main bronchus")), key=lambda p: p.x)
    A["bronchus_R"] = min(line(G("Right main bronchus")), key=lambda p: p.x)
    tr = raw("Trachea"); zt0 = min(v.z for v in tr); zt1 = max(v.z for v in tr)
    A["carina"] = mean([v for v in tr if v.z < zt0 + 0.004]); A["trachea"] = facing(tr, (0, -1, 0), 40, around=bbc(tr), r=0.03)
    A["trachea_top"] = mean([v for v in tr if v.z > zt1 - 0.004])
    # diaphragm (open sheet: render double-sided)
    dia = raw("Diaphragm"); groups["muscle_diaphragm"] = ([G("Diaphragm")], 2800)
    dl = [v for v in dia if v.x > 0.01]; dr = [v for v in dia if v.x < -0.01]; dm = [v for v in dia if abs(v.x) <= 0.02]
    A["diaphragm_dome_L"] = max(dl, key=lambda v: v.z); A["diaphragm_dome_R"] = max(dr, key=lambda v: v.z)
    A["diaphragm_centre"] = max(dm, key=lambda v: v.z); A["diaphragm"] = A["diaphragm_dome_L"]
    return groups, A, [p.name for p in procs]

def build_gut():
    groups = {}; A = {}
    groups["organ_esophagus"] = ([G("Oesophagus")], 2200, None, (2, 1.32, True))   # the thoracic part runs on in the thorax scene; cut at the diaphragm region
    groups["organ_stomach"] = ([G("Stomach")], 2600)
    groups["organ_duodenum"] = ([G("Duodenum")], 900)
    groups["organ_small_intestine"] = ([G("Jejunum")], 6500, 0.0085)
    for k, n in (("ascending", "Ascending colon"), ("transverse", "Transverse colon"), ("descending", "Descending colon"), ("sigmoid", "Sigmoid colon")):
        groups["organ_colon_" + k] = ([G(n)], 1800)
    st = raw("Stomach"); sc = bbc(st)
    A["stomach"] = sc
    A["stomach_wall"] = facing(st, (0.2, -1, 0.1), 40, around=sc, r=0.05)      # anterior wall of the body (stretch receptors / vagal)
    A["stomach_fundus"] = max(st, key=lambda v: v.z)
    du = raw("Duodenum"); A["duodenum"] = facing(du, (0, -1, 0), 30)
    A["stomach_pylorus"] = snap(st, mean(sorted(du, key=lambda v: -v.z)[:30]))
    es = [p for p in line(G("Oesophagus")) if p.z < 1.32]; A["esophagus_lower"] = min(es, key=lambda p: p.z); A["esophagus_upper"] = max(es, key=lambda p: p.z)
    ji = raw(G("Jejunum"), 0.0085); jc = bbc(ji)
    A["small_intestine"] = facing(ji, (0, -1, 0), 40, around=jc, r=0.04)
    for k, n in (("ascending", "Ascending colon"), ("transverse", "Transverse colon"), ("descending", "Descending colon"), ("sigmoid", "Sigmoid colon")):
        vs = raw(n); A["colon_" + k] = facing(vs, (0, -1, 0), 30)
    A["gut_centre"] = jc
    return groups, A

def build_head():
    groups = {}; A = {}; procs = []; notes = {}
    # tongue: smooth the 343-vertex source one level
    tg = G("Tongue")
    if not tg.modifiers: tg.modifiers.new("s", "SUBSURF").levels = 2
    groups["organ_tongue"] = ([tg], 2500)
    tv = raw(tg); y0 = min(v.y for v in tv); y1 = max(v.y for v in tv); L = y1 - y0
    def dorsal(frac):
        sl = [v for v in tv if abs(v.y - (y0 + L * frac)) < 0.003 and v.x > -0.001] or tv
        return max(sl, key=lambda v: v.z)
    A["tongue_tip"] = min(tv, key=lambda v: v.y)
    A["tongue_anterior_2_3"] = dorsal(0.33)       # anterior two thirds: lingual / chorda tympani (taste, CN VII)
    A["tongue_posterior_1_3"] = dorsal(0.83)      # posterior third: glossopharyngeal (taste, CN IX)
    A["tongue_circumvallate"] = dorsal(0.68)      # row of vallate papillae at the border
    A["tongue"] = dorsal(0.5)
    # glands (left)
    for k, n, f in (("parotid", "Parotid gland.l", (1, 0, 0)), ("submandibular", "Submandibular gland.l", (0.4, 0, -1)), ("sublingual", "Sublingual gland.l", (0.3, -1, 0)), ("lacrimal_gland", "Lacrimal gland.l", (0.3, -1, 0.5))):
        groups["gland_" + k.replace("_gland", "")] = ([G(n)], 600); vs = raw(n); A[k] = facing(vs, f, 30); A[k + "_centre"] = bbc(vs)
    # larynx, pharynx, palate
    groups["cartilage_thyroid"] = ([G("Thyroid cartilage")], 1100); groups["cartilage_cricoid"] = ([G("Cricoid cartilage")], 500)
    groups["cartilage_epiglottis"] = ([G("Epiglottis")], 600); groups["cartilage_arytenoid"] = ([G("Arytenoid cartilage.l")], 250)
    tc = raw("Thyroid cartilage"); cc = raw("Cricoid cartilage"); ar = raw("Arytenoid cartilage.l"); ep = raw("Epiglottis")
    A["larynx"] = facing(tc, (0, -1, 0), 40); A["larynx_centre"] = bbc(tc + cc)
    A["epiglottis"] = facing(ep, (0, -1, 0.3), 25)
    acen = mean(ar); tfront = min(tc, key=lambda v: v.y)
    A["larynx_vocal_fold"] = Vector((acen.x * 0.6, (acen.y + tfront.y) / 2 + 0.003, acen.z))   # between the arytenoid and the thyroid angle (not separately modelled)
    A["arytenoid"] = acen
    pc = [G(n) for n in ("Superior pharyngeal constrictor.l", "Middle pharyngeal constrictor.l", "Inferior pharyngeal constrictor.l")]
    groups["muscle_pharyngeal_constrictors"] = (pc, 1100)
    pv = [raw(o) for o in pc]
    A["pharynx"] = facing(sum(pv, []), (1, 0.2, 0), 50); A["pharynx_superior"] = facing(pv[0], (1, 0.2, 0), 30)
    A["pharynx_middle"] = facing(pv[1], (1, 0.2, 0), 30); A["pharynx_inferior"] = facing(pv[2], (1, 0.2, 0), 30)
    groups["organ_soft_palate"] = ([G("Soft palate"), G("Uvula of palate")], 500)
    A["soft_palate"] = facing(raw("Soft palate") + raw("Uvula of palate"), (0, -1, -0.3), 30)
    # jaw
    groups["bone_mandible"] = ([G("Mandible")], 3000)
    mv = raw("Mandible")
    A["mandible_chin"] = facing(mv, (0, -1, -0.2), 30, around=Vector((0, mean(mv).y - 0.03, mean(mv).z - 0.02)), r=0.03)   # mental protuberance: where you tap for the jaw jerk
    A["mandible_condyle"] = max([v for v in mv if v.x > 0.01], key=lambda v: v.z)
    A["mandible_angle"] = min([v for v in mv if v.x > 0.03], key=lambda v: v.z)
    groups["muscle_masseter"] = ([G("Superficial part of masseter.l"), G("Deep part of masseter.l")], 900)
    ms = raw("Superficial part of masseter.l"); A["masseter"] = facing(ms, (1, 0, 0), 40); A["masseter_centre"] = bbc(ms)
    groups["muscle_temporalis"] = ([G("Temporalis muscle.l")], 1300)
    A["temporalis"] = facing(raw("Temporalis muscle.l"), (1, 0, 0.3), 60)
    # eye and the extraocular muscles (gaze)
    groups["organ_eyeball"] = ([G("Sclera.l")], 700); groups["organ_cornea"] = ([G("Cornea.l")], 300)
    eb = raw("Sclera.l"); A["eyeball"] = bbc(eb); A["eyeball_front"] = min(raw("Cornea.l"), key=lambda v: v.y)
    for k, n in (("lateral_rectus", "Lateral rectus muscle.l"), ("medial_rectus", "Medial rectus muscle.l"), ("superior_rectus", "Superior rectus muscle.l"),
                 ("inferior_rectus", "Inferior rectus muscle.l"), ("superior_oblique", "Superior oblique muscle.l"), ("inferior_oblique", "Inferior oblique muscle.l"),
                 ("levator_palpebrae", "Levator palpebrae superioris.l")):
        groups["muscle_" + k] = ([G(n)], 450); vs = raw(n); A[k] = snap(vs, mean(vs))
    # inner ear: cochlea, vestibule, three procedural semicircular canals (absent from Z-Anatomy), ossicles
    groups["organ_cochlea"] = ([G("Cochlea.l")], 1100); groups["organ_vestibule"] = ([G("Vestibule.l")], 800)
    cv = raw("Cochlea.l"); vv = raw("Vestibule.l"); V0 = bbc(vv)
    A["cochlea"] = bbc(cv); A["cochlea_nerve_entry"] = facing(cv, (-1, 0.2, 0), 30); A["vestibule"] = V0; A["vestibule_nerve_entry"] = facing(vv, (-1, 0.2, 0), 30)
    canals = {"anterior": (Vector((0.80, 0.60, 0)), Vector((0.1, -0.5, 0.85))), "posterior": (Vector((0.6, -0.80, 0)), Vector((0.1, 0.85, 0.5))),
              "lateral": (Vector((0, 0.45, 0.89)), Vector((0.9, -0.1, 0.0)))}
    tops = []
    for k, (n, out_) in canals.items():
        R_ = 0.0038; e = (out_ - n.normalized() * out_.dot(n.normalized())).normalized()
        c = V0 + e * R_ * 0.8
        pts = ring_pts(c, n, R_, math.radians(60), math.radians(60 + 290), 28, -e)
        # first/last points are pulled into the vestibule so the ring joins it
        procs.append(tube(f"organ_canal_{k}", pts, 0.0007, sides=8))
        far = max(pts, key=lambda p: (p - V0).length); A["canal_" + k] = far; tops.append(far)
    groups["organ_semicircular_canals"] = (procs, 700)
    A["semicircular_canals"] = mean(tops)
    groups["bone_ossicles"] = ([G("Malleus.l"), G("Incus.l"), G("Stapes.l")], 450)
    A["ossicles"] = bbc(raw("Malleus.l") + raw("Incus.l") + raw("Stapes.l"))
    # nose: cavity mucosa, with the roof patch split off as the olfactory epithelium
    nm = G("Mucosa of nasal cavity"); me = bake(nm, 10 ** 9); zmax = max(v.co.z for v in me.vertices)
    bm = bmesh.new(); bm.from_mesh(me); bpy.data.meshes.remove(me)
    roof = [f.index for f in bm.faces if mean([v.co for v in f.verts]).z > zmax - 0.0042 and abs(mean([v.co for v in f.verts]).x) < 0.009]
    def sub(keep_roof):
        b = bm.copy(); b.faces.ensure_lookup_table()
        drop = [b.faces[i] for i in range(len(b.faces)) if (i in set(roof)) != keep_roof]
        bmesh.ops.delete(b, geom=drop, context="FACES"); loose = [v for v in b.verts if not v.link_faces]; bmesh.ops.delete(b, geom=loose, context="VERTS")
        return b
    for nme, b in (("organ_nasal_cavity", sub(False)), ("organ_olfactory_epithelium", sub(True))):
        m2 = bpy.data.meshes.new(nme); b.to_mesh(m2); b.free(); ob = bpy.data.objects.new(nme, m2); tmp.objects.link(ob); groups[nme] = ([ob], 1800 if "cavity" in nme else 500)
    ov = [v.co.copy() for v in groups["organ_olfactory_epithelium"][0][0].data.vertices]
    A["olfactory_epithelium"] = snap(ov, mean(ov)) if ov else Vector((0, -0.07, zmax))
    A["nasal_cavity"] = facing(bake_raw(groups["organ_nasal_cavity"][0][0]), (0, -1, 0), 30)
    on = G("Olfactory nerve (I).l"); groups["nerve_olfactory"] = ([on], 800, 0.0007)
    ol = line(on); top = max(ol, key=lambda p: p.z)
    bulb = ellipsoid("organ_olfactory_bulb", top + Vector((0, -0.002, 0.001)), (0.0042, 0.0085, 0.0034), seg=14, rings=8)
    groups["organ_olfactory_bulb"] = ([bulb], 400)
    A["olfactory_bulb"] = top + Vector((0, -0.002, 0.001)); A["olfactory_nerve"] = mean(ol)
    notes.update({"procedural": ["organ_semicircular_canals", "organ_olfactory_bulb"],
                  "semicircular_note": "Z-Anatomy has no semicircular canal meshes (only labels). The three canals are generated arcs around the vestibule, placed on the labelled positions.",
                  "olfactory_note": "Z-Anatomy has no olfactory bulb mesh; organ_olfactory_bulb is a generated ellipsoid at the top of the olfactory nerve. The epithelium is the roof patch of the nasal mucosa."})
    return groups, A, notes

def bake_raw(o):
    return [v.co.copy() for v in o.data.vertices]

if want("spine"):
    g, a, pr = build_spine()
    export("spine.glb", g, anchors=a, notes={"procedural": pr + [], "drg_note": "Z-Anatomy has dorsal root ganglia only for C2-L2. L3-S5 (nerve_drg_procedural) are generated ellipsoids in the foramina. cord_L3..cord_Co1 sit in the conus medullaris: cord segments end near the L1/L2 vertebra."})
if want("thorax"):
    g, a, pr = build_thorax()
    export("thorax.glb", g, anchors=a, notes={"procedural": pr, "diaphragm": "open sheet, render double-sided", "carotid_sinus": "vessel_carotid_sinus_L/R are generated ellipsoids on the internal carotid origin (Z-Anatomy has no sinus)."})
if want("gut"):
    g, a = build_gut()
    export("gut.glb", g, anchors=a, notes={"missing": "Z-Anatomy models the small bowel as one tube (organ_small_intestine); no separate ileum, caecum or rectum."})
if want("head-targets"):
    g, a, n = build_head()
    export("head-targets.glb", g, anchors=a, notes=n)
