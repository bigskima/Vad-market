begin;

-- Per-user opt-in for the already-issued, non-cash NGN test allocation.
-- This does not restore TNGN, create another asset, or create an alternate market.
create table if not exists public.temporary_ngn_market_testing_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.temporary_ngn_market_testing_preferences enable row level security;
revoke all on public.temporary_ngn_market_testing_preferences from public,anon,authenticated,service_role;

create or replace function public.my_temporary_ngn_market_testing_status()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_grant public.temporary_ngn_test_credit_grants%rowtype;
  v_asset_id bigint;
  v_asset_status text;
  v_country text;
  v_account_status text;
  v_mode_enabled boolean:=false;
  v_location_allowed boolean:=false;
  v_location_reason text:='LOCATION_CHECK_REQUIRED';
  v_service_available boolean:=false;
  v_asset_available boolean:=false;
  v_eligible boolean:=false;
  v_reason text:='NO_ACTIVE_TEST_CREDIT';
  v_available_id bigint;
  v_balance numeric(38,18):=0;
  v_open_markets integer:=0;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode='28000';
  end if;

  select a.id,a.status into v_asset_id,v_asset_status
  from public.assets a where a.code='NGN';

  select ua.country_code,ua.status into v_country,v_account_status
  from public.user_accounts ua where ua.user_id=v_user_id;

  select * into v_grant
  from public.temporary_ngn_test_credit_grants g
  where g.user_id=v_user_id and g.asset_id=v_asset_id and g.status='ACTIVE'
  order by g.created_at desc limit 1;

  select coalesce(preference.enabled,false) into v_mode_enabled
  from public.temporary_ngn_market_testing_preferences preference
  where preference.user_id=v_user_id;
  v_mode_enabled:=coalesce(v_mode_enabled,false);

  if v_grant.id is null then
    return jsonb_build_object(
      'active',false,'eligible',false,'testModeEnabled',false,
      'reasonCode','NO_ACTIVE_TEST_CREDIT',
      'message','No active temporary NGN test allocation is assigned to this account.'
    );
  end if;

  select gate.allowed,gate.reason_code
    into v_location_allowed,v_location_reason
  from public.can_access_ngn_services() gate limit 1;

  v_service_available:=coalesce(private.service_available('trading',v_user_id),false);
  v_asset_available:=coalesce(private.asset_available_in_country(coalesce(v_country,''),v_asset_id),false);
  v_eligible:=v_account_status='ACTIVE'
    and v_country='NG'
    and v_asset_status='ACTIVE'
    and coalesce(v_location_allowed,false)
    and v_service_available
    and v_asset_available;

  v_reason:=case
    when v_account_status is distinct from 'ACTIVE' then 'ACCOUNT_NOT_ACTIVE'
    when v_country is distinct from 'NG' then 'ACCOUNT_NOT_ELIGIBLE'
    when v_asset_status is distinct from 'ACTIVE' then 'NGN_ASSET_UNAVAILABLE'
    when not coalesce(v_location_allowed,false) then coalesce(v_location_reason,'LOCATION_CHECK_REQUIRED')
    when not v_service_available then 'TRADING_SERVICE_UNAVAILABLE'
    when not v_asset_available then 'NGN_NOT_AVAILABLE_IN_JURISDICTION'
    else 'READY'
  end;

  select la.id into v_available_id
  from finance.ledger_accounts la
  where la.asset_id=v_asset_id and la.owner_type='USER'
    and la.owner_reference=v_user_id::text
    and la.account_type='USER_AVAILABLE' and la.status='ACTIVE';
  if v_available_id is not null then v_balance:=finance.account_balance(v_available_id); end if;

  select count(*)::integer into v_open_markets
  from market.instruments i
  where i.asset_id=v_asset_id and i.status='OPEN'
    and i.opened_at is not null and i.opened_at<=statement_timestamp()
    and (i.closed_at is null or i.closed_at>statement_timestamp());

  return jsonb_build_object(
    'active',true,
    'eligible',v_eligible,
    'testModeEnabled',v_mode_enabled,
    'reasonCode',v_reason,
    'grantId',v_grant.public_id,
    'assetCode','NGN',
    'grantAmount',v_grant.amount,
    'availableBalance',greatest(v_balance,0),
    'createdAt',v_grant.created_at,
    'openMarketCount',v_open_markets,
    'withdrawalsBlocked',true,
    'depositsBlocked',true,
    'marketOrdersUseStandardSettlement',true,
    'message',case
      when not v_eligible then 'Temporary NGN test credit is assigned, but trading is blocked until the account, service, jurisdiction and current Nigeria location checks are satisfied.'
      when v_open_markets=0 then 'Market-testing mode is eligible, but there is currently no open NGN market. Use an approved, genuinely open market; this setting does not create a separate demo market.'
      when v_mode_enabled then 'Temporary test credit is enabled for the standard NGN market order and settlement pipeline. Deposits and withdrawals remain blocked.'
      else 'Temporary NGN test credit is available. Enable market testing to use the standard NGN market order and settlement pipeline.'
    end
  );
