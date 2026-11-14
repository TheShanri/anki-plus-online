/* Cranial nerves always carry their Roman numeral where the tracer names them (labels, captions, stops, notes):
 * "Trigeminal nerve (V)", "Olfactory nerve (I)", "Mandibular nerve (V3)". Applied at display time, so the copy files can name a
 * nerve plainly. A name that already has a numeral is left as it is ("(CN VIII)" becomes "(VIII)"). */

const NUM: Record<string, string> = {
  olfactory: "I",
  optic: "II",
  oculomotor: "III",
  trochlear: "IV",
  trigeminal: "V",
  ophthalmic: "V1",
  maxillary: "V2",
  mandibular: "V3",
  abducens: "VI",
  facial: "VII",
  vestibulocochlear: "VIII",
  cochlear: "VIII",
  vestibular: "VIII",
  glossopharyngeal: "IX",
  vagus: "X",
  accessory: "XI",
  hypoglossal: "XII",
};
const NAMES = Object.keys(NUM).join("|");
const RE = new RegExp(String.raw`\b(${NAMES}) (nerves?)\b(?!\s*\((?:CN\s*)?[IVX]+\d?\))`, "gi");
const HAS = new RegExp(String.raw`\b(${NAMES}) (nerves?) \(CN\s*([IVX]+\d?)\)`, "gi");

export function withRoman(s: string): string {
  if (!s) return s;
  return s.replace(HAS, "$1 $2 ($3)").replace(RE, (m, name: string) => `${m} (${NUM[name.toLowerCase()]})`);
}
