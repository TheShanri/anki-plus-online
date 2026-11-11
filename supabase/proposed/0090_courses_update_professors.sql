-- PROPOSED (code review 2026-11, docs/CODE_REVIEW_2026-11.md). NOT APPLIED. Kept outside supabase/migrations so
-- `node scripts/db.mjs migrate` does not pick it up; move it there once the owner approves.
--
-- Course settings and the join code belong to the professor (SPEC: TAs read summaries and reset passwords). The
-- policy courses_staff_update let any course staff, TAs included, PATCH /rest/v1/courses directly with their own
-- token: join_code, settings (allowed_email_domains is the join gate), code and slug (the media path key). The app
-- never relies on it: every course write is a professor-checked server action using the service role.
-- Additive and safe on live data: one new function, one policy narrowed. No rows change.

create or replace function public.my_prof_course_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.courses c where public.is_admin()
  union
  select e.course_id from public.enrollments e where e.user_id = auth.uid() and e.role in ('professor', 'admin');
$$;
revoke all on function public.my_prof_course_ids() from public, anon;
grant execute on function public.my_prof_course_ids() to authenticated;

alter policy courses_staff_update on public.courses
  using (id in (select public.my_prof_course_ids()))
  with check (id in (select public.my_prof_course_ids()));
