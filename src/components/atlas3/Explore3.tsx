"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ChevronRight, Palette, RotateCcw, ScanLine, X } from "lucide-react";
import { Divider, Group, IconBtn, Segmented } from "@/components/atlas/ui/Toolbar";
import { CutCoronalIcon, CutNoneIcon, CutSagittalIcon, CutTransverseIcon, SeeThroughIcon, SolidIcon } from "@/components/atlas/ui/icons";
import { AtlasLoader } from "@/components/atlas/ui/AtlasLoader";
import { StructureInfo } from "@/components/atlas/StructureInfo";
import type { Atlas3Props, Cut3, View3 } from "./engine/Atlas3Canvas";
import type { Index3, Label3, Prog } from "./engine/data";
import { SECTIONS, loadCatalog, search, sectionOf, type CatItem } from "./catalog";
import "@/components/atlas/ui/atlas-ui.css";
import "./atlas3.css";

const Atlas3Canvas = dynamic(() => import("./engine/Atlas3Canvas").then((m) => m.Atlas3Canvas), {
  ssr: false,
  loading: () => <AtlasLoader label="Loading the 3D atlas" progress={0.05} stages={[{ id: "code", label: "Starting the viewer", state: "active" }]} />,
});

type Sides = "both" | "L" | "R";
type CutAxis = "off" | "z" | "x" | "y";
const VIEWS: { id: View3; label: string; text: string; key: string }[] = [
  { id: "left", label: "Left lateral", text: "L", key: "1" },
  { id: "right", label: "Right lateral", text: "R", key: "2" },
  { id: "anterior", label: "Anterior", text: "Ant", key: "3" },
  { id: "posterior", label: "Posterior", text: "Post", key: "4" },
  { id: "superior", label: "Superior", text: "Sup", key: "5" },
  { id: "inferior", label: "Inferior (base)", text: "Inf", key: "6" },
  { id: "medial-left", label: "Medial (left hemisphere)", text: "Med", key: "7" },
  { id: "medial-right", label: "Medial (right hemisphere)", text: "MedR", key: "8" },
];
/** world extents (metres) of the brain for the cut slider, per axis */
const RANGE: Record<"x" | "y" | "z", [number, number]> = { x: [-0.072, 0.072], y: [-0.072, 0.082], z: [-0.105, 0.072] };
const CUT_NAME: Record<CutAxis, string> = { off: "No cut", z: "Coronal cut", x: "Sagittal cut", y: "Horizontal cut" };
/** tissues hidden in the deep-structures view (cortex, white matter, cerebellar cortex) */
const DEEP_HIDE = new Set(["ctx", "wm", "cbx"]);
/** below this share of its surface visible from the best standard view, a structure opens in the deep view */
const DEEP_SHARE = 0.07;
/** the brainstem: its divisions, and the nuclei and tracts placed from the course plates. In the deep view of a
 * selection inside it, the rest of it is a see-through veil (and its fluid spaces a veil of their own) */
const STEM = new Set([
  ...["MTg", "mRt", "PnBa", "PnTg", "PnO", "MoTg", "BSW", "CPd", "Py", "IO", "SC", "ICo", "SCP", "MCP", "ICP", "PAG", "RN", "SN", "VTA", "PTg", "LC", "DR", "MnR", "LDTg", "PBC", "ML", "MLF", "PTR"],
  ...["III", "EW", "IV", "BIC", "xSCP", "IPF", "Vmo", "Vps", "VI", "VII", "FCol", "PPRF", "LFP", "VCx", "Sp5", "Sol", "DMX", "XII", "Amb", "Gr", "Cu", "IAF", "PyX", "ALS", "DSCT"],
]);
const STEM_FLUID = new Set(["Aq", "V4", "CeC"]);
/** kept as context in the deep view of a selection: the ventricles and the brainstem */
const CONTEXT_KEYS = new Set(["aLV", "bLV", "xLV", "pLV", "iLV", "V3", "Aq", "V4", "CeC", "MTg", "PnBa", "PnTg", "MoTg", "CPd", "Py", "IO", "BSW", "SC", "ICo", "SCP", "MCP", "ICP"]);

