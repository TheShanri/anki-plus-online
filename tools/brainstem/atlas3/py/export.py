# Copy the built plates into the repo (vector JSON, served auth-gated) and the density photos into content-build/
# (uploaded to the private course-media bucket; never public/).   python export.py [level ...]
import glob, hashlib, json, os, shutil, sys
from levels_cfg import LEVELS
from prep import BASE
from paths import REPO
out_json = f"{REPO}/src/data/brainstem-plates"
out_img = f"{REPO}/content-build/atlas3/brainstem"
os.makedirs(out_img, exist_ok=True)
for lv in (sys.argv[1:] or LEVELS.keys()):
    p = json.load(open(f"{BASE}/levels/{lv}/plate.json"))
    src = f"{BASE}/levels/{lv}/density.webp"
    hsh = hashlib.sha256(open(src, "rb").read()).hexdigest()[:10]
    key = f"atlas3/brainstem/{lv}-histology-{hsh}.webp"
    p["photo"] = {"key": key, "w": p["photo"]["w"], "h": p["photo"]["h"], "kind": "histology"}
    meta = LEVELS[lv].get("meta", {})
    p["sources"] = meta
    json.dump(p, open(f"{out_json}/{lv}.json", "w"), separators=(",", ":"))
    for old in glob.glob(f"{out_img}/{lv}-histology*.webp"):
        os.remove(old)
    shutil.copy(src, f"{REPO}/content-build/{key}")
    print(lv, os.path.getsize(f"{out_json}/{lv}.json"), key)
