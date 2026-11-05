-- Accounts agent: bug reports, staff summary functions, review helpers.

-- ------------------------------------------------------------------ bug reports
create table if not exists public.bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  route text,
  description text,
  user_agent text,
  app_state jsonb not null default '{}'::jsonb,
  logs_before jsonb not null default '[]'::jsonb,
  logs_after jsonb not null default '[]'::jsonb,
  screenshot_path text,
  append_token text not null default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'open' check (status in ('open', 'fixed', 'dismissed')),
  resolved_note text
);
create index if not exists bug_reports_created_idx on public.bug_reports (created_at desc);
alter table public.bug_reports enable row level security;
drop policy if exists bug_reports_admin on public.bug_reports;
create policy bug_reports_admin on public.bug_reports for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public) values ('bug-reports', 'bug-reports', false)
  on conflict (id) do nothing;

-- ------------------------------------------------------------------ staff summaries
-- Day-level activity for a course's students (internal helper; not exposed to clients).
create or replace function public._course_days(cid uuid)
returns table (user_id uuid, d date)
language sql stable security definer set search_path = public as $$
  select rl.user_id, (rl.reviewed_at at time zone 'UTC')::date
    from public.review_logs rl join public.cards c on c.id = rl.card_id
    where c.course_id = cid
  union
  select s.user_id, (s.started_at at time zone 'UTC')::date
    from public.study_sessions s where s.course_id = cid or s.course_id is null;
$$;
revoke all on function public._course_days(uuid) from public, anon, authenticated;

