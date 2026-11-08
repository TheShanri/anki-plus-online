"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, LayoutGrid, Lock, PanelLeft, PanelRight } from "lucide-react";
import { loadAtlasIndex, normalizeQuery } from "@/lib/atlas";
import type { AtlasEntry, AtlasIndex } from "@/lib/atlas";
import { atlasTargetForCourseName } from "@/lib/atlas/map";
import { LINKS, atlasTargetForSlug, bestAtlasTab, buildCatalog } from "@/lib/atlas/catalog";
import type { CatalogItem } from "@/lib/atlas/catalog";
import { ATLAS2_BASE, loadAtlas2 } from "@/lib/atlas/slices";
import type { Atlas2 } from "@/lib/atlas/slices";
import { accentHex, overlayPalette } from "@/lib/atlas/palette";
import { trackAtlas } from "@/lib/atlas/progress";
import extraInfo from "@/data/atlas-extra-info.json";
import { SupplementaryHeadsUp, useSupplementaryGate } from "@/components/supplementary/Supplementary";
import { StructureInfo } from "./StructureInfo";
import type { SliceOverlay, SliceView } from "./SliceViewer";
import type { ViewName } from "./AtlasViewer";
import { AtlasLoader } from "./ui/AtlasLoader";
import { IconBtn, Segmented } from "./ui/Toolbar";
import { AddStructure, ExtraInfoCard, Legend, LockedCard } from "./ui/Overlays";
import type { LegendRow } from "./ui/Overlays";
import { CutCoronalIcon, CutSagittalIcon, CutTransverseIcon } from "./ui/icons";
import { preloadAtlas } from "./ui/modelCache";

const Loading = ({ what }: { what: string }) => (
  <div className="relative h-full min-h-[240px]">
    <AtlasLoader label={`Loading the ${what}`} stages={[{ id: "code", label: `Starting the ${what}`, state: "active" }]} />
  </div>
);
const AtlasViewer = dynamic(() => import("./AtlasViewer"), { ssr: false, loading: () => <Loading what="3D viewer" /> });
const SliceViewer = dynamic(() => import("./SliceViewer"), { ssr: false, loading: () => <Loading what="MRI viewer" /> });

type Tab = "model" | "slices";
const VIEW_PARAM: Record<string, SliceView> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", transverse: "axial", multi: "multi", multiplanar: "multi", render: "render" };
const VIEW_NAME: Record<SliceView, string> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", multi: "multi", render: "render" };
const SLICE_ITEMS: { id: SliceView; label: string; icon: React.ReactNode }[] = [
  { id: "coronal", label: "Coronal", icon: <CutCoronalIcon /> },
  { id: "sagittal", label: "Sagittal", icon: <CutSagittalIcon /> },
  { id: "axial", label: "Transverse", icon: <CutTransverseIcon /> },
  { id: "multi", label: "Multiplanar", icon: <LayoutGrid /> },
  { id: "render", label: "3D render", icon: <Box /> },
];