export function Explore3({ initialS, initialCam, initialCut, initialSide }: { initialS?: string; initialCam?: string; initialCut?: string; initialSide?: string }) {
  const [index, setIndex] = useState<Index3 | null>(null);
  const [items, setItems] = useState<CatItem[] | null>(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(initialS ?? null);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<View3>((VIEWS.find((v) => v.id === initialCam)?.id ?? "left") as View3);
  const [viewNonce, setViewNonce] = useState(0);
  const [sides, setSides] = useState<Sides>(initialSide === "L" || initialSide === "R" ? initialSide : "both");
  const [cutAxis, setCutAxis] = useState<CutAxis>(() => (initialCut ? (initialCut.split(":")[0] as CutAxis) : "off"));
  const [cutPos, setCutPos] = useState<number>(() => (initialCut ? Number(initialCut.split(":")[1]) || 0 : 0));
  const [cutFlip, setCutFlip] = useState(() => !!initialCut?.endsWith(":f"));
  const [deep, setDeep] = useState(false);
  const [look, setLook] = useState<"natural" | "regions">("natural");
  const [focus, setFocus] = useState<{ ids: number[]; nonce: number } | null>(null);
  const [prog, setProg] = useState<{ shell?: Prog; inner?: Prog }>({});
  const listRef = useRef<HTMLDivElement>(null);

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
  // a selection inside the brainstem is seen through the rest of it
  const inStem = useMemo(() => selIds.length > 0 && selIds.every((id) => STEM.has(byId.get(id)?.key ?? "")), [selIds, byId]);
  const hiddenIds = useMemo(() => {
    if (!deep || !index) return [];
    const keep = new Set(selIds);
    if (keep.size && inStem) return index.labels.filter((l) => !keep.has(l.id)).map((l) => l.id);
    // with a selection: the selection in its context (ventricles, brainstem); without: every deep structure
    if (keep.size) return index.labels.filter((l) => !keep.has(l.id) && !CONTEXT_KEYS.has(l.key)).map((l) => l.id);
    return index.labels.filter((l) => DEEP_HIDE.has(l.tissue)).map((l) => l.id);
  }, [deep, index, selIds, inStem]);
  const ghostIds = useMemo(() => {
    if (!deep || !index || !inStem) return [];
    const keep = new Set(selIds);
    return index.labels.filter((l) => !keep.has(l.id) && (STEM.has(l.key) || STEM_FLUID.has(l.key))).map((l) => l.id);
  }, [deep, index, selIds, inStem]);
  const cut: Cut3 | null = cutAxis === "off" ? null : { axis: cutAxis, pos: cutPos, flip: cutFlip };
  const hideSides = useMemo<("L" | "R")[]>(() => (sides === "L" ? ["R"] : sides === "R" ? ["L"] : []), [sides]);
  const pins = useMemo(() => {
    if (!item) return [];
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

  // ---- selection
  const select = useCallback(
    (it: CatItem | null, opts: { frame?: boolean } = {}) => {
      setSel(it ? it.slug : null);
      if (!it) return;
      if (!it.ids.length && (it.sulcus !== undefined || it.area !== undefined)) {
        // a sulcus or a functional area: the outside surface, from the view that shows it
        const ak = it.area !== undefined ? index?.areas.find((a) => a.bit === it.area)?.key : undefined;
        const v: View3 = it.sulcus !== undefined ? (SULCUS_VIEW[it.sulcus] ?? "left") : ((ak ? AREA_VIEW[ak] : undefined) ?? "left");
        setDeep(false);
        setCutAxis("off");
        setView(v);
        setSides(v === "medial-left" ? "L" : v === "medial-right" ? "R" : "both");
        setViewNonce((n) => n + 1);
        return;
      }
      const deepNow = isDeep(it.ids, byId);
      const stemNow = deepNow && cutAxis === "off" && it.ids.every((id) => STEM.has(byId.get(id)?.key ?? ""));
      if (cutAxis === "off") setDeep(deepNow);
      if (opts.frame !== false) {
        // an outside structure is shown from the view that shows it best (medial for the cuneus, inferior for the
        // mammillary bodies); the medial views hide the other hemisphere
        if (!deepNow && cutAxis === "off") {
          const bv = bestView(it.ids, byId).view;
          setView(bv);
          setSides(bv === "medial-left" ? "L" : bv === "medial-right" ? "R" : "both");
          setViewNonce((n) => n + 1);
        } else if (stemNow) {
          // a nucleus or tract inside the brainstem: the whole see-through brainstem from behind, so its level
          // (midbrain, pons, medulla), both sides and the floor of the fourth ventricle are seen at once
          setView("posterior");
          setSides("both");
          setViewNonce((n) => n + 1);
        }
        const stemIds = stemNow ? (index?.labels ?? []).filter((l) => STEM.has(l.key)).map((l) => l.id) : [];
        setFocus((f) => ({ ids: stemNow ? [...new Set([...it.ids, ...stemIds])] : it.ids, nonce: (f?.nonce ?? 0) + 1 }));
      }
    },
    [byId, cutAxis, index],
  );
  useEffect(() => {
    // a deep link selects once the data is in
    if (index && items && initialS && bySlug.has(initialS)) select(bySlug.get(initialS)!, { frame: true });
  }, [index, items]); // eslint-disable-line react-hooks/exhaustive-deps
  const onPick = useCallback(
    (l: Label3 | null) => {
      if (!l) return setSel(null);
      const it = itemForLabel(l);
      if (it) select(it, { frame: false });
    },
    [itemForLabel, select],
  );
  const showCut = (axis: "x" | "y" | "z") => {
    if (!item) return;
    // through the largest cross-section of the selected structure (the first leaf of the visible side)
    const l = item.ids.map((id) => byId.get(id)).find((x) => x?.cut && !hideSides.includes(x.side as "L" | "R"));
    if (!l?.cut) return;
    setDeep(false);
    setCutAxis(axis);
    setCutPos(l.cut[axis]);
    // keep the half that looks at the camera: from the front (anterior) remove the front part, and so on
    setCutFlip(false);
    setView(axis === "z" ? "anterior" : axis === "x" ? (l.side === "R" ? "right" : "left") : "superior");
    setViewNonce((n) => n + 1);
  };

  // ---- URL state
  useEffect(() => {
    const u = new URL(window.location.href);
    const set = (k: string, v: string | null) => (v ? u.searchParams.set(k, v) : u.searchParams.delete(k));
    set("s", sel);
    set("cam", view === "left" ? null : view);
    set("cut", cut ? `${cut.axis}:${cut.pos.toFixed(4)}${cut.flip ? ":f" : ""}` : null);
    set("side", sides === "both" ? null : sides);
    window.history.replaceState(null, "", u);
  }, [sel, view, cut?.axis, cut?.pos, cut?.flip, sides]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const v = VIEWS.find((x) => x.key === e.key);
      if (v) {
        if (v.id === "medial-left") setSides("L");
        else if (v.id === "medial-right") setSides("R");
        setView(v.id);
        setViewNonce((n) => n + 1);
      } else if (e.key === "Escape") setSel(null);
      else if (e.key === "c" || e.key === "C") setCutAxis((a) => (a === "z" ? "off" : "z"));
      else if (e.key === "s" || e.key === "S") setCutAxis((a) => (a === "x" ? "off" : "x"));
      else if (e.key === "h" || e.key === "H") setCutAxis((a) => (a === "y" ? "off" : "y"));
      else if (e.key === "d" || e.key === "D") setDeep((d) => !d);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    cut,
    hideSides,
    hiddenIds,
    ghostIds,
    ghost: deep && !inStem,
    selected: selIds,
    dimOthers: deep,
    look,
    focus,
    pins,
    sulcus: item?.sulcus,
    areaMask: item?.area !== undefined ? 1 << item.area : 0,
    onPick,
    onReady,
    onProgress,
  };
  const sideNote = item && index ? sideText(item, byId, index) : "";

  return (
    <div className="atl3-shell" style={{ height: "calc(100dvh - 150px)", minHeight: 560 }}>
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

      <section className="atl3-stage" aria-label="3D brain">
        <Atlas3Canvas {...canvasProps} />
        {loadingShell && (
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

        {item && (
          <div className="atl3-card atl-card-in" role="region" aria-label={item.name}>
            <div className="flex items-start gap-2">
              <div className="min-w-0">
                <h2>{item.name}</h2>
                <div className="atl3-sub">
                  {sideNote}
                  {item.extra ? " · atlas structure (supplementary)" : ""}
                  {selDeep && !deep && cutAxis === "off" ? " · deep: see it with the deep view or a cut" : ""}
                </div>
              </div>
              <button type="button" className="atl-xbtn" aria-label="Clear the selection (Esc)" onClick={() => setSel(null)}>
                <X size={14} />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" className="atl-cutbtn" onClick={() => showCut("z")}>
                Coronal cut through it
              </button>
              <button type="button" className="atl-cutbtn" onClick={() => showCut("x")}>
                Sagittal
              </button>
              <button type="button" className="atl-cutbtn" onClick={() => showCut("y")}>
                Horizontal
              </button>
              {selDeep && (
                <button type="button" className="atl-cutbtn" onClick={() => setDeep((d) => !d)} aria-pressed={deep}>
                  {deep ? "Back to the whole brain" : "Deep view"}
                </button>
              )}
            </div>
            {!item.extra && (
              <div className="mt-3 border-t border-panel-border pt-3">
                <StructureInfo slug={item.slug} name={item.name} />
              </div>
            )}
          </div>
        )}

        <div className="atl3-bar">
          <div className="atl-bar">
            <Group label="View">
              {VIEWS.map((v) => (
                <IconBtn
                  key={v.id}
                  text={v.text}
                  label={v.label}
                  keys={v.key}
                  on={view === v.id}
                  onClick={() => {
                    if (v.id === "medial-left") setSides("L");
                    else if (v.id === "medial-right") setSides("R");
                    setView(v.id);
                    setViewNonce((n) => n + 1);
                  }}
                />
              ))}
            </Group>
            <Divider />
            <Segmented<Sides>
              label="Hemispheres"
              value={sides}
              onChange={setSides}
              items={[
                { id: "both", label: "Both hemispheres", text: "L+R" },
                { id: "L", label: "Left hemisphere only", text: "L" },
                { id: "R", label: "Right hemisphere only", text: "R" },
              ]}
            />
            <Divider />
            <Group label="Cut">
              {(["off", "z", "x", "y"] as CutAxis[]).map((a) => (
                <IconBtn
                  key={a}
                  label={CUT_NAME[a]}
                  keys={a === "z" ? "C" : a === "x" ? "S" : a === "y" ? "H" : undefined}
                  on={cutAxis === a}
                  icon={a === "off" ? <CutNoneIcon /> : a === "z" ? <CutCoronalIcon /> : a === "x" ? <CutSagittalIcon /> : <CutTransverseIcon />}
                  onClick={() => {
                    setCutAxis(a);
                    if (a !== "off") {
                      setDeep(false);
                      const r = RANGE[a];
                      if (cutPos < r[0] || cutPos > r[1] || a !== cutAxis) setCutPos(a === "x" ? 0.0005 : a === "y" ? 0.012 : 0.0);
                    }
                  }}
                />
              ))}
              {cutAxis !== "off" && (
                <span className="atl3-slider">
                  <input
                    type="range"
                    min={RANGE[cutAxis][0]}
                    max={RANGE[cutAxis][1]}
                    step={0.0005}
                    value={cutPos}
                    aria-label="Cut position"
                    onChange={(e) => setCutPos(Number(e.target.value))}
                  />
                  <IconBtn icon={<ScanLine />} label="Keep the other side" on={cutFlip} onClick={() => setCutFlip((f) => !f)} />
                </span>
              )}
            </Group>
            <Divider />
            <IconBtn icon={deep ? <SeeThroughIcon /> : <SolidIcon />} label={deep ? "Deep structures (D)" : "Whole brain (D)"} on={deep} onClick={() => setDeep((d) => !d)} />
            <IconBtn icon={<Palette />} label={look === "regions" ? "Natural colours" : "Lobes in colour"} on={look === "regions"} onClick={() => setLook((l) => (l === "regions" ? "natural" : "regions"))} />
            <IconBtn
              icon={<RotateCcw />}
              label="Reset the view"
              onClick={() => {
                setCutAxis("off");
                setSides("both");
                setDeep(false);
                setView("left");
                setViewNonce((n) => n + 1);
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

/** The view that shows a sulcus (by id) or a functional area (by key) best. */
const SULCUS_VIEW: Record<number, View3> = { 1: "superior", 2: "left", 3: "medial-left", 4: "medial-left", 5: "superior", 6: "left", 7: "left", 8: "left", 9: "left", 10: "superior", 11: "left", 12: "medial-left", 13: "inferior", 14: "superior", [-1]: "left" };
const AREA_VIEW: Record<string, View3> = { ofc: "inferior", vmpfc: "medial-left", acc: "medial-left", v1: "medial-left", va: "posterior", vvs: "inferior", pga: "left", s2a: "superior", m1: "left", s1: "left" };
const PX_MM2 = 0.1526;
/** The standard view that shows a structure best (pixels counted off screen by tools/atlas3/views.py), and how much of
 * its surface that view shows. One side is enough: the left copy (or the midline structure) is measured. */
function bestView(ids: number[], byId: Map<number, Label3>): { view: View3; share: number } {
  const ls = ids.map((id) => byId.get(id)).filter((l): l is Label3 => !!l);
  const half = ls.some((l) => l.side === "L") ? ls.filter((l) => l.side !== "R") : ls;
  const area = half.reduce((s, l) => s + l.area, 0);
  let best: View3 = "left", px = -1;
  for (const v of ["left", "right", "anterior", "posterior", "superior", "inferior", "medial-left", "medial-right"] as View3[]) {
    const n = half.reduce((s, l) => s + (l.vis[v] ?? 0), 0);
    if (n > px) {
      px = n;
      best = v;
    }
  }
  return { view: best, share: area > 0 ? (px * PX_MM2) / area : 0 };
}
/** Deep: no standard view shows a fair part of it (thalamus, putamen, insula behind the opercula, hippocampus). */
function isDeep(ids: number[], byId: Map<number, Label3>): boolean {
  return ids.length > 0 && bestView(ids, byId).share < DEEP_SHARE;
}

function sideText(it: CatItem, byId: Map<number, Label3>, index: Index3): string {
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
