"""CONTENT-3: clinical vignette cards (lesion -> deficit, deficit -> lesion). Run with -I."""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import Deck

D = Deck("clinical", "clinical-{u}", "clinical", "clinical")
K = D.add
STD = "Not in the course slides (standard neuroanatomy); TA owner to confirm it is in scope."


def c(unit, g, step, vignette, prompt, answer, kw, structures=None, src="", note=None, accept=None):
    K(unit, g, step, prompt, answer, kw, vignette=vignette, srcref=src, note=note, accept=accept,
      extra={"structures": structures or []}, fmt="keywords")


# ---------------------------------------------------------------- UNIT 1
c("u1", "cord", "dorsal-column", "A man has lost vibration sense and joint position sense in his right leg and foot. Pain and temperature sensation are normal. Strength is normal.",
  "Where is the lesion?", "Right dorsal column (fasciculus gracilis) of the spinal cord, ipsilateral, below the sensory decussation",
  [["dorsal column", "fasciculus gracilis", "gracile", "posterior column"], ["right", "ipsilateral", "same"]], ["dorsal-columns", "fasciculus-gracilis"], "lecture-5")
c("u1", "cord", "alst-lesion", "A patient cannot feel pinprick or hot/cold on the left leg and trunk below the umbilicus. Vibration and strength are intact on both sides.",
  "Which tract is damaged, and on which side?", "Right anterolateral (spinothalamic) tract, contralateral to the deficit, a segment or two above the level of loss",
  [["anterolateral", "spinothalamic"], ["right", "contralateral", "opposite"]], ["anterolateral-spinothalamic-tract"], "lecture-5")
c("u1", "cord", "dsct-lesion", "A patient has an uncoordinated gait with poor limb position awareness in the left leg, without weakness and without loss of pain sense.",
  "Which spinal pathway is most likely damaged?", "Left dorsal spinocerebellar tract (unconscious proprioception), ipsilateral",
  [["dorsal spinocerebellar", "spinocerebellar"], ["left", "ipsilateral", "same"]], ["dorsal-spinocerebellar-tract"], "lecture-5", note="Vignette synthesised from lecture 5 pathway content; no direct course vignette.")
c("u1", "cord", "umn", "After a stroke a patient has a stiff, weak right arm and leg with brisk reflexes and an upgoing great toe on plantar stimulation.",
  "Is this an upper or lower motor neuron lesion, and what is the paralysis called?", "Upper motor neuron lesion: spastic paralysis",
  [["upper"], ["spastic"]], [], "lecture-6, lecture-10")
c("u1", "cord", "lmn", "A patient has a floppy, wasted right forearm with absent reflexes and fasciculations after a nerve injury.",
  "Is this an upper or lower motor neuron lesion, and what is the paralysis called?", "Lower motor neuron lesion: flaccid paralysis with atrophy",
  [["lower"], ["flaccid"]], [], "lecture-6, lecture-10")
c("u1", "cord", "brown-sequard", "A stab wound hemisects the right side of the spinal cord at T10. Examine the patient below the level of the lesion.",
  "Describe the deficits on each side.", "Right: spastic weakness and loss of vibration/proprioception (ipsilateral); left: loss of pain and temperature (contralateral)",
  [["right", "ipsilateral"], ["weak", "motor", "corticospinal"], ["left", "contralateral"], ["pain", "temperature"]], [], "STANDARD", note=STD + " Derived from lecture 5/10 tract positions.")
c("u1", "cord", "anterior-spinal", "A man develops sudden paralysis and loss of pain and temperature sensation below T8 on both sides, but vibration sense and proprioception are preserved.",
  "Which vessel is occluded, and why is the dorsal column spared?", "Anterior spinal artery; the dorsal columns are supplied by the two posterior spinal arteries",
  [["anterior spinal"], ["posterior spinal", "dorsal columns spared", "spared"]], ["anterior-spinal-artery", "posterior-spinal-arteries"], "lecture-16, lab-16")
c("u1", "cord", "posterior-spinal", "A patient has bilateral loss of vibration and position sense with preserved strength and pain sensation after surgery.",
  "Which arteries are most likely compromised?", "Posterior spinal arteries (supply the dorsal columns and part of the dorsal horns)",
  [["posterior spinal"]], ["posterior-spinal-arteries"], "lab-16")
