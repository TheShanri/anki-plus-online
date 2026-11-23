"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Crosshair, Focus, Maximize2, Minimize2, Stethoscope } from "lucide-react";
import type * as THREE from "three";
import { loadAtlasIndex } from "@/lib/atlas";
import {
  CASES,
  CORD,
  PATHWAY_MAP,
  SITES,
  SITE_BY_ID,
  generatedFindings,
  groupHits,
  physSide,
  predictLesion,
  siteLabel,
  type CaseDef,
  type ClinicalCard,
  type CordLevel,
  type CoursePathway,
  type LesionResult,
  type Side,
  type Site,
  type WP,
} from "@/lib/atlas/pathways";
import { PathwayViewer } from "./PathwayViewer";
import { VIEWS, type SceneColors, type SceneLayer, type SceneMark, type SceneTube, type View } from "./PathwayScene";
import { useSceneColors } from "./sceneTheme";
import { BodyIcon, IconButton, Segmented } from "./controls";
import { LesionFindings } from "./LesionFindings";
import { useFullscreen } from "./useFullscreen";
import { trackAtlas } from "@/lib/atlas/progress";
import { AtlasLoader, stagesFrom } from "@/components/atlas/ui/AtlasLoader";
import { loadV3, type V3Data } from "./v3/types";

/* The cut tracts are drawn with the pathway tracer's v3 fibres (the routes built and validated against the real anatomy in
 * tools/pathways/v3) instead of the old schematic waypoint tubes (owner audit 2026-11-22: "move the lesion lab to the v3
 * renderer"). A hit stretch is matched to its v3 beat by caption; a pathway without v3 data falls back to the old tube. */
/** The v3 file's body part for a lesion: the lower-limb fibres for a thoracic / lumbar cord lesion, else the hand's. */
function v3Limb(slug: string, cord?: CordLevel): string | null {
  if (slug === "dsct") return "foot";
  if (slug === "stretch-reflex") return "leg";
  if (slug === "withdrawal-reflex") return "hand";
  if (slug === "dcml" || slug === "alst") return cord === "T" || cord === "L" ? "foot" : "hand";
  return null;
}
const capOf = (c: string) => c.replace(/ · crosses the midline$/, "");
/** v3 fibre points as absolute world waypoints ("@", rel i on the left body: x, y, z as given), thinned to at most ~80. */
function fibreWPs(pts: number[]): WP[] {
  const n = pts.length / 3;
  const step = Math.max(1, Math.ceil(n / 80));
  const out: WP[] = [];
  for (let i = 0; i < n; i += step) out.push(["@", "i", pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]] as unknown as WP);
  if ((n - 1) % step) out.push(["@", "i", pts[(n - 1) * 3], pts[(n - 1) * 3 + 1], pts[(n - 1) * 3 + 2]] as unknown as WP);
  return out;
}
/** The v3 fibres of one beat-model path (matched by caption) on one body side. */
function v3Fibres(d: V3Data | undefined, label: string, side: Side): number[][] | null {
  if (!d) return null;
  const b = d.beats.find((x) => x.kind === "path" && capOf(x.caption) === label);
  const f = b?.[side]?.f;
  return f?.length ? f.map((x) => x.pts) : null;
}

/* the white-matter envelope hides the tracts inside it, so it is listed but not pickable in 3D */
const NOT_PICKABLE = new Set(["white-matter-of-spinal-cord", "central-structures-of-spinal-cord"]);
const PICK_IDS = [...new Set(SITES.flatMap((s) => s.ids))].filter((id) => !NOT_PICKABLE.has(id));
/* sites whose written findings would give the answer away or read oddly without a course vignette */
const NO_CASE = new Set(["med-dcn", "med-arcuate", "med-pyrdec", "pons-trig", "cord-root", "cord-central"]);
const CORD_Y0 = 1.055;
const CORD_Y1 = 1.545;
const GROUP_ORDER = ["Spinal cord", "Medulla", "Pons", "Midbrain", "Forebrain", "Cortex", "Visual pathway", "Cerebellum", "Cranial nerves", "Basal ganglia", "Limbic"];

function sitePos(site: Site, cord?: CordLevel): WP {
  const p = [...site.pos] as WP;
  if (site.cord && cord) p[2] = CORD[cord].t;
  return p;
}

