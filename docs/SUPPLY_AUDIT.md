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

## 4. Handoff note (build 2026-11-10)
Done: modes Explore / Follow the blood (8 one-sentence steps) / Block a vessel (3D click or L/R picker, slide-level deficits, collateral pulses through AComm and PComm, basilar entry) / Drainage (4 steps) / Bleeds (links to Explore meninges); soft cortical territory skin; hover preview from list and 3D; "Study these cards"; trackAtlas events (accepted by /api/atlas/progress); margin labels; wrapping mode bar for phones. Quiz kept (it pre-existed: light "which artery supplies this?", feeds achievements).
Next: (1) re-check Lateral and Medial views once the Explore agent's CutCap work in AtlasViewer.tsx is finished: a large blue quad currently shows in the Lateral view (not from the supply code); (2) anterior choroidal and posterior spinal arteries have no mesh (documented in the panel); (3) aortic arch / carotid neck segment not modelled; (4) pericallosal and callosomarginal centrelines look plausible (callosomarginal is short, ends before the paracentral region) but could not be cross-checked against Radiopaedia / StatPearls (both blocked in the sandbox): textbook anatomy, to verify by a human; (5) lab 16 slide 12 calls the medial striate artery "anterior choroidal artery" (slide conflict, left out).
Latency (click to settled, dev server): vessel toggle ~700 ms (about 0.6 s of that is the deliberate fade), tour step 30-360 ms, block 95-220 ms. Before the WIP the layer was rebuilt per selection.

### Visual round (2026-11-11)
Done: matte brain at opacity 0.55 (compared 0.3 / 0.6 / 1 in `bo_*.png`: 0.3 still looks like smoke, 1.0 hides the territory colours, 0.55-0.6 keeps gyri, a crisp edge and a readable territory); territories on by default whenever arteries are selected (ICA shows ACA + MCA); selected vessels outlined, tapered, trunks thinner and branches thicker than before; unselected vessels dimmer but present; "no 3D vessel" mark on the anterior choroidal and posterior spinal entries (territory still shown); framing always includes the whole brain; contact sheet `contact_sheet_all_vessels_v2.png`.
Cross-checks (Wikipedia, fetched 2026-11-11): pericallosal runs in the pericallosal (callosal) sulcus; the callosomarginal is NOT always present (about 50-67 % of hemispheres), when absent its branches come from the pericallosal. The SCA winds around the brainstem below the oculomotor nerve and fans over the upper cerebellum, which matches the stored centreline (trunk plus three branches), so the "rectangle" in the old SCA tile was the trunk wrapping the pons.
Still unverified: Radiopaedia / StatPearls / Neuroscience Online were not reachable; pericallosal / callosomarginal were not cross-checked against them. The callosomarginal centreline is short.
Blocked: Lateral and Medial views show a large blue quad from the shared viewer (not from supply code), so lateral / medial shots for ACA, MCA, PCA could not be taken; earlier `w4_lat.png` / `w4_med.png` (before the viewer change) show the territory skin working. Re-shoot when fixed. Desktop framing leaves the brain at about 60 % of the canvas height.

### Cerebellum round (2026-11-11)
Cause of the all-yellow SCA tile: the superior-hemisphere overlay (SCA) was seen from below through the translucent brain, and overlays sit inside the brain so their tint was washed out (PICA looked empty). Fix: cerebellar surface units (superior / inferior hemisphere, vermis, tonsil, flocculus) are now drawn solid (depth-correct) in the artery's colour, and the cerebellar surfaces that do NOT belong to a shown cerebellar artery are drawn solid in a neutral tone, so only the surface facing the camera shows. Deep structures get a stronger tint (0.7). Vertebral now shows vertebral + PICA + anterior spinal territory (matches its "If blocked" entry). Superior and Posterior view buttons added next to Inferior / Lateral / Medial; an artery's info panel shows a hint and a button ("Mostly on the top of the cerebellum: view from Superior"), the camera never moves by itself. `?bo=` override removed.
Territory tiling used by the data (supply-map.json, slide wording is only "three cerebellar pairs"): SCA = superior hemisphere + superior/posterior vermis (declive, folium, tuber shared with PICA) + superior peduncle; AICA = flocculus + its peduncle + middle peduncle + VII/VIII nuclei; PICA = inferior hemisphere, inferior vermis, tonsil, inferior peduncle, lateral medulla nuclei. Known simplification: AICA's cortical territory (anterior inferior surface of the hemisphere) is limited to the flocculus; the slides do not define the boundaries.
Test note: the viewer renders on demand; a headless screenshot after a view change needs a pointer nudge before capture (the camera has moved but the canvas is stale until the next render).

