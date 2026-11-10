#!/bin/sh
# usage (repo root): tools/atlas/optimize_fill.sh   -> public/atlas/brainfill.glb (meshopt, named nodes kept)
npx --yes @gltf-transform/cli optimize _atlas/fill/brainfill_raw.glb public/atlas/brainfill.glb --compress meshopt --texture-compress false --simplify false --instance false --palette false --join false --flatten false
