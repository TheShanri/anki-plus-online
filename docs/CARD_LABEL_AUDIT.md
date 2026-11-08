# Card label audit (pin and section cards)

Checked 1871 pin/section cards. 1564 map image + cloze to OCR text (`content-build/ocr`, `ocr_tight`, `ocr_rot`, `ocr_poly`, keyed by apkg note id + cloze number, matching the slug `<deck>-io-<note>-c<n>`); 307 are practical/section cards with no occlusion label.
Method: normalised comparison (case, punctuation, plurals) of each OCR label against answer + accept, then a token-similarity pass, plus pattern scans for doubled, garbled, non-Latin, fragment and slash answers. Mismatches were checked by cropping the target box from the image and reading it.

Key finding: the first pass missed Cephalic/Rostral because the wrong answer sat in `accept`. A second pass lists cards whose label matches only an `accept` entry; those are mostly legitimate (label spells the structure differently, abbreviations, "Frontal plane" for coronal) and were left.

## Fixes (65 text/answer fixes, 4 Neuraxis cards, 1 draft)
- Wrong answer for label: `lab-1-io-1768349833591-c1` Rostral -> Cephalic; `lab-15-io-1775054817967-c1` Paravermis -> Vermis; `lab-4-io-1769517202844-c5` "Olfactory nerve" -> "mixed motor + sensory" (structure link removed, kind function); `lab-7-io-1770685184914-c1` Olfactory nerve -> Olfactory bulb; `lab-1-io-1768350003725-c1/c2` Sagittal plane -> Midsagittal plane / Parasagittal plane (two labels on one image).
- Doubled: Lateral Lateral -> Lateral; Medial Medial -> Medial; Paravermis Paravermis -> Paravermis (x2); Lateral Hemisphere Lateral Hemisphere and "Lateral Lateral Sphere Sphere" -> Lateral hemisphere. Prompts say the label appears twice.
- Garbled/truncated OCR (text-cloze cards): about 45 answers re-read from the image, e.g. "frontal lobes re" -> frontal lobes, "e 31 p" -> 31, "n higher" -> higher, "??? Ventricle" -> Fourth ventricle, "he3rd Ventricle is" -> 3rd Ventricle, "Parietal x2, Occipital" -> Two parietal bones and the occipital bone, "GTO, Spindles, M M R P" -> Muscle spindle (any one receptor), "Aa or AB" -> A-alpha or A-beta. Long Q+A boxes (lab-4 1769547073953, 1769549959444; lab-5 1769696795188, 1769700348409) now hold the clean answer text and the question as prompt.
- Neuraxis (4 cards): `explain` added (long axis of the CNS, bend at the mesencephalic flexure, rostral meaning changes; wording from Lecture 1 slide 30 and Lab 1) and prompt "Name the term for the line drawn through the body that this label points to."
- Kinds: `answer-kinds.mjs` re-run; one cardSlugs entry added.

## Draft
- `lab-8-diagrams-io-1770937686697-c2`: one target box covers two handwritten labels (motor trigeminal nucleus and principal sensory trigeminal nucleus). Needs two cards with separate targets.

## Slash/alternative answers (all checked against Lab 1 slide "Morphological Orientation of the Human CNS")
Synonyms on the slide, either part is correct: Dorsal/Superior, Ventral/Inferior, Ventral/anterior, Dorsal/posterior, Anterior/Ventral, Posterior/Dorsal, Rostral or anterior, Caudal or posterior, Mid-sagittal or sagittal, C or A-delta (alternatives), Pyramids/Motor Decussation and Caudal Medulla/Sensory Decussation (same level, either name).
Both parts required (not alternatives): `lab-4-io-1769516838904-c2` "L1/L2" (vertebral range), `lab-2-io-1768768924518-c1` "Lateral, 3rd and 4th", `lab-5` labels such as "Legs/T6 and below" (labels, not answers).

## For the owner
- Dorsal/Superior style answers are a brainstem-vs-forebrain convention; accepting either part is right for the slides but each is only true in one region.
- Free-text sentence cards (lab-3, lab-4, lab-5, lab-7) cannot be typed exactly; consider rating them self-graded.
- `practical-u2-2024-q*` cards have empty answers and are already drafts.
- Target boxes on the two-Paravermis cards also cover the Vermis label; not fixable with one rect.

## Structure links and explains (hand-off from the info agent)
- Applied 232 exact, 28 synonym and 110 reviewed judgement links; skipped 268 judgement links (slash directions, brainstem level cards, function/location answers, generic pins such as Peduncle, spinal-cord-segment cards linked to vertebrae, imaging/clinical generic ones).
- Applied 109 of 111 proposed explains (2 replaced by coordinator-supplied fact explains); 9 more explains come from the fact-fix list.
- Fact fixes: motor decussation 80%, LCST internal-capsule card (now live), Clarke C8-L3, optic tract order, V1/V3 numerals in written-u2-q11 (answer and choices), practical-u3-2025-q40, written-u1-si-4-q20 prompt, two explains.
- Searched for "red nucleus in dorsal midbrain": no cards. Vestibular input via MCP: `pathways-u3-cerebellar-input-vest` corrected to the inferior cerebellar peduncle (juxtarestiform body).
- Still C8 to L2: `sections-u1-clarke` (its accept list lacks L3).