type Props = {
  initialS?: string;
  initialN?: string;
  initialView?: string;
  initialAdd?: string;
  initialNb?: string;
  /** Inside another page (the study overlay): leaves the URL alone. */
  embedded?: boolean;
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

export function AtlasBrowser({ initialS, initialN, initialView, initialAdd, initialNb, embedded = false, height }: Props) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [atlas2, setAtlas2] = useState<Atlas2 | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [primaryKey, setPrimaryKey] = useState<string | null>(initialS ?? null);
  const [courseName, setCourseName] = useState<string | undefined>(initialN);
  const [extraKeys, setExtraKeys] = useState<string[]>(() => (initialAdd ? initialAdd.split(",").filter(Boolean) : []));
  const [neighbors, setNeighbors] = useState(initialNb === "1");
  const [nbSide, setNbSide] = useState<Side>("L");
  const [tab, setTab] = useState<Tab>(initialView && VIEW_PARAM[initialView] ? "slices" : "model");
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
        if (it) return { ...it, name: courseName };
      }
      if (t && t.ids.length) {
        return { key: t.ids[0], name: courseName, region: "other", meshIds: t.ids, approximate: t.approximate, slug: t.slug ?? null, slices: t.slices ?? null, hay: "", group: false };
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

  // progress: a curriculum structure was opened (3D or MRI)
  const via: "3d" | "mri" = tab === "model" ? "3d" : "mri";
  const lastViewed = useRef("");
  useEffect(() => {
    if (!infoSlug) return;
    const k = `${infoSlug}|${via}`;
    if (lastViewed.current === k) return;
    lastViewed.current = k;
    trackAtlas({ type: "structure_viewed", slug: infoSlug, via });
  }, [infoSlug, via]);

  // Open each structure where it is shown most exactly: MRI slices when the 3D highlight is only approximate,
  // the 3D model when the MRI atlas has no label. A view the student picks stays otherwise.
  const tabFor = (it: CatalogItem, cur: Tab): Tab => {
    const best = bestAtlasTab({ ids: it.meshIds, approximate: it.approximate, slices: it.slug ? it.slices : null });
    if (cur === "model" && best === "slices") return "slices";
    if (cur === "slices" && !it.slug) return "model";
    return cur;
  };
  const resolvedOnce = useRef(false);
  useEffect(() => {
    if (!primary || resolvedOnce.current) return;
    resolvedOnce.current = true;
    if (initialView && VIEW_PARAM[initialView]) return; // the link asked for a view
    const t = window.setTimeout(() => setTab((cur) => tabFor(primary, cur)), 0);
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
      ...extras.map((e, i) => ({ key: e.key, ids: e.meshIds, color: extraColor(i), opacity: 1 })),
      ...nb3d.map((n, i) => ({ key: "nb:" + n.key, ids: n.ids, color: extraColor(extras.length + i), opacity: 1, side: n.side })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [extras, nb3d, pal.colors],
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
      if (tab === "slices") p.set("view", VIEW_NAME[sliceView]);
      if (extraKeys.length) p.set("add", extraKeys.join(","));
      if (neighbors) p.set("nb", "1");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `/atlas?${qs}` : "/atlas");
    } catch {
      /* ignore */
    }
  }, [embedded, primary, tab, sliceView, extraKeys, neighbors]);

  const results = useMemo(() => {
    const terms = normalizeQuery(q).split(" ").filter(Boolean);
    return items
      .filter((r) => (region === "all" || r.region === region) && terms.every((t) => r.hay.includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 120);
  }, [items, q, region]);
  const addResults = useMemo(() => {
    const terms = normalizeQuery(addQ).split(" ").filter(Boolean);
    if (!terms.length) return [];
    return items
      .filter((r) => !r.group && r.key !== primary?.key && !extraKeys.includes(r.key) && terms.every((t) => r.hay.includes(t)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [items, addQ, primary, extraKeys]);

  const onSyllabus = (it: CatalogItem) => !!it.slug || it.meshIds.some((id) => SYLLABUS.has(id));

  const relock = useCallback(() => {
    setUnlocked(null);
    setLockedPick(null);
    gate.lock();
  }, [gate]);

  function pick(key: string) {
    const it = byKey.get(key);
    if (it && !it.group && !onSyllabus(it)) return touchLocked(it.meshIds[0], it.name);
    relock();
    setCourseName(undefined);
    setPrimaryKey(key);
    if (it) setTab((cur) => tabFor(it, cur));
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
      setUnlocked(id);
      setCourseName(undefined);
      setPrimaryKey(id);
      setTab("model");
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
    if (!SYLLABUS.has(id) && index?.structures[id]) {
      if (unlocked === id) return;
      return touchLocked(id, index.structures[id].name);
    }
    const it = items.find((i) => i.meshIds.includes(id) && !i.group) ?? items.find((i) => i.meshIds.includes(id));
    pick(it ? it.key : id);
  }
  const onUserView = useCallback((v: ViewName) => {
    if (v === "left") setNbSide("L");
    else if (v === "right") setNbSide("R");
  }, []);

  const noSlices = primary && !primary.slug;
  const ids3d = primary?.meshIds ?? [];
  const sliceQuality = primary?.slices ?? null;
  const sliceSrc = primary?.slug && atlas2 ? atlas2.structures[primary.slug]?.source : null;
  const hasInfo = !!infoSlug || extraCard;
  const ent = unlocked && index ? index.structures[unlocked] : null;
  const status =
    (primary && tab === "slices" && noSlices && "No MRI label for this structure in the open atlases; the 3D model is the reference.") ||
    (primary && tab === "slices" && sliceQuality && `${QUALITY_TEXT[sliceQuality]}${sliceSrc ? ` (${sliceSrc})` : ""}`) ||
    null;
  const rootStyle = height ? { height } : undefined;

  const listItem = (e: CatalogItem) => {
    const locked = !e.group && !onSyllabus(e);
    return (
      <li key={e.key}>
        <button
          type="button"
          onClick={() => pick(e.key)}
          className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-panel-2 ${primary?.key === e.key ? "bg-panel-2 text-accent" : locked ? "text-text-faint" : ""}`}
        >
          <span className="flex w-full items-center gap-1.5">
            {e.name}
            {locked && <Lock size={11} className="ml-auto flex-none" aria-label="not on your syllabus" />}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
            {index?.regions[e.region] ?? (e.region === "slices" ? "MRI slices" : e.region)}
            {e.group ? " (group)" : ""}
            {e.slices ? " · slices" : ""}
          </span>
        </button>
      </li>
    );
  };

  const overlayNode = (
    <div className="pointer-events-none absolute inset-0 z-[5]">
      <div className="absolute right-2 top-2 flex max-w-[calc(100%-1rem)] flex-col items-end gap-1.5">
        <AddStructure q={addQ} setQ={setAddQ} results={addResults} onAdd={(k) => setExtraKeys((ks) => [...ks, k.replace(/^slug:/, "")])} />
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
    <div className={`relative flex w-full min-w-0 gap-2 ${height ? "" : "h-[calc(100dvh-148px)] min-h-[560px]"}`} style={rootStyle}>
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
          <option value="slices">MRI slices only</option>
        </select>
        {error && <p className="text-sm text-again">Could not load the atlas index.</p>}
        <ul className="-mx-1 min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Structures">
          {results.map(listItem)}
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
              onChange={(t) => setTab(t)}
              items={[
                { id: "model", label: "3D model", text: "3D" },
                { id: "slices", label: "MRI slices", text: "MRI" },
              ]}
            />
            {tab === "slices" && (
              <Segmented<SliceView> label="MRI view" below value={sliceView} onChange={setSliceView} items={SLICE_ITEMS.map((v) => ({ id: v.id, label: v.label, icon: v.icon }))} />
            )}
            {status && <span className={`hidden min-w-0 truncate text-xs md:inline ${sliceQuality === "regional" ? "text-hard" : "text-text-dim"}`}>{status}</span>}
            {primary && tab === "model" && primary.approximate && primary.slug && primary.slices !== "regional" && (
              <button type="button" className="text-xs text-accent-2 underline underline-offset-2" onClick={() => setTab("slices")}>
                See it exactly in MRI slices
              </button>
            )}
            {!primary && <span className="hidden truncate text-xs text-text-dim md:inline">Pick a structure, or click one in 3D. Drag to rotate, scroll to zoom.</span>}
            <span className="ml-auto" />
            {hasInfo && <IconBtn below className="hidden lg:inline-flex" label={infoOpen ? "Hide the info panel" : "Show the info panel"} icon={<PanelRight />} on={infoOpen} onClick={() => setInfoOpen((o) => !o)} />}
          </div>

          <div className="relative min-h-0 flex-1">
            {tab === "model" ? (
              <AtlasViewer
                structureIds={ids3d}
                mode={primary ? "focus" : "context"}
                approximate={primary?.approximate ?? false}
                label={primary?.name}
                height="100%"
                className="!rounded-none !border-0"
                overlays={overlays3d}
                onPickMesh={pickMesh}
                onPickNothing={unlocked || lockedPick ? relock : undefined}
                hoverKey={hoverKey}
                onHoverKey={setHoverKey}
                shortcuts
                multiview
                neighbors={neighbors}
                onToggleNeighbors={() => setNeighbors((n) => !n)}
                syllabus={SYLLABUS}
                unlocked={unlocked}
                autoReveal
                onUserView={onUserView}
              />
            ) : atlas2 ? (
              <SliceViewer atlas={atlas2} primary={primary?.slug ?? null} primaryColor={pal.accent} overlays={overlaysSlices} view={sliceView} jumpTo={primary?.slug ?? null} onPick={pickSlug} height="100%" />
            ) : (
              <Loading what="MRI atlas" />
            )}
            {overlayNode}
            {tab === "slices" && (
              <div className="pointer-events-auto absolute left-2 top-2">
                <IconBtn
                  below
                  label={neighbors ? "Hide neighbours" : "Highlight neighbours"}
                  text="Neighbours"
                  on={neighbors}
                  onClick={() => setNeighbors((n) => !n)}
                  className="atl-chip !h-8"
                />
              </div>
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
              {extraCard && primary ? (
                <ExtraInfoCard name={primary.name} latin={ent?.latin} region={ent ? index?.regions[ent.region] : undefined} blurb={EXTRA[primary.key]} onLock={relock} />
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
