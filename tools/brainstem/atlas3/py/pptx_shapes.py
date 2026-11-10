# Parse a PPTX slide's pictures and shapes into JSON (slide EMU coordinates, curves flattened to polylines).
#   python pptx_shapes.py <unzipped pptx dir> <slide n> <out.json>
import json, math, re, sys
import xml.etree.ElementTree as ET

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
A = "{%s}" % NS["a"]
P = "{%s}" % NS["p"]
R = "{%s}" % NS["r"]

root_dir, n, out = sys.argv[1], int(sys.argv[2]), sys.argv[3]
theme = ET.parse(f"{root_dir}/ppt/theme/theme1.xml").getroot()
scheme = {}
for el in theme.iter(A + "clrScheme"):
    for c in el:
        tag = c.tag.split("}")[1]
        v = None
        for cc in c:
            v = cc.get("val") if cc.tag.endswith("srgbClr") else cc.get("lastClr")
        scheme[tag] = v
scheme.update({"bg1": scheme.get("lt1"), "tx1": scheme.get("dk1"), "bg2": scheme.get("lt2"), "tx2": scheme.get("dk2")})

rels = {}
for rel in ET.parse(f"{root_dir}/ppt/slides/_rels/slide{n}.xml.rels").getroot():
    rels[rel.get("Id")] = rel.get("Target")


def color_of(el):
    """first colour in a fill/line element: (hex, alpha)"""
    if el is None:
        return None
    for c in el.iter():
        t = c.tag.split("}")[1]
        if t in ("srgbClr", "schemeClr", "prstClr", "sysClr"):
            if t == "srgbClr":
                v = c.get("val")
            elif t == "schemeClr":
                v = scheme.get(c.get("val"), "888888")
            elif t == "sysClr":
                v = c.get("lastClr")
            else:
                v = {"black": "000000", "white": "FFFFFF", "red": "FF0000", "yellow": "FFFF00"}.get(c.get("val"), "888888")
            alpha = 1.0
            for m in c:
                if m.tag.endswith("alpha"):
                    alpha = int(m.get("val")) / 100000
            return [v, alpha]
    return None


def flatten_path(path, w, h):
    """custGeom path -> list of polylines (in path units scaled to w,h of the path box)"""
    pw = float(path.get("w") or w or 1)
    ph = float(path.get("h") or h or 1)
    polys, cur, pos = [], [], (0.0, 0.0)
    closed = []
    for c in path:
        t = c.tag.split("}")[1]
        pts = [(float(p.get("x")), float(p.get("y"))) for p in c.findall(A + "pt")]
        if t == "moveTo":
            if len(cur) > 1:
                polys.append(cur)
                closed.append(False)
            cur = [pts[0]]
            pos = pts[0]
        elif t == "lnTo":
            cur.append(pts[0])
            pos = pts[0]
        elif t == "cubicBezTo":
            p0 = pos
            p1, p2, p3 = pts
            for i in range(1, 17):
                s = i / 16
                x = (1 - s) ** 3 * p0[0] + 3 * (1 - s) ** 2 * s * p1[0] + 3 * (1 - s) * s * s * p2[0] + s ** 3 * p3[0]
                y = (1 - s) ** 3 * p0[1] + 3 * (1 - s) ** 2 * s * p1[1] + 3 * (1 - s) * s * s * p2[1] + s ** 3 * p3[1]
                cur.append((x, y))
            pos = p3
        elif t == "quadBezTo":
            p0 = pos
            p1, p2 = pts
            for i in range(1, 13):
                s = i / 12
                x = (1 - s) ** 2 * p0[0] + 2 * (1 - s) * s * p1[0] + s * s * p2[0]
                y = (1 - s) ** 2 * p0[1] + 2 * (1 - s) * s * p1[1] + s * s * p2[1]
                cur.append((x, y))
            pos = p2
        elif t == "close":
            if len(cur) > 1:
                polys.append(cur)
                closed.append(True)
            cur = []
        elif t == "arcTo":
            # rare in these slides; approximate as a straight hop
            pass
    if len(cur) > 1:
        polys.append(cur)
        closed.append(False)
    return [([(x / pw, y / ph) for x, y in poly], cl) for poly, cl in zip(polys, closed)]


def prst_poly(prst, adj=None):
    if prst in ("ellipse", "oval"):
        return [([(0.5 + 0.5 * math.cos(2 * math.pi * i / 72), 0.5 + 0.5 * math.sin(2 * math.pi * i / 72)) for i in range(72)], True)]
    if prst in ("rect", "roundRect", "flowChartProcess", "snipRoundRect"):
        return [([(0, 0), (1, 0), (1, 1), (0, 1)], True)]
    if prst in ("line", "straightConnector1", "bentConnector2", "curvedConnector3", "bentConnector3"):
        return [([(0, 0), (1, 1)], False)]
    return None


def compose(tf, x, y):
    return tf(x, y)


