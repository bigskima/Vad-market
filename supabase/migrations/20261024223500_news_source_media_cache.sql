begin;

-- Public news is display-only editorial context. Only trusted Edge Functions
-- write or read these caches; users receive normalized, attributed records via RPC-like Edge APIs.
create table if not exists public.news_articles_cache (
  article_id text primary key check (char_length(article_id) between 24 and 80),
  article_url text not null unique,
  title text not null check (char_length(title) between 1 and 400),
  description text,
  image_url text,
  source_name text,
  source_domain text not null,
  published_at timestamptz,
  language text,
  country text,
  category text not null default 'ALL',
  authors text[] not null default '{}'::text[],
  keywords text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  fetched_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '14 days'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (article_url ~* '^https?://'),
  check (image_url is null or image_url ~* '^https://'),
  check (jsonb_typeof(metadata)='object')
);
create index if not exists news_articles_cache_category_date_idx
  on public.news_articles_cache(category, published_at desc);
create index if not exists news_articles_cache_expiry_idx
  on public.news_articles_cache(expires_at);

create table if not exists public.news_feed_cache (
  cache_key text primary key check (char_length(cache_key) between 8 and 220),
  payload jsonb not null check (jsonb_typeof(payload)='object'),
  fetched_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  stale_until timestamptz not null,
  updated_at timestamptz not null default statement_timestamp(),
  check (expires_at>=fetched_at),
  check (stale_until>=expires_at)
);
create index if not exists news_feed_cache_expiry_idx
  on public.news_feed_cache(expires_at, stale_until);

-- Resolve source-provided article/brand imagery before invoking AI generation.
-- A negative result is cached too, so an unsupported topic does not call GDELT
-- and queue AI work again on every card render.
create table if not exists public.market_source_media_cache (
  instrument_public_id uuid primary key
    references market.instruments(public_id) on delete cascade,
  source_media_url text,
  source_name text,
  source_article_url text,
  attribution text,
  resolution_status text not null default 'PENDING'
    check (resolution_status in ('PENDING','FOUND','NOT_FOUND')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  checked_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null default (statement_timestamp() + interval '12 hours'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (source_media_url is null or source_media_url ~* '^https://'),
  check (source_article_url is null or source_article_url ~* '^https://')
);
create index if not exists market_source_media_cache_expiry_idx
  on public.market_source_media_cache(expires_at);

alter table public.news_articles_cache enable row level security;
alter table public.news_feed_cache enable row level security;
alter table public.market_source_media_cache enable row level security;

revoke all on public.news_articles_cache from public, anon, authenticated;
revoke all on public.news_feed_cache from public, anon, authenticated;
revoke all on public.market_source_media_cache from public, anon, authenticated;

grant select, insert, update, delete on public.news_articles_cache to service_role;
grant select, insert, update, delete on public.news_feed_cache to service_role;
grant select, insert, update, delete on public.market_source_media_cache to service_role;

commit;
