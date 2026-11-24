"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, X } from "lucide-react";
import { Segmented } from "@/components/atlas/ui/Toolbar";
import { AtlasLoader } from "@/components/atlas/ui/AtlasLoader";
import { StructureInfo } from "@/components/atlas/StructureInfo";
import { SupplementaryHeadsUp, useSupplementaryGate } from "@/components/supplementary/Supplementary";
import { trackAtlas } from "@/lib/atlas/progress";
import { loadAtlas2, type Atlas2 } from "@/lib/atlas/slices";
import type { SliceView } from "@/components/atlas/SliceViewer";
import { SectionEmbed } from "@/components/atlas/brainstem/SectionEmbed";
import type { Atlas3Props, Cut3, Pin3, View3 } from "./engine/Atlas3Canvas";
import { loadVessels, type Index3, type Label3, type Prog } from "./engine/data";
import { SECTIONS, hasGeometry, loadCatalog, loadFibres, norm, search, sectionOf, type CatItem, type Fibres } from "./catalog";
import { isDeep, presentItem, STEM } from "./present";
import { ExploreBar, VIEWS, type CutAxis, type Sides } from "./ExploreBar";
import { DEEP, WHOLE, autoFor, effective, layerSets, type Group as LayerGroup, type Layers, type Mode } from "./layers";
import "@/components/atlas/ui/atlas-ui.css";
import "./atlas3.css";

const Atlas3Canvas = dynamic(() => import("./engine/Atlas3Canvas").then((m) => m.Atlas3Canvas), {
  ssr: false,
  loading: () => <AtlasLoader label="Loading the 3D atlas" progress={0.05} stages={[{ id: "code", label: "Starting the viewer", state: "active" }]} />,
});
const SliceViewer = dynamic(() => import("@/components/atlas/SliceViewer"), {
  ssr: false,
  loading: () => <AtlasLoader label="Loading the MRI atlas" progress={0.05} stages={[{ id: "code", label: "Starting the MRI viewer", state: "active" }]} />,
});

type Stage = "3d" | "mri" | "sections";
/** ?view= values of the MRI viewer (the old atlas's links) */
const MRI_VIEW: Record<string, SliceView> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", transverse: "axial", multi: "multi", multiplanar: "multi", render: "render" };

/** world extents (metres) of the brain for the cut slider, per axis */
const RANGE: Record<"x" | "y" | "z", [number, number]> = { x: [-0.072, 0.072], y: [-0.072, 0.082], z: [-0.105, 0.072] };
/** where a cut lies, in words, from the anterior commissure (the atlas's origin) */
function cutWords(axis: CutAxis, pos: number): string {
  const mm = Math.round(pos * 1000);
  const n = Math.abs(mm);
  if (axis === "z") return `Coronal · ${n ? `${n} mm ${mm > 0 ? "anterior" : "posterior"} to` : "through"} the anterior commissure`;
  if (axis === "y") return `Horizontal · ${n ? `${n} mm ${mm > 0 ? "above" : "below"}` : "at"} the anterior commissure`;
  if (axis === "x") return `Sagittal · ${n ? `${n} mm ${mm > 0 ? "left" : "right"} of` : "at"} the midline`;
  return "";
}
/** names shown with the labels toggle, by group (one pin each, the left copy) */
const OVERVIEW: Record<LayerGroup, string[]> = {
  cortex: ["frontal-lobe", "parietal-lobe", "temporal-lobe", "occipital-lobe"],
  deepgm: ["caudate-nucleus", "putamen", "globus-pallidus", "thalamus", "hippocampus", "amygdala", "hypothalamus"],
  deepwm: ["internal-capsule", "corpus-callosum", "fornix"],
  ventricles: ["lateral-ventricle", "third-ventricle", "cerebral-aqueduct", "fourth-ventricle"],
  brainstem: ["midbrain", "pons", "medulla"],
  cerebellum: ["cerebellum"],
  nerves: ["optic-nerve", "oculomotor-nerve", "trigeminal-nerve", "facial-nerve", "vagus-nerve", "hypoglossal-nerve"],
  bones: [],
};
const BRAIN_GROUPS: LayerGroup[] = ["cortex", "deepgm", "deepwm", "ventricles", "brainstem", "cerebellum", "nerves"];
const allBrain = (m: Mode): Partial<Layers> => Object.fromEntries(BRAIN_GROUPS.map((g) => [g, m]));
const GROUPS_SAME = (a: Layers, b: Layers) => BRAIN_GROUPS.every((g) => a[g] === b[g]);


