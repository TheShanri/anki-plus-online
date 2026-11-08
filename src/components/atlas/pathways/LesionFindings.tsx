"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CORD, groupHits, siteLabel, type CoursePathway, type LesionResult, type Side } from "@/lib/atlas/pathways";
import type { SceneColors } from "./PathwayScene";
import { Collapsible } from "./controls";
import { DeficitIcons, DeficitLegend } from "./deficits";
import { BodySilhouette, regionsFromText, type Region } from "./BodySilhouette";
import { FieldDiagram, fieldDefect, fieldPalette } from "./visualField";
import { Supplementary } from "@/components/supplementary/Supplementary";

/** Sites whose deficit wording uses a named syndrome or signs the slides do not teach: shown behind the Supplementary gate. */
const BEYOND_SLIDES = new Set(["cord-hemi", "cord-central", "med-lateral", "med-medial", "mid-ped", "pons-basis-bi", "bg-sn", "bg-stn", "bg-str", "cb-hemi"]);

const shortName = (n: string) => n.replace(/\s*\(.*\)/, "");

interface Row {
  key: string;
  sides: Side[];
  pathway: string | null;
  name: string;
  loss: string;
  region: string;
  regions: Region[];
  beyond?: boolean;
}

const Badge = ({ s, colors }: { s: Side; colors: SceneColors }) => (
  <span
    className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10.5px] font-bold"
    style={{ background: s === "L" ? colors.left : colors.right, color: "var(--panel-solid, #000)" }}
  >
    {s}
  </span>
);

/** The deficits as one compact list: a body silhouette shaded per row, the side badge, an icon per kind of loss, the
 *  pathway, the loss and the body area. A side with no loss collapses into one short line. */
