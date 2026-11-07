-- Accounts/staff agent: feedback inbox and richer staff aggregates (summaries only, never item-level answers).

-- ------------------------------------------------------------------ feedback
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles (id) on delete set null,
  type text not null default 'other' check (type in ('bug', 'card', 'idea', 'praise', 'other')),
  message text,
  route text,
  card_id uuid,
  card_slug text,
  user_agent text,
  app_state jsonb not null default '{}'::jsonb,
  logs_before jsonb not null default '[]'::jsonb,
  logs_after jsonb not null default '[]'::jsonb,
  screenshot_path text,
  append_token text not null default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'new' check (status in ('new', 'seen', 'resolved')),
  admin_note text,
  admin_emailed boolean not null default false,
  sender_emailed boolean not null default false
);
create index if not exists feedback_created_idx on public.feedback (created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, type);
alter table public.feedback enable row level security;
drop policy if exists feedback_admin on public.feedback;
create policy feedback_admin on public.feedback for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------------ staff aggregates
-- Course KPIs.
create or replace function public.staff_overview(cid uuid)
returns table (
  enrolled int, active_week int, active_30d int, minutes_week numeric, reviews_week int,
  reviews_total int, accuracy numeric, mock_attempts int, mock_students int, mock_avg_pct numeric
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  return query
  with st as (select e.user_id from public.enrollments e where e.course_id = cid and e.role = 'student'),
  ses as (
    select s.user_id, s.started_at, s.active_ms from public.study_sessions s
    where s.user_id in (select st.user_id from st) and (s.course_id = cid or s.course_id is null)
  ),
  rv as (
    select rl.user_id, rl.reviewed_at, coalesce(rl.correct, rl.rating >= 3) as ok
    from public.review_logs rl join public.cards c on c.id = rl.card_id
    where c.course_id = cid and rl.user_id in (select st.user_id from st)
  ),
  pa as (
    select p.user_id, p.score / nullif(p.max_score, 0) * 100 as pct
    from public.practical_attempts p
    where p.course_id = cid and p.finished_at is not null and p.user_id in (select st.user_id from st)
  )
  select
    (select count(*)::int from st),
    (select count(distinct x.user_id)::int from (
        select ses.user_id from ses where ses.started_at >= date_trunc('week', now())
        union select rv.user_id from rv where rv.reviewed_at >= date_trunc('week', now())) x),
    (select count(distinct x.user_id)::int from (
        select ses.user_id from ses where ses.started_at >= now() - interval '30 days'
        union select rv.user_id from rv where rv.reviewed_at >= now() - interval '30 days') x),
    (select round(coalesce(sum(ses.active_ms), 0) / 60000.0, 0) from ses where ses.started_at >= date_trunc('week', now())),
    (select count(*)::int from rv where rv.reviewed_at >= date_trunc('week', now())),
    (select count(*)::int from rv),
    (select round(avg(case when rv.ok then 1.0 else 0.0 end) * 100, 1) from rv),
    (select count(*)::int from pa),
    (select count(distinct pa.user_id)::int from pa),
    (select round(avg(pa.pct), 1) from pa);
end $$;

-- Daily class activity for the last n days.
create or replace function public.staff_activity_trend(cid uuid, n int default 30)
returns table (d date, active_students int, reviews int, minutes numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  n := least(greatest(coalesce(n, 30), 1), 180);
  return query
  with st as (select e.user_id from public.enrollments e where e.course_id = cid and e.role = 'student'),
  days as (select (((now() at time zone 'UTC')::date) - g)::date as day from generate_series(0, n - 1) g),
  ses as (
    select s.user_id, (s.started_at at time zone 'UTC')::date as day, s.active_ms
    from public.study_sessions s
    where s.user_id in (select st.user_id from st) and (s.course_id = cid or s.course_id is null)
      and s.started_at >= now() - ((n + 1) * interval '1 day')
  ),
  rv as (
    select rl.user_id, (rl.reviewed_at at time zone 'UTC')::date as day
    from public.review_logs rl join public.cards c on c.id = rl.card_id
    where c.course_id = cid and rl.user_id in (select st.user_id from st)
      and rl.reviewed_at >= now() - ((n + 1) * interval '1 day')
  )
  select days.day,
    (select count(distinct x.user_id)::int from (
       select ses.user_id from ses where ses.day = days.day
       union select rv.user_id from rv where rv.day = days.day) x),
    (select count(*)::int from rv where rv.day = days.day),
    (select round(coalesce(sum(ses.active_ms), 0) / 60000.0, 0) from ses where ses.day = days.day)
  from days order by days.day;
end $$;

-- Class average share of each unit's live cards that are "solid" (review state, stability >= 14 days).
create or replace function public.staff_unit_progress(cid uuid)
returns table (unit_id uuid, unit_title text, unit_position int, cards int, avg_solid_pct numeric, avg_seen_pct numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  return query
  with st as (select e.user_id from public.enrollments e where e.course_id = cid and e.role = 'student'),
  uc as (
    select t.unit_id as uid, c.id as card_id
    from public.cards c join public.topics t on t.id = c.topic_id
    where c.course_id = cid and c.status = 'live' and t.unit_id is not null
  ),
  tot as (select uc.uid, count(*)::int as n from uc group by uc.uid),
  per as (
    select st.user_id, uc.uid,
      count(*) filter (where cs.state = 2 and cs.stability >= 14)::numeric as solid,
      count(*) filter (where cs.reps > 0)::numeric as seen
    from st cross join uc
    left join public.card_states cs on cs.user_id = st.user_id and cs.card_id = uc.card_id
    group by st.user_id, uc.uid
  )
  select u.id, u.title, u."position", coalesce(tot.n, 0),
    case when tot.n > 0 then coalesce(round(avg(per.solid / tot.n) * 100, 1), 0) else 0 end,
    case when tot.n > 0 then coalesce(round(avg(per.seen / tot.n) * 100, 1), 0) else 0 end
  from public.units u
  left join tot on tot.uid = u.id
  left join per on per.uid = u.id
  where u.course_id = cid
  group by u.id, u.title, u."position", tot.n
  order by u."position";
end $$;

-- Mock practical averages per student (finished attempts only; scores, not answers).
create or replace function public.staff_mock_scores(cid uuid)
returns table (user_id uuid, attempts int, avg_pct numeric, last_pct numeric, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  return query
  select p.user_id, count(*)::int,
    round(avg(p.score / nullif(p.max_score, 0)) * 100, 1),
    round((array_agg(p.score / nullif(p.max_score, 0) order by p.finished_at desc))[1] * 100, 1),
    max(p.finished_at)
  from public.practical_attempts p join public.enrollments e on e.user_id = p.user_id and e.course_id = cid and e.role = 'student'
  where p.course_id = cid and p.finished_at is not null
  group by p.user_id;
end $$;

-- One student's summary: unit progress, practical scores, daily minutes (last 30 days).
create or replace function public.staff_student_detail(cid uuid, uid uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_course_staff(cid) then raise exception 'not staff of this course' using errcode = '42501'; end if;
  if not exists (select 1 from public.enrollments e where e.course_id = cid and e.user_id = uid and e.role = 'student') then
    raise exception 'not a student of this course' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'units', coalesce((
      select jsonb_agg(jsonb_build_object('title', x.title, 'position', x."position", 'cards', x.n, 'solid_pct', x.solid_pct, 'seen_pct', x.seen_pct) order by x."position")
      from (
        select u.title, u."position", count(c.id)::int as n,
          case when count(c.id) = 0 then 0 else round(count(*) filter (where cs.state = 2 and cs.stability >= 14)::numeric / count(c.id) * 100, 1) end as solid_pct,
          case when count(c.id) = 0 then 0 else round(count(*) filter (where cs.reps > 0)::numeric / count(c.id) * 100, 1) end as seen_pct
        from public.units u
        left join public.topics t on t.unit_id = u.id
        left join public.cards c on c.topic_id = t.id and c.status = 'live' and c.course_id = cid
        left join public.card_states cs on cs.card_id = c.id and cs.user_id = uid
        where u.course_id = cid group by u.id, u.title, u."position"
      ) x), '[]'::jsonb),
    'practicals', coalesce((
      select jsonb_agg(jsonb_build_object('at', p.finished_at, 'score', p.score, 'max', p.max_score) order by p.finished_at)
      from public.practical_attempts p where p.course_id = cid and p.user_id = uid and p.finished_at is not null), '[]'::jsonb),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object('d', g.day, 'min', coalesce(m.mins, 0)) order by g.day)
      from (select (((now() at time zone 'UTC')::date) - i)::date as day from generate_series(0, 29) i) g
      left join (
        select (s.started_at at time zone 'UTC')::date as day, round(sum(s.active_ms) / 60000.0, 1) as mins
        from public.study_sessions s where s.user_id = uid and (s.course_id = cid or s.course_id is null) group by 1
      ) m on m.day = g.day), '[]'::jsonb)
  ) into res;
  return res;
end $$;

revoke all on function public.staff_overview(uuid), public.staff_activity_trend(uuid, int), public.staff_unit_progress(uuid),
  public.staff_mock_scores(uuid), public.staff_student_detail(uuid, uuid) from public, anon;
grant execute on function public.staff_overview(uuid), public.staff_activity_trend(uuid, int), public.staff_unit_progress(uuid),
  public.staff_mock_scores(uuid), public.staff_student_detail(uuid, uuid) to authenticated;
