-- Account-scoped currency preferences and jurisdiction eligibility.
-- Apply through the normal migration pipeline; do not edit live production data manually.
create table if not exists public.user_currency_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_asset_codes text[] not null default array['NGN','USDC']::text[],
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_currency_preferences_nonempty check (cardinality(enabled_asset_codes) > 0),
  constraint user_currency_preferences_supported_codes check (
    enabled_asset_codes <@ array['NGN','USDC']::text[]
  )
);

alter table public.user_currency_preferences enable row level security;

drop policy if exists user_currency_preferences_select_own on public.user_currency_preferences;
create policy user_currency_preferences_select_own
  on public.user_currency_preferences for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists user_currency_preferences_insert_own on public.user_currency_preferences;
create policy user_currency_preferences_insert_own
  on public.user_currency_preferences for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists user_currency_preferences_update_own on public.user_currency_preferences;
create policy user_currency_preferences_update_own
  on public.user_currency_preferences for update
  to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.user_currency_preferences to authenticated;

-- Currency eligibility is jurisdiction-based. NGN is only eligible for Nigeria;
-- non-Nigerian users are restricted to USDC by the client policy and must not be
-- shown NGN content or actions. This function is the canonical policy source.
create or replace function public.get_my_currency_policy()
returns table (country_code text, eligible_asset_codes text[], enabled_asset_codes text[])
language sql
security invoker
set search_path = public
as $$
  with account_country as (
    select coalesce(ua.country_code, 'US') as country_code
    from public.user_accounts ua
    where ua.user_id = auth.uid()
    union all
    select 'US'::text
    where not exists (select 1 from public.user_accounts ua where ua.user_id = auth.uid())
    limit 1
  ), eligibility as (
    select ac.country_code,
      case when ac.country_code = 'NG'
        then array['NGN','USDC']::text[]
        else array['USDC']::text[]
      end as eligible_asset_codes
    from account_country ac
  ), prefs as (
    select ucp.enabled_asset_codes
    from public.user_currency_preferences ucp
    where ucp.user_id = auth.uid()
  )
  select e.country_code, e.eligible_asset_codes,
    case
      when p.enabled_asset_codes is null then e.eligible_asset_codes
      when e.country_code <> 'NG' then array['USDC']::text[]
      else coalesce(
        array(select code from unnest(p.enabled_asset_codes) code where code = any(e.eligible_asset_codes)),
        e.eligible_asset_codes
      )
    end as enabled_asset_codes
  from eligibility e left join prefs p on true;
$$;

revoke all on function public.get_my_currency_policy() from public;
grant execute on function public.get_my_currency_policy() to authenticated;
