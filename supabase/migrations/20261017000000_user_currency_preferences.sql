-- Account-scoped currency preferences; jurisdiction and enabled assets remain database-controlled.
create table if not exists public.user_currency_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled_asset_codes text[] not null,
  updated_at timestamptz not null default statement_timestamp(),
  constraint user_currency_preferences_nonempty check (cardinality(enabled_asset_codes) > 0)
);
alter table public.user_currency_preferences enable row level security;
drop policy if exists user_currency_preferences_select_own on public.user_currency_preferences;
create policy user_currency_preferences_select_own on public.user_currency_preferences
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists user_currency_preferences_insert_own on public.user_currency_preferences;
create policy user_currency_preferences_insert_own on public.user_currency_preferences
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists user_currency_preferences_update_own on public.user_currency_preferences;
create policy user_currency_preferences_update_own on public.user_currency_preferences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on public.user_currency_preferences to authenticated;

create or replace function public.get_my_currency_policy()
returns table (country_code text, eligible_asset_codes text[], enabled_asset_codes text[])
language sql security invoker set search_path = public
as $$
  with account_country as (
    select ua.country_code
    from public.user_accounts ua
    where ua.user_id = auth.uid()
  ), eligible as (
    select ac.country_code,
      coalesce(
        array(
          select a.code
          from public.assets a
          where a.status = 'ACTIVE'
            and (
              a.code = 'USDC'
              or (
                ac.country_code = 'NG'
                and a.code = 'NGN'
                and exists (
                  select 1
                  from public.jurisdictions j
                  join public.jurisdiction_assets ja on ja.jurisdiction_id = j.id
                  where j.country_code = ac.country_code
                    and j.status = 'ACTIVE'
                    and ja.asset_id = a.id
                    and ja.status = 'ACTIVE'
                )
              )
            )
          order by a.code
        ),
        array[]::text[]
      ) as eligible_asset_codes
    from account_country ac
  ), prefs as (
    select p.enabled_asset_codes from public.user_currency_preferences p where p.user_id = auth.uid()
  )
  select e.country_code, e.eligible_asset_codes,
    case
      when p.enabled_asset_codes is null then e.eligible_asset_codes
      else coalesce(
        array(select code from unnest(p.enabled_asset_codes) code where code = any(e.eligible_asset_codes)),
        e.eligible_asset_codes
      )
    end
  from eligible e left join prefs p on true;
$$;
revoke all on function public.get_my_currency_policy() from public;
grant execute on function public.get_my_currency_policy() to authenticated;