export function Explore3({
  initialS,
  initialN,
  initialCam,
  initialCut,
  initialSide,
  initialView,
  courseSlug,
  embedded = false,
  height,
}: {
  initialS?: string;
  initialN?: string;
  initialCam?: string;
  initialCut?: string;
  initialSide?: string;
  /** an MRI view (coronal, sagittal, axial, multi, render) opens the MRI mode; "sections" the course sections */
  initialView?: string;
  /** the student's course, for the course-section images (the Sections mode is hidden without it) */
  courseSlug?: string;
  /** inside another page (the atlas peek over the study cards): no URL changes, a fixed height */
  embedded?: boolean;
  height?: number;
}) {
  const [index, setIndex] = useState<Index3 | null>(null);
  const [items, setItems] = useState<CatItem[] | null>(null);
  const [q, setQ] = useState("");
  // the deep link (initialS / initialN) is selected once the data is in, through the same gate as a click
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View3>((VIEWS.find((v) => v.id === initialCam)?.id ?? "left") as View3);
  const [viewNonce, setViewNonce] = useState(0);
  const [sides, setSides] = useState<Sides>(initialSide === "L" || initialSide === "R" ? initialSide : "both");
  const [cutAxis, setCutAxis] = useState<CutAxis>(() => (initialCut ? (initialCut.split(":")[0] as CutAxis) : "off"));
  const [cutPos, setCutPos] = useState<number>(() => (initialCut ? Number(initialCut.split(":")[1]) || 0 : 0));
  const [cutFlip, setCutFlip] = useState(() => !!initialCut?.endsWith(":f"));
  // what is shown, group by group (the student's), and what the current selection needs on top (auto, transient)
  const [layers, setLayers] = useState<Layers>(WHOLE);
  const [auto, setAuto] = useState<Partial<Layers>>({});
  const eff = useMemo(() => effective(layers, auto), [layers, auto]);
  const [locked, setLocked] = useState(false);
  const [labels, setLabels] = useState(false);
  const [full, setFull] = useState(false);
  const stageEl = useRef<HTMLElement>(null);
  const [look, setLook] = useState<"natural" | "regions">("natural");
  const [focus, setFocus] = useState<{ ids: number[]; box?: [[number, number, number], [number, number, number]]; nonce: number } | null>(null);
  const [prog, setProg] = useState<{ shell?: Prog; inner?: Prog }>({});
  const listRef = useRef<HTMLDivElement>(null);
  // a wide screen (the card floats over the stage's right side; on a phone it is a bottom sheet)
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // the stage: the 3D brain, the MRI atlas, or the course's own brainstem sections, all on the same selection
  const startStage: Stage = initialView && MRI_VIEW[initialView] ? "mri" : initialView === "sections" && courseSlug ? "sections" : "3d";
  const [stage, setStage] = useState<Stage>(startStage);
  const [seenStage, setSeenStage] = useState<Set<Stage>>(() => new Set([startStage]));
  const [sliceView, setSliceView] = useState<SliceView>((initialView && MRI_VIEW[initialView]) || "coronal");
  const [atlas2, setAtlas2] = useState<Atlas2 | null>(null);
  const [secLevel, setSecLevel] = useState<string | null>(null);
  const stageRef = useRef(stage);
  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);
  const showStage = useCallback((st: Stage) => {
    setStage(st);
    setSeenStage((o) => (o.has(st) ? o : new Set([...o, st])));
  }, []);
  useEffect(() => {
    if (!seenStage.has("mri") || atlas2) return;
    let alive = true;
    loadAtlas2().then((a) => alive && setAtlas2(a));
    return () => {
      alive = false;
    };
  }, [seenStage, atlas2]);
  // structures beyond the syllabus (atlas extras) open behind the app's "just curious" heads-up, and lock again after
  const gate = useSupplementaryGate("atlas-3d");
  const [pendingExtra, setPendingExtra] = useState<{ it: CatItem; frame: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    loadCatalog().then((c) => alive && setItems(c.items));
    return () => {
      alive = false;
    };
  }, []);
  const bySlug = useMemo(() => new Map((items ?? []).map((it) => [it.slug, it])), [items]);
  const item = sel ? (bySlug.get(sel) ?? null) : null;
  const byId = useMemo(() => new Map((index?.labels ?? []).map((l) => [l.id, l])), [index]);

  // the item a picked label belongs to: the smallest course structure that contains it, else its atlas extra
  const itemForLabel = useCallback(
    (l: Label3): CatItem | null => {
      if (!items) return null;
      let best: CatItem | null = null;
      for (const it of items) {
        if (!it.ids.includes(l.id)) continue;
        if (!best || it.ids.length < best.ids.length || (it.ids.length === best.ids.length && best.extra && !it.extra)) best = it;
      }
      return best;
    },
    [items],
  );

  // ---- what is shown
  const selIds = useMemo(() => item?.ids ?? [], [item]);
  const selDeep = useMemo(() => isDeep(selIds, byId), [selIds, byId]);
  const vesselKeys = item?.vessels?.length ? item.vessels : null;
  // a tract drawn as fibres: its polylines, loaded with the selection, and the camera framed on them
  const [fibres, setFibres] = useState<{ slug: string; f: Fibres } | null>(null);
  useEffect(() => {
    if (!item?.fibre) return;
    let alive = true;
    const slug = item.slug;
    loadFibres(slug).then((f) => {
      if (!alive) return;
      setFibres({ slug, f });
      const pts = f.lines.flat();
      if (!pts.length) return;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < pts.length; i += 3)
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], pts[i + k]);
          hi[k] = Math.max(hi[k], pts[i + k]);
        }
      setFocus((o) => ({ ids: [], box: [lo as [number, number, number], hi as [number, number, number]], nonce: (o?.nonce ?? 0) + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [item]);
  const fibreLines = item?.fibre && fibres?.slug === item.slug ? fibres.f.lines : null;
  // a structure of the body layer (skull, meninges, spine and cord, eye, ear, nose): shown as its spec says (the parts
  // around it, the brain hidden, as a veil, shown, or the deep view of some labels; tools/atlas3/bodyspec.py)
  const bodySpec = item?.body && !item.ids.length ? item.body : null;
  // the labels a body item needs drawn solid (a "deep" spec's near structures) or hidden (a "show" spec's)
  const forceIds = useMemo(() => (bodySpec?.brain === "deep" ? (bodySpec.near ?? []) : []), [bodySpec]);
  const forceHide = useMemo(() => new Set(bodySpec?.brain === "show" ? (bodySpec.near ?? []) : []), [bodySpec]);
  // the skull and spine: a body item's parts, and every bone when the layer is on (see-through or solid)
  const bonesOn = eff.bones !== "off";
  const bodyLayer = useMemo(
    () => (bodySpec || bonesOn ? { show: [...(bodySpec?.ctx ?? []), ...(bonesOn ? ["@bones"] : [])], lit: bodySpec?.keys ?? [], stagger: bodySpec?.stagger, glass: eff.bones === "glass" } : null),
    [bodySpec, bonesOn, eff.bones],
  );
  // the layers as the canvas's sets: hidden labels, see-through ones (one veil per group), the brain's outline
  const sets = useMemo(() => (index ? layerSets(index, eff, new Set([...selIds, ...forceIds]), forceHide) : null), [index, eff, selIds, forceIds, forceHide]);
  const hiddenIds = useMemo(() => sets?.hiddenIds ?? [], [sets]);
  const ghostIds = useMemo(() => sets?.ghostIds ?? [], [sets]);
  const hideSides = useMemo<("L" | "R")[]>(() => (sides === "L" ? ["R"] : sides === "R" ? ["L"] : []), [sides]);
  // one hemisphere shown: a sagittal cut keeps its lateral part and stays inside it (the hidden hemisphere and the cut
  // together would leave a sliver: the medial view plus a sagittal cut drew floating cut faces)
  const oneSide = cutAxis === "x" && sides !== "both";
  const cutRange: [number, number] = cutAxis === "off" ? [0, 0] : oneSide ? (sides === "L" ? [0, RANGE.x[1]] : [RANGE.x[0], 0]) : RANGE[cutAxis];
  const cutPosEff = cutAxis === "off" ? 0 : Math.min(cutRange[1], Math.max(cutRange[0], cutPos));
  const cutFlipEff = oneSide ? (sides === "L") !== cutFlip : cutFlip;
  const cut = useMemo<Cut3 | null>(() => (cutAxis === "off" ? null : { axis: cutAxis, pos: cutPosEff, flip: cutFlipEff }), [cutAxis, cutPosEff, cutFlipEff]);
  const pins = useMemo(() => {
    if (!item) return [];
    if (item.body?.marks && !item.ids.length) return item.body.marks.map((m) => ({ id: -1, text: m.text, p: m.p }));
    // one pin per side for paired structures (the left first), from the first leaf of each side
    const out: { id: number; text: string }[] = [];
    const seen = new Set<string>();
    for (const id of item.ids) {
      const l = byId.get(id);
      if (!l || seen.has(l.side)) continue;
      if (hideSides.includes(l.side as "L" | "R")) continue;
      seen.add(l.side);
      out.push({ id, text: item.name });
    }
    return out.slice(0, 2);
  }, [item, byId, hideSides]);
  // the labels toggle: the main structures of each group that is drawn solid, one name each (its left copy)
  const overview = useMemo(() => {
    if (!labels || !items || !index) return [] as Pin3[];
    const out: Pin3[] = [];
    for (const g of BRAIN_GROUPS) {
      if (eff[g] !== "solid") continue;
      for (const slug of OVERVIEW[g]) {
        const it = bySlug.get(slug);
        if (!it || it.slug === item?.slug) continue;
        const ls = it.ids.map((id) => byId.get(id)).filter((l): l is Label3 => !!l && !hideSides.includes(l.side as "L" | "R") && !hiddenIds.includes(l.id));
        const l = ls.find((x) => x.side === "L") ?? ls.find((x) => x.side === "M") ?? ls[0];
        if (!l?.centroid) continue;
        // not where a cut has removed it
        if (cut) {
          const k = cut.axis === "x" ? 0 : cut.axis === "y" ? 1 : 2;
          const c = l.centroid[k];
          if (cut.flip ? c < cut.pos : c > cut.pos) continue;
        }
        out.push({ id: l.id, text: it.name });
      }
    }
    return out;
  }, [labels, items, index, eff, bySlug, byId, item, hideSides, hiddenIds, cut]);
  const allPins = useMemo(() => [...pins, ...overview], [pins, overview]);

  // ---- selection: it never turns back what the student set in the Show menu (owner 2026-11-24: "Make sure when a
  // transparency is set... and you click on a structure... that transparency is maintained"). A deep structure may make
  // what hides it see-through (auto), only while it is selected; a locked view keeps the camera where it is.
  const lockedRef = useRef(locked);
  const layersRef = useRef(layers);
  useEffect(() => {
    lockedRef.current = locked;
    layersRef.current = layers;
  }, [locked, layers]);
  const selectNow = useCallback(
    (it: CatItem | null, opts: { frame?: boolean } = {}) => {
      setSel(it ? it.slug : null);
      if (!it) {
        setAuto({});
        return;
      }
      if (it.extra) trackAtlas({ type: "curious_unlock", mesh: it.slug, name: it.name });
      else trackAtlas({ type: "structure_viewed", slug: it.slug, via: stageRef.current === "mri" ? "mri" : "3d" });
      if (!index) return;
      const move = opts.frame !== false && !lockedRef.current;
      const user = layersRef.current;
      if (it.body && !it.ids.length) {
        // a structure of the body layer: its cut, view and framing as its spec says. The brain stays as the student has
        // it, unless the spec looks into the skull (the cranial floor from above: the brain off), wants it as a veil, or
        // shows some labels in the deep view
        const b = it.body;
        setAuto(
          b.brain === "hide" && b.cut
            ? allBrain("off")
            : b.brain === "veil"
              ? { ...allBrain("off"), cortex: "glass" }
              : b.brain === "deep"
                ? { cortex: "glass", cerebellum: "glass", deepgm: "off", deepwm: "off", brainstem: "glass", nerves: "off" }
                : {},
        );
        if (b.cut) {
          setCutAxis(b.cut.axis);
          setCutPos(b.cut.pos);
          setCutFlip(b.cut.flip);
        } else setCutAxis("off");
        setSides(b.sides ?? "both");
        if (move) {
          setView(b.view);
          setViewNonce((n) => n + 1);
          const fr = b.frame;
          if (fr) setFocus((o) => ({ ids: [], box: fr, nonce: (o?.nonce ?? 0) + 1 }));
        }
        return;
      }
      if (it.fibre && !it.ids.length) {
        // a tract drawn as fibres: inside the see-through brain, the ventricles solid (the camera follows the fibres in)
        setAuto({ cortex: "glass", deepgm: "off", deepwm: "off", cerebellum: "off", brainstem: "glass", nerves: "off" });
        setCutAxis("off");
        setSides("both");
        return;
      }
      if (it.vessels?.length && !it.ids.length) {
        // arteries and sinuses around the see-through brain: the base for the circle and the vertebrobasilar system,
        // the side for the middle cerebral artery and the sinuses, framed on the vessels
        setAuto({ ...allBrain("off"), cortex: "glass" });
        setCutAxis("off");
        setSides("both");
        if (!move) return;
        const v: View3 = it.vessels.some((k) => ["mca1", "mca2", "mca3", "mcap", "mcat", "peri", "sss", "iss", "strs", "trs", "sigs", "occs"].includes(k)) && !it.vessels.includes("acom") ? "left" : "inferior";
        setView(v);
        setViewNonce((n) => n + 1);
        loadVessels().then(({ meta }) => {
          const ks = new Set(it.vessels);
          const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
          for (const m of meta)
            if (ks.has(m.key))
              for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], m.box[0][k]);
                hi[k] = Math.max(hi[k], m.box[1][k]);
              }
          if (lo[0] < Infinity) setFocus((o) => ({ ids: [], box: [lo as [number, number, number], hi as [number, number, number]], nonce: (o?.nonce ?? 0) + 1 }));
        });
        return;
      }
      const pr = presentItem(it, index, byId);
      if (!it.ids.length) {
        // a sulcus or a functional area: painted on the outside surface, which must be solid to show it
        setAuto(user.cortex !== "solid" ? { cortex: "solid" } : {});
        setCutAxis("off");
        if (move) {
          setView(pr.view);
          setSides(pr.sides);
          setViewNonce((n) => n + 1);
        }
        return;
      }
      // through a cut the inside is open already: no auto layers (the cut face shows it, the part the cut removes is a
      // faint veil); else what hides a deep structure becomes see-through
      setAuto(cutAxis === "off" ? autoFor(it.ids, byId, user) : {});
      if (move) {
        // an outside structure from the view that shows it best (a nerve from below); a brainstem nucleus from behind;
        // any other deep structure from the student's current direction
        if (cutAxis === "off" && (!pr.deep || pr.stem)) {
          setView(pr.view);
          setSides(pr.sides);
          setViewNonce((n) => n + 1);
        }
        setFocus((f) => ({ ids: cutAxis === "off" ? pr.focusIds : it.ids, nonce: (f?.nonce ?? 0) + 1 }));
      }
    },
    [byId, cutAxis, index],
  );
  const clearSel = useCallback(() => {
    setSel(null);
    setAuto({});
  }, []);
  const { open: gateOpen, request: gateRequest, lock: lockGate } = gate;
  const select = useCallback(
    (it: CatItem | null, opts: { frame?: boolean } = {}) => {
      if (it?.extra && !gateOpen) {
        setPendingExtra({ it, frame: opts.frame !== false });
        gateRequest();
        return;
      }
      if (!it?.extra) lockGate();
      setPendingExtra(null);
      selectNow(it, opts);
    },
    [gateOpen, gateRequest, lockGate, selectNow],
  );
  useEffect(() => {
    if (!sel) lockGate();
  }, [sel, lockGate]);
  useEffect(() => {
    // the heads-up was confirmed (or was seen before): open the extra
    if (!gateOpen || !pendingExtra) return;
    const { it, frame } = pendingExtra;
    setPendingExtra(null);
    selectNow(it, { frame });
  }, [gateOpen, pendingExtra, selectNow]);
  useEffect(() => {
    // a deep link selects once the data is in: by slug, or by a course name (study cards link by name)
    if (!index || !items) return;
    let it = initialS ? bySlug.get(initialS) : undefined;
    if (!it && initialN) {
      const nn = norm(initialN);
      it = items.find((x) => !x.extra && (norm(x.name) === nn || x.syn.some((y) => norm(y) === nn))) ?? search(items, initialN)[0];
    }
    if (it) select(it, { frame: true });
  }, [index, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPick = useCallback(
    (l: Label3 | null) => {
      if (!l) return clearSel();
      const it = itemForLabel(l);
      if (it) select(it, { frame: false });
    },
    [itemForLabel, select, clearSel],
  );
  const showCut = (axis: "x" | "y" | "z") => {
    if (!item) return;
    // through the largest cross-section of the selected structure (the first leaf of the visible side)
    const l = item.ids.map((id) => byId.get(id)).find((x) => x?.cut && !hideSides.includes(x.side as "L" | "R"));
    if (!l?.cut) return;
    setAuto({});
    setCutAxis(axis);
    setCutPos(l.cut[axis]);
    // keep the half that looks at the camera: from the front (anterior) remove the front part, and so on
    setCutFlip(false);
    setView(axis === "z" ? "anterior" : axis === "x" ? (l.side === "R" ? "right" : "left") : "superior");
    setViewNonce((n) => n + 1);
  };

  // ---- the toolbar's actions (also on the keyboard)
  // a medial view shows one hemisphere; leaving it for another view brings the other one back
  const medialSides = useRef(false);
  const chooseView = useCallback((v: View3) => {
    if (v === "medial-left" || v === "medial-right") {
      setSides(v === "medial-left" ? "L" : "R");
      medialSides.current = true;
    } else if (medialSides.current) {
      setSides("both");
      medialSides.current = false;
    }
    setView(v);
    setViewNonce((n) => n + 1);
  }, []);
  const cutAxisRef = useRef(cutAxis);
  useEffect(() => {
    cutAxisRef.current = cutAxis;
  }, [cutAxis]);
  const chooseCut = useCallback((a: CutAxis) => {
    // a new plane starts at its default (the midline, the level of the commissures, the anterior commissure)
    if (a !== "off" && a !== cutAxisRef.current) setCutPos(a === "x" ? 0.0005 : a === "y" ? 0.012 : 0.0);
    // a cut opens the inside: what the selection had made see-through goes back to the student's layers
    if (a !== "off") setAuto({});
    setCutAxis(a);
  }, []);
  const toggleCut = useCallback((a: CutAxis) => chooseCut(cutAxisRef.current === a ? "off" : a), [chooseCut]);
  const setLayer = useCallback((g: LayerGroup, m: Mode) => {
    setLayers((l) => ({ ...l, [g]: m }));
    // the student decides this group now: the selection's auto layer for it goes
    setAuto((a) => {
      if (!(g in a)) return a;
      const n = { ...a };
      delete n[g];
      return n;
    });
  }, []);
  const applyPreset = useCallback((l: Layers) => {
    setLayers(l);
    setAuto({});
  }, []);
  const toggleLayer = useCallback((g: LayerGroup, on: Mode) => {
    setLayers((l) => ({ ...l, [g]: l[g] === "off" ? on : "off" }));
    setAuto((a) => {
      if (!(g in a)) return a;
      const n = { ...a };
      delete n[g];
      return n;
    });
  }, []);
  const itemRef = useRef(item);
  useEffect(() => {
    itemRef.current = item;
  }, [item]);
  const frame = useCallback(() => {
    const it = itemRef.current;
    if (!it || !it.ids.length) {
      setViewNonce((n) => n + 1);
      return;
    }
    setFocus((f) => ({ ids: it.ids, nonce: (f?.nonce ?? 0) + 1 }));
  }, []);
  // (read on the client only: the server renders without it, so hydration matches)
  const fsEnabled = useSyncExternalStore(
    () => () => {},
    () => !!document.fullscreenEnabled,
    () => false,
  );
  const canFull = fsEnabled && !embedded;
  const toggleFull = useCallback(() => {
    const el = stageEl.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  }, []);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const resetAll = useCallback(() => {
    setCutAxis("off");
    setSides("both");
    medialSides.current = false;
    setLayers(WHOLE);
    setAuto({});
    setView("left");
    setViewNonce((n) => n + 1);
  }, []);

  // ---- progress: views and cuts the student uses
  const firstTrack = useRef(true);
  useEffect(() => {
    if (firstTrack.current) return;
    trackAtlas({ type: "view_changed", view });
  }, [view, viewNonce]);
  useEffect(() => {
    if (firstTrack.current) return;
    if (cutAxis !== "off") trackAtlas({ type: "cut_used", plane: cutAxis === "z" ? "coronal" : cutAxis === "x" ? "sagittal" : "horizontal" });
  }, [cutAxis]);
  useEffect(() => {
    firstTrack.current = false;
  }, []);

  // ---- URL state
  useEffect(() => {
    if (embedded) return;
    const u = new URL(window.location.href);
    const set = (k: string, v: string | null) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set("s", sel);
    set("cam", view === "left" ? null : view);
    set("cut", cut ? `${cut.axis}:${cut.pos.toFixed(4)}${cut.flip ? ":f" : ""}` : null);
    set("side", sides === "both" ? null : sides);
    set("view", stage === "mri" ? sliceView : stage === "sections" ? "sections" : null);
    u.searchParams.delete("n");
    window.history.replaceState(null, "", u);
  }, [sel, view, cut?.axis, cut?.pos, cut?.flip, sides, stage, sliceView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (stageRef.current !== "3d") {
        if (e.key === "Escape") clearSel();
        return;
      }
      const k = e.key.toLowerCase();
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) chooseView(v.id);
      else if (e.key === "Escape") clearSel();
      else if (k === "c") toggleCut("z");
      else if (k === "s") toggleCut("x");
      else if (k === "h") toggleCut("y");
      // D: the solid brain or the deep structures (the skull and spine stay as they are)
      else if (k === "d") applyPreset({ ...(GROUPS_SAME(layersRef.current, DEEP) ? WHOLE : DEEP), bones: layersRef.current.bones });
      else if (k === "l") setLabels((x) => !x);
      else if (k === "k") toggleLayer("bones", "glass");
      else if (k === "e") toggleLayer("nerves", "solid");
      else if (k === "w") toggleLayer("brainstem", "solid");
      else if (k === "f") frame();
      else if (k === "z" && canFull) toggleFull();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chooseView, toggleCut, applyPreset, toggleLayer, frame, toggleFull, canFull, clearSel]);

  // ---- list
  const results = useMemo(() => (items ? search(items, q) : []), [items, q]);
  const tree = useMemo(() => {
    if (q.trim()) return null;
    const kids = new Map<string, CatItem[]>();
    const tops: CatItem[] = [];
    const inSet = new Set(results.map((r) => r.slug));
    for (const it of results) {
      if (it.parent && inSet.has(it.parent)) {
        const a = kids.get(it.parent) ?? [];
        a.push(it);
        kids.set(it.parent, a);
      } else tops.push(it);
    }
    const sections = SECTIONS.map((s) => ({ ...s, items: tops.filter((t) => sectionOf(t) === s.id).sort((a, b) => Number(!!a.extra) - Number(!!b.extra) || a.name.localeCompare(b.name)) })).filter((s) => s.items.length);
    return { sections, kids };
  }, [results, q]);
  // open the ancestors of the selection so its row is visible
  useEffect(() => {
    if (!sel || !items) return;
    const anc: string[] = [];
    let p = bySlug.get(sel)?.parent ?? null;
    while (p) {
      anc.push(p);
      p = bySlug.get(p)?.parent ?? null;
    }
    if (anc.length) setOpen((o) => new Set([...o, ...anc]));
    window.setTimeout(() => listRef.current?.querySelector(`[data-slug="${CSS.escape(sel)}"]`)?.scrollIntoView({ block: "nearest" }), 50);
  }, [sel, items, bySlug]);

  const Row = ({ it, depth }: { it: CatItem; depth: number }) => {
    const ks = tree?.kids.get(it.slug) ?? [];
    const isOpen = open.has(it.slug);
    return (
      <>
        <button
          type="button"
          data-slug={it.slug}
          className={`atl3-row ${depth ? "atl3-kid" : ""}`}
          style={depth > 1 ? { paddingLeft: 8 + depth * 14 } : undefined}
          aria-current={sel === it.slug ? "true" : undefined}
          onClick={() => select(sel === it.slug ? null : it)}
        >
          <span
            className="atl3-twisty"
            onClick={(e) => {
              if (!ks.length) return;
              e.stopPropagation();
              setOpen((o) => {
                const n = new Set(o);
                if (n.has(it.slug)) n.delete(it.slug);
                else n.add(it.slug);
                return n;
              });
            }}
          >
            {ks.length ? <ChevronRight size={13} style={{ transform: isOpen ? "rotate(90deg)" : undefined, transition: "transform 120ms" }} /> : null}
          </span>
          <span>{it.name}</span>
          {it.extra && <span className="atl3-extra">atlas</span>}
        </button>
        {isOpen && ks.sort((a, b) => a.name.localeCompare(b.name)).map((k) => <Row key={k.slug} it={k} depth={depth + 1} />)}
      </>
    );
  };

  const loadingShell = !index || !prog.shell || prog.shell.loaded < prog.shell.total;
  const onProgress = useCallback((p: Prog, what: "shell" | "inner") => setProg((o) => ({ ...o, [what]: p })), []);
  const onReady = useCallback((ix: Index3) => setIndex(ix), []);
  const canvasProps: Atlas3Props = {
    view,
    viewNonce,
    // with the skull and spine on, the standard views stand back enough to show the skull around the brain
    zoom: bonesOn && !bodySpec ? 1.3 : 1,
    cut,
    hideSides,
    hiddenIds,
    ghostIds,
    ghostCls: sets?.ghostCls,
    ghost: sets?.hull ?? false,
    selected: selIds,
    // a selection among see-through parts: the other solid structures greyed, so it stands out
    dimOthers: selIds.length > 0 && BRAIN_GROUPS.some((g) => eff[g] !== "solid"),
    look,
    focus,
    fibres: fibreLines,
    vessels: bodySpec?.vessels ?? vesselKeys,
    body: bodyLayer,
    skin: bodySpec?.skin ?? null,
    // the structure card covers the right of the stage on a wide screen
    insetRight: item && stage === "3d" && wide ? 384 : 0,
    pins: allPins,
    sulcus: item?.sulcus,
    areaMask: item?.area !== undefined ? 1 << item.area : 0,
    onPick,
    onReady,
    onProgress,
  };
  const sideNote = item && index ? sideText(item, byId, index) : "";
  const provenance = item
    ? bodySpec
      ? bodySpec.approx
        ? `Approximate: ${bodySpec.src ?? "drawn from landmarks"}. Placed around this brain to show where it lies; its exact shape is not modelled.`
        : "From Z-Anatomy (CC BY-SA 4.0), warped onto this brain: its position is approximate (a few millimetres)."
      : item.vessels?.length && !item.ids.length
      ? "Vessels from Z-Anatomy, warped onto this brain and shown around its see-through outline: their course is approximate (a few millimetres)."
      : item.fibre && !item.ids.length
        ? fibres?.slug === item.slug
          ? fibreNote(fibres.f)
          : ""
        : provenanceText(item, byId)
    : "";

  return (
    <div className="atl3-shell" style={embedded ? { height: height ?? 560, minHeight: 0 } : { height: "calc(100dvh - 150px)", minHeight: 560 }}>
      <aside className="atl3-panel" aria-label="Structures">
        <div className="atl3-search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search structures" aria-label="Search structures" />
        </div>
        <div className="atl3-list" ref={listRef}>
          {!items && <p className="px-2 py-3 text-sm text-text-faint">Loading the structure list…</p>}
          {tree
            ? tree.sections.map((s) => (
                <div key={s.id}>
                  <div className="atl3-sec">{s.title}</div>
                  {s.items.map((it) => (
                    <Row key={it.slug} it={it} depth={0} />
                  ))}
                </div>
              ))
            : results.map((it) => <Row key={it.slug} it={it} depth={0} />)}
          {items && q.trim() && !results.length && <p className="px-2 py-3 text-sm text-text-faint">No structure matches “{q}”.</p>}
        </div>
      </aside>

      <section ref={stageEl} className="atl3-stage" aria-label={stage === "3d" ? "3D brain" : stage === "mri" ? "MRI atlas" : "Course sections"}>
        <div className={stage === "3d" ? "absolute inset-0" : "pointer-events-none invisible absolute inset-0"} aria-hidden={stage !== "3d"}>
          <Atlas3Canvas {...canvasProps} />
        </div>
        {seenStage.has("mri") && (
          <div className={stage === "mri" ? "atl3-alt" : "atl3-alt pointer-events-none invisible"} aria-hidden={stage !== "mri"}>
            {atlas2 ? (
              <SliceViewer
                atlas={atlas2}
                primary={item && atlas2.structures[item.slug] ? item.slug : null}
                primaryColor="#ffc14d"
                overlays={[]}
                view={sliceView}
                jumpTo={item && atlas2.structures[item.slug] ? item.slug : null}
                onPick={(slug) => {
                  const it = bySlug.get(slug);
                  if (it) select(it, { frame: false });
                }}
                height="100%"
                onViewChange={setSliceView}
                shortcuts
                notice={item && !atlas2.structures[item.slug] ? `${item.name} has no MRI label: see it in 3D` : null}
              />
            ) : (
              <AtlasLoader label="Loading the MRI atlas" progress={0.1} stages={[{ id: "mri", label: "MRI and labels", state: "active" }]} />
            )}
          </div>
        )}
        {seenStage.has("sections") && courseSlug && (
          <div className={stage === "sections" ? "atl3-alt overflow-auto" : "atl3-alt pointer-events-none invisible"} aria-hidden={stage !== "sections"}>
            <SectionEmbed courseSlug={courseSlug} slug={item?.slug ?? null} level={secLevel} onLevel={setSecLevel} />
          </div>
        )}
        <div className="atl3-modes">
          <Segmented<Stage>
            label="What to show"
            value={stage}
            onChange={showStage}
            items={[
              { id: "3d", label: "3D brain", text: "3D" },
              { id: "mri", label: "MRI atlas (slices)", text: "MRI" },
              ...(courseSlug ? [{ id: "sections" as Stage, label: "The course's brainstem sections", text: "Sections" }] : []),
            ]}
          />
        </div>
        {stage === "3d" && loadingShell && (
          <div className="atl3-loading">
            <AtlasLoader
              label="Loading the 3D atlas"
              progress={prog.shell ? prog.shell.loaded / Math.max(1, prog.shell.total) : 0.05}
              stages={[
                { id: "index", label: "Structure table", state: index ? "done" : "active" },
                { id: "shell", label: "Brain surface", state: !prog.shell ? "todo" : prog.shell.loaded >= prog.shell.total ? "done" : "active" },
              ]}
            />
          </div>
        )}
        {cutAxis !== "off" && prog.inner && prog.inner.loaded < prog.inner.total && <div className="atl3-hint atl-chip">Loading the inside of the brain… {Math.round((100 * prog.inner.loaded) / Math.max(1, prog.inner.total))}%</div>}

        {pendingExtra && gate.asking && (
          <div className="atl3-card atl-card-in" role="region" aria-label={pendingExtra.it.name}>
            <SupplementaryHeadsUp
              what={pendingExtra.it.name}
              onConfirm={gate.confirm}
              onCancel={() => {
                gate.cancel();
                setPendingExtra(null);
              }}
            />
          </div>
        )}
        {item && !(pendingExtra && gate.asking) && (
          <div className="atl3-card atl-card-in" role="region" aria-label={item.name}>
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <h2>{item.name}</h2>
                <div className="atl3-sub">
                  {sideNote}
                  {item.extra ? " · atlas structure (supplementary)" : ""}
                  {selDeep && cutAxis === "off" && Object.keys(auto).length ? " · seen through what hides it" : ""}
                </div>
                {provenance && <div className="atl3-prov">{provenance}</div>}
                {!hasGeometry(item) && (
                  <div className="atl3-prov">
                    Not in the new 3D model yet.{" "}
                    <a className="text-accent-2 underline-offset-2 hover:underline" href={`/atlas/classic?s=${encodeURIComponent(item.slug)}`}>
                      Open it in the classic atlas
                    </a>
                  </div>
                )}
              </div>
              <button type="button" className="atl-xbtn" aria-label="Clear the selection (Esc)" onClick={clearSel}>
                <X size={14} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5" hidden={!item.ids.length}>
              <button type="button" className="atl-cutbtn" onClick={() => showCut("z")}>
                Coronal cut through it
              </button>
              <button type="button" className="atl-cutbtn" onClick={() => showCut("x")}>
                Sagittal
              </button>
              <button type="button" className="atl-cutbtn" onClick={() => showCut("y")}>
                Horizontal
              </button>
            </div>
            {!item.extra && (
              <div className="mt-3 border-t border-panel-border pt-3">
                <StructureInfo slug={item.slug} name={item.name} />
              </div>
            )}
          </div>
        )}

        {stage === "3d" && (
          <ExploreBar
            view={view}
            onView={chooseView}
            onFrame={frame}
            locked={locked}
            onLock={() => setLocked((l) => !l)}
            cutAxis={cutAxis}
            onCut={chooseCut}
            cutPos={cutPosEff}
            cutRange={cutRange}
            onCutPos={setCutPos}
            onFlip={() => setCutFlip((f) => !f)}
            cutNote={cutWords(cutAxis, cutPosEff)}
            look={look}
            onLook={setLook}
            layers={eff}
            auto={auto}
            onLayer={setLayer}
            onPreset={applyPreset}
            sides={sides}
            onSides={(x) => {
              setSides(x);
              medialSides.current = false;
            }}
            labels={labels}
            onLabels={() => setLabels((x) => !x)}
            full={full}
            canFull={canFull}
            onFull={toggleFull}
            onReset={resetAll}
          />
        )}
      </section>
    </div>
  );
}

