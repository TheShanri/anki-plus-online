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

### High: the session ended while the next batch was still loading
`StudyEngine.prefetch()` returned at once when a fetch was already running (`if (this.fetching) return`). When the
last queued card was answered before that fetch came back, `nextCard()` awaited it twice, got nothing both times,
and called `finish()`: "Session complete" with cards still on their way. Whenever a batch starts with fewer than 8
cards the prefetch starts at once, so a quick answer hits this.
- Fix: the in-flight fetch is kept as a promise (`loading`) and every caller waits for the same one (`engine.ts`).
- Test: `engine-sync.test.ts` ("the last card answered while the next batch is still loading..."). Checked: it
  fails with the old early return ("the session ended while cards were still loading").

### High: long sessions ended early (the exclude list outgrew the URL)
`fetchMore` sends every card answered in the session in `?exclude=` (37 bytes per id). About 380 answers make the
URL longer than Vercel accepts (14 KB), the fetch fails, the catch treats it as offline, and when the queue runs dry
the session ends as if nothing were left.
- Fix: `excludeForFetch()` sends what is still queued plus the 200 most recent answers. Older answers are stored and
  no longer due (every accept, first looks included, sends an answer), so the server does not offer them again.
- Test: `engine-sync.test.ts` ("the exclude list ... stays bounded").

### High: typing off: the self-rated recall streak never reached the server
With typing off (mode `self`, and free-text `keywords` cards) the engine counts a Good/Easy self-rating as a clean
recall and keeps the streak locally. The answer API only knew the typed cases (`unaided`, which needs typing), so it
wrote nothing for a good rating. Every new session reloaded the old streak, so theory follow-ups and mastery that
depend on the streak never moved for students who study with typing off.
- Fix: the payload carries `recall: clean | miss | keep`; the server's rule is one shared function,
  `ladderWrite()` in `ladder.ts`, which the route uses.
- Test: `engine-sync.test.ts` ("the server's ladder write matches what the engine keeps..."), which compares the
  engine's local ladder row with `ladderWrite()` of the payload it sent. Checked: with the old server rule it fails
  for "typing off, recalled well" (server streak 1, engine 2).
- Also: the route wrote `last_clean_at: null` on every answer that was not a clean recall, erasing the date of the
  last clean one. It now only sets it on a clean recall (nothing reads it yet).

### Medium: a retried answer whose first attempt died after the log insert never moved the card
The route stores the review log first (its id is the idempotency key), then the card state, ladder and traps. If
the first attempt failed after the log (a 500 from a later write, such as the trap-chunk NaN above, or a timeout),
the client's retry found the log and returned `ignored`, and the card's FSRS state never moved. The next answer to
that card was then scheduled from the stale state.
- Fix: on a duplicate log, the route reads the log back; if the stored state's `last_review` is older than the log
  (or there is no state), it applies the logged review once (`stateNeedsReplay()` in `fsrs.ts`). Equal means it was
  applied; newer means a later answer has been applied since, so nothing is replayed twice. Ladder and trap writes of
  the lost attempt are not replayed.
- Test: `engine-sync.test.ts` ("a retried answer whose state write was lost is replayed once, never twice"), on the
  helper (the route itself has no test harness).

### Medium: pagehide beacons could store answers out of order
`AnswerSync.beacon()` sent the first 10 queued items with `sendBeacon`, which go out in parallel and can arrive in
any order. Two answers to one card (a learning step) could be applied second-first, and the server state then stays
wrong for good (the later retry of the first finds its log). An undo could arrive before the answer it takes back.
- Fix: `beaconBatch()` sends only the leading run that is safe unordered: one answer per card, and an undo only as
  the first item. The rest stays in localStorage for the ordered pump on the next visit.
- Test: `engine-sync.test.ts` ("pagehide beacons only what can be stored in any order").

### Medium: one key press was handled twice in the study runner
The answer box's React `onKeyDown` (boxKeys, multiKeys) handles Enter/Tab/Esc, then the same native event bubbles
on to the runner's `window` keydown listener (React's root listener runs first). So one Tab gave two ghost letters,
Esc in the box submitted the card and then, now in the reveal, skipped its retype, and Enter on a right answer went
straight past the reveal. Fix: the window listener ignores events already `defaultPrevented`
(`StudyRunner.tsx`). Not covered by a unit test (no DOM harness); proven by the event order.