-- Per student: weekly minutes (index 0 = this week, then the 8 weeks before), sessions, cards, accuracy, streak, last seen.
create or replace function public.staff_roster(cid uuid)
returns table (
  user_id uuid, display_name text, pronouns text, lab_section text, email text, joined_at timestamptz,
  weeks_min numeric[], sessions int, cards_reviewed int, accuracy numeric, streak int, last_seen timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  return query
  with students as (
    select e.user_id, e.lab_section, e.joined_at, p.display_name, p.pronouns, p.email
    from public.enrollments e join public.profiles p on p.id = e.user_id
    where e.course_id = cid and e.role = 'student'
  ),
  wk as (
    select st.user_id, w.i,
      coalesce(sum(s.active_ms) filter (
        where s.started_at >= date_trunc('week', now()) - (w.i * interval '1 week')
          and s.started_at <  date_trunc('week', now()) - ((w.i - 1) * interval '1 week')), 0) / 60000.0 as mins
    from students st cross join generate_series(0, 8) as w(i)
    left join public.study_sessions s on s.user_id = st.user_id and (s.course_id = cid or s.course_id is null)
    group by st.user_id, w.i
  ),
  wka as (select wk.user_id, array_agg(round(wk.mins, 1) order by wk.i) as arr from wk group by wk.user_id),
  ses as (
    select s.user_id, count(*)::int as n, max(greatest(s.started_at, coalesce(s.ended_at, s.started_at))) as last_s
    from public.study_sessions s where s.course_id = cid or s.course_id is null group by s.user_id
  ),
  rv as (
    select rl.user_id, count(*)::int as n,
      avg(case when coalesce(rl.correct, rl.rating >= 3) then 1.0 else 0.0 end) as acc,
      max(rl.reviewed_at) as last_r
    from public.review_logs rl join public.cards c on c.id = rl.card_id
    where c.course_id = cid group by rl.user_id
  ),
  days as (select distinct dd.user_id, dd.d from public._course_days(cid) dd),
  isl as (
    select days.user_id, days.d, days.d - (row_number() over (partition by days.user_id order by days.d))::int as grp from days
  ),
  runs as (select isl.user_id, isl.grp, count(*)::int as len, max(isl.d) as last_d from isl group by isl.user_id, isl.grp),
  streaks as (
    select r.user_id, r.len from runs r where r.last_d >= (now() at time zone 'UTC')::date - 1
  )
  select st.user_id, st.display_name, st.pronouns, st.lab_section, st.email::text, st.joined_at,
    coalesce(wka.arr, array_fill(0::numeric, array[9])),
    coalesce(ses.n, 0), coalesce(rv.n, 0),
    case when rv.n is null then null else round(rv.acc * 100, 1) end,
    coalesce((select max(sk.len) from streaks sk where sk.user_id = st.user_id), 0),
    greatest(ses.last_s, rv.last_r)
  from students st
  left join wka on wka.user_id = st.user_id
  left join ses on ses.user_id = st.user_id
  left join rv on rv.user_id = st.user_id
  order by st.display_name;
end $$;

-- Anonymous class-wide miss rates by topic and by structure (only where >= 3 students attempted).
create or replace function public.staff_weak_spots(cid uuid)
returns table (
  level text, unit_title text, unit_position int, topic_id uuid, topic_title text, topic_position int,
  structure_id uuid, structure_name text, students int, attempts int, miss_rate numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  return query
  with att as (
    select rl.user_id, c.topic_id, c.structure_id,
      (not coalesce(rl.correct, rl.rating >= 3)) as miss
    from public.review_logs rl join public.cards c on c.id = rl.card_id
    where c.course_id = cid and c.topic_id is not null
  )
  select 'topic'::text, u.title, u."position", t.id, t.title, t."position", null::uuid, null::text,
    count(distinct a.user_id)::int, count(*)::int, round(avg(a.miss::int) * 100, 1)
  from att a join public.topics t on t.id = a.topic_id left join public.units u on u.id = t.unit_id
  group by u.title, u."position", t.id, t.title, t."position"
  having count(distinct a.user_id) >= 3
  union all
  select 'structure'::text, u.title, u."position", t.id, t.title, t."position", s.id, s.canonical_name,
    count(distinct a.user_id)::int, count(*)::int, round(avg(a.miss::int) * 100, 1)
  from att a join public.topics t on t.id = a.topic_id left join public.units u on u.id = t.unit_id
    join public.structures s on s.id = a.structure_id
  group by u.title, u."position", t.id, t.title, t."position", s.id, s.canonical_name
  having count(distinct a.user_id) >= 3;
end $$;

-- At-risk students: inactive >= N days, or well behind the class before a practical.
create or replace function public.staff_at_risk(cid uuid)
returns table (user_id uuid, display_name text, lab_section text, reason text, days_inactive int, recent_min numeric, median_min numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  inactive_n int;
  prac_soon boolean := false;
  prac_name text;
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  select coalesce((c.settings ->> 'inactivity_days')::int, 5) into inactive_n from public.courses c where c.id = cid;
  select true, p.elem ->> 'name' into prac_soon, prac_name
  from public.courses c, lateral jsonb_array_elements(coalesce(c.settings -> 'practicals', '[]'::jsonb)) as p(elem)
  where c.id = cid
    and nullif(p.elem ->> 'date', '') is not null
    and (p.elem ->> 'date')::date between current_date and current_date + 14
  order by (p.elem ->> 'date')::date limit 1;
  prac_soon := coalesce(prac_soon, false);

  return query
  with r as (select * from public.staff_roster(cid)),
  recent as (
    select s.user_id, coalesce(sum(s.active_ms), 0) / 60000.0 as m
    from public.study_sessions s
    where (s.course_id = cid or s.course_id is null) and s.started_at >= now() - interval '14 days'
    group by s.user_id
  ),
  base as (
    select r.user_id, r.display_name, r.lab_section, r.last_seen, r.joined_at, coalesce(rc.m, 0) as m
    from r left join recent rc on rc.user_id = r.user_id
  ),
  medv as (select coalesce(percentile_cont(0.5) within group (order by base.m), 0) as med from base)
  select b.user_id, b.display_name, b.lab_section,
    case
      when (current_date - (coalesce(b.last_seen, b.joined_at))::date) >= inactive_n
        then 'Inactive for ' || (current_date - (coalesce(b.last_seen, b.joined_at))::date) || ' days'
      else 'Well below class median before ' || coalesce(prac_name, 'the practical')
    end,
    (current_date - (coalesce(b.last_seen, b.joined_at))::date)::int,
    round(b.m, 1), round(mv.med::numeric, 1)
  from base b cross join medv mv
  where (current_date - (coalesce(b.last_seen, b.joined_at))::date) >= inactive_n
     or (prac_soon and mv.med > 0 and b.m < mv.med * 0.4)
  order by 5 desc, b.display_name;
end $$;

revoke all on function public.staff_roster(uuid), public.staff_weak_spots(uuid), public.staff_at_risk(uuid) from public, anon;
grant execute on function public.staff_roster(uuid), public.staff_weak_spots(uuid), public.staff_at_risk(uuid) to authenticated;

-- ------------------------------------------------------------------ content review helper
-- Latest verdict per card (admin only), for progress and filters.
create or replace function public.review_latest()
returns table (card_id uuid, verdict text, note text, created_at timestamptz, resolved_at timestamptz, review_id uuid)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;
  return query
  select distinct on (cr.card_id) cr.card_id, cr.verdict, cr.note, cr.created_at, cr.resolved_at, cr.id
  from public.content_reviews cr order by cr.card_id, cr.created_at desc;
end $$;
revoke all on function public.review_latest() from public, anon;
grant execute on function public.review_latest() to authenticated;