c("u1", "cord", "lateral-horn", "A patient with a cervical cord lesion at C8-T1 has ipsilateral ptosis, miosis and anhidrosis.",
  "Which cell group is interrupted?", "Sympathetic preganglionic neurons of the lateral (intermediolateral) horn / descending sympathetic fibers (Horner syndrome)",
  [["lateral horn", "intermediolateral", "sympathetic", "horner"]], ["lateral-horn"], "STANDARD", note=STD)
c("u1", "cord", "cauda-equina", "A patient has low back pain, saddle anaesthesia and urinary retention with flaccid leg weakness.",
  "Which structure is compressed?", "Cauda equina (lumbosacral roots below the conus medullaris): a lower motor neuron picture",
  [["cauda equina"]], ["cauda-equina"], "lecture-4")
c("u1", "cord", "lumbar-tap", "A needle is placed between L3 and L4 to sample CSF.",
  "Why is this level considered safe?", "The adult spinal cord ends at L1/L2 (conus medullaris); below it only the cauda equina floats in the lumbar cistern",
  [["l1", "l2", "conus"], ["cauda equina", "no cord"]], ["conus-medullaris", "cauda-equina"], "lecture-4")
c("u1", "cord", "dermatome", "A patient with a dorsal root lesion has numbness over a strip of skin of the thigh.",
  "What is the name of the skin territory supplied by a single spinal nerve root?", "Dermatome",
  [["dermatome"]], ["spinal-nerves"], "lecture-5")
c("u1", "cord", "referred-pain", "A man with a cardiac event feels pain in the left arm. Another patient with diaphragm irritation feels pain at the tip of the shoulder.",
  "Why does diaphragm irritation refer to the shoulder?", "The diaphragm is innervated by C3-C5 (phrenic nerve), the same dermatomes as the shoulder; dorsal horn neurons receive both inputs",
  [["c3", "c4", "c5", "phrenic"], ["dermatome", "dorsal horn", "same"]], [], "lecture-9")
c("u1", "cord", "fp-neuropathy", "A fracture through the cribriform plate of the anterior cranial fossa follows a car crash.",
  "Which sense is lost and which cranial nerve is damaged?", "Smell (anosmia), olfactory nerve (CN I)", [["smell", "anosmia"], ["olfactory", "cn i", "i"]], ["olfactory-nerve", "anterior-cranial-fossa"], "theory-u1")
c("u1", "cortex", "broca", "A patient understands speech but speaks in effortful, halting phrases of few words. Repetition is impaired.",
  "Which cortical area is damaged and what is the aphasia called?", "Broca's area (inferior frontal gyrus, left); Broca's (expressive) aphasia",
  [["broca"], ["inferior frontal", "frontal", "expressive", "motor"]], ["broca-s-area"], "practical-u1-2025 Q22")
c("u1", "cortex", "wernicke", "A patient speaks fluently but with meaningless words and cannot understand spoken commands.",
  "Which area is damaged and what is the aphasia called?", "Wernicke's area (posterior superior temporal gyrus, left); Wernicke's (receptive) aphasia",
  [["wernicke"], ["superior temporal", "temporal", "receptive", "fluent"]], ["wernicke-s-area"], "lecture-3")
c("u1", "cortex", "hemineglect", "A patient with a right parietal lesion ignores the left side of space, does not dress the left side and misses food on the left of her plate.",
  "What syndrome is this?", "Hemineglect syndrome (contralateral neglect from non-dominant, right parietal damage)",
  [["neglect"]], ["parietal-lobe-general-association-area", "somatosensory-association-cortex"], "practical-u1-2024 Q23")
c("u1", "cortex", "auditory", "A stroke damages the left transverse temporal gyrus (Heschl's gyrus).",
  "What deficit would result?", "Impaired hearing (primary auditory cortex), mostly in the contralateral ear",
  [["hearing", "auditory", "sound"]], ["transverse-temporal-gyrus", "primary-auditory-cortex"], "written-u1 Q13")
c("u1", "cortex", "motor-homunculus", "A tumour compresses the medial surface of the right precentral gyrus.",
  "Which body part is weak, and on which side?", "Left leg and foot (medial motor homunculus; contralateral)",
  [["left"], ["leg", "foot"]], ["primary-motor-cortex", "motor-homunculus"], "lecture-3")
