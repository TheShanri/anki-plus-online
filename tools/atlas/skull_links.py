"""Map course skull, spine and meninges structures to the skull / spine layer (public/atlas/skull.glb, spine-atlas.glb, skull-landmarks.json).
The layer GLBs are one merged mesh each (bones are not separate nodes), so a structure is shown as:
  - a marker + label at its landmark(s)            (bregma, lambda, pterion, foramina...)
  - a highlighted tube along a polyline            (sutures, foramen magnum rim, vertebral canal)
  - a highlighted patch of the bone mesh: the triangles within `radius` of its anchor points (bones, fossae, vertebral parts). Approximate.
  - layered generated shells (spaces)              (epidural / subdural / subarachnoid; approximate: no arachnoid or pia mesh exists)
Writes src/data/atlas-skull.json and adds a link entry (skull: true) per structure to src/data/atlas-links.json (idempotent).
Run standalone, or it runs at the end of link_atlas2.py:  python tools/atlas/skull_links.py"""
import json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def main():
    lm = json.load(open(os.path.join(ROOT, "public/atlas/skull-landmarks.json")))
    L = lm["landmarks"]; V = lm["vertebrae"]; SU = lm["sutures"]
    structs = {s["slug"]: s for s in json.load(open(os.path.join(ROOT, "content/nsci3250/structures.json"), encoding="utf8"))}
    vk = list(V.keys())
    def vp(kind, keys=None): return [V[k][kind] for k in (keys or vk)]
    out = {}
    def add(slug, region, kind, anchors=(), radius=0.0, labels=(), tubes=(), closed=False, shells=None, approx=False, tube_r=0.0015, note=None):
        if slug not in structs: return
        out[slug] = dict(region=region, kind=kind, anchors=[list(a) for a in anchors], radius=radius, labels=[[*p, t] for p, t in labels],
                         tubes=[[list(p) for p in t] for t in tubes], closed=closed, shells=shells, approx=approx, tubeR=tube_r, note=note)
    sh = lambda d, dx=0, dy=0, dz=0: [d[0] + dx, d[1] + dy, d[2] + dz]
    # bones: a patch of the merged skull mesh around anchor points (approximate: the mesh has no bone boundaries)
    add("frontal-bone", "skull", "patch", [[0, 1.66, 0.085], [0.03, 1.68, 0.06], [-0.03, 1.68, 0.06]], 0.045, [([0, 1.66, 0.1], "Frontal bone")], approx=True)
    add("parietal-bone", "skull", "patch", [[0.06, 1.68, -0.03], [-0.06, 1.68, -0.03], [0, 1.72, -0.03]], 0.05, [([0.06, 1.7, -0.03], "Parietal bone (L)"), ([-0.06, 1.7, -0.03], "Parietal bone (R)")], approx=True)
    add("occipital-bone", "skull", "patch", [[0, 1.6, -0.1], [0, 1.65, -0.095], [0, 1.56, -0.05]], 0.05, [([0, 1.6, -0.103], "Occipital bone")], approx=True)
    add("temporal-bone", "skull", "patch", [[0.068, 1.6, -0.01], [-0.068, 1.6, -0.01]], 0.04, [([0.072, 1.6, -0.01], "Temporal bone (L)"), ([-0.072, 1.6, -0.01], "Temporal bone (R)")], approx=True)
    add("sphenoid-bone", "skull", "patch", [L["sella_turcica"], sh(L["pterion"], 0, -0.005, -0.005), sh(L["pterion_R"], 0, -0.005, -0.005)], 0.03, [(L["sella_turcica"], "Sphenoid bone (sella turcica)")], approx=True)
    add("cribriform-plate", "skull", "patch", [L["foramen_caecum"]], 0.014, [(L["foramen_caecum"], "Cribriform plate region (foramen caecum)")], approx=True)
    # landmarks
    add("bregma", "skull", "point", [], 0, [(L["bregma"], "Bregma")])
    add("lambda", "skull", "point", [], 0, [(L["lambda"], "Lambda")])
    add("pterion", "skull", "point", [], 0, [(L["pterion"], "Pterion (L)"), (L["pterion_R"], "Pterion (R)")])
    ring = lm["foramen_magnum_ring"]
    add("foramen-magnum", "skull", "tube", [], 0, [(L["foramen_magnum"], "Foramen magnum")], tubes=[ring], closed=True, tube_r=0.0016)
    # sutures: tubes along the contact lines
    add("sagittal-suture", "skull", "tube", [], 0, [(SU["sagittal"][len(SU["sagittal"]) // 2], "Sagittal suture")], tubes=[SU["sagittal"]])
    add("coronal-suture", "skull", "tube", [], 0, [(SU["coronal"][len(SU["coronal"]) // 2], "Coronal suture")], tubes=[SU["coronal"]])
    add("lambdoid-suture", "skull", "tube", [], 0, [(SU["lambdoid"][len(SU["lambdoid"]) // 2], "Lambdoid suture")], tubes=[SU["lambdoid"]])
    # fossae: patch of the cranial floor around the fossa points
    add("anterior-cranial-fossa", "skull", "patch", [L["fossa_anterior_L"], L["fossa_anterior_R"]], 0.03, [(L["fossa_anterior_L"], "Anterior cranial fossa (L)"), (L["fossa_anterior_R"], "Anterior cranial fossa (R)")], approx=True)
    add("middle-cranial-fossa", "skull", "patch", [L["fossa_middle_L"], L["fossa_middle_R"]], 0.03, [(L["fossa_middle_L"], "Middle cranial fossa (L)"), (L["fossa_middle_R"], "Middle cranial fossa (R)")], approx=True)
    add("posterior-cranial-fossa", "skull", "patch", [L["fossa_posterior"], L["fossa_posterior_L"], L["fossa_posterior_R"]], 0.035, [(L["fossa_posterior"], "Posterior cranial fossa")], approx=True)
    # meningeal spaces: generated layered shells around the brain (real dura exists only as falx/tentorium inside the merged skull mesh)
    add("epidural-space", "meninges", "shells", [], 0, [], shells="epidural", approx=True)
    add("subdural-space", "meninges", "shells", [], 0, [], shells="subdural", approx=True)
    add("subarachnoid-space", "meninges", "shells", [], 0, [], shells="subarachnoid", approx=True)
    # vertebrae: per-vertebra points (the vertebra meshes are single meshes: markers + patches, approximate)
    cerv, thor, lumb = [k for k in vk if k[0] == "C"], [k for k in vk if k[0] == "T"], [k for k in vk if k[0] == "L"]
    lab = lambda kind, name: [(p, name) for p in vp(kind)[:1]]
    add("vertebral-body", "spine", "patch", vp("body"), 0.009, lab("body", "Vertebral body"), approx=True)
    add("vertebral-foramen", "spine", "patch", vp("foramen"), 0.007, lab("foramen", "Vertebral foramen"), approx=True)
    add("spinous-process", "spine", "patch", vp("spinous"), 0.007, lab("spinous", "Spinous process"), approx=True)
    add("transverse-process", "spine", "patch", vp("transverse_l") + vp("transverse_r"), 0.007, lab("transverse_l", "Transverse process"), approx=True)
    add("vertebral-arch", "spine", "patch", vp("foramen") + vp("spinous") + vp("transverse_l") + vp("transverse_r"), 0.008, lab("spinous", "Vertebral arch"), approx=True)
    add("vertebral-canal", "spine", "tube", [], 0, lab("foramen", "Vertebral canal"), tubes=[vp("foramen")], tube_r=0.004, approx=True)
    add("dural-sac", "spine", "tube", [], 0, lab("foramen", "Dural sac"), tubes=[vp("foramen")], tube_r=0.0055, approx=True)
    add("intervertebral-disc", "spine", "patch", [[(a[i] + b[i]) / 2 for i in range(3)] for a, b in zip(vp("body")[:-1], vp("body")[1:])], 0.006, lab("body", "Intervertebral disc"), approx=True)
    add("intervertebral-foramen", "spine", "patch", [[(a[i] + b[i]) / 2 for i in range(3)] for a, b in zip(vp("body")[:-1], vp("transverse_l")[:-1])], 0.005, lab("transverse_l", "Intervertebral foramen"), approx=True)
    add("cervical-vertebrae", "spine", "patch", vp("body", cerv), 0.017, [(V["C4"]["body"], "Cervical vertebrae")], approx=True)
    add("thoracic-vertebrae", "spine", "patch", vp("body", thor), 0.02, [(V["T6"]["body"], "Thoracic vertebrae")], approx=True)
    add("lumbar-vertebrae", "spine", "patch", vp("body", lumb), 0.024, [(V["L3"]["body"], "Lumbar vertebrae")], approx=True)
    l5 = V["L5"]["body"]
    add("sacral-vertebrae", "spine", "patch", [sh(l5, 0, -0.04, 0.005)], 0.045, [(sh(l5, 0, -0.04, 0.005), "Sacrum")], approx=True)
    add("coccyx", "spine", "patch", [sh(l5, 0, -0.1, -0.01)], 0.03, [(sh(l5, 0, -0.1, -0.01), "Coccyx")], approx=True)
    add("atlas", "spine", "patch", [V["C1"]["body"], V["C1"]["spinous"], V["C1"]["transverse_l"], V["C1"]["transverse_r"]], 0.012, [(V["C1"]["transverse_l"], "Atlas (C1)")], approx=True)
    add("axis", "spine", "patch", [V["C2"]["body"], V["C2"]["spinous"]], 0.014, [(V["C2"]["body"], "Axis (C2)")], approx=True)
    add("vertebra-prominens", "spine", "patch", [V["C7"]["body"], V["C7"]["spinous"]], 0.014, [(V["C7"]["spinous"], "Vertebra prominens (C7)")], approx=True)
    json.dump(out, open(os.path.join(ROOT, "src/data/atlas-skull.json"), "w", encoding="utf8"), separators=(",", ":"))
    lp = os.path.join(ROOT, "src/data/atlas-links.json")
    links = json.load(open(lp, encoding="utf8"))
    for slug, e in out.items():
        old = links.get(slug)
        if old and (old["meshIds"] or old["slices"]) and not old.get("skull"):
            print("skipped (already has a mesh or MRI label):", slug); continue
        links[slug] = dict(name=structs[slug]["name"], meshIds=[], approximate=e["approx"], fallbackParentId=None, slices=None,
                           exactIn=[] if e["approx"] else ["3d"], registered=False, skull=True)
    json.dump(links, open(lp, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
    print("skull/spine/meninges structures mapped:", len(out))


if __name__ == "__main__":
    main()
