# Info panel coverage

Panel = linked structure whose info has etymology roots, literal and explanation (Reveal.tsx). Live cards only.

## Before (structure-linked and full)
pin 1384/1696, theory 509/685, pathway 13/224, clinical 0/75, section 0/41.
Causes: about 815 cards had no `structure` link; 5 structures had thin info (Broca, Wernicke, Edinger-Westphal, limb/trunk LMN location).

## After (once content-build/card-structure-links.json is applied to the card files)
| kind | live | full panel | explain only | none |
|---|---|---|---|---|
| pin | 1696 | 1654 | 30 | 12 |
| theory | 685 | 654 | 18 | 13 |
| pathway | 224 | 173 | 51 | 0 |
| clinical | 75 | 61 | 14 | 0 |
| section | 41 | 22 | 19 | 0 |

"none" = 25 cards skipped because the answer is image-dependent or context-free (list in the report to the owner).

## Structures
- 5 thin structures filled (eponym roots added); mesencephalic-flexure etymology improved.
- 110 new structures added (concept flag where not physical); total 405. All have roots, literal, story, explanation.
- Hand-off files (gitignored, in content-build/): card-structure-links.json (638 links), card-explain-proposals.json (111).

## Cards whose answers look wrong (not changed)
- practice-exam-u2 q11: ophthalmic division is V1, not V3.
- written-u1 session-4 q20: cerebellopontine angle tumor most often affects CN VIII.
- written-u2 session-5 q26: corticospinal decussation is about 90%, answer says 80%.
