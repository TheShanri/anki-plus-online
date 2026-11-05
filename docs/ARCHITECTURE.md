# Architecture

## Auth flow
- Login is the school (UVM) email plus password; the email is the Supabase auth email. No email verification.
- **Login:** the form posts to `POST /api/auth/login`, which calls `signInWithPassword` server-side (cookies set via
  `@supabase/ssr`) and returns one generic error for any failure.
- **Join:** server action `src/app/join/actions.ts`: validate with zod, look up the course by `join_code`
  (service role), check the email domain against `courses.settings.allowed_email_domains` (default `["uvm.edu"]`),
  create the user with the admin API (`email_confirm: true`), insert `profiles` and `enrollments` (with
  `lab_section`), roll the auth user back if either insert fails, then sign in.
- **Forgot/reset:** `/forgot` calls `resetPasswordForEmail` with redirect to `/reset`, where the recovery session lets
  the user call `updateUser({ password })`. Email sending needs custom SMTP configured in Supabase (see SPEC).
  Staff-triggered resets are not built yet.
- **Session:** `src/proxy.ts` (Next 16 successor of `middleware.ts`) refreshes the session with `getUser()` and
  redirects unauthenticated visits to `/study`, `/course`, `/settings`, `/professor` to `/login`. Without Supabase env
  vars it passes everything through. `/professor` additionally checks the profile role in the page.

## Data model (`supabase/migrations/0001_init.sql`)
- People: `courses` (join_code, settings jsonb), `profiles` (id = auth.users.id, email, role), `enrollments`
  (per-course role, lab_section).
- Content (all carry `course_id`): `units`, `topics`, `structures`, `notes`, `cards` (kind enum, content jsonb).
- Learning state: `card_states` (FSRS fields), `review_logs`, `study_sessions` (active_ms from heartbeats), `user_settings`.
- `content_reviews`: the owner's review tool (good/flag, note, resolution). Admin only.

## RLS model
RLS is on every table. Helper functions (security definer, avoid policy recursion): `is_admin()`,
`is_course_member(course)`, `is_course_staff(course)` (ta/professor/admin enrollment, or global admin),
`is_staff_of_user(user)` (caller is staff in a course the user is enrolled in).
- Students: read/write only their own `card_states`, `review_logs`, `study_sessions`, `user_settings`.
- Staff: read those tables for members of their courses; read the roster and profiles; write content.
- Content: readable by enrolled members.
- Profile `role` and `email` cannot be changed by the user (trigger); creation of profiles, enrollments, courses goes
  through the service role.
- Global `admin` role passes all staff checks and alone can use `content_reviews`.

## FSRS
`src/lib/fsrs.ts` wraps ts-fsrs: `scheduleReview(cardStateRow, grade, now, {retention})` returns the next
`card_states` row and a `review_logs` insert row; `gradeFromTyping` maps typing results to grades. Pure functions,
tested in `src/lib/fsrs.test.ts`. Persisting results is done by the (future) study API.

## Theming
Semantic CSS variables in `src/app/globals.css`, exposed to Tailwind via `@theme inline`. Themes are selected with
`data-theme` on `<html>`; `synthwave` is complete, `clinical` is a starting point. SPEC lists three final themes.
