# Blood supply atlas: syllabus inventory and audit

Scope rule: everything on the lists below must be reachable in `/atlas/supply`. Anything beyond them stays out or sits behind the Supplementary gate.
Sources read: `content-build/decks/lecture-16` (Blood Supply to the CNS, 30 slides), `lab-16` (20 slides), `lecture-18-strokes-brain-bleeds` (29 slides).

## 1. What the course teaches

### Vessel terminology and the barrier (lecture 16, slides 2-7) — not 3D
Arteries / arterioles / capillaries / venules / veins; capillaries are the exchange vessels; brain capillaries have tight junctions (blood-brain barrier), supported by basement membrane, astrocyte end-feet and pericytes; leaky capillaries at the choroid plexus and circumventricular organs.
Atlas stance: not an atlas topic (no 3D). A one-line legend note only.

### Arteries (lecture 16 slides 8-14, 25-26; lab 16 slides 1-20)
Anterior circulation (internal carotid arteries, 60-70 % of brain blood, 80 % of ICA flow goes to MCA):
- Internal carotid artery (ICA), bifurcating into MCA and ACA
- Middle cerebral artery (MCA), lateral fissure
- Anterior cerebral artery (ACA), with its branches pericallosal and callosomarginal arteries
- Anterior communicating artery (AComm)
- Lenticulostriate (lateral striate) arteries from the MCA; medial striate artery (recurrent artery of Heubner) from the ACA; the anterior perforated substance
- Anterior choroidal artery (in the atlas list)

Posterior circulation (vertebral arteries, via transverse foramina and the foramen magnum):
- Vertebral arteries, joining at the ponto-medullary junction into the basilar artery
- Basilar artery; pontine (penetrating) branches
- Three cerebellar pairs: superior cerebellar, AICA, PICA (AICA and PICA are marked "not on structure list" in lab 16)
- Posterior cerebral artery (PCA); posterior communicating artery (PComm)
- Anterior spinal artery (one, ventral; from the vertebral branches fusing between the pyramids) and two posterior spinal arteries

Circle of Willis: anastomosis at the base of the brain around the hypothalamus and optic chiasm; ICAs do not join each other; AComm joins the two ACAs; PComms join ICA to PCA; "usually one PComm is small or absent"; can equalise flow if one main vessel fails, not 100 % protective; normally little flow in the communicating vessels when pressures are equal.

### Territories (lecture 16 slides 15-19; lab 16 slides 2, 6, 10; lecture 18 slide 26)
- ACA: medial frontal and parietal lobes (to about the parieto-occipital sulcus), cingulate gyrus, basal forebrain; lower-extremity motor and sensory. Branches pericallosal and callosomarginal.
- MCA: most of the lateral frontal, parietal and temporal lobes; face and upper-extremity motor and sensory (homunculi), speech (Broca), auditory; basal ganglia and anterior limb of the internal capsule via the lenticulostriates.
- PCA: inferior half of the temporal lobe, occipital lobe; thalamus and posterior limb of the internal capsule; rostral pons, midbrain, diencephalon (penetrating and circumferential branches); medial to the uncus (uncal herniation can compress it).
- Views taught: lateral, medial, ventral (inferior).
- Spinal cord (lab 16 slides 17-19): anterior spinal artery = ventral half both sides + part of each dorsal horn and lateral funiculus; each posterior spinal artery = a dorsal wedge on its own side (much of the dorsal horn and the dorsal column).
- Brainstem: penetrating pontine branches; strokes of the basilar are often fatal; ~10 % of ischemic strokes occur in the brainstem.
- Internal capsule / basal ganglia: lenticulostriates (MCA) and medial striate (ACA).

### Clinical (lecture 18) — slide level
- Stroke definition; ischemic vs hemorrhagic; TIA; silent strokes.
- Ischemic: atherosclerosis, atrial fibrillation (embolic), hypertension; MCA territory most common (80 % of ICA flow); deficits by territory: ACA behavioural change + leg; MCA face and arm + speech; PCA vision / thalamus; lacunar infarct from a lenticulostriate; brainstem strokes.
- Hemorrhagic: intracerebral (penetrating vessel e.g. lenticulostriate), subarachnoid (aneurysm of the circle of Willis, "worst headache"), epidural (dural/meningeal artery, lemon-shaped, high pressure), subdural (bridging vein, banana-shaped, low pressure, stops at the falx).
- tPA window 2-3 hours; thrombectomy; aneurysm clip or coil; CT shows ischemia dark late; CT viewed from below.

### Veins (lecture 16 slides 27-30)
Cerebral veins in the subarachnoid space; superficial veins reach dural sinuses through bridging veins (susceptible to shearing: shaken baby, falls); deep veins converge into the great cerebral vein into the straight sinus; dural sinuses between the meningeal and periosteal dura; confluence of sinuses at the falx / tentorium junction; sigmoid sinus to the internal jugular vein to the heart.

### Imaging (slides 20-24): angiography (catheter, contrast), lateral and AP views, CT / MR angiograms; find basilar, PCA, PICA.

## 2. Coverage in the atlas today

| Item | In the atlas | Notes |
|---|---|---|
| ICA, MCA, ACA, AComm, PComm, PCA, basilar, vertebral, SCA, AICA, PICA, pontine branches | yes | meshes + flow lines |
| Lenticulostriates, anterior choroidal | yes | list entries 4-5 |
| Anterior and posterior spinal arteries | yes | list |
| Pericallosal / callosomarginal | via mesh set, check | |
| Territories (ACA, MCA, PCA) | yes (surface patches) | lateral / medial / inferior as taught |
| Dural venous sinuses, bridging and deep veins | meshes exist in the Z-Anatomy set (sinuses); no drainage layer | gap |
| Clinical deficits per territory (slide depth) | partial (per-vessel text) | make compact and consistent |
| Epidural / subdural / subarachnoid bleeds | Explore meninges view (generated shells) | link from supply |
| Angiography | out of scope for 3D | skip |

## 3. Student audit (headless, 1440x900 and 390x844) — clunky moments found
1. The two explanatory paragraphs at the bottom-left overlap the bottom toolbar and form a text wall.
2. The "Arteries" panel clips long names and the right column overflows horizontally.
3. The camera re-framed on every selection change (fixed: explicit Frame button now).
4. No single-click preview: territory only appears after toggling Territories.
5. Controls are split between a wide top bar and the viewer toolbar; "Quiz" and "Arteries" sit far from the vessel list.
6. Latency: switching vessels re-creates the vessel layer (flicker, opacity pops).
