-- THEMES / HOME: the student's own activity grid (security invoker, RLS applies) and an anonymous
-- class-pace aggregate (security definer, class average only, hidden below 5 active students).

-- Reviews and active minutes per local day for the caller, last p_days days.
create or replace function public.theme_activity_days(p_tz text default 'America/New_York', p_days int default 371)
returns table (day date, reviews int, minutes int)
language sql stable security invoker set search_path = public as $$
  with r as (
    select (reviewed_at at time zone p_tz)::date as d, count(*)::int as n
    from public.review_logs
    where user_id = auth.uid() and reviewed_at >= now() - make_interval(days => least(greatest(p_days, 1), 800))
    group by 1
  ), s as (
    select (started_at at time zone p_tz)::date as d, (sum(active_ms) / 60000)::int as m
    from public.study_sessions
    where user_id = auth.uid() and started_at >= now() - make_interval(days => least(greatest(p_days, 1), 800))
    group by 1
  )
  select coalesce(r.d, s.d) as day, coalesce(r.n, 0) as reviews, coalesce(s.m, 0) as minutes
  from r full outer join s on r.d = s.d
  order by 1;
$$;

-- "You vs class pace" over the last 7 days, per active day. Returns only averages: no names, no ranks.
-- class_avg_* are null when fewer than 5 students were active (so nobody can be singled out).
create or replace function public.theme_class_pace(p_course uuid, p_tz text default 'America/New_York')
returns table (active_students int, class_avg_reviews numeric, class_avg_minutes numeric, my_reviews numeric, my_minutes numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_course_member(p_course) then
    raise exception 'not a member of this course' using errcode = '42501';
  end if;
  return query
  with studs as (
    select e.user_id from public.enrollments e where e.course_id = p_course and e.role = 'student'
  ), rv as (
    select l.user_id, count(*)::numeric as n
    from public.review_logs l
    join public.cards c on c.id = l.card_id and c.course_id = p_course
    where l.reviewed_at >= now() - interval '7 days' and l.user_id in (select user_id from studs)
    group by l.user_id
  ), mn as (
    select s.user_id, (sum(s.active_ms) / 60000.0)::numeric as m
    from public.study_sessions s
    where s.started_at >= now() - interval '7 days' and (s.course_id = p_course or s.course_id is null)
      and s.user_id in (select user_id from studs)
    group by s.user_id
  ), act as (
    select u.user_id, coalesce(rv.n, 0) as n, coalesce(mn.m, 0) as m
    from studs u left join rv on rv.user_id = u.user_id left join mn on mn.user_id = u.user_id
    where coalesce(rv.n, 0) > 0 or coalesce(mn.m, 0) > 0
  )
  select
    (select count(*)::int from act),
    case when (select count(*) from act) >= 5 then (select round(avg(n) / 7, 1) from act) end,
    case when (select count(*) from act) >= 5 then (select round(avg(m) / 7, 1) from act) end,
    (select round(coalesce(sum(rv.n), 0) / 7, 1) from rv where rv.user_id = auth.uid()),
    (select round(coalesce(sum(mn.m), 0) / 7, 1) from mn where mn.user_id = auth.uid());
end $$;

revoke all on function public.theme_class_pace(uuid, text) from public;
grant execute on function public.theme_class_pace(uuid, text) to authenticated;
grant execute on function public.theme_activity_days(text, int) to authenticated;
