-- ANKI PLUS Online: initial schema. Run in the Supabase SQL editor or via `supabase db push`.
-- Idempotent where reasonable (create ... if not exists / drop policy if exists / create or replace).

create extension if not exists citext;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------------ enums
do $$ begin
  create type public.app_role as enum ('student', 'ta', 'professor', 'admin');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.topic_kind as enum ('lecture', 'lab');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ courses / people
create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  code text not null,                 -- e.g. NSCI3250A
  title text not null,
  term text,
  join_code text not null unique,     -- the code the professor shares
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,        -- the UVM email; also the Supabase auth email (login identifier)
  display_name text not null,
  pronouns text,
  class_year text,
  major text,
  minor text,
  extra jsonb not null default '{}'::jsonb,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  role public.app_role not null default 'student',
  lab_section text,                   -- per course
  joined_at timestamptz not null default now(),
  primary key (user_id, course_id)
);
create index if not exists enrollments_course_idx on public.enrollments (course_id);

-- ------------------------------------------------------------------ content
create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  slug text not null,
  position int not null default 0,
  title text not null,
  description text,
  unique (course_id, slug)
);
create index if not exists units_course_idx on public.units (course_id, position);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  slug text not null,
  kind public.topic_kind not null default 'lecture',
  position int not null default 0,
  title text not null,
  meta jsonb not null default '{}'::jsonb,
  unique (course_id, slug)
);
create index if not exists topics_unit_idx on public.topics (unit_id, position);

create table if not exists public.structures (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  unit_id uuid references public.units (id) on delete set null,
  slug text not null,
  canonical_name text not null,
  synonyms text[] not null default '{}',
  region text,
  atlas_ids jsonb not null default '{}'::jsonb,   -- ids in the 3D atlas / image sources
  info jsonb not null default '{}'::jsonb,        -- etymology, explanation, theory facts
  unique (course_id, canonical_name),
  unique (course_id, slug)
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  structure_id uuid references public.structures (id) on delete set null,
  body jsonb not null default '{}'::jsonb,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses (id) on delete cascade,
  note_id uuid references public.notes (id) on delete cascade,
  topic_id uuid references public.topics (id) on delete set null,
  structure_id uuid references public.structures (id) on delete set null,
  slug text not null,                             -- stable id from the content JSON in git
  kind text not null default 'type_answer',        -- pin | pathway | section | clinical | theory | mcq | type_answer ...
  position int not null default 0,
  status text not null default 'live' check (status in ('draft', 'live', 'retired')),
  content jsonb not null default '{}'::jsonb,     -- prompt, answers, hints; shape depends on kind
  media jsonb not null default '[]'::jsonb,       -- storage / atlas refs
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, slug)
);
create index if not exists cards_course_idx on public.cards (course_id);
create index if not exists cards_topic_idx on public.cards (topic_id);

-- ------------------------------------------------------------------ learning state
create table if not exists public.card_states (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  due timestamptz not null default now(),
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  elapsed_days int not null default 0,
  scheduled_days int not null default 0,
  learning_steps int not null default 0,
  reps int not null default 0,
  lapses int not null default 0,
  state smallint not null default 0,            -- 0 New, 1 Learning, 2 Review, 3 Relearning
  last_review timestamptz,
  primary key (user_id, card_id)
);
create index if not exists card_states_due_idx on public.card_states (user_id, due);

create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid references public.courses (id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_ms bigint not null default 0,          -- sum of client heartbeats while the tab is visible and active
  cards_reviewed int not null default 0
);
create index if not exists study_sessions_user_idx on public.study_sessions (user_id, started_at);

create table if not exists public.review_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  session_id uuid references public.study_sessions (id) on delete set null,
  rating smallint not null check (rating between 1 and 4),
  typed_answer text,
  correct boolean,
  hint_count int not null default 0,
  keystroke_stats jsonb not null default '{}'::jsonb,
  duration_ms int,
  state_before smallint,
  reviewed_at timestamptz not null default now()
);
create index if not exists review_logs_user_idx on public.review_logs (user_id, reviewed_at);
-- ------------------------------------------------------------------ content review (owner / admin only)
create table if not exists public.content_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  verdict text not null check (verdict in ('good', 'flag')),
  note text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_note text
);
create index if not exists content_reviews_card_idx on public.content_reviews (card_id, created_at);

