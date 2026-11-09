"""Writes src/data/part-anchors.json: every anchor of the four anatomy parts (spine, thorax, gut, head-targets) in
world metres (worldOffset + local anchor), so the pathway scene can place a waypoint on a part without fetching parts.json.
usage: python -I tools/pathways/build_anchor_table.py"""
import json

d = json.load(open("public/pathways/parts.json", encoding="utf8"))["parts"]
out = {}
for f in ["spine", "thorax", "gut", "head-targets"]:
    p = d[f]
    o = p["worldOffset"]
    out[f] = {k: [round(o[i] + v[i], 4) for i in range(3)] for k, v in p["anchors"].items()}
    out[f]["_offset"] = [round(x, 5) for x in o]
json.dump(out, open("src/data/part-anchors.json", "w"), separators=(",", ":"))
print({k: len(v) for k, v in out.items()})
