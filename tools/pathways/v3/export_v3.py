# Pathway tracer v3: exports the real Z-Anatomy geometry the fibres run in (CC BY-SA 4.0, credit in PathwayCredits.tsx).
#   tools/blender/blender-4.2.9-windows-x64/blender.exe --factory-startup --disable-autoexec -b \
#     _atlas/raw/z-anatomy-extract/Z-Anatomy/Startup.blend -P tools/pathways/v3/export_v3.py -- _atlas/pw3_raw
# Writes, in the atlas world frame (Blender (x, y, z) -> glTF (x, z, -y), metres, no re-centring):
#   nerves.json  every nerve / root / plexus curve: per spline the evaluated centreline and the radius at each point
#   body.glb     context meshes: body skin (ghost), limb bones, pelvis, the muscles where pathways start or end
# Run it at idle priority (it opens a 293 MB file). Nothing from the .blend is executed (--disable-autoexec).
import bpy, bmesh, sys, os, re, json
from mathutils import Vector

out = sys.argv[sys.argv.index("--") + 1]
os.makedirs(out, exist_ok=True)

def gl(v):
    return [round(v.x, 5), round(v.z, 5), round(-v.y, 5)]

# ---------------------------------------------------------------- nerves
NERVE_RX = re.compile(
    r"^(Median nerve|Ulnar nerve|Roots of brachial plexus|Superior trunk of brachial plexus|Middle trunk of brachial plexus|Inferior trunk of brachial plexus|"
    r"Anterior division of (superior|middle|inferior) trunk of brachial plexus|Posterior cord of brachial plexus|Medial cord of brachial plexus|Lateral cord of brachial plexus|"
    r"Common palmar digital branches of median nerve|Proper palmar digital branches of median nerve|Muscular branches of median nerve|Deep branch of ulnar nerve|Superficial branch of ulnar nerve|"
    r"Common palmar digital branches of ulnar nerve|Proper palmar digital branches of ulnar nerve|Muscular branches of ulnar nerve|Palmar branch of ulnar nerve|"
    r"Proper plantar digital branches of medial plantar nerve|Common plantar digital branches of medial plantar nerve|Obturator nerve|Lumbosacral trunk|Accessory nerve \(XI\)|"
    r"Musculocutaneous nerve|Sciatic nerve|Tibial nerve|Medial plantar nerve|Lateral plantar nerve|Common fibular nerve|Femoral nerve|Muscular branches of femoral nerve|"
    r"Anterior cutaneous branches of femoral nerve|Saphenous nerve|Posterior root of spinal nerve|Anterior root of spinal nerve|Cauda equina|Intercostal nerves|Sympathetic nerves|"
    r"Optic nerve \(II\)|Olfactory nerve \(I\)|Oculomotor nerve \(III\)|Trigeminal nerve \(V\)|Ophthalmic nerve|Maxillary nerve|Posterior division of mandibular nerve|"
    r"Anterior division of mandibular nerve|Inferior alveolar nerve|Mental nerve|Lingual nerve|Facial nerve \(VII\)|Chorda tympani|Vestibulocochlear nerve \(VIII\)|"
    r"Cochlear nerve|Vestibular nerve|Glossopharyngeal nerve \(IX\)|Vagus nerve \(X\)|Hypoglossal nerve \(XII\)|Abducens nerve \(VI\)|Trochlear nerve \(IV\)|Masseteric nerve)(\.[lr])?$"
)

def bez(p0, h0, h1, p1, t):
    u = 1 - t
    return p0 * (u * u * u) + h0 * (3 * u * u * t) + h1 * (3 * u * t * t) + p1 * (t * t * t)

nerves = {}
for o in bpy.data.objects:
    if o.type != "CURVE" or not NERVE_RX.match(o.name):
        continue
    d = o.data
    M = o.matrix_world
    bev = d.bevel_depth or 0.0005
    sps = []
    for s in d.splines:
        pts, rad = [], []
        if s.type == "BEZIER":
            bp = s.bezier_points
            if len(bp) < 2:
                continue
            for i in range(len(bp) - 1):
                a, b = bp[i], bp[i + 1]
                p0, h0, h1, p1 = M @ a.co, M @ a.handle_right, M @ b.handle_left, M @ b.co
                n = max(2, int((p1 - p0).length / 0.0015) + 1)
                for k in range(n):
                    t = k / n
                    pts.append(bez(p0, h0, h1, p1, t))
                    rad.append(bev * (a.radius * (1 - t) + b.radius * t))
            pts.append(M @ bp[-1].co)
            rad.append(bev * bp[-1].radius)
        else:
            sp = s.points
            if len(sp) < 2:
                continue
            for p in sp:
                pts.append(M @ p.co.xyz)
                rad.append(bev * p.radius)
        sps.append({"p": [gl(v) for v in pts], "r": [round(r, 5) for r in rad]})
    if sps:
        nerves[o.name] = sps
json.dump(nerves, open(os.path.join(out, "nerves.json"), "w"), separators=(",", ":"))
print("nerves", len(nerves))

# ---------------------------------------------------------------- body meshes
ALL = [o for o in bpy.data.objects if o.type == "MESH" and len(o.data.vertices) > 10]
tmp = bpy.data.collections.new("_v3tmp")
bpy.context.scene.collection.children.link(tmp)

def coll_members(name):
    c = bpy.data.collections.get(name)
    if not c:
        return set()
    out_ = set()
    def walk(cc):
        for ob in cc.objects:
            out_.add(ob.name)
        for ch in cc.children:
            walk(ch)
    walk(c)
    return out_