export function LesionFindings({
  showing,
  mode,
  colors,
  courseMap,
  focusPath,
  setFocusPath,
  zoom,
  setZoom,
}: {
  showing: LesionResult;
  mode: "lab" | "case";
  colors: SceneColors;
  courseMap: Map<string, CoursePathway>;
  focusPath: string | null;
  setFocusPath: (p: string | null) => void;
  zoom: "near" | "wide";
  setZoom: (z: "near" | "wide") => void;
}) {
  const palette = useMemo(() => fieldPalette(colors.left, colors.right), [colors.left, colors.right]);
  const defect = fieldDefect(showing.site.id, showing.side === "both" ? "L" : showing.side);
  const groups = groupHits(showing.hits);
  const beyond = BEYOND_SLIDES.has(showing.site.id);
  const rows: Row[] = [
    ...groups.map((g) => {
      const h = g.hits[0];
      const sides = [...new Set(g.hits.flatMap((x) => x.bodySides))].sort() as Side[];
      return { key: g.pathway, sides, pathway: g.pathway, name: shortName(g.name), loss: h.loss.replace(/\s*\([^)]*\)/g, ""), region: h.region, regions: regionsFromText(h.region) };
    }),
    ...showing.effects.map((e, i) => ({ key: `e${i}`, sides: [...e.sides].sort() as Side[], pathway: null, name: "Also", loss: e.text, region: "", regions: [] as Region[], beyond })),
  ];
  const sideShade = (r: Row) => ({ L: r.sides.includes("L") ? r.regions : [], R: r.sides.includes("R") ? r.regions : [] });
  const allShade: Record<Side, Region[]> = { L: [], R: [] };
  for (const r of rows) for (const s of r.sides) allShade[s] = [...new Set([...allShade[s], ...r.regions])] as Region[];
  const count = (s: Side) => rows.filter((r) => r.sides.includes(s)).length;
  const openRow = rows.find((r) => r.pathway && r.pathway === focusPath);
  const openHit = openRow ? groups.find((g) => g.pathway === openRow.pathway)?.hits[0] : undefined;
  const cp = openRow?.pathway ? courseMap.get(openRow.pathway) : undefined;

  return (
    <div className="grid gap-3">
      {mode === "lab" && (
        <div>
          <p className="eyebrow">Lesion</p>
          <h2 className="font-display text-xl leading-tight">{siteLabel(showing.site, showing.side, showing.cord)}</h2>
        </div>
      )}
      {mode === "case" && <p className="label">Explanation</p>}

      <div className="flex items-center gap-3 rounded-sm border border-panel-border p-2">
        <BodySilhouette shade={allShade} colors={{ L: colors.left, R: colors.right }} size={118} />
        <div className="grid min-w-0 gap-1.5 text-sm">
          {(["R", "L"] as Side[]).map((s) => (
            <p key={s} className="flex items-center gap-2">
              <Badge s={s} colors={colors} />
              <span className={count(s) ? "text-text" : "text-text-dim"}>
                {s === "L" ? "Left" : "Right"} body: {count(s) ? `${count(s)} ${count(s) > 1 ? "losses" : "loss"}` : "nothing lost"}
              </span>
            </p>
          ))}
          {showing.cord && <p className="text-xs text-text-dim">Cord level {CORD[showing.cord].label}: deficits are below it.</p>}
        </div>
      </div>

      {defect && (
        <div className="rounded-sm border border-panel-border p-2">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <DeficitIcons text="vision" size={17} />
            {defect.name}
          </p>
          <div className="my-1 flex justify-center">
            <FieldDiagram palette={palette} lost={defect.lost} sparing={defect.sparing} width={250} />
          </div>
          <p className="text-xs text-text-dim">{defect.detail}</p>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-text-dim">This lesion does not cut a traced pathway.</p>
      ) : (
        <ul className="grid gap-1.5" aria-label="Deficits">
          {rows.map((r) => {
            const open = r.pathway === focusPath;
            const inner = (
              <>
                <BodySilhouette shade={sideShade(r)} colors={{ L: colors.left, R: colors.right }} size={46} letters={false} />
                <span className="grid min-w-0 gap-0.5">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {r.sides.map((s) => (
                      <Badge key={s} s={s} colors={colors} />
                    ))}
                    <DeficitIcons text={r.loss} />
                    <span className="text-sm font-semibold">{r.name}</span>
                  </span>
                  {r.beyond ? (
                    <Supplementary section="lesion-lab" title="Named syndrome" className="text-sm">
                      {r.loss}
                    </Supplementary>
                  ) : (
                    <span className="text-sm">{r.pathway ? `loss of ${r.loss}` : r.loss}</span>
                  )}
                  {r.region && <span className="text-xs text-text-faint">{r.region}</span>}
                </span>
              </>
            );
            return (
              <li key={r.key}>
                {r.pathway ? (
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setFocusPath(open ? null : r.pathway)}
                    className="grid w-full grid-cols-[auto_1fr] items-center gap-2.5 rounded-sm border px-2 py-1.5 text-left hover:bg-bg-3"
                    style={{ borderColor: open ? colors.bad : "var(--panel-border)" }}
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="grid grid-cols-[auto_1fr] items-center gap-2.5 rounded-sm border border-panel-border px-2 py-1.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {openRow && openHit && (
        <div className="rounded-sm border px-3 py-2 text-sm" style={{ borderColor: colors.bad }}>
          <p>
            <span className="text-text-dim">Cut:</span> {openHit.stretch.label}
          </p>
          <p className="text-text-dim">{openHit.why}</p>
          {openHit.lag && (
            <Supplementary section="lesion-lab" title="Segment detail" className="text-xs">
              Pain and temperature loss begins one or two segments below the lesion (the fibres cross before they ascend).
            </Supplementary>
          )}
          {openHit.note && <p className="text-xs text-text-faint">{openHit.note}</p>}
          {cp && (
            <p className="mt-1 text-xs text-text-dim">
              Course rule: below the crossing, {cp.lesion.below_decussation}; above, {cp.lesion.above}. Crossing: {cp.decussation}.
            </p>
          )}
          <Link className="btn mt-2 no-underline" href={`/atlas/pathways?p=${openRow.pathway}&side=${openHit.bodySides[0] ?? "R"}`}>
            Trace this pathway
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn" aria-pressed={zoom === "wide"} onClick={() => setZoom(zoom === "wide" ? "near" : "wide")}>
          {zoom === "wide" ? "Frame the lesion" : "Frame all cut pathways"}
        </button>
      </div>
      <Collapsible title="Spared pathways" defaultOpen={false}>
        <p className="text-sm text-text-dim">{showing.spared.join("; ") || "None listed."}</p>
      </Collapsible>
      <Collapsible title="Icon key" defaultOpen={false}>
        <DeficitLegend />
      </Collapsible>
    </div>
  );
}