### Wrap-up (2026-11-11)
The pale-blue quad over Lateral/Medial was in the supply scene: the vein layer's pulse cones (a 1 m cone, depthTest off) kept identity matrices until the first frame placed them, so from side views they covered the canvas. Fixed in `VeinLayer.tsx` and `VesselLayer.tsx` (`initInstances` zeroes the instances on creation). Lateral and Medial now render: `lateral_medial_sheet.png` (ACA, MCA, PCA). Contact sheet: `contact_sheet_all_vessels_v3.png` (every vessel, Inferior, plus SCA from Superior); `cs3_best_sca.png`.
Known: from the Lateral view the ACA's medial territory shows through the translucent brain (it is not occluded); Posterior views of PICA / PCA were not re-shot after the quad fix. Not yet deployed.

### Handoff (commit 315f853 and after)
Shipped in 315f853: territory skin winding fix for mirrored meshes (negative-determinant meshes get two corners swapped), a camera-side-hemisphere filter in `TerritorySurface.tsx` (in Lateral/Medial only the near hemisphere is painted), tighter brain framing in `VesselLayer.tsx`, PICA verified from Inferior and Posterior, proof shots.
Open (accuracy): cortical territories still show through the translucent brain in Lateral/Medial (MCA from Medial paints the lateral surface; ACA from Lateral shows the medial wall). A per-pixel back-face discard in the skin shader either removed nothing or removed every cortical territory (the merged gyri mesh has inconsistent normals), so it was reverted. Next: a depth pre-pass of the brain surface, or recomputed outward normals for the skin. Cerebellar surfaces already work (solid, camera-facing). Framing at 1440 is still about 60 % of canvas height (target 85 %).
Shooting note: the viewer renders on demand, so after a view change or selection the headless canvas can be stale (blank or old frame) until a pointer nudge; move the mouse a few pixels before capturing. A "blank PICA tile" in the v3 sheet was this, not a bug. `lateral_medial_sheet.png` and `lm_lateral_aca.png` in `_atlas/supply_shots/` come from discard-test builds: ignore them.

## Territory occlusion and framing (2026-11-12)

