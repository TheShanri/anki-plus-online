-- Student mnemonics: linked to a card and to its structure (the region), optionally shared with the class,
-- optionally anonymous. Replaces the private-only user_card_notes (its rows are copied across below; the old
-- table stays untouched). Other students never read this table: shared rows are served by a security-definer
-- function that returns the author's name only when the author chose to show it.

create table if not exists public.mnemonics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id uuid not null references public.courses (id) on delete cascade,
  card_id uuid references public.cards (id) on delete cascade,
  structure_id uuid references public.structures (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  visibility text not null default 'private' check (visibility in ('private', 'class')),
  anonymous boolean not null default true,
  hidden boolean not null default false,        -- set by the owner/admin (moderation); hides it from classmates
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (card_id is not null or structure_id is not null)
);
create unique index if not exists mnemonics_user_card_uq on public.mnemonics (user_id, card_id) where card_id is not null;
create unique index if not exists mnemonics_user_structure_uq on public.mnemonics (user_id, structure_id) where card_id is null;
create index if not exists mnemonics_structure_idx on public.mnemonics (structure_id) where visibility = 'class' and not hidden;
create index if not exists mnemonics_card_idx on public.mnemonics (card_id) where visibility = 'class' and not hidden;
create index if not exists mnemonics_user_course_idx on public.mnemonics (user_id, course_id);

create table if not exists public.mnemonic_votes (
  mnemonic_id uuid not null references public.mnemonics (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (mnemonic_id, user_id)
);
create table if not exists public.mnemonic_reports (
  mnemonic_id uuid not null references public.mnemonics (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (mnemonic_id, user_id)
);

alter table public.mnemonics enable row level security;
alter table public.mnemonic_votes enable row level security;
alter table public.mnemonic_reports enable row level security;
-- owners manage their own rows (they may not un-hide a moderated one: `hidden` is only changed by the admin script)
drop policy if exists mnemonics_own_select on public.mnemonics;
create policy mnemonics_own_select on public.mnemonics for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists mnemonics_own_insert on public.mnemonics;
create policy mnemonics_own_insert on public.mnemonics for insert to authenticated
  with check (user_id = (select auth.uid()) and hidden = false and public.is_course_member(course_id));
drop policy if exists mnemonics_own_update on public.mnemonics;
create policy mnemonics_own_update on public.mnemonics for update to authenticated
  using (user_id = (select auth.uid()) and hidden = false) with check (user_id = (select auth.uid()) and hidden = false);
drop policy if exists mnemonics_own_delete on public.mnemonics;
create policy mnemonics_own_delete on public.mnemonics for delete to authenticated using (user_id = (select auth.uid()));
-- votes and reports have no direct policies: they go through the functions below.

-- bring the old private notes across (private, so nothing becomes visible by accident)
insert into public.mnemonics (user_id, course_id, card_id, structure_id, body, visibility, anonymous, created_at, updated_at)
select n.user_id, c.course_id, n.card_id, c.structure_id, left(n.body, 1000), 'private', true, n.updated_at, n.updated_at
from public.user_card_notes n join public.cards c on c.id = n.card_id
where char_length(n.body) > 0
on conflict do nothing;

-- Shared mnemonics of a course for some cards / structures, never the caller's own. The author's name is returned
-- only when the author chose to show it (profiles are not readable by other students).
create or replace function public.class_mnemonics(p_course uuid, p_cards uuid[], p_structures uuid[])
returns table (id uuid, card_id uuid, structure_id uuid, body text, author text, votes int, voted boolean, reported boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.card_id, m.structure_id, m.body,
         case when m.anonymous then null else p.display_name end,
         (select count(*)::int from public.mnemonic_votes v where v.mnemonic_id = m.id),
         exists (select 1 from public.mnemonic_votes v where v.mnemonic_id = m.id and v.user_id = auth.uid()),
         exists (select 1 from public.mnemonic_reports r where r.mnemonic_id = m.id and r.user_id = auth.uid()),
         m.created_at
  from public.mnemonics m join public.profiles p on p.id = m.user_id
  where auth.uid() is not null
    and public.is_course_member(p_course)
    and m.course_id = p_course and m.visibility = 'class' and not m.hidden and m.user_id <> auth.uid()
    and (m.card_id = any (coalesce(p_cards, '{}')) or m.structure_id = any (coalesce(p_structures, '{}')))
  order by 6 desc, m.created_at desc
  limit 200;
$$;

create or replace function public.mnemonic_vote(p_id uuid, p_on boolean)
returns int language plpgsql security definer set search_path = public as $$
declare m public.mnemonics;
begin
  select * into m from public.mnemonics where id = p_id;
  if auth.uid() is null or not found or m.visibility <> 'class' or m.hidden or m.user_id = auth.uid() or not public.is_course_member(m.course_id) then
    raise exception 'not allowed';
  end if;
  if p_on then
    insert into public.mnemonic_votes (mnemonic_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
  else
    delete from public.mnemonic_votes where mnemonic_id = p_id and user_id = auth.uid();
  end if;
  return (select count(*)::int from public.mnemonic_votes where mnemonic_id = p_id);
end $$;

create or replace function public.mnemonic_report(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.mnemonics;
begin
  select * into m from public.mnemonics where id = p_id;
  if auth.uid() is null or not found or m.visibility <> 'class' or m.hidden or m.user_id = auth.uid() or not public.is_course_member(m.course_id) then
    raise exception 'not allowed';
  end if;
  insert into public.mnemonic_reports (mnemonic_id, user_id, reason) values (p_id, auth.uid(), left(p_reason, 300)) on conflict do nothing;
end $$;

-- Distinct tags of a course's live cards with counts (for the "Study by tag" picker).
create or replace function public.course_tag_counts(p_course uuid)
returns table (tag text, n int)
language sql stable security definer set search_path = public as $$
  select t.tag, count(*)::int
  from public.cards c, lateral jsonb_array_elements_text(coalesce(c.content -> 'tags', '[]'::jsonb)) as t(tag)
  where c.course_id = p_course and c.status = 'live' and public.is_course_member(p_course)
  group by t.tag order by 2 desc, 1;
$$;

revoke all on function public.class_mnemonics(uuid, uuid[], uuid[]) from public, anon;
revoke all on function public.mnemonic_vote(uuid, boolean) from public, anon;
revoke all on function public.mnemonic_report(uuid, text) from public, anon;
revoke all on function public.course_tag_counts(uuid) from public, anon;
grant execute on function public.class_mnemonics(uuid, uuid[], uuid[]) to authenticated;
grant execute on function public.mnemonic_vote(uuid, boolean) to authenticated;
grant execute on function public.mnemonic_report(uuid, text) to authenticated;
grant execute on function public.course_tag_counts(uuid) to authenticated;
