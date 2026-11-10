# Code review, November 2026 (non-atlas core)

Scope: `src/lib/**` (not `src/lib/atlas`), `src/app/api/**`, pages outside `/atlas`, `src/components/**` (not
`src/components/atlas`), `scripts/**`, `supabase/**`, proxy and config. The atlas, `src/data`, and visual UI bugs
belong to other agents. Every fix below has a `node --test` test that failed before the fix, unless it says otherwise.
Run them with `npm test`.

Severity: **critical** (data loss or a hole anyone can use), **high**, **medium**, **low**.

## Fixed

### High: anyone could join a course with the code `%%%`
`src/app/join/actions.ts` looked the code up with
`.ilike("join_code", code.replace(/[%_]/g, "\$&"))`. In a JS string `"\$&"` is just `$&`, which means "the matched text",
so nothing was escaped. `%` and `_`, and PostgREST's `*`, stayed wildcards. With one course in the DB, `lookupCourse("%%%")`
returned it and `joinCourse` enrolled the caller. Prefix probing (`A%`, `AB%`) would find a code one letter at a time.
- Proof: `"a%b_c".replace(/[%_]/g, "\$&") === "a%b_c"`. The live DB has 1 course, and every stored code is upper-case.
- Fix: `.eq("join_code", joinCodeKey(code))`, where `joinCodeKey` trims and upper-cases (`src/lib/auth/index.ts`).
  It uses the unique index and stays case-insensitive for students.
- Test: `src/lib/auth/index.test.ts` (joinCodeKey).

### Medium: regenerated join codes had a copied suffix (`ABCDE-ABC`)
`newJoinCode` in `src/app/staff/actions.ts` (and its twin `joinCode` in `src/app/admin/actions.ts`) built both parts from
`bytes[0..]`. The 3-letter suffix was always the first 3 letters of the prefix, which gave 25 bits instead of 40.
- Test: `newJoinCode` produced 200/200 such codes before the fix, and 0 after.
- Fix: one generator in `src/lib/auth/index.ts`, with each part reading its own bytes. Both actions use it.

### Medium: open redirect after login
`src/app/login/LoginForm.tsx` accepted any `next` that started with `/` but not `//`. `/\evil.com` passed, and browsers
read `\` as `/`. The shared `safeNext` blocked `\` but not tab or newline: `new URL("/\t/evil.com", base)` is
`https://evil.com/`.
- Fix: `safeNext` (now `src/lib/auth/next.ts`, free of dependencies so the client form does not pull in zod) refuses
  backslashes and control characters, and checks that the URL resolves to the same origin. The login form uses it.
- Test: `src/lib/auth/index.test.ts` (safeNext).

### Medium (suspected, fixed defensively): media route path traversal
`/api/media/[course]/[...key]` rejected only a segment equal to `..`. Next decodes each catch-all segment, so `%2F`
puts a `/` inside one segment (`a%2F..%2F..%2Fother%2Fx.png`). The service-role storage client then builds
`.../object/sign/course-media/nsci3250/a/../../other/x.png`, which URL parsing collapses to another course folder.
With one more `..` it reaches another bucket (`bug-reports`).
- Not reproduced end to end: I did not test whether Vercel delivers the encoded slash to Next. The guard is cheap,
  so it is fixed anyway.
- Fix: `mediaPath()` in `src/lib/media.ts` refuses empty, `.`, `..` and any segment with `/`, `\` or a control
  character, plus a `.`/`..` course. Checked: no content key uses any of these.
- Test: `src/lib/media.test.ts`.

### Low: invisible BOM literal in the staff CSV export
`src/components/staff/Dashboard.tsx:137` had a raw U+FEFF inside a string literal (the Excel UTF-8 marker). It now uses
the `\uFEFF` escape. This was the only non-ASCII control or invisible character in `src`, `scripts` and `supabase`.
All files are valid UTF-8 (scan: every `.ts/.tsx/.js/.mjs/.css/.json/.sql/.md`).

### High: a trap chunk with end NaN made `/api/study/answer` return 500 (trap banking lost)
`src/lib/study/traps.ts` `classifyGroup`: an extra letter before the first one ("ccaudate nucleus") is an insertion at
answer index 0. `src(hi - 1)` read `map[-1]`, so the chunk end became `NaN`. The `card_traps` upsert (`end_pos int not
null`) failed. The route had already stored the log and the card state, so the client's retry was `ignored`, and that
answer's trap evidence was lost.
- Fix: an insertion's chunk is the letter it sits before (`sLo + 1`). For index > 0 this is the same value as before.
- Test: `src/lib/study/grade-edge.test.ts` ("traps: an extra letter...").

### Medium: grading errors with real consequences for scheduling (all in `grade-edge.test.ts`)
- **Wrong number accepted.** "CN VI" for "CN VII", and "T4" for "T5", were near misses (Hard). In exam mode, which is
  "generous" by default, "CN V" for "CN VI" scored **full marks** ("Spelling forgiven"). Fix: `numberSwap` in
  `grade.ts`. When both strings name numbers (Roman numeral words or digits) and they differ, the answer is wrong
  ("check the number"). A lone "v" (vein) on one side does not count.
- **Abbreviations chained across words.** "nerve" became "n.", and the "nucleus" pass then expanded that same "n."
  again. So "Oculomotor nucleus" was accepted for "Oculomotor nerve", "Cranial nuclei" for "Cranial nerves", and
  "CN V" turned into "cranial n. vein". Fix (`variants.ts`): only abbreviations the author wrote are expanded, never
  ones the generator made. An answer written as "Oculomotor n." still accepts both.
- **A bare abbreviation was the answer to a one-word name** ("n" for "Nerve", "tr" for "Tract"). Fix: no
  abbreviating when the word is the whole answer.
- **"CN7" / "CN12" without the space were wrong.** Fix: `CN7` and `CNVII` forms.
- **Side word followed by a hyphen or comma** ("Right-atrium", "L-caudate", "left, ...") was graded "Say which side",
  although the typer had already matched it. Fix: `hasSideWord` ends the word at any non-letter, non-digit.
- **Non-ASCII dashes** (U+2010/2011/2012, minus U+2212; U+2011 occurs in lecture-13 slides) were deleted instead of
  separating words, so "Edinger‑Westphal" came out as one word. Fix: every `\p{Pd}` and U+2212 is a hyphen
  (`text.ts`).
- **Keyword grading.** "efferent" counted as a hit for the key "afferent" (1 edit), and a phrase key matched inside
  words ("within there" hit "in the"). Fix: the opposite term is never a hit, and a phrase must start at a word.
  Added abduction/adduction, abductor/adductor and abducts/adducts to the opposites.
- Regression check on real content: every one of the 2,957 cards' own answer and accepts grades "correct" before and
  after (0 regressions). The variants lost are all chained abbreviations. Note: 476 cards (16%) reach the 96-variant
  cap, which silently drops later forms ("the X", side forms). Before the fix it was 484. Not changed here (see
  "Not changed").

### Low: settings
`readLearnerSettings` never clamped `guardMinutes`/`guardCards`. A stored 0 stopped every session at the first
card. It also did not round `newPerDay`/`sprintSize`. They are clamped and rounded now (`settings.ts`, test in
`grade-edge.test.ts`).
