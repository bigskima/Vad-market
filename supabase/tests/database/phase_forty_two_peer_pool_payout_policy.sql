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

  if position('losing_refund_budget' in pg_get_functiondef('settlement.execute_pool_instrument(bigint)'::regprocedure)) = 0 then
    raise exception 'Peer Pool settlement must account for capped-payout surplus refunds';
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
