drop policy if exists home_promotions_public_read on public.home_promotions;
drop policy if exists home_promotions_admin_read on public.home_promotions;
create policy home_promotions_anon_read on public.home_promotions for select to anon
using (status='PUBLISHED' and (starts_at is null or starts_at <= statement_timestamp()) and (ends_at is null or ends_at > statement_timestamp()));
create policy home_promotions_authenticated_read on public.home_promotions for select to authenticated
using (
  (status='PUBLISHED' and (starts_at is null or starts_at <= statement_timestamp()) and (ends_at is null or ends_at > statement_timestamp()))
  or private.has_permission('content.moderate')
);

drop policy if exists public_notices_public_read on public.public_notices;
drop policy if exists public_notices_admin_read on public.public_notices;
create policy public_notices_anon_read on public.public_notices for select to anon
using (status='PUBLISHED' and (starts_at is null or starts_at <= statement_timestamp()) and (ends_at is null or ends_at > statement_timestamp()));
create policy public_notices_authenticated_read on public.public_notices for select to authenticated
using (
  (status='PUBLISHED' and (starts_at is null or starts_at <= statement_timestamp()) and (ends_at is null or ends_at > statement_timestamp()))
  or private.has_permission('content.moderate')
);

drop policy if exists market_featured_public_read on public.market_featured;
drop policy if exists market_featured_admin_read on public.market_featured;
create policy market_featured_anon_read on public.market_featured for select to anon using (active);
create policy market_featured_authenticated_read on public.market_featured for select to authenticated
using (active or private.has_permission('markets.manage'));

create index if not exists home_promotions_created_by_idx on public.home_promotions(created_by);
create index if not exists home_promotions_updated_by_idx on public.home_promotions(updated_by);
create index if not exists home_promotions_live_order_idx on public.home_promotions(status, sort_order);
create index if not exists public_notices_created_by_idx on public.public_notices(created_by);
create index if not exists public_notices_updated_by_idx on public.public_notices(updated_by);
create index if not exists public_notices_live_priority_idx on public.public_notices(status, priority);
create index if not exists market_featured_featured_by_idx on public.market_featured(featured_by);
create index if not exists market_featured_active_rank_idx on public.market_featured(active, feature_rank);
