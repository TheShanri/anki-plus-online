// Dumps the beat list (the shared beat model of buildPathwayScene.ts) for every pathway and body part:
//   node --import ./tools/pathways/v3/lib/register.mjs tools/pathways/v3/dump-beats.mjs > _atlas/pw3_raw/beats.json
import { buildBeatScene, ORIGINS } from "../../../src/components/atlas/pathways/buildPathwayScene.ts";
import { PATHWAY_MAP } from "../../../src/lib/atlas/pathways.ts";
import courses from "../../../content/nsci3250/pathways.json" with { type: "json" };
const colors = { left: "#3d8bff", right: "#ff9e3d", dim: "#888888", text: "#ffffff", hi: "#ffee88", bad: "#ff5a78" };
const out = {};
for (const slug of Object.keys(PATHWAY_MAP)) {
  const cp = courses.find((c) => c.slug === slug);
  if (!cp) { out[slug] = { missingCourse: true }; continue; }
  const parts = ORIGINS[slug]?.parts ?? [null];
  for (const part of parts) {
    const bs = buildBeatScene({ mp: PATHWAY_MAP[slug], cp, slug, colors, limbPart: part ?? "hand" });
    out[part ? `${slug}:${part}` : slug] = bs.beats.map(({ kind, neuron, caption, cross, info, phys, rel, branch, fork, view }) => ({ kind, neuron, caption, cross: !!cross, info, phys, rel, branch: !!branch, fork, view }));
  }
}
console.log(JSON.stringify(out, null, 1));