/** Where the shape comes from, when it is not a source atlas's own label: students should know what is exact. */
const PROVENANCE: Record<string, string> = {
  plate: "Drawn from the course's brainstem plates (Lab 8) and fitted into this brainstem: position within about 2 mm.",
  zanat: "Course of the nerve from Z-Anatomy, warped onto this brain and shown from the brainstem to about its foramen: approximate.",
  "ahra+zanat": "Lobe borders (the primary and posterolateral fissures) from Z-Anatomy's lobules, warped onto this brain: approximate.",
  template: "Segmented on the MNI template's own image.",
  derived: "Derived from the structures around it: approximate.",
};
function fibreNote(f: Fibres): string {
  return f.src === "hcp"
    ? "Fibres from population tractography in this same space (HCP-842, Yeh et al. 2018): a sample of its streamlines."
    : "The tract's course as the Pathway tracer draws it, warped onto this brain: one line per side, approximate.";
}
function provenanceText(it: CatItem, byId: Map<number, Label3>): string {
  const ls = it.ids.map((id) => byId.get(id)).filter((l): l is Label3 => !!l);
  // a big union (a lobe, the telencephalon) is mostly exact: a note about one small derived part of it would mislead
  if (ls.length > 6 && ls.filter((l) => l.quality !== "exact").length < ls.length / 2) return "";
  const srcs = new Set(ls.filter((l) => l.quality !== "exact").map((l) => l.src));
  // one note, for the least exact source the selection uses
  for (const s of ["zanat", "ahra+zanat", "plate", "derived", "template"]) if (srcs.has(s)) return PROVENANCE[s];
  return "";
}

