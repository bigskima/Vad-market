-- Run after peer-pool payout guardrails migration.
-- Covers formula invariants and verifies that runtime controls are installed.
begin;

do $$
declare
  capped_multiple numeric;
  ordinary_multiple numeric;
  legacy_multiple numeric;
  pool_amount numeric := 50000;
  winning_stakes numeric := 100;
  cap_multiple numeric := 10;
  winner_budget numeric;
  losing_refund numeric;
begin
  capped_multiple := private.peer_pool_effective_multiple(pool_amount, winning_stakes, cap_multiple);
  if capped_multiple <> 10 then
    raise exception 'Small winning pool must use the configured cap; expected 10x, got %', capped_multiple;
  end if;

  ordinary_multiple := private.peer_pool_effective_multiple(50000, 10000, 10);
  if ordinary_multiple <> 5 then
    raise exception 'A 10,000 winning pool in a 50,000 pool should pay 5x, got %', ordinary_multiple;
  end if;

  legacy_multiple := private.peer_pool_effective_multiple(pool_amount, winning_stakes, null);
  if legacy_multiple <> 500 then
    raise exception 'Legacy/null-cap behavior must preserve the original uncapped multiple, got %', legacy_multiple;
  end if;

  winner_budget := least(pool_amount, winning_stakes * capped_multiple);
  losing_refund := pool_amount - winner_budget;
  if winner_budget <> 1000 or losing_refund <> 49000 or winner_budget + losing_refund <> pool_amount then
    raise exception 'Capped pool split must pay 1,000 to winners and refund 49,000, got winner %, refund %',
      winner_budget, losing_refund;
  end if;

  if not exists (
    select 1 from market.trading_risk_policy_defaults d
    join public.assets a on a.id = d.asset_id
    where a.code = 'NGN' and d.enabled
  ) then
    raise exception 'NGN trading-risk defaults must be configured';
  end if;

  if not exists (
    select 1 from market.trading_risk_policy_defaults d
    join public.assets a on a.id = d.asset_id
    where a.code = 'USDC' and d.enabled
  ) then
    raise exception 'USDC trading-risk defaults must be configured';
  end if;

  if exists (
    select 1 from market.trading_risk_policy_defaults d
    left join market.trading_risk_policy_default_history h
      on h.asset_id = d.asset_id and h.policy_version = d.policy_version
    where h.asset_id is null
  ) then
    raise exception 'Each current risk-policy version must have an immutable history snapshot';
  end if;

  if exists (
    select 1 from market.instruments i
    left join market.instrument_trading_risk_policies p on p.instrument_id = i.id
    where p.instrument_id is null
  ) then
    raise exception 'Every existing instrument must have a risk-policy snapshot';
  end if;

  if not exists (
    select 1 from market.instruments i
    join market.instrument_trading_risk_policies p on p.instrument_id = i.id
    where i.liquidity_model = 'POOL' and p.policy_mode = 'LEGACY'
      and p.pool_max_payout_multiple is null
  ) then
    raise exception 'Existing Peer Pool instruments must retain legacy payout terms';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'trading'
      and c.relname = 'pool_stakes' and t.tgname = 'enforce_pool_stake_risk_limits'
  ) then
    raise exception 'Peer Pool stake limit trigger must be installed';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'trading'
      and c.relname = 'orders' and t.tgname = 'enforce_orderbook_risk_limits'
  ) then
    raise exception 'Order Book exposure trigger must be installed';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'market'
      and c.relname = 'instrument_trading_risk_policies'
      and t.tgname = 'protect_instrument_trading_risk_snapshot'
  ) then
    raise exception 'Per-market risk policy snapshots must be immutable';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'market'
      and c.relname = 'trading_risk_policy_default_history'
      and t.tgname = 'protect_trading_risk_policy_history'
  ) then
    raise exception 'Risk policy history must be append-only';
  end if;

  if position('losing_refund_budget' in pg_get_functiondef('settlement.execute_pool_instrument(bigint)'::regprocedure)) = 0 then
    raise exception 'Peer Pool settlement must account for capped-payout surplus refunds';
  end if;

  if position('vad-onchain-pool:' in pg_get_functiondef(
    'public.internal_prepare_onchain_prediction(uuid,uuid,uuid,text,text,numeric,text)'::regprocedure
  )) = 0 then
    raise exception 'On-chain USDC pool authorization must serialize exposure checks';
  end if;

  if position('pool_max_user_market_stake' in pg_get_functiondef(
    'public.internal_prepare_onchain_prediction(uuid,uuid,uuid,text,text,numeric,text)'::regprocedure
  )) = 0 then
    raise exception 'On-chain USDC pool authorization must enforce cumulative user exposure';
  end if;

  if position('USDC' in pg_get_functiondef('private.attach_instrument_trading_risk_policy()'::regprocedure)) = 0 then
    raise exception 'New on-chain USDC Peer Pool instruments must preserve V1 payout terms until a compatible contract is available';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.internal_prepare_onchain_prediction(uuid,uuid,uuid,text,text,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'Internal on-chain authorization RPC must not be directly callable by authenticated clients';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.internal_prepare_onchain_prediction(uuid,uuid,uuid,text,text,numeric,text)',
    'EXECUTE'
  ) then
    raise exception 'Service role must execute internal on-chain authorization RPC';
  end if;

  if has_function_privilege('anon', 'public.admin_get_trading_risk_policy_defaults()', 'EXECUTE') then
    raise exception 'Anonymous users must not read admin trading-risk defaults';
  end if;

  if not has_function_privilege('authenticated', 'public.admin_get_trading_risk_policy_defaults()', 'EXECUTE') then
    raise exception 'Authenticated admin client must be able to call the permission-checked policy RPC';
  end if;
end;
$$;

rollback;
