# Map one overlay slide's shapes into its main photo's pixel coordinates; write JSON and a numbered debug image.
#   python ov_to_photo.py <shapes.json> <media dir> <out.json> <debug.jpg> [pic index]
import json, sys
import cv2
import numpy as np

shp, media, out, dbg = sys.argv[1:5]
d = json.load(open(shp))
pics = [(i, it) for i, it in enumerate(d["items"]) if it["kind"] == "pic"]
if len(sys.argv) > 5:
    pi = int(sys.argv[5])
    pic = d["items"][pi]
else:
    # the main photo is the largest picture
    pi, pic = max(pics, key=lambda p: abs((p[1]["box"][2][0] - p[1]["box"][0][0]) * (p[1]["box"][2][1] - p[1]["box"][0][1])))
img = cv2.imread(f"{media}/{pic['image'].split('/')[-1]}", cv2.IMREAD_UNCHANGED)
if img.ndim == 3 and img.shape[2] == 4:
    a = img[:, :, 3:4].astype(np.float32) / 255
    img = (img[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
H, W = img.shape[:2]
(x0, y0), _, (x1, y1), _ = pic["box"]
sr = pic["srcRect"]
# visible part of the image in source pixels
u0, v0 = sr["l"] * W, sr["t"] * H
uw, vh = W * (1 - sr["l"] - sr["r"]), H * (1 - sr["t"] - sr["b"])


def to_px(p):
    return [u0 + (p[0] - x0) / (x1 - x0) * uw, v0 + (p[1] - y0) / (y1 - y0) * vh]


shapes = []
for i, it in enumerate(d["items"]):
    if it["kind"] == "pic" or "polys" not in it:
        continue
    col = (it.get("line") or it.get("fill") or ["888888", 1])[0]
    shapes.append({
        "i": i, "name": it["name"], "kind": it["kind"], "prst": it.get("prst"), "text": it["text"], "textColor": (it.get("textColor") or [None])[0],
        "line": (it.get("line") or [None])[0], "fill": it.get("fill"), "dash": it.get("dash"),
        "polys": [{"pts": [to_px(p) for p in poly["pts"]], "closed": poly["closed"]} for poly in it["polys"]],
    })
json.dump({"photo": pic["image"].split("/")[-1], "w": W, "h": H, "pic": pi, "shapes": shapes}, open(out, "w"))
vis = img.copy()
s = max(1, W // 1400)
for sh in shapes:
    c = sh["line"] or "FF00FF"
    bgr = (int(c[4:6], 16), int(c[2:4], 16), int(c[0:2], 16))
    for poly in sh["polys"]:
        pts = np.array(poly["pts"], np.int32)
        cv2.polylines(vis, [pts], poly["closed"], bgr, 2 * s)
    if sh["kind"] != "cxnSp" and sh["prst"] != "rect":
        p = np.array(sh["polys"][0]["pts"]).mean(0).astype(int)
        cv2.putText(vis, str(sh["i"]), tuple(p), cv2.FONT_HERSHEY_SIMPLEX, 0.9 * s, (0, 0, 0), 5 * s)
        cv2.putText(vis, str(sh["i"]), tuple(p), cv2.FONT_HERSHEY_SIMPLEX, 0.9 * s, (255, 255, 255), 2 * s)
sc = 1400 / max(W, H)
cv2.imwrite(dbg, cv2.resize(vis, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 85])
print(out, W, H, "pic", pi, len(shapes), "shapes")
