# Anatomical accuracy audit, November 2026

Independent audit of ANKI PLUS Online (NSCI 3250) content, 2026-11-09. Auditor: Claude (Opus), with three read-only helper passes (theory cards; written/practical/section/pin cards; `structures.json` info panels) whose findings were re-checked here before anything was changed or proposed.

**Standard of proof.** The course slides come first (`content-build/decks/*/slides.json`, lab answer keys, the cranial nerve chart, the sensory cheat sheets). Free authoritative sources come second: Neuroscience Online (UTHealth), NCBI Bookshelf/StatPearls, Wikipedia only where it agrees with a primary source, Radiopaedia, EyeWiki, peer-reviewed papers. NCBI Bookshelf answered every automated fetch with a CAPTCHA, so StatPearls items are cited by URL from search results, not from a full read. Claims I could not source are listed under "Unverified".

**Classes.**
- **Error**: contradicts the slides and the sources.
- **Slide conflict**: follows the slides (or an official key), sources disagree. The app is unchanged; see "For the professor".
- **App deviates**: matches the sources, not the slides.
- **Imprecise**: can mislead or is only partly true.
- **Beyond**: correct but deeper than the slides (belongs behind the Supplementary gate).
- **Grading defect**: the card's own canonical answer is marked wrong by its keyword groups, or a wrong answer is accepted.

**Builds on, does not repeat:** `docs/PATHWAY_AUDIT.md` (OQ1-OQ13), `docs/CARD_LABEL_AUDIT.md`, `docs/SUPPLY_AUDIT.md`, `docs/NSCI3250-content-review.pdf` (items 1-10). Settled decisions are kept and not re-counted: corticospinal fibres in the posterior limb (slide: anterior limb + genu, review item 1); vestibular input via the ICP (item 2); Clarke C8-L3 with L2 accepted (item 3); red nucleus in the rostral midbrain tegmentum (item 4); about 80 % crossing (item 6); course visual neuron order (item 7).

## 0. Summary

| Area | Error | Grading defect | Slide conflict | App deviates | Imprecise | Beyond |
|---|---|---|---|---|---|---|
| A. Pathway map + lesion engine | 3 | - | 2 | 2 | 6 | 4 (new; PATHWAY_AUDIT lists more) |
| B. `pathways.json` | 0 | - | 1 | 0 | 3 | 0 |
| C. Pathway + clinical cards | 4 | 17 | 3 | 0 | 4 | 0 (new) |
| D. Theory / written / practical / pin cards | 3 | 2 | 4 | 2 | 6 | 3 |
| E. Structure info (`structures.json`) | 1 | - | 1 | 2 | 8 | many (not itemised) |
| F. Blood supply (`supply-map.json`, cards) | 0 | - | 2 | 0 | 3 | 0 |
| G. Brainstem levels | 0 | - | 1 | 1 | 2 | 0 |
| H. Atlas extra info, atlas links, loader facts | 0 | - | 0 | 0 | 4 | 0 |

**Fixed in this audit:** 26 edits in 12 content files (section 9). **Waiting for other agents:** exact proposed changes in section 10 (pathway map, brainstem levels, supply map, `atlasFacts.ts`, `atlas-links.json`).

## 1. The ten most serious findings

