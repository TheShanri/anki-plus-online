# Side-by-side sheet of several images at one height (for comparing sources).  python sheet.py <out.jpg> <height> <img>...
import sys
import cv2
import numpy as np
out, h, files = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
ims = []
for f in files:
    im = cv2.imread(f)
    ims.append(cv2.resize(im, (int(im.shape[1] * h / im.shape[0]), h), interpolation=cv2.INTER_AREA))
    ims.append(np.full((h, 8, 3), 255, np.uint8))
cv2.imwrite(out, np.hstack(ims[:-1]), [cv2.IMWRITE_JPEG_QUALITY, 86])
