# Pathway audit: app content against the course slides

Owner's instruction: "Review all the slides and make sure the pathways are covered to the depth of the slides, not more nor less."
Rule used: where the app contradicts a slide, the slide wins; where two slides disagree, it is an owner question (OQ) below.
Slide references are `<deck>/<slide number>` (decks under `content-build/decks/`). `L5` = lecture-05, `lab-9` = lab-09, and so on.

Decks read in full for this audit: lectures 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 18 (strokes and CNS pathology), parts of 2, 3, 16; labs 5, 9, 10, 11; both sensory cheat sheets; the cranial nerve chart; practice exams u1-u3 and SI sessions (question text). Lab 9/10/11 answer keys are page images with almost no text, so their answers were taken from the lab slides themselves (Lab 5's key is text and was used).

## 1. What was edited and what was not

Edited (content only; slugs unchanged; seeded with `npm run seed`, which upserts by slug and retires only slugs that vanished from the JSON, none did):
- `content/nsci3250/pathways.json`: 28 entries trimmed or deepened to slide level, plus 5 new entries (`cochlear`, `vestibular`, `solitary`, `stretch-reflex`, `withdrawal-reflex`). The tracer and lesion lab ignore entries that have no `pathway-map.json` twin (they filter on `PATHWAY_MAP[slug]`), so the new entries do not show up there until the map owner adds them.
- `content/nsci3250/cards/pathways-u1/u2/u3.json`: 10 existing cards corrected, 29 new cards added (9 in u1, 15 in u2, 5 in u3), all `"status": "draft"` with a `review_note`. Totals: 226 cards before, 255 after, 31 draft (2 were already draft).
- Not edited: `src/data/pathway-map.json`, `LesionLab.tsx`, `src/lib/atlas/pathways.ts` (their corrections are in `docs/pathway-audit.json`, 37 entries), and every card file outside `pathways-u*` (findings in section 5).
- Caution: `tools/content/build_pathways.py` generates these four files. Re-running it would overwrite this audit's edits. Port the edits into the script or retire the script.

## 2. Pathways: slides vs app

Slides teach (counting separately named circuits): 38. In the app before the audit: 28 in `pathways.json` and in `pathway-map.json`, plus card-only groups `extrapyramidal` and `cochlear`. After the audit: 33 in `pathways.json`; `pathway-map.json` still 28.

Verdict key: OK = matches the slides; DEEP = app says more than the slides; SHALLOW = slides say more; DERIVED = not on a slide but follows directly from slide rules (kept, flagged).

| Pathway | Slides say (ref) | App said | Verdict and action |
|---|---|---|---|
| DCML (body) | 1st: DRG, A-alpha 1a/1b and A-beta; dorsal funiculus; gracile (below T6, legs) / cuneate (above T6, arms) fasciculi; sacral fibres medial, cervical lateral (L5/19); synapse in ipsilateral gracile/cuneate nucleus, caudal medulla; internal arcuate fibres cross (L9/15); medial lemniscus; VPL; "internal capsule"; BA 3,1,2 (L5/17, L9/12, cheat sheet) | Same, but "internal capsule (posterior limb)" in pathways.json, one card and the map | DEEP: "posterior limb" removed in pathways.json and card (map in audit json). SHALLOW: dorsal-column somatotopy added to pathways.json; medial lemniscus topography flip (lab-9/9, 9/11, 9/15) added as a draft card |
| Anterolateral (ALST) | A-delta to marginal zone, C to substantia gelatinosa/nucleus proprius; 2nd order crosses by ventral white commissure; anterior/lateral funiculi; VPL; internal capsule; brainstem pain centres, PAG modulation, insula/ACC (L5/21-24) | Same, plus "1-2 segments below the lesion" | DEEP: "1-2 segments" removed from pathways.json, one card (map in audit json). SHALLOW: ascending/emotional component (insula, ACC) added as draft card |
| DSCT (lower limb) | A-alpha Ia/Ib; Clarke's nucleus "C8-L2" (L5/15) but "C8-L3" in the Lab 5 key; lateral funiculus; ICP; ipsilateral cerebellum; upper-limb tract and tracts below L3 "not learned" | C8-L2, rest same | OK. Card now accepts L2 or L3 (OQ1). Correctly omits ventral and cuneocerebellar tracts |
| Sympathetic | T1-L2 lateral horn; short pre, long post; paravertebral/prevertebral; ACh then NE; ventral root exit; adrenal medulla (L6/16-24) | Same | OK |
| Parasympathetic | CN III, VII, IX, X and S2-S4; long pre, short post; ACh; named nuclei EW, SSN, ISN, DMX (L7/28, CN chart) | Generic nuclei | SHALLOW: nuclei named in pathways.json |
| UMN / LMN | UMN layer V cortex; LMN ventral horn or brainstem; spastic vs flaccid; alpha/gamma (L6/3, L10/3-4) | Same | OK (one card trimmed: "hyperreflexia" not on a slide) |
| Trigeminal discriminative | Trigeminal ganglion (middle cranial fossa) to principal nucleus (rostral pons); 2nd order crosses (lab-9/13); trigeminal lemniscus into medial lemniscus; contralateral VPM (L9/16-17) | Same | OK. Textbook difference in OQ5 |
| Trigeminal pain/temp | Ganglion to spinal V nucleus (long column, largest in caudal medulla); input from CN V, VII, IX, X with regions; crosses; trigeminothalamic tract beside ALST; VPM (L9/21-24) | Same, plus named geniculate/glossopharyngeal/vagal ganglia | DEEP: ganglia names removed. SHALLOW: regions served by each nerve added to modality |
| Jaw-jerk (mesencephalic V) | Cell bodies inside the CNS; monosynaptic to motor V (L9/10) | Same | OK |
| Lateral corticospinal | Layer V; corona radiata, internal capsule ("anterior limb and genu"), peduncle, longitudinal pons, pyramid; 80% cross at the motor decussation; lateral funiculus; ipsilateral lateral ventral horn; distal limbs; C5-T1 / L2-S3 (L10/12-15) | Same, but "posterior limb" in the map; "85, 90" accepted on the % card | CONTRADICTION: map says posterior limb, lecture says anterior limb and genu (OQ2, map entry in audit json). % card now accepts 80 only |
| Anterior corticospinal | 20% uncrossed; anterior funiculus; bilateral medial ventral horn; axial/proximal; from trunk cortex (L10/14-15, lab-10/3, 10/21) | Same plus "cervical / upper thoracic" | DEEP: level removed |
| Corticobulbar | Layer V; ends in midbrain (red nucleus, RF), pons (facial, RF), medulla (hypoglossal, ambiguus, RF); drawn as crossing just above each nucleus (L10/13-14, lab-10/2); control of eye movement separate | Same, plus "forehead spared" (map), "medial part of peduncle" (map) | DEEP: forehead sparing and "medial part" are not on a slide (OQ6, map entries in audit json). SHALLOW: terminations by level added |
| Corticopontocerebellar | Corticopontine fibres end in ipsilateral pontine nuclei; transverse fibres cross; MCP; contralateral cerebellum; ~50% of midbrain efferents (L10/11, L14/11, lab-10/4) | Same | OK |
| Rubrospinal | Red nucleus; contralateral upper-limb flexion; tegmentum then lateral funiculus beside LCST; tonic cortical inhibition; decorticate vs decerebrate (L10/19-20, L14/19) | "ventral tegmental decussation" | DEEP: named decussation not in slides; removed in pathways.json (map in audit json). Red nucleus "dorsal midbrain" vs "rostral midbrain" in the slides: OQ3 |
| Tectospinal | Colliculi; tegmentum; cervical and upper thoracic LMNs; neck and trunk; turns head to sight/sound; anterior funiculus (L10/21, L14/5) | "dorsal tegmental decussation" | DEEP: decussation not in slides; removed. SHALLOW: level and funiculus added |
| Reticulospinal | Pontine (extension of axial and limb muscles) vs medullary (inhibits extensor LMNs, facilitates flexion); posture, stepping; anterior funiculus (L10/22) | "mostly ipsilateral" | DEEP: removed |
| Vestibulospinal | Vestibular complex in medulla; axial LMNs; posture and righting; anterior funiculus (L10/23, L14/5, 14/10) | "mostly ipsilateral" | DEEP: removed |
| Visual (main) | Photoreceptor, bipolar (1st order), ganglion (2nd order), LGN (3rd); nasal fibres cross; retinotopy; upper field in inferior V1; deficits: nerve, chiasm "tunnel vision", tract "entire visual field", V1 quadrantopia/hemianopia with or without macular sparing (L11/8, 11/18-21) | Order 1 "photoreceptors to bipolar"; lesion rules for nerve and tract only | SHALLOW: chiasm and V1 deficits, SCN and SC/pretectal branches, retinotopy added. Convention for 1st order: OQ7 |
| Visual: other branches, what/where, blindsight | SCN (circadian), superior colliculus/pretectal; ventral/dorsal streams; blindsight (L11/16-17, 11/22, 11/24) | Cards only | OK in cards; now also in pathways.json text |
| Pupillary light reflex | CN II to pretectal nucleus (near superior colliculus), both Edinger-Westphal nuclei, CN III, ciliary ganglion, sphincter pupillae; consensual (L11/7, L12/10, L7/18, lab-11/11) | "posterior commissure" | DEEP: commissure removed (map in audit json). SHALLOW: ciliary ganglion added |
| Accommodation | Ciliary muscle via EW/CN III; with pupil constriction and convergence (L11/6) | Not a pathway (one theory card) | GAP (low): mentioned in the pupillary entry only |
| Corneal blink | CN V, spinal V nucleus, facial nucleus, both eyes blink (L12/3, 12/5; practice exam u2 Q26) | Same | OK |
| Horizontal gaze / MLF | Right FEF to left PPRF to left abducens; MLF to right oculomotor; MLF lesion gives disconjugate gaze, convergence intact; MLF runs caudal pons to rostral midbrain (L11/25-27, lab-11/4) | Same, but used "internuclear ophthalmoplegia" | DEEP (term only): replaced with the slide's wording |
| VOR / saccades / pursuit / vergence | L11/23, L11/28, L14/10 | Cards (vor, sc, fef) | OK; pursuit and vergence have no card (GAP, low) |
| Cerebellar circuit | Inputs: contralateral pontine (MCP), ipsilateral DSCT (ICP), ipsilateral vestibular, contralateral olive (ICP); mossy/climbing; Purkinje inhibitory; deep nuclei excitatory; SCP to contralateral red nucleus and VA/VL; X/SCP at inferior colliculus level; also vestibular nucleus and reticular formation; zones and deep nuclei; "double crossing" (L14/11-18, lab-10/4, 10/9) | Same, without brainstem UMN targets | SHALLOW: brainstem targets added. Vestibular peduncle (ICP vs MCP): OQ4 |
| Basal ganglia | Cortex to striatum; direct go (striatum inhibits GPi); indirect no-go (GPe, STN); SNc dopamine D1/D2; GPi to VA/VL; hyperkinesia (ballismus, Huntington) vs hypokinesia (Parkinson) (L14/23-31) | pathways.json and map: cortex-striatum-GPi-thalamus only; cards cover direct/indirect/D1/D2 | SHALLOW: pathways.json text expanded; map needs the same (audit json) |
| Olfactory | Receptor neuron (bipolar, cribriform plate) to bulb (mitral); tract to olfactory tubercle and prepiriform cortex; MD thalamus to orbitofrontal; hypothalamus/limbic via entorhinal cortex and hippocampus; bypasses thalamus first (L15/11-15) | Targets included amygdala | DEEP: amygdala removed (pathways.json, card; map in audit json). SHALLOW: entorhinal/hippocampus added |
| Hippocampus-fornix | Fornix crus, body, column (lab-14); to mammillary bodies, septal nuclei, basal forebrain (L15/18; anterior thalamic nuclei only in L2/30 notes); consolidation not retrieval | Same | OK |
| Amygdala efferent | Central nucleus; stria terminalis; BNST, hypothalamus, DMX (L15/23) | Same | OK |
| Septal-habenular | Septal nuclei; stria medullaris thalami; habenula (L15/26) | Same | OK |
| Reward | VTA/VTN dopamine; medial ("median" in L15/17) forebrain bundle; nucleus accumbens (L2/33, L15/17, 15/25) | Same | OK. Card now accepts "median forebrain" and "VTN" (slide wording) |
| Auditory | Spiral ganglion; cochlear nuclei (rostral medulla); inferior colliculus; MGN; primary auditory cortex (BA 41/42); "be familiar with the structures, do not memorize the pathway" (L8/18-19, L7/6, L5/20, lab-3/21) | Cards only (3), no pathways.json entry | SHALLOW: pathways.json entry and 3 draft cards. No decussation is taught (OQ8) |
| Vestibular | Vestibular ganglion; vestibular nuclei and cerebellum; thalamus then cortex (perception); ascending MLF to III/IV/VI (eyes opposite head); descending MLF to cervical cord; vestibulospinal; canals vs otoliths (L8/19, L14/7-10, L11/28) | One card; vestibulospinal only | SHALLOW: pathways.json entry and 3 draft cards |
| Solitary nucleus: taste and visceral reflexes | Rostral: taste from VII, IX, X to SSN/ISN (salivation) and DMX; caudal: baroreceptor, chemoreceptor, GI input to DMX, nucleus ambiguus and lateral horn T1-L2 (L7/22-24, L8/22) | Not a pathway | GAP closed: pathways.json entry and 4 draft cards |
| Stretch reflex (monosynaptic) | Reflex arc parts; spindle Ia afferent; no interneuron; knee jerk L3/L4 image (L10/9, L5/9, L6/6; objective on L10/1) | Absent | GAP closed: entry and 4 draft cards |
| Withdrawal reflex (polysynaptic) | Interneurons; modulated from the brain; "withdrawing your hand" (L10/9, L6/6, L5/8) | Absent | GAP closed: entry and 2 draft cards (classification read from the L10/9 diagram; noted on the card) |

## 3. Beyond the slides (app has it, slides do not)

Fixed in my files (pathways.json and pathways cards):
- "Posterior limb" for third-order sensory axons (DCML card and pathways.json).
- "1-2 segments below the lesion" (ALST).
- "Cervical / upper thoracic" for the anterior corticospinal target.
- Named decussations for rubrospinal ("ventral tegmental"), tectospinal ("dorsal tegmental") and pupillary ("posterior commissure"); "mostly ipsilateral" for reticulospinal and vestibulospinal.
- Amygdala as an olfactory target; named ganglia in trigeminal pain; "hyperreflexia" on UMN cards; "internuclear ophthalmoplegia" in the gaze lesion text.
- 85% and 90% accepted for the motor decussation card (slides: 80%).

In `pathway-map.json` and the lesion engine data (for the other agent; exact strings in `docs/pathway-audit.json`):
- Named syndromes with no slide: Brown-Sequard, central cord (syrinx), lateral medullary (Wallenberg, PICA, Horner), medial medullary, Weber, locked-in, Millard-Gubler.
- "Cruciate" paralysis, corticobulbar forehead sparing, "medial part" of the peduncle.
- Cerebellar signs: intention tremor, dysmetria, dysdiadochokinesia, wide-based gait (slides: ataxia, lack of coordination).
- Parkinson "rigidity, shuffling gait, bilateral asymmetric"; "hemi" and "opposite arm and leg" for ballismus; Huntington "GABAergic"; macular-sparing blood-supply explanation.
- Body-side effect of basal ganglia lesions (the slides never give a side).

## 4. Gaps (slides teach, app lacks or lacked)

Closed with draft cards and/or pathways.json entries: stretch and withdrawal reflex; reflex arc parts and descending modulation; central pattern generators (L6/7, L14/3); solitary nucleus taste and visceral reflexes; respiratory control (diaphragm C3-C5, L7/25); raphe and locus coeruleus, ARAS (L7/21, 7/27); auditory chain (IC reflex, MGN, cortex); vestibular outputs and organs; olfactory entorhinal route; cerebellar brainstem targets, olive drive, double crossing; corticobulbar termination levels; pyramid damage spares gross movement (L14/5 notes); limbic tract list including the cingulum (L15/6); brainstem pain-centre emotional route (insula, ACC); medial lemniscus topography flip.

Still open (low priority or needs the map/owner):
- `pathway-map.json` has none of the new pathways (the tracer shows only mapped ones) and its basal ganglia entry is shallow.
- No card for smooth pursuit, vergence, accommodation as a pathway, referred pain mechanism beyond the clinical card, area postrema/vomiting pathway, or the enteric peristaltic reflex (lecture 19, not a CNS pathway).
- Lecture 5 slide 20 thalamic relay table (VPL/VPM, VL, LGN, MGN, pulvinar, anterior nucleus) exists as scattered cards only.
- Lecture 18 strokes: MCA/ACA/PCA deficit lists (face and arm, leg, vision) are covered by `clinical-u3`, not by pathway cards.

## 5. Findings outside my files (card owner, not edited)

These live cards disagree with or go beyond the slides:
- `theory-motor-decussation-connections`: "About 90%"; slides say 80% (L10/14, L14/4, lab-10/19). Contradiction.
- `theory-posterior-limb-of-internal-capsule-passes` / `-lesion` and `theory-internal-capsule-lesion`: place corticospinal fibres in the posterior limb; L10/12 says anterior limb and genu (OQ2).
- `theory-anterior-corticospinal-tract-side`: "decussates at the segmental level in the ventral white commissure"; slides say uncrossed in the medulla, bilateral termination, nothing about segmental crossing.
- `theory-superior-cerebellar-peduncle-passes`: lists the ventral spinocerebellar tract; lab-5/9 says that tract is not taught.
- `theory-optic-radiations-lesion` (Meyer loop, pie in the sky), `theory-cerebral-peduncles-lesion` (Weber), `theory-medial-longitudinal-fasciculus-lesion` (internuclear ophthalmoplegia), `theory-subthalamic-nucleus-lesion` (hemiballismus contralateral), `theory-lateral-corticospinal-tract-connections` ("via interneurons"): terms or details not on slides.
- `clinical-u1-cortex-auditory`: "mostly in the contralateral ear"; L18-strokes/24 says a left MCA stroke gives "slight bilateral loss of hearing".
- `clinical-u2-motor-cerebellar` (live): intention tremor, dysmetria, wide-based gait; `clinical-u3-bg-parkinson` (live): rigidity, shuffling gait. Beyond slide wording.
- Already draft and correctly flagged by the earlier content pass: Brown-Sequard, medial and lateral medullary, Weber, locked-in, Millard-Gubler, lateral-horn Horner, CN VII UMN forehead sparing, FEF gaze palsy, DSCT vignette.

## 6. Owner questions

- OQ1. Clarke's nucleus extent: L5/15 says C8-L2 and DSCT "from L2 up"; the Lab 5 key (answers p3, p9) says C8-L3 and DSCT C1-L3, and "below L3 another tract we are not learning". The app uses C8-L2; the card now accepts L2 or L3. Which is examinable?
- OQ2. Internal capsule limb for corticospinal/corticobulbar fibres: L10/12 says anterior limb and genu; most textbooks say genu and posterior limb; L18-strokes/26 puts "thalamus and posterior limb" under the PCA and "anterior limb" under the MCA, and L16/25 gives the anterior limb to the lenticulostriate (MCA, ACA) supply. The app (map, theory cards, lesion lab) says posterior limb. Card `pathways-u2-lcst-capsule` was left draft by the earlier pass and is the slide answer; publish it or not?
- OQ3. Red nucleus: "dorsal midbrain" (L10/18, L14/5) vs "rostral midbrain" (L10/19) vs "dorsal to the substantia nigra" (lab-10/7). The app says rostral midbrain.
- OQ4. Vestibular input to the cerebellum: ICP (L10/17), MCP (L14/11), ICP and MCP (L14/12, L14/16). The app says ICP and MCP.
- OQ5. Trigeminal discriminative touch: the slides cross all second-order fibres to the contralateral VPM (L9/16, lab-9/13). Standard texts describe an uncrossed dorsal component from the principal nucleus. Keep the slide rule?
- OQ6. Corticobulbar UMN lesion: forehead sparing from bilateral input is not on any slide; practice exam u2 Q9 tests only LMN (Bell's palsy, upper and lower face). Teach it or drop it?
- OQ7. Retinal convention: L11/8 calls bipolar cells first-order and ganglion cells second-order, then LGN third-order; the previous app version started at photoreceptors. `pathways-u2-visual-first-order` is draft; confirm.
- OQ8. Auditory pathway: the slides say only "be familiar with the structures" and teach no decussation, but L18-strokes/24 implies bilateral representation. How deep should the cards go?
- OQ9. Lumbosacral plexus is "L4-S3" on L10/5 but limb LMNs are "L2-S3" on L10/6. The limb-plexus card accepts both.
- OQ10. Spinal trigeminal nucleus level: L9/24 and the Lab 9 labelling put it in pons and medulla, largest in caudal medulla; the extended cheat sheet lists "brainstem-spinal cord junction, caudal medulla, rostral medulla". The app uses the lecture.
- OQ11. Cheat sheet says the anterolateral tract "Location: Ventral Funiculus"; L5/21 says anterior/lateral funiculi. The app uses the lecture.
- OQ12. L6/22 lists "bronchodilation" under parasympathetic effects (and L6/19 "bronchi dilation" for sympathetic); the parasympathetic effect is bronchoconstriction (L7/25 says DMX gives bronchoconstriction). Slide typo; the app avoids the claim.
- OQ13. Slides name no brainstem or spinal syndromes. Keep the draft clinical cards and lesion-lab sites for Brown-Sequard, Wallenberg, medial medullary, Weber and locked-in as "beyond the course" extras, or remove them?
