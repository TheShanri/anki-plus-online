"use client";

import { withCranialNumeral } from "@/lib/atlas/cranial";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Lock, PanelLeft, PanelRight } from "lucide-react";
import { SectionEmbed, inSections, levelsShowing, nearestLevel } from "./brainstem/SectionEmbed";
import { AvailIcons, availabilityFor, slugOf } from "./ui/availability";
import { loadAtlasIndex, normalizeQuery } from "@/lib/atlas";
import type { AtlasEntry, AtlasIndex } from "@/lib/atlas";
import { atlasTargetForCourseName } from "@/lib/atlas/map";
import { LINKS, SKULL, SKULL_REGIONS, atlasTargetForSlug, buildCatalog } from "@/lib/atlas/catalog";
import type { CatalogItem } from "@/lib/atlas/catalog";
import { ATLAS2_BASE, loadAtlas2 } from "@/lib/atlas/slices";
import type { Atlas2 } from "@/lib/atlas/slices";
import { accentHex, overlayPalette } from "@/lib/atlas/palette";
import { trackAtlas } from "@/lib/atlas/progress";
import extraInfo from "@/data/atlas-extra-info.json";
import { SupplementaryHeadsUp, useSupplementaryGate } from "@/components/supplementary/Supplementary";
import { StructureInfo } from "./StructureInfo";
import { BrainstemRefDock } from "./brainstem/BrainstemRefDock";
import type { SliceOverlay, SliceView } from "./SliceViewer";
import type { ViewName } from "./AtlasViewer";
import { AtlasLoader } from "./ui/AtlasLoader";
import { IconBtn, Segmented } from "./ui/Toolbar";
import { AddStructure, ExtraInfoCard, LandmarkCard, Legend, LockedCard } from "./ui/Overlays";
import type { LegendRow } from "./ui/Overlays";
import { preloadAtlas } from "./ui/modelCache";
import { mmFromWorld, mniFromCut, sliceViewFor, view3dFor } from "./ui/translate";
import type { CamState } from "./ui/translate";

const Loading = ({ what }: { what: string }) => (
  <div className="relative h-full min-h-[240px]">
    <AtlasLoader label={`Loading the ${what}`} progress={0.04} stages={[{ id: "code", label: `Starting the ${what}`, state: "active" }]} />
  </div>
);
const AtlasViewer = dynamic(() => import("./AtlasViewer"), { ssr: false, loading: () => <Loading what="3D viewer" /> });
const SliceViewer = dynamic(() => import("./SliceViewer"), { ssr: false, loading: () => <Loading what="MRI viewer" /> });
const BrainstemFocus = dynamic(() => import("./brainstem/three/BrainstemFocus"), { ssr: false, loading: () => <Loading what="3D brainstem" /> });

type Tab = "model" | "slices" | "sections" | "brainstem";
const VIEW_PARAM: Record<string, SliceView> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", transverse: "axial", multi: "multi", multiplanar: "multi", render: "render" };
const VIEW_NAME: Record<SliceView, string> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", multi: "multi", render: "render" };

type Props = {
  initialS?: string;
  initialN?: string;
  initialView?: string;
  initialAdd?: string;
  initialNb?: string;
  /** Deep link: the cut ("z:0.420" or "z:0.420:f") and the camera view. */
  initialCut?: string;
  initialCam?: string;
  /** Inside another page (the study overlay): leaves the URL alone. */
  embedded?: boolean;
  /** The course slug, for the Sections view's slide images (hidden when absent). */
  courseSlug?: string;
  /** Viewer and list height in px (default: fills the viewport on the atlas page, 560 when embedded). */
  height?: number;
};

const QUALITY_TEXT: Record<string, string> = {
  exact: "Exact in MRI slices",
  derived: "Derived in MRI slices",
  regional: "Region only in MRI slices",
};

type Side = "L" | "R";
type Nb = { key: string; name: string; ids: string[]; side?: Side };
type EntryNb = AtlasEntry & { nbs?: Partial<Record<"L" | "R" | "M", string[]>> };
const EXTRA = extraInfo as Record<string, string>;

/** Every mesh that belongs to a curriculum structure. The others are "not on your syllabus" and show locked. */
const SYLLABUS: ReadonlySet<string> = (() => {
  const s = new Set<string>();
  for (const l of Object.values(LINKS)) {
    for (const id of l.meshIds) s.add(id);
    if (l.fallbackParentId) s.add(l.fallbackParentId);
  }
  return s;
})();