c("u1", "cortex", "calcarine", "A patient has loss of the left half of the visual field in both eyes after a stroke.",
  "Which region of cortex is damaged?", "Right primary visual cortex (calcarine fissure region)",
  [["right"], ["visual", "calcarine", "occipital"]], ["primary-visual-cortex", "calcarine-fissure"], "lecture-11")
c("u1", "cortex", "insula", "A patient with a lesion near the insula loses awareness of her heartbeat and stomach sensations.",
  "Which cortical area maps emotions and visceral feelings onto the body?", "Insular cortex",
  [["insula"]], ["insular-cortex"], "lecture-15")
c("u1", "cortex", "apathy", "A patient after a frontal injury shows apathy and cannot initiate goal-directed behavior.",
  "Which region is most likely damaged?", "Anterior cingulate cortex (motivation)",
  [["anterior cingulate", "cingulate"]], ["anterior-cingulate-cortex"], "lecture-15")
c("u1", "ventricles", "hydrocephalus-monro", "A tumour blocks both foramina of Monro.",
  "Which structures enlarge?", "The lateral ventricles (obstructive hydrocephalus); the third and fourth ventricles do not",
  [["lateral ventricle"]], ["foramina-of-monro", "lateral-ventricle"], "lecture-2, written-u1 Q11")
c("u1", "ventricles", "hydrocephalus-aqueduct", "A child has an enlarged head and dilated lateral and third ventricles, but a normal fourth ventricle.",
  "Where is the obstruction?", "Cerebral aqueduct (aqueductal stenosis)",
  [["aqueduct"]], ["cerebral-aqueduct"], "lecture-2", note="Synthesised from ventricular anatomy (lecture 2); no direct vignette in the course.")
c("u1", "development", "folate", "Low maternal folate in early pregnancy raises the risk of which malformations?", "Name the group of defects.", "Neural tube defects (spina bifida, anencephaly)",
  [["neural tube"]], [], "written-u1 Q5")

# ---------------------------------------------------------------- UNIT 2
c("u2", "cn", "cn1", "A patient cannot smell coffee on either side. Which cranial nerve is tested and which structure does it pass through?", "Answer both.", "CN I (olfactory), through the cribriform plate of the ethmoid",
  [["i", "olfactory"], ["cribriform"]], ["olfactory-nerve"], "lecture-12")
c("u2", "cn", "cn2-light", "A patient's left eye is blind. Shining a light in the left eye produces no pupil constriction in either eye; light in the right eye constricts both.",
  "Which nerve is damaged?", "Left optic nerve (CN II): afferent limb of the pupillary reflex",
  [["left"], ["optic", "cn ii", "ii"]], ["optic-nerve"], "lecture-11, lecture-12")
c("u2", "cn", "cn3-pupil", "A patient with a head injury has a fixed, dilated right pupil and the right eye is turned down and out.",
  "Which nerve is compressed?", "Right oculomotor nerve (CN III): uncal herniation compresses it",
  [["oculomotor", "cn iii", "iii"], ["right"]], ["oculomotor-nerve"], "lecture-18 strokes, lecture-12")
c("u2", "cn", "cn4", "A patient has vertical diplopia on looking down and inward, and tilts the head. Which muscle and nerve are affected?", "Name both.", "Superior oblique muscle; trochlear nerve (CN IV)",
  [["superior oblique"], ["trochlear", "cn iv", "iv"]], ["trochlear-nerve"], "lecture-8, lecture-10")
c("u2", "cn", "cn6", "A patient cannot abduct the left eye and has horizontal diplopia, esotropia of the left eye.",
  "Which nerve and muscle are affected?", "Left abducens nerve (CN VI), lateral rectus",
  [["abducens", "cn vi", "vi"], ["lateral rectus"]], ["abducens-nerve", "abducens-nucleus"], "lecture-10")
c("u2", "cn", "cn5-motor", "A patient's jaw deviates to the right on opening and cannot clench the right side.",
  "Which nerve and nucleus are damaged?", "Right trigeminal motor nerve/nucleus (CN V3): muscles of mastication",
  [["trigeminal", "cn v", "v"], ["motor"]], ["trigeminal-nerve", "motor-trigeminal-nucleus"], "lecture-9, lecture-12", note="Jaw deviates toward the weak side; standard detail beyond slides.")