def pick(rx, side=None, excl=None, within=None):
    r = re.compile(rx, re.I)
    x = re.compile(excl, re.I) if excl else None
    res = []
    for o in ALL:
        if within is not None and o.name not in within:
            continue
        if side and not o.name.endswith(side):
            continue
        if r.search(o.name) and not (x and x.search(o.name)):
            res.append(o)
    return res

def group(name, objs, per_obj_cap=None):
    """Joins the objects' base meshes (no modifiers: fast, and the context is drawn smooth-shaded) in world space."""
    bm = bmesh.new()
    n = 0
    for o in objs:
        me = o.data
        tmpm = me.copy()
        tmpm.transform(o.matrix_world)
        if o.matrix_world.determinant() < 0:
            tmpm.flip_normals()
        bm.from_mesh(tmpm)
        bpy.data.meshes.remove(tmpm)
        n += 1
    if not n:
        print("EMPTY", name); bm.free(); return None
    bmesh.ops.triangulate(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    tmp.objects.link(ob)
    print(name, n, "objects,", len(me.vertices), "verts", flush=True)
    return ob

regions = coll_members("9: Regions of human body")
SKIN_X = r"hair|eyelash|nail|perionyx|umbilicus$"
HAND_BONES = r"^(Humerus|Radius|Ulna|Scaphoid bone|Lunate bone|Triquetrum bone|Pisiform bone|Trapezium bone|Trapezoid bone|Capitate bone|Hamate bone|(First|Second|Third|Fourth|Fifth) metacarpal bone|(Proximal|Middle|Distal) phalanx of (first|second|third|fourth|fifth) finger of hand|Clavicle|Scapula)"
LEG_BONES = r"^(Femur|Patella|Tibia|Fibula|Talus|Calcaneus|Navicular bone|Cuboid bone|(Medial|Intermediate|Lateral) cuneiform bone|(First|Second|Third|Fourth|Fifth) metatarsal bone|(Proximal|Middle|Distal) phalanx of (first|second|third|fourth|fifth) finger of foot)"
FOREARM_FLEX = r"^(Flexor digitorum superficialis|Flexor carpi radialis|Palmaris longus|Pronator teres|Flexor digitorum profundus|Flexor carpi ulnaris|Flexor pollicis longus)( muscle)?\."
HAND_INTR = r"^(Dorsal interossei muscles of hand|Palmar interossei|Abductor digiti minimi of hand|Abductor pollicis brevis|Flexor pollicis brevis|Opponens pollicis|Adductor pollicis|Lumbrical)"
QUAD = r"^(Rectus femoris|Vastus lateralis|Vastus medialis|Vastus intermedius) muscle\.|^Patellar ligament\.|^Quadriceps femoris tendon"
FOOT_INTR = r"^(Flexor digitorum brevis|Abductor hallucis|Abductor digiti minimi of foot|Quadratus plantae)( muscle)?\."
CALF = r"^(Gastrocnemius|Soleus)( muscle)?\."

groups = []
groups.append(group("skin", [o for o in pick(r".", within=regions) if not re.search(SKIN_X, o.name, re.I)], 260))
for sd, S in ((".l", "L"), (".r", "R")):
    groups.append(group(f"bones_arm_{S}", pick(HAND_BONES, side=sd, excl=r"surface|tubercle|groove|head of|neck of|notch|fossa|process|crest|border|line|epicondyle|condyle|trochlea|capitulum|facet"), 700))
    groups.append(group(f"bones_leg_{S}", pick(LEG_BONES, side=sd, excl=r"surface|tubercle|groove|head of|neck of|notch|fossa|process|crest|border|line|epicondyle|condyle|trochlea|facet|malleol|tuberosity"), 900))
    groups.append(group(f"muscle_forearm_{S}", pick(FOREARM_FLEX, side=sd), 900))
    groups.append(group(f"muscle_hand_{S}", pick(HAND_INTR, side=sd), 500))
    groups.append(group(f"muscle_quad_{S}", pick(QUAD, side=sd), 1100))
    groups.append(group(f"muscle_foot_{S}", pick(FOOT_INTR, side=sd), 500))
    groups.append(group(f"muscle_calf_{S}", pick(CALF, side=sd), 900))
    groups.append(group(f"bones_hip_{S}", pick(r"^Hip bone", side=sd), 1500))
groups.append(group("bones_sacrum", pick(r"^(Sacrum|Coccyx)$"), 1500))
# targets of the cranial and axial motor pathways (corneal blink, corticobulbar, tectospinal, anterior corticospinal)
FACE = r"^(Orbicularis oculi|Zygomaticus major|Orbicularis oris|Buccinator|Depressor anguli oris|Frontalis|Occipitofrontalis)"
NECK = r"^(Sternocleidomastoid muscle|Splenius capitis|Trapezius)"
BACK = r"^(Iliocostalis|Longissimus|Spinalis|Erector spinae|Multifidus)"
for sd, S in ((".l", "L"), (".r", "R")):
    groups.append(group(f"muscle_face_{S}", pick(FACE, side=sd), 900))
    groups.append(group(f"muscle_eyelid_{S}", pick(r"^(Orbital|Palpebral) part of orbicularis oculi", side=sd), 900))
    groups.append(group(f"iris_{S}", pick(r"^Iris", side=sd), 900))
    groups.append(group(f"muscle_neck_{S}", pick(NECK, side=sd), 900))
    groups.append(group(f"muscle_back_{S}", pick(BACK, side=sd), 900))
groups = [g for g in groups if g]

bpy.ops.object.select_all(action="DESELECT")
for g in groups:
    g.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, "body.glb"), export_format="GLB", use_selection=True, export_apply=True,
                          export_yup=True, export_normals=True, export_materials="NONE", export_texcoords=False)
print("body.glb written")
