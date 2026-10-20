begin;

-- TNGN is a platform-controlled sandbox asset, not a real-money currency.
-- It is intentionally independent of the NGN country/location gate.
create or replace function public.get_my_currency_policy()
returns table(country_code text, eligible_asset_codes text[], enabled_asset_codes text[])
language sql
stable
set search_path = public
as $function$
  with account_country as (
    select ua.country_code
    from public.user_accounts ua
    where ua.user_id = auth.uid()
  ), eligible as (
    select ac.country_code,
      coalesce(array(
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
            or (
              a.code = 'TNGN'
              and coalesce((a.metadata->>'sandbox_only')::boolean, false)
              and exists (
                select 1 from public.platform_feature_flags f
                where f.flag_key = 'TNGN_DEMO_MODE' and f.enabled
              )
            )
          )
        order by a.code
      ), array[]::text[]) as eligible_asset_codes
    from account_country ac
  ), prefs as (
    select p.enabled_asset_codes
    from public.user_currency_preferences p
    where p.user_id = auth.uid()
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
$function$;

-- Make the sandbox discoverable for existing accounts without changing any
-- real-money balance or real-wallet ledger.
update public.user_currency_preferences
set enabled_asset_codes = (
  select array(select distinct code
    from unnest(public.user_currency_preferences.enabled_asset_codes || array['TNGN']::text[]) code
    order by code)
),
updated_at = statement_timestamp()
where exists (
  select 1 from public.platform_feature_flags
  where flag_key = 'TNGN_DEMO_MODE' and enabled
);

commit;
