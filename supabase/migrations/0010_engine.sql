-- ENGINE (study / practical): time-on-task kinds, scaffold ladder, trap letters, notes, practical attempts.
-- Idempotent. Owner-only RLS on everything learner-specific (staff see summaries through aggregate functions).

-- ------------------------------------------------------------------ time on task
alter table public.study_sessions add column if not exists kind text not null default 'study';
alter table public.study_sessions drop constraint if exists study_sessions_kind_check;
alter table public.study_sessions add constraint study_sessions_kind_check
  check (kind in ('study', 'practical', 'atlas', 'browse'));
create index if not exists study_sessions_kind_idx on public.study_sessions (user_id, kind, started_at);

-- One heartbeat batch from the client's ActivityTracker. SECURITY INVOKER: RLS applies, so a user can only
-- create or add to their own session rows. The client picks the session id (uuid) and keeps it per sitting.
create or replace function public.engine_heartbeat(p_id uuid, p_course uuid, p_kind text, p_ms int, p_cards int default 0)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if p_kind not in ('study', 'practical', 'atlas', 'browse') then
    raise exception 'bad kind';
  end if;
  insert into public.study_sessions (id, user_id, course_id, kind, started_at, ended_at, active_ms, cards_reviewed)
  values (p_id, auth.uid(), p_course, p_kind, now(), now(), least(greatest(p_ms, 0), 120000), greatest(p_cards, 0))
  on conflict (id) do update
    set active_ms = public.study_sessions.active_ms + least(greatest(p_ms, 0), 120000),
        cards_reviewed = public.study_sessions.cards_reviewed + greatest(p_cards, 0),
        ended_at = now()
    where public.study_sessions.user_id = auth.uid();
end $$;

-- ------------------------------------------------------------------ scaffold ladder (per user per card)
-- step 0..6 = half-steps of copy(0-1) > skeleton(2-3) > first letters(4-5) > recall(6). See src/lib/study/ladder.ts.
create table if not exists public.card_ladder (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  step smallint not null default 0 check (step between 0 and 6),
  clean_streak int not null default 0,        -- consecutive clean (unaided, correct) recalls: feeds the "solid name" rule
  last_clean_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ------------------------------------------------------------------ trap letters (per user)
create table if not exists public.card_traps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  start_pos int not null,                      -- index into the card's canonical answer string
  end_pos int not null,
  chunk text not null,
  kind text not null,
  pattern text not null,
  misses real not null default 0,              -- strike sum; the trap arms at >= 1
  hits int not null default 0,
  streak int not null default 0,               -- clean passes since the last miss
  hit_days date[] not null default '{}',
  miss_day date,
  last_miss timestamptz,
  last_hit timestamptz,
  retired boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists card_traps_user_card_idx on public.card_traps (user_id, card_id);

create table if not exists public.user_trap_patterns (
  user_id uuid not null references public.profiles (id) on delete cascade,
  pattern text not null,
  kind text not null,
  misses real not null default 0,
  hits int not null default 0,
  streak int not null default 0,
  last_miss timestamptz,
  last_hit timestamptz,
  retired boolean not null default false,
  primary key (user_id, pattern)
);

-- ------------------------------------------------------------------ student mnemonics
create table if not exists public.user_card_notes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  body text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ------------------------------------------------------------------ mock lab practical
create table if not exists public.practical_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  unit_slugs text[] not null default '{}',
  station_seconds int not null default 75,
  spelling text not null default 'generous',
  stations jsonb not null default '[]'::jsonb,  -- [{card_id, followups:[card_id], typed, followup_typed[], points, ...}]
  score numeric,
  max_score numeric,
  active_ms bigint not null default 0
);
create index if not exists practical_attempts_user_idx on public.practical_attempts (user_id, created_at);

-- ------------------------------------------------------------------ RLS: owner only
do $$
declare t text;
begin
  foreach t in array array['card_ladder', 'card_traps', 'user_trap_patterns', 'user_card_notes', 'practical_attempts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_own', t);
  end loop;
end $$;
