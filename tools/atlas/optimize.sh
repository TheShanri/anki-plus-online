#!/bin/sh
# usage: optimize.sh in.glb -> public/atlas/<same relative>  (meshopt compression)
in="$1"; rel="${in#_atlas/raw/glb/}"; out="public/atlas/$rel"
mkdir -p "$(dirname "$out")"
npx --yes @gltf-transform/cli optimize "$in" "$out" --compress meshopt --texture-compress false --simplify false --instance false --palette false --join false --flatten false >/dev/null 2>&1 || echo "FAIL $in"
