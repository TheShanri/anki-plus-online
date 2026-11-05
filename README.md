# ANKI PLUS Online

Online, multi-user, anatomy-focused version of ANKI+: students join a course with a code, study type-the-answer
flashcards scheduled with FSRS, and instructors see per-student progress and time on task.
Product decisions: `docs/SPEC.md`. Technical overview: `docs/ARCHITECTURE.md`.

## Setup
1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase values (the app builds and renders without them,
   showing a "Supabase not configured" notice).
3. In Supabase, run `supabase/migrations/0001_init.sql` (SQL editor or `supabase db push`).
4. Create a course row (see ARCHITECTURE.md) with a `join_code`.
5. `npm run dev` then open http://localhost:3000

## Environment variables
| Name | Where | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | browser + server | either works |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | bypasses RLS; never expose |
| `NEXT_PUBLIC_SITE_URL` | both | canonical URL |

## Scripts
- `npm run dev` / `build` / `start`
- `npm run lint`
- `npm test` runs the FSRS unit tests with Node's built-in test runner (Node 22+ type stripping).

## Folder map
- `src/app/` routes: `/`, `/login`, `/join`, `/forgot`, `/reset`, `/study`, `/course`, `/settings`, `/professor`, `/atlas`, `api/auth/*`
- `src/proxy.ts` session refresh and route protection (Next 16 name for middleware)
- `src/lib/supabase/` browser, server, proxy and service-role admin clients
- `src/lib/auth.ts` zod schemas and email-domain check; `src/lib/fsrs.ts` scheduling wrapper
- `src/components/` nav bar, notices, page shell
- `supabase/migrations/` SQL
- `docs/` spec and architecture
- Not part of the app (other tooling, git-ignored where large): `_source/`, `content-build/`, `_atlas/`, `tools/`