/** skull.glb / spine-atlas.glb node-name prefixes -> course structure (longest prefix first), and display names. */
const SKULL_NODES: { prefix: string; slug: string }[] = [
  ...Object.entries(SKULL).flatMap(([slug, e]) => (e.nodes ?? []).filter((n) => n !== "falx-cerebri" && n !== "tentorium-cerebelli" && n !== "spinal-dura").map((prefix) => ({ prefix, slug }))),
  { prefix: "falx-cerebri", slug: "falx-cerebri" },
  { prefix: "tentorium-cerebelli", slug: "tentorium-cerebelli" },
  { prefix: "spinal-dura", slug: "dural-sac" },
].sort((a, b) => b.prefix.length - a.prefix.length);
const SKULL_NAMES: Record<string, string> = Object.fromEntries(Object.keys(LINKS).filter((k) => LINKS[k].skull || k === "falx-cerebri" || k === "tentorium-cerebelli").map((k) => [k, LINKS[k].name]));
/** Short background for skull bones that are not course structures (shown after "Oh, I'm just curious"). */
const NODE_BLURBS: Record<string, string> = {
  maxilla: "The upper jaw bone. It holds the upper teeth, forms most of the hard palate and floor of the orbit, and contains the maxillary sinus.",
  "zygomatic-bone": "The cheekbone. It forms the prominence of the cheek and part of the orbit, and joins the temporal bone to make the zygomatic arch.",
  "nasal-bone": "A small paired bone that forms the bridge of the nose. It is the most commonly fractured facial bone.",
  "lacrimal-bone": "A thin, fragile bone on the inner wall of the orbit. It carries the groove for the tear sac and duct.",
  "palatine-bone": "An L-shaped bone behind the maxilla. It forms the back of the hard palate and part of the nasal cavity and orbit.",
  vomer: "A thin unpaired bone that forms the lower back part of the nasal septum.",
  "inferior-nasal-concha": "A curled bone on the side wall of the nasal cavity that warms and humidifies inhaled air.",
  mandible: "The lower jaw, the only skull bone that moves. It articulates with the temporal bones at the temporomandibular joints.",
  "suture-squamous": "The squamous suture joins the temporal bone to the parietal bone on the side of the skull.",
  "spinal-ganglion": "A dorsal root ganglion: the cluster of sensory neuron cell bodies on each dorsal root, just outside the spinal cord.",
};
const nodeTitle = (n: string) => n.replace(/[-_]l$/, " (L)").replace(/[-_]r$/, " (R)").replace(/[-_]/g, " ").replace(/^./, (c) => c.toUpperCase());
const nodeBlurb = (n: string) => Object.entries(NODE_BLURBS).find(([k]) => n.startsWith(k))?.[1] ?? "Part of the skull and spine model. It is not one of the structures on your course lists.";

