# ANKI PLUS Online: product spec

Decided with the owner (Shahriar, GitHub TheShanri) on 2026-11-05 through a 20-question interview.
Every feature agent reads this file first. When something here conflicts with a guess, this file wins.

## What it is
An online, multi-user, anatomy-focused version of the owner's local study app ANKI+ (reference code:
`C:\Users\info\Desktop\ANKI PLUS\`, Python stdlib server + vanilla JS; read it, never modify it).
First course: NSCI 3250 Human Neuroanatomy (UVM). Course material: `content-build/` (extracted from the
course zip). Target: the full course, polished, for **next term**; quality over speed.

## Platform
- **Multi-course.** Courses are database rows with a join code. NSCI 3250 is the first.
- **Roles:** `student`, `ta` (TAs and SI leaders: read student summaries, reset passwords), `professor`
  (everything for her course: settings, join codes, staff), `admin` (the owner: super-admin across all
  courses, plus the content-review tool).
- **Stack:** Next.js (App Router, TS) on Vercel, Supabase (Postgres + Auth + Storage), ts-fsrs.
  Zero running cost is a goal: no live AI calls, no paid APIs.

## Accounts
- **Login = UVM email + password.** The UVM email is the username and the Supabase auth email.
  No email verification (accounts are created confirmed).
- **Join flow:** course code → UVM email, password → profile: name, pronouns, class year, major, minor,
  lab section. The professor shares the code.
- **Forgot password:** emailed reset link. Sender is a `theexaminedexistence.com` address (DNS in
  Google Cloud DNS; the domain's mailbox is Zoho), sent through custom SMTP configured in Supabase.
  Staff can also trigger a reset for a student from the dashboard.
- **Privacy notice at signup:** instructors see per-student summaries.

## Staff dashboard (professor + TAs)
Per student, **summaries only** (no item-level detail per student):
- weekly time on task (active minutes from heartbeats), sessions, cards reviewed, accuracy totals,
  streak, last seen.
- **Class weak spots:** anonymous class-wide heatmap of the structures/topics most missed.
- **At-risk flags:** inactive N days, or well behind before a practical.
- **CSV export** of the summary table.
- Filter by lab section.
- Course settings: join code, staff, mock-practical station time, spelling strictness in exam mode.

## Owner's super-admin: content review
Module by module (unit → lecture/lab → card), card by card: **Good** / **Flag + note**. Flags and notes
are stored in the DB so Claude can read them later and fix the content. Show progress per module
(reviewed / flagged / remaining). Keyboard-driven (G = good, F = flag, arrows).

## Report a bug (every page, every role)
- A small always-available "Report a bug" button (and a keyboard shortcut).
- **Logs before and after:** the client keeps a ring buffer (last ~5 min / ~500 entries) of console
  output, uncaught errors and promise rejections, failed fetches (URL, status, timing), route changes,
  key user actions (breadcrumbs: card shown, answer submitted, settings toggled; never passwords or
  typed free text outside the answer box), plus app state (route, theme, card id, mode, viewport,
  browser/OS). On report it sends the "before" buffer, then keeps capturing for ~60 s (or until the
  next page change) and appends the "after" buffer to the same report.
- **Screenshot:** silently renders the current page to an image from the DOM (e.g. modern-screenshot /
  html-to-image; no screen-share permission prompt), downscaled, attached to the report. If rendering
  fails, the report still goes through.
- The student can add a one-line description (optional). Stored in a `bug_reports` table + private
  Storage bucket; the admin (owner) sees them in the admin area, and Claude reads them later to fix bugs.

## Content (everything open from day one; no date-gating)
Card families, in build priority:
1. **Pin-the-structure** (deepest): a lab photo/slide/section with a pin or arrow → type the name.
   Mirrors the practical. Sources: Anki image-occlusion decks, practical pictures with answer keys,
   labeled/unlabeled slide pairs, atlas images.
2. **Pathway tracing:** receptor → 1st/2nd/3rd-order neuron → where it decussates → level → target.
   Practicals ask "1st/2nd order" logic questions, so drill those explicitly.
3. **Sections & levels:** coronal/horizontal sections and brainstem levels: identify the level, then
   the structures on it.
4. **Clinical lesions:** lesion → deficit (and side), deficit → lesion location.
- **Theory = second step after naming.** Once a structure's name is solid, its card gains a follow-up
  asked right after the name (function / what passes through / connections / lesion), exactly like a
  practical station.
- **Name explanation + etymology** (Latin/Greek) pre-written for every structure, shown after answering
  and on demand. No AI memory hooks.
- **Student mnemonics:** students can attach their own mnemonic to a card (advanced feature; offered
  gently after repeated misses).
- **MCQ** and **spelling reps** come later (keep the card model open for them).
- All content passes through the owner's review tool before it is considered final.

## Study mechanics (port ANKI+ faithfully)
- **Type-the-answer for every card**, ANKI+ grading: normalisation, synonyms/abbreviations
  (CN VII = facial nerve), diff display, ghost-letter hints that downgrade the grade.
- **Practice mode:** direct spelling feedback; the **Russian-style scaffold ladder** (copy → skeleton →
  first letters → recall), fading in half-steps by performance (never remove a big chunk of help at once);
  the spelling-warning cycle and animations; **trap letters** (learn each student's idiosyncratic
  misspellings, guard those spots); **boss fights**.
- **Exam mode** (mock practical): no feedback, type and go; some spelling generosity.
- **Mock lab practical:** timed stations (staff set seconds per station, default 60-90 s), no going back,
  scored at the end with a review.
- **Typing off toggle:** allowed, behind a warning about recall, consolidation and the under-developed
  memory–motor link (which can lower practical performance). Typing off = recall, reveal, self-grade
  Again/Hard/Good/Easy. A gentle weekly reminder while it is off.
- **"How your learning is scaffolded"**: a page explaining each support (hints, ladder, trap letters,
  theory follow-ups, focus helpers) with on/off toggles. Lives in Advanced settings and as a small **gear
  icon in the deck/study screen** for in-the-moment toggles.
- **On by default for new users:** ghost-letter hints, streaks + activity grid, sounds, focus helpers
  (micro-sprints, wander catcher, trap-letter slow mode).
- **Beginner-simple UI:** the home screen is "Study now" + course map + streak. Everything else
  (FSRS retention, ladder tuning, typing off, mnemonics, theme sound packs, etc.) goes under Advanced.
- **FSRS-6** via ts-fsrs, 90% retention default.
- **Social:** private only. Students see their own progress and the class average/pace. No names, no ranks.

## Themes (three, two-word names, each a full identity with its own sounds)
- **UVM Clinical**: calm, professional; UVM green (#154734) and gold (#FFD416) on clean neutrals;
  crisp clinical sounds.
- **Dark Academia**: candlelit library, serif type, parchment and oxblood; quill/page/bell sounds
  (LESEN+ is the in-house reference: `C:\Users\info\Desktop\ANKI PLUS\LESEN PLUS\`).
- **Synthwave Cortex**: ANKI+'s neon synthwave with a wireframe brain on the horizon; arcade/synth sounds.
Sounds are synthesised with Web Audio (no audio files needed). Keep animations compositor-only
(transform/opacity); no backdrop-filter over animated backgrounds.

## 3D atlas
Hybrid (see `_atlas/ATLAS_RESEARCH.md`): our own react-three-fiber viewer on Z-Anatomy meshes
(CC BY-SA 4.0, attribution page required), converted to compressed GLB per structure; "Open in 3D atlas"
on every structure card highlights the target and fades neighbours; rotate/zoom; parent-structure
fallback with an "approximate location" label where Z-Anatomy lacks a mesh. Optional deep links to
specialist atlases (siibra-explorer) where they exist.
Owner follow-ups (2026-11-05):
- Replace "approximate location" with exact structures wherever an established, openly licensed atlas
  has them (e.g. CIT168, Allen HRA 2020, HCP-842 tracts, JHU white-matter labels, Brainstem Navigator,
  SUIT): reuse verified atlases, never build anatomy from scratch, and include only curriculum structures.
- Highlight neighbouring structures and any other structures together (multi-select, colour legend).
- Views by cut: coronal, sagittal and transverse, toggleable, both as clipping cuts in the 3D model and
  as MRI-style slices (NiiVue on an MNI template with a curriculum label atlas).

## Hosting
- Vercel: a **different account** from the one the CLI is logged into now (the owner will log the CLI in).
- Supabase: the owner creates the project and puts keys in `.env.local`.
- Course images (the professor's slides) are served only to signed-in members (private Storage bucket
  or auth-gated route), never publicly. The Snell textbook is not redistributed.