### High: a professor could create a course "admin" (and so make professors)
`setMemberRole` in `src/app/staff/actions.ts` typed `role` as student/ta/professor but never checked it. A server
action takes whatever the client sends, and `app_role` includes `admin`. A professor could set any member's
enrolment to `admin`; `courseRole()` then returns "admin" for that member, who passes the "only the site admin can
make someone a professor" check. A professor could also change an existing `admin` enrolment.
- Fix: `roleChangeError()` in `src/lib/auth/index.ts` (pure): only student/ta/professor can be set, and only the
  site admin changes professor or admin enrolments. The action uses it.
- Test: `src/lib/auth/index.test.ts` ("roleChangeError: ..."). Live DB: enrolments are 3 students and 1 admin (the
  owner); no role was changed.

### Medium: daily limits overshot: every follow-up batch handed out the whole remainder again
`buildStudyPayload` computed `newLeft = newPerDay - newDoneToday` from stored answers only. The client fetches the
next batch when fewer than 8 cards are queued; the new cards still queued (and answers not stored yet) were in
`?exclude=` but not counted. With 20 new a day: the first batch has 20 new cards, the fetch after 13 answers gets 7
more on top of the 7 still queued, 27 in all (and "Study more" overshoots the same way). Same for reviews.
- Fix: `dailyLeft()` in `src/lib/study/limits.ts`: cards the client holds of the same kind (new / review, by the
  server's state) count against the limit; `server.ts` uses it for both limits.
- Test: `src/lib/study/limits.test.ts`.

### Medium: the "Study more" button reloaded the same empty queue
Commit 8764d55 made "Study more" add 10 new cards past today's limit (`?more=`), but only the Enter key got it; the
button was a link to `/study/run?scope=...` plus a reload (no `more`, no `course`), i.e. the same queue that had
just run out. Fix: both use `studyMoreUrl()` (`src/lib/study/scope.ts`, test in `scope.test.ts`), and the button
first lets the last answers land (`sync.drain`, at most 3 s) since the new batch is built from stored answers.

### Medium: mock practical: a failed "finish" request lost the last station's answer
`PracticalRunner.finish()` set `finishing` back to false on an error. The runner then showed the last station
again with a fresh timer (the error text and the "Try again" button were only rendered while finishing, so never
shown). Moving on stored that station a second time with an empty answer (`cur` was already reset), and the server
keeps the last entry per card, so the real answer was replaced by "". Fix: stay on the scoring screen with the error
and "Try again" (`PracticalRunner.tsx`); `advance()` also ignores a second call for the same station (the timer and
Enter in the same moment). No unit test (component); the sequence follows from the code.

### Medium: feedback / bug report requests that returned 500
- `app_state` was stored as `JSON.parse(JSON.stringify(appState).slice(0, 6000))`: any state longer than 6000
  characters is cut mid-token and `JSON.parse` throws, after the screenshot was already uploaded (left orphaned).
  Fix: `clampState()` keeps the fields that fit. Test: `src/lib/bugs/clean.test.ts` (asserts the old expression
  throws).
- `body.type in FEEDBACK_TYPES` is true for "toString", "constructor", "__proto__" (then a 500 from the check
  constraint); a JSON body of `null` threw a TypeError. Fix: `ownKey()`, `bodyObject()`; same test file.
- `FeedbackWidget`: a second report sent within the first one's 60 s overwrote `after`: the first report's "after"
  logs were never sent, its listener kept collecting for the rest of the visit, and its timer later cut the second
  report's capture short. Fix: `send()` finishes the previous capture first. The done toast read a stale `failed`.

### Medium (migration proposed, not applied): students can write their own mock practical score
`practical_attempts_own` is `for all ... user_id = auth.uid()`, so a student can PATCH `score`/`max_score`/
`finished_at` on their own attempt over the REST API, skipping the server's grading; staff see these scores.
- Code (done): `/api/practical/finish` writes the graded fields with the service role (the attempt is read first
  through the student's RLS, so it is theirs).
- Migration (waiting for approval): `supabase/proposed/0091_practical_attempts_lock.sql`, a trigger that keeps
  graded fields from client writes and checks course membership on insert.

### Medium (migration proposed, not applied): TAs can change course settings and the join code directly
`courses_staff_update` lets any course staff (TAs too) update `courses` through the REST API with their own token:
`join_code`, `settings.allowed_email_domains` (the join gate), `code`, `slug` (the media path key). SPEC gives these
to the professor, and the server actions check it, but RLS allows more. No app code updates `courses` with a user
token. Migration (waiting for approval): `supabase/proposed/0090_courses_update_professors.sql`.

### Low-medium: a study-settings change could drop another one made at the same moment
`PATCH /api/study/settings` read the whole `user_settings.settings` document, merged, and upserted it back. Two
quick toggles from the gear, or a toggle next to a theme save (the theme RPC 0041 merges atomically so that it
"cannot clobber the engine's keys"), read the same document, and the later write dropped the other change, theme and
UI prefs included. Fix: the write is a compare-and-set on `updated_at` (re-read and retry, at most 4 times; 409
after). Checked on the live DB with a test user (created and deleted): after a theme save in between, the stale
write matches 0 rows and the retry keeps `theme` and `ui`. No unit test (route; the merge itself is tested).

Proposed migrations live in `supabase/proposed/` so `node scripts/db.mjs migrate` (run by any agent) cannot apply
them by accident. Move a file into `supabase/migrations/` to approve it.

## Performance

Measured with `node --conditions=react-server scripts/bench-queue.mjs [runs]` (new): it builds the study queue with
the real `buildStudyPayload` as a test student (created and deleted by the script) against the live database, from
this machine (so absolute times include ~100-300 ms per round trip to Supabase; on Vercel each round trip is far
shorter, the number of sequential round trips is what carries over). `BENCH_TRACE=1` prints each request's start/end.
A/B runs were interleaved (old = `server.ts` of 08296a9, kept beside it for the run, then deleted).

| first batch (new student, warm) | before | after |
|---|---|---|
| sequential round trips | 4 | 3 |
| median of 5 runs, 3 interleaved rounds | 1174 / 1160 / 957 ms | 879 / 862 / 768 ms |
| Supabase requests | 12 | 12 |
| payload | 71.7 KB (11.9 KB gzip) | same |

- The student's own notes (`mnemonics`) were a fourth round trip after the cards; they now load with the cards
  (only explicit follow-up cards, rare, need a second look). `server.ts`.
- Follow-up batch with the first batch still queued: before 10 requests, 29.4 KB, ~730-870 ms, and it handed out a
  second set of new cards (the daily-limit bug above); after 7 requests, 1 KB, ~340-430 ms, no new cards.
- Payload: 43 KB of the 72 KB first batch is `names` (every structure name, for "that is another structure"),
  sent once per session; 12 KB gzipped in all. Left as is.
- Study page JavaScript: `Reveal.tsx` imported `@/lib/atlas/catalog` statically, which pulls `atlas-links.json` and
  `atlas-skull.json` (70 KB minified, 8.7 KB gzip) into the study route only to decide whether to show "View in the
  atlas". It is now imported on the first reveal (`useAtlasTarget`). No other static import of it on the study,
  home or settings paths. three.js, NiiVue and modern-screenshot are only loaded dynamically outside the atlas.
  (No `next build` here, so no bundle-analyzer numbers.)
- Indexes: every hot query has one (`card_states`/`card_ladder` by user, `review_logs (user_id, reviewed_at)`,
  `cards (course_id, status, position)`, `mnemonics (user_id, card_id)` unique, `card_traps (user_id, card_id)`).
  The database is small (3 students); latency is round trips, not query plans. No index migration proposed.

## Hygiene
- Scan of `src`, `scripts`, `supabase` (391 text files): all valid UTF-8, no control or invisible characters
  (U+0000-001F except tab/newline/CR, U+007F, U+200B-200F, U+2028/2029, U+202A-202E, U+2060, U+FEFF).

## Migrations waiting for approval (written, NOT applied)
In `supabase/proposed/` (outside `supabase/migrations/`, so `node scripts/db.mjs migrate` skips them). To approve:
move the file into `supabase/migrations/` and run `node scripts/db.mjs migrate`. Both are additive and change no rows.
1. `0090_courses_update_professors.sql`: `courses` updates by course professors (and the admin) only, not TAs.
   The app is unaffected: every course write is a server action with the service role.
2. `0091_practical_attempts_lock.sql`: a trigger keeps the graded fields of `practical_attempts` (score, max_score,
   finished_at, stations, ...) from writes with a student's token, and checks course membership on insert. Needs
   commit 67bcf4e deployed first (the finish route writes the grade with the service role).

## Found, not fixed (ranked)
- **Medium, achievements lost update** (`src/lib/achievements/server.ts` processBatch/saveState): counts are read,
  incremented in memory and upserted as absolute values, so two batches at once (the pagehide beacon next to a fetch,
  or two tabs) lose increments and XP. If one of the three upserts fails, the event ids are rolled back and the
  retry counts the stats that did commit twice. Needs an increment in SQL (an RPC, so a migration). Not proven by a
  test.
- **Low-medium, TTS button states** (`src/lib/tts/player.ts`, `SpeakButton.tsx`): a `speak()` superseded by another
  speak or `stop()` returns without calling its `onState("idle")`, so that button keeps its spinner; the shared
  `audio.onpause` is reassigned to the next caller before the old clip's pause event fires, so the old button stays
  "playing" (its next click stops instead of playing); any SpeakButton unmounting calls the global `stop()`, which
  can cut the automatic read-aloud. Cosmetic; fix sketched (keep one `active {id, onState}`, settle it on stop/next
  speak, release only one's own clip on unmount).
- **Low-medium, achievements client** (`src/lib/achievements/client.ts`): a batch answered 500 is retried forever
  and blocks every later event; `authFailed` stays set until a reload or an `online` event.
- **Low, heartbeat minutes** (`/api/study/heartbeat`, `engine_heartbeat`): each request may add up to 120 s, with no
  cap against wall time, so a client can inflate its own active minutes (shown to staff); `p_course` is not checked
  against the caller's enrolments. Needs an RPC change (migration).
- **Low, feedback**: the routes accept anonymous callers (SPEC: every page, every role) with an in-memory,
  per-instance rate limit; `sendBeacon` of the after-logs ignores its return value (payloads over 64 KB are dropped
  silently); the append route is select-then-update (racy, but token-protected).
- **Low, RLS**: a student can clear their own `profiles.extra.must_change_password` (profiles_update_own); a student
  can change `course_id`/`card_id` of their own mnemonic (mnemonics_own_update). No data of others is exposed.
- **Low, answer sync across tabs**: two tabs share one localStorage key and each saves its own queue over the
  other's. Answers still go out from memory (the server is idempotent); only the crash-safety copy can be lost.
- **Low, ladder on choice/true-false cards**: on a wrong pick the server resets the clean streak (`ladderWrite`), the
  engine keeps it locally until the session ends.
- **Low, API error text**: several routes return Postgres `error.message` to the client.
- Checked, not a bug: `evaluate()` in `src/lib/achievements/engine.ts` defaults to the UTC day, but the snapshot only
  uses the best streak, which does not depend on today.

## Chosen not to change
- The answer replay re-applies only the card state, not the lost attempt's ladder and trap writes (their inputs are
  not stored in the log).
- `reviewsLeft` counts learning steps (`state_before != 0`) against the review limit: looks like an owner choice.
- The 43 KB `names` map in the first batch (needed for grading feedback, 12 KB gzip in all).
- Staff RLS reads of `study_sessions`, `user_achievements`, `profiles` per student: the app does not use them for
  item-level data, and the SPEC's summaries include sessions; owner decision.

## For the atlas agents (not touched)
- `supabase/migrations/0080_atlas_progress.sql`: policies `atlas_seen_staff_read` and `atlas_stats_staff_read` give
  TAs and professors item-level atlas rows per student (which structures a student opened, counts, dates), against
  the SPEC's "summaries only". Suggest dropping them and exposing an aggregate function.
- `src/lib/atlas/catalog.ts` imports two JSON files (70 KB) at module level; the study page now imports it lazily.

## Not reviewed
- `scripts/seed.mjs` (the content seed) and `scripts/**` other than `db.mjs` and `perf-probe.mjs`.
- The admin content-review tool (`ReviewRunner`, `CardPreview`, `/admin/review`), the staff dashboard components
  (`Dashboard.tsx`, `Charts.tsx`, `Members.tsx`) beyond the RLS and server-action checks, `src/lib/home/data.ts`,
  `/profile` and `/course` pages.
- Grading internals (`grade.ts`, `typer.ts`, `variants.ts`, `parts.ts`, `traps.ts`, `trapguard.ts`) beyond the
  fixes listed above from the first pass.
- No headless UI check of the keyboard fix, the Study more button or the practical retry screen (daytime limits).
- eslint over the whole in-scope tree: the full run was cut off; every file changed in this review lints clean.

## Next to review
1. Achievements lost update (SQL increment RPC) and the heartbeat cap: both need a small migration.
2. TTS player button states (sketch above).
3. `scripts/seed.mjs` (idempotency, what it deletes), then the admin review tool.

## Commits (this review)
77ae620, b1fbead (first pass); 08296a9 (study sync), e07e757 (staff roles), c8f2bb7 (daily limits, Study more,
practical retry), 91cdd33 (feedback routes and widget), 67bcf4e (practical grade with the service role, proposed
migrations), e48063c (queue round trip, lazy atlas catalog, bench script), 7003bd2 (settings compare-and-set).
