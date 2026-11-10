/* Short labels (1 to 3 words) for the gutter labels and tooltips: the structure's course name without qualifiers. */

const SHORT: [RegExp, string][] = [
  [/^mni-?/i, ""],
  [/^Medial lemniscus.*/i, "Medial lemniscus"],
  [/^Medial longitudinal fasciculus.*/i, "MLF"],
  [/^Posterior limb of internal capsule.*/i, "Internal capsule"],
  [/^Anterior limb of internal capsule.*/i, "Internal capsule"],
  [/^Genu of internal capsule.*/i, "Internal capsule (genu)"],
  [/^Internal capsule.*/i, "Internal capsule"],
  [/^Roots of brachial plexus/i, "Brachial plexus root"],
  [/^Inferior trunk of brachial plexus/i, "Inferior trunk"],
  [/^Middle trunk of brachial plexus/i, "Middle trunk"],
  [/^Anterior division of inferior trunk.*/i, "Medial cord"],
  [/^Anterior division of .*trunk.*/i, "Plexus division"],
  [/^Proper palmar digital branches of (\w+) nerve/i, "Digital nerve"],
  [/^Common palmar digital branches of (\w+) nerve/i, "Digital nerve"],
  [/^Proper plantar digital branches.*/i, "Digital nerve"],
  [/^Superficial branch of ulnar nerve/i, "Ulnar nerve"],
  [/^Deep branch of ulnar nerve/i, "Ulnar nerve (deep)"],
  [/^Posterior root of spinal nerve/i, "Dorsal root"],
  [/^Anterior root of spinal nerve/i, "Ventral root"],
  [/^Spinal ganglion/i, "Dorsal root ganglion"],
  [/^Lateral corticospinal tract/i, "Lateral corticospinal tract"],
  [/^Lateral spinothalamic tract/i, "Anterolateral tract"],
  [/^Anterior spinothalamic tract/i, "Anterolateral tract"],
  [/^Posterior spinocerebellar tract/i, "Dorsal spinocerebellar tract"],
  [/^Pyramid of medulla oblongata/i, "Pyramid"],
  [/^Base of peduncle/i, "Cerebral peduncle"],
  [/^Longitudinal fibers of the pons/i, "Basis pontis"],
  [/^White matter of spinal cord/i, "Spinal cord"],
  [/^Optic nerve \(II\)/i, "Optic nerve"],
  [/^Lateral geniculate body/i, "LGN"],
  [/^Medial geniculate body/i, "MGN"],
  [/^Calcarine sulcus/i, "Calcarine sulcus (V1)"],
  [/^Trigeminal nerve \(V\)/i, "Trigeminal nerve"],
  [/^Vestibulocochlear nerve \(VIII\)/i, "CN VIII"],
  [/^Facial nerve \(VII\)/i, "Facial nerve"],
  [/^Glossopharyngeal nerve \(IX\)/i, "CN IX"],
  [/^Vagus nerve \(X\)/i, "Vagus nerve"],
  [/^Hypoglossal nerve \(XII\)/i, "Hypoglossal nerve"],
  [/^Oculomotor nerve \(III\)/i, "Oculomotor nerve"],
  [/^Abducens nerve \(VI\)/i, "Abducens nerve"],
  [/^Olfactory nerve \(I\)/i, "Olfactory nerve"],
];

export function shortName(name: string): string {
  let s = name.replace(/\.[lr](#\d+)?$/, "").replace(/#\d+$/, "").replace(/^[a-z]+:/, "");
  for (const [re, to] of SHORT) {
    if (re.test(s)) {
      s = s.replace(re, to);
      if (to) break;
    }
  }
  s = s.replace(/\s*\([^)]*\)\s*$/, (m) => (/BA|V1|genu|deep/i.test(m) ? m : "")).trim();
  if (/-/.test(s) && !/\s/.test(s)) s = s.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  const words = s.split(/\s+/);
  return words.length > 4 ? words.slice(0, 3).join(" ") : s;
}
