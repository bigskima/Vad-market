create table if not exists public.trending_market_settings (
  settings_key text primary key,
  enabled boolean not null default true,
  window_minutes integer not null default 60 check (window_minutes between 15 and 360),
  baseline_hours integer not null default 6 check (baseline_hours between 1 and 72),
  minimum_volume_ngn numeric(38,18) not null default 100000 check (minimum_volume_ngn >= 0),
  minimum_trades integer not null default 5 check (minimum_trades between 1 and 10000),
  minimum_unique_traders integer not null default 3 check (minimum_unique_traders between 2 and 10000),
  minimum_acceleration numeric(12,4) not null default 1.5 check (minimum_acceleration between 1 and 10),
  max_markets integer not null default 12 check (max_markets between 1 and 50),
  last_refreshed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint trending_market_settings_singleton check (settings_key='HOME_TRENDING')
);

create table if not exists public.trending_market_rankings (
  instrument_public_id uuid primary key references market.instruments(public_id) on delete cascade,
  short_volume_ngn numeric(38,18) not null default 0,
  short_trade_count integer not null default 0,
  short_unique_traders integer not null default 0,
  baseline_volume_ngn numeric(38,18) not null default 0,
  baseline_trade_count integer not null default 0,
  baseline_unique_traders integer not null default 0,
  volume_acceleration numeric(18,6) not null default 0,
  trade_acceleration numeric(18,6) not null default 0,
  trader_acceleration numeric(18,6) not null default 0,
  price_movement numeric(18,8) not null default 0,
  momentum_score numeric(18,6) not null default 0,
  last_trade_at timestamptz,
  rank integer not null check (rank > 0),
  calculated_at timestamptz not null default statement_timestamp()
);

create table if not exists public.market_home_suppressions (
  instrument_public_id uuid primary key references market.instruments(public_id) on delete cascade,
  suppress_featured boolean not null default false,
  suppress_trending boolean not null default false,
  reason text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp()
);

create index if not exists trending_market_rankings_rank_idx on public.trending_market_rankings(rank,momentum_score desc);
create index if not exists trending_market_settings_updated_by_idx on public.trending_market_settings(updated_by);
create index if not exists market_home_suppressions_updated_by_idx on public.market_home_suppressions(updated_by);

insert into public.trending_market_settings(settings_key,enabled,window_minutes,baseline_hours,minimum_volume_ngn,minimum_trades,minimum_unique_traders,minimum_acceleration,max_markets)
values('HOME_TRENDING',true,60,6,100000,5,3,1.5,12)
on conflict(settings_key) do nothing;

alter table public.trending_market_settings enable row level security;
alter table public.trending_market_rankings enable row level security;
alter table public.market_home_suppressions enable row level security;
revoke all on public.trending_market_settings from anon, authenticated;
revoke all on public.trending_market_rankings from anon, authenticated;
revoke all on public.market_home_suppressions from anon, authenticated;