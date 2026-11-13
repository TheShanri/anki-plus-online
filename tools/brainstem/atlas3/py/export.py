# Copy the built plates into the repo (vector JSON, served auth-gated) and the density photos into content-build/
# (uploaded to the private course-media bucket; never public/).   python export.py [level ...]
import glob, hashlib, json, os, shutil, sys
from levels_cfg import LEVELS, SURFACES
from prep import BASE
from paths import REPO
out_json = f"{REPO}/src/data/brainstem-plates"
out_img = f"{REPO}/content-build/atlas3/brainstem"
os.makedirs(out_img, exist_ok=True)
_mp = f"{REPO}/tools/brainstem/atlas3/photos-manifest.json"
MANIFEST = json.load(open(_mp)) if os.path.exists(_mp) else {}
for lv in (sys.argv[1:] or LEVELS.keys()):
    p = json.load(open(f"{BASE}/levels/{lv}/plate.json"))
    src = f"{BASE}/levels/{lv}/density.webp"
    hsh = hashlib.sha256(open(src, "rb").read()).hexdigest()[:10]
    surf = lv in SURFACES
    kind = "gross" if surf else "histology"
    key = f"atlas3/brainstem/{lv}-{kind}-{hsh}.webp"
    p["photo"] = {"key": key, "w": p["photo"]["w"], "h": p["photo"]["h"], "kind": kind}
    if surf:
        p["view"] = "surface"
    # a plate only names a photo that is already in the private bucket (photos-manifest.json, written by
    # upload-photos.mjs), so HEAD never points at a missing image: a changed photo keeps the last uploaded one until
    # `node ../upload-photos.mjs` has run and the level is exported again
    if key not in MANIFEST:
        old = None
        try:
            old = json.load(open(f"{out_json}/{lv}.json")).get("photo")
        except FileNotFoundError:
            pass
        if old and old.get("key") in MANIFEST and old.get("w") == p["photo"]["w"] and old.get("h") == p["photo"]["h"]:
            print(f"  {lv}: new photo {key} not uploaded yet; keeping {old['key']} (run upload-photos.mjs, then export again)")
            p["photo"] = old
        else:
            print(f"  {lv}: photo {key} not uploaded yet; plate ships without its photo half (run upload-photos.mjs, then export again)")
            del p["photo"]
    meta = (LEVELS.get(lv) or SURFACES[lv]).get("meta", {})
    p["sources"] = meta
    json.dump(p, open(f"{out_json}/{lv}.json", "w"), separators=(",", ":"))
    for stale in glob.glob(f"{out_img}/{lv}-{kind}*.webp"):
        os.remove(stale)
    shutil.copy(src, f"{REPO}/content-build/{key}")
    print(lv, os.path.getsize(f"{out_json}/{lv}.json"), key)
