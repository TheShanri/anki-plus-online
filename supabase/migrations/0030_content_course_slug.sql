-- Content agent: courses get a stable slug (used by content/<slug>/ JSON, the seed script and /api/media/<slug>/...).
alter table public.courses add column if not exists slug text;
update public.courses set slug = 'nsci3250' where code = 'NSCI3250A' and slug is null;
create unique index if not exists courses_slug_key on public.courses (slug) where slug is not null;
