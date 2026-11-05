-- RLS performance. The original policies called security-definer helpers per row (is_course_member(course_id)),
-- which Postgres cannot inline: reading 1,000 cards ran ~4,000 sub-queries (~1.3 s). These policies ask once per
-- statement for the set of courses / users the caller may see (an uncorrelated sub-select becomes a hashed
-- sub-plan), and wrap auth.uid() / is_admin() in a sub-select so they are evaluated once (Supabase guidance).
-- Same access rules as before.

create or replace function public.my_course_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.courses c where public.is_admin()
  union
  select e.course_id from public.enrollments e where e.user_id = auth.uid();
$$;

create or replace function public.my_staff_course_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select c.id from public.courses c where public.is_admin()
  union
  select e.course_id from public.enrollments e where e.user_id = auth.uid() and e.role in ('ta', 'professor', 'admin');
$$;

-- users whose summaries the caller may see as staff (everyone for an admin)
create or replace function public.my_staff_user_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select p.id from public.profiles p where public.is_admin()
  union
  select m.user_id from public.enrollments s
    join public.enrollments m on m.course_id = s.course_id
   where s.user_id = auth.uid() and s.role in ('ta', 'professor', 'admin');
$$;

revoke all on function public.my_course_ids() from public, anon;
revoke all on function public.my_staff_course_ids() from public, anon;
revoke all on function public.my_staff_user_ids() from public, anon;
grant execute on function public.my_course_ids() to authenticated;
grant execute on function public.my_staff_course_ids() to authenticated;
grant execute on function public.my_staff_user_ids() to authenticated;

-- course content
alter policy cards_read on public.cards using (course_id in (select public.my_course_ids()));
alter policy cards_staff_write on public.cards using (course_id in (select public.my_staff_course_ids())) with check (course_id in (select public.my_staff_course_ids()));
alter policy structures_read on public.structures using (course_id in (select public.my_course_ids()));
alter policy structures_staff_write on public.structures using (course_id in (select public.my_staff_course_ids())) with check (course_id in (select public.my_staff_course_ids()));
alter policy topics_read on public.topics using (course_id in (select public.my_course_ids()));
alter policy topics_staff_write on public.topics using (course_id in (select public.my_staff_course_ids())) with check (course_id in (select public.my_staff_course_ids()));
alter policy units_read on public.units using (course_id in (select public.my_course_ids()));
alter policy units_staff_write on public.units using (course_id in (select public.my_staff_course_ids())) with check (course_id in (select public.my_staff_course_ids()));
alter policy notes_read on public.notes using (course_id in (select public.my_course_ids()));
alter policy notes_staff_write on public.notes using (course_id in (select public.my_staff_course_ids())) with check (course_id in (select public.my_staff_course_ids()));
alter policy courses_read on public.courses using (id in (select public.my_course_ids()));
alter policy courses_staff_update on public.courses using (id in (select public.my_staff_course_ids())) with check (id in (select public.my_staff_course_ids()));

-- people
alter policy enrollments_read_own on public.enrollments using (user_id = (select auth.uid()));
alter policy enrollments_read_staff on public.enrollments using (course_id in (select public.my_staff_course_ids()));
alter policy profiles_read_own on public.profiles using (id = (select auth.uid()));
alter policy profiles_read_staff on public.profiles using (id in (select public.my_staff_user_ids()));
alter policy profiles_update_own on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy study_sessions_staff_read on public.study_sessions using (user_id in (select public.my_staff_user_ids()));

-- own learning state
alter policy card_ladder_own on public.card_ladder using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy card_states_own on public.card_states using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy card_traps_own on public.card_traps using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy practical_attempts_own on public.practical_attempts using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy review_logs_own on public.review_logs using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy study_sessions_own on public.study_sessions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy user_card_notes_own on public.user_card_notes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy user_settings_own on public.user_settings using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy user_trap_patterns_own on public.user_trap_patterns using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- admin-only tables
alter policy bug_reports_admin on public.bug_reports using ((select public.is_admin())) with check ((select public.is_admin()));
alter policy content_reviews_admin on public.content_reviews using ((select public.is_admin())) with check ((select public.is_admin()));

-- indexes the hot paths filter on
create index if not exists cards_course_status_pos_idx on public.cards (course_id, status, position);
