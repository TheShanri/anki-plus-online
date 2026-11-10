import json, sys, cv2, numpy as np
from paths import BASE
for i in range(1, 9):
    d = json.load(open(f"{BASE}/shapes/ovp{i}.json"))
    img = cv2.imread(f"{BASE}/pptx/overlay/ppt/media/{d['photo']}", cv2.IMREAD_UNCHANGED)
    if img.shape[2] == 4:
        a = img[:, :, 3:4] / 255.0
        img = (img[:, :, :3] * a + 255 * (1 - a)).astype(np.uint8)
    m = img.copy()
    for s in d["shapes"]:
        if s["fill"] and s["fill"][0] == "FFFFFF" and s["fill"][1] > 0.9:
            for p in s["polys"]:
                cv2.fillPoly(m, [np.array(p["pts"], np.int32)], (0, 0, 255))
    both = np.hstack([img, m])
    sc = 1400 / both.shape[1]
    cv2.imwrite(f"{BASE}/view/mask{i}.jpg", cv2.resize(both, None, fx=sc, fy=sc, interpolation=cv2.INTER_AREA))
