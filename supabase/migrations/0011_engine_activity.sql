-- Daily review counts for the streak / activity grid (own rows only: SECURITY INVOKER).
create or replace function public.engine_activity(p_days int default 140, p_tz_min int default 0)
returns table (day date, reviews int, correct int)
language sql stable security invoker set search_path = public as $$
  select (reviewed_at - make_interval(mins => p_tz_min))::date as day,
         count(*)::int as reviews,
         (count(*) filter (where correct))::int as correct
  from public.review_logs
  where user_id = auth.uid() and reviewed_at >= now() - make_interval(days => p_days)
  group by 1 order by 1;
$$;