c("u2", "cn", "cn5-sensory", "A patient has numbness of the right forehead, cheek and chin and loss of the right corneal blink.",
  "Which nerve is damaged?", "Right trigeminal nerve (CN V: V1, V2, V3)", [["trigeminal", "cn v", "v"], ["right"]], ["trigeminal-nerve"], "lecture-12")
c("u2", "cn", "cn7-lmn", "A patient cannot wrinkle the right forehead, close the right eye or smile on the right. Taste on the anterior tongue and tearing are reduced on the right.",
  "Where is the lesion, and which kind of lesion is this?", "Right facial nerve/nucleus (lower motor neuron, whole side of the face)",
  [["facial", "cn vii", "vii"], ["lower motor", "lmn", "ipsilateral", "right"]], ["facial-nerve", "facial-nucleus"], "lecture-8")
c("u2", "cn", "cn7-umn", "After a left internal capsule stroke a patient has weakness of the right lower face but can wrinkle both sides of the forehead.",
  "Why is the forehead spared?", "The upper face (forehead) receives bilateral corticobulbar input; the lower face receives mainly contralateral input",
  [["bilateral", "both"], ["upper", "forehead"]], ["facial-nucleus"], "lecture-10, lecture-12", note="Detail about forehead sparing is standard neuroanatomy; slides state corticobulbar input to the facial nucleus.")
c("u2", "cn", "cn8", "A patient reports ringing and hearing loss in the right ear with vertigo.",
  "Which nerve is affected, and which two components does it contain?", "Right vestibulocochlear nerve (CN VIII): cochlear (hearing) and vestibular (balance) parts",
  [["vestibulocochlear", "cn viii", "viii"], ["cochlear"], ["vestibular"]], ["vestibulocochlear-nerve"], "lecture-8")
c("u2", "cn", "cn8-romberg", "A patient sways more when closing the eyes with feet together.", "Name the three senses combined for balance in this test.", "Vestibular (CN VIII), proprioception (DSCT and DCML), vision (CN II)",
  [["vestibular", "cn viii"], ["proprioception"], ["vision", "visual", "cn ii"]], [], "lecture-12")
c("u2", "cn", "cn9-10", "A patient has a hoarse voice, difficulty swallowing and the uvula deviates away from the lesioned side.",
  "Which nucleus supplies the pharyngeal and laryngeal muscles?", "Nucleus ambiguus (CN IX, X)",
  [["ambiguus"]], ["nucleus-ambiguus", "vagus-nerve"], "lecture-12, lecture-10")
c("u2", "cn", "cn11", "A patient cannot shrug the right shoulder or turn the head against resistance.", "Which nerve is affected?", "Spinal accessory nerve (CN XI)",
  [["accessory", "cn xi", "xi"]], ["accessory-nerve"], "lecture-12")
c("u2", "cn", "cn12", "A patient's tongue deviates to the right when protruded with atrophy on the right.", "Which nerve is damaged?", "Right hypoglossal nerve (CN XII), LMN lesion",
  [["hypoglossal", "cn xii", "xii"], ["right"]], ["hypoglossal-nerve", "hypoglossal-nucleus"], "lecture-12", note="Direction of deviation (toward the lesion) is standard neuroanatomy.")
c("u2", "cn", "corneal", "Touching the left cornea produces no blink in either eye, but touching the right cornea causes both eyes to blink.",
  "Which nerve is damaged?", "Left trigeminal nerve (afferent limb, CN V1)",
  [["left"], ["trigeminal", "cn v", "v"]], ["trigeminal-nerve"], "lecture-12")
c("u2", "cn", "corneal-efferent", "Touching either cornea produces a blink in the left eye but not in the right eye.",
  "Which nerve is damaged?", "Right facial nerve (efferent limb, CN VII)",
  [["right"], ["facial", "cn vii", "vii"]], ["facial-nerve"], "lecture-12")
