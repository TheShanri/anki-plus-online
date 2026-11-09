#!/bin/sh
# usage: tools/pathways/optimize.sh   (meshopt-compress _atlas/pathways_raw/*.glb into public/pathways/)
mkdir -p public/pathways
for f in ${PARTS:-hand foot muscle eye}; do
  npx --yes @gltf-transform/cli optimize "_atlas/pathways_raw/$f.glb" "public/pathways/$f.glb" --compress meshopt --texture-compress false --simplify false --instance false --palette false >/dev/null 2>&1 || { echo "FAIL $f (copying raw)"; cp "_atlas/pathways_raw/$f.glb" "public/pathways/$f.glb"; }
done
