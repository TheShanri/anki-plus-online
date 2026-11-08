-- Atlas achievements and progress tracking (owner: atlas progress agent). Own-rows RLS; staff read their course's students.

-- per-user counters / bests / activity days. key examples: quiz:answers, view:3d, pathway:dcml, day:2026-11-07, xp
create table if not exists public.atlas_stats (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null,
  count integer not null default 0,
  best integer not null default 0,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- which structures a student has met in the atlas, and how (3d, mri, brainstem, info, quiz = named correctly)
create table if not exists public.atlas_seen (
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  via text not null,
  first_at timestamptz not null default now(),
  count integer not null default 1,
  primary key (user_id, slug, via)
);

-- unlocked achievements, one row per tier (bronze|silver|gold|platinum)
create table if not exists public.user_achievements (
  user_id uuid not null references auth.users (id) on delete cascade,
  achievement_id text not null,
  tier text not null,
  unlocked_at timestamptz not null default now(),
  progress jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id, tier)
);
create index if not exists user_achievements_recent_idx on public.user_achievements (user_id, unlocked_at desc);

-- processed client event ids: makes replaying a batch harmless. Pruned by the API.
create table if not exists public.atlas_event_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  eid text not null,
  at timestamptz not null default now(),
  primary key (user_id, eid)
);

alter table public.atlas_stats enable row level security;
alter table public.atlas_seen enable row level security;
alter table public.user_achievements enable row level security;
alter table public.atlas_event_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['atlas_stats', 'atlas_seen', 'user_achievements', 'atlas_event_log'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_own', t);
  end loop;
  foreach t in array array['atlas_stats', 'atlas_seen', 'user_achievements'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id in (select public.my_staff_user_ids()))', t || '_staff_read', t);
  end loop;
end $$;