c("u2", "visual", "optic-chiasm", "A patient with a pituitary adenoma loses peripheral vision in both eyes (tunnel vision).", "What is the field defect and the damaged structure?", "Bitemporal hemianopia; optic chiasm",
  [["bitemporal"], ["chiasm"]], ["optic-chiasm"], "lecture-11")
c("u2", "visual", "optic-tract", "A patient cannot see the entire left visual field in either eye.", "Which structures could be damaged?", "Right optic tract, LGN, optic radiations or visual cortex (left homonymous hemianopia)",
  [["right"], ["optic tract", "lgn", "radiation", "visual cortex"]], ["optic-tract"], "lecture-11")
c("u2", "visual", "quadrant", "A patient has a left homonymous superior (upper) quadrantanopia.", "Which part of the visual pathway/cortex is damaged?", "Right inferior optic radiations / lingual gyrus below the calcarine fissure",
  [["right"], ["inferior", "lingual", "below", "temporal"]], ["calcarine-fissure"], "lecture-11", note="Cortex statement from lecture 11; Meyer's loop detail is standard.")
c("u2", "visual", "macular-sparing", "After a posterior cerebral artery stroke a patient has a right homonymous hemianopia, but central vision is preserved.",
  "What is this phenomenon called?", "Macular sparing", [["macular"]], ["primary-visual-cortex"], "lecture-11")
c("u2", "visual", "blindsight", "A patient with cortical blindness still turns toward a sudden bright light.", "Which pathway explains this?", "Retinal projections to the superior colliculus and pulvinar (blind sight)",
  [["superior colliculus", "pulvinar", "colliculus"]], ["superior-colliculus"], "lecture-11")
c("u2", "visual", "prosopagnosia", "A patient with a PCA stroke cannot recognise faces but sees normally.", "Which visual stream is damaged?", "Ventral ('what') stream in the inferior temporal lobe",
  [["ventral", "what"], ["temporal"]], ["inferior-temporal-gyrus"], "lecture-11, lecture-18-cns-pathology")
c("u2", "visual", "mlf", "A patient with multiple sclerosis looks right: the right eye abducts but the left eye fails to adduct. Convergence is normal.",
  "Which structure is damaged?", "Left medial longitudinal fasciculus (internuclear ophthalmoplegia)",
  [["left"], ["medial longitudinal", "mlf"]], ["medial-longitudinal-fasciculus"], "lecture-11")
c("u2", "visual", "gaze-palsy", "A stroke destroys the right frontal eye field.", "Toward which side do the eyes deviate?", "To the right (toward the lesion): the intact left FEF pushes the eyes right",
  [["right", "toward the lesion", "ipsilateral"]], [], "lecture-11", note="Direction of deviation after FEF lesion is standard neuroanatomy; slide gives the intact-FEF direction rule.")
c("u2", "motor", "internal-capsule", "A patient has right arm, leg and lower-face weakness with brisk reflexes and a left hemisphere lacunar stroke.", "Where is the lesion?", "Left internal capsule (corticospinal and corticobulbar fibers)",
  [["left"], ["internal capsule"]], ["internal-capsule"], "lecture-18 strokes")
c("u2", "motor", "pyramid-below", "A lesion below the pyramidal decussation on the right produces weakness on which side?", "Side of weakness?", "Right (ipsilateral)", [["right", "ipsilateral"]], ["motor-decussation"], "lecture-10")
c("u2", "motor", "decorticate", "An unconscious patient holds both arms flexed and legs extended.", "Where is the lesion relative to the red nucleus?", "Above the red nucleus (decorticate posturing; rubrospinal released)",
  [["above"], ["decorticate"]], ["red-nucleus"], "lecture-10")
c("u2", "motor", "decerebrate", "An unconscious patient has all four limbs extended with arms pronated.", "Where is the lesion relative to the red nucleus?", "Below the red nucleus (decerebrate posturing, brainstem injury)",
  [["below"], ["decerebrate"]], ["red-nucleus"], "lecture-10")
c("u2", "motor", "cerebellar", "A patient has a right-sided intention tremor, dysmetria and a wide-based gait after a right cerebellar hemisphere stroke.", "On which side are the deficits and why?", "Ipsilateral (right): the cerebellum acts on the same side; output crosses in the SCP decussation and returns via the crossed corticospinal tract",
  [["right", "ipsilateral", "same"]], ["cerebellar-lateral-hemisphere"], "lecture-14")
