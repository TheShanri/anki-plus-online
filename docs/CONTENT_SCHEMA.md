# Content schema (contract between content agents, the seed script and the study engine)

Source of truth is JSON in git under `content/<course-slug>/` (first course: `content/nsci3250/`).
`npm run seed` upserts it into Supabase by `slug` (never by uuid), and `npm run media` uploads the
images it references to the private Storage bucket `course-media` (the professor's material is
never public). Raw extracted material lives in `content-build/` (gitignored); content JSON only
references media by **media key**.

## Media keys
A media key is a path relative to `content-build/`, e.g. `apkg/lab-13/media/abc.png` or
`decks/practical-u3-2025/pages/002.webp`. Storage path = `<course-slug>/<media key>`. The app
resolves a key through `/api/media/<course-slug>/<key>` (auth-gated: enrolled members only; it
redirects to a short-lived signed URL). Images are converted to WebP at upload where they aren't already.

## Files
```
content/nsci3250/
  course.json          units + topics (modules)
  structures.json      every structure on the official lists, with names, synonyms, info
  pathways.json        structured pathway data (for pathway cards and the tracing view)
  cards/<topic>.json   cards for one topic (module); one file per topic
```

### course.json
```json
{ "slug": "nsci3250", "units": [{ "slug": "u1", "title": "Unit 1: Overview, Nerves, and the Spinal Cord", "position": 1 }],
  "topics": [{ "slug": "lab-13", "unit": "u3", "kind": "lab", "number": 13, "title": "Horizontal Sections",
               "position": 13, "sources": ["decks/lab-13", "apkg/lab-13"] }] }
```
`kind` is `lecture` or `lab` (DB enum); practicals, atlases and pathway sets are topics with
`kind: "lab"` and `meta.type` = `practical` | `atlas` | `pathways` | `clinical`.

### structures.json
```json
{ "slug": "caudate-nucleus", "name": "Caudate nucleus", "unit": "u1",
  "synonyms": ["caudate"], "abbreviations": [], "region": "basal ganglia",
  "lists": [{ "unit": 1, "lab": "Lab 2", "group": "ID on Wet Specimens", "note": null }],
  "laterality": "paired",                       // paired | midline | n/a
  "info": {
    "latin": "nucleus caudatus",
    "etymology": { "roots": [{ "part": "cauda", "lang": "Latin", "meaning": "tail" }],
                   "literal": "tailed nucleus", "story": "Named for its long tail curving..." },
    "explanation": "C-shaped grey-matter nucleus forming the lateral wall of the lateral ventricle...",
    "facts": { "function": "...", "passes": null, "supply": "...", "lesion": "...", "connections": "..." }
  },
  "atlas": { "meshIds": [], "approximate": false } }
```
Every name on `content-build/structures/unit{1,2,3}.json` gets exactly one structure (children of a
parent entry are their own structures, linked by `"parent": "<slug>"`).

### Cards: common fields
```json
{ "slug": "lab-13-io-0007-c3", "kind": "pin", "topic": "lab-13", "structure": "caudate-nucleus",
  "status": "live", "position": 7, "source": { "type": "apkg", "ref": "apkg/lab-13 note 7 cloze 3" },
  "answer": "Head of caudate nucleus", "accept": ["caudate head"], "require_side": false,
  "explain": "optional one-liner shown after answering" }
```
- `answer` is the canonical spelling shown in feedback; `accept` lists other correct strings.
  The engine normalises (case, accents, punctuation, leading "the", hyphen/space, Roman/Arabic
  cranial-nerve numbers, `n.`/`nucleus`, `a.`/`artery`) before comparing; don't list trivial variants.
- `require_side`: the practical asks for left/right; answers must include it.
- Slugs are stable forever (reviews, card states and flags hang off them). Never reuse a slug for a
  different question; retire it (`"status": "retired"`) and make a new one.

### kind: "pin" (pin-the-structure; the core card)
```json
{ "image": "apkg/lab-13/media/horizontal1.png", "w": 1200, "h": 900,
  "target": { "shape": "rect", "x": 0.54, "y": 0.32, "w": 0.07, "h": 0.04 },
  "masks": [ { "shape": "rect", "x": 0.54, "y": 0.32, "w": 0.07, "h": 0.04 }, "...other labels" ],
  "pointer": { "type": "mask" },            // mask | existing (pin already in the photo) | pin | arrow
  "prompt": "Name the structure.",
  "followups": ["caudate-nucleus:function"] }
```
- Image-occlusion sources: `masks` = every occlusion shape of the note (hide all labels), `target`
  = the one being asked (drawn highlighted). Shapes are fractions of image width/height;
  `"shape": "polygon"` uses `"points": [[x,y],...]`.
