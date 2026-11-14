/**
 * Cranial-nerve display names always carry the nerve's Roman numeral: "Oculomotor nerve (III)", "Ophthalmic nerve (V1)",
 * "Nucleus of hypoglossal nerve (XII)". Applied to every atlas index name, so Explore labels, the structure list, info cards
 * and the section key agree. Names that already end in a numeral are left as they are.
 */
const RULES: [RegExp, string][] = [
  [/\bolfactory (nerve|bulb|tract)\b/i, "I"],
  [/\boptic nerve\b/i, "II"],
  [/\boculomotor nerve\b/i, "III"],
  [/\btrochlear nerve\b/i, "IV"],
  [/\bophthalmic nerve\b/i, "V1"],
  [/\b(maxillary nerve|infraorbital nerve|zygomatic nerve|pterygopalatine)\b/i, "V2"],
  [/\b(mandibular nerve|buccal nerve|lingual nerve|inferior alveolar nerve|mental nerve|mylohyoid|auriculotemporal nerve|masseteric nerve)\b/i, "V3"],
  [/\btrigeminal (nerve|ganglion)\b/i, "V"],
  [/\babducens nerve\b/i, "VI"],
  [/\b(facial nerve|chorda tympani|greater petrosal nerve|intermediate nerve|nervus intermedius)\b/i, "VII"],
  [/\b(vestibulocochlear nerve|cochlear nerve|vestibular nerve)\b/i, "VIII"],
  [/\bglossopharyngeal nerve\b/i, "IX"],
  [/\bvagus nerve\b/i, "X"],
  [/\baccessory nerve\b/i, "XI"],
  [/\bhypoglossal nerve\b/i, "XII"],
];
const HAS_NUMERAL = /\((?:[IVX]+)(?:\d)?\)\s*$/;

export function cranialNumeral(name: string): string | null {
  for (const [re, n] of RULES) if (re.test(name)) return n;
  return null;
}

export function withCranialNumeral(name: string): string {
  if (!name || HAS_NUMERAL.test(name)) return name;
  const n = cranialNumeral(name);
  return n ? `${name} (${n})` : name;
}
