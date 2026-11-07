-- Vote / report counts of the caller's own mnemonics (the vote tables have no direct policy).
create or replace function public.my_mnemonic_stats(p_ids uuid[])
returns table (id uuid, votes int, reports int)
language sql stable security definer set search_path = public as $$
  select m.id,
         (select count(*)::int from public.mnemonic_votes v where v.mnemonic_id = m.id),
         (select count(*)::int from public.mnemonic_reports r where r.mnemonic_id = m.id)
  from public.mnemonics m
  where m.user_id = auth.uid() and m.id = any (coalesce(p_ids, '{}'));
$$;
revoke all on function public.my_mnemonic_stats(uuid[]) from public, anon;
grant execute on function public.my_mnemonic_stats(uuid[]) to authenticated;