- Practical photos: `pointer.type = "existing"` and `pointer.color` (e.g. "green pin"); `prompt` is
  the exam's wording.
- `followups` reference theory cards by `<structure-slug>:<facet>`; the engine asks them right after
  the name once the name is solid (see SPEC: theory is a second step).

### kind: "theory" (follow-up facet of a structure, also studyable alone)
```json
{ "structure": "caudate-nucleus", "facet": "function", "prompt": "Function of the caudate nucleus?",
  "format": "type", "answer": "...", "accept": [], "keywords": [["motor", "movement"], ["cognition"]],
  "choices": null }
```
`facet`: function | passes | supply | lesion | connections | order | side | fiber_type | receptor |
level | brodmann | embryology | cranial_nerve | muscle. `format`: `type` (short exact answer),
`keywords` (free text graded by keyword groups: each inner list is a set of synonyms, all groups
must hit), `tf`, `choice` (`choices` = 4 strings, answer is one of them).

### kind: "pathway"
Steps of a pathway as individual cards, e.g. "DCML: where do 2nd-order neurons decussate?".
```json
{ "pathway": "dcml", "step": "decussation", "prompt": "...", "answer": "Caudal medulla (internal arcuate fibers)", "accept": [] }
```
`pathways.json` holds the structured pathway for the tracing view:
```json
{ "slug": "dcml", "name": "Dorsal column–medial lemniscus", "modality": "fine touch, vibration, proprioception",
  "neurons": [ { "order": 1, "cell_body": "dorsal root ganglion", "tract": "fasciculus gracilis / cuneatus",
                 "synapse": "nucleus gracilis / cuneatus", "level": "caudal medulla", "decussates": false } ],
  "decussation": "caudal medulla", "lesion": { "below_decussation": "ipsilateral loss", "above": "contralateral loss" } }
```

### kind: "section"
Brainstem/brain section level identification: `{ "image": "...", "prompt": "Which level is this section?", "answer": "Rostral medulla" }`.
Structures on sections are ordinary `pin` cards (with `"tags": ["section"]`).

### kind: "clinical"
```json
{ "vignette": "A patient has loss of vibration sense in the left leg and...", "prompt": "Where is the lesion?",
  "format": "keywords", "answer": "Left dorsal column, spinal cord (ipsilateral, below decussation)",
  "keywords": [["dorsal column", "fasciculus gracilis"], ["left", "ipsilateral"]], "structures": ["fasciculus-gracilis"] }
```

### Reserved for later
`mcq` (choice questions), `spelling` (spelling reps of a structure's name).

## Changes by the content agent (as built)
- Structures are deduplicated by canonical name across the three lists (one structure, several `lists` entries). Compound list lines were split
  (e.g. "Posterior vs. Anterior" -> `anterior`, `posterior`; "Caudate : head, body, tail" -> caudate + three children). Extra fields:
  `abbreviations`, `concept` (true for directions/planes/ideas, no pin expected). Cranial nerves I-XII were added (the Unit 2 list gives only a heading).
  Seed storage: `structures.synonyms` = synonyms + abbreviations; `info.lists/laterality/parent/abbreviations/concept`. Topic `meta.number/sources`.
- Topic slugs are unpadded (`lab-13`, `lecture-7`). Card `content` JSON = every card field except slug/kind/topic/structure/status/position.
- Media keys in cards end in `.webp` (the uploaded object); `media.mjs` finds the original under content-build.
- Pin cards from Anki: optional `caption` (visible text shapes), `review_note` on drafts, `accept` mirrors the structure's synonyms/abbreviations.
  Brodmann/Roman-numeral label cards carry a custom `prompt`.
- Practical cards: pin with `pointer.type "existing"`, `masks: []`, `target: null`, `extra_images`; theory cards also carry `after_pin`, and
  optional `image/w/h/pointer` when they are stand-alone stations. Pins list dependents in `followup_cards` (card slugs, always) and
  `followups` (`<structure>:<facet>`, only when the pin has a structure). Theory `format`: type | keywords | tf | choice.
