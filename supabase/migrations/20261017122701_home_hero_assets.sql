-- Cache the latest generated Home carousel artwork metadata.
create table if not exists public.home_hero_assets (
  slot text primary key check (slot = 'HOME'),
  image_url text not null check (image_url ~ '^https://[^[:space:]]+$'),
  generated_at timestamptz not null,
  expires_at timestamptz not null check (expires_at > generated_at),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.home_hero_assets enable row level security;
revoke all on public.home_hero_assets from anon, authenticated;
grant select, insert, update, delete on public.home_hero_assets to service_role;
