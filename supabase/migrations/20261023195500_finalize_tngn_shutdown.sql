begin;

-- Final server-side TNGN shutdown. Historical rows remain in place for audit,
-- but no client role can read/write the sandbox tables or invoke demo RPCs.
update public.platform_feature_flags
set enabled=false,
    description='TNGN sandbox permanently retired. Real NGN only through approved funding and ledger workflows.',
    updated_at=statement_timestamp()
where flag_key='TNGN_DEMO_MODE' and enabled;

update public.assets
set status='DISABLED',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'sandbox_only',true,
      'decommissioned',true,
      'decommission_reason','Permanent retirement; use real NGN wallet',
      'decommissioned_at',coalesce(metadata->>'decommissioned_at',statement_timestamp()::text)
    ),
    updated_at=statement_timestamp()
where code='TNGN' and status<>'DISABLED';

update public.user_demo_preferences
set tngn_demo_enabled=false,updated_at=statement_timestamp()
where tngn_demo_enabled is distinct from false;

update public.user_currency_preferences
set enabled_asset_codes=array_remove(enabled_asset_codes,'TNGN'),
    preferred_asset_code=case when preferred_asset_code='TNGN' then null else preferred_asset_code end,
    updated_at=statement_timestamp()
where 'TNGN'=any(enabled_asset_codes) or preferred_asset_code='TNGN';

-- Remove all server triggers that can auto-grant demo balances or create TNGN
-- market variants. Do not delete historical demo accounts/orders/ledger entries.
drop trigger if exists trg_grant_test_ngn_on_account on public.user_accounts;
drop trigger if exists demo_accounts_record_initial_grant on public.demo_accounts;
drop trigger if exists market_catalog_sync_tngn_variant on public.market_catalog;

