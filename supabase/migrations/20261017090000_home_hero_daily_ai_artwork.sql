create table if not exists public.home_hero_assets (
  slot text primary key check (slot = 'HOME'),
  image_url text not null check (image_url ~ '^https://[^[:space:]]+$'),
  generated_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > generated_at),
  updated_at timestamptz not null default statement_timestamp()
);

alter table public.home_hero_assets enable row level security;

grant select on public.home_hero_assets to anon, authenticated;
grant select, insert, update, delete on public.home_hero_assets to service_role;

drop policy if exists home_hero_assets_public_read on public.home_hero_assets;
create policy home_hero_assets_public_read
on public.home_hero_assets
for select
to anon, authenticated
using (true);

drop trigger if exists home_hero_assets_set_updated_at on public.home_hero_assets;
create trigger home_hero_assets_set_updated_at
before update on public.home_hero_assets
for each row execute function private.set_updated_at();

-- Reuse the existing public home-promotions bucket and existing
-- CLOUDFLARE_WORKERS_AI provider configuration; no new AI provider or key.
