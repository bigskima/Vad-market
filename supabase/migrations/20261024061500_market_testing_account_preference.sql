begin;

-- Restore TNGN as an opt-in non-cash currency, not as a separate demo market.
-- All NEW trades use market.instruments, trading.pool_stakes, finance ledger
-- accounts, and the normal pool settlement engine. Legacy demo rows stay audit-only.

-- Remove the irreversible retirement guards, but keep TNGN sandbox/non-withdrawable
-- metadata so normal payment quote paths continue to reject deposits and withdrawals.
drop trigger if exists prevent_retired_tngn_instrument_write on market.instruments;
drop trigger if exists prevent_retired_tngn_ledger_account on finance.ledger_accounts;
drop trigger if exists prevent_retired_tngn_ledger_journal on finance.ledger_journals;

update public.assets
set status='ACTIVE',
    metadata=(coalesce(metadata,'{}'::jsonb)
      || jsonb_build_object('sandbox_only',true,'non_withdrawable',true,'decommissioned',false,
        'decommission_reason','Opt-in non-cash TNGN; uses standard market and settlement engine')),
    updated_at=statement_timestamp()
where code='TNGN';

update public.platform_feature_flags
set enabled=true,
    description='Globally controls eligibility for opt-in TNGN non-cash market trading; all trades use the standard market and settlement engine.',
    updated_at=statement_timestamp()
where flag_key='TNGN_DEMO_MODE';

insert into public.platform_feature_flags(flag_key,enabled,description)
select 'TNGN_DEMO_MODE',true,
  'Globally controls eligibility for opt-in TNGN non-cash market trading; all trades use the standard market and settlement engine.'
where not exists(select 1 from public.platform_feature_flags where flag_key='TNGN_DEMO_MODE');

-- Account closure was operational, not a conversion into real NGN. Reactivate the
-- same TNGN ledger accounts; leave historical entries under TNGN and never mix assets.
update finance.ledger_accounts la
set status='ACTIVE',
    closed_at=null
from public.assets a
where a.id=la.asset_id and a.code='TNGN' and la.status<>'ACTIVE';

-- Recreate the normal currency policy. TNGN is eligible only for Nigerian accounts
-- when its asset is active and explicitly sandbox/non-withdrawable. It is not enabled
-- by default; the Account preference adds it to a user's currency list.
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
        where (
          (a.code='USDC' and a.status='ACTIVE')
          or (
            ac.country_code='NG' and a.code='NGN' and a.status='ACTIVE'
            and exists(
              select 1
              from public.jurisdictions j
              join public.jurisdiction_assets ja on ja.jurisdiction_id=j.id
              where upper(trim(j.country_code)) in ('NG','NGA','NIGERIA')
                and j.status='ACTIVE' and ja.asset_id=a.id and ja.status='ACTIVE'
            )
          )
          or (
            ac.country_code='NG' and a.code='TNGN' and a.status='ACTIVE'
            and coalesce((a.metadata->>'sandbox_only')::boolean,false)
            and coalesce((a.metadata->>'non_withdrawable')::boolean,false)
          )
        )
        order by a.code
      ),array[]::text[]) as eligible_asset_codes
    from account_country ac
  ), prefs as (
    select p.enabled_asset_codes from public.user_currency_preferences p where p.user_id=auth.uid()
  )
  select e.country_code,e.eligible_asset_codes,
    case
      when p.enabled_asset_codes is null then coalesce(
        array(select code from unnest(e.eligible_asset_codes) code where code<>'TNGN'),
        e.eligible_asset_codes
      )
      else coalesce(
        array(select code from unnest(p.enabled_asset_codes) code where code=any(e.eligible_asset_codes)),
        array(select code from unnest(e.eligible_asset_codes) code where code<>'TNGN')
      )
    end
  from eligible e left join prefs p on true;
