# Anatomical accuracy audit, November 2026

Independent audit of ANKI PLUS Online (NSCI 3250) content, started 2026-11-09. Work in progress: this file is committed in stages.

Standard of proof: the course slides first (`content-build/decks/*/slides.json`, lab answer keys), then free authoritative sources (NCBI Bookshelf/StatPearls, Neuroscience Online UTHealth, Purves on Bookshelf, Gray's 1918, Radiopaedia, peer-reviewed papers). Classes:
- **Error**: contradicts the slides and the sources.
- **Slide conflict**: follows the slides, sources disagree (app unchanged; see "For the professor").
- **App deviates from slides**: matches the sources, not the slides.
- **Imprecise**: wording that can mislead or is only partly true.
- **Beyond the slides**: correct but deeper than the slides (belongs behind the Supplementary gate).
- **Grading defect**: the card's own canonical answer is marked wrong (or a wrong answer is marked right) by its keyword groups.

Earlier work this builds on and does not repeat: `docs/PATHWAY_AUDIT.md` (OQ1-OQ13), `docs/CARD_LABEL_AUDIT.md`, `docs/SUPPLY_AUDIT.md`, `docs/NSCI3250-content-review.pdf` (items 1-10). Settled decisions kept: corticospinal fibres in the posterior limb (slide: anterior limb + genu, review item 1), vestibular input via ICP (item 2), Clarke C8-L3 with L2 accepted (item 3), red nucleus in the rostral midbrain tegmentum (item 4), about 80 % corticospinal crossing (item 6), course visual neuron order (item 7).

## Status
- [x] Pathway map text and lesion engine read in full; lesion engine simulated for every site (left lesion, each cord level).
- [x] `content/nsci3250/pathways.json` read in full.
- [x] Pathway cards (u1-u3) and clinical cards (u1-u3) read in full.
- [x] Keyword self-check of every keyword-graded card.
- [ ] Source verification of each finding (in progress).
- [ ] Supply map (re-read after the 2026-11-09 rewrite), brainstem levels, atlas extra info, atlas links.

(Sections below are filled as findings are verified.)
