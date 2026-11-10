# python crop.py <level> <x0> <y0> <x1> <y1> <out name> [scale]  (plate units; grid every 10, labels every 50)
import sys, json, cv2, numpy as np
lv, x0, y0, x1, y1, name = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
sc = float(sys.argv[7]) if len(sys.argv) > 7 else 2.0
from paths import BASE as B
img = cv2.imread(f"{B}/levels/{lv}/canon.png")
mask = cv2.imread(f"{B}/levels/{lv}/cmask.png", 0)
SS = 1.6
c = img[int(y0 * SS):int(y1 * SS), int(x0 * SS):int(x1 * SS)].copy()
m = mask[int(y0 * SS):int(y1 * SS), int(x0 * SS):int(x1 * SS)]
f = sc / SS
c = cv2.resize(c, None, fx=f, fy=f, interpolation=cv2.INTER_CUBIC)
m = cv2.resize(m, (c.shape[1], c.shape[0]), interpolation=cv2.INTER_NEAREST)
cnts, _ = cv2.findContours((m > 0).astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
cv2.drawContours(c, cnts, -1, (0, 170, 0), 1)
for gx in range(int(x0 // 10 * 10), int(x1) + 1, 10):
    X = int((gx - x0) * sc)
    if X < 0: continue
    col = (0, 0, 255) if gx % 50 == 0 else (200, 120, 0)
    cv2.line(c, (X, 0), (X, 6 if gx % 50 else 12), col, 1)
    if gx % 50 == 0: cv2.putText(c, str(gx), (X + 2, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1)
for gy in range(int(y0 // 10 * 10), int(y1) + 1, 10):
    Y = int((gy - y0) * sc)
    if Y < 0: continue
    col = (0, 0, 255) if gy % 50 == 0 else (200, 120, 0)
    cv2.line(c, (0, Y), (6 if gy % 50 else 12, Y), col, 1)
    if gy % 50 == 0: cv2.putText(c, str(gy), (14, Y + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1)
cv2.imwrite(f"{B}/view/{name}.jpg", c, [cv2.IMWRITE_JPEG_QUALITY, 90])