c("u2", "brainstem", "medial-medullary", "A patient has contralateral arm and leg weakness (face spared), contralateral loss of vibration/position sense, and ipsilateral tongue deviation toward the lesion.",
  "Name the syndrome, vessel and structures.", "Medial medullary syndrome (anterior spinal / vertebral branches): pyramid, medial lemniscus, hypoglossal nerve/nucleus",
  [["medial medullary", "medial medulla"], ["pyramid", "medial lemniscus", "hypoglossal"]], ["pyramids", "medial-lemniscus", "hypoglossal-nucleus"], "STANDARD", note=STD)
c("u2", "brainstem", "lateral-medullary", "A patient has ipsilateral facial pain/temperature loss, contralateral body pain/temperature loss, hoarseness, dysphagia, ataxia and Horner syndrome.",
  "Name the syndrome, vessel and structures.", "Lateral medullary (Wallenberg) syndrome: PICA/vertebral; spinal trigeminal nucleus/tract, anterolateral tract, nucleus ambiguus, inferior cerebellar peduncle, descending sympathetics",
  [["lateral medullary", "wallenberg"], ["spinal trigeminal", "nucleus ambiguus", "anterolateral", "pica"]], ["spinal-trigeminal-nucleus", "nucleus-ambiguus"], "STANDARD", note=STD)
c("u2", "brainstem", "weber", "A patient has a dilated, down-and-out eye on the right and left arm, leg and lower face weakness.",
  "Name the syndrome and the damaged structures.", "Weber syndrome (ventral midbrain, PCA/basilar branches): right oculomotor fascicles and right cerebral peduncle (corticospinal/corticobulbar)",
  [["weber"], ["oculomotor", "cerebral peduncle", "peduncle"]], ["cerebral-peduncles", "oculomotor-nerve"], "STANDARD", note=STD)
c("u2", "brainstem", "pontine-vi-vii", "A patient has ipsilateral lateral rectus and whole-face paralysis plus contralateral hemiparesis after a ventral pontine stroke.",
  "Which nuclei/tracts are involved?", "Abducens and facial nuclei/nerves and the corticospinal fibers in the basis pontis (e.g. Millard-Gubler)",
  [["abducens"], ["facial"], ["corticospinal", "basis pontis", "longitudinal fibers"]], ["abducens-nucleus", "facial-nucleus", "longitudinal-fibers-of-the-pons"], "STANDARD", note=STD)
c("u2", "brainstem", "locked-in", "A patient with a basilar artery occlusion is awake but quadriplegic, with preserved vertical eye movements only.", "Which structures are bilaterally damaged?", "Basis pontis: bilateral corticospinal and corticobulbar fibers (locked-in syndrome)",
  [["pons", "basis pontis", "pontine"], ["corticospinal", "corticobulbar"]], ["pontine-arteries", "basilar-artery"], "STANDARD", note=STD)

# ---------------------------------------------------------------- UNIT 3
c("u3", "stroke", "mca", "A patient has right face and arm weakness, right sensory loss and halting nonfluent speech with good comprehension.",
  "Which artery is likely occluded and on which side?", "Left middle cerebral artery (dominant hemisphere: Broca's aphasia)",
  [["left"], ["middle cerebral", "mca"]], ["middle-cerebral-artery"], "lecture-18 strokes, lecture-18 CNS pathology")
c("u3", "stroke", "mca-right", "A patient has left face and arm weakness, left sensory loss and ignores the left side of space.", "Which artery and side?", "Right middle cerebral artery (non-dominant hemisphere: hemineglect)",
  [["right"], ["middle cerebral", "mca"]], ["middle-cerebral-artery"], "lecture-18 CNS pathology")
c("u3", "stroke", "aca", "A patient has contralateral leg weakness and sensory loss with urinary incontinence and apathy.", "Which artery?", "Anterior cerebral artery (medial frontal and parietal lobes)",
  [["anterior cerebral", "aca"]], ["anterior-cerebral-artery"], "lecture-18 strokes")
