"""Atlas v3 in the Z-Anatomy frame (the Pathway tracer's and Blood supply's world): the v3 brain outline (hull), carried
back from MNI by the inverse warp (zmap.mni_to_z), so the tools built in that frame draw the same brain as the atlas.
Writes _atlas/raw/v3/hull_z.raw.glb; tools/atlas3/pack_one.mjs compresses it to public/pathways/v3/brain3-hull.glb.
Run: tools/.venv/Scripts/python.exe -I tools/atlas3/zframe.py && node tools/atlas3/pack_one.mjs _atlas/raw/v3/hull_z.raw.glb public/pathways/v3/brain3-hull.glb
"""
import os, sys
import numpy as np
import trimesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import zmap  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
W = os.path.join(ROOT, "_atlas/raw/v3")

m = trimesh.load(os.path.join(W, "hull.raw.glb"), force="mesh")
z = zmap.mni_to_z(zmap.world_to_mni(np.asarray(m.vertices)))
h = trimesh.Trimesh(vertices=z, faces=np.asarray(m.faces), process=False)
h.fix_normals()
trimesh.Scene({"brain3_hull": h}).export(os.path.join(W, "hull_z.raw.glb"), file_type="glb")
lo, hi = h.bounds
print("hull in the Z frame:", len(h.faces), "triangles; box", np.round(lo, 4), np.round(hi, 4), "closed:", h.is_watertight)