export function AtlasBrowser({ initialS, initialN, initialView, initialAdd, initialNb, initialCut, initialCam, embedded = false, courseSlug, height }: Props) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [atlas2, setAtlas2] = useState<Atlas2 | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  /** Search-list parents opened to show their parts (fornix -> crus, body, columns). */
  const [openKids, setOpenKids] = useState<Set<string>>(() => new Set());
  /** The list row under the pointer (or keyboard focus): previewed in 3D, through the brain. A short delay, so sweeping
   *  the pointer down the list does not load every structure it crosses. */
  const [preview, setPreview] = useState<CatalogItem | null>(null);
  const previewTimer = useRef<number | undefined>(undefined);
  const previewSoon = useCallback((it: CatalogItem | null) => {
    window.clearTimeout(previewTimer.current);
    if (!it) return setPreview(null);
    previewTimer.current = window.setTimeout(() => setPreview(it), 160);
  }, []);
  const [primaryKey, setPrimaryKey] = useState<string | null>(initialS ?? null);
  const [courseName, setCourseName] = useState<string | undefined>(initialN);
  const [extraKeys, setExtraKeys] = useState<string[]>(() => (initialAdd ? initialAdd.split(",").filter(Boolean) : []));
  const [neighbors, setNeighbors] = useState(initialNb === "1");
  const [nbSide, setNbSide] = useState<Side>("L");
  const [tab, setTabRaw] = useState<Tab>(initialView === "brainstem" ? "brainstem" : initialView && VIEW_PARAM[initialView] ? "slices" : "model");
  // both viewers stay mounted once opened, so flipping back restores the 3D camera and look
  const [seen, setSeen] = useState({ model: !(initialView && VIEW_PARAM[initialView]), slices: !!(initialView && VIEW_PARAM[initialView]), sections: false, brainstem: initialView === "brainstem" });
  const [secLevel, setSecLevel] = useState<string | null>(null);
  const [atMm, setAtMm] = useState<number[] | null>(null);
  const [request, setRequest] = useState<{ n: number; view?: ViewName; multi?: boolean } | null>(null);
  const [modalityNote, setModalityNote] = useState<string | null>(null);
  const cam3d = useRef<CamState>({ view: "left", multi: false, cut: null });
  // where the 3D view opens: a deep link's cut and camera, else (a bare /atlas) the view this browser left last time
  const [startCam, setStartCam] = useState(() => parseCam(initialCut, initialCam));
  const bare = !initialS && !initialView && !initialAdd && !initialCut && !initialCam;
  useEffect(() => {
    if (embedded || !bare) return;
    const r = readRemembered();
    if (!r) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (r.s) setPrimaryKey((k) => k ?? r.s!);
    setStartCam(parseCam(r.cut, r.cam));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const sliceAtSwitch = useRef<SliceView | null>(null);
  const noteT = useRef(0);
  const note = useCallback((m: string) => {
    setModalityNote(m);
    window.clearTimeout(noteT.current);
    noteT.current = window.setTimeout(() => setModalityNote(null), 5000);
  }, []);
  const [sliceView, setSliceView] = useState<SliceView>((initialView && VIEW_PARAM[initialView]) || "coronal");
  const [addQ, setAddQ] = useState("");
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const [pal, setPal] = useState<{ accent: string; colors: string[] }>({ accent: "#ff2a6d", colors: ["#22d3ee", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#fb923c", "#2dd4bf"] });
  const [listOpen, setListOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(true);
  // screen-size defaults, after hydration (the server cannot know the width)
  useEffect(() => {
    const t = window.setTimeout(() => {
      setListOpen(!embedded && window.innerWidth >= 1536);
      setInfoOpen(window.innerWidth >= 1024);
    }, 0);
    return () => window.clearTimeout(t);
  }, [embedded]);

  // non-syllabus regions: greyed and locked until the student chooses to peek (one heads-up per section, then direct)
  const gate = useSupplementaryGate("atlas-3d");
  const [lockedPick, setLockedPick] = useState<{ id: string; name: string } | null>(null);
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [curiousNode, setCuriousNode] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    let alive = true;
    loadAtlasIndex()
      .then((i) => alive && setIndex(i))
      .catch(() => alive && setError(true));
    loadAtlas2()
      .then((a) => alive && setAtlas2(a))
      .catch(() => undefined);
    preloadAtlas();
    return () => {
      alive = false;
    };
  }, []);

  // Warm the MRI volumes (~4 MB) while the page is idle so the "MRI slices" tab opens without a wait.
  useEffect(() => {
    if (!atlas2) return;
    if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return;
    const go = () => {
      for (const f of ["template.nii.gz", "labels.nii.gz", "tracts.nii.gz"]) fetch(`${ATLAS2_BASE}/${f}`).then((r) => r.arrayBuffer()).catch(() => undefined);
    };
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) {
      const id = w.requestIdleCallback(go, { timeout: 5000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(go, 3000);
    return () => window.clearTimeout(t);
  }, [atlas2]);

  // theme colours (accent + categorical overlay colours); refresh on theme / light-dark switches
  useEffect(() => {
    const read = () => setPal({ accent: accentHex(), colors: overlayPalette() });
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-mode", "class"] });
    return () => mo.disconnect();
  }, []);

  const items = useMemo(() => (index ? buildCatalog(index) : []), [index]);
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  /** Resolves ?s= (mesh id, curriculum slug) and ?n= (course name) to a catalogue item. */
  const primary: CatalogItem | null = useMemo(() => {
    if (!items.length) return null;
    if (courseName) {
      const t = atlasTargetForCourseName(courseName);
      if (t?.slug) {
        const it = items.find((i) => i.slug === t.slug && !i.group);
        if (it) return { ...it, name: withCranialNumeral(courseName) };
      }
      if (t && t.ids.length) {
        return { key: t.ids[0], name: withCranialNumeral(courseName), region: "other", meshIds: t.ids, approximate: t.approximate, slug: t.slug ?? null, slices: t.slices ?? null, hay: "", group: false };
      }
    }
    if (!primaryKey) return null;
    // A curriculum slug wins: all of its meshes (inferior frontal gyrus = three parts) and its own MRI label
    // (corpus striatum), even when a Z-Anatomy mesh or group has the same id.
    const l = LINKS[primaryKey];
    const t = l ? atlasTargetForSlug(primaryKey) : null;
    if (l && t) {
      const row = byKey.get(primaryKey);
      const key = row && !row.group && t.ids.length === 1 && t.ids[0] === primaryKey ? primaryKey : `slug:${primaryKey}`;
      return { key, name: l.name, region: row?.region ?? "other", meshIds: t.ids, approximate: t.approximate, slug: t.slices ? primaryKey : null, slices: t.slices, hay: "", group: false };
    }
    return byKey.get(primaryKey) ?? byKey.get(`slug:${primaryKey}`) ?? null;
  }, [items, byKey, primaryKey, courseName]);

  // The curriculum structure behind the selection, for the course-notes panel (any structure on the course
  // lists, with or without an MRI label; a mesh picked in 3D maps to the structure that uses exactly it).
  const infoSlug = useMemo(() => {
    if (!primary) return null;
    const k = primary.key.replace(/^slug:/, "");
    if (LINKS[k]) return k;
    if (primary.slug && LINKS[primary.slug]) return primary.slug;
    const hit = Object.entries(LINKS).find(([, l]) => !l.approximate && l.meshIds.length === 1 && l.meshIds[0] === primary.key);
    return hit ? hit[0] : null;
  }, [primary]);

  const extraCard = !!(unlocked && primary?.key === unlocked);
  // skull, spine and meninges structures show in the skull layer (the layer turns itself on for them and off for brain structures)
  const skullEntry = useMemo(() => (infoSlug && LINKS[infoSlug]?.skull && SKULL[infoSlug] ? { ...SKULL[infoSlug], slug: infoSlug } : null), [infoSlug]);
  useEffect(() => {
    if (!skullEntry?.shells) return;
    const t = window.setTimeout(() => setRequest((r) => ({ n: (r?.n ?? 0) + 1, view: "midsagittal", multi: false })), 0);
    return () => window.clearTimeout(t);
  }, [skullEntry]);

  // progress: a curriculum structure was opened (3D or MRI)
  const via: "3d" | "mri" | "brainstem" = tab === "model" ? "3d" : tab === "slices" ? "mri" : "brainstem";
  const lastViewed = useRef("");
  useEffect(() => {
    if (!infoSlug || LINKS[infoSlug]?.atlasOnly) return; // progress counts course structures only
    const k = `${infoSlug}|${via}`;
    if (lastViewed.current === k) return;
    lastViewed.current = k;
    trackAtlas({ type: "structure_viewed", slug: infoSlug, via });
  }, [infoSlug, via]);

  // Open each structure where it is shown most exactly: MRI slices when the 3D highlight is only approximate,
  // the 3D model when the MRI atlas has no label. A view the student picks stays otherwise.
  // The current modality stays unless the new structure has nothing to show in it (then say why).
  const tabFor = (it: CatalogItem, cur: Tab): { tab: Tab; why?: string } => {
    // Existence wins over any remembered, linked or translated tab: a structure never opens in a view where it does not exist.
    const skullIt = !!LINKS[slugOf(it) ?? ""]?.skull;
    const has3d = it.meshIds.length > 0 || skullIt;
    const hasMri = !!it.slug && !!it.slices;
    if (cur === "model" && !has3d && hasMri) return { tab: "slices", why: "Not in the 3D model, showing MRI" };
    if (cur === "slices" && !hasMri && has3d) return { tab: "model", why: "Not in the MRI atlas, showing 3D" };
    if (cur === "sections" && !inSections(slugOf(it))) return { tab: has3d ? "model" : "slices", why: "Not on the course sections, showing " + (has3d ? "3D" : "MRI") };
    return { tab: cur };
  };
  const resolvedOnce = useRef(false);
  useEffect(() => {
    if (!primary || resolvedOnce.current) return;
    resolvedOnce.current = true;
    const t = window.setTimeout(() => {
      const r = tabFor(primary, tab);
      if (r.tab !== tab) changeTab(r.tab);
      if (r.why) note(r.why);
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary]);

  const extras = useMemo(() => extraKeys.map((k) => byKey.get(k) ?? byKey.get(`slug:${k}`) ?? items.find((i) => i.slug === k)).filter((x): x is CatalogItem => !!x), [extraKeys, byKey, items]);

  // 3D neighbours, per hemisphere (computed from mesh geometry in tools/atlas/neighbors3d.py)
  const nb3d = useMemo<Nb[]>(() => {
    if (!neighbors || !primary || !index) return [];
    const out: Nb[] = [];
    const seen = new Set<string>([...primary.meshIds, ...extras.flatMap((e) => e.meshIds)]);
    const take = (raw: string) => {
      const [id, sd] = raw.split(":");
      if (sd && sd !== nbSide) return; // the other hemisphere
      const e = index.structures[id];
      if (!e || seen.has(id)) return;
      seen.add(id);
      out.push({ key: sd ? `${id}:${sd}` : id, name: e.name + (sd ? ` (${sd})` : ""), ids: [id], side: sd as Side | undefined });
    };
    for (const id of primary.meshIds) {
      const e = index.structures[id] as EntryNb | undefined;
      if (!e) continue;
      if (e.nbs) {
        for (const l of [e.nbs[nbSide], e.nbs.M]) l?.forEach(take);
        if (!e.nbs[nbSide] && !e.nbs.M) (e.nbs.L ?? e.nbs.R ?? []).forEach((r) => take(r.split(":")[0]));
      } else e.neighbors?.forEach(take);
    }
    return out.slice(0, 6);
  }, [neighbors, primary, extras, index, nbSide]);
  const nbSlices = useMemo(() => {
    if (!neighbors || !primary?.slug || !atlas2) return [] as { key: string; name: string }[];
    const taken = new Set<string>([primary.slug, ...extras.map((e) => e.slug ?? "")]);
    return (atlas2.structures[primary.slug]?.neighbors ?? [])
      .filter((s) => !taken.has(s))
      .slice(0, 6)
      .map((s) => ({ key: s, name: atlas2.structures[s].name }));
  }, [neighbors, primary, extras, atlas2]);

  const extraColor = (i: number) => pal.colors[i % pal.colors.length];
  const overlays3d = useMemo(
    () => [
      // the list row under the pointer, drawn through the brain (owner 2026-11-22: many listed structures could not be
      // lit by hovering, the deep ones, the sulci, the tracts, are hidden inside or under the cortex)
      ...(preview && preview.key !== primary?.key && preview.meshIds.length ? [{ key: "preview", ids: preview.meshIds, color: pal.accent, opacity: 0.8, ghost: true }] : []),
      ...extras.map((e, i) => ({ key: e.key, ids: e.meshIds, color: extraColor(i), opacity: 1 })),
      ...nb3d.map((n, i) => ({ key: "nb:" + n.key, ids: n.ids, color: extraColor(extras.length + i), opacity: 1, side: n.side })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extras, nb3d, pal.colors, preview, primary?.key, pal.accent],
  );
  const overlaysSlices: SliceOverlay[] = useMemo(
    () => [
      ...extras.filter((e) => e.slug).map((e, i) => ({ slug: e.slug as string, color: extraColor(i) })),
      ...nbSlices.map((n, i) => ({ slug: n.key, color: extraColor(extras.length + i) })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extras, nbSlices, pal.colors],
  );
  const legendRows: LegendRow[] = [
    ...(primary ? [{ key: "primary", name: primary.name, color: pal.accent, kind: "primary" as const }] : []),
    ...(tab === "model"
      ? [
          ...extras.map((e, i) => ({ key: e.key, name: e.name, color: extraColor(i), kind: "added" as const, removable: true })),
          ...nb3d.map((n, i) => ({ key: "nb:" + n.key, name: n.name, color: extraColor(extras.length + i), kind: "neighbour" as const })),
        ]
      : [
          ...extras.filter((e) => e.slug).map((e, i) => ({ key: e.key, name: e.name, color: extraColor(i), kind: "added" as const, removable: true })),
          ...nbSlices.map((n, i) => ({ key: "nb:" + n.key, name: n.name, color: extraColor(extras.length + i), kind: "neighbour" as const })),
        ]),
  ];

  // URL deep link: /atlas?s=<id or slug>&view=coronal&add=a,b&nb=1
  useEffect(() => {
    if (embedded) return;
    try {
      const p = new URLSearchParams();
      if (primary) p.set("s", primary.slug && tab === "slices" ? primary.slug : primary.key.replace(/^slug:/, ""));
      else if (lockedPick && !lockedPick.id.startsWith("skull:")) p.set("s", lockedPick.id);
      if (tab === "slices") p.set("view", VIEW_NAME[sliceView]);
      else if (tab === "brainstem") p.set("view", "brainstem");
      if (extraKeys.length) p.set("add", extraKeys.join(","));
      if (neighbors) p.set("nb", "1");
      if (tab === "model") camParams(p, cam3d.current);
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `/atlas?${qs}` : "/atlas");
      if (tab === "model") rememberView({ s: p.get("s") ?? undefined, cut: p.get("cut") ?? undefined, cam: p.get("cam") ?? undefined });
    } catch {
      /* ignore */
    }
  }, [embedded, primary, lockedPick, tab, sliceView, extraKeys, neighbors]);

  // Browsing (no query): a part is listed under its whole (open the whole to see its parts). Searching: every match is
  // listed, a whole still opens to its parts.
  const asChild = useMemo(() => new Set(items.flatMap((i) => i.children ?? [])), [items]);
  const results = useMemo(() => {
    const terms = normalizeQuery(q).split(" ").filter(Boolean);
    return items
      .filter((r) => (region === "all" || r.region === region) && terms.every((t) => r.hay.includes(t)) && (terms.length > 0 || region !== "all" || !asChild.has(r.key)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 120);
  }, [items, q, region, asChild]);
  const addResults = useMemo(() => {
    const terms = normalizeQuery(addQ).split(" ").filter(Boolean);
    if (!terms.length) return [];
    return items
      .filter((r) => !r.group && r.key !== primary?.key && !extraKeys.includes(r.key) && terms.every((t) => r.hay.includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [items, addQ, primary, extraKeys]);

  const onSyllabus = (it: CatalogItem) => !!it.slug || it.meshIds.some((id) => SYLLABUS.has(id));

  // A deep link (?s=) to a structure that is not on the syllabus respects the lock: nothing is selected,
  // the region shows greyed and the "Oh, I'm just curious" offer appears. (Unlocking is never saved in the URL.)
  const deepChecked = useRef(!(initialS || initialN));
  useEffect(() => {
    if (!primary || deepChecked.current) return;
    deepChecked.current = true;
    if (primary.group || infoSlug || onSyllabus(primary) || !primary.meshIds.length) return;
    const t = window.setTimeout(() => {
      setPrimaryKey(null);
      setCourseName(undefined);
      setLockedPick({ id: primary.meshIds[0], name: primary.name });
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primary, infoSlug]);

  // locking again also drops the selection that was only open because of the unlock
  const unlockedRef = useRef<string | null>(null);
  useEffect(() => {
    unlockedRef.current = unlocked;
  }, [unlocked]);
  const relock = useCallback(() => {
    const u = unlockedRef.current;
    if (u) setPrimaryKey((k) => (k === u ? null : k));
    setUnlocked(null);
    setCuriousNode(null);
    setLockedPick(null);
    gate.lock();
  }, [gate]);

  // (interaction overhaul) a clear way to unselect: the X on the selection chip, Esc, or a click on empty space
  const deselect = useCallback(() => {
    relock();
    setCourseName(undefined);
    setPrimaryKey(null);
  }, [relock]);
  const hasSelection = !!primary;
  useEffect(() => {
    if (!hasSelection) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || unlockedRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (document.fullscreenElement) return; // the browser's own Esc leaves full screen first
      deselect();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [hasSelection, deselect]);

  // a bone card that is not a course structure goes away with the layer it belongs to
  const onLayerChange = useCallback(
    (on: boolean) => {
      if (on || !curiousNode) return;
      setCuriousNode(null);
      setUnlocked(null);
      setLockedPick(null);
    },
    [curiousNode],
  );

  function pick(key: string) {
    const it = byKey.get(key);
    if (it && !it.group && !onSyllabus(it)) return touchLocked(it.meshIds[0], it.name);
    relock();
    setCourseName(undefined);
    setPrimaryKey(key);
    if (it) {
      const r = tabFor(it, tab);
      if (r.tab !== tab) changeTab(r.tab);
      if (r.why) note(r.why);
    }
  }
  function pickSlug(slug: string) {
    relock();
    setCourseName(undefined);
    setPrimaryKey(slug);
  }
  /** A greyed region was chosen: heads-up the first time (per section), then open it straight away. */
  function touchLocked(id: string, name: string) {
    setLockedPick({ id, name });
    gate.request();
  }
  // the gate opened for the region that was chosen: unlock it, select it, report it
  useEffect(() => {
    if (!gate.open || !lockedPick || unlocked === lockedPick.id) return;
    const { id, name } = lockedPick;
    const t = window.setTimeout(() => {
      if (id.startsWith("skull:node:")) {
        // a bone that is not a course structure: its own card, no selection change
        setUnlocked(id);
        setCuriousNode({ id, name });
        setInfoOpen(true);
        trackAtlas({ type: "curious_unlock", mesh: id, name });
        return;
      }
      setUnlocked(id);
      setCourseName(undefined);
      setPrimaryKey(id);
      changeTab("model");
      setInfoOpen(true);
      trackAtlas({ type: "curious_unlock", mesh: id, name });
    }, 0);
    return () => window.clearTimeout(t);
  }, [gate.open, lockedPick, unlocked]);
  useEffect(() => {
    if (!unlocked && !lockedPick) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && relock();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [unlocked, lockedPick, relock]);

  /** A structure clicked in 3D becomes the primary selection (curriculum item when one exists). */
  function pickMesh(id: string, side?: Side) {
    if (side) setNbSide(side);
    if (id.startsWith("skull:")) {
      const k = id.slice(6);
      if (k.startsWith("node:")) return touchLocked(id, nodeTitle(k.slice(5)));
      if (!k || !LINKS[k]) return;
      relock();
      setCourseName(undefined);
      setPrimaryKey(k);
      changeTab("model");
      return;
    }
    if (!SYLLABUS.has(id) && index?.structures[id]) {
      if (unlocked === id) return;
      return touchLocked(id, index.structures[id].name);
    }
    const it = items.find((i) => i.meshIds.includes(id) && !i.group) ?? items.find((i) => i.meshIds.includes(id));
    pick(it ? it.key : id);
  }
  /** Switch 3D <-> MRI, translating the view: multi-view <-> multiplanar, cut <-> same slice, anterior/lateral/superior <-> coronal/sagittal/transverse. */
  function changeTab(next: Tab) {
    if (next === tab) return;
    if (next === "brainstem") {
      // the Brainstem focus keeps the selection; nothing to translate
    } else if (next === "sections") {
      // the transverse cut (or the structure's own level) picks the section level
      const s = cam3d.current;
      const sl = infoSlug ?? primary?.slug ?? null;
      const lv = s.cut?.axis === "y" ? nearestLevel(mmFromWorld("y", s.cut.position), sl) : null;
      setSecLevel(lv ?? levelsShowing(sl)[0]?.slug ?? secLevel);
    } else if (next === "slices") {
      const s = cam3d.current;
      const sv = sliceViewFor(s);
      setSliceView(sv);
      sliceAtSwitch.current = sv;
      const base = (primary?.slug && atlas2?.structures[primary.slug]?.centroid) || [0, -18, 0];
      setAtMm(s.cut && !s.multi ? mniFromCut(s.cut, base) : null);
    } else {
      // back to 3D: the previous camera and look stay; the MRI view only drives the 3D view if it was changed meanwhile
      if (sliceView === "multi") setRequest({ n: (request?.n ?? 0) + 1, multi: true });
      else if (sliceView !== sliceAtSwitch.current) setRequest({ n: (request?.n ?? 0) + 1, multi: false, view: view3dFor(sliceView) });
    }
    setSeen((x) => ({ ...x, [next]: true }));
    setTabRaw(next);
  }
  const urlTimer = useRef(0);
  const onCameraState = useCallback(
    (s: CamState) => {
      cam3d.current = s;
      if (embedded) return;
      // the link and the remembered view follow the cut and camera (debounced: the slider reports every step)
      window.clearTimeout(urlTimer.current);
      urlTimer.current = window.setTimeout(() => {
        try {
          const p = new URLSearchParams(window.location.search);
          p.delete("cut");
          p.delete("cam");
          if (!p.get("view")) camParams(p, s);
          const qs = p.toString();
          window.history.replaceState(window.history.state, "", qs ? `/atlas?${qs}` : "/atlas");
          rememberView({ s: p.get("s") ?? undefined, cut: p.get("cut") ?? undefined, cam: p.get("cam") ?? undefined });
        } catch {
          /* ignore */
        }
      }, 400);
    },
    [embedded],
  );
  const onUserView = useCallback((v: ViewName) => {
    if (v === "left") setNbSide("L");
    else if (v === "right") setNbSide("R");
  }, []);

  const noSlices = primary && !primary.slug;
  const ids3d = primary?.meshIds ?? [];
  const sliceQuality = primary?.slices ?? null;
  const sliceSrc = primary?.slug && atlas2 ? atlas2.structures[primary.slug]?.source : null;
  const hasInfo = !!infoSlug || extraCard || !!curiousNode;
  const modeAvail = availabilityFor(primary);
  const ent = unlocked && index ? index.structures[unlocked] : null;
  const status =
    (primary && tab === "slices" && noSlices && "No MRI label for this structure in the open atlases; the 3D model is the reference.") ||
    (primary && tab === "slices" && sliceQuality && `${QUALITY_TEXT[sliceQuality]}${sliceSrc ? ` (${sliceSrc})` : ""}`) ||
    null;
  const rootStyle = height ? { height } : undefined;

  const listItem = (e: CatalogItem, depth = 0, trail: string[] = []): React.ReactNode => {
    const locked = !e.group && !onSyllabus(e);
    const kids = depth < 3 ? (e.children ?? []).filter((k) => !trail.includes(k)) : [];
    const open = kids.length > 0 && openKids.has(trail.concat(e.key).join(">"));
    const toggle = () =>
      setOpenKids((s) => {
        const n = new Set(s);
        const id = trail.concat(e.key).join(">");
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    return (
      <li key={trail.concat(e.key).join(">")}>
        <div className="flex items-stretch" style={depth ? { paddingLeft: depth * 12 } : undefined}>
          {kids.length > 0 ? (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              aria-label={`${open ? "Hide" : "Show"} the parts of ${e.name}`}
              title={`${open ? "Hide" : "Show"} its ${kids.length} parts`}
              className="flex w-5 flex-none items-start justify-center rounded-sm pt-2 text-text-faint hover:bg-panel-2 hover:text-text"
            >
              <ChevronRight size={13} className={`transition-transform ${open ? "rotate-90" : ""}`} aria-hidden />
            </button>
          ) : (
            depth > 0 && <span className="w-5 flex-none" aria-hidden />
          )}
          <button
            type="button"
            onPointerEnter={() => previewSoon(e)}
            onPointerLeave={() => previewSoon(null)}
            onFocus={() => previewSoon(e)}
            onBlur={() => previewSoon(null)}
            onClick={() => {
              previewSoon(null);
              pick(e.key);
              if (kids.length && !open) toggle();
            }}
            className={`flex min-w-0 flex-1 flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-panel-2 ${primary?.key === e.key ? "bg-panel-2 text-accent" : locked ? "text-text-faint" : ""}`}
          >
            <span className="flex w-full items-center gap-1.5">
              <span className="min-w-0 flex-1">{e.name}</span>
              {locked && <Lock size={11} className="flex-none" aria-label="not on your syllabus" />}
              {!e.group && <AvailIcons a={availabilityFor(e)} />}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
              {index?.regions[e.region] ?? SKULL_REGIONS[e.region] ?? (e.region === "slices" ? "MRI slices" : e.region)}
              {e.group ? " (group)" : ""}
              {e.slices ? " · slices" : ""}
              {kids.length ? ` · ${kids.length} parts` : ""}
            </span>
          </button>
        </div>
        {open && (
          <ul aria-label={`Parts of ${e.name}`}>
            {kids
              .map((k) => byKey.get(k))
              .filter((x): x is CatalogItem => !!x)
              .map((c) => listItem(c, depth + 1, trail.concat(e.key)))}
          </ul>
        )}
      </li>
    );
  };

  const overlayNode = (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <div className="absolute right-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1.5">
        <AddStructure q={addQ} setQ={setAddQ} results={addResults.map((r) => ({ key: r.key, name: r.name, icons: <AvailIcons a={availabilityFor(r)} /> }))} onAdd={(k) => setExtraKeys((ks) => [...ks, k.replace(/^slug:/, "")])} />
        <Legend
          rows={legendRows}
          hoverKey={hoverKey}
          onHover={setHoverKey}
          side={tab === "model" ? nbSide : null}
          onSide={setNbSide}
          onRemove={(k) => setExtraKeys((ks) => ks.filter((_, j) => j !== extras.findIndex((e) => e.key === k)))}
        />
      </div>
      {(gate.asking || (lockedPick && !gate.open && !extraCard)) && lockedPick && (
        <div className="absolute bottom-16 left-2 w-[min(360px,calc(100%-1rem))]">
          {gate.asking ? (
            <div className="atl-card-in pointer-events-auto">
              <SupplementaryHeadsUp what={lockedPick.name} onConfirm={gate.confirm} onCancel={relock} />
            </div>
          ) : (
            <LockedCard name={lockedPick.name} onCurious={gate.request} onClose={relock} />
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className={`relative flex w-full min-w-0 gap-2 ${height ? "" : "h-[calc(100dvh-148px)] min-h-[560px] max-sm:h-[calc(100dvh-212px)]"}`} style={rootStyle}>
      <aside
        className={`${listOpen ? "flex" : "hidden"} absolute inset-0 z-30 flex-col gap-2 rounded-card border border-panel-border bg-panel-solid p-3 lg:static lg:inset-auto lg:z-auto lg:w-[250px] lg:flex-none lg:bg-panel`}
        aria-label="Structure search"
      >
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="atlas-search">
            Search structures
          </label>
          <input id="atlas-search" className="input !min-h-[34px] !py-1.5" type="search" placeholder="Search structures, Latin, course names" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
          <button type="button" className="btn !min-h-[34px] !px-3 lg:hidden" onClick={() => setListOpen(false)}>
            Close
          </button>
        </div>
        <label className="sr-only" htmlFor="atlas-region">
          Region
        </label>
        <select id="atlas-region" className="input !min-h-[34px] !py-1" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="all">All regions</option>
          {index &&
            Object.entries(index.regions).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          {Object.entries(SKULL_REGIONS).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          <option value="slices">MRI slices only</option>
        </select>
        {error && <p className="text-sm text-again">Could not load the atlas index.</p>}
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Structures">
          {results.map((e) => listItem(e))}
          {index && results.length === 0 && <li className="px-2 py-3 text-sm text-text-dim">No structures match.</li>}
        </ul>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-card border border-panel-border bg-bg-2 lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-none flex-wrap items-center gap-2 border-b border-panel-border bg-panel px-2 py-1.5">
            <IconBtn below label={listOpen ? "Hide the structure list" : "Search and browse structures"} icon={<PanelLeft />} on={listOpen} onClick={() => setListOpen((o) => !o)} />
            <Segmented<Tab>
              label="Atlas view"
              below
              value={tab}
              onChange={(t) => changeTab(t)}
              items={[
                { id: "model", label: "3D model", text: "3D", dim: !!primary && modeAvail.d3 === "none", note: primary && modeAvail.d3 === "none" ? `3D model: ${modeAvail.d3Why}` : primary && modeAvail.d3 === "partial" ? `3D model: ${modeAvail.d3Why}` : "3D model" },
                { id: "slices", label: "MRI slices", text: "MRI", dim: !!primary && modeAvail.mri === "none", note: primary ? `MRI slices: ${modeAvail.mriWhy}` : "MRI slices" },
                { id: "brainstem", label: "Brainstem focus", text: "Brainstem", note: "Brainstem focus: the brainstem with its landmarks, cranial nerves and the section planes linked to the plates" },
                { id: "sections", label: "Course sections", text: "Sections", dim: !!primary && modeAvail.sec === "none", note: primary ? `Course sections: ${modeAvail.secWhy}` : "Course sections (brainstem and spinal cord levels)" },
              ]}
            />
            <span className="ml-auto" />
            {hasInfo && <IconBtn below className="hidden lg:inline-flex" label={infoOpen ? "Hide the info panel" : "Show the info panel"} icon={<PanelRight />} on={infoOpen} onClick={() => setInfoOpen((o) => !o)} />}
          </div>

          <div className="relative min-h-0 flex-1">
            {seen.model && (
              <div className={tab === "model" ? "absolute inset-0" : "pointer-events-none invisible absolute inset-0"} aria-hidden={tab !== "model"}>
              <AtlasViewer
                structureIds={ids3d}
                mode={primary ? "focus" : "context"}
                approximate={skullEntry ? skullEntry.approx : (primary?.approximate ?? false)}
                label={primary?.name}
                height="100%"
                className="!rounded-none !border-0"
                overlays={overlays3d}
                onPickMesh={pickMesh}
                onPickNothing={unlocked || lockedPick ? relock : primary ? deselect : undefined}
                onDeselect={primary ? deselect : undefined}
                structureTools
                onLayerChange={onLayerChange}
                hoverKey={hoverKey}
                onHoverKey={setHoverKey}
                shortcuts
                multiview
                solidCuts
                neighbors={neighbors}
                onToggleNeighbors={() => setNeighbors((n) => !n)}
                syllabus={SYLLABUS}
                unlocked={unlocked}
                autoReveal
                onUserView={onUserView}
                onCameraState={onCameraState}
                initialCam={startCam}
                key={startCam ? `cam:${startCam.view ?? ""}:${startCam.clip?.axis ?? ""}` : "cam"}
                skull={skullEntry}
                skullNodes={SKULL_NODES}
                skullNames={SKULL_NAMES}
                request={request}
              />
              </div>
            )}
            {seen.slices && (
              <div className={tab === "slices" ? "absolute inset-0" : "pointer-events-none invisible absolute inset-0"} aria-hidden={tab !== "slices"}>
              {atlas2 ? (
              <SliceViewer
                atlas={atlas2}
                primary={primary?.slug ?? null}
                primaryColor={pal.accent}
                overlays={overlaysSlices}
                view={sliceView}
                jumpTo={primary?.slug ?? null}
                onPick={pickSlug}
                height="100%"
                onViewChange={setSliceView}
                neighbors={neighbors}
                onToggleNeighbors={() => setNeighbors((n) => !n)}
                shortcuts
                notice={status}
                atMm={atMm}
              />
              ) : (
                <Loading what="MRI atlas" />
              )}
              </div>
            )}
            {seen.sections && (
              <div className={tab === "sections" ? "absolute inset-0" : "pointer-events-none invisible absolute inset-0"} aria-hidden={tab !== "sections"}>
                {courseSlug ? (
                  <SectionEmbed courseSlug={courseSlug} slug={infoSlug ?? primary?.slug ?? null} level={secLevel} onLevel={setSecLevel} />
                ) : (
                  <p className="p-6 text-sm text-text-dim">The course cross-sections need you to be signed in to a course.</p>
                )}
              </div>
            )}
            {seen.brainstem && (
              <div className={tab === "brainstem" ? "absolute inset-0" : "pointer-events-none invisible absolute inset-0"} aria-hidden={tab !== "brainstem"}>
                <BrainstemFocus slug={infoSlug} onPick={(s) => (LINKS[s] ? pickSlug(s) : undefined)} />
              </div>
            )}
            {modalityNote && (
              <div className="atl-card-in pointer-events-none absolute left-1/2 top-12 z-[7] max-w-[90%] -translate-x-1/2" role="status">
                <div className="atl-chip text-text-dim">{modalityNote}</div>
              </div>
            )}
            {tab !== "brainstem" && overlayNode}
            {tab === "model" && primary && primary.approximate && primary.slug && primary.slices !== "regional" && (
              <div className="pointer-events-auto absolute bottom-16 left-2 z-[6]">
                <button type="button" className="atl-chip text-accent-2 underline underline-offset-2" onClick={() => changeTab("slices")}>
                  See it exactly in MRI slices
                </button>
              </div>
            )}
            {tab === "model" && !primary && !lockedPick && (
              <div className="atl-chip pointer-events-none absolute bottom-16 left-2 z-[6] max-w-[60%] text-text-dim">Pick a structure, or click one in 3D.</div>
            )}
          </div>
        </div>

        {hasInfo && (
          <aside className={`flex-none border-t border-panel-border bg-panel-solid lg:flex lg:flex-col lg:border-l lg:border-t-0 ${infoOpen ? "lg:w-[380px]" : "lg:hidden"}`} aria-label="Structure information">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text lg:hidden"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((o) => !o)}
            >
              <span className="min-w-0 flex-1 truncate font-display tracking-wide">{primary?.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">{infoOpen ? "close" : "notes"}</span>
            </button>
            <div className={`${infoOpen ? "max-h-[48dvh]" : "hidden"} overflow-y-auto p-2 lg:block lg:max-h-none lg:min-h-0 lg:flex-1`}>
              {!curiousNode && <BrainstemRefDock slug={infoSlug} onPick={pickSlug} />}
              {curiousNode ? (
                <ExtraInfoCard name={curiousNode.name} blurb={nodeBlurb(curiousNode.id.slice(11))} region="Skull and spine" onLock={relock} />
              ) : extraCard && primary ? (
                <ExtraInfoCard name={primary.name} latin={ent?.latin} region={ent ? index?.regions[ent.region] : undefined} blurb={EXTRA[primary.key]} onLock={relock} />
              ) : infoSlug && LINKS[infoSlug]?.atlasOnly ? (
                <LandmarkCard name={LINKS[infoSlug].name} blurb={EXTRA[`landmark:${infoSlug}`]} />
              ) : (
                infoSlug && <StructureInfo slug={infoSlug} name={primary?.name} />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- deep link / remembered view
const CAM_VIEWS = new Set<ViewName>(["anterior", "posterior", "left", "right", "superior", "inferior", "midsagittal", "top"]);
type StartCam = { view?: ViewName; clip?: { axis: "x" | "y" | "z"; t: number; flip: boolean } | null } | null;
function parseCam(cut?: string, cam?: string): StartCam {
  const out: NonNullable<StartCam> = {};
  if (cam && CAM_VIEWS.has(cam as ViewName)) out.view = cam as ViewName;
  const m = cut ? /^([xyz]):(\d*\.?\d+)(:f)?$/.exec(cut) : null;
  if (m) out.clip = { axis: m[1] as "x" | "y" | "z", t: Math.min(1, Math.max(0, Number(m[2]))), flip: !!m[3] };
  return out.view || out.clip ? out : null;
}
function camParams(p: URLSearchParams, s: CamState) {
  if (s.clip) p.set("cut", `${s.clip.axis}:${s.clip.t.toFixed(3)}${s.clip.flip ? ":f" : ""}`);
  if (s.view !== "left") p.set("cam", s.view);
}
const REMEMBER_KEY = "atlas.lastView.v1";
// read once per page load: the URL effect below rewrites the stored view on mount, before a second (StrictMode) mount
let rememberedAtLoad: { s?: string; cut?: string; cam?: string } | null | undefined;
function readRemembered(): { s?: string; cut?: string; cam?: string } | null {
  if (rememberedAtLoad !== undefined) return rememberedAtLoad;
  try {
    rememberedAtLoad = JSON.parse(window.localStorage.getItem(REMEMBER_KEY) ?? "null");
  } catch {
    rememberedAtLoad = null;
  }
  return rememberedAtLoad ?? null;
}
function rememberView(v: { s?: string; cut?: string; cam?: string }) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, JSON.stringify(v));
  } catch {
    /* storage unavailable */
  }
}
