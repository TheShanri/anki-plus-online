"use client";

import { useMemo } from "react";
import { usePlate } from "@/components/atlas/brainstem/plate/usePlate";
import { PlateArt } from "@/components/atlas/brainstem/plate/PlateArt";
import { STRUCTURES } from "@/components/atlas/brainstem/data";
import type { LesionResult } from "@/lib/atlas/pathways";
import "@/components/atlas/brainstem/brainstem.css";

/* The lesion in its own cross-section (owner 2026-11-24: "clearer anatomy at the lesion"): the course's brainstem plate
 * of the lesion's level (or the upper cervical cord's), the damaged structures lit on the lesion's side, their
 * neighbours named on hover. Viewed from above with dorsal up, so the patient's left is on the viewer's left. */

type Spec = { level: string; lit: string[]; both?: boolean };
const CORD_ALL = ["fasciculus-gracilis", "fasciculus-cuneatus", "lateral-corticospinal-tract", "anterolateral-spinothalamic-tract", "dorsal-spinocerebellar-tract", "anterior-corticospinal-tract", "dorsal-horn", "substantia-gelatinosa", "intermediate-zone", "ventral-horn"];
const SITE_PLATE: Record<string, Spec> = {
  "cord-dc": { level: "cervicomedullary", lit: ["fasciculus-gracilis", "fasciculus-cuneatus"] },
  "cord-alst": { level: "cervicomedullary", lit: ["anterolateral-spinothalamic-tract"] },
  "cord-lcst": { level: "cervicomedullary", lit: ["lateral-corticospinal-tract"] },
  "cord-dsct": { level: "cervicomedullary", lit: ["dorsal-spinocerebellar-tract"] },
  "cord-hemi": { level: "cervicomedullary", lit: CORD_ALL },
  "cord-central": { level: "cervicomedullary", lit: ["ventral-commissure-of-spinal-cord", "central-canal"], both: true },
  "cord-asa": { level: "cervicomedullary", lit: ["ventral-horn", "intermediate-zone", "anterolateral-spinothalamic-tract", "lateral-corticospinal-tract", "anterior-corticospinal-tract", "ventral-commissure-of-spinal-cord"], both: true },
  "cord-psa": { level: "cervicomedullary", lit: ["fasciculus-gracilis", "fasciculus-cuneatus", "dorsal-horn", "substantia-gelatinosa"] },
  "cord-psa-both": { level: "cervicomedullary", lit: ["fasciculus-gracilis", "fasciculus-cuneatus", "dorsal-horn", "substantia-gelatinosa"], both: true },
  "cord-ah": { level: "cervicomedullary", lit: ["ventral-horn", "location-of-limb-lower-motor-neurons", "location-of-trunk-lower-motor-neurons"] },
  "cord-root": { level: "cervicomedullary", lit: ["dorsal-horn", "substantia-gelatinosa"] },
  "med-pyr": { level: "medulla-mid", lit: ["pyramids"] },
  "med-medial": { level: "medulla-mid", lit: ["pyramids", "medial-lemniscus", "hypoglossal-nucleus"] },
  "med-lateral": { level: "medulla-rostral", lit: ["spinal-trigeminal-nucleus", "anterolateral-spinothalamic-tract", "nucleus-ambiguus", "inferior-cerebellar-peduncle", "dorsal-spinocerebellar-tract"] },
  "med-dcn": { level: "medulla-caudal", lit: ["gracile-nucleus", "cuneate-nucleus"] },
  "med-arcuate": { level: "medulla-mid", lit: ["internal-arcuate-fibers"], both: true },
  "med-pyrdec": { level: "medulla-caudal", lit: ["motor-decussation"], both: true },
  "pons-ml": { level: "pons-mid", lit: ["medial-lemniscus"] },
  "pons-basis": { level: "pons-mid", lit: ["longitudinal-fibers-of-the-pons"] },
  "pons-basis-bi": { level: "pons-mid", lit: ["longitudinal-fibers-of-the-pons"], both: true },
  "pons-lateral": { level: "pons-mid", lit: ["anterolateral-spinothalamic-tract", "principal-sensory-nucleus-of-trigeminal", "superior-cerebellar-peduncle"] },
  "pons-mcp": { level: "pons-mid", lit: ["middle-cerebellar-peduncle"] },
  "pons-trig": { level: "pons-mid", lit: ["principal-sensory-nucleus-of-trigeminal"] },
  "pons-vii": { level: "pons-caudal", lit: ["facial-nucleus", "facial-nerve"] },
  "pons-mlf": { level: "pons-caudal", lit: ["medial-longitudinal-fasciculus"] },
  "mid-ped": { level: "midbrain-sc", lit: ["cerebral-peduncles"] },
  "mid-weber": { level: "midbrain-sc", lit: ["cerebral-peduncles", "oculomotor-nerve"] },
  "mid-teg": { level: "midbrain-sc", lit: ["medial-lemniscus", "anterolateral-spinothalamic-tract", "red-nucleus"] },
  "mid-scpdec": { level: "midbrain-ic", lit: ["decussation-of-the-superior-cerebellar-peduncle"], both: true },
  "mid-dorsal": { level: "midbrain-sc", lit: ["superior-colliculus"], both: true },
  "cn-iii": { level: "midbrain-sc", lit: ["oculomotor-nerve"] },
  "cn-vi": { level: "pons-caudal", lit: ["abducens-nerve"] },
  "cn-xii": { level: "medulla-rostral", lit: ["hypoglossal-nerve", "hypoglossal-nucleus"] },
  "cn-v": { level: "pons-mid", lit: ["trigeminal-nerve"] },
};
const LEVEL_NAME: Record<string, string> = {
  cervicomedullary: "the upper cervical cord",
  "medulla-caudal": "the caudal medulla",
  "medulla-mid": "the mid medulla",
  "medulla-rostral": "the rostral medulla",
  "pons-caudal": "the caudal pons",
  "pons-mid": "the mid pons",
  "midbrain-ic": "the midbrain at the inferior colliculus",
  "midbrain-sc": "the midbrain at the superior colliculus",
};

