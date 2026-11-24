"""Atlas v3: the cerebral arteries and the dural venous sinuses, from Z-Anatomy (CC BY-SA 4.0), carried into MNI space by
zmap.py and kept above the atlas's lowest slice (the carotid and vertebral arteries are cut where they leave the head's
interior). One named mesh per vessel in _atlas/raw/v3/vessels.raw.glb (pack.mjs compresses it to public/atlas3/vessels.glb)
and public/atlas3/vessels.json: each vessel's key, name, kind (artery / sinus) and box.

They lie in the subarachnoid space and the dura, so they are shown around a see-through brain, never cut into it: the
warp places them within a few millimetres (an artery in a sulcus may run a little inside the brain's outline).
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/vessels.py
"""
import os, sys, json
import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zmap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
GLB = os.path.join(ROOT, "_atlas/raw/glb/s")
ZMIN = -75.0  # MNI z: below this the vessels are in the neck

# key: (Z-Anatomy object, name, kind)
VESSELS = {
    "ica": ("internal-carotid-artery", "Internal carotid artery", "artery"),
    "mca1": ("middle-cerebral-artery-m1", "Middle cerebral artery (M1)", "artery"),
    "mca2": ("insular-branches-of-middle-cerebral-artery-m2", "Middle cerebral artery, insular branches (M2)", "artery"),
    "mca3": ("middle-cerebral-artery-m3", "Middle cerebral artery (M3)", "artery"),
    "mcap": ("parietal-branches-of-middle-cerebral-artery", "Middle cerebral artery, parietal branches", "artery"),
    "mcat": ("temporal-branches-of-middle-cerebral-artery", "Middle cerebral artery, temporal branches", "artery"),
    "aca": ("anterior-cerebral-artery", "Anterior cerebral artery", "artery"),
    "acao": ("orbitofrontal-branches-of-anterior-cerebral-artery", "Anterior cerebral artery, orbitofrontal branches", "artery"),
    "peri": ("pericallosal-artery", "Pericallosal artery", "artery"),
    "acom": ("anterior-communicating-artery", "Anterior communicating artery", "artery"),
    "pcom": ("posterior-communicating-artery", "Posterior communicating artery", "artery"),
    "pca": ("posterior-cerebral-artery", "Posterior cerebral artery", "artery"),
    "ba": ("basilar-artery", "Basilar artery", "artery"),
    "va": ("vertebral-artery", "Vertebral artery", "artery"),
    "sca": ("superior-cerebellar-artery", "Superior cerebellar artery", "artery"),
    "aica": ("anterior-inferior-cerebellar-artery", "Anterior inferior cerebellar artery", "artery"),
    "pica": ("posterior-inferior-cerebellar-artery", "Posterior inferior cerebellar artery", "artery"),
    "ponl": ("lateral-pontine-branches-of-basilar-artery", "Pontine arteries (lateral branches)", "artery"),
    "ponm": ("medial-pontine-branches-of-basilar-artery", "Pontine arteries (paramedian branches)", "artery"),
    "sss": ("superior-sagittal-sinus", "Superior sagittal sinus", "sinus"),
    "iss": ("inferior-sagittal-sinus", "Inferior sagittal sinus", "sinus"),
    "strs": ("straight-sinus", "Straight sinus", "sinus"),
    "trs": ("transverse-sinus", "Transverse sinus", "sinus"),
    "sigs": ("sigmoid-sinus", "Sigmoid sinus", "sinus"),
    "occs": ("occipital-sinus", "Occipital sinus", "sinus"),
    "cavs": ("cavernous-sinus", "Cavernous sinus", "sinus"),
    "sps": ("superior-petrosal-sinus", "Superior petrosal sinus", "sinus"),
    "ips": ("inferior-petrosal-sinus", "Inferior petrosal sinus", "sinus"),
}


def main():
    scene = trimesh.Scene()
    table = []
    for key, (obj, name, kind) in VESSELS.items():
        m = trimesh.load(os.path.join(GLB, obj + ".glb"), force="mesh")
        mni = zmap.frame_to_mni(np.asarray(m.vertices))  # (z_to_mni alone maps the model mirrored: see zmap.mni_to_frame)
        keep_v = mni[:, 2] >= ZMIN
        faces = np.asarray(m.faces)
        keep_f = keep_v[faces].all(axis=1)
        if not keep_f.any():
            print(f"{key:5s} {obj}: nothing above z {ZMIN}")
            continue
        w = zmap.mni_to_world(mni)
        mesh = trimesh.Trimesh(vertices=w, faces=faces[keep_f], process=True)
        mesh.remove_unreferenced_vertices()
        mesh.fix_normals() if mesh.is_watertight else None
        scene.add_geometry(mesh, node_name=key, geom_name=key)
        lo, hi = mesh.bounds
        table.append(dict(key=key, name=name, kind=kind, box=[[round(float(v), 4) for v in lo], [round(float(v), 4) for v in hi]]))
        print(f"{key:5s} {len(mesh.faces):6d} triangles  {name}")
    out = os.path.join(ROOT, "_atlas/raw/v3/vessels.raw.glb")
    scene.export(out, file_type="glb")
    json.dump(dict(vessels=table, credit="Z-Anatomy (CC BY-SA 4.0), warped onto this brain"), open(os.path.join(ROOT, "public/atlas3/vessels.json"), "w"), indent=1)
    print("wrote", out, f"{os.path.getsize(out) / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