$function$;

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
  v_tngn_global boolean:=false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select policy.country_code,policy.eligible_asset_codes into v_country,v_eligible
  from public.get_my_currency_policy() policy limit 1;
  if v_eligible is null or cardinality(v_eligible)=0 then
    raise exception 'No currencies are eligible for this account.' using errcode='42501';
  end if;
  v_requested:=coalesce(p_enabled_asset_codes,
    array(select code from unnest(v_eligible) code where code<>'TNGN'));
  if cardinality(v_requested)=0 then raise exception 'Enable at least one eligible currency.' using errcode='22023'; end if;
  if exists(
    select 1 from unnest(v_requested) as requested(code)
    where requested.code is null or not(requested.code=any(v_eligible))
  ) then
    raise exception 'One or more selected currencies are not eligible for this account.' using errcode='42501';
  end if;
  if 'TNGN'=any(v_requested) then
    select coalesce(flag.enabled,false) into v_tngn_global
    from public.platform_feature_flags flag where flag.flag_key='TNGN_DEMO_MODE';
    if not coalesce(v_tngn_global,false) or v_country<>'NG' then
      raise exception 'TNGN can only be selected for eligible Nigerian accounts while market testing is enabled by the platform.' using errcode='42501';
    end if;
  end if;
  select array_agg(normalized.code order by normalized.first_position) into v_enabled
  from (
    select requested.code,min(requested.ordinality) as first_position
    from unnest(v_requested) with ordinality as requested(code,ordinality)
    group by requested.code
  ) normalized;
  if v_enabled is null or cardinality(v_enabled)=0 then
    raise exception 'Enable at least one eligible currency.' using errcode='22023';
  end if;
  v_preferred:=case when p_preferred_asset_code=any(v_enabled) then p_preferred_asset_code else v_enabled[1] end;
  insert into public.user_currency_preferences(user_id,enabled_asset_codes,preferred_asset_code,updated_at)
  values(auth.uid(),v_enabled,v_preferred,statement_timestamp())
  on conflict(user_id) do update
  set enabled_asset_codes=excluded.enabled_asset_codes,
      preferred_asset_code=excluded.preferred_asset_code,
      updated_at=excluded.updated_at;
  return jsonb_build_object('country_code',v_country,'eligible_asset_codes',v_eligible,
    'enabled_asset_codes',v_enabled,'preferred_asset_code',v_preferred,
    'tngn_demo_enabled',coalesce((select pref.tngn_demo_enabled from public.user_demo_preferences pref where pref.user_id=auth.uid()),false));
end;
$function$;

create or replace function public.get_my_tngn_market_mode()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_country text;
  v_account_status text;
  v_global boolean:=false;
  v_user_enabled boolean:=false;
  v_asset_id bigint;
  v_account_id bigint;
  v_balance numeric(38,18):=0;
  v_eligible boolean:=false;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select case when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG'
    else upper(trim(coalesce(ua.country_code,''))) end,ua.status
    into v_country,v_account_status
  from public.user_accounts ua where ua.user_id=v_user_id;
  select coalesce(flag.enabled,false) into v_global
    from public.platform_feature_flags flag where flag.flag_key='TNGN_DEMO_MODE';
  select coalesce(pref.tngn_demo_enabled,false) into v_user_enabled
    from public.user_demo_preferences pref where pref.user_id=v_user_id;
  select a.id into v_asset_id from public.assets a
    where a.code='TNGN' and a.status='ACTIVE'
      and coalesce((a.metadata->>'sandbox_only')::boolean,false)
      and coalesce((a.metadata->>'non_withdrawable')::boolean,false);
  v_eligible:=v_global and v_country='NG' and v_account_status='ACTIVE' and v_asset_id is not null;
  if v_asset_id is not null then
    select la.id into v_account_id from finance.ledger_accounts la
    where la.asset_id=v_asset_id and la.owner_type='USER' and la.owner_reference=v_user_id::text
      and la.account_type='USER_AVAILABLE' and la.status='ACTIVE';
    if v_account_id is not null then v_balance:=finance.account_balance(v_account_id); end if;
  end if;
  return jsonb_build_object('assetCode','TNGN','globallyEnabled',v_global,'userEnabled',v_user_enabled,
    'eligible',v_eligible,'availableBalance',greatest(v_balance,0),
    'nonWithdrawable',true,'depositsEnabled',false,'withdrawalsEnabled',false,'transfersEnabled',false,
    'standardMarketSettlement',true,
    'message','TNGN is non-cash test value. It uses the regular market catalogue, standard orders and resolution/settlement engine with a separate TNGN ledger.');