function sideText(it: CatItem, byId: Map<number, Label3>, index: Index3): string {
  if (!hasGeometry(it)) return "";
  if (it.body && !it.ids.length) return "";
  if (it.fibre && !it.ids.length) return "Left and right";
  if (it.vessels?.length && !it.ids.length) return it.vessels.every((k) => ["acom", "ba", "sss", "iss", "strs", "occs"].includes(k)) ? "Midline" : "Left and right";
  if (!it.ids.length && it.area !== undefined) return index.areas.find((a) => a.bit === it.area)?.side === "L" ? "Left hemisphere (the language-dominant side in most people)" : "Both hemispheres";
  if (!it.ids.length && it.sulcus !== undefined) return it.sulcus === 14 ? "Between the hemispheres" : "Both hemispheres";
  const ls = it.ids.map((id) => byId.get(id)).filter((l): l is Label3 => !!l);
  const sides = new Set(ls.map((l) => l.side));
  // the brainstem and the cerebellar nuclei have sides, not hemispheres
  const half = ls.every((l) => STEM.has(l.key) || ["DN", "IPN", "FN"].includes(l.key)) ? "side" : "hemisphere";
  if (sides.has("L") && sides.has("R")) return half === "side" ? "Paired: left and right" : "Both hemispheres";
  if (sides.has("L")) return `Left ${half}`;
  if (sides.has("R")) return `Right ${half}`;
  return "Midline";
}

export default Explore3;
