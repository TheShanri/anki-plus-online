-- Fix: round() needs numeric (percentile_cont returns double precision).
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