c("u3", "stroke", "pca", "A patient has a right homonymous hemianopia, trouble reading (alexia without agraphia) and prosopagnosia.", "Which artery and side?", "Left posterior cerebral artery (occipital lobe and inferior temporal lobe)",
  [["left"], ["posterior cerebral", "pca"]], ["posterior-cerebral-artery"], "lecture-18 CNS pathology")
c("u3", "stroke", "lenticulostriate", "A hypertensive patient has pure motor hemiparesis of the left face, arm and leg from a small lacunar infarct.", "Which small vessels and structures are involved?", "Right lenticulostriate arteries (MCA): basal ganglia and internal capsule",
  [["lenticulostriate"], ["internal capsule", "basal ganglia"]], ["lenticulostriate-arteries", "internal-capsule"], "lecture-18 strokes")
c("u3", "stroke", "watershed", "After cardiac arrest a patient has weakness of both shoulders and upper arms with preserved hands and legs ('man in a barrel').", "Which kind of stroke?", "Bilateral MCA-PCA watershed (border-zone) infarcts",
  [["watershed", "border"]], [], "lecture-18 CNS pathology")
c("u3", "stroke", "ischemic-types", "Name the two main causes of ischemic stroke.", "Name both.", "Thrombosis (e.g. atherosclerosis) and embolism (e.g. from atrial fibrillation)", [["thrombo", "atheroscler"], ["embol"]], [], "lecture-18 strokes")
c("u3", "stroke", "tpa", "A patient arrives 5 hours after a stroke; CT shows bleeding.", "Why must CT be done before giving tPA?", "tPA worsens a haemorrhagic stroke; CT rules out haemorrhage",
  [["hemorrhag", "haemorrhag", "bleed"]], [], "lecture-18 strokes")
c("u3", "bleed", "epidural", "A man is hit on the side of the head, is briefly unconscious, then lucid, then deteriorates with a lemon-shaped bright area on CT.", "Which bleed and which vessel?", "Epidural haematoma; middle meningeal artery near the pterion",
  [["epidural"], ["middle meningeal", "meningeal artery"]], ["pterion", "meningeal-blood-vessels"], "lecture-18 strokes")
c("u3", "bleed", "subdural", "An elderly man on alcohol falls and has a crescent (banana-shaped) bleed crossing sutures, bounded by the falx and tentorium.", "Which bleed and vessel?", "Subdural haematoma; torn bridging veins",
  [["subdural"], ["bridging"]], ["subdural-space"], "lecture-18 strokes")
c("u3", "bleed", "sah", "A patient has a sudden 'worst headache of my life' with vomiting and blood in the sylvian fissures on CT.", "Which bleed and likely cause?", "Subarachnoid haemorrhage; ruptured berry aneurysm (often at communicating arteries)",
  [["subarachnoid"], ["aneurysm"]], ["subarachnoid-space"], "lecture-18 strokes")
c("u3", "bleed", "berry-sites", "Where do berry aneurysms most commonly occur?", "Name the common sites.", "Anterior and posterior communicating arteries (circle of Willis branch points)",
  [["anterior communicating", "communicating"], ["circle of willis"]] , ["circle-of-willis"], "lecture-18 strokes")
c("u3", "bleed", "intracerebral", "A hypertensive patient has sudden loss of function and a bright pool within the basal ganglia on CT.", "Which type of bleed?", "Intracerebral haemorrhage (rupture of penetrating lenticulostriate vessels)",
  [["intracerebral"], ["lenticulostriate", "penetrating"]], ["lenticulostriate-arteries"], "lecture-18 strokes")
c("u3", "bleed", "stroke-vs-bleed", "Which two intracranial bleeds are NOT considered strokes?", "Name them.", "Epidural and subdural haematoma (vessels do not supply the brain)",
  [["epidural"], ["subdural"]], [], "lecture-18 strokes, lecture-18 CNS pathology")
c("u3", "herniation", "uncal", "A patient with a large temporal haematoma has a blown right pupil.", "Which structure herniates and which nerve is compressed?", "Uncus (uncal herniation over the tentorium) compresses the oculomotor nerve",
  [["uncus", "uncal"], ["oculomotor", "cn iii", "iii"]], ["uncus", "tentorium-cerebelli"], "lecture-18 strokes")
