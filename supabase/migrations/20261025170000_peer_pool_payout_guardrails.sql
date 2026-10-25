-- Peer Pool payout guardrails and independent Order Book limits.
-- Existing POOL instruments are grandfathered with an uncapped legacy settlement
-- policy. Newly created instruments receive a versioned, bounded policy snapshot.
-- The seeded NGN/USDC limits are operational defaults; adjust the defaults table
-- through the trusted admin surface before enabling broader real-money rollout.

create table if not exists market.trading_risk_policy_defaults (
  asset_id bigint primary key references public.assets(id) on delete restrict,
  policy_version integer not null default 1 check (policy_version > 0),
  enabled boolean not null default true,
  pool_max_entry_stake numeric(38,18) not null check (pool_max_entry_stake > 0),
  pool_max_user_market_stake numeric(38,18) not null check (pool_max_user_market_stake > 0),
  pool_max_market_total numeric(38,18) not null check (pool_max_market_total > 0),
  pool_max_payout_multiple numeric(18,8) not null check (pool_max_payout_multiple > 1),
  order_max_order_notional numeric(38,18) not null check (order_max_order_notional > 0),
  order_max_user_market_exposure numeric(38,18) not null check (order_max_user_market_exposure > 0),
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid null references auth.users(id)
);

comment on table market.trading_risk_policy_defaults is
  'Asset-level defaults copied into a market-specific risk-policy snapshot when an instrument is created. Changes affect new instruments only.';
comment on column market.trading_risk_policy_defaults.pool_max_payout_multiple is
  'Maximum gross pool payout divided by stake on a winning outcome. Pool refunds are separately accounted for; this is not a guaranteed fixed-odds contract.';
comment on column market.trading_risk_policy_defaults.order_max_user_market_exposure is
  'Maximum estimated open BUY exposure per user and instrument in the instrument settlement asset.';

insert into market.trading_risk_policy_defaults (
  asset_id, policy_version, enabled,
  pool_max_entry_stake, pool_max_user_market_stake, pool_max_market_total,
  pool_max_payout_multiple, order_max_order_notional, order_max_user_market_exposure
)
select a.id, 1, true,
       case when a.code = 'NGN' then 100000::numeric else 1000::numeric end,
       case when a.code = 'NGN' then 250000::numeric else 2500::numeric end,
       case when a.code = 'NGN' then 1000000::numeric else 10000::numeric end,
       10::numeric,
       case when a.code = 'NGN' then 100000::numeric else 1000::numeric end,
       case when a.code = 'NGN' then 250000::numeric else 2500::numeric end
from public.assets a
where a.code in ('NGN','USDC') and a.status = 'ACTIVE'
on conflict (asset_id) do nothing;

create table if not exists market.instrument_trading_risk_policies (
  instrument_id bigint primary key references market.instruments(id) on delete restrict,
  asset_id bigint not null references public.assets(id) on delete restrict,
  policy_mode text not null check (policy_mode in ('LEGACY','BOUNDED')),
  policy_version integer not null check (policy_version > 0),
  pool_max_entry_stake numeric(38,18) not null check (pool_max_entry_stake > 0),
  pool_max_user_market_stake numeric(38,18) not null check (pool_max_user_market_stake > 0),
  pool_max_market_total numeric(38,18) not null check (pool_max_market_total > 0),
  pool_max_payout_multiple numeric(18,8) null check (pool_max_payout_multiple is null or pool_max_payout_multiple > 1),
  order_max_order_notional numeric(38,18) not null check (order_max_order_notional > 0),
  order_max_user_market_exposure numeric(38,18) not null check (order_max_user_market_exposure > 0),
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid null references auth.users(id),
  check (
    (policy_mode = 'LEGACY' and pool_max_payout_multiple is null)
    or (policy_mode = 'BOUNDED' and pool_max_payout_multiple is not null)
  )
);

comment on table market.instrument_trading_risk_policies is
  'Immutable-by-default policy snapshot for each market instrument. Legacy pool markets retain their original winner-takes-pool settlement rule; new bounded pool markets use the snapshotted cap.';
comment on column market.instrument_trading_risk_policies.policy_mode is
  'LEGACY preserves the original uncapped Peer Pool settlement for pre-existing markets. BOUNDED enables the market-specific maximum payout multiple.';

-- Snapshot policy for all existing instruments. Existing pools retain their old
-- settlement economics; order limits apply to new orders made after this migration.
insert into market.instrument_trading_risk_policies (
  instrument_id, asset_id, policy_mode, policy_version,
  pool_max_entry_stake, pool_max_user_market_stake, pool_max_market_total,
  pool_max_payout_multiple, order_max_order_notional, order_max_user_market_exposure
)
select i.id, i.asset_id,
       case when i.liquidity_model = 'POOL' then 'LEGACY' else 'BOUNDED' end,
       coalesce(d.policy_version, 1),
       coalesce(d.pool_max_entry_stake, greatest(i.min_order_notional, 100000::numeric)),
       coalesce(d.pool_max_user_market_stake, greatest(i.min_order_notional, 250000::numeric)),
       coalesce(d.pool_max_market_total, greatest(i.min_order_notional, 1000000::numeric)),
       case when i.liquidity_model = 'POOL' then null
            else coalesce(d.pool_max_payout_multiple, 10::numeric) end,
       coalesce(d.order_max_order_notional, greatest(i.min_order_notional, 100000::numeric)),
       coalesce(d.order_max_user_market_exposure, greatest(i.min_order_notional, 250000::numeric))
from market.instruments i
left join market.trading_risk_policy_defaults d on d.asset_id = i.asset_id
on conflict (instrument_id) do nothing;

create or replace function private.attach_instrument_trading_risk_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  d market.trading_risk_policy_defaults;
begin
  select * into d
  from market.trading_risk_policy_defaults
  where asset_id = new.asset_id and enabled = true;

  if d.asset_id is null then
    raise exception 'No active trading risk policy is configured for this market asset.'
      using errcode = '23514';
  end if;

  if new.liquidity_model = 'POOL' and d.pool_max_entry_stake < new.min_order_notional then
    raise exception 'The Peer Pool stake limit is below this market minimum. Configure the risk policy first.'
      using errcode = '23514';
  end if;
  if new.liquidity_model <> 'POOL' and d.order_max_order_notional < new.min_order_notional then
    raise exception 'The Order Book maximum order value is below this market minimum. Configure the risk policy first.'
      using errcode = '23514';
  end if;

  insert into market.instrument_trading_risk_policies (
    instrument_id, asset_id, policy_mode, policy_version,
    pool_max_entry_stake, pool_max_user_market_stake, pool_max_market_total,
    pool_max_payout_multiple, order_max_order_notional, order_max_user_market_exposure
  ) values (
    new.id, new.asset_id,
    case
      -- Current USDC Settlement V1 cannot execute partial refunds on losing
      -- positions after a normal result. Keep its payout economics unchanged
      -- while still enforcing entry and cumulative exposure limits.
      when new.liquidity_model = 'POOL'
        and exists (select 1 from public.assets a where a.id = new.asset_id and a.code = 'USDC')
        then 'LEGACY'
      else 'BOUNDED'
    end,
    d.policy_version,
    d.pool_max_entry_stake, d.pool_max_user_market_stake, d.pool_max_market_total,
    case
      when new.liquidity_model = 'POOL'
        and exists (select 1 from public.assets a where a.id = new.asset_id and a.code = 'USDC')
        then null
      else d.pool_max_payout_multiple
    end,
    d.order_max_order_notional, d.order_max_user_market_exposure
  );
  return new;
end;
$$;

drop trigger if exists attach_instrument_trading_risk_policy on market.instruments;
create trigger attach_instrument_trading_risk_policy
after insert on market.instruments
for each row execute function private.attach_instrument_trading_risk_policy();

create or replace function private.enforce_pool_stake_risk_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy market.instrument_trading_risk_policies;
  current_market_total numeric(38,18);
  current_user_total numeric(38,18);
  minimum_stake numeric(38,18);