function nearestCord(site: Site, y: number): CordLevel {
  const t = Math.min(1, Math.max(0, (y - CORD_Y0) / (CORD_Y1 - CORD_Y0)));
  const cands = (site.cord ?? ["T"]) as CordLevel[];
  return cands.reduce((best, c) => (Math.abs(CORD[c].t - t) < Math.abs(CORD[best].t - t) ? c : best), cands[0]);
}

interface CaseItem {
  key: string;
  vignette: string[];
  answerText: string | null;
  def: CaseDef;
  card: boolean;
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildCases(clinical: ClinicalCard[], courseMap: Map<string, CoursePathway>): CaseItem[] {
  const out: CaseItem[] = [];
  const covered = new Set<string>();
  for (const c of clinical) {
    const def = CASES[c.slug];
    if (!def) continue;
    out.push({ key: c.slug, vignette: [c.vignette], answerText: c.answer, def, card: true });
    covered.add(def.site);
  }
  for (const s of SITES) {
    if (covered.has(s.id) || NO_CASE.has(s.id)) continue;
    const side: Side = hashStr(s.id) % 2 ? "L" : "R";
    const cord = s.cord ? (s.cord.includes("T") ? "T" : s.cord[0]) : undefined;
    const r = predictLesion({ siteId: s.id, side, cord }, courseMap);
    if (!r || r.hits.length + r.effects.length === 0) continue;
    const lines = generatedFindings(r);
    if (!lines.length) continue;
    out.push({ key: `gen-${s.id}`, vignette: lines, answerText: null, def: { site: s.id, side: s.sided ? side : undefined, cord }, card: false });
  }
  return out;
}

function shuffle<T>(a: T[], seed: number): T[] {
  const r = [...a];
  let x = seed || 1;
  for (let i = r.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function buildLabScene(o: {
  result: LesionResult | null;
  guess: { site: Site; side: Side; cord?: CordLevel } | null;
  focusPath: string | null;
  zoom: "near" | "wide";
  colors: SceneColors;
  v3: Record<string, V3Data>;
}) {
  const { result, guess, focusPath, zoom, colors, v3 } = o;
  const layers: SceneLayer[] = [
    // faint enough that the stacked structures do not haze over the lesion (hover still lights each one)
    { key: "ghost", ids: PICK_IDS, side: "both", color: colors.dim, opacity: 0.075, pickable: true },
  ];
  const tubes: SceneTube[] = [];
  const marks: SceneMark[] = [];
  const fit: { wp: WP; body: Side }[] = [];
  const lesionAt = (site: Site, side: Side, cord?: CordLevel) => ({ wp: sitePos(site, cord), body: side });

  if (result) {
    const lesionSide: Side = result.side === "both" ? "L" : result.side;
    const lp = lesionAt(result.site, lesionSide, result.cord);
    // the damaged structure itself
    if (result.site.ids.length) {
      const sides: (Side | "both")[] = result.site.sided ? [lesionSide] : ["both"];
      sides.forEach((s) => layers.push({ key: "lesion-site", ids: result.site.ids, side: s, color: colors.bad, opacity: 0.85, clipNear: levelClip(result.site, "lesion") }));
    }
    marks.push({ key: "lesion", p: lp.wp, body: lp.body, kind: "lesion", text: "Lesion", color: colors.bad });
    fit.push(lp);
    fit.push({ wp: [lp.wp[0], lp.wp[1], lp.wp[2] as number, 0, 0.025, 0.02] as WP, body: lp.body }, { wp: [lp.wp[0], lp.wp[1], lp.wp[2] as number, 0, -0.025, -0.02] as WP, body: lp.body });
    const groups = groupHits(result.hits);
    const shownGroups = focusPath ? groups.filter((g) => g.pathway === focusPath) : groups;
    for (const g of shownGroups) {
      if (focusPath) {
        // the rest of the pathway, faint, so the cut is seen in context
        const body: Side = g.hits[0].bodySides[0];
        const d = v3[g.pathway];
        PATHWAY_MAP[g.pathway].neurons.forEach((n, ni) =>
          n.stretches.forEach((st) => {
            if (st.noLesion || !st.path || st.path.length < 2) return;
            if (g.hits.some((h) => h.stretch === st)) return;
            const fs = v3Fibres(d, st.label, body);
            if (fs) fs.forEach((f, fi) => tubes.push({ key: `ctx:${g.pathway}:${ni}:${st.k}:${fi}`, pts: fibreWPs(f), body: "L", opacity: 0.55, reveal: 1, width: 0.7 }));
            else tubes.push({ key: `ctx:${g.pathway}:${ni}:${st.k}`, pts: st.path, body, opacity: 0.55, reveal: 1, width: 0.7 });
          }),
        );
      }
      for (const h of g.hits) {
        const st = h.stretch;
        h.bodySides.forEach((bs) => {
          const fs = v3Fibres(v3[g.pathway], st.label, bs);
          if (fs)
            fs.forEach((f, fi) => {
              const wps = fibreWPs(f);
              tubes.push({ key: `cut:${g.pathway}:${st.k}:${bs}:${fi}`, pts: wps, body: "L", color: colors.bad, opacity: 0.95, reveal: 1, pulse: !!focusPath, width: 1.15 });
              if (zoom === "wide" || focusPath) wps.filter((_, i) => i % 8 === 0).forEach((w) => fit.push({ wp: w, body: "L" }));
            });
          else {
            if (st.path && st.path.length > 1) tubes.push({ key: `cut:${g.pathway}:${st.k}:${bs}`, pts: st.path, body: bs, color: colors.bad, opacity: 0.95, reveal: 1, pulse: !!focusPath, width: 1.15 });
            if (zoom === "wide" || focusPath) st.path?.forEach((w) => fit.push({ wp: w, body: bs }));
          }
        });
        if (st.ids?.length) {
          const ps = h.physSides;
          const sideForLayer: Side | "both" = ps.length === 2 ? "both" : (physSide(st.phys, h.bodySides[0]) ?? "both");
          // the whole stretch the cut interrupts, fainter than the lesion itself (which is lit only at its level)
          layers.push({ key: `cutids:${g.pathway}:${st.k}`, ids: st.ids, side: sideForLayer, color: colors.bad, opacity: 0.18 });
        }
      }
    }
  } else if (guess) {
    const lp = lesionAt(guess.site, guess.side, guess.cord);
    marks.push({ key: "guess", p: lp.wp, body: lp.body, kind: "lesion", text: "Your lesion", color: colors.hi });
    fit.push(lp);
    fit.push({ wp: [lp.wp[0], lp.wp[1], lp.wp[2] as number, 0, 0.03, 0.02] as WP, body: lp.body }, { wp: [lp.wp[0], lp.wp[1], lp.wp[2] as number, 0, -0.03, -0.02] as WP, body: lp.body });
    if (guess.site.ids.length) layers.push({ key: "guess-site", ids: guess.site.ids, side: guess.site.sided ? guess.side : "both", color: colors.hi, opacity: 0.85, clipNear: levelClip(guess.site, "guess") });
  }
  // nothing placed yet (a new case): the whole neuraxis, so a cord case can be answered without hunting for the cord
  if (!fit.length) for (const [s, c] of OVERVIEW) fit.push({ wp: sitePos(s, c), body: "L" });
  return { layers, tubes, marks, fit };
}

/** A lesion of a long tract or nucleus column (cord, brainstem) lights only its stretch at the lesion's level. */
const LEVEL_CLIP: Record<string, number> = { "Spinal cord": 0.012, Medulla: 0.006, Pons: 0.007, Midbrain: 0.006 };
function levelClip(site: Site, mark: string) {
  const half = LEVEL_CLIP[site.group];
  return half ? { mark, half } : undefined;
}
/** Framing for "nothing placed": the top of the cortex down to the lumbar cord. */
const OVERVIEW: [Site, CordLevel | undefined][] = (() => {
  const top = SITES.find((s) => s.group === "Cortex");
  const low = SITES.find((s) => s.cord?.includes("L"));
  const out: [Site, CordLevel | undefined][] = [];
  if (top) out.push([top, undefined]);
  if (low) out.push([low, "L"]);
  return out;
})();

type Grade = { site: boolean; side: boolean; close: boolean };

export function LesionLab({
  courses,
  clinical,
  initial,
}: {
  courses: CoursePathway[];
  clinical: ClinicalCard[];
  initial: { site?: string; side?: string; cord?: string; mode?: string };
}) {
  const courseMap = useMemo(() => new Map(courses.map((c) => [c.slug, c])), [courses]);
  const colors = useSceneColors();
  const initSite = initial.site && SITE_BY_ID.has(initial.site) ? initial.site : "pons-ml";
  const [mode, setMode] = useState<"lab" | "case">(initial.mode === "case" ? "case" : "lab");
  const [siteId, setSiteId] = useState(initSite);
  const [side, setSide] = useState<Side>(initial.side === "R" ? "R" : "L");
  const [cord, setCord] = useState<CordLevel | undefined>(initial.cord === "C" || initial.cord === "T" || initial.cord === "L" ? initial.cord : undefined);
  const [search, setSearch] = useState("");
  const [hi, setHi] = useState(0);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [zoom, setZoom] = useState<"near" | "wide">("near");
  const [view, setView] = useState<View>("anterior");
  const [frameNonce, setFrameNonce] = useState(0);
  const { attach: attachFs, fs: isFs, toggle: toggleFs, can: canFs } = useFullscreen(() => setFrameNonce((x) => x + 1));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // case mode
  const pool = useMemo(() => buildCases(clinical, courseMap), [clinical, courseMap]);
  // a fixed seed on the server and at hydration (Date.now() there would render a different first case: React error #418); a fresh one when the student starts a case run
  const [seed, setSeed] = useState(1);
  // the course's own vignettes first, then the generated ones
  const order = useMemo(() => {
    const idx = pool.map((_, i) => i);
    return [...shuffle(idx.filter((i) => pool[i].card), seed), ...shuffle(idx.filter((i) => !pool[i].card), seed + 1)];
  }, [pool, seed]);
  const [caseNo, setCaseNo] = useState(0);
  // a case starts with no lesion placed (it used to inherit the lab's lesion, so a case could be "checked" untouched)
  const [placed, setPlaced] = useState(false);
  const [revealed, setRevealed] = useState<Grade | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const item = order.length ? pool[order[caseNo % order.length]] : null;

  useEffect(() => {
    let alive = true;
    loadAtlasIndex()
      .then((i) => alive && setNames(Object.fromEntries(Object.values(i.structures).map((e) => [e.id, e.name]))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const site = SITE_BY_ID.get(siteId)!;
  const effCord: CordLevel | undefined = site.cord ? (cord && site.cord.includes(cord) ? cord : site.cord.includes("T") ? "T" : site.cord[0]) : undefined;

  // url state
  useEffect(() => {
    const u = new URL(window.location.href);
    if (mode === "case") {
      u.searchParams.set("mode", "case");
      u.searchParams.delete("site");
    } else {
      u.searchParams.delete("mode");
      u.searchParams.set("site", siteId);
      u.searchParams.set("side", side);
      if (effCord) u.searchParams.set("cord", effCord);
      else u.searchParams.delete("cord");
    }
    window.history.replaceState(null, "", u);
  }, [mode, siteId, side, effCord]);

  const lab = predictLesion({ siteId, side, cord: effCord }, courseMap);
  const truthSite = item ? SITE_BY_ID.get(item.def.site) : undefined;
  const truth = item && truthSite ? predictLesion({ siteId: truthSite.id, side: item.def.side ?? "L", cord: item.def.cord }, courseMap) : null;

  const showing: LesionResult | null = mode === "lab" ? lab : revealed ? truth : null;
  // the v3 data of every pathway the shown lesion cuts (fetched once each; the old tubes stand in until it arrives)
  const [v3, setV3] = useState<Record<string, V3Data>>({});
  const v3Want = useMemo(() => (showing ? [...new Set(showing.hits.map((h) => h.pathway))].map((s) => ({ s, limb: v3Limb(s, showing.cord) })) : []), [showing]);
  const v3WantKey = v3Want.map((w) => `${w.s}:${w.limb}`).join(",");
  useEffect(() => {
    let alive = true;
    for (const { s, limb } of v3Want) {
      const k = `${s}:${limb}`;
      loadV3(s, limb)
        .then((d) => alive && setV3((m) => (m[k] === d ? m : { ...m, [k]: d })))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v3WantKey]);
  const v3ByPath = useMemo(() => Object.fromEntries(v3Want.flatMap(({ s, limb }) => (v3[`${s}:${limb}`] ? [[s, v3[`${s}:${limb}`]]] : []))), [v3Want, v3]);
  const guess = { site, side, cord: effCord };
  const sceneIn = buildLabScene({ result: showing, guess: mode === "case" && !revealed && placed ? guess : null, focusPath: mode === "lab" || revealed ? focusPath : null, zoom, colors, v3: v3ByPath });
  const scene = mode === "case" && revealed && truth && guessMarks(sceneIn, guess, colors);

  const check = () => {
    if (!item || revealed || !placed) return;
    const want = SITE_BY_ID.get(item.def.site)!;
    const siteOk = siteId === want.id;
    const sideOk = !want.sided || !item.def.side ? true : side === item.def.side;
    const close = !siteOk && site.zones.some((z) => want.zones.includes(z));
    setRevealed({ site: siteOk, side: sideOk, close });
    trackAtlas({ type: "lesion_case", caseId: item.key, correct: siteOk && sideOk });
    setScore((s) => ({ right: s.right + (siteOk && sideOk ? 1 : 0), total: s.total + 1 }));
    setFocusPath(null);
    setFrameNonce((n) => n + 1);
  };

  const next = () => {
    setCaseNo((n) => n + 1);
    setRevealed(null);
    setPlaced(false);
    setFocusPath(null);
    setSearch("");
    setFrameNonce((n) => n + 1);
  };

  const pickSite = (id: string, keepSide?: Side, y?: number) => {
    const s = SITE_BY_ID.get(id)!;
    setSiteId(id);
    setPlaced(true);
    if (keepSide) setSide(keepSide);
    if (s.cord) setCord(y !== undefined ? nearestCord(s, y) : (c) => (c && s.cord!.includes(c) ? c : s.cord!.includes("T") ? "T" : s.cord![0]));
    setFocusPath(null);
    setSearch("");
    setFrameNonce((n) => n + 1);
  };

  const onPick = (meshId: string, s: Side, point: THREE.Vector3) => {
      if (mode === "case" && revealed) return;
      const cands = SITES.filter((x) => x.ids.includes(meshId));
      if (!cands.length) return;
      const i = cands.findIndex((x) => x.id === siteId);
      const chosen = cands[(i + 1) % cands.length] ?? cands[0];
      pickSite(chosen.id, chosen.sided ? s : undefined, point.y);
  };

  // searchable site list
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = SITES.filter((s) => !q || `${s.name} ${s.group}`.toLowerCase().includes(q) || q.split(/\s+/).every((w) => `${s.name} ${s.group}`.toLowerCase().includes(w)));
    return list.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  }, [search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.tagName === "SELECT" || t?.isContentEditable;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter" && mode === "case" && !typing) {
        e.preventDefault();
        if (revealed) next();
        else check();
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "l" || e.key === "L") setSide("L");
      else if (e.key === "r" || e.key === "R") setSide("R");
      else if (e.key === "v" || e.key === "V") setView((v) => VIEWS[(VIEWS.findIndex((x) => x.id === v) + 1) % VIEWS.length].id);
      else if (e.key === "f" || e.key === "F") setFrameNonce((x) => x + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, revealed, siteId, side, site, item]);

  const gradeText = revealed
    ? revealed.site && revealed.side
      ? "Correct."
      : revealed.site
        ? "Right structure, wrong side."
        : revealed.close
          ? "Close: your lesion overlaps the right one, but it is a different site."
          : revealed.side
            ? "Right side, different structure."
            : "Not this one."
    : null;
  const hoverName = hoverId ? names[hoverId] : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 content-start gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Mode"
            value={mode}
            onChange={(m) => {
              setMode(m);
              if (m === "case") setSeed((Date.now() >>> 8) | 1);
              setRevealed(null);
              setPlaced(false);
              setFocusPath(null);
              setFrameNonce((n) => n + 1);
            }}
            options={[
              { id: "lab", label: "Place a lesion", tip: "Place a lesion and see what is lost", icon: <Crosshair size={15} /> },
              { id: "case", label: "Case: find it", tip: "Read a case, then find the lesion", icon: <Stethoscope size={15} /> },
            ]}
          />
          {mode === "case" && (
            <span className="text-sm text-text-dim">
              Score {score.right} of {score.total}
            </span>
          )}
        </div>

        <div ref={attachFs} className="relative overflow-hidden rounded-card border border-panel-border bg-bg-2 h-[64dvh] min-h-[380px] lg:h-[calc(100dvh-250px)] lg:min-h-[460px] [&:fullscreen]:!h-screen [&:fullscreen]:!min-h-0 [&:fullscreen]:!w-screen [&:fullscreen]:rounded-none [&:fullscreen]:border-0">
          <PathwayViewer
            layers={(scene || sceneIn).layers}
            tubes={(scene || sceneIn).tubes}
            marks={(scene || sceneIn).marks}
            fit={(scene || sceneIn).fit}
            view={view}
            frameNonce={frameNonce}
            colors={colors}
            tags
            hoverId={hoverId}
            onHover={setHoverId}
            onPick={onPick}
            onReady={setReady}
          />
          {!ready && <AtlasLoader label="Loading the lesion map" stages={stagesFrom([["map", "Loading the lesion map", false, undefined]])} />}
          <div data-label-obstacle className="pointer-events-none absolute bottom-2 left-2 flex flex-wrap gap-2 text-xs">
            <span className="rounded-sm bg-panel-solid/85 px-2 py-1" style={{ color: colors.bad }}>■ Cut / lesion</span>
            <span className="rounded-sm bg-panel-solid/85 px-2 py-1 text-text-dim">{hoverName ? `${hoverName} (click to place)` : "Hover a structure, click to place the lesion"}</span>
          </div>
          <div data-label-obstacle className="absolute right-2 top-2 flex items-center gap-1.5">
            <Segmented label="View" value={view} onChange={setView} options={VIEWS.map((v) => ({ id: v.id, label: v.label, tip: `${v.label} view`, keys: "V" }))} />
            <IconButton label="Re-frame" keys="F" icon={<Focus size={16} />} onClick={() => setFrameNonce((x) => x + 1)} tip="bottom" />
            {canFs && <IconButton label={isFs ? "Leave full screen" : "Full screen"} icon={isFs ? <Minimize2 size={16} /> : <Maximize2 size={16} />} pressed={isFs} onClick={toggleFs} tip="bottom" />}
          </div>
        </div>

        <div className="grid gap-2 rounded-card border border-panel-border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="lesion-search">Find a lesion site</label>
            <input
              id="lesion-search"
              ref={searchRef}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setHi(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setHi((h) => Math.min(matches.length - 1, h + 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setHi((h) => Math.max(0, h - 1));
                } else if (e.key === "Enter" && matches[hi]) {
                  e.preventDefault();
                  pickSite(matches[hi].id);
                  (e.target as HTMLInputElement).blur();
                } else if (e.key === "Escape") {
                  setSearch("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Search sites: medial lemniscus, dorsal column…  ( / )"
              className="min-w-0 flex-1 rounded-sm border border-panel-border bg-panel-solid px-2 py-1.5 text-sm text-text"
              autoComplete="off"
              spellCheck={false}
            />
            <Segmented
              label="Side of the lesion"
              value={site.sided ? side : "L"}
              onChange={(v) => site.sided && setSide(v)}
              options={[
                { id: "L", label: "Left", tip: "Lesion on the left", keys: "L", icon: <BodyIcon fill="L" size={16} />, color: site.sided ? colors.left : undefined },
                { id: "R", label: "Right", tip: "Lesion on the right", keys: "R", icon: <BodyIcon fill="R" size={16} />, color: site.sided ? colors.right : undefined },
              ]}
            />
            {site.cord && (
              <Segmented label="Spinal level" value={effCord ?? site.cord[0]} onChange={(c) => setCord(c)} options={site.cord.map((c) => ({ id: c, label: CORD[c].label, tip: `Spinal level ${CORD[c].label}` }))} />
            )}
          </div>
          <div className="max-h-44 overflow-auto rounded-sm border border-panel-border" role="listbox" aria-label="Lesion sites">
            {matches.length === 0 && <p className="p-2 text-sm text-text-dim">No site matches.</p>}
            {matches.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === siteId}
                onClick={() => pickSite(s.id)}
                className={`flex w-full items-baseline gap-2 px-2 py-1 text-left text-sm ${s.id === siteId ? "bg-accent/15 text-text" : i === hi && search ? "bg-bg-3" : "text-text-dim hover:bg-bg-3"}`}
              >
                <span className="w-24 flex-none font-mono text-[10px] uppercase tracking-wider text-text-faint">{s.group}</span>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <p className="help-line flex flex-wrap items-center gap-x-4 gap-y-1 pb-12 text-xs text-text-dim sm:pb-0 sm:pl-36 [&_.kbd]:mr-1 [&_.kbd]:rounded [&_.kbd]:border [&_.kbd]:border-panel-border [&_.kbd]:bg-bg-3 [&_.kbd]:px-1.5 [&_.kbd]:py-px [&_.kbd]:font-mono [&_.kbd]:text-[11px] [&_.kbd]:text-text">
            <span><span className="kbd">/</span> search</span>
            <span><span className="kbd">L</span> <span className="kbd">R</span> side</span>
            {mode === "case" && <span><span className="kbd">Enter</span> {revealed ? "next case" : "check"}</span>}
            <span><span className="kbd">V</span> view</span>
            <span>click a structure in 3D to place the lesion</span>
          </p>
        </div>
      </div>

      <aside className="panel grid min-w-0 content-start gap-3" aria-live="polite">
        {mode === "case" && item && (
          <div className="grid gap-3">
            <p className="eyebrow">Case {score.total + (revealed ? 0 : 1)}</p>
            <ul className="grid gap-1 font-display text-lg">
              {item.vignette.map((v, i) => (
                <li key={i}>{v}</li>
              ))}
            </ul>
            <p className="text-sm text-text-dim">Where is the lesion? Place it on the left (a site, a side and a level for the cord), then check.</p>
            {!revealed ? (
              <div className="grid gap-2">
                <p className="rounded-sm border border-panel-border px-3 py-2 text-sm">
                  Your lesion: {placed ? <strong>{siteLabel(site, site.sided ? side : "both", effCord)}</strong> : <span className="text-text-dim">none yet: click a structure or pick a site below</span>}
                </p>
                <button type="button" className="btn btn-primary" onClick={check} disabled={!placed} style={{ justifySelf: "start" }}>
                  Check the lesion
                </button>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: revealed.site && revealed.side ? "var(--good)" : "var(--again)" }}>
                  <strong>{gradeText}</strong> You placed: {siteLabel(site, site.sided ? side : "both", effCord)}.
                </p>
                {truth && (
                  <p className="text-sm">
                    <span className="label">The lesion</span> {siteLabel(truth.site, truth.side, truth.cord)}
                    {!item.def.side && truth.site.sided ? " (the case does not say which side; shown on the left)" : ""}
                  </p>
                )}
                {item.answerText && (
                  <p className="text-sm">
                    <span className="label">Course answer</span> {item.answerText}
                  </p>
                )}
                <button type="button" className="btn btn-primary" onClick={next} style={{ justifySelf: "start" }}>
                  Next case <span className="kbd ml-1">Enter</span>
                </button>
              </div>
            )}
          </div>
        )}

        {showing && <LesionFindings showing={showing} mode={mode} colors={colors} courseMap={courseMap} focusPath={focusPath} setFocusPath={setFocusPath} zoom={zoom} setZoom={setZoom} />}
        {mode === "case" && !revealed && <p className="text-sm text-text-dim">The explanation appears after you check the lesion.</p>}
      </aside>
    </div>
  );
}

/** After a case is checked: show the student's own guess next to the truth. */
function guessMarks(base: ReturnType<typeof buildLabScene>, guess: { site: Site; side: Side; cord?: CordLevel }, colors: SceneColors) {
  const lp = sitePos(guess.site, guess.cord);
  return {
    ...base,
    marks: [...base.marks, { key: "guess", p: lp, body: guess.side, kind: "syn" as const, text: "Your guess", color: colors.hi }],
  };
}