def walk(el, tf, out_list, depth=0):
    for ch in el:
        t = ch.tag.split("}")[1]
        if t == "grpSp":
            g = ch.find(P + "grpSpPr/" + A + "xfrm")
            if g is None:
                walk(ch, tf, out_list, depth + 1)
                continue
            off = g.find(A + "off"); ext = g.find(A + "ext"); cho = g.find(A + "chOff"); che = g.find(A + "chExt")
            ox, oy, ex, ey = float(off.get("x")), float(off.get("y")), float(ext.get("cx")), float(ext.get("cy"))
            cx, cy, cex, cey = float(cho.get("x")), float(cho.get("y")), float(che.get("cx")) or 1, float(che.get("cy")) or 1
            sx, sy = ex / cex, ey / cey

            def tf2(x, y, tf=tf, ox=ox, oy=oy, cx=cx, cy=cy, sx=sx, sy=sy):
                return tf(ox + (x - cx) * sx, oy + (y - cy) * sy)

            walk(ch, tf2, out_list, depth + 1)
        elif t in ("sp", "cxnSp", "pic"):
            nv = ch.find(".//" + P + "cNvPr")
            name = nv.get("name") if nv is not None else ""
            sppr = ch.find(P + "spPr")
            xf = sppr.find(A + "xfrm") if sppr is not None else None
            if xf is None:
                continue
            off = xf.find(A + "off"); ext = xf.find(A + "ext")
            ox, oy = float(off.get("x")), float(off.get("y"))
            ex, ey = float(ext.get("cx")), float(ext.get("cy"))
            rot = float(xf.get("rot") or 0) / 60000
            fh, fv = xf.get("flipH") == "1", xf.get("flipV") == "1"
            ccx, ccy = ox + ex / 2, oy + ey / 2
            cr, sr = math.cos(math.radians(rot)), math.sin(math.radians(rot))

            def place(u, v, ox=ox, oy=oy, ex=ex, ey=ey, fh=fh, fv=fv, ccx=ccx, ccy=ccy, cr=cr, sr=sr, tf=tf):
                if fh:
                    u = 1 - u
                if fv:
                    v = 1 - v
                x, y = ox + u * ex, oy + v * ey
                dx, dy = x - ccx, y - ccy
                x, y = ccx + dx * cr - dy * sr, ccy + dx * sr + dy * cr
                return tf(x, y)

            item = {"kind": t, "name": name, "rot": rot}
            corners = [place(0, 0), place(1, 0), place(1, 1), place(0, 1)]
            item["box"] = corners
            if t == "pic":
                blip = ch.find(".//" + A + "blip")
                item["image"] = rels.get(blip.get(R + "embed")) if blip is not None else None
                src = ch.find(".//" + A + "srcRect")
                item["srcRect"] = {k: float(src.get(k) or 0) / 100000 for k in ("l", "t", "r", "b")} if src is not None else {"l": 0, "t": 0, "r": 0, "b": 0}
                out_list.append(item)
                continue
            geo = None
            cg = sppr.find(A + "custGeom")
            if cg is not None:
                geo = []
                for path in cg.iter(A + "path"):
                    geo += flatten_path(path, ex, ey)
            else:
                pg = sppr.find(A + "prstGeom")
                if pg is not None:
                    item["prst"] = pg.get("prst")
                    geo = prst_poly(pg.get("prst"))
            if geo:
                item["polys"] = [{"pts": [place(u, v) for u, v in poly], "closed": cl} for poly, cl in geo]
            fill = sppr.find(A + "solidFill")
            nofill = sppr.find(A + "noFill") is not None
            ln = sppr.find(A + "ln")
            item["fill"] = None if nofill else color_of(fill)
            if fill is None and not nofill:
                st = ch.find(P + "style/" + A + "fillRef")
                item["fill"] = color_of(st) if st is not None and st.get("idx") != "0" else None
                item["fillFromStyle"] = True
            if ln is not None and ln.find(A + "noFill") is not None:
                item["line"] = None
            else:
                lc = color_of(ln.find(A + "solidFill")) if ln is not None else None
                if lc is None:
                    st = ch.find(P + "style/" + A + "lnRef")
                    lc = color_of(st) if st is not None else None
                item["line"] = lc
                item["lineW"] = float(ln.get("w")) / 12700 if ln is not None and ln.get("w") else None
                if ln is not None and ln.find(A + "prstDash") is not None:
                    item["dash"] = ln.find(A + "prstDash").get("val")
            txt = []
            tcol = None
            for r_ in ch.iter(A + "r"):
                tt = r_.find(A + "t")
                if tt is not None and tt.text:
                    txt.append(tt.text)
                rp = r_.find(A + "rPr")
                if rp is not None and tcol is None:
                    tcol = color_of(rp.find(A + "solidFill"))
            for br in ch.iter(A + "p"):
                pass
            item["text"] = " ".join(" ".join(txt).split())
            item["textColor"] = tcol
            out_list.append(item)


sld = ET.parse(f"{root_dir}/ppt/slides/slide{n}.xml").getroot()
tree = sld.find(P + "cSld/" + P + "spTree")
items = []
walk(tree, lambda x, y: (x, y), items)
pres = ET.parse(f"{root_dir}/ppt/presentation.xml").getroot()
sz = pres.find(P + "sldSz")
json.dump({"slide": n, "size": [int(sz.get("cx")), int(sz.get("cy"))], "items": items}, open(out, "w"), indent=0)
print(n, len(items), "items", sum(1 for i in items if i["kind"] == "pic"), "pics")
