"""Round 3 edits to src/data/pathway-map.json (owner audit 2026-11-22: "a lot of the reflexes start / end mid way"):
pathways that stopped at a nucleus now carry on to their effector.
- corneal reflex: the facial nucleus (both sides) and the facial nerve to the orbicularis oculi: both eyes blink
- rubrospinal, tectospinal, reticulospinal and vestibulospinal tracts: the lower motor neuron they drive, out of the
  ventral horn to its muscles (the course cards stop at "lower motor neurons"; the LMN is the standard next neuron)
The added stretches are noLesion (the lesion lab's sites and predictions are unchanged). Idempotent.
Run from the repo root: python tools/pathways/patch_map_round3.py   (then dump-beats.mjs and the v3 build)"""
import json

P = "src/data/pathway-map.json"
d = json.load(open(P, encoding="utf8"))
pw = d["pathways"]


def st(k, label, phys, path, ids=None, marks=None, **kw):
    s = {"k": k, "label": label, "phys": phys, "path": path}
    if ids:
        s["ids"] = ids
    if marks:
        s["marks"] = marks
    s.update(kw)
    return s


def set_neuron(slug, i, neuron):
    ns = pw[slug]["neurons"]
    if len(ns) > i:
        ns[i] = neuron
    else:
        ns.append(neuron)


# corneal: the reflex's motor limb (Lecture 12: "both facial nuclei: both eyes blink")
set_neuron("corneal", 1, {
    "short": "Facial nucleus (both sides)",
    "syn": "Both eyes blink (orbicularis oculi)",
    "synKeys": ["orbicularis", "eyelid", "blink"],
    "stretches": [st("vii", "Facial nerve (CN VII) to the orbicularis oculi", "i",
                     [["motor-nucleus-of-facial-nerve", "i", 0.5], ["facial-nerve-vii", "i", 0.3], ["facial-nerve-vii", "i", 0.9]],
                     ["facial-nerve-vii"], noLesion=True)],
})


def lmn(slug, rel, tract, t, muscle):
    set_neuron(slug, 1, {
        "short": "Lower motor neuron (ventral horn)",
        "syn": muscle,
        "synKeys": ["muscle"],
        "stretches": [st("lmn", "Ventral root and spinal nerve to the muscle", rel,
                         [[tract, rel, t], ["anterior-horn-of-spinal-cord", rel, t], ["anterior-root-of-spinal-nerve", rel, t]],
                         ["anterior-horn-of-spinal-cord", "anterior-root-of-spinal-nerve"], noLesion=True)],
    })


lmn("rubrospinal", "c", "rubrospinal-tract", 0.55, "Forearm flexors (upper limb flexion)")
lmn("tectospinal", "c", "tectospinal-tract", 0.8, "Neck muscles (head turns toward the stimulus)")
lmn("reticulospinal", "i", "lateral-reticulospinal-tract", 0.5, "Axial and proximal muscles (posture)")
lmn("vestibulospinal", "i", "lateral-vestibulospinal-tract", 0.5, "Axial (antigravity) muscles (balance)")

# cerebellar circuit: the VA/VL thalamus on to the motor cortex (the course card: "VA/VL thalamus (then motor cortex)")
set_neuron("cerebellar", 3, {
    "short": "VA/VL thalamus (and the red nucleus)",
    "syn": "Motor cortex (other side)",
    "synKeys": ["motor cortex", "precentral"],
    "stretches": [st("tc", "Thalamocortical fibres: VA/VL thalamus, internal capsule, motor cortex", "c",
                     [["thalamus", "c", 0.5], ["mni-posterior-limb-of-internal-capsule", "c", 0.5], ["precentral-gyrus", "c", 0.5]],
                     ["mni-posterior-limb-of-internal-capsule"], noLesion=True)],
})

# solitary nucleus: the course card's dorsal motor nucleus of the vagus output (the heart), between the nucleus ambiguus and
# the superior salivatory nucleus; the glands and heart themselves are end sites in anatomySpec (SITES.solitary.ends)
sol = pw["solitary"]["neurons"][1]["stretches"]
if not any(s["k"] == "dm" for s in sol):
    i = next(j for j, s in enumerate(sol) if s["k"] == "na") + 1
    sol.insert(i, st("dm", "To the dorsal motor nucleus of the vagus", "i",
                     [["medulla-oblongata", "i", 0.55, 0.004, 0, 0.006], ["posterior-nucleus-of-vagus-nerve", "i", 0.5]],
                     ["posterior-nucleus-of-vagus-nerve"], noLesion=True))
pw["solitary"]["neurons"][1]["synKeys"] = ["salivatory", "ambiguus", "vagus", "dorsal motor", "lateral horn"]

# the autonomic pathways reach two targets each, one after the other: name the first one for what it is (they read as the
# same ending twice: "smooth muscle, cardiac muscle, glands" then "heart, lungs, gut and glands")
pw["sympathetic"]["neurons"][-1]["syn"] = "Skin: vessels, sweat glands, hair muscles"
pw["parasympathetic"]["neurons"][-1]["syn"] = "Heart (cardiac muscle)"

json.dump(d, open(P, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
print("patched", len(pw), "pathways")