1. **The motor-decussation card marked the taught answer wrong.** `theory-motor-decussation-connections` asked for the percentage of crossing fibres with answer "About 80%", but its keyword group was `["90","85","10-15"]`. A student typing "80" was graded wrong and one typing "90" was graded right. This contradicts Lecture 10 slide 15, Lab 10 slide 19 and the content review's item 6. **Fixed:** keywords `["80","75","85","90"]`.
2. **Seventeen live cards graded their own canonical answer as wrong or only partly right.** Examples: "Hemiballismus" on the subthalamic lesion card, "Retinohypothalamic projection", "Hemineglect syndrome", "Caudal medulla" for the DCML decussation, "Dorsal stream" and "Ventral stream", "Above/Below the red nucleus", "C8 to L3" against a `T1` keyword, and "Intracerebral haemorrhage". A student who typed exactly what the app teaches lost the point. **Fixed** (section 9).
3. **Corticopontine fibres were an accepted answer for the pathway to the facial nucleus** (`pathways-u2-corticobulbar-fiber-bundle`). Lecture 10 slide 10 and Lab 10 slides 1 and 11 say corticopontine fibres end in the pontine nuclei and go to the cerebellum. **Fixed:** removed from the accepted answers, explain rewritten.
4. **A unilateral auditory cortex lesion was said to impair "mostly the contralateral ear"** (`clinical-u1-cortex-auditory`). Lecture 5 slide 20 says "not lateralized: all sounds go to both sides", and Lecture 18 (strokes) slide 24 says "slight bilateral loss of hearing". Sources agree that a unilateral cortical lesion does not cause one-sided deafness (https://en.wikipedia.org/wiki/Cortical_deafness; https://neurosurgicalatlas.com/boards/review-questions/sensory-systems/8-auditory-system; https://www.jstage.jst.go.jp/article/audiology1968/12/1/12_1_43/_article/-char/en). **Fixed** (explain).
5. **The trochlear nucleus info panel gave the head tilt "away from the lesion".** Trochlear fibres cross, so a nuclear lesion weakens the opposite superior oblique. Patients tilt away from the weak eye, which for a nuclear lesion is toward the lesion (https://litfl.com/fourth-cranial-nerve-lesions/: "Injury to the trochlear nucleus within the brainstem causes contralateral paralysis", tilt "away from" the affected side). **Fixed** in `structures.json`.
6. **Lesion engine: a cervical cord hemisection or lateral-funiculus lesion never cuts the dorsal spinocerebellar tract.** The `dsct/tract` stretch is limited to `cordLevels ["T","L"]`, but the tract ascends from Clarke's column (C8-L3) through the cervical cord to the inferior cerebellar peduncle (https://nba.uth.tmc.edu/neuroscience/m/s2/chapter03.html; https://en.wikipedia.org/wiki/Dorsal_spinocerebellar_tract). A C4 Brown-Sequard in the lesion lab therefore omits ipsilateral leg incoordination. This is an Error; the proposed diff is in 10.1.
7. **Lesion engine: a V1 lesion lists the LGN as cut.** Site `vis-v1` has zones `["vis-v1","thal-lgn"]`. A cortical lesion does not damage the thalamic relay, even though the field defect is the same. This is an Error in the lesion logic; see 10.1.
8. **Brainstem atlas level names disagree with the course's level names, which the section cards use.** Course (Lab 8 slide 2, Lab 9 slide 2): Rostral pons = level of the trigeminal nerve; Caudal medulla = level of the cuneate and gracile tubercles (sensory decussation, "the 4th ventricle is not present this low", Lab 8 slide 9); then the brainstem/spinal cord junction (motor decussation). `brainstem-levels.json` names these "Mid pons", "Mid medulla (obex)" and "Caudal medulla". A student using the atlas learns names that the section cards (`sections-u2-*`) mark wrong. This is App deviates, and the most exam-relevant naming issue; see 10.3.
9. **Practice exam key errors the app teaches as correct** (for the professor):
   - Unit 2 practice exam Q21 keys "All of the above", but primary visual cortex gets no direct retinal input (Lecture 11).
   - Unit 2 Q8 asks for the nerve with lacrimal but no salivary parasympathetics and keys VII. VII also drives salivation (cranial nerve chart: superior salivatory nucleus, "Salivation, lacrimation"; Lecture 7 slide 23).
   - Unit 3 Q20 has two defensible answers (the hippocampus is PCA territory).
   The app-written explain on Q21 repeated the error ("each of the options is a direct target"). **Fixed** (explain only, key kept).
10. **The posterior spinal artery lesion site is bilateral, and its effect text is wrong at the lesion level.** Lab 16 slide 17 says each posterior spinal artery supplies a wedge on its own side, including "much of the dorsal horn". The engine models the site as unsided, and its effect text says "Strength and pain/temperature preserved", which is not true at the damaged segments. This is Imprecise; see 10.1.

## 2. Area A: pathway map (`src/data/pathway-map.json`) and lesion engine (`src/lib/atlas/pathways.ts`)

Method: every stretch label, mark, loss, region and note was read. `predictLesion` was re-implemented in a script and run for all 47 sites (left lesion; C, T and L cord levels). The output is in the audit scratch notes (`acc/lesion.txt`). Laterality is correct everywhere: no deficit appears on the wrong side. That covers cord, brainstem, capsule, cortex, cerebellar double crossing, visual field after the chiasm, the corneal afferent, the hypoglossal deviation toward the lesion, and the uvula deviating away from it.

| # | Item | App says | Slides say | Sources say | Class | Proposed change |
|---|---|---|---|---|---|---|
| A1 | `dsct/tract` cord levels | `cordLevels ["T","L"]`; site `cord-dsct` only T, L. Cervical hemisection omits DSCT | Lab 5: DSCT from Clarke's column ascends in the lateral funiculus to the ICP | Ascends uncrossed in the lateral funiculus through the rest of the cord to the ICP: https://nba.uth.tmc.edu/neuroscience/m/s2/chapter03.html, https://en.wikipedia.org/wiki/Dorsal_spinocerebellar_tract | Error | 10.1 (a) |
| A2 | Site `vis-v1` | zones include `thal-lgn`, so "Lateral geniculate nucleus" is listed as cut | L11/21: V1 lesion gives hemianopia or quadrantanopia | V1 and LGN are separate stations; same field defect, different structure | Error | 10.1 (b) |
| A3 | Site `pons-basis` | Named "Basis pontis (corticospinal and corticobulbar fibres)", but no corticobulbar stretch has a pons zone, so no face, tongue or swallowing deficit is predicted. The bilateral version relies on an effect text for the face | Lab 10 slide 11: "Corticospinal and corticobulbar fibers continue through" the basis pontis | Corticobulbar fibres for the medullary nuclei (XII, ambiguus) still run in the basis pontis; ventral pontine lesions can add contralateral lower face and tongue weakness, though classic teaching says the face is often spared at pontine level (https://umassmed.edu/strokestop/modules/module-5/vertebral-basilar-strokes/case-3-brisk-reflexes) | Error (the site name and the output contradict each other) | 10.1 (c) |
| A4 | Site `cord-psa` | Unsided ("Posterior spinal arteries"); effect "Strength and pain/temperature preserved." | Lab 16 slide 17: each PSA supplies a wedge "on its own side", "much of the dorsal horn and all of the dorsal column on that side" | Same | Imprecise | 10.1 (d) |
| A5 | Site `cord-central` effect at T8 | "pain and temperature lost in a cape-like band" also at thoracic level | not on slides | "Cape" describes a cervical syrinx; a thoracic one gives a band at the damaged segments | Imprecise | 10.1 (e) |
| A6 | `vestibulospinal` N1 | "Vestibular nuclei (medulla)" | L10/23 "vestibular complex in medulla"; L8/19 "vestibular nuclei of the caudal pons"; CN chart "pontomedullary junction (shown in rostral medulla)" | Medial and inferior nuclei span the caudal pons and the rostral medulla (https://nba.uth.tmc.edu/neuroanatomy/L7/Lab07p19_index.html) | Imprecise; the slides also disagree with each other (coordinator item 1) | 10.1 (f); professor item P6 |
| A7 | `lcst/cap` "Corona radiata and internal capsule (posterior limb)" | posterior limb | L10/12: "anterior limb and genu" | Posterior limb (StatPearls NBK542181; DTI) | App deviates, a deliberate decision already reported (review item 1; coordinator item 2) | none; keep. Add the slide wording behind Supplementary only if the owner wants both shown |
| A8 | `tectospinal` N1 "Superior and inferior colliculi (tectum)" | both colliculi | L10/21 both colliculi | Arises from the deep layers of the superior colliculus (https://statpearls.com/point-of-care/36620) | Slide conflict | none; professor item P4 |
| A9 | `visual/chiasm` loss "bitemporal hemianopia (... tunnel vision)" | tunnel vision | L11/20: "tunnel vision – loss of peripheral vision from each eye" | Bitemporal hemianopia is loss of both temporal hemifields, not concentric constriction (https://ditki.com/course/neuroanatomy/glossary/term/visual-field-defect-bitemporal-hemianopia; https://www.britannica.com/science/visual-field-defect) | Slide conflict | none; professor item P5 |
| A10 | Site `vis-parietal` name | "Optic radiation, parietal route (upper)" | L11: radiations, upper field in inferior V1 | correct, but "(upper)" reads as the upper field when it means the upper (dorsal) fibres carrying the lower field | Imprecise | rename to "Optic radiation, parietal route (dorsal fibres: lower field)" |
| A11 | Site `pons-lateral` | Hits the ipsilateral spinal trigeminal nucleus and the contralateral trigeminothalamic tract, so facial pain loss is predicted on both sides | not on slides | Lateral pontine (AICA) syndromes are usually described with ipsilateral facial and contralateral body loss | Imprecise (unverified for the crossed trigeminothalamic fibres) | owner check: drop `pons-lat` from `trigeminal-pain/ttt` zones, or keep it with a note |
| A12 | Items deeper than the slides still in the map | "posterior limb" for thalamocortical fibres; "1-2 segments below"; "medial part" of the peduncle; forehead sparing; "dorsal tegmental decussation"; "posterior commissure"; "mostly ipsilateral"; amygdala as an olfactory target; geniculate/glossopharyngeal/vagal ganglia; "cruciate"; intention tremor, dysmetria, dysdiadochokinesia | (PATHWAY_AUDIT section 3) | all correct per sources | Beyond | already in `docs/pathway-audit.json`; v3 should gate them with `‹ ›` |

Checked and correct (no action): DCML somatotopy (gracile medial, cuneate lateral; T6 split); DCML crossing at the internal arcuate fibres; ALS crossing in the anterior white commissure near entry, with contralateral loss starting below the lesion; DSCT uncrossed via the ICP; trigeminal principal nucleus to contralateral VPM (slide rule, OQ5); spinal trigeminal nucleus ipsilateral, crossing after the nucleus; LCST 80 % at the pyramidal decussation, ipsilateral below it; cerebellar double crossing (SCP decussation in the caudal midbrain, then the pyramids); red nucleus and VA/VL targets; visual chiasm and hemifield logic, Meyer's loop to the upper field, the parietal route to the lower field; pupillary consensual reflex; corneal afferent (no blink in either eye) and efferent; FEF to the contralateral PPRF; MLF lesion (ipsilateral adduction failure, convergence intact); hemiballismus contralateral; Parkinson direct/indirect logic; Huntington indirect-pathway loss; olfactory ipsilateral; medial medullary tongue deviation toward the lesion; lateral medullary uvula away from the lesion.

## 3. Area B: course pathway data (`content/nsci3250/pathways.json`)

| # | Item | App says | Slides | Sources | Class | Proposed change |
|---|---|---|---|---|---|---|
| B1 | `dsct` N1 synapse | "Clarke's nucleus (C8-L2)" while the map and cards say C8-L3 | L5/15 C8-L2; Lab 5 key C8-L3 | C8-L3 (https://nba.uth.tmc.edu/neuroscience/m/s2/chapter03.html) | Imprecise (inconsistent with the app's own decision, review item 3) | "Clarke's nucleus (C8-L3; Lecture 5: C8-L2), ipsilateral" |
| B2 | `solitary` N1 level | "rostral medulla" while the synapse text uses rostral and caudal parts | L7/22-24: rostral (taste) and caudal (visceral) | the nucleus spans the medulla | Imprecise | "medulla (rostral part: taste; caudal part: visceral)" |
| B3 | Brainstem UMN tracts (`rubrospinal`, `tectospinal`, `reticulospinal`, `vestibulospinal`) | `lesion.above` = "decorticate/decerebrate posturing" for all four | L10/20 relates the postures to lesions above or below the red nucleus | correct only as a statement about the red nucleus level | Imprecise | rubrospinal only: "lesion above the red nucleus: decorticate; below: decerebrate"; the other three: "n/a (not taught)" |
| B4 | `vestibular` N1 level | "caudal pons / rostral medulla" | slides disagree (see A6) | matches sources | none (this is the right reconciliation) | keep |
| B5 | `trigeminal-discriminative` levels "rostral pons" | course scheme (Lab 9: "Rostral Pons: Level of the Trigeminal Nerve") | same | many atlases call this level "mid-pons" | none (course naming) | keep |

## 4. Area C: pathway cards (`pathways-u1/u2/u3`) and clinical cards (`clinical-u1/u2/u3`)

All 255 pathway cards and 89 clinical cards were read. Every keyword-graded card was checked automatically against its own canonical answer with the app's `gradeKeywords`.

| # | Card | App said | Slides | Sources | Class | Action |
|---|---|---|---|---|---|---|
| C1 | `pathways-u2-corticobulbar-fiber-bundle` | accepted "corticopontine fibers"; EX "Corticopontine fibers travel in the same bundle." | L10/10, Lab 10/1 and 10/11: corticopontine fibres end in the pontine nuclei, then go to the cerebellum via the MCP | same | Error | **Fixed** |
| C2 | `clinical-u1-cortex-auditory` EX | "mostly the contralateral ear" | L5/20 "all sounds go to both sides"; L18-strokes/24 slight bilateral loss | unilateral cortex lesion: no one-sided deafness (finding 4) | Error | **Fixed** |
| C3 | `clinical-u2-cn-cn7-lmn` EX | "Right facial nerve or nucleus" for a vignette with taste and tearing loss | L7, CN chart: taste and lacrimal fibres travel in the nerve (geniculate ganglion, SSN), not through the facial motor nucleus | same | Error (the nucleus cannot explain the vignette) | **Fixed** |
| C4 | `pathways-u1-sympathetic-transmitters` EX | trailing sentence "Preganglionic neurons release ACh (sweat glands are a cholinergic exception)." | L6: sweat glands get cholinergic sympathetic postganglionic fibres | same | Error (the exception is postganglionic) | **Fixed** (sentence removed; the correct statement is earlier in the EX) |
| C5 | 17 keyword-graded cards (list in 9.1) | canonical answer graded wrong or near miss | - | - | Grading defect | **Fixed** |
| C6 | `pathways-u2-lcst-capsule` kw | group `["genu","anterior limb","posterior limb","limb"]` accepts any answer containing "limb" | L10/12 anterior limb and genu | posterior limb (review item 1) | Imprecise (lenient on purpose so the slide answer scores) | owner decision; I left it |
| C7 | `pathways-u1-umn-lmn-umn-lesion` EX "Rigidity: agonist and antagonist muscles contract together"; `pathways-u2-lcst-umn-signs` EX "Spastic paralysis (rigidity)" | spasticity = rigidity | L10/4: "This creates rigidity in the limbs" | Spasticity (velocity-dependent, UMN) is distinct from rigidity (velocity-independent, basal ganglia): https://med.stanford.edu/stanfordmedicine25/blog/archive/2016/Spasticity-versus-Rigidity-Stanford-25-Skills-Symposium-2015.html | Slide conflict | professor item P3 |
| C8 | `pathways-u2-visual-lesion-chiasm`, `clinical-u2-visual-optic-chiasm` "tunnel vision" | slide term | L11/20 | see A9 | Slide conflict | professor item P5 |
| C9 | `pathways-u2-corticobulbar-fiber-bundle-xi` | the spinal accessory nucleus is reached by "corticospinal" fibres | L12 lab question 5f, no key | Sources differ: corticospinal (imaios) or corticobulbar/supranuclear (most texts list XI among corticobulbar targets) | Imprecise / unverified | owner: accept both "corticospinal" and "corticobulbar", and say the slides give no key |
| C10 | `clinical-u3-stroke-pca` | right hemianopia, alexia without agraphia and **prosopagnosia** → left PCA | L18: PCA = vision, thalamus | Alexia without agraphia = left PCA (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5493472/); prosopagnosia usually needs right or bilateral occipitotemporal damage (https://en.wikipedia.org/wiki/Pure_alexia) | Imprecise | drop "and prosopagnosia" from the vignette, or replace with "and cannot name colours" |
| C11 | `clinical-u2-cn-cn8-romberg`, `pathways-u2-cochlear-path` EX (superior olive, lateral lemniscus, "mostly bilateral") | correct | not taught (L8/19 "be familiar") | correct | Beyond | gate as supplementary (PATHWAY_AUDIT OQ8) |
| C12 | `clinical-u3-bleed-berry-sites` | "Anterior and posterior communicating arteries" | L18 | AComm and the ICA-PComm junction, then the MCA bifurcation | none | keep |

## 5. Area D: theory, written, practical, section and pin cards

Helper passes read all 482 theory cards and about 640 written, practical, section and pin cards. I verified each item below again before acting.

| # | Card | App says | Slides / key | Sources | Class | Action |
|---|---|---|---|---|---|---|
| D1 | `written-u2-practice-exam-u2-q21` | key "All of the above" (includes primary visual cortex); EX "Each of the options is therefore a direct target" | official key (marked option); L11/16 (three RGC destinations: SCN, LGN, midbrain) and L11/18 (LGN → optic radiations → V1) | RGCs project to the LGN, SC, pretectum and SCN, not to V1 ("Diverse Central Projection Patterns of Retinal Ganglion Cells", https://pmc.ncbi.nlm.nih.gov/articles/PMC5357325/) | Slide conflict (key); Error (app EX) | EX **fixed**; key kept; professor item P1 |
| D2 | `written-u2-practice-exam-u2-q08` | "lacrimal but not salivary" parasympathetics → VII | key VII; cranial nerve chart (VII, superior salivatory nucleus: "Salivation, lacrimation"); L7/23 | VII also supplies salivary glands, so no option fits the stem | Slide conflict (exam item) | professor item P2 |
| D3 | `written-u3-practice-exam-u3-q20` | posterior circulation → Cerebellum (Hippocampus also offered) | key | PCA supplies the hippocampus (lecture 16 PCA territory: inferior temporal lobe) | Slide conflict (two correct choices) | professor item P2 |
| D4 | `written-u3-practice-exam-u3-q19` (draft) | answer "Basilar artery \| Lenticulostriate arteries" for "NOT posterior circulation" | key marks a and e | basilar is posterior circulation (lab-16/20 checklist) | Slide conflict (key marks two) | stays draft; professor item P2 |
| D5 | `practical-u3-2025-q06` | accepted "inferior horn" for the posterior horn of the lateral ventricle | Lab 13/14 teach the inferior (temporal) horn as a separate part | same | Error (wrong accepted string) | **Fixed** (replaced with "occipital horn") |
| D6 | `practice-practical-lab3-q16`, `practical-u3-2025-q39` | keyword groups were copied sentences ("villi: reabsorb CSF into the dural venous sinus", misspelt "Eldery who fall"), so "Reabsorb CSF" and "Elderly" failed | - | - | Grading defect | **Fixed** |
| D7 | `theory-motor-decussation-connections`, `theory-subthalamic-nucleus-lesion`, `theory-column-of-clarke-level` | see finding 1 and 9.1 | - | - | Grading defect | **Fixed** |
| D8 | `theory-brain-bleeds-lesion` | accepts "biconcave" / "bi-concave" for the epidural shape; EX notes the slide | L18-strokes: "bi-concave pool of blood" | biconvex (lens) shape (https://radiopaedia.org/articles/extradural-haemorrhage-summary) | Slide conflict | professor item P7; owner may drop "biconcave" from the keywords |
| D9 | `written-u2-si-session-5-q16`, `pathways-u2-tectospinal-origin` | tectospinal origin: both colliculi | L10/21 | superior colliculus (A8) | Slide conflict | professor item P4 |
| D10 | `theory-nucleus-proprius-function` | "Fine touch and proprioception" (laminae III-IV) | L5: "Lamina III, IV, V Nucleus Proprius: C fibers carrying pain and temperature"; the app's own ALS cards use nucleus proprius as the 2nd-order neuron for dull pain | Neuroscience Online: "mechanical and temperature sensation", laminae I-IV exteroceptive (https://nba.uth.tmc.edu/neuroscience/m/s2/chapter03.html) | App deviates (and is inconsistent with the app's ALS cards) | answer "Pain and temperature (C fibres; second-order neurons of the anterolateral pathway)", with touch kept in the EX as textbook detail |
| D11 | `theory-nucleus-ambiguus-cranial_nerve` | accepts "XI", "CN XI", "accessory" | CN chart: ambiguus row lists IX and X; XI = C1-C5 spinal accessory nucleus | the cranial root of XI is usually counted as vagal | Imprecise | keep only "cranial root of accessory" |
| D12 | `theory-motor-trigeminal-nucleus-muscle`, `theory-facial-nucleus-muscle` | both accept bare "digastric" | not on slides | anterior belly V3, posterior belly VII | Imprecise | qualify each belly |
| D13 | `practical-u2-2025-q40` | the muscle that changes lens shape: "Ciliary Body" | - | ciliary muscle (within the ciliary body) | Imprecise | accept "ciliary muscle" |
| D14 | `sections-u1-lateral-horn` | "T1 to L2 and S2-S4" | L6: lateral horn S2-S4 | the sacral preganglionics lie in the lateral grey (sacral parasympathetic nucleus); there is no true lateral horn at S2-S4 | Imprecise (follows slides) | none |
| D15 | `theory-anterior-corticospinal-tract-side` (segmental crossing), `theory-superior-cerebellar-peduncle-passes` (ventral spinocerebellar), `theory-anterior-limb-of-internal-capsule-supply` (Heubner) | correct | deeper than the slides | correct | Beyond | supplementary tag (already flagged in PATHWAY_AUDIT section 5) |

## 6. Area E: structure info panels (`content/nsci3250/structures.json`)

| # | Structure / field | App says | Slides | Sources | Class | Action |
|---|---|---|---|---|---|---|
| E1 | `trochlear-nucleus` lesion | "head tilt away from the lesion" | not on slides | nuclear lesion → contralateral SO; tilt away from the weak eye = toward the lesion (https://litfl.com/fourth-cranial-nerve-lesions/) | Error | **Fixed** |
| E2 | `motor-decussation` explanation, `pyramids` connections | "about 90%" | L10/15, Lab 10/19: 80 % | 75-90 % | App deviates (and inconsistent with the cards) | "about 80% (textbooks 75-90%)" |
| E3 | `column-of-clarke` explanation "T1 to L2/L3"; `dorsal-spinocerebellar-tract` "Clarke's nucleus (T1-L2)" | T1 start | L5 C8-L2; Lab 5 key C8-L3 | C8-L3 (Neuroscience Online) | App deviates | "C8 to L3" |
| E4 | `hippocampus` etymology | "the Venetian anatomist Aranzi in 1564" | not on slides | Aranzi was born in and taught at Bologna (https://en.wikipedia.org/wiki/Julius_Caesar_Aranzi); the seahorse/silkworm description is in *Anatomicarum observationum liber* (Venice printing, 1587: https://www.historyofmedicine.com/author/d/giulio-cesare-aranzio-arantius-aranzi); Wikipedia's Hippocampus article itself says "Venetian ... (1587)" | Imprecise (sources disagree on the date) | "...reminded the Bolognese anatomist Giulio Cesare Aranzi (16th century) first of a silkworm and then of a seahorse..." |
| E5 | `oculomotor-nucleus` lesion | nerve-palsy picture | not on slides | nuclear lesion: bilateral ptosis, contralateral superior rectus (https://eyewiki.org/Oculomotor_nerve_palsy) | Imprecise | split nuclear vs nerve lesion |
| E6 | `hippocampus` lesion "Alzheimer disease starts here" | | not on slides | Braak: transentorhinal/entorhinal first (https://pubmed.ncbi.nlm.nih.gov/7566337/) | Imprecise | "affected early, after the entorhinal cortex" |
| E7 | `lamina-terminalis` lesion "opened surgically in third ventriculostomy" | | not on slides | standard ETV opens the tuber cinereum; the lamina terminalis route is an alternative | Imprecise | reword |
| E8 | `trigeminal-nerve` supply "Branches of the external carotid" | | not on slides | ganglion: ICA trunks plus the middle meningeal artery (https://pubmed.ncbi.nlm.nih.gov/31282551/) | Imprecise | reword |
| E9 | `conus-medullaris` supply | "ASA and artery of Adamkiewicz" | not on slides | the anterior and posterior spinal arteries (conus basket), fed by Adamkiewicz | Imprecise | reword |
| E10 | `falx-cerebri`, `cerebellar-tonsil`, `cerebral-aqueduct` etymology stories | falcon link; "tonsa, a stake"; "Franciscus Sylvius" | not on slides | folk etymology / contested / attribution disputed (Wiktionary *falco*, *tonsilla*; https://hekint.org/2023/02/23/the-two-sylvius-anatomists/) | Imprecise | hedge or remove |
| E11 | `tectospinal-tract` connections | both colliculi | L10/21 | superior colliculus | Slide conflict | professor item P4 |

## 7. Area F: blood supply (`src/data/supply-map.json` after the 2026-11-09 rewrite, supply cards)

The ACA, MCA, PCA, ASA and PSA territories now use the slide wording (lecture 16, lab 16/17, lecture 18/26), and they are correct per the slides. Remaining points:

| # | Item | App says | Slides | Sources | Class | Proposed change |
|---|---|---|---|---|---|---|
| F1 | `pica` territory | "...lateral medulla (nucleus ambiguus, solitary and spinal trigeminal nuclei, olive)" | not itemised | the lateral medullary territory lies posterior/dorsolateral to the inferior olive (https://eyewiki.org/Wallenberg_Syndrome); the olive's own supply is mostly vertebral/ASA paramedian (unverified) | Imprecise | drop "olive" from PICA, and make `olives` units `["vert","asa"]` |
| F2 | Posterior limb of the internal capsule | open decision (Lab 16 PCA vs textbook lenticulostriate + AChA) | L18-strokes/26 | textbook | Slide conflict (already recorded as a decision) | none |
| F3 | `asa` "all the motor tracts" | slide quote | Lab 16/17 | the posterior part of the lateral corticospinal tract also gets PSA/vasocorona supply | Slide conflict (minor) | professor item P8 |
| F4 | `superior-parietal-lobule` | arteries `["mca","aca"]` but course text "Middle cerebral artery." | not itemised | ACA-MCA border zone; the medial part is ACA | Imprecise | course text "MCA (lateral) and ACA (medial)" |
| F5 | `dorsal-spinocerebellar-tract` unit | arteries `["psa"]`, course text "Posterior spinal artery and anterior spinal artery branches" | Lab 16/17: ASA supplies "part of each ... lateral funiculus" | peripheral lateral funiculus from the vasocorona (both) | Imprecise (the colour and the text disagree) | arteries `["asa","psa"]` |

## 8. Areas G and H: brainstem levels, atlas extra info, atlas links, loader facts

| # | Item | App says | Slides | Sources | Class | Proposed change |
|---|---|---|---|---|---|---|
| G1 | `brainstem-levels.json` names | "Mid pons", "Mid medulla (obex)", "Caudal medulla" (motor decussation), "Rostral pons (isthmus)" | Lab 8/2, Lab 9/2: Rostral pons = trigeminal level; Caudal medulla = tubercles, sensory decussation; Brainstem/spinal cord junction = motor decussation | standard atlases also use mid pons / mid medulla; both schemes exist | App deviates | 10.3 |
| G2 | `medulla-mid` hallmark "Obex" | obex at the sensory-decussation level | Lab 8/9: at this level "The 4th ventricle is not present" (closed medulla) | the obex marks the caudal tip of the 4th ventricle, at the transition to the open medulla | Imprecise | 10.3 |
| G3 | Vestibular nuclei level | brainstem levels list `vestibulocochlear-complex` at the caudal pons, rostral medulla and mid medulla | L8/19 caudal pons; CN chart pontomedullary junction | caudal pons + rostral medulla (A6) | Slide conflict (the slides disagree with each other) | professor item P6 |
| G4 | `medulla-mid` lists `vestibulocochlear-nerve` (source "course") | | the course plate labels it | CN VIII enters at the pontomedullary junction, rostral to the tubercle level | Imprecise (check the plate label) | brainstem agent to verify against the plate image |
| H1 | `atlasFacts.ts` "The cerebellum holds roughly half of the brain's neurons" | | not on slides | about 80 %: Azevedo et al. 2009 (https://pubmed.ncbi.nlm.nih.gov/19226510/) count 86 billion neurons with only 19 % in the cerebral cortex; the cerebellum holds most of the rest | Imprecise | "about four in five of the brain's neurons" |
| H2 | `atlas-links.json` `conus-medullaris` → mesh `cauda-equina` (approx) | highlights the roots, not the cord tip | Lab 4: conus = end of the cord | | Imprecise | no mesh, or the lowest cord mesh with an "approximate" note |
| H3 | `atlas-links.json` `anterior-spinal-artery` → `vertebral-artery` (approx); `callosomarginal-artery` → `pericallosal-artery` (approx) | lights a different named artery | Lab 16 lists both | | Imprecise | show no mesh, or label "approximate: parent vessel" |
| H4 | `atlas-links.json` `paravermis` → the full hemisphere lobules | same mesh set as `cerebellar-lateral-hemisphere` | L14 zones | | Imprecise (already marked approx) | none, or a medial strip |

`atlas-extra-info.json`: all 82 blurbs were read, and the facts were checked for the cranial nerve branches, venous sinuses, tracts and sulci. No errors were found. For example: V3 the only motor division; the cavernous sinus contents; IPSS; the superior petrosal sinus over the trigeminal root; Lissauer's tract; the lateral vestibulospinal tract uncrossed from Deiters; the medial reticulospinal tract pontine and extensor; the anterior spinocerebellar tract crossing twice; the tectospinal tract from the superior colliculus. Blurbs on non-course structures belong behind the Supplementary gate, as already designed.

## 9. Fixed in this audit (content only; `npm run seed` not run)

### 9.1 Grading defects (19 cards; canonical answer now passes, wrong answers still fail)
`theory-motor-decussation-connections` (`["80","75","85","90"]`), `theory-subthalamic-nucleus-lesion` (+hemiballismus), `theory-column-of-clarke-level` (`T1` → `C8`), `pathways-u2-visual-scn` (+retinohypothalamic), `pathways-u2-visual-where` (dorsal/where), `pathways-u2-acst-target` (answer now ends "on both sides"), `pathways-u1-dcml-decussation` (one group), `pathways-u1-dcml-synapse-1` (medulla group dropped), `clinical-u1-cortex-hemineglect` (+hemineglect), `clinical-u1-cord-lumbar-tap` (one group), `clinical-u1-cord-referred-pain` (+share/converge), `clinical-u1-cord-brown-sequard` (draft; +weakness), `clinical-u2-visual-prosopagnosia` (temporal group dropped), `clinical-u2-motor-decorticate`, `clinical-u2-motor-decerebrate` (one group each), `clinical-u3-bleed-intracerebral` (lenticulostriate group dropped), `clinical-u3-imaging-ct-ischemia` (the answer now states the timing the vignette asks for), `practice-practical-lab3-q16`, `practical-u3-2025-q39` (keyword groups rebuilt).

### 9.2 Content errors (7)
`pathways-u2-corticobulbar-fiber-bundle` (accept + EX), `clinical-u1-cortex-auditory` (EX), `clinical-u2-cn-cn7-lmn` (EX), `pathways-u1-sympathetic-transmitters` (EX tail), `practical-u3-2025-q06` (accept), `written-u2-practice-exam-u2-q21` (EX; key unchanged), `structures.json` `trochlear-nucleus.info.facts.lesion`.

All edits are guarded by the old value (the fix script checks before writing), so none overwrote concurrent work. `node scripts/validate-content.mjs` shows only the 34 existing `bs-plate-*` "pin without image" errors in `brainstem-plates.json`, which this audit did not touch.

## 10. Proposed changes for the agents who own the data (not applied)

### 10.1 `src/data/pathway-map.json`
(a) DSCT through the cervical cord (A1):
```diff
 dsct.neurons[1].stretches[k="tract"]:
-  "cordLevels": ["T","L"],
-  "region": {"T":"the same-side leg","L":"the same-side leg","_":"the same-side limb"}
+  "cordLevels": ["C","T","L"],
+  "region": {"C":"the same-side leg","T":"the same-side leg","L":"the same-side leg","_":"the same-side leg"}
 sites[id="cord-dsct"]:
-  "cord": ["T","L"]
+  "cord": ["C","T","L"]
```
(The root stretch keeps `["T","L"]`: Clarke's column starts at C8.)

(b) V1 lesion must not cut the LGN (A2):
```diff
 sites[id="vis-v1"]:
-  "zones": ["vis-v1","thal-lgn"]
+  "zones": ["vis-v1"]
```
If an LGN lesion is wanted, add a separate site `{"id":"thal-lgn","name":"Lateral geniculate nucleus","group":"Visual pathway","sided":true,"zones":["thal-lgn"]}`.

(c) Basis pontis carries corticobulbar fibres (A3). Add a stretch to `corticobulbar.neurons[0]`, after `ped`:
```json
{"k":"pons","label":"Basis pontis (corticobulbar fibres to the medullary motor nuclei)","phys":"c","zones":["pons-vent"],
 "loss":"voluntary movement of the tongue, palate and pharynx (contralateral tongue weakness, dysarthria)",
 "region":"the tongue and lower face of the opposite side"}
```
(Give it a `path` copied from `lcst/pons`.) Alternatively, rename the site to "Basis pontis (corticospinal fibres)".

(d) Posterior spinal artery (A4):
```diff
 sites[id="cord-psa"]:
-  "name": "Posterior spinal arteries (dorsal columns)", "sided": false,
-  "effects": [{"side":"both","text":"Strength and pain/temperature preserved."}]
+  "name": "Posterior spinal artery (dorsal column and dorsal horn, one side)", "sided": true,
+  "effects": [{"side":"same","text":"At the damaged segments the dorsal horn is lost too: a band of sensory loss on that side. Below the lesion, strength and pain/temperature are largely preserved (anterior spinal artery territory)."}]
```
Case `clinical-u1-cord-posterior-spinal` (a bilateral vignette) can then pass `side` twice, or keep an unsided twin site "Both posterior spinal arteries".

(e) Central cord (A5):
```diff
-  "text": "Dissociated sensory loss: pain and temperature lost in a cape-like band, vibration and position sense preserved (the dorsal columns are spared)."
+  "text": "Dissociated sensory loss: pain and temperature lost in a band over the damaged segments (a 'cape' over the shoulders and arms when the syrinx is cervical); vibration and position sense preserved (the dorsal columns are spared)."
```
(f) Vestibular nuclei (A6):
```diff
- "short": "Vestibular nuclei (medulla)"
+ "short": "Vestibular nuclei (caudal pons and rostral medulla)"
- "label": "Vestibular nuclei (medulla), then the vestibulospinal tract"
+ "label": "Vestibular nuclei (caudal pons and rostral medulla), then the vestibulospinal tract"
```
(g) `vis-parietal` name (A10): `"Optic radiation, parietal route (dorsal fibres: lower field)"`.

### 10.2 `content/nsci3250/pathways.json` (owner of the tracer data; content file, left untouched because the tracer agents read it tonight)
B1: `dsct.neurons[0].synapse` → `"Clarke's nucleus (C8-L3; Lecture 5: C8-L2), ipsilateral"`. B2: `solitary.neurons[0].level` → `"medulla (rostral part: taste; caudal part: visceral)"`. B3: `tectospinal|reticulospinal|vestibulospinal.lesion` → `{"below_decussation":"n/a","above":"n/a"}`; `rubrospinal.lesion.above` → `"lesion above the red nucleus: decorticate posture; below it: decerebrate"`.

### 10.3 `src/data/brainstem-levels.json` (G1, G2)
```diff
- {"slug":"pons-mid","name":"Mid pons", "hallmark":"Motor and principal sensory trigeminal nuclei, middle cerebellar peduncle"
+ {"slug":"pons-mid","name":"Rostral pons (level of the trigeminal nerve)", "hallmark":"Motor and principal sensory trigeminal nuclei, middle cerebellar peduncle"
- {"slug":"pons-rostral","name":"Rostral pons (isthmus)"
+ {"slug":"pons-rostral","name":"Isthmus (upper pons; not one of the course levels)"
- {"slug":"medulla-mid","name":"Mid medulla (obex)","hallmark":"Obex, sensory decussation (internal arcuate fibers)"
+ {"slug":"medulla-mid","name":"Caudal medulla (level of the cuneate and gracile tubercles)","hallmark":"Closed medulla: sensory decussation (internal arcuate fibers)"
- {"slug":"medulla-caudal","name":"Caudal medulla","hallmark":"Closed medulla: pyramidal (motor) decussation"
+ {"slug":"medulla-caudal","name":"Brainstem/spinal cord junction (very caudal medulla)","hallmark":"Pyramidal (motor) decussation"
```
The slugs stay the same, so plates, cards and links keep working; only the displayed names change. Standard names (mid pons, mid medulla) can go in a secondary "also called" line.

### 10.4 `src/data/supply-map.json`
F1: `pica.territory` → "Inferior vermis and tonsil, inferior cerebellar peduncle, lateral medulla (nucleus ambiguus, spinal trigeminal nucleus and tract, solitary nucleus, vestibular nuclei, anterolateral tract)"; unit `olives` arteries → `["vert","asa"]`, course "Vertebral and anterior spinal artery branches". F4: `superior-parietal-lobule.course` → "Middle cerebral artery (lateral) and anterior cerebral artery (medial part)." F5: `dorsal-spinocerebellar-tract.arteries` → `["asa","psa"]`.

### 10.5 Code text
`src/components/atlas/ui/atlasFacts.ts`: "The cerebellum holds roughly half of the brain's neurons while taking up about a tenth of its volume." → "The cerebellum holds about four in five of the brain's neurons while taking up about a tenth of its volume." (Azevedo et al. 2009, https://pubmed.ncbi.nlm.nih.gov/19226510/: 86 billion neurons, 19 % in the cerebral cortex).

### 10.6 Content items proposed, not applied (Imprecise / App deviates; owner's call)
D10, D11, D12, D13, E2-E10 and C9-C10, worded as in the tables above.

## 11. For the professor (append to the content-review report)

Items found after the November 7 report. Each follows the course material in the app today.

**P1. Unit 2 practice exam, Q21.** "Which brain region receives direct input from retinal ganglion cells?" The key marks (e) "All of the above", which includes (d) primary visual cortex. Lecture 11 (slides 16 and 18) teaches that retinal ganglion cells reach V1 only through the LGN and the optic radiations; direct retinal targets are the LGN, superior colliculus, pretectum and suprachiasmatic nucleus (https://pmc.ncbi.nlm.nih.gov/articles/PMC5357325/). *Suggested change:* replace option (d) with "Pretectal nucleus", or key the question "a, b and c".

**P2. Other practice-exam items.**
- **Unit 2 Q8.** "Which cranial nerve carries parasympathetic fibers to the lacrimal gland but does not provide parasympathetic innervation to the salivary gland?" The key is VII, but VII (superior salivatory nucleus, chorda tympani) also supplies the submandibular and sublingual glands (cranial nerve chart: "Salivation, lacrimation"; Lecture 7 slide 23; StatPearls CN VII, https://www.ncbi.nlm.nih.gov/books/NBK554569/). No option fits the stem as written. *Suggested change:* "...to the lacrimal gland and the submandibular gland?"
- **Unit 3 Q20.** "Which structure receives its blood supply from the posterior circulation?" The key is cerebellum, but the hippocampus (also offered) is PCA territory (Lecture 16: the PCA supplies the inferior/medial temporal lobe). *Suggested change:* replace the hippocampus distractor (e.g. with "Putamen").
- **Unit 3 Q19.** "Not part of the posterior circulation": the key marks both (a) basilar artery and (e) lenticulostriate arteries. The basilar artery is posterior circulation (Lab 16 slide 20 checklist). *Suggested change:* key (e) only.

**P3. "Spastic paralysis ... creates rigidity in the limbs" (Lecture 10 slide 4; Lecture 6).** Clinically, spasticity (velocity-dependent, clasp-knife; UMN lesion) is distinguished from rigidity (velocity-independent, lead-pipe or cogwheel; basal ganglia) (https://med.stanford.edu/stanfordmedicine25/blog/archive/2016/Spasticity-versus-Rigidity-Stanford-25-Skills-Symposium-2015.html). *Suggested change:* "This creates increased tone (spasticity) in the limbs."

**P4. Origin of the tectospinal tract (Lecture 10 slide 21; SI session 5 Q16).** The slides give both colliculi. Standard references give the deep layers of the superior colliculus, with crossing in the dorsal tegmental decussation (https://statpearls.com/point-of-care/36620). *Suggested change:* "...originates mainly from the superior colliculus (with input from the inferior colliculus)."

**P5. "Tunnel vision" for chiasmal lesions (Lecture 11 slide 20).** Bitemporal hemianopia is loss of both temporal hemifields. It is not the concentric constriction usually meant by "tunnel vision" (glaucoma, retinitis pigmentosa) (https://www.britannica.com/science/visual-field-defect; https://ditki.com/course/neuroanatomy/glossary/term/visual-field-defect-bitemporal-hemianopia). *Suggested change:* "...bitemporal hemianopia: loss of the outer (temporal) half of the visual field of each eye."

**P6. Level of the vestibular nuclei.** The three course sources disagree:
- Lecture 8 slide 19: "vestibular nuclei of the caudal pons".
- Lecture 10 (vestibulospinal): "vestibular complex in medulla".
- Cranial nerve chart: "pontomedullary junction (shown in rostral medulla)".

All three are partly right: the complex spans the caudal pons and the rostral medulla (https://nba.uth.tmc.edu/neuroanatomy/L7/Lab07p19_index.html). *Suggested change:* use "caudal pons and rostral medulla" in all three. The app uses that wording.

**P7. Shape of an epidural hematoma (Lecture 18, strokes and bleeds).** The slide says "characteristic bi-concave pool of blood". On CT an epidural hematoma is biconvex (lens- or lemon-shaped) (https://radiopaedia.org/articles/extradural-haemorrhage-summary). *Suggested change:* "biconvex". The app teaches biconvex and still accepts "bi-concave" from the slide.

**P8. Spinal cord supply (Lab 16 slide 17), minor.** "All the motor tracts" go to the anterior spinal artery. The posterior part of the lateral corticospinal tract also receives posterior spinal / pial (vasocorona) supply. *Suggested change (optional):* "...most of the motor tracts".

**P9. Earlier owner questions still open** (from `docs/PATHWAY_AUDIT.md`), not yet in the professor report: OQ5 (uncrossed dorsal trigeminothalamic component), OQ8 (no auditory decussation taught, though Lecture 5 slide 20 says "all sounds go to both sides"), OQ12 ("bronchodilation" listed as parasympathetic on Lecture 6 slide 22; the parasympathetic effect is bronchoconstriction, as Lecture 7 slide 25 says).

## 12. Unverified and not audited

**Unverified (suspected, no source confirmed):**
- PICA vs vertebral supply of the inferior olive itself (F1).
- Corticobulbar vs corticospinal input to the spinal accessory nucleus (C9).
- Crossed trigeminothalamic fibres in the lateral pontine tegmentum (A11).
- The `vestibulocochlear-nerve` label at the tubercle level (G4).
- `edinger-westphal-nucleus` lesion "blown pupil in uncal herniation" describes nerve compression, not a nuclear lesion.
- `solitary-nucleus` lesion "loss of taste and gag reflex": the gag efferent is the nucleus ambiguus.
- `denticulate-ligaments` "21 points": the usual figure is 21 pairs.
- The `sacral-vertebrae` and `temporal-bone` etymology stories.

**Not audited:**
- The 1564 image-occlusion pin labels. `CARD_LABEL_AUDIT.md` covered them; only pins with explain texts were read here.
- The pathway diagram text in `src/components/atlas/pathways/diagram/*` and `anatomySpec.ts`/`receptorInfo.ts`. These are uncommitted work by the diagram agent, being rebuilt tonight.
- The brainstem plate region polygons (`src/data/brainstem-plates/*`), checked only by name through `brainstem-levels.json`.
- `brainstem-course.json` and `brainstem-open.json` labels, beyond the level titles.
- The 3D mesh correctness behind `atlas-links.json`. Only mapping names were checked; meshes were not inspected visually.
- `pronunciations.json` and `atlas-skull.json`.
- About 150 "beyond the slides" facts in `structures.json`. They were read and found correct, but not itemised.