create index if not exists review_logs_card_idx on public.review_logs (card_id);

create table if not exists public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ helper functions
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- SECURITY DEFINER so policies on enrollments do not recurse into themselves.
create or replace function public.is_course_member(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.enrollments e where e.course_id = cid and e.user_id = auth.uid());
$$;

create or replace function public.is_course_staff(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.enrollments e
    where e.course_id = cid and e.user_id = auth.uid() and e.role in ('ta', 'professor', 'admin')
  );
$$;

-- True when the caller is staff of any course that `uid` is enrolled in.
create or replace function public.is_staff_of_user(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.enrollments s
    join public.enrollments m on m.course_id = s.course_id
    where s.user_id = auth.uid() and s.role in ('ta', 'professor', 'admin') and m.user_id = uid
  );
$$;

-- ------------------------------------------------------------------ RLS
alter table public.courses enable row level security;
alter table public.profiles enable row level security;
alter table public.enrollments enable row level security;
alter table public.units enable row level security;
alter table public.topics enable row level security;
alter table public.structures enable row level security;
alter table public.notes enable row level security;
alter table public.cards enable row level security;
alter table public.card_states enable row level security;
alter table public.review_logs enable row level security;
alter table public.study_sessions enable row level security;
alter table public.user_settings enable row level security;
alter table public.content_reviews enable row level security;

-- courses: members read; staff update. (Creation and join_code lookup go through the service role.)
drop policy if exists courses_read on public.courses;
create policy courses_read on public.courses for select to authenticated using (public.is_course_member(id));
drop policy if exists courses_staff_update on public.courses;
create policy courses_staff_update on public.courses for update to authenticated
  using (public.is_course_staff(id)) with check (public.is_course_staff(id));

-- profiles: own row (role is not self-editable: see trigger below); staff read members; inserts via service role.
drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
drop policy if exists profiles_read_staff on public.profiles;
create policy profiles_read_staff on public.profiles for select to authenticated using (public.is_staff_of_user(id));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.profiles_lock_role() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and coalesce(auth.role(), '') <> 'service_role' then
    new.role := old.role;
  end if;
  if new.email is distinct from old.email and coalesce(auth.role(), '') <> 'service_role' then
    new.email := old.email;
  end if;
  return new;
end $$;
drop trigger if exists profiles_lock_role on public.profiles;
create trigger profiles_lock_role before update on public.profiles for each row execute function public.profiles_lock_role();

-- enrollments: own rows; staff read the roster. Writes via service role.
drop policy if exists enrollments_read_own on public.enrollments;
create policy enrollments_read_own on public.enrollments for select to authenticated using (user_id = auth.uid());
drop policy if exists enrollments_read_staff on public.enrollments;
create policy enrollments_read_staff on public.enrollments for select to authenticated using (public.is_course_staff(course_id));

-- content: members read, staff write
do $$
declare t text;
begin
  foreach t in array array['units', 'topics', 'structures', 'notes', 'cards'] loop
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_course_member(course_id))', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_course_staff(course_id)) with check (public.is_course_staff(course_id))', t || '_staff_write', t);
  end loop;
end $$;

-- learning state: owner full access. Staff see SUMMARIES only (docs/SPEC.md): no RLS read on
-- card_states / review_logs for staff; staff dashboards use aggregate security-definer functions.
-- study_sessions (time on task) is summary-level, so staff may read it.
do $$
declare t text;
begin
  foreach t in array array['card_states', 'review_logs', 'study_sessions'] loop
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
  end loop;
end $$;
create policy study_sessions_staff_read on public.study_sessions for select to authenticated
  using (public.is_staff_of_user(user_id));

drop policy if exists user_settings_own on public.user_settings;
create policy user_settings_own on public.user_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists content_reviews_admin on public.content_reviews;
create policy content_reviews_admin on public.content_reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
