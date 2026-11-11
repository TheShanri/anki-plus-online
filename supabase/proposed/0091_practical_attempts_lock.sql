-- PROPOSED (code review 2026-11, docs/CODE_REVIEW_2026-11.md). NOT APPLIED. Kept outside supabase/migrations so
-- `node scripts/db.mjs migrate` does not pick it up; move it there once the owner approves.
--
-- practical_attempts_own is `for all ... using (user_id = auth.uid())`, so a student can PATCH their own attempt
-- (score, max_score, finished_at, stations) or insert a finished one, skipping the server's grading in
-- /api/practical/finish. Staff see these scores (staff_mock_scores, staff_overview).
-- Since commit "Practical: grade writes with the service role" the finish route writes the graded fields with the
-- service role, so this trigger only stops direct client writes. Rows already stored are not touched.
-- Requests with the user's token run as auth.role() = 'authenticated'; the service role and direct SQL pass.

create or replace function public.practical_attempts_lock()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    -- a new attempt is never finished or scored, and only in a course the student belongs to
    if not public.is_course_member(new.course_id) then
      raise exception 'not a member of this course' using errcode = '42501';
    end if;
    new.finished_at := null;
    new.score := null;
    new.max_score := null;
    new.active_ms := 0;
  else
    new.user_id := old.user_id;
    new.course_id := old.course_id;
    new.created_at := old.created_at;
    new.finished_at := old.finished_at;
    new.unit_slugs := old.unit_slugs;
    new.station_seconds := old.station_seconds;
    new.spelling := old.spelling;
    new.stations := old.stations;
    new.score := old.score;
    new.max_score := old.max_score;
    new.active_ms := old.active_ms;
  end if;
  return new;
end;
$$;

drop trigger if exists practical_attempts_lock on public.practical_attempts;
create trigger practical_attempts_lock before insert or update on public.practical_attempts
  for each row execute function public.practical_attempts_lock();