export function hasLesionSection(siteId: string | undefined): boolean {
  return !!siteId && siteId in SITE_PLATE;
}

export function LesionSection({ result }: { result: LesionResult | null }) {
  const spec = result ? SITE_PLATE[result.site.id] : undefined;
  const plate = usePlate(spec?.level ?? null);
  const names = useMemo(() => Object.fromEntries(Object.entries(STRUCTURES).map(([k, s]) => [k, s.name])), []);
  if (!result || !spec) return null;
  // the cuneate fasciculus carries the body above T6: a thoracic or lumbar dorsal column lesion cuts the gracile only
  const below6 = !!result.seg && /^(T([7-9]|1[0-2])|L\d|S\d)$/.test(result.seg);
  const lit = spec.lit.filter((s) => !(below6 && s === "fasciculus-cuneatus"));
  const side = spec.both || result.side === "both" ? "both" : result.side;
  const where = LEVEL_NAME[spec.level] ?? spec.level;
  const cord = spec.level === "cervicomedullary";
  return (
    <section className="grid gap-2 rounded-card border border-panel-border p-3" aria-label="The section at the lesion">
      <p className="eyebrow">The section at the lesion</p>
      {plate && plate !== "missing" ? (
        <PlateArt plate={plate} view="illustration" lit={{ slugs: lit, side }} pulse callout names={names} interactive className="w-full" ariaLabel={`Cross-section of ${where} with the damaged structures lit`} />
      ) : (
        <p className="text-sm text-text-dim">{plate === "missing" ? "The section could not be loaded." : "Loading the section…"}</p>
      )}
      <p className="text-xs leading-snug text-text-dim">
        {cord ? (
          <>
            Cross-section of the cord (drawn at {where}; the tracts lie in the same places at every level{result.seg ? `, here ${result.seg}` : ""}
            {below6 ? ": below T6 there is no cuneate fasciculus" : ""}).
          </>
        ) : (
          <>Cross-section of {where}.</>
        )}{" "}
        Damaged: {lit.map((s) => names[s] ?? s.replace(/-/g, " ")).join(", ")}
        {side === "both" ? " (both sides)" : side === "L" ? " (left)" : " (right)"}. Viewed from above with dorsal up: the patient&rsquo;s left is on your left. Hover for names.
      </p>
    </section>
  );
}