-- Stop the old sandbox RPC surface completely, including read endpoints.
revoke all on function public.get_demo_mode_status() from public,anon,authenticated;
revoke all on function public.my_demo_account() from public,anon,authenticated;
revoke all on function public.my_demo_markets() from public,anon,authenticated;
revoke all on function public.my_demo_orders() from public,anon,authenticated;
revoke all on function public.my_tngn_demo_ledger_activity(integer) from public,anon,authenticated;
revoke all on function public.my_tngn_market_orders() from public,anon,authenticated;
revoke all on function public.admin_demo_markets() from public,anon,authenticated;
revoke all on function public.set_my_demo_mode(boolean) from public,anon,authenticated;
revoke all on function public.admin_set_tngn_demo_mode(boolean) from public,anon,authenticated;
revoke all on function public.place_demo_order(text,text,numeric,text) from public,anon,authenticated;
revoke all on function public.admin_create_demo_market(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.admin_resolve_demo_market(text,text) from public,anon,authenticated;
revoke all on function public.place_tngn_market_stake(uuid,text,numeric,text) from public,anon,authenticated;
revoke all on function public.tngn_pool_quote(uuid,text,numeric) from public,anon,authenticated;

revoke all on table public.demo_accounts,public.demo_ledger_entries,public.demo_markets,public.demo_orders,public.user_demo_preferences from public,anon,authenticated;

-- These legacy trigger functions must not be callable by application roles.
revoke all on function private.grant_test_ngn(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.grant_test_ngn_on_account() from public,anon,authenticated,service_role;
revoke all on function private.record_tngn_demo_initial_grant() from public,anon,authenticated,service_role;
drop function if exists private.grant_test_ngn_on_account();
drop function if exists private.record_tngn_demo_initial_grant();
drop function if exists private.grant_test_ngn(uuid,text);

-- Currency policy can no longer re-enable TNGN by toggling a feature flag.
create or replace function public.get_my_currency_policy()
returns table(country_code text, eligible_asset_codes text[], enabled_asset_codes text[])
language sql
stable
security definer
set search_path=''
as $function$
  with account_country as (
    select case
      when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG'
      else upper(trim(coalesce(ua.country_code,'')))
    end as country_code
    from public.user_accounts ua
    where ua.user_id=auth.uid()
  ), eligible as (
    select ac.country_code,
      coalesce(array(
        select a.code
        from public.assets a
        where a.status='ACTIVE'
          and (
            a.code='USDC'
            or (
              ac.country_code='NG'
              and a.code='NGN'
              and exists(
                select 1
                from public.jurisdictions j
                join public.jurisdiction_assets ja on ja.jurisdiction_id=j.id
                where upper(trim(j.country_code)) in ('NG','NGA','NIGERIA')
                  and j.status='ACTIVE'
                  and ja.asset_id=a.id
                  and ja.status='ACTIVE'
              )
            )
          )
        order by a.code
      ),array[]::text[]) as eligible_asset_codes
    from account_country ac
  ), prefs as (
    select p.enabled_asset_codes
    from public.user_currency_preferences p
    where p.user_id=auth.uid()
  )
  select e.country_code,e.eligible_asset_codes,
    case
      when p.enabled_asset_codes is null then e.eligible_asset_codes
      else coalesce(
        array(select code from unnest(p.enabled_asset_codes) code where code=any(e.eligible_asset_codes)),
        e.eligible_asset_codes
      )
    end
  from eligible e left join prefs p on true;
$function$;

-- Keep the existing currency preference API, but remove every write path that
-- touched demo-mode preferences or demo accounts.
create or replace function public.set_my_currency_preferences(
  p_enabled_asset_codes text[],
  p_preferred_asset_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_country text;
  v_eligible text[];
  v_requested text[];
  v_enabled text[];
  v_preferred text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select policy.country_code,policy.eligible_asset_codes
    into v_country,v_eligible
  from public.get_my_currency_policy() policy
  limit 1;

  if v_eligible is null or cardinality(v_eligible)=0 then
    raise exception 'No currencies are eligible for this account.' using errcode='42501';
  end if;

  v_requested:=coalesce(p_enabled_asset_codes,v_eligible);
  if cardinality(v_requested)=0 then
    raise exception 'Enable at least one eligible currency.' using errcode='22023';
  end if;

  if exists (
    select 1 from unnest(v_requested) as requested(code)
    where requested.code is null
       or requested.code not in ('NGN','USDC')
       or not (requested.code=any(v_eligible))
  ) then
    raise exception 'Only eligible real NGN and ledger-USDC currencies can be selected. TNGN has been retired.' using errcode='42501';
  end if;

  select array_agg(normalized.code order by normalized.first_position)
    into v_enabled
  from (
    select requested.code,min(requested.ordinality) as first_position
    from unnest(v_requested) with ordinality as requested(code,ordinality)
    group by requested.code
  ) normalized;

  if v_enabled is null or cardinality(v_enabled)=0 then
    raise exception 'Enable at least one eligible currency.' using errcode='22023';
  end if;

  v_preferred:=case
    when p_preferred_asset_code=any(v_enabled) then p_preferred_asset_code
    else v_enabled[1]
  end;

  insert into public.user_currency_preferences(user_id,enabled_asset_codes,preferred_asset_code,updated_at)
  values(auth.uid(),v_enabled,v_preferred,statement_timestamp())
  on conflict(user_id) do update
    set enabled_asset_codes=excluded.enabled_asset_codes,
        preferred_asset_code=excluded.preferred_asset_code,
        updated_at=excluded.updated_at;

  return jsonb_build_object(
    'country_code',v_country,
    'eligible_asset_codes',v_eligible,
    'enabled_asset_codes',v_enabled,
    'preferred_asset_code',v_preferred,
    'tngn_demo_enabled',false
  );
end;
$function$;

revoke all on function public.get_my_currency_policy() from public,anon;
grant execute on function public.get_my_currency_policy() to authenticated;
revoke all on function public.set_my_currency_preferences(text[],text) from public,anon;
grant execute on function public.set_my_currency_preferences(text[],text) to authenticated;

select pg_notify('pgrst','reload schema');
commit;