c("u3", "herniation", "tonsillar", "A patient with raised ICP has hypertension, bradycardia and irregular breathing.", "What is this triad and what is herniating?", "Cushing's triad; cerebellar tonsils herniating through the foramen magnum",
  [["cushing"], ["tonsil", "foramen magnum"]], ["cerebellar-tonsil", "foramen-magnum"], "lecture-18 strokes")
c("u3", "herniation", "midline", "On CT a bleed on the right pushes the midline to the left.", "What is this called?", "Midline shift (mass effect)", [["midline", "mass effect"]], [], "lecture-18 CNS pathology")
c("u3", "bg", "parkinson", "A patient has a resting tremor, rigidity, bradykinesia and a shuffling gait.", "Which nucleus is degenerating, and which transmitter is lost?", "Substantia nigra pars compacta; dopamine",
  [["substantia nigra", "nigra"], ["dopamine"]], ["substantia-nigra"], "lecture-14, lecture-18 CNS pathology")
c("u3", "bg", "huntington", "A 40-year-old with a family history has chorea and dementia.", "Which structure degenerates?", "Striatum (caudate and putamen)", [["striatum", "caudate", "putamen"]], ["caudate-nucleus", "putamen"], "lecture-14")
c("u3", "bg", "ballismus", "A stroke causes sudden violent flinging movements of the right arm.", "Which nucleus is damaged and on which side?", "Left subthalamic nucleus (hemiballismus, contralateral)",
  [["subthalamic", "stn"], ["left", "contralateral"]], ["subthalamic-nucleus"], "lecture-14")
c("u3", "limbic", "hippocampus", "A patient cannot form new memories but recalls old ones.", "Which structures are damaged?", "Hippocampal formation (medial temporal lobe), mammillary bodies/fornix (anterograde amnesia)",
  [["hippocamp", "mammillary", "fornix", "medial temporal"]], ["hippocampus", "fornix"], "lecture-15")
c("u3", "limbic", "basalis", "A patient with progressive dementia has loss of cholinergic neurons of the basal forebrain.", "Which nucleus projects to cortex and is lost?", "Nucleus basalis of Meynert",
  [["basalis", "meynert"]], ["basal-forebrain-nuclei"], "lecture-15")
c("u3", "limbic", "amygdala", "A patient with bilateral amygdala damage shows diminished fear responses.", "Which structure is damaged?", "Amygdala", [["amygdala"]], ["amygdala"], "lecture-15")
c("u3", "tumor", "gbm", "A tumour crosses the corpus callosum as a 'butterfly lesion'.", "Name the tumour.", "Glioblastoma multiforme (astrocyte origin)", [["glioblastoma", "gbm"]], ["corpus-callosum"], "lecture-18 CNS pathology")
c("u3", "tumor", "cerebellar", "A patient has an unsteady gait, nystagmus and poor fine motor control.", "Which brain region is likely affected?", "Cerebellum", [["cerebell"]], ["cerebellum"], "lecture-18 CNS pathology")
c("u3", "tumor", "temporal", "A patient has focal seizures, memory loss and auditory hallucinations.", "Which lobe harbours the tumour?", "Temporal lobe", [["temporal"]], [], "lecture-18 CNS pathology")
c("u3", "tumor", "metastasis", "Name the three most common primary cancers that metastasise to the brain.", "Name them.", "Lung, breast and melanoma (also kidney, colon)", [["lung"], ["breast"], ["melanoma"]], [], "lecture-18 CNS pathology")
c("u3", "tumor", "callosum", "A child has difficulty with complex problem solving and social cues; MRI shows no corpus callosum.", "Name the condition.", "Agenesis of the corpus callosum", [["agenesis"]], ["corpus-callosum"], "lecture-18 CNS pathology")
c("u3", "imaging", "ct-ischemia", "How does an ischaemic stroke look on CT, and when does it show?", "Describe it.", "Dark (hypodense) area, visible in the long term rather than immediately", [["dark", "hypodense", "hypoattenuat"], ["later", "long", "delay", "not immediate"]], [], "lecture-18 strokes", accept=[])
c("u3", "imaging", "ct-blood", "How does acute blood appear on CT?", "Describe it.", "Bright white (hyperdense)", [["white", "bright", "hyperdens"]], [], "lecture-18 strokes")

D.src("cord", "lecture-4,5")
D.dump("clinical")
