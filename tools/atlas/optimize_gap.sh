#!/bin/sh
# Compress the registered gap meshes (meshopt) into public/atlas/s/. Run from the repo root after gap_meshes.py.
mkdir -p public/atlas/s
for f in _atlas/atlas2_build/glb/*.glb; do
  out="public/atlas/s/$(basename "$f")"
  npx --yes @gltf-transform/cli optimize "$f" "$out" --compress meshopt --texture-compress false --simplify false --instance false --palette false >/dev/null 2>&1 || echo "FAIL $f"
done