end;
$function$;

create or replace function public.set_my_tngn_market_mode(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_country text;
  v_account_status text;
  v_global boolean:=false;
  v_asset_id bigint;
  v_user_account_id bigint;
  v_treasury_id bigint;
  v_legacy_balance numeric(38,18):=0;
  v_refund_total numeric(38,18):=0;
  v_legacy_account public.demo_accounts%rowtype;
  v_enabled_codes text[];
  v_preferred_code text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if p_enabled is null then raise exception 'Choose whether TNGN market testing should be enabled.' using errcode='22023'; end if;
  select case when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG'
    else upper(trim(coalesce(ua.country_code,''))) end,ua.status
    into v_country,v_account_status
  from public.user_accounts ua where ua.user_id=v_user_id for update;
  if v_account_status is distinct from 'ACTIVE' then
    raise exception 'An active VAD account is required for TNGN market testing.' using errcode='42501';
  end if;
  if p_enabled then
    if v_country<>'NG' then raise exception 'TNGN market testing is available only to Nigerian accounts.' using errcode='42501'; end if;
    select coalesce(flag.enabled,false) into v_global
      from public.platform_feature_flags flag where flag.flag_key='TNGN_DEMO_MODE';
    if not coalesce(v_global,false) then
      raise exception 'TNGN market testing is currently disabled by the platform.' using errcode='42501';
    end if;
  end if;
  select a.id into v_asset_id from public.assets a
    where a.code='TNGN' and a.status='ACTIVE'
      and coalesce((a.metadata->>'sandbox_only')::boolean,false)
      and coalesce((a.metadata->>'non_withdrawable')::boolean,false);
  if p_enabled and v_asset_id is null then
    raise exception 'The TNGN test asset is not available.' using errcode='42501';
  end if;

  if p_enabled then
    -- Legacy sandbox orders are not custom-settled. Cancel/refund them in the
    -- historical ledger, then migrate remaining synthetic value once into TNGN.
    insert into public.demo_accounts(user_id) values(v_user_id) on conflict(user_id) do nothing;
    select * into v_legacy_account from public.demo_accounts where user_id=v_user_id for update;

    select coalesce(sum(o.stake),0) into v_refund_total
      from public.demo_orders o where o.user_id=v_user_id and o.status='OPEN';
    if v_refund_total>0 then
      update public.demo_accounts
      set available_balance=available_balance+v_refund_total,updated_at=statement_timestamp()
      where user_id=v_user_id;
      with refunded as (
        update public.demo_orders
        set status='CANCELLED'
        where user_id=v_user_id and status='OPEN'
        returning user_id,stake,public_id
      )
      insert into public.demo_ledger_entries(user_id,entry_type,amount,reference_id)
      select refunded.user_id,'DEMO_REFUND',refunded.stake,refunded.public_id::text from refunded;
    end if;
    select * into v_legacy_account from public.demo_accounts where user_id=v_user_id for update;
    v_legacy_balance:=greatest(coalesce(v_legacy_account.available_balance,0),0);
    v_user_account_id:=finance.ensure_user_account(v_user_id,v_asset_id,'USER_AVAILABLE');
    if v_legacy_balance>0 then
      insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference,status)
      values(v_asset_id,'TREASURY','PLATFORM','VAD_TNGN_TEST_CREDIT','ACTIVE')
      on conflict(asset_id,account_type,owner_type,owner_reference)
      do update set status='ACTIVE',closed_at=null;
      select la.id into v_treasury_id from finance.ledger_accounts la
      where la.asset_id=v_asset_id and la.account_type='TREASURY'
        and la.owner_type='PLATFORM' and la.owner_reference='VAD_TNGN_TEST_CREDIT' and la.status='ACTIVE'
      for update;
      if v_treasury_id is null then raise exception 'TNGN test treasury could not be prepared.' using errcode='23514'; end if;
      perform finance.transfer(v_asset_id,v_treasury_id,v_user_account_id,v_legacy_balance,
        'TNGN_TEST_CREDIT','tngn-test-credit:'||v_user_id::text,
        'TNGN_TEST_CREDIT',v_user_id::text,
        'Migrate non-cash synthetic test value into the standard TNGN ledger',v_user_id);
      update public.demo_accounts set available_balance=0,updated_at=statement_timestamp()
      where user_id=v_user_id;
    end if;

    select policy.enabled_asset_codes,policy.country_code
      into v_enabled_codes,v_country
    from public.get_my_currency_policy() policy limit 1;
    v_enabled_codes:=coalesce(v_enabled_codes,array[]::text[]);
    if not ('TNGN'=any(v_enabled_codes)) then
      v_enabled_codes:=array_append(v_enabled_codes,'TNGN');
    end if;
    select preference.preferred_asset_code into v_preferred_code
      from public.user_currency_preferences preference where preference.user_id=v_user_id;
    if v_preferred_code is null or not(v_preferred_code=any(v_enabled_codes)) then
      v_preferred_code:=case when 'NGN'=any(v_enabled_codes) then 'NGN' else v_enabled_codes[1] end;
    end if;
    insert into public.user_currency_preferences(user_id,enabled_asset_codes,preferred_asset_code,updated_at)
    values(v_user_id,v_enabled_codes,v_preferred_code,statement_timestamp())
    on conflict(user_id) do update set
      enabled_asset_codes=case when 'TNGN'=any(public.user_currency_preferences.enabled_asset_codes)
        then public.user_currency_preferences.enabled_asset_codes
        else array_append(public.user_currency_preferences.enabled_asset_codes,'TNGN') end,
      preferred_asset_code=case
        when public.user_currency_preferences.preferred_asset_code=any(
          case when 'TNGN'=any(public.user_currency_preferences.enabled_asset_codes)
          then public.user_currency_preferences.enabled_asset_codes
          else array_append(public.user_currency_preferences.enabled_asset_codes,'TNGN') end
        ) then public.user_currency_preferences.preferred_asset_code
        else excluded.preferred_asset_code
      end,
      updated_at=statement_timestamp();
  end if;

  insert into public.user_demo_preferences(user_id,tngn_demo_enabled,updated_at)
  values(v_user_id,p_enabled,statement_timestamp())
  on conflict(user_id) do update set tngn_demo_enabled=excluded.tngn_demo_enabled,updated_at=statement_timestamp();
  return public.get_my_tngn_market_mode();