- **Problem.** The brain is drawn translucent (0.55), so the cortical territory skin showed the far side through it: the MCA's lateral convexity painted the medial wall orange in the Medial view, the ACA's medial wall showed in the Lateral view, the whole underside looked MCA from Inferior. Discarding back faces by normal does not work on the merged gyral mesh (inconsistent normals and winding).
- **Technique (TerritorySurface.tsx).** A depth pre-pass that ignores normals and winding. Right before the skin is drawn (`onBeforeRender`, same camera, same viewport), the whole brain surface is rendered depth-only (`colorWrite: false`, `side: DoubleSide`) into a private `DepthTexture` render target: every gross.glb mesh (cerebrum, cerebellum, brainstem) plus the deep structures that fill the hollow cortical shell (corpus callosum, septum, fornix, basal ganglia, internal capsule, thalamus, hypothalamus, hippocampus, amygdala, chiasm, ventricles), clipped by the viewer's cut (`cut` prop, the medial view's x = 0 plane) and the medulla plane. The skin's fragment shader converts both depths to view z and discards a fragment lying more than 1.5 mm (plus a slope term) behind the nearest surface, taking the nearest depth over a 4 px disc so cracks between gyral patches do not let the inside of the far cortex through. The pass is skipped while camera, projection and viewport are unchanged. The main depth buffer is untouched, so vessels and deep territories inside the translucent brain look exactly as before, and the old "hide the far hemisphere when seen from the side" switch is gone (orbiting is continuous).
- **Residual.** gross.glb has no pregenual/subcallosal cingulate patch: in the Medial view a small rim of MCA (inner side of the frontal gyri) still shows around that hole in front of the genu, and two small flecks show through wide gaps between medial parietal patches. The medial aspect of the temporal pole is MCA and correctly visible.
- **Framing (VesselLayer.tsx).** The camera fits the brain itself (every 40th gross.glb vertex down to the medulla plane, a per-point perspective fit, centred on screen): 85% of the canvas height, at most 66% of the width on a wide canvas (margin labels) or 90% on a phone. Only on the first frame, the Frame button and a view button (after the viewer's own eased move, a short glide to the same fit); never on a selection; any drag or wheel by the student stops it. The Medial view fits the remaining right hemisphere only.
- **Proof.** `_atlas/supply_shots/occl/`: `before_*` vs `after_*` (ACA, MCA, PCA lateral and medial; MCA inferior; PCA posterior; SCA superior) at 1440x900, `m390_*` at 390x844.

## Venous drainage: slide inventory and rebuild (2026-11-18)

Slide numbers are the deck page numbers (`content-build/decks/<deck>/slides.json` `n`), as elsewhere in this file. Sources read: lecture 16 slides 2-3 and 27-30 (text and figure labels), lab 1 slide 22, lab 2 slides 9, 10, 19, lecture 2 slides 8, 11, 13, 14, lecture 18 (strokes) slides 14-17, lecture 18 (CNS pathology) slides 4-5, practice exam U3 / SI 7-8 (Q16). No lab deck covers the dural sinuses beyond the superior sagittal sinus (lab 2).

### What the course names

| Structure | Where taught | In the 3D layer | Notes |
|---|---|---|---|
| Superficial (superior) cerebral veins | L16 s3 (surface vessels in the subarachnoid space), s27 and s29 figure labels | yes, 7 per side, on the convexity | posterior ones run obliquely forward against the sinus flow |
| Inferior cerebral veins | L16 s29 figure label | no (named only on the figure) | |
| Bridging veins | L16 s27 label, s29 text; L18 s14-16 | yes, the last ~8 mm of each superior vein, entering the sinus wall | clinical: subdural hematoma |
| Superior sagittal sinus | L16 s27-28; lab 2 s10, s19 (checklist); L2 s11, s13-14; exam Q16 | yes, triangular section in the falx | |
| Arachnoid granulations / villi, CSF return | lab 2 s9-10, s19; L2 s8, s11, s13-14 | yes, small knobs into the sinus | "CSF and blood mix in the dural sinuses" (lab 2 s10) |
| Inferior sagittal sinus | L16 s28 and s30 figure labels | yes, free edge of the falx | |
| Internal cerebral vein | L16 s30 figure label | yes, paired | |
| Basal vein | L16 s30 figure label | yes, paired | |
| Great cerebral vein (of Galen) | L16 s28 label, s30 title/text; exam Q16 option | yes | |
| Straight sinus | L16 s28, s30 | yes, falx-tentorium junction | |
| Confluence of sinuses | L16 s27-28, s30; exam Q16 option | yes | |
| Occipital sinus | L16 s27 and s30 figure labels | yes | |
| Transverse sinus | L16 s27, s28, s30 | yes | |
| Sigmoid sinus | L16 s27-28 ("wraps around the posterior cranial fossa"), s30 | yes, S-curve to the jugular foramen | |
| Jugular foramen / superior jugular bulb | L16 s28 label / s30 label | yes (bulb on the jugular vein) | |
| Internal jugular vein | L16 s27-28 ("> internal jugular vein >> heart"); exam Q16 option | yes, top 4 cm, then "to the heart" | |
| Superior and inferior petrosal sinuses | L16 s27 label ("superior and inferior petrosal sinuses"), s30 (inferior petrosal) | yes | |
| Cavernous sinus, anterior intercavernous sinus | L16 s30 figure labels only | yes (both intercavernous sinuses drawn) | no slide text, no clinical content on the slides |
| Superficial middle cerebral vein | L16 s30 figure label | yes, along the lateral sulcus to the cavernous sinus | |
| Inferior anastomotic vein (of Labbé) | L16 s30 figure label | yes | |
| Falx cerebri, tentorium cerebelli (context) | L16 s28 text, s30 labels; lab 1 meninges list | yes, faint | |
| Dura layers (periosteal, meningeal) | L16 s27-29 | text only | |
| Emissary and diploic veins | not on any slide | no | out of scope |
| Venous plexuses, superior anastomotic vein (Trolard), sphenoparietal sinus, ophthalmic veins | not on the slides | no | out of scope |

Flow order taught (L16 s27): deep and superficial cerebral veins > dural sinuses > internal jugular vein >> heart. Superficial: superior cerebral veins > bridging veins > superior sagittal sinus (s29). Deep: deep veins > great cerebral vein > straight sinus (s30), "directly toward the confluence" (s30). Most sinuses > confluence at the falx / tentorium junction > (transverse) > sigmoid sinus around the posterior cranial fossa > internal jugular vein (s28). The cavernous / petrosal route is only in the figures (s27: superior and inferior petrosal sinuses; s30: cavernous sinus, anterior intercavernous sinus, inferior petrosal sinus, superior jugular bulb); the drainage directions drawn for it are textbook anatomy.

Clinical points taught:
- Bridging veins tear under shearing forces (shaken baby syndrome, falls in the elderly): subdural hematoma (L16 s29; L18 s14-16): between dura and arachnoid, low pressure, more likely to clot on its own, banana-shaped, one hemisphere, stops at the falx (and the tentorium, CNS pathology s4); not a stroke. Low brain-to-skull ratio is a risk factor (CNS pathology s4).
- A clot in a dural venous sinus backs blood up into the cerebral veins, raising intracranial pressure; the veins can leak or rupture (L18 s17: a venous cause of subarachnoid hemorrhage).
- CSF return through the arachnoid granulations into the superior sagittal sinus (lab 2, lecture 2); disruption of CSF circulation causes pathologies (L2 s15, hydrocephalus; not repeated here).
- Not on the slides: cavernous sinus contents and infection spread. They sit behind the Supplementary gate at the cavernous step (CN III, IV, V1, V2 in the lateral wall; ICA and CN VI through it; facial infection via the ophthalmic veins).

### 3D rebuild
- Data: `public/atlas/veins.json` from `tools/atlas/veins/build.py` (inputs: `tools/atlas/veins/dump_splines.py` run in the bundled Blender on the Z-Anatomy blend; check plots with `--plots <dir>`). Licence: Z-Anatomy is CC BY-SA 4.0; the adapted centrelines are shared under CC BY-SA 4.0 (the atlas footer credit covers it).
- Why the old sinuses looked clunky: the Z-Anatomy sinuses are splines with a token 0.5 mm bevel, exported as thin low-poly tubes; and the Z-Anatomy straight, inferior sagittal and occipital sinus splines do not fit this brain (the straight sinus ran through the third ventricle; the confluence sat 9 mm below the tentorium).
- Kept from Z-Anatomy: superior sagittal (last 2 cm re-routed to the confluence and pushed out where the frontal pole bulged into it), transverse (start moved to the confluence), sigmoid, petrosal and intercavernous splines, internal jugular vein, internal carotid artery. Re-routed: straight sinus along the falx-tentorium ridge from behind the splenium to the confluence; inferior sagittal sinus 3 mm above the corpus callosum in the free edge of the falx, then down behind the splenium; occipital sinus from the foramen magnum up behind the vermis; confluence at the posterior end of the junction. Built: superior cerebral veins and bridging veins (snapped to the cortex by ray casting), superficial middle cerebral vein (upper edge of the superior temporal gyrus, then along the sphenoid ridge to the cavernous sinus), Labbé (temporal surface to the transverse sinus), internal cerebral veins (between the third-ventricle roof and the fornix), basal veins (around the peduncles), great cerebral vein (under the splenium to the straight sinus), cavernous sinus body (oval, around the cavernous ICA). Calibres are textbook adult values (sinus 2-4 mm radius, the superior sagittal sinus triangular, base widening backward).
- Rendering (`VeinLayer.tsx`): swept tubes with an arc-length attribute; one shared shader program; flow = soft bands moving along each vessel; each step draws its vessels in along the flow; hover from the schematic or 3D highlights the vessel; falx and tentorium faint.
- Performance: all geometry is built and every shader compiled when Blood supply opens; a step only changes uniforms and visibility, never creates or disposes geometry or materials; the viewer gets no overlays in Drainage (the old code created overlay materials and toggled the medial clipping cut per step).

### Known limits
- Positions are fitted to the Z-Anatomy brain, not to an MRV: the internal cerebral and great cerebral veins share 2-3 mm of space with the fornix / splenium in this mesh (the cisterns are not gaps in it), and the basal vein hugs the midbrain.
- The internal jugular vein stops 4 cm below the skull base; the neck course is not modelled.
- Right and left transverse sinuses are drawn the same size (the right is often dominant; not on the slides).
