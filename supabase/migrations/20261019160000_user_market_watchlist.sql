-- Per-user saved markets for the Home watchlist.
-- The client can only manage rows belonging to the authenticated user; market
-- identity remains anchored to the canonical instrument record.
create table if not exists public.user_market_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument_public_id uuid not null references market.instruments(public_id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, instrument_public_id)
);

create index if not exists user_market_watchlist_user_created_idx
  on public.user_market_watchlist (user_id, created_at desc);

alter table public.user_market_watchlist enable row level security;
revoke all on public.user_market_watchlist from anon, public;
grant select, insert, delete on public.user_market_watchlist to authenticated;

drop policy if exists user_market_watchlist_select_own on public.user_market_watchlist;
create policy user_market_watchlist_select_own
  on public.user_market_watchlist for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists user_market_watchlist_insert_own on public.user_market_watchlist;
create policy user_market_watchlist_insert_own
  on public.user_market_watchlist for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_market_watchlist_delete_own on public.user_market_watchlist;
create policy user_market_watchlist_delete_own
  on public.user_market_watchlist for delete to authenticated
  using (auth.uid() = user_id);