end;
$function$;

-- Legacy custom market settlement remains unavailable. New orders never touch
-- demo_orders/demo_ledger_entries; they use the ordinary pool order and ledger path.
drop trigger if exists market_catalog_settle_tngn_orders on public.market_catalog;
revoke all on function public.place_tngn_market_stake(uuid,text,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.tngn_pool_quote(uuid,text,numeric) from public,anon,authenticated,service_role;
revoke all on function public.my_tngn_market_orders() from public,anon,authenticated,service_role;
revoke all on function public.my_tngn_demo_ledger_activity(integer) from public,anon,authenticated,service_role;
revoke all on function public.set_my_demo_mode(boolean) from public,anon,authenticated,service_role;
revoke all on function public.admin_set_tngn_demo_mode(boolean) from public,anon,authenticated,service_role;
revoke all on function public.place_demo_order(text,text,numeric,text) from public,anon,authenticated,service_role;
revoke all on function public.my_demo_account() from public,anon,authenticated,service_role;
revoke all on function public.my_demo_markets() from public,anon,authenticated,service_role;
revoke all on function public.my_demo_orders() from public,anon,authenticated,service_role;
revoke all on function public.get_demo_mode_status() from public,anon,authenticated,service_role;
revoke all on function public.admin_demo_markets() from public,anon,authenticated,service_role;
revoke all on function public.admin_create_demo_market(text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.admin_resolve_demo_market(text,text) from public,anon,authenticated,service_role;

grant execute on function public.get_my_currency_policy() to authenticated;
grant execute on function public.set_my_currency_preferences(text[],text) to authenticated;
revoke all on function public.get_my_tngn_market_mode() from public,anon;
grant execute on function public.get_my_tngn_market_mode() to authenticated;
revoke all on function public.set_my_tngn_market_mode(boolean) from public,anon;
grant execute on function public.set_my_tngn_market_mode(boolean) to authenticated;

-- Re-enable the catalog-to-TNGN variant synchronizer. It shares the canonical
-- event/resolution, but never copies the source market's volume or participants.
create trigger market_catalog_sync_tngn_variant
after insert or update on public.market_catalog
for each row execute function private.on_market_catalog_tngn_variant_sync();

-- Backfill variants for source events that already exist.
do $backfill$
declare v_market record;
begin
  for v_market in
    select instrument_public_id from public.market_catalog
    where asset_code in ('NGN','USDC')
      and upper(coalesce(market_type,''))='BINARY'
      and upper(coalesce(status,'')) in ('DRAFT','OPEN','SCHEDULED','PUBLISHED')
  loop
    perform private.ensure_tngn_market_variant(v_market.instrument_public_id);
  end loop;
end;
$backfill$;

-- TNGN orders are ordinary pool stakes. Preserve fee, balance, quote, status,
-- timing, idempotency and the normal settlement pipeline from the live RPCs.
CREATE OR REPLACE FUNCTION public.pool_quote(p_instrument_public_id uuid, p_outcome_code text, p_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  total_pool numeric(38,18):=0;
  outcome_pool numeric(38,18):=0;
  fee numeric(38,18):=0;
  fee_pv bigint;
  est_gross numeric(38,18):=0;
  est_settlement_fee numeric(38,18):=0;
  est_pv bigint;
  v_asset_code text;
  v_test_credit_active boolean:=false;
  v_tngn_demo_enabled boolean:=false;
begin
  acct:=private.require_active_account();
  select * into instrument from market.instruments where public_id=p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model<>'POOL' then raise exception 'This market does not use pooled staking' using errcode='P0001'; end if;
  if instrument.status<>'OPEN' or instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then raise exception 'Market is not open' using errcode='P0001'; end if;
  select a.code into v_asset_code from public.assets a where a.id=instrument.asset_id and a.status='ACTIVE';
  select exists(
    select 1 from public.temporary_ngn_test_credit_grants g
    where g.user_id=auth.uid() and g.asset_id=instrument.asset_id and g.status='ACTIVE'
  ) into v_test_credit_active;
  if v_asset_code='NGN' and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1),false) then
    raise exception 'NGN service requires current location verification. Verify your current location and try again.' using errcode='42501';
  end if;
  if v_asset_code='TNGN' then
    select exists(
      select 1
      from public.user_demo_preferences pref
      join public.platform_feature_flags flag on flag.flag_key='TNGN_DEMO_MODE' and flag.enabled
      where pref.user_id=auth.uid() and pref.tngn_demo_enabled
    ) into v_tngn_demo_enabled;
    if upper(trim(coalesce(acct.country_code,''))) not in ('NG','NGA','NIGERIA') then
      raise exception 'TNGN test trading is available only to Nigerian accounts.' using errcode='42501';
    end if;
    if not v_tngn_demo_enabled then
      raise exception 'Enable TNGN market testing from Account before placing test trades.' using errcode='42501';
    end if;
  end if;
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then
    if not (
      (
        v_asset_code='NGN'
        and v_test_credit_active
        and private.service_available('trading',auth.uid())
        and private.asset_available_in_country(acct.country_code,instrument.asset_id)
      )
      or (
        v_asset_code='TNGN'
        and v_tngn_demo_enabled
        and upper(trim(coalesce(acct.country_code,''))) in ('NG','NGA','NIGERIA')
        and private.asset_available_in_country(acct.country_code,instrument.asset_id)
      )
    ) then
      raise exception 'Trading is not available for this account and market. Check account eligibility and market capability.' using errcode='P0001';
    end if;
  end if;
  perform private.assert_temporary_ngn_market_scope(instrument.id,auth.uid(),instrument.asset_id,false);
  if p_amount is null or p_amount<instrument.min_order_notional then raise exception 'Stake is below the market minimum' using errcode='22023'; end if;
  select * into outcome from market.outcomes where instrument_id=instrument.id and code=upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;

  select coalesce(sum(amount),0),coalesce(sum(amount) filter(where outcome_id=outcome.id),0)
  into total_pool,outcome_pool
  from trading.pool_stakes where instrument_id=instrument.id;

  select q.fee_amount,q.policy_version_id into fee,fee_pv from command.quote_trading_fee(p_amount,'TAKER') q;
  if outcome_pool+p_amount>0 then
    est_gross:=round((p_amount/(outcome_pool+p_amount))*(total_pool+p_amount),18);
  end if;
  select q.fee_amount,q.policy_version_id into est_settlement_fee,est_pv from command.quote_settlement_fee(est_gross) q;

  return jsonb_build_object(
    'instrumentPublicId',instrument.public_id,
    'instrumentId',instrument.id,
    'outcomeId',outcome.id,
    'outcomeCode',outcome.code,
    'assetId',instrument.asset_id,
    'amount',p_amount,
    'tradingFee',coalesce(fee,0),
    'tradingFeePolicyVersionId',fee_pv,
    'maximumCashDebit',p_amount+coalesce(fee,0),
    'poolTotalBefore',total_pool,
    'outcomePoolBefore',outcome_pool,
    'poolTotalAfter',total_pool+p_amount,
    'outcomePoolAfter',outcome_pool+p_amount,
    'impliedProbability',case when total_pool+p_amount>0 then round((outcome_pool+p_amount)/(total_pool+p_amount),18) else 0.5 end,
    'estimatedGrossPayout',est_gross,
    'estimatedSettlementFee',coalesce(est_settlement_fee,0),
    'estimatedNetPayout',greatest(est_gross-coalesce(est_settlement_fee,0),0),
    'quotedAt',statement_timestamp()
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.place_pool_stake(p_instrument_public_id uuid, p_outcome_code text, p_amount numeric, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  existing trading.pool_stakes;
  v_public_id uuid := gen_random_uuid();
  v_available bigint;
  v_collateral bigint;
  v_fee_account bigint;
  v_balance numeric(38,18);
  v_fee numeric(38,18) := 0;
  v_fee_pv bigint;
  v_stake_journal bigint;
  v_fee_journal bigint;
  v_asset_code text;
  v_test_credit_active boolean:=false;
  v_tngn_demo_enabled boolean:=false;
begin
  acct := private.require_active_account();
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into existing
  from trading.pool_stakes
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if exists (
      select 1
      from market.instruments i
      join public.assets a on a.id = i.asset_id
      where i.id = existing.instrument_id and a.code = 'NGN'
    ) and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1), false) then
      raise exception 'NGN service requires current location verification' using errcode = '42501';
    end if;
    return jsonb_build_object('stakeId', existing.public_id, 'amount', existing.amount, 'tradingFee', existing.trading_fee_amount, 'status', 'COMMITTED');
  end if;

  select * into instrument
  from market.instruments
  where public_id = p_instrument_public_id
  for share;
  if instrument.id is null then raise exception 'Market not found' using errcode = 'P0002'; end if;
  if instrument.liquidity_model <> 'POOL' then raise exception 'This market does not use pooled staking' using errcode = 'P0001'; end if;
  if instrument.status <> 'OPEN'
     or instrument.opened_at is null
     or instrument.opened_at > statement_timestamp()
     or (instrument.closed_at is not null and instrument.closed_at <= statement_timestamp()) then
    raise exception 'Market is not open' using errcode = 'P0001';
  end if;
  select a.code into v_asset_code from public.assets a where a.id=instrument.asset_id and a.status='ACTIVE';
  select exists(
    select 1 from public.temporary_ngn_test_credit_grants g
    where g.user_id=auth.uid() and g.asset_id=instrument.asset_id and g.status='ACTIVE'
  ) into v_test_credit_active;
  if v_asset_code='NGN' and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1),false) then
    raise exception 'NGN service requires current location verification. Verify your current location and try again.' using errcode='42501';
  end if;
  if v_asset_code='TNGN' then
    select exists(
      select 1
      from public.user_demo_preferences pref
      join public.platform_feature_flags flag on flag.flag_key='TNGN_DEMO_MODE' and flag.enabled
      where pref.user_id=auth.uid() and pref.tngn_demo_enabled
    ) into v_tngn_demo_enabled;
    if upper(trim(coalesce(acct.country_code,''))) not in ('NG','NGA','NIGERIA') then
      raise exception 'TNGN test trading is available only to Nigerian accounts.' using errcode='42501';
    end if;
    if not v_tngn_demo_enabled then
      raise exception 'Enable TNGN market testing from Account before placing test trades.' using errcode='42501';
    end if;
  end if;
  if not private.trade_access_satisfies(auth.uid(), acct.country_code, instrument.asset_id) then
    if not (
      (
        v_asset_code='NGN'
        and v_test_credit_active
        and private.service_available('trading',auth.uid())
        and private.asset_available_in_country(acct.country_code,instrument.asset_id)
      )
      or (
        v_asset_code='TNGN'
        and v_tngn_demo_enabled
        and upper(trim(coalesce(acct.country_code,''))) in ('NG','NGA','NIGERIA')
        and private.asset_available_in_country(acct.country_code,instrument.asset_id)
      )
    ) then
      raise exception 'Trading is not available for this account and market. Check account eligibility and market capability.' using errcode='P0001';
    end if;
  end if;
  if p_amount is null or p_amount < instrument.min_order_notional then
    raise exception 'Stake is below the market minimum' using errcode = '22023';
  end if;

  select * into outcome
  from market.outcomes
  where instrument_id = instrument.id and code = upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode = 'P0002'; end if;

  select q.fee_amount, q.policy_version_id into v_fee, v_fee_pv
  from command.quote_trading_fee(p_amount, 'TAKER') q;
  v_fee := coalesce(v_fee, 0);
  v_available := finance.ensure_user_account(auth.uid(), instrument.asset_id, 'USER_AVAILABLE');
  v_collateral := finance.ensure_market_collateral_account(instrument.id, instrument.asset_id);
  perform pg_advisory_xact_lock(hashtextextended('vad-wallet:' || auth.uid()::text || ':' || instrument.asset_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('vad-pool:' || instrument.id::text, 0));
  perform private.assert_temporary_ngn_market_scope(instrument.id,auth.uid(),instrument.asset_id,true);
  v_balance := finance.account_balance(v_available);
  if v_balance < p_amount + v_fee then
    raise exception 'Insufficient available balance including trading fee' using errcode = 'P0001';
  end if;

  v_stake_journal := finance.transfer(
    instrument.asset_id, v_available, v_collateral, p_amount,
    'POOL_STAKE', 'pool-stake:' || v_public_id::text, 'POOL_STAKE', v_public_id::text,
    'Commit peer-funded VAD market stake', auth.uid()
  );
  if v_fee > 0 then
    v_fee_account := finance.ensure_platform_account(instrument.asset_id, 'PLATFORM_TRADING_FEE_REVENUE');
    v_fee_journal := finance.transfer(
      instrument.asset_id, v_available, v_fee_account, v_fee,
      'TRADING_FEE', 'pool-stake-fee:' || v_public_id::text, 'POOL_STAKE', v_public_id::text,
      'VAD pooled-stake execution fee', auth.uid()
    );
  end if;

  insert into trading.pool_stakes(
    public_id, user_id, instrument_id, outcome_id, amount, trading_fee_amount,
    fee_policy_version_id, stake_journal_id, fee_journal_id, idempotency_key
  ) values(
    v_public_id, auth.uid(), instrument.id, outcome.id, p_amount, v_fee,
    v_fee_pv, v_stake_journal, v_fee_journal, p_idempotency_key
  ) returning * into existing;

  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values(
    'POOL_STAKE_PLACED', 'POOL_STAKE', v_public_id::text,
    jsonb_build_object('stake_id', v_public_id, 'instrument_id', instrument.public_id, 'user_id', auth.uid(), 'outcome', outcome.code, 'amount', p_amount, 'fee', v_fee),
    'pool-stake-placed:' || v_public_id::text
  ) on conflict(idempotency_key) do nothing;

  perform command.refresh_market_catalog(instrument.id);
  return jsonb_build_object('stakeId', v_public_id, 'marketId', instrument.public_id, 'outcomeCode', outcome.code, 'amount', p_amount, 'tradingFee', v_fee, 'status', 'COMMITTED');
end;
$function$
;

select pg_notify('pgrst','reload schema');
commit;