end;
$function$;

create or replace function public.set_my_temporary_ngn_market_testing(p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid:=auth.uid();
  v_grant public.temporary_ngn_test_credit_grants%rowtype;
  v_asset_id bigint;
  v_account_status text;
  v_country text;
  v_allowed boolean:=false;
  v_reason text;
  v_service_available boolean:=false;
  v_asset_available boolean:=false;
  v_previous boolean:=false;
begin
  if v_user_id is null then raise exception 'Authentication required.' using errcode='28000'; end if;
  if p_enabled is null then raise exception 'Choose whether temporary NGN market testing should be enabled.' using errcode='22023'; end if;

  select id into v_asset_id from public.assets where code='NGN' and status='ACTIVE';
  if v_asset_id is null then raise exception 'The NGN asset is unavailable.' using errcode='42501'; end if;

  select ua.status,ua.country_code into v_account_status,v_country
  from public.user_accounts ua where ua.user_id=v_user_id;

  select * into v_grant
  from public.temporary_ngn_test_credit_grants g
  where g.user_id=v_user_id and g.asset_id=v_asset_id and g.status='ACTIVE'
  order by g.created_at desc limit 1
  for update;
  if v_grant.id is null then
    raise exception 'An active temporary NGN test allocation is required before enabling market testing.' using errcode='42501';
  end if;

  select coalesce(preference.enabled,false) into v_previous
  from public.temporary_ngn_market_testing_preferences preference
  where preference.user_id=v_user_id;
  v_previous:=coalesce(v_previous,false);

  if p_enabled then
    if v_account_status is distinct from 'ACTIVE' then
      raise exception 'An active VAD account is required for NGN market testing.' using errcode='42501';
    end if;
    if v_country is distinct from 'NG' then
      raise exception 'Temporary NGN market testing is only available to eligible Nigerian accounts.' using errcode='42501';
    end if;

    select gate.allowed,gate.reason_code into v_allowed,v_reason
    from public.can_access_ngn_services() gate limit 1;
    if not coalesce(v_allowed,false) then
      raise exception 'Current Nigeria location verification is required for NGN market testing (reason: %).',coalesce(v_reason,'LOCATION_CHECK_REQUIRED') using errcode='42501';
    end if;

    v_service_available:=coalesce(private.service_available('trading',v_user_id),false);
    if not v_service_available then
      raise exception 'The trading service is currently unavailable for this account.' using errcode='42501';
    end if;
    v_asset_available:=coalesce(private.asset_available_in_country(v_country,v_asset_id),false);
    if not v_asset_available then
      raise exception 'NGN is not currently available under this account''s jurisdiction policy.' using errcode='42501';
    end if;
  end if;

  insert into public.temporary_ngn_market_testing_preferences(user_id,enabled,updated_at)
  values(v_user_id,p_enabled,statement_timestamp())
  on conflict(user_id) do update
  set enabled=excluded.enabled,updated_at=statement_timestamp();

  if v_previous is distinct from p_enabled then
    insert into audit.records(
      actor_user_id,actor_type,action,resource_type,resource_id,
      before_state,after_state,reason,request_id,occurred_at,metadata
    ) values(
      v_user_id,'USER',
      case when p_enabled then 'TEMPORARY_NGN_MARKET_TESTING_ENABLED' else 'TEMPORARY_NGN_MARKET_TESTING_DISABLED' end,
      'TEMPORARY_NGN_MARKET_TESTING_PREFERENCE',v_user_id::text,
      jsonb_build_object('enabled',v_previous),
      jsonb_build_object('enabled',p_enabled,'standard_settlement',true),
      case when p_enabled then 'User opted in to the existing non-cash NGN test allocation for standard-market testing.'
           else 'User opted out of temporary NGN market testing.' end,
      gen_random_uuid(),statement_timestamp(),
      jsonb_build_object('grant_id',v_grant.public_id,'asset_code','NGN')
    );
  end if;

  return public.my_temporary_ngn_market_testing_status();
end;
$function$;

create or replace function private.disable_temporary_ngn_market_testing_on_revoke()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status='REVOKED' and old.status is distinct from new.status then
    update public.temporary_ngn_market_testing_preferences
    set enabled=false,updated_at=statement_timestamp()
    where user_id=new.user_id and enabled;
  end if;
  return new;
end;
$function$;
revoke all on function private.disable_temporary_ngn_market_testing_on_revoke() from public,anon,authenticated,service_role;
drop trigger if exists disable_temporary_ngn_market_testing_on_revoke on public.temporary_ngn_test_credit_grants;
create trigger disable_temporary_ngn_market_testing_on_revoke
after update of status on public.temporary_ngn_test_credit_grants
for each row execute function private.disable_temporary_ngn_market_testing_on_revoke();

revoke all on function public.my_temporary_ngn_market_testing_status() from public,anon;
grant execute on function public.my_temporary_ngn_market_testing_status() to authenticated;
revoke all on function public.set_my_temporary_ngn_market_testing(boolean) from public,anon;
grant execute on function public.set_my_temporary_ngn_market_testing(boolean) to authenticated;

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
  v_test_mode_enabled boolean:=false;
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
  select coalesce((
    select preference.enabled
    from public.temporary_ngn_market_testing_preferences preference
    where preference.user_id=auth.uid()
  ),false) into v_test_mode_enabled;
  if v_asset_code='NGN' and v_test_credit_active and not v_test_mode_enabled then
    raise exception 'Enable temporary NGN market testing from Account before placing test trades.' using errcode='42501';
  end if;
  if v_asset_code='NGN' and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1),false) then
    raise exception 'NGN service requires current location verification. Verify your current location and try again.' using errcode='42501';
  end if;
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then
    if not (
      v_asset_code='NGN'
      and v_test_credit_active
      and private.service_available('trading',auth.uid())
      and private.asset_available_in_country(acct.country_code,instrument.asset_id)
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
  v_test_mode_enabled boolean:=false;
  v_test_grant_id bigint;
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
  -- Lock the active credit before acquiring wallet/pool locks. This shares the
  -- grant-first lock order with the admin revocation routine and prevents a
  -- revoke racing with a quote-confirmed stake commit.
  if v_asset_code='NGN' then
    select g.id into v_test_grant_id
    from public.temporary_ngn_test_credit_grants g
    where g.user_id=auth.uid() and g.asset_id=instrument.asset_id and g.status='ACTIVE'
    order by g.created_at desc limit 1
    for update;
    v_test_credit_active:=v_test_grant_id is not null;
  end if;
  select coalesce((
    select preference.enabled
    from public.temporary_ngn_market_testing_preferences preference
    where preference.user_id=auth.uid()
  ),false) into v_test_mode_enabled;
  if v_asset_code='NGN' and v_test_credit_active and not v_test_mode_enabled then
    raise exception 'Enable temporary NGN market testing from Account before placing test trades.' using errcode='42501';
  end if;
  if v_asset_code='NGN' and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1),false) then
    raise exception 'NGN service requires current location verification. Verify your current location and try again.' using errcode='42501';
  end if;
  if not private.trade_access_satisfies(auth.uid(), acct.country_code, instrument.asset_id) then
    if not (
      v_asset_code='NGN'
      and v_test_credit_active
      and private.service_available('trading',auth.uid())
      and private.asset_available_in_country(acct.country_code,instrument.asset_id)
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
