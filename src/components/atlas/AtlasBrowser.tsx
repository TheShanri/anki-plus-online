"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { loadAtlasIndex, normalizeQuery } from "@/lib/atlas";
import type { AtlasIndex } from "@/lib/atlas";
import { atlasTargetForCourseName } from "@/lib/atlas/map";
import { LINKS, atlasTargetForSlug, bestAtlasTab, buildCatalog } from "@/lib/atlas/catalog";
import type { CatalogItem } from "@/lib/atlas/catalog";
import { ATLAS2_BASE, loadAtlas2 } from "@/lib/atlas/slices";
import type { Atlas2 } from "@/lib/atlas/slices";
import { accentHex, overlayPalette } from "@/lib/atlas/palette";
import { SLICE_VIEWS } from "./SliceViewer";
import type { SliceOverlay, SliceView } from "./SliceViewer";

const PANEL_H = 560;
const Loading = ({ what }: { what: string }) => (
  <div className="flex items-center justify-center rounded-card border border-panel-border text-sm text-text-dim" style={{ height: PANEL_H }}>
    Loading {what}...
  </div>
);
const AtlasViewer = dynamic(() => import("./AtlasViewer"), { ssr: false, loading: () => <Loading what="3D model" /> });
const SliceViewer = dynamic(() => import("./SliceViewer"), { ssr: false, loading: () => <Loading what="MRI slices" /> });

type Tab = "model" | "slices";
const VIEW_PARAM: Record<string, SliceView> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", transverse: "axial", multi: "multi", multiplanar: "multi", render: "render" };
const VIEW_NAME: Record<SliceView, string> = { coronal: "coronal", sagittal: "sagittal", axial: "axial", multi: "multi", render: "render" };

type Props = { initialS?: string; initialN?: string; initialView?: string; initialAdd?: string; initialNb?: string };

const QUALITY_TEXT: Record<string, string> = {
  exact: "Exact in MRI slices",
  derived: "Derived in MRI slices",
  regional: "Region only in MRI slices",
};