begin
  perform pg_advisory_xact_lock(hashtextextended('vad-pool:' || new.instrument_id::text, 0));

  select * into policy
  from market.instrument_trading_risk_policies
  where instrument_id = new.instrument_id;

  if policy.instrument_id is null then
    raise exception 'Market risk policy is missing; stake was not accepted.' using errcode = '23514';
  end if;

  select i.min_order_notional into minimum_stake
  from market.instruments i where i.id = new.instrument_id;

  if new.amount < minimum_stake then
    raise exception 'Stake is below the market minimum.' using errcode = '22023';
  end if;

  if new.amount > policy.pool_max_entry_stake then
    raise exception 'Stake exceeds this market''s maximum single-stake limit.' using errcode = '22023';
  end if;

  select coalesce(sum(s.amount), 0) into current_market_total
  from trading.pool_stakes s where s.instrument_id = new.instrument_id;

  if current_market_total + new.amount > policy.pool_max_market_total then
    raise exception 'This stake would exceed the market pool limit.' using errcode = '22023';
  end if;

  select coalesce(sum(s.amount), 0) into current_user_total
  from trading.pool_stakes s
  where s.instrument_id = new.instrument_id and s.user_id = new.user_id;

  if current_user_total + new.amount > policy.pool_max_user_market_stake then
    raise exception 'This stake would exceed your maximum combined stake for this market.' using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_pool_stake_risk_limits on trading.pool_stakes;
create trigger enforce_pool_stake_risk_limits
before insert on trading.pool_stakes
for each row execute function private.enforce_pool_stake_risk_limits();

create or replace function private.enforce_orderbook_risk_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy market.instrument_trading_risk_policies;
  current_exposure numeric(38,18);
  order_notional numeric(38,18);
begin
  perform pg_advisory_xact_lock(
    hashtextextended('vad-order-risk:' || new.user_id::text || ':' || new.instrument_id::text, 0)
  );

  select * into policy
  from market.instrument_trading_risk_policies
  where instrument_id = new.instrument_id;

  if policy.instrument_id is null then
    raise exception 'Market risk policy is missing; order was not accepted.' using errcode = '23514';
  end if;

  order_notional := round(new.limit_price * new.quantity, 18);
  if order_notional > policy.order_max_order_notional then
    raise exception 'Order exceeds this market''s maximum order value.' using errcode = '22023';
  end if;

  if upper(new.side) = 'BUY' then
    select
      coalesce((select sum(greatest(p.total_cost_basis, 0))
                from trading.positions p
                where p.user_id = new.user_id and p.instrument_id = new.instrument_id), 0)
      +
      coalesce((select sum(greatest(o.quantity - o.filled_quantity, 0) * o.limit_price)
                from trading.orders o
                where o.user_id = new.user_id
                  and o.instrument_id = new.instrument_id
                  and upper(o.side) = 'BUY'
                  and o.status in ('OPEN','PARTIALLY_FILLED','PENDING','RESERVED')), 0)
    into current_exposure;

    if current_exposure + order_notional > policy.order_max_user_market_exposure then
      raise exception 'Order would exceed your maximum exposure for this market.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_orderbook_risk_limits on trading.orders;
create trigger enforce_orderbook_risk_limits
before insert on trading.orders
for each row execute function private.enforce_orderbook_risk_limits();

create or replace function private.peer_pool_effective_multiple(
  p_total_pool numeric,
  p_winning_pool numeric,
  p_maximum_multiple numeric
)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $
  select case
    when p_total_pool is null or p_winning_pool is null or p_total_pool <= 0 or p_winning_pool <= 0 then 0::numeric
    when p_maximum_multiple is null then p_total_pool / p_winning_pool
    else least(p_total_pool / p_winning_pool, p_maximum_multiple)
  end;
$;

revoke all on function private.peer_pool_effective_multiple(numeric, numeric, numeric) from public, anon, authenticated;

