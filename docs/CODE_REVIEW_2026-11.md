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