export function AtlasBrowser({ initialS, initialN, initialView, initialAdd, initialNb }: Props) {
  const [index, setIndex] = useState<AtlasIndex | null>(null);
  const [atlas2, setAtlas2] = useState<Atlas2 | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [primaryKey, setPrimaryKey] = useState<string | null>(initialS ?? null);
  const [courseName, setCourseName] = useState<string | undefined>(initialN);
  const [extraKeys, setExtraKeys] = useState<string[]>(() => (initialAdd ? initialAdd.split(",").filter(Boolean) : []));
  const [neighbors, setNeighbors] = useState(initialNb === "1");
  const [tab, setTab] = useState<Tab>(initialView && VIEW_PARAM[initialView] ? "slices" : "model");
  const [sliceView, setSliceView] = useState<SliceView>((initialView && VIEW_PARAM[initialView]) || "coronal");
  const [addQ, setAddQ] = useState("");
  const [pal, setPal] = useState<{ accent: string; colors: string[] }>({ accent: "#ff2a6d", colors: ["#22d3ee", "#4ade80", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#fb923c", "#2dd4bf"] });

  useEffect(() => {
    let alive = true;
    loadAtlasIndex()
      .then((i) => alive && setIndex(i))
      .catch(() => alive && setError(true));
    loadAtlas2()
      .then((a) => alive && setAtlas2(a))
      .catch(() => undefined);
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
    const direct = byKey.get(primaryKey) ?? byKey.get(`slug:${primaryKey}`);
    if (direct) return direct;
    const l = LINKS[primaryKey];
    if (l) {
      const m = items.find((i) => i.slug === primaryKey && !i.group);
      if (m) return m;
      // a curriculum slug whose mesh has another id (e.g. "vagus-nerve" -> "vagus-nerve-x")
      const t = atlasTargetForSlug(primaryKey);
      if (t) return { key: `slug:${primaryKey}`, name: l.name, region: "other", meshIds: t.ids, approximate: t.approximate, slug: t.slices ? primaryKey : null, slices: t.slices, hay: "", group: false };
    }
    return null;
  }, [items, byKey, primaryKey, courseName]);

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

  // neighbours for the active tab
  const nb3d = useMemo(() => {
    if (!neighbors || !primary || !index) return [] as { key: string; name: string; ids: string[] }[];
    const out: { key: string; name: string; ids: string[] }[] = [];
    const seen = new Set<string>([...primary.meshIds, ...extras.flatMap((e) => e.meshIds)]);
    for (const id of primary.meshIds) {
      for (const n of index.structures[id]?.neighbors ?? []) {
        if (seen.has(n) || !index.structures[n]) continue;
        seen.add(n);
        out.push({ key: n, name: index.structures[n].name, ids: [n] });
      }
    }
    return out.slice(0, 6);
  }, [neighbors, primary, extras, index]);
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
      ...extras.map((e, i) => ({ key: e.key, ids: e.meshIds, color: extraColor(i), opacity: 0.95 })),
      ...nb3d.map((n, i) => ({ key: "nb:" + n.key, ids: n.ids, color: extraColor(extras.length + i), opacity: 0.6 })),
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
  const legend =
    tab === "model"
      ? [...extras.map((e, i) => ({ name: e.name, color: extraColor(i), kind: "added" })), ...nb3d.map((n, i) => ({ name: n.name, color: extraColor(extras.length + i), kind: "neighbour" }))]
      : [
          ...extras.filter((e) => e.slug).map((e, i) => ({ name: e.name, color: extraColor(i), kind: "added" })),
          ...nbSlices.map((n, i) => ({ name: n.name, color: extraColor(extras.length + i), kind: "neighbour" })),
        ];

  // URL deep link: /atlas?s=<id or slug>&view=coronal&add=a,b&nb=1
  useEffect(() => {
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
  }, [primary, tab, sliceView, extraKeys, neighbors]);

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

  function pick(key: string) {
    setCourseName(undefined);
    setPrimaryKey(key);
    const it = byKey.get(key);
    if (it) setTab((cur) => tabFor(it, cur));
  }
  function pickSlug(slug: string) {
    setCourseName(undefined);
    setPrimaryKey(slug);
  }

  const noSlices = primary && !primary.slug;
  const ids3d = primary?.meshIds ?? [];
  const sliceQuality = primary?.slices ?? null;
  const sliceSrc = primary?.slug && atlas2 ? atlas2.structures[primary.slug]?.source : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <div className="panel flex flex-col gap-3" style={{ maxHeight: PANEL_H }}>
        <label className="sr-only" htmlFor="atlas-search">
          Search structures
        </label>
        <input id="atlas-search" className="input" type="search" placeholder="Search structures, Latin, course names" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <label className="sr-only" htmlFor="atlas-region">
          Region
        </label>
        <select id="atlas-region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
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
        <ul className="-mx-1 flex-1 overflow-y-auto pr-1" aria-label="Structures">
          {results.map((e) => (
            <li key={e.key}>
              <button
                type="button"
                onClick={() => pick(e.key)}
                className={`flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left text-sm hover:bg-panel-2 ${primary?.key === e.key ? "bg-panel-2 text-accent" : ""}`}
              >
                <span>{e.name}</span>
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-faint">
                  {index?.regions[e.region] ?? (e.region === "slices" ? "MRI slices" : e.region)}
                  {e.group ? " (group)" : ""}
                  {e.slices ? " · slices" : ""}
                </span>
              </button>
            </li>
          ))}
          {index && results.length === 0 && <li className="px-2 py-3 text-sm text-text-dim">No structures match.</li>}
        </ul>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Atlas view">
          {(
            [
              ["model", "3D model"],
              ["slices", "MRI slices"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`rounded-sm border px-3 py-1.5 font-mono text-xs uppercase tracking-wider ${tab === id ? "border-accent text-accent" : "border-panel-border text-text-dim hover:border-panel-border-hi"}`}
            >
              {label}
            </button>
          ))}
          {tab === "slices" &&
            SLICE_VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => setSliceView(v.id)}
                aria-pressed={sliceView === v.id}
                className={`rounded-sm border px-2 py-1 font-mono text-[11px] uppercase tracking-wider ${sliceView === v.id ? "border-accent-2 text-accent-2" : "border-panel-border text-text-dim hover:border-panel-border-hi"}`}
              >
                {v.label}
              </button>
            ))}
          <label className="ml-auto flex items-center gap-1.5 text-sm text-text-dim">
            <input type="checkbox" checked={neighbors} onChange={(e) => setNeighbors(e.target.checked)} />
            Highlight neighbours
          </label>
        </div>

        <div className="relative flex flex-wrap items-start gap-2">
          <div className="relative">
            <label className="sr-only" htmlFor="atlas-add">
              Add structure
            </label>
            <input id="atlas-add" className="input w-56" type="search" placeholder="Add structure..." value={addQ} onChange={(e) => setAddQ(e.target.value)} autoComplete="off" />
            {addResults.length > 0 && (
              <ul className="absolute left-0 top-full z-20 mt-1 max-h-60 w-72 overflow-y-auto rounded-sm border border-panel-border bg-panel-solid shadow-pop">
                {addResults.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      className="block w-full px-2 py-1.5 text-left text-sm hover:bg-panel-2"
                      onClick={() => {
                        setExtraKeys((k) => [...k, r.key.replace(/^slug:/, "")]);
                        setAddQ("");
                      }}
                    >
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <ul className="flex flex-1 flex-wrap items-center gap-1.5 text-xs" aria-label="Legend">
            {primary && (
              <li className="flex items-center gap-1.5 rounded-sm border border-panel-border px-2 py-1">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: pal.accent }} />
                {primary.name}
              </li>
            )}
            {legend.map((l, i) => (
              <li key={l.name + i} className="flex items-center gap-1.5 rounded-sm border border-panel-border px-2 py-1 text-text-dim">
                <span className="inline-block h-3 w-3 rounded-sm" style={{ background: l.color }} />
                {l.name}
                {l.kind === "added" && (
                  <button
                    type="button"
                    aria-label={`Remove ${l.name}`}
                    className="text-text-faint hover:text-text"
                    onClick={() => setExtraKeys((k) => k.filter((_, j) => j !== extras.findIndex((e) => e.name === l.name)))}
                  >
                    x
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>

        {tab === "model" ? (
          <AtlasViewer structureIds={ids3d} mode={primary ? "focus" : "context"} approximate={primary?.approximate ?? false} label={primary?.name} height={PANEL_H} overlays={overlays3d} />
        ) : atlas2 ? (
          <SliceViewer
            atlas={atlas2}
            primary={primary?.slug ?? null}
            primaryColor={pal.accent}
            overlays={overlaysSlices}
            view={sliceView}
            jumpTo={primary?.slug ?? null}
            onPick={pickSlug}
            height={PANEL_H}
          />
        ) : (
          <Loading what="MRI atlas" />
        )}

        <div className="flex flex-wrap items-center gap-2 text-sm text-text-dim">
          {primary && tab === "slices" && noSlices && <span>No MRI label for this structure in the open atlases; the 3D model is the reference.</span>}
          {primary && tab === "slices" && sliceQuality && (
            <span className={sliceQuality === "regional" ? "text-hard" : ""}>
              {QUALITY_TEXT[sliceQuality]}
              {sliceSrc ? ` (${sliceSrc})` : ""}
            </span>
          )}
          {primary && tab === "model" && primary.approximate && (
            <span className="text-hard">
              Approximate in 3D: the highlight is the structure that contains it.
              {primary.slug && primary.slices !== "regional" && (
                <>
                  {" "}
                  <button type="button" className="text-accent-2 underline underline-offset-2" onClick={() => setTab("slices")}>
                    See it exactly in MRI slices
                  </button>
                </>
              )}
            </span>
          )}
          {!primary && <span>Pick a structure to highlight it. Drag to rotate, scroll or pinch to zoom, right-drag or two fingers to pan.</span>}
        </div>
      </div>
    </div>
  );
}
