# Brief for build agents (read fully before starting)

Project: `C:\Users\info\Desktop\ANKI PLUS ONLINE` — Next.js 16 App Router, React 19, TypeScript strict,
Tailwind 4, Supabase (Auth + Postgres + Storage), ts-fsrs 6. Windows 11, Node 24, npm 11.
Live: https://anki-plus-online.vercel.app (the lead deploys; you never do).

## Read first
1. `docs/SPEC.md` — the owner's decisions. Binding. When in doubt, it wins.
2. `docs/CONTENT_SCHEMA.md` — card/structure JSON contract.
3. `docs/ARCHITECTURE.md`, `README.md`, `AGENTS.md` (Next 16: the middleware file is `src/proxy.ts`).
4. Reference app ANKI+ (read-only, never modify): `C:\Users\info\Desktop\ANKI PLUS\` — Python stdlib
   server in `app/`, vanilla JS UI in `web/js/`, CSS in `web/css/`.

## Database
- Supabase is live. `.env.local` holds the URL, anon/publishable key, service-role key and a Management
  API token. `node scripts/db.mjs migrate | status | query "<sql>" | file <path.sql>` runs SQL on the live DB.
- Schema: `supabase/migrations/0001_init.sql` (applied). Add your own migrations as new files in YOUR
  number range and apply them with `node scripts/db.mjs migrate`:
  engine 0010–0019, accounts 0020–0029, content 0030–0039, themes 0040–0049.
  Never edit 0001 or another agent's migration. Never drop tables or delete real data.
- RLS is on for every table. Staff (ta/professor) see per-student SUMMARIES only: no RLS read of
  `card_states`/`review_logs` for staff; dashboards use aggregate `security definer` functions.
- The course NSCI3250A exists (join code `NEURO-2L94`; don't change it). Test accounts: create them with
  the admin API using emails `test-<yourrole>-<n>@uvm.edu`, and delete them when done.

## Working alongside other agents
- Several agents edit this repo at the same time. Touch only the paths your brief gives you.
  For shared files (`src/app/layout.tsx`, `src/app/globals.css`, nav components, `package.json`) make
  small additive edits, and re-read the file right before editing.
- Styling: only semantic theme tokens (the CSS variables / Tailwind theme names in `globals.css`), never
  hard-coded colours or fonts. A theme agent will add three full themes (UVM Clinical, Dark Academia,
  Synthwave Cortex), switched with `data-theme` on `<html>`.
- Sounds/effects: emit named events through `src/lib/feedback/events.ts` (the engine agent creates it);
  the theme agent maps events to each theme's sound pack. Don't play audio directly.
- Avoid new npm packages unless essential. Already installed: next, react, @supabase/supabase-js,
  @supabase/ssr, ts-fsrs, zod, three, @react-three/fiber, @react-three/drei, modern-screenshot, sharp,
  server-only. If you must install, re-read package.json first and make sure no other `npm install` is running.

## Verifying UI (never open a browser or any visible window)
- Run the dev server on your own port: `npx next dev -p <port>` (engine 3101, accounts 3102,
  content 3103, themes 3104). Stop only that process when done.
- Screenshots: `node tools/ui/shot.mjs <url> <out.png> --port <cdp-port> [--w 1280 --h 800] [--eval "<js>"]`
  (engine 9351, accounts 9352, content 9353, themes 9354). It drives an off-screen, muted WebView2
  window over CDP; cookies persist between calls, so log in once with `--eval`. Save PNGs in your
  scratch space (not the repo), look at them with the Read tool, and run
  `node tools/ui/shot.mjs --stop --port <cdp-port>` at the end.
- Headless Chrome/Edge/Playwright are not allowed (they get killed on this machine and disturb the owner).

## Git
- Commit often, staging explicit paths (never `git add -A` or `git add .`). End every message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Don't push. Don't deploy.
- `npx tsc --noEmit` passes before each commit; `npm run build` and `npm run lint` pass at the end.
- Don't commit anything from `content-build/`, `_source/` or `.env*`.

## Report
Under 300 words: what works (and how you verified it), what's stubbed, decisions the owner should know.
