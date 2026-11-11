// Every v3 pathway spec, keyed by slug (the slugs of src/data/pathway-map.json). One file per group of pathways; the build
// imports only the files it needs, so a broken file never blocks the build of another group.
export const FILES = {
  "sensory.mjs": ["dcml", "alst", "dsct", "trigeminal-discriminative", "trigeminal-pain"],
  "trigeminal-reflex.mjs": ["corneal", "jaw-jerk"],
  "motor.mjs": ["lcst", "acst", "corticobulbar", "rubrospinal", "tectospinal", "reticulospinal", "vestibulospinal", "umn-lmn"],
  "spinal-reflex.mjs": ["stretch-reflex", "withdrawal-reflex"],
  "special.mjs": ["visual", "pupillary", "gaze", "cochlear", "vestibular", "olfactory"],
  "circuits.mjs": ["solitary", "cerebellar", "corticopontocerebellar", "basal-ganglia", "sympathetic", "parasympathetic", "limbic-fornix", "limbic-amygdala", "limbic-septal", "reward"],
};
/** The specs for the wanted slugs (all when none), loaded file by file. */
export async function loadSpecs(want = []) {
  const out = {};
  for (const [file, slugs] of Object.entries(FILES)) {
    if (want.length && !slugs.some((s) => want.includes(s))) continue;
    const mod = await import(`./${file}`);
    Object.assign(out, mod.PATHWAYS);
  }
  return out;
}
