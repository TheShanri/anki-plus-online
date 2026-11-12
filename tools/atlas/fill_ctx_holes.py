"""Closes the small boundary loops of the context cerebrum shell (pinholes at the orbital roof, cracks) by fanning each loop to its centroid.
Run (repo root):
  npx @gltf-transform/cli copy public/atlas/context.glb _atlas/fill/ctx_raw.glb ; npx @gltf-transform/cli dequantize _atlas/fill/ctx_raw.glb _atlas/fill/ctx_dq.glb
  tools/.venv/Scripts/python.exe -I tools/atlas/fill_ctx_holes.py
  npx @gltf-transform/cli optimize _atlas/fill/ctx_fixed.glb public/atlas/context.glb --compress meshopt --texture-compress false --simplify false --instance false --palette false --join false --flatten false"""
import os, collections, numpy as np, trimesh
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
F = os.path.join(ROOT, "_atlas/fill")
sc = trimesh.load(os.path.join(F, "ctx_dq.glb"), force="scene")
MAXLOOP = int(os.environ.get("MAXLOOP", "400"))
for name in list(sc.geometry):
    g = sc.geometry[name]
    g.merge_vertices()
    f = g.faces
    directed = np.vstack([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    und = np.sort(directed, axis=1)
    u, inv, cnt = np.unique(und, axis=0, return_inverse=True, return_counts=True)
    bd = directed[cnt[inv] == 1]
    adj = collections.defaultdict(list)
    for a, b in bd:
        adj[a].append(b); adj[b].append(a)
    comp = {}
    cid = 0
    for s in adj:
        if s in comp: continue
        st = [s]
        while st:
            x = st.pop()
            if x in comp: continue
            comp[x] = cid; st += adj[x]
        cid += 1
    members = collections.defaultdict(list)
    for v, c in comp.items(): members[c].append(v)
    V = g.vertices.copy(); newv = []; newf = []
    cent = {}
    for c, vs in members.items():
        if len(vs) > MAXLOOP: continue
        cent[c] = len(V) + len(newv); newv.append(V[vs].mean(0))
    for a, b in bd:
        c = comp[a]
        if c in cent: newf.append([b, a, cent[c]])
    print(name, "loops", len(members), "filled", len(cent), "faces added", len(newf))
    if newf:
        V = np.vstack([V, np.array(newv)]); Fc = np.vstack([f, np.array(newf)])
        sc.geometry[name] = trimesh.Trimesh(V, Fc, process=False)
for g in sc.geometry.values(): _ = g.vertex_normals  # the viewer lights the shell: keep a NORMAL attribute
sc.export(os.path.join(F, "ctx_fixed.glb"))
