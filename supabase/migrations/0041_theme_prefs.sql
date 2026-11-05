-- Atomic save of the theme preferences: merges {theme, ui} into user_settings.settings without a
-- read-modify-write, so it cannot clobber the engine's keys (scaffold, typing, study). SECURITY INVOKER (RLS).
create or replace function public.theme_save_prefs(p_theme text, p_ui jsonb)
returns void language sql security invoker set search_path = public as $$
  insert into public.user_settings (user_id, settings, updated_at)
  values (auth.uid(), jsonb_build_object('theme', p_theme, 'ui', coalesce(p_ui, '{}'::jsonb)), now())
  on conflict (user_id) do update
    set settings = public.user_settings.settings || jsonb_build_object('theme', p_theme, 'ui', coalesce(p_ui, '{}'::jsonb)),
        updated_at = now();
$$;
grant execute on function public.theme_save_prefs(text, jsonb) to authenticated;