create or replace function public.pool_quote(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  risk_policy market.instrument_trading_risk_policies;
  total_pool numeric(38,18) := 0;
  outcome_pool numeric(38,18) := 0;
  fee numeric(38,18) := 0;
  fee_pv bigint;
  est_entry_gross numeric(38,18) := 0;
  est_gross numeric(38,18) := 0;
  est_settlement_fee numeric(38,18) := 0;
  est_pv bigint;
  v_asset_code text;
  v_test_credit_active boolean := false;
  v_test_mode_enabled boolean := false;
  existing_user_outcome_stake numeric(38,18) := 0;
  existing_user_total_stake numeric(38,18) := 0;
  combined_user_outcome_stake numeric(38,18) := 0;
  combined_user_total_stake numeric(38,18) := 0;
  raw_multiple numeric(38,18) := 1;
  applied_multiple numeric(38,18) := 1;
begin
  acct := private.require_active_account();
  select * into instrument from market.instruments where public_id = p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode = 'P0002'; end if;
  if instrument.liquidity_model <> 'POOL' then raise exception 'This market does not use pooled staking' using errcode = 'P0001'; end if;
  if instrument.status <> 'OPEN' or instrument.opened_at is null or instrument.opened_at > statement_timestamp()
     or (instrument.closed_at is not null and instrument.closed_at <= statement_timestamp()) then
    raise exception 'Market is not open' using errcode = 'P0001';
  end if;

  select a.code into v_asset_code from public.assets a where a.id = instrument.asset_id and a.status = 'ACTIVE';
  select exists(select 1 from public.temporary_ngn_test_credit_grants g
    where g.user_id = auth.uid() and g.asset_id = instrument.asset_id and g.status = 'ACTIVE')
  into v_test_credit_active;
  select coalesce((select p.enabled from public.temporary_ngn_market_testing_preferences p where p.user_id = auth.uid()), false)
  into v_test_mode_enabled;

  if v_asset_code = 'NGN' and v_test_credit_active and not v_test_mode_enabled then
    raise exception 'Enable temporary NGN market testing from Account before placing test trades.' using errcode = '42501';
  end if;
  if v_asset_code = 'NGN' and not coalesce((select g.allowed from public.can_access_ngn_services() g limit 1), false) then
    raise exception 'NGN service requires current location verification. Verify your current location and try again.' using errcode = '42501';
  end if;
  if not private.trade_access_satisfies(auth.uid(), acct.country_code, instrument.asset_id) then
    if not (v_asset_code = 'NGN' and v_test_credit_active
      and private.service_available('trading', auth.uid())
      and private.asset_available_in_country(acct.country_code, instrument.asset_id)) then
      raise exception 'Trading is not available for this account and market. Check account eligibility and market capability.' using errcode = 'P0001';
    end if;
  end if;
  perform private.assert_temporary_ngn_market_scope(instrument.id, auth.uid(), instrument.asset_id, false);

  if p_amount is null or p_amount <= 0 or p_amount < instrument.min_order_notional then
    raise exception 'Stake is below the market minimum' using errcode = '22023';
  end if;

  select * into risk_policy from market.instrument_trading_risk_policies where instrument_id = instrument.id;
  if risk_policy.instrument_id is null then raise exception 'Market risk policy is missing.' using errcode = '23514'; end if;
  if p_amount > risk_policy.pool_max_entry_stake then
    raise exception 'Stake exceeds this market''s maximum single-stake limit.' using errcode = '22023';
  end if;

  select * into outcome from market.outcomes
  where instrument_id = instrument.id and code = upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode = 'P0002'; end if;

  select coalesce(sum(s.amount), 0),
         coalesce(sum(s.amount) filter (where s.outcome_id = outcome.id), 0)
  into total_pool, outcome_pool
  from trading.pool_stakes s where s.instrument_id = instrument.id;

  select coalesce(sum(s.amount), 0),
         coalesce(sum(s.amount) filter (where s.outcome_id = outcome.id), 0)
  into existing_user_total_stake, existing_user_outcome_stake
  from trading.pool_stakes s
  where s.instrument_id = instrument.id and s.user_id = auth.uid();

  combined_user_total_stake := existing_user_total_stake + p_amount;
  combined_user_outcome_stake := existing_user_outcome_stake + p_amount;

  if combined_user_total_stake > risk_policy.pool_max_user_market_stake then
    raise exception 'This stake would exceed your maximum combined stake for this market.' using errcode = '22023';
  end if;
  if total_pool + p_amount > risk_policy.pool_max_market_total then
    raise exception 'This stake would exceed the market pool limit.' using errcode = '22023';
  end if;

  select q.fee_amount, q.policy_version_id into fee, fee_pv
  from command.quote_trading_fee(p_amount, 'TAKER') q;

  if outcome_pool + p_amount > 0 then
    raw_multiple := (total_pool + p_amount) / (outcome_pool + p_amount);
    applied_multiple := private.peer_pool_effective_multiple(
      total_pool + p_amount,
      outcome_pool + p_amount,
      case when risk_policy.policy_mode = 'BOUNDED' then risk_policy.pool_max_payout_multiple else null end
    );
    est_entry_gross := round(p_amount * applied_multiple, 18);
    est_gross := round(combined_user_outcome_stake * applied_multiple, 18);
  end if;

  select q.fee_amount, q.policy_version_id into est_settlement_fee, est_pv
  from command.quote_settlement_fee(est_gross) q;

  return jsonb_build_object(
    'instrumentPublicId', instrument.public_id,
    'instrumentId', instrument.id,
    'outcomeId', outcome.id,
    'outcomeCode', outcome.code,
    'assetId', instrument.asset_id,
    'amount', p_amount,
    'tradingFee', coalesce(fee, 0),
    'tradingFeePolicyVersionId', fee_pv,
    'maximumCashDebit', p_amount + coalesce(fee, 0),
    'poolTotalBefore', total_pool,
    'outcomePoolBefore', outcome_pool,
    'poolTotalAfter', total_pool + p_amount,
    'outcomePoolAfter', outcome_pool + p_amount,
    'impliedProbability', case when total_pool + p_amount > 0 then round((outcome_pool + p_amount) / (total_pool + p_amount), 18) else 0.5 end,
    'existingUserOutcomeStake', existing_user_outcome_stake,
    'combinedUserOutcomeStake', combined_user_outcome_stake,
    'existingUserTotalStake', existing_user_total_stake,
    'combinedUserTotalStake', combined_user_total_stake,
    'estimatedEntryGrossPayout', est_entry_gross,
    'estimatedGrossPayout', est_gross,
    'estimatedSettlementFee', coalesce(est_settlement_fee, 0),
    'estimatedNetPayout', greatest(est_gross - coalesce(est_settlement_fee, 0), 0),
    'appliedPayoutMultiple', applied_multiple,
    'maximumGrossPayoutMultiple', case when risk_policy.policy_mode = 'BOUNDED' then risk_policy.pool_max_payout_multiple else null end,
    'payoutCapApplies', risk_policy.policy_mode = 'BOUNDED' and risk_policy.pool_max_payout_multiple is not null and raw_multiple > risk_policy.pool_max_payout_multiple,
    'maxEntryStake', risk_policy.pool_max_entry_stake,
    'maxUserMarketStake', risk_policy.pool_max_user_market_stake,
    'maxMarketPool', risk_policy.pool_max_market_total,
    'riskPolicyVersion', risk_policy.policy_version,
    'quotedAt', statement_timestamp()
  );
end;
$$;

create or replace function public.trade_quote(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_side text,
  p_price numeric,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  risk_policy market.instrument_trading_risk_policies;
  notional numeric(38,18);
  fee_reserve numeric(38,18) := 0;
  maker_fee numeric(38,18) := 0;
  taker_fee numeric(38,18) := 0;
  available_shares numeric(38,18) := 0;
  maker_policy bigint;
  taker_policy bigint;
  potential_gross numeric(38,18) := 0;
  estimated_settlement_fee numeric(38,18) := 0;
  settlement_fee_policy bigint;
  current_exposure numeric(38,18) := 0;
  projected_exposure numeric(38,18) := 0;
begin
  acct := private.require_active_account();
  select * into instrument from market.instruments where public_id = p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode = 'P0002'; end if;
  if instrument.liquidity_model = 'POOL' then raise exception 'This market uses peer-funded pooled staking' using errcode = 'P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(), acct.country_code, instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode = 'P0001';
  end if;
  if instrument.status <> 'OPEN' then raise exception 'Market is not open' using errcode = 'P0001'; end if;
  select * into outcome from market.outcomes where instrument_id = instrument.id and code = upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode = 'P0002'; end if;
  if upper(p_side) not in ('BUY','SELL') then raise exception 'Invalid side' using errcode = '22023'; end if;
  if p_price is null or p_price <= 0 or p_price >= instrument.settlement_unit then raise exception 'Invalid price' using errcode = '22023'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Invalid quantity' using errcode = '22023'; end if;

  notional := round(p_price * p_quantity, 18);
  if notional < instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode = '22023'; end if;

  select * into risk_policy from market.instrument_trading_risk_policies where instrument_id = instrument.id;
  if risk_policy.instrument_id is null then raise exception 'Market risk policy is missing.' using errcode = '23514'; end if;
  if notional > risk_policy.order_max_order_notional then
    raise exception 'Order exceeds this market''s maximum order value.' using errcode = '22023';
  end if;

  select
    coalesce((select sum(greatest(p.total_cost_basis, 0)) from trading.positions p
              where p.user_id = auth.uid() and p.instrument_id = instrument.id), 0)
    +
    coalesce((select sum(greatest(o.quantity - o.filled_quantity, 0) * o.limit_price)
              from trading.orders o
              where o.user_id = auth.uid() and o.instrument_id = instrument.id
                and upper(o.side) = 'BUY'
                and o.status in ('OPEN','PARTIALLY_FILLED','PENDING','RESERVED')), 0)
  into current_exposure;
  projected_exposure := current_exposure + case when upper(p_side) = 'BUY' then notional else 0 end;
  if upper(p_side) = 'BUY' and projected_exposure > risk_policy.order_max_user_market_exposure then
    raise exception 'Order would exceed your maximum exposure for this market.' using errcode = '22023';
  end if;

  select q.fee_amount, q.policy_version_id into maker_fee, maker_policy
  from command.quote_trading_fee(notional, 'MAKER') q;
  select q.fee_amount, q.policy_version_id into taker_fee, taker_policy
  from command.quote_trading_fee(notional, 'TAKER') q;
  if upper(p_side) = 'BUY' then
    select q.fee_amount into fee_reserve from command.max_trading_fee_reserve(notional) q;
  else
    available_shares := command.position_available_to_sell(auth.uid(), instrument.id, outcome.id);
  end if;

  potential_gross := round(p_quantity * instrument.settlement_unit, 18);
  select q.fee_amount, q.policy_version_id into estimated_settlement_fee, settlement_fee_policy
  from command.quote_settlement_fee(potential_gross) q;

  return jsonb_build_object(
    'instrumentPublicId', instrument.public_id,
    'instrumentId', instrument.id,
    'outcomeId', outcome.id,
    'outcomeCode', outcome.code,
    'side', upper(p_side),
    'price', p_price,
    'quantity', p_quantity,
    'notional', notional,
    'settlementUnit', instrument.settlement_unit,
    'potentialGrossSettlement', potential_gross,
    'estimatedSettlementFee', coalesce(estimated_settlement_fee, 0),
    'estimatedNetSettlement', greatest(potential_gross - coalesce(estimated_settlement_fee, 0), 0),
    'makerFee', maker_fee,
    'takerFee', taker_fee,
    'maximumFeeReserve', fee_reserve,
    'maximumCashReservation', case when upper(p_side) = 'BUY' then notional + fee_reserve else 0 end,
    'availableSharesToSell', available_shares,
    'makerFeePolicyVersionId', maker_policy,
    'takerFeePolicyVersionId', taker_policy,
    'settlementFeePolicyVersionId', settlement_fee_policy,
    'maxOrderNotional', risk_policy.order_max_order_notional,
    'maxUserMarketExposure', risk_policy.order_max_user_market_exposure,
    'currentUserMarketExposure', current_exposure,
    'projectedUserMarketExposure', projected_exposure,
    'riskPolicyVersion', risk_policy.policy_version,
    'quotedAt', statement_timestamp()
  );
end;
$$;

create or replace function settlement.execute_pool_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  instrument market.instruments;
  ev market.canonical_events;
  resolution oracle.resolutions;
  risk_policy market.instrument_trading_risk_policies;
  collateral_account bigint;
  collateral numeric(38,18);
  total_pool numeric(38,18) := 0;
  winning_pool numeric(38,18) := 0;
  losing_pool numeric(38,18) := 0;
  winning_budget numeric(38,18) := 0;
  losing_refund_budget numeric(38,18) := 0;
  winning_outcome bigint;
  v_run_id bigint;
  run_public_id uuid;
  gross numeric(38,18) := 0;
  total_fee numeric(38,18) := 0;
  v_journal_id bigint;
  journal_status text;
  fee_account bigint;
  user_account bigint;
  seq integer := 1;
  expected_entries integer;
  entitlement settlement.entitlements;
begin
  select * into instrument from market.instruments where id = p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode = 'P0002'; end if;
  if instrument.liquidity_model <> 'POOL' then raise exception 'Market does not use pooled settlement' using errcode = 'P0001'; end if;
  if instrument.status in ('SETTLED','VOIDED') then
    select id, public_id into v_run_id, run_public_id
    from settlement.runs where instrument_id = instrument.id and status = 'SETTLED'
    order by id desc limit 1;
    perform command.refresh_market_catalog(instrument.id);
    return run_public_id;
  end if;
  if instrument.status not in ('SETTLEMENT_PENDING','CLOSED') then
    raise exception 'Market is not settlement-ready' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('vad-pool-settlement:' || instrument.id::text, 0));
  select * into ev from market.canonical_events where id = instrument.canonical_event_id;
  select * into resolution from oracle.resolutions
  where event_id = ev.id and status in ('FINAL','VOID')
  order by finalized_at desc nulls last, id desc limit 1;
  if resolution.id is null then raise exception 'Final oracle resolution is required' using errcode = '23514'; end if;

  select * into risk_policy from market.instrument_trading_risk_policies where instrument_id = instrument.id;
  if risk_policy.instrument_id is null then raise exception 'Market risk policy is missing; settlement stopped safely.' using errcode = '23514'; end if;

  collateral_account := finance.ensure_market_collateral_account(instrument.id, instrument.asset_id);
  collateral := finance.account_balance(collateral_account);
  select coalesce(sum(amount), 0) into total_pool
  from trading.pool_stakes where instrument_id = instrument.id;

  if round(collateral, 18) <> round(total_pool, 18) then
    raise exception 'Pool collateral does not equal participant stakes' using errcode = '23514';
  end if;

  insert into settlement.runs(
    instrument_id, resolution_id, status, gross_liability, collateral_available,
    settlement_fee_total, idempotency_key
  )
  values (
    instrument.id, resolution.id, 'PLANNED', total_pool, collateral, 0,
    'settle:' || instrument.public_id::text || ':' || resolution.id::text
  )
  on conflict (idempotency_key) do update set collateral_available = excluded.collateral_available
  returning id, public_id into v_run_id, run_public_id;

  if not exists (select 1 from settlement.entitlements e where e.run_id = v_run_id) and total_pool > 0 then
    if resolution.status = 'VOID' then
      insert into settlement.entitlements(run_id, user_id, outcome_id, quantity, gross_amount, fee_amount, net_amount)
      select v_run_id, s.user_id, s.outcome_id, sum(s.amount), sum(s.amount), 0, sum(s.amount)
      from trading.pool_stakes s where s.instrument_id = instrument.id
      group by s.user_id, s.outcome_id;
    else
      select id into winning_outcome from market.outcomes
      where instrument_id = instrument.id and code = resolution.outcome_code;
      if winning_outcome is null then raise exception 'Resolved outcome is missing from market' using errcode = '23514'; end if;

      select coalesce(sum(s.amount), 0) into winning_pool
      from trading.pool_stakes s
      where s.instrument_id = instrument.id and s.outcome_id = winning_outcome;

      if winning_pool = 0 then
        -- Preserve the existing no-winner safeguard: return all stakes if nobody backed the resolved outcome.
        insert into settlement.entitlements(run_id, user_id, outcome_id, quantity, gross_amount, fee_amount, net_amount)
        select v_run_id, s.user_id, s.outcome_id, sum(s.amount), sum(s.amount), 0, sum(s.amount)
        from trading.pool_stakes s where s.instrument_id = instrument.id
        group by s.user_id, s.outcome_id;
      else
        select coalesce(sum(s.amount), 0) into losing_pool
        from trading.pool_stakes s
        where s.instrument_id = instrument.id and s.outcome_id <> winning_outcome;

        if risk_policy.policy_mode = 'BOUNDED' and risk_policy.pool_max_payout_multiple is not null and losing_pool > 0 then
          winning_budget := least(
            total_pool,
            round(winning_pool * private.peer_pool_effective_multiple(
              total_pool, winning_pool, risk_policy.pool_max_payout_multiple
            ), 18)
          );
        else
          -- Legacy pools keep their original winner-takes-the-pool economics.
          winning_budget := total_pool;
        end if;
        losing_refund_budget := greatest(total_pool - winning_budget, 0);

        with winners as (
          select s.user_id, s.outcome_id, sum(s.amount)::numeric(38,18) as stake,
                 row_number() over(order by s.user_id, s.outcome_id) as rn,
                 count(*) over() as cnt
          from trading.pool_stakes s
          where s.instrument_id = instrument.id and s.outcome_id = winning_outcome
          group by s.user_id, s.outcome_id
        ), calc as (
          select w.*, round(winning_budget * w.stake / winning_pool, 18) as gross_pre from winners w
        ), exact as (
          select c.*,
            case when c.rn = c.cnt
              then round(winning_budget - sum(case when c.rn < c.cnt then c.gross_pre else 0 end) over(), 18)
              else c.gross_pre end as gross_exact
          from calc c
        )
        insert into settlement.entitlements(
          run_id, user_id, outcome_id, quantity, gross_amount, fee_amount, net_amount, fee_policy_version_id
        )
        select v_run_id, e.user_id, e.outcome_id, e.stake, e.gross_exact,
               coalesce(q.fee_amount, 0), e.gross_exact - coalesce(q.fee_amount, 0), q.policy_version_id
        from exact e
        cross join lateral command.quote_settlement_fee(e.gross_exact) q;

        if losing_refund_budget > 0 and losing_pool > 0 then
          with losers as (
            select s.user_id, s.outcome_id, sum(s.amount)::numeric(38,18) as stake,
                   row_number() over(order by s.user_id, s.outcome_id) as rn,
                   count(*) over() as cnt
            from trading.pool_stakes s
            where s.instrument_id = instrument.id and s.outcome_id <> winning_outcome
            group by s.user_id, s.outcome_id
          ), calc as (
            select l.*, round(losing_refund_budget * l.stake / losing_pool, 18) as refund_pre
            from losers l
          ), exact as (
            select c.*,
              case when c.rn = c.cnt
                then round(losing_refund_budget - sum(case when c.rn < c.cnt then c.refund_pre else 0 end) over(), 18)
                else c.refund_pre end as refund_exact
            from calc c
          )
          insert into settlement.entitlements(
            run_id, user_id, outcome_id, quantity, gross_amount, fee_amount, net_amount
          )
          select v_run_id, e.user_id, e.outcome_id, e.stake, e.refund_exact, 0, e.refund_exact
          from exact e;
        end if;
      end if;
    end if;
  end if;

  select coalesce(sum(gross_amount), 0), coalesce(sum(fee_amount), 0)
  into gross, total_fee
  from settlement.entitlements where run_id = v_run_id;
  if round(gross, 18) <> round(total_pool, 18) then
    raise exception 'Pool payout and refund liability does not equal participant pool' using errcode = '23514';
  end if;

  update settlement.runs
  set status = 'VALIDATED', gross_liability = gross, collateral_available = collateral,
      settlement_fee_total = total_fee, failure_reason = null
  where id = v_run_id;

  if gross = 0 then
    perform settlement.finalize_accounting_state(v_run_id);
    perform command.refresh_market_catalog(instrument.id);
    insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
    values ('SETTLEMENT_COMPLETED', 'SETTLEMENT_RUN', run_public_id::text,
      jsonb_build_object('instrument_id', instrument.public_id, 'gross_liability', 0, 'fees', 0,
        'resolution_status', resolution.status, 'liquidity_model', 'POOL'),
      'settlement-completed:' || run_public_id::text)
    on conflict (idempotency_key) do nothing;
    return run_public_id;
  end if;

  insert into finance.ledger_journals(asset_id, journal_type, idempotency_key, reference_type, reference_id, description)
  values (instrument.asset_id, 'MARKET_SETTLEMENT', 'settlement-journal:' || run_public_id::text,
    'SETTLEMENT_RUN', run_public_id::text, 'Settle VAD Peer Pool market with policy-based payout and surplus refunds')
  on conflict (idempotency_key) do nothing returning id into v_journal_id;

  if v_journal_id is null then
    select j.id, j.status into v_journal_id, journal_status
    from finance.ledger_journals j where j.idempotency_key = 'settlement-journal:' || run_public_id::text;
  else
    select j.status into journal_status from finance.ledger_journals j where j.id = v_journal_id;
  end if;

  if journal_status <> 'POSTED' then
    delete from finance.ledger_entries le where le.journal_id = v_journal_id;
    insert into finance.ledger_entries(journal_id, account_id, sequence_number, direction, amount)
    values (v_journal_id, collateral_account, seq, 'DEBIT', gross);
    seq := seq + 1;

    for entitlement in select * from settlement.entitlements e where e.run_id = v_run_id order by e.id loop
      if entitlement.net_amount > 0 then
        user_account := finance.ensure_user_account(entitlement.user_id, instrument.asset_id, 'USER_AVAILABLE');
        insert into finance.ledger_entries(journal_id, account_id, sequence_number, direction, amount)
        values (v_journal_id, user_account, seq, 'CREDIT', entitlement.net_amount);
        seq := seq + 1;
      end if;
    end loop;

    if total_fee > 0 then
      fee_account := finance.ensure_platform_account(instrument.asset_id, 'PLATFORM_SETTLEMENT_FEE_REVENUE');
      insert into finance.ledger_entries(journal_id, account_id, sequence_number, direction, amount)
      values (v_journal_id, fee_account, seq, 'CREDIT', total_fee);
      seq := seq + 1;
    end if;

    expected_entries := seq - 1;
    perform finance.post_ledger_journal(v_journal_id, expected_entries);
  end if;

  update settlement.runs set ledger_journal_id = v_journal_id where id = v_run_id;
  perform settlement.finalize_accounting_state(v_run_id);
  perform command.refresh_market_catalog(instrument.id);
  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values ('SETTLEMENT_COMPLETED', 'SETTLEMENT_RUN', run_public_id::text,
    jsonb_build_object('instrument_id', instrument.public_id, 'gross_liability', gross, 'fees', total_fee,
      'resolution_status', resolution.status, 'liquidity_model', 'POOL',
      'policy_mode', risk_policy.policy_mode, 'policy_version', risk_policy.policy_version,
      'winning_budget', winning_budget, 'losing_refund_budget', losing_refund_budget),
    'settlement-completed:' || run_public_id::text)
  on conflict (idempotency_key) do nothing;
  return run_public_id;
end;
$$;

CREATE OR REPLACE FUNCTION public.internal_prepare_onchain_prediction(p_user_id uuid, p_wallet_id uuid, p_instrument_public_id uuid, p_outcome_code text, p_chain_code text, p_amount numeric, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_account public.user_accounts;
  v_instrument market.instruments;
  v_asset public.assets;
  v_outcome market.outcomes;
  v_wallet blockchain.wallet_connections;
  v_venue market.instrument_venues;
  v_chain blockchain.chains;
  v_rep blockchain.asset_representations;
  v_deployment blockchain.contract_deployments;
  v_intent blockchain.transaction_intents;
  v_authorization blockchain.transaction_authorizations;
  v_fee numeric(38,18):=0;
  v_fee_pv bigint;
  v_amount_atomic numeric(38,0);
  v_fee_atomic numeric(38,0);
  v_fee_quantized numeric(38,18);
  v_scale numeric;
  v_deadline timestamptz;
  v_auth_id text;
  v_position_id text;
  v_market_id text;
  v_outcome_id text;
  v_expected_signer text;
  v_existing_user uuid;
  v_risk_policy market.instrument_trading_risk_policies;
  v_existing_user_exposure numeric(38,18) := 0;
  v_existing_market_exposure numeric(38,18) := 0;
  v_pending_user_exposure numeric(38,18) := 0;
  v_pending_market_exposure numeric(38,18) := 0;
begin
  if p_user_id is null or p_wallet_id is null or p_instrument_public_id is null then
    raise exception 'On-chain prediction identity is required' using errcode='22023';
  end if;
  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key))<12
     or char_length(btrim(p_idempotency_key))>240 then
    raise exception 'A valid on-chain idempotency key is required' using errcode='22023';
  end if;

  select ti.user_id into v_existing_user
  from blockchain.transaction_intents ti
  where ti.idempotency_key=p_idempotency_key;

  if v_existing_user is not null then
    if v_existing_user<>p_user_id then
      raise exception 'On-chain idempotency key belongs to another account'
        using errcode='23505';
    end if;

    select ti.* into v_intent
    from blockchain.transaction_intents ti
    where ti.idempotency_key=p_idempotency_key;
    select ta.* into v_authorization
    from blockchain.transaction_authorizations ta
    where ta.intent_id=v_intent.id;

    if v_authorization.id is null then
      raise exception 'Existing on-chain intent is missing its authorization'
        using errcode='P0001';
    end if;

    select c.* into v_chain from blockchain.chains c where c.id=v_authorization.chain_id;
    select cd.* into v_deployment from blockchain.contract_deployments cd where cd.id=v_authorization.contract_deployment_id;
    select ar.* into v_rep from blockchain.asset_representations ar where ar.id=v_authorization.asset_representation_id;

    return jsonb_build_object(
      'intentId',v_intent.public_id,
      'intentStatus',v_intent.status,
      'authorizationId',v_authorization.authorization_id,
      'authorizationStatus',v_authorization.status,
      'positionId',v_authorization.position_id,
      'marketId',v_authorization.market_id,
      'outcomeId',v_authorization.outcome_id,
      'walletAddress',v_authorization.wallet_address,
      'collateralAmount',v_authorization.amount,
      'collateralAmountAtomic',v_authorization.amount_atomic::text,
      'tradingFee',v_authorization.fee_amount,
      'tradingFeeAmountAtomic',v_authorization.fee_amount_atomic::text,
      'tradingFeePolicyVersionId',v_authorization.fee_policy_version_id,
      'deadline',extract(epoch from v_authorization.expires_at)::bigint,
      'chainCode',v_chain.code,
      'evmChainId',v_chain.evm_chain_id,
      'contractAddress',v_deployment.contract_address,
      'tokenAddress',v_rep.token_address,
      'tokenDecimals',v_rep.decimals,
      'expectedQuoteSigner',v_deployment.metadata->>'quote_signer_address',
      'protocolKey',v_deployment.protocol_key,
      'protocolVersion',v_deployment.protocol_version,
      'signature',v_authorization.signature
    );
  end if;

  select * into v_account
  from public.user_accounts ua
  where ua.user_id=p_user_id and ua.status='ACTIVE';
  if v_account.user_id is null then
    raise exception 'Active VAD account required' using errcode='42501';
  end if;

  select i.* into v_instrument
  from market.instruments i
  where i.public_id=p_instrument_public_id;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;

  select * into v_asset from public.assets a where a.id=v_instrument.asset_id;
  if v_asset.code<>'USDC' or v_asset.status<>'ACTIVE' then
    raise exception 'This settlement protocol is available only for active USDC markets' using errcode='P0001';
  end if;
  if v_instrument.liquidity_model<>'POOL' then
    raise exception 'USDC Settlement V1 currently supports Peer Pool markets' using errcode='P0001';
  end if;
  if v_instrument.status<>'OPEN'
     or v_instrument.opened_at is null
     or v_instrument.opened_at>statement_timestamp()
     or (v_instrument.closed_at is not null and v_instrument.closed_at<=statement_timestamp()) then
    raise exception 'Market is not open' using errcode='P0001';
  end if;
  if not private.trade_access_satisfies(p_user_id,v_account.country_code,v_instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode='P0001';
  end if;
  if p_amount is null or p_amount<v_instrument.min_order_notional then
    raise exception 'Stake is below the market minimum' using errcode='22023';
  end if;

  select * into v_risk_policy
  from market.instrument_trading_risk_policies
  where instrument_id = v_instrument.id;
  if v_risk_policy.instrument_id is null then
    raise exception 'Market risk policy is missing; on-chain stake was not authorized.'
      using errcode='23514';
  end if;
  if p_amount > v_risk_policy.pool_max_entry_stake then
    raise exception 'Stake exceeds this market''s maximum single-stake limit.'
      using errcode='22023';
  end if;

  -- Serialise all outstanding on-chain pool authorizations for this instrument so
  -- parallel prepare requests cannot bypass user or total-pool exposure limits.
  perform pg_advisory_xact_lock(
    hashtextextended('vad-onchain-pool:' || v_instrument.id::text, 0)
  );

  select coalesce(sum(bp.collateral_amount), 0)
  into v_existing_market_exposure
  from blockchain.positions bp
  where bp.instrument_id = v_instrument.id
    and bp.status in ('LOCKED','SETTLEMENT_READY');

  select coalesce(sum(bp.collateral_amount), 0)
  into v_existing_user_exposure
  from blockchain.positions bp
  where bp.instrument_id = v_instrument.id
    and bp.user_id = p_user_id
    and bp.status in ('LOCKED','SETTLEMENT_READY');

  select coalesce(sum(ta.amount), 0),
         coalesce(sum(ta.amount) filter (where ti.user_id = p_user_id), 0)
  into v_pending_market_exposure, v_pending_user_exposure
  from blockchain.transaction_authorizations ta
  join blockchain.transaction_intents ti on ti.id = ta.intent_id
  join market.instrument_venues iv on iv.id = ti.venue_id
  where iv.instrument_id = v_instrument.id
    and ti.action = 'PREDICT'
    and ti.status in ('CREATED','AWAITING_SIGNATURE','SIGNED','SUBMITTED','CONFIRMING')
    and (ti.status in ('SUBMITTED','CONFIRMING') or ti.expires_at > statement_timestamp())
    and ta.authorization_type = 'PREDICT_LOCK'
    and ta.status in ('PREPARED','SIGNED')
    and not exists (
      select 1 from blockchain.positions bp where bp.lock_intent_id = ti.id
    );

  if v_existing_user_exposure + v_pending_user_exposure + p_amount
      > v_risk_policy.pool_max_user_market_stake then
    raise exception 'Stake would exceed your maximum combined market exposure.'
      using errcode='22023';
  end if;

  if v_existing_market_exposure + v_pending_market_exposure + p_amount
      > v_risk_policy.pool_max_market_total then
    raise exception 'Stake would exceed this market''s maximum committed pool.'
      using errcode='22023';
  end if;

  select * into v_outcome
  from market.outcomes o
  where o.instrument_id=v_instrument.id
    and o.code=upper(btrim(coalesce(p_outcome_code,'')));
  if v_outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;

  select * into v_wallet
  from blockchain.wallet_connections wc
  where wc.public_id=p_wallet_id
    and wc.user_id=p_user_id
    and wc.status='VERIFIED';
  if v_wallet.id is null then
    raise exception 'A verified VAD wallet is required' using errcode='P0001';
  end if;

  select iv.* into v_venue
  from market.instrument_venues iv
  join blockchain.chains c on c.id=iv.chain_id
  where iv.instrument_id=v_instrument.id
    and iv.settlement_type='ONCHAIN'
    and iv.status='ACTIVE'
    and c.code=upper(btrim(coalesce(p_chain_code,'')))
    and c.status='ACTIVE'
    and c.chain_family='EVM'
  limit 1;
  if v_venue.id is null then
    raise exception 'This market is not active on the selected EVM network' using errcode='P0001';
  end if;

  select * into v_chain from blockchain.chains c where c.id=v_venue.chain_id;
  if v_chain.evm_chain_id is null then
    raise exception 'Selected EVM network is missing its chain ID' using errcode='P0001';
  end if;
  if v_wallet.chain_family<>v_chain.chain_family then
    raise exception 'Wallet family does not match this market network' using errcode='P0001';
  end if;

  if not exists(
    select 1
    from public.jurisdictions j
    join blockchain.jurisdiction_chains jc
      on jc.jurisdiction_id=j.id
     and jc.chain_id=v_chain.id
     and jc.status='ACTIVE'
    where j.country_code=v_account.country_code and j.status='ACTIVE'
  ) then
    raise exception 'This blockchain network is not enabled for your account location' using errcode='P0001';
  end if;

  select * into v_rep
  from blockchain.asset_representations ar
  where ar.id=v_venue.asset_representation_id
    and ar.chain_id=v_chain.id
    and ar.asset_id=v_instrument.asset_id
    and ar.status='ACTIVE';
  if v_rep.id is null then
    raise exception 'The approved USDC representation is not active on this network' using errcode='P0001';
  end if;
  if v_rep.token_standard<>'ERC20' or v_rep.token_address !~ '^0x[0-9a-fA-F]{40}
revoke all on function private.enforce_pool_stake_risk_limits() from public, anon, authenticated;
revoke all on function private.enforce_orderbook_risk_limits() from public, anon, authenticated;



-- Admin configuration is versioned at the asset-default level. New instruments
-- receive a snapshot; already-created instruments are not silently re-priced.
create or replace function public.admin_get_trading_risk_policy_defaults()
returns table (
  asset_code text,
  policy_version integer,
  enabled boolean,
  pool_max_entry_stake numeric,
  pool_max_user_market_stake numeric,
  pool_max_market_total numeric,
  pool_max_payout_multiple numeric,
  order_max_order_notional numeric,
  order_max_user_market_exposure numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  return query
  select a.code, d.policy_version, d.enabled,
         d.pool_max_entry_stake, d.pool_max_user_market_stake, d.pool_max_market_total,
         d.pool_max_payout_multiple, d.order_max_order_notional, d.order_max_user_market_exposure,
         d.updated_at
  from market.trading_risk_policy_defaults d
  join public.assets a on a.id = d.asset_id
  order by a.code;
end;
$;

create or replace function public.admin_update_trading_risk_policy_defaults(
  p_asset_code text,
  p_enabled boolean,
  p_pool_max_entry_stake numeric,
  p_pool_max_user_market_stake numeric,
  p_pool_max_market_total numeric,
  p_pool_max_payout_multiple numeric,
  p_order_max_order_notional numeric,
  p_order_max_user_market_exposure numeric
)
returns integer
language plpgsql
security definer
set search_path = ''
as $
declare
  v_asset_id bigint;
  v_policy_version integer;
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if p_asset_code is null or upper(trim(p_asset_code)) not in ('NGN','USDC') then
    raise exception 'Trading risk defaults may only be configured for supported assets.' using errcode = '22023';
  end if;
  if p_enabled is null
    or p_pool_max_entry_stake is null or p_pool_max_entry_stake <= 0
    or p_pool_max_user_market_stake is null or p_pool_max_user_market_stake < p_pool_max_entry_stake
    or p_pool_max_market_total is null or p_pool_max_market_total < p_pool_max_user_market_stake
    or p_pool_max_payout_multiple is null or p_pool_max_payout_multiple <= 1
    or p_order_max_order_notional is null or p_order_max_order_notional <= 0
    or p_order_max_user_market_exposure is null or p_order_max_user_market_exposure < p_order_max_order_notional then
    raise exception 'Risk limits are inconsistent. Maximums must be positive and cumulative exposure must be at least the single-entry maximum.' using errcode = '22023';
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.code = upper(trim(p_asset_code)) and a.status = 'ACTIVE';

  if v_asset_id is null then
    raise exception 'The asset is not active.' using errcode = '22023';
  end if;

  update market.trading_risk_policy_defaults d
  set enabled = p_enabled,
      policy_version = d.policy_version + 1,
      pool_max_entry_stake = p_pool_max_entry_stake,
      pool_max_user_market_stake = p_pool_max_user_market_stake,
      pool_max_market_total = p_pool_max_market_total,
      pool_max_payout_multiple = p_pool_max_payout_multiple,
      order_max_order_notional = p_order_max_order_notional,
      order_max_user_market_exposure = p_order_max_user_market_exposure,
      updated_at = statement_timestamp(),
      updated_by = auth.uid()
  where d.asset_id = v_asset_id
  returning d.policy_version into v_policy_version;

  if v_policy_version is null then
    raise exception 'Trading risk defaults are not configured for this asset.' using errcode = 'P0002';
  end if;

  return v_policy_version;
end;
$;

revoke all on function public.admin_get_trading_risk_policy_defaults() from public, anon;
revoke all on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_get_trading_risk_policy_defaults() to authenticated;
grant execute on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

comment on function public.pool_quote(uuid, text, numeric) is
  'Quotes the new Peer Pool entry and the user''s aggregate outcome position under the market-specific versioned payout policy.';
comment on function public.trade_quote(uuid, text, text, numeric, numeric) is
  'Quotes Order Book orders with policy-driven per-order and cumulative user exposure limits.';
comment on function settlement.execute_pool_instrument(bigint) is
  'Settles Peer Pool positions under the instrument policy snapshot; legacy pools preserve original terms and bounded pools distribute capped-payout surplus as disclosed refunds.';
 then
    raise exception 'USDC Settlement V1 requires an approved ERC-20 representation' using errcode='P0001';
  end if;

  select * into v_deployment
  from blockchain.contract_deployments cd
  where cd.id=v_venue.contract_deployment_id
    and cd.chain_id=v_chain.id
    and cd.protocol_key='VAD_SETTLEMENT_V1'
    and cd.protocol_version=1
    and cd.status='ACTIVE';
  if v_deployment.id is null or v_deployment.contract_address !~ '^0x[0-9a-fA-F]{40}
revoke all on function private.enforce_pool_stake_risk_limits() from public, anon, authenticated;
revoke all on function private.enforce_orderbook_risk_limits() from public, anon, authenticated;



-- Admin configuration is versioned at the asset-default level. New instruments
-- receive a snapshot; already-created instruments are not silently re-priced.
create or replace function public.admin_get_trading_risk_policy_defaults()
returns table (
  asset_code text,
  policy_version integer,
  enabled boolean,
  pool_max_entry_stake numeric,
  pool_max_user_market_stake numeric,
  pool_max_market_total numeric,
  pool_max_payout_multiple numeric,
  order_max_order_notional numeric,
  order_max_user_market_exposure numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  return query
  select a.code, d.policy_version, d.enabled,
         d.pool_max_entry_stake, d.pool_max_user_market_stake, d.pool_max_market_total,
         d.pool_max_payout_multiple, d.order_max_order_notional, d.order_max_user_market_exposure,
         d.updated_at
  from market.trading_risk_policy_defaults d
  join public.assets a on a.id = d.asset_id
  order by a.code;
end;
$;

create or replace function public.admin_update_trading_risk_policy_defaults(
  p_asset_code text,
  p_enabled boolean,
  p_pool_max_entry_stake numeric,
  p_pool_max_user_market_stake numeric,
  p_pool_max_market_total numeric,
  p_pool_max_payout_multiple numeric,
  p_order_max_order_notional numeric,
  p_order_max_user_market_exposure numeric
)
returns integer
language plpgsql
security definer
set search_path = ''
as $
declare
  v_asset_id bigint;
  v_policy_version integer;
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if p_asset_code is null or upper(trim(p_asset_code)) not in ('NGN','USDC') then
    raise exception 'Trading risk defaults may only be configured for supported assets.' using errcode = '22023';
  end if;
  if p_enabled is null
    or p_pool_max_entry_stake is null or p_pool_max_entry_stake <= 0
    or p_pool_max_user_market_stake is null or p_pool_max_user_market_stake < p_pool_max_entry_stake
    or p_pool_max_market_total is null or p_pool_max_market_total < p_pool_max_user_market_stake
    or p_pool_max_payout_multiple is null or p_pool_max_payout_multiple <= 1
    or p_order_max_order_notional is null or p_order_max_order_notional <= 0
    or p_order_max_user_market_exposure is null or p_order_max_user_market_exposure < p_order_max_order_notional then
    raise exception 'Risk limits are inconsistent. Maximums must be positive and cumulative exposure must be at least the single-entry maximum.' using errcode = '22023';
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.code = upper(trim(p_asset_code)) and a.status = 'ACTIVE';

  if v_asset_id is null then
    raise exception 'The asset is not active.' using errcode = '22023';
  end if;

  update market.trading_risk_policy_defaults d
  set enabled = p_enabled,
      policy_version = d.policy_version + 1,
      pool_max_entry_stake = p_pool_max_entry_stake,
      pool_max_user_market_stake = p_pool_max_user_market_stake,
      pool_max_market_total = p_pool_max_market_total,
      pool_max_payout_multiple = p_pool_max_payout_multiple,
      order_max_order_notional = p_order_max_order_notional,
      order_max_user_market_exposure = p_order_max_user_market_exposure,
      updated_at = statement_timestamp(),
      updated_by = auth.uid()
  where d.asset_id = v_asset_id
  returning d.policy_version into v_policy_version;

  if v_policy_version is null then
    raise exception 'Trading risk defaults are not configured for this asset.' using errcode = 'P0002';
  end if;

  return v_policy_version;
end;
$;

revoke all on function public.admin_get_trading_risk_policy_defaults() from public, anon;
revoke all on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_get_trading_risk_policy_defaults() to authenticated;
grant execute on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

comment on function public.pool_quote(uuid, text, numeric) is
  'Quotes the new Peer Pool entry and the user''s aggregate outcome position under the market-specific versioned payout policy.';
comment on function public.trade_quote(uuid, text, text, numeric, numeric) is
  'Quotes Order Book orders with policy-driven per-order and cumulative user exposure limits.';
comment on function settlement.execute_pool_instrument(bigint) is
  'Settles Peer Pool positions under the instrument policy snapshot; legacy pools preserve original terms and bounded pools distribute capped-payout surplus as disclosed refunds.';
 then
    raise exception 'VAD Settlement V1 is not active on this network' using errcode='P0001';
  end if;

  v_expected_signer:=lower(btrim(coalesce(v_deployment.metadata->>'quote_signer_address','')));
  if v_expected_signer !~ '^0x[0-9a-f]{40}
revoke all on function private.enforce_pool_stake_risk_limits() from public, anon, authenticated;
revoke all on function private.enforce_orderbook_risk_limits() from public, anon, authenticated;



-- Admin configuration is versioned at the asset-default level. New instruments
-- receive a snapshot; already-created instruments are not silently re-priced.
create or replace function public.admin_get_trading_risk_policy_defaults()
returns table (
  asset_code text,
  policy_version integer,
  enabled boolean,
  pool_max_entry_stake numeric,
  pool_max_user_market_stake numeric,
  pool_max_market_total numeric,
  pool_max_payout_multiple numeric,
  order_max_order_notional numeric,
  order_max_user_market_exposure numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  return query
  select a.code, d.policy_version, d.enabled,
         d.pool_max_entry_stake, d.pool_max_user_market_stake, d.pool_max_market_total,
         d.pool_max_payout_multiple, d.order_max_order_notional, d.order_max_user_market_exposure,
         d.updated_at
  from market.trading_risk_policy_defaults d
  join public.assets a on a.id = d.asset_id
  order by a.code;
end;
$;

create or replace function public.admin_update_trading_risk_policy_defaults(
  p_asset_code text,
  p_enabled boolean,
  p_pool_max_entry_stake numeric,
  p_pool_max_user_market_stake numeric,
  p_pool_max_market_total numeric,
  p_pool_max_payout_multiple numeric,
  p_order_max_order_notional numeric,
  p_order_max_user_market_exposure numeric
)
returns integer
language plpgsql
security definer
set search_path = ''
as $
declare
  v_asset_id bigint;
  v_policy_version integer;
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if p_asset_code is null or upper(trim(p_asset_code)) not in ('NGN','USDC') then
    raise exception 'Trading risk defaults may only be configured for supported assets.' using errcode = '22023';
  end if;
  if p_enabled is null
    or p_pool_max_entry_stake is null or p_pool_max_entry_stake <= 0
    or p_pool_max_user_market_stake is null or p_pool_max_user_market_stake < p_pool_max_entry_stake
    or p_pool_max_market_total is null or p_pool_max_market_total < p_pool_max_user_market_stake
    or p_pool_max_payout_multiple is null or p_pool_max_payout_multiple <= 1
    or p_order_max_order_notional is null or p_order_max_order_notional <= 0
    or p_order_max_user_market_exposure is null or p_order_max_user_market_exposure < p_order_max_order_notional then
    raise exception 'Risk limits are inconsistent. Maximums must be positive and cumulative exposure must be at least the single-entry maximum.' using errcode = '22023';
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.code = upper(trim(p_asset_code)) and a.status = 'ACTIVE';

  if v_asset_id is null then
    raise exception 'The asset is not active.' using errcode = '22023';
  end if;

  update market.trading_risk_policy_defaults d
  set enabled = p_enabled,
      policy_version = d.policy_version + 1,
      pool_max_entry_stake = p_pool_max_entry_stake,
      pool_max_user_market_stake = p_pool_max_user_market_stake,
      pool_max_market_total = p_pool_max_market_total,
      pool_max_payout_multiple = p_pool_max_payout_multiple,
      order_max_order_notional = p_order_max_order_notional,
      order_max_user_market_exposure = p_order_max_user_market_exposure,
      updated_at = statement_timestamp(),
      updated_by = auth.uid()
  where d.asset_id = v_asset_id
  returning d.policy_version into v_policy_version;

  if v_policy_version is null then
    raise exception 'Trading risk defaults are not configured for this asset.' using errcode = 'P0002';
  end if;

  return v_policy_version;
end;
$;

revoke all on function public.admin_get_trading_risk_policy_defaults() from public, anon;
revoke all on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_get_trading_risk_policy_defaults() to authenticated;
grant execute on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

comment on function public.pool_quote(uuid, text, numeric) is
  'Quotes the new Peer Pool entry and the user''s aggregate outcome position under the market-specific versioned payout policy.';
comment on function public.trade_quote(uuid, text, text, numeric, numeric) is
  'Quotes Order Book orders with policy-driven per-order and cumulative user exposure limits.';
comment on function settlement.execute_pool_instrument(bigint) is
  'Settles Peer Pool positions under the instrument policy snapshot; legacy pools preserve original terms and bounded pools distribute capped-payout surplus as disclosed refunds.';
 then
    raise exception 'VAD quote signer is not configured for this deployment' using errcode='P0001';
  end if;

  v_amount_atomic:=private.asset_amount_to_atomic(p_amount,v_rep.decimals,true);
  if v_amount_atomic<=0 then raise exception 'Stake amount must be greater than zero' using errcode='22023'; end if;

  select q.fee_amount,q.policy_version_id into v_fee,v_fee_pv
  from command.quote_trading_fee(p_amount,'TAKER') q;
  v_fee:=coalesce(v_fee,0);
  v_fee_atomic:=private.asset_amount_to_atomic(v_fee,v_rep.decimals,false);
  v_scale:=power(10::numeric,v_rep.decimals);
  v_fee_quantized:=v_fee_atomic/v_scale;
  v_deadline:=statement_timestamp()+interval '5 minutes';

  insert into blockchain.transaction_intents(
    user_id,wallet_connection_id,venue_id,action,outcome_id,amount,status,
    idempotency_key,expires_at,metadata
  ) values(
    p_user_id,v_wallet.id,v_venue.id,'PREDICT',v_outcome.id,p_amount,'CREATED',
    btrim(p_idempotency_key),v_deadline,
    jsonb_build_object(
      'protocol_key','VAD_SETTLEMENT_V1',
      'protocol_version',1,
      'asset_code','USDC',
      'fee_policy_name','trading_fee',
      'fee_policy_version_id',v_fee_pv
    )
  )
  returning * into v_intent;

  v_auth_id:=private.onchain_bytes32('authorization',v_intent.public_id::text);
  v_position_id:=private.onchain_bytes32('position',v_intent.public_id::text);
  v_market_id:=private.onchain_bytes32('market',v_instrument.public_id::text);
  v_outcome_id:=private.onchain_bytes32('outcome',v_outcome.public_id::text);

  insert into blockchain.transaction_authorizations(
    intent_id,chain_id,contract_deployment_id,asset_id,asset_representation_id,
    authorization_type,authorization_id,position_id,market_id,outcome_id,
    wallet_address,amount,amount_atomic,fee_policy_name,fee_policy_version_id,
    fee_amount,fee_amount_atomic,expires_at,status,payload,metadata
  ) values(
    v_intent.id,v_chain.id,v_deployment.id,v_instrument.asset_id,v_rep.id,
    'PREDICT_LOCK',v_auth_id,v_position_id,v_market_id,v_outcome_id,
    v_wallet.wallet_address,p_amount,v_amount_atomic,'trading_fee',v_fee_pv,
    v_fee_quantized,v_fee_atomic,v_deadline,'PREPARED',
    jsonb_build_object(
      'authorizationId',v_auth_id,
      'positionId',v_position_id,
      'marketId',v_market_id,
      'outcomeId',v_outcome_id,
      'user',v_wallet.wallet_address,
      'collateralAmount',v_amount_atomic::text,
      'tradingFeeAmount',v_fee_atomic::text,
      'tradingFeePolicyVersion',coalesce(v_fee_pv,0)::text,
      'deadline',extract(epoch from v_deadline)::bigint
    ),
    jsonb_build_object(
      'market_public_id',v_instrument.public_id,
      'outcome_public_id',v_outcome.public_id,
      'chain_code',v_chain.code,
      'token_address',v_rep.token_address,
      'token_decimals',v_rep.decimals,
      'expected_quote_signer',v_expected_signer
    )
  )
  returning * into v_authorization;

  update blockchain.transaction_intents set status='AWAITING_SIGNATURE'
  where id=v_intent.id returning * into v_intent;

  return jsonb_build_object(
    'intentId',v_intent.public_id,
    'intentStatus',v_intent.status,
    'authorizationId',v_authorization.authorization_id,
    'authorizationStatus',v_authorization.status,
    'positionId',v_authorization.position_id,
    'marketId',v_authorization.market_id,
    'outcomeId',v_authorization.outcome_id,
    'walletAddress',v_authorization.wallet_address,
    'collateralAmount',v_authorization.amount,
    'collateralAmountAtomic',v_authorization.amount_atomic::text,
    'tradingFee',v_authorization.fee_amount,
    'tradingFeeAmountAtomic',v_authorization.fee_amount_atomic::text,
    'tradingFeePolicyVersionId',v_authorization.fee_policy_version_id,
    'deadline',extract(epoch from v_authorization.expires_at)::bigint,
    'chainCode',v_chain.code,
    'evmChainId',v_chain.evm_chain_id,
    'contractAddress',v_deployment.contract_address,
    'tokenAddress',v_rep.token_address,
    'tokenDecimals',v_rep.decimals,
    'expectedQuoteSigner',v_expected_signer,
    'protocolKey',v_deployment.protocol_key,
    'protocolVersion',v_deployment.protocol_version,
    'signature',null
  );
end;
$function$


revoke all on function public.internal_prepare_onchain_prediction(uuid, uuid, uuid, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.internal_prepare_onchain_prediction(uuid, uuid, uuid, text, text, numeric, text)
  to service_role;

revoke all on function private.attach_instrument_trading_risk_policy() from public, anon, authenticated;
revoke all on function private.enforce_pool_stake_risk_limits() from public, anon, authenticated;
revoke all on function private.enforce_orderbook_risk_limits() from public, anon, authenticated;



-- Admin configuration is versioned at the asset-default level. New instruments
-- receive a snapshot; already-created instruments are not silently re-priced.
create or replace function public.admin_get_trading_risk_policy_defaults()
returns table (
  asset_code text,
  policy_version integer,
  enabled boolean,
  pool_max_entry_stake numeric,
  pool_max_user_market_stake numeric,
  pool_max_market_total numeric,
  pool_max_payout_multiple numeric,
  order_max_order_notional numeric,
  order_max_user_market_exposure numeric,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  return query
  select a.code, d.policy_version, d.enabled,
         d.pool_max_entry_stake, d.pool_max_user_market_stake, d.pool_max_market_total,
         d.pool_max_payout_multiple, d.order_max_order_notional, d.order_max_user_market_exposure,
         d.updated_at
  from market.trading_risk_policy_defaults d
  join public.assets a on a.id = d.asset_id
  order by a.code;
end;
$;

create or replace function public.admin_update_trading_risk_policy_defaults(
  p_asset_code text,
  p_enabled boolean,
  p_pool_max_entry_stake numeric,
  p_pool_max_user_market_stake numeric,
  p_pool_max_market_total numeric,
  p_pool_max_payout_multiple numeric,
  p_order_max_order_notional numeric,
  p_order_max_user_market_exposure numeric
)
returns integer
language plpgsql
security definer
set search_path = ''
as $
declare
  v_asset_id bigint;
  v_policy_version integer;
begin
  if not private.has_permission('policies.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if p_asset_code is null or upper(trim(p_asset_code)) not in ('NGN','USDC') then
    raise exception 'Trading risk defaults may only be configured for supported assets.' using errcode = '22023';
  end if;
  if p_enabled is null
    or p_pool_max_entry_stake is null or p_pool_max_entry_stake <= 0
    or p_pool_max_user_market_stake is null or p_pool_max_user_market_stake < p_pool_max_entry_stake
    or p_pool_max_market_total is null or p_pool_max_market_total < p_pool_max_user_market_stake
    or p_pool_max_payout_multiple is null or p_pool_max_payout_multiple <= 1
    or p_order_max_order_notional is null or p_order_max_order_notional <= 0
    or p_order_max_user_market_exposure is null or p_order_max_user_market_exposure < p_order_max_order_notional then
    raise exception 'Risk limits are inconsistent. Maximums must be positive and cumulative exposure must be at least the single-entry maximum.' using errcode = '22023';
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.code = upper(trim(p_asset_code)) and a.status = 'ACTIVE';

  if v_asset_id is null then
    raise exception 'The asset is not active.' using errcode = '22023';
  end if;

  update market.trading_risk_policy_defaults d
  set enabled = p_enabled,
      policy_version = d.policy_version + 1,
      pool_max_entry_stake = p_pool_max_entry_stake,
      pool_max_user_market_stake = p_pool_max_user_market_stake,
      pool_max_market_total = p_pool_max_market_total,
      pool_max_payout_multiple = p_pool_max_payout_multiple,
      order_max_order_notional = p_order_max_order_notional,
      order_max_user_market_exposure = p_order_max_user_market_exposure,
      updated_at = statement_timestamp(),
      updated_by = auth.uid()
  where d.asset_id = v_asset_id
  returning d.policy_version into v_policy_version;

  if v_policy_version is null then
    raise exception 'Trading risk defaults are not configured for this asset.' using errcode = 'P0002';
  end if;

  return v_policy_version;
end;
$;

revoke all on function public.admin_get_trading_risk_policy_defaults() from public, anon;
revoke all on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public.admin_get_trading_risk_policy_defaults() to authenticated;
grant execute on function public.admin_update_trading_risk_policy_defaults(text, boolean, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

comment on function public.pool_quote(uuid, text, numeric) is
  'Quotes the new Peer Pool entry and the user''s aggregate outcome position under the market-specific versioned payout policy.';
comment on function public.trade_quote(uuid, text, text, numeric, numeric) is
  'Quotes Order Book orders with policy-driven per-order and cumulative user exposure limits.';
comment on function settlement.execute_pool_instrument(bigint) is
  'Settles Peer Pool positions under the instrument policy snapshot; legacy pools preserve original terms and bounded pools distribute capped-payout surplus as disclosed refunds.';


comment on function public.internal_prepare_onchain_prediction(uuid, uuid, uuid, text, text, numeric, text) is
  'Prepares an on-chain USDC Peer Pool position only after enforcing the instrument policy snapshot, per-entry stake and serialized cumulative user/market exposure limits.';
