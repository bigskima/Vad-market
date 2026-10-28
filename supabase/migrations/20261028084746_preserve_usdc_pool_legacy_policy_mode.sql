-- Preserve the established USDC Pool settlement policy: USDC pool snapshots
-- remain LEGACY (without a payout-multiple cap) regardless of the default value.
-- This keeps the immutable-snapshot fix from changing USDC settlement economics.
CREATE OR REPLACE FUNCTION private.attach_instrument_trading_risk_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  d market.trading_risk_policy_defaults;
  v_requested_model text := nullif(upper(btrim(coalesce(current_setting('vad.market_trade_limits_model', true), ''))), '');
  v_requested_max_text text := nullif(btrim(coalesce(current_setting('vad.market_trade_limits_max', true), '')), '');
  v_requested_max numeric;
  v_effective_model text;
  v_usdc boolean := false;
BEGIN
  SELECT *
  INTO d
  FROM market.trading_risk_policy_defaults
  WHERE asset_id = NEW.asset_id AND enabled = true;

  IF d.asset_id IS NULL THEN
    RAISE EXCEPTION 'No active trading risk policy is configured for this market asset.'
      USING errcode = '23514';
  END IF;

  IF (v_requested_model IS NULL) <> (v_requested_max_text IS NULL) THEN
    RAISE EXCEPTION 'Market-specific risk limits were not provided as a complete configuration.'
      USING errcode = '22023';
  END IF;

  IF v_requested_max_text IS NOT NULL THEN
    IF v_requested_model NOT IN ('POOL', 'ORDER_BOOK') THEN
      RAISE EXCEPTION 'Choose Peer Pool or Order Book.' USING errcode = '22023';
    END IF;
    BEGIN
      v_requested_max := v_requested_max_text::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'The market maximum trade amount is invalid.' USING errcode = '22023';
    END;
    IF v_requested_max <= 0 OR v_requested_max > 1000000000000 THEN
      RAISE EXCEPTION 'The market maximum trade amount is outside the supported range.' USING errcode = '22023';
    END IF;
    IF v_requested_model = 'POOL' AND v_requested_max > d.pool_max_entry_stake THEN
      RAISE EXCEPTION 'The market maximum exceeds the configured Peer Pool entry limit of % for this currency.', d.pool_max_entry_stake
        USING errcode = '22023';
    END IF;
    IF v_requested_model = 'ORDER_BOOK' AND v_requested_max > d.order_max_order_notional THEN
      RAISE EXCEPTION 'The market maximum exceeds the configured Order Book order limit of % for this currency.', d.order_max_order_notional
        USING errcode = '22023';
    END IF;
  END IF;

  v_effective_model := coalesce(v_requested_model, NEW.liquidity_model);
  SELECT EXISTS (
    SELECT 1 FROM public.assets a WHERE a.id = NEW.asset_id AND a.code = 'USDC'
  ) INTO v_usdc;

  IF v_effective_model = 'POOL' AND v_usdc THEN
    INSERT INTO market.instrument_trading_risk_policies (
      instrument_id, asset_id, policy_mode, policy_version,
      pool_max_entry_stake, pool_max_user_market_stake, pool_max_market_total,
      pool_max_payout_multiple, order_max_order_notional, order_max_user_market_exposure
    ) VALUES (
      NEW.id, NEW.asset_id, 'LEGACY', d.policy_version,
      CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_entry_stake END,
      greatest(d.pool_max_user_market_stake, CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_user_market_stake END),
      greatest(d.pool_max_market_total, CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_market_total END),
      NULL,
      CASE WHEN v_requested_model = 'ORDER_BOOK' THEN v_requested_max ELSE d.order_max_order_notional END,
      greatest(d.order_max_user_market_exposure, CASE WHEN v_requested_model = 'ORDER_BOOK' THEN v_requested_max ELSE d.order_max_user_market_exposure END)
    );
  ELSE
    INSERT INTO market.instrument_trading_risk_policies (
      instrument_id, asset_id, policy_mode, policy_version,
      pool_max_entry_stake, pool_max_user_market_stake, pool_max_market_total,
      pool_max_payout_multiple, order_max_order_notional, order_max_user_market_exposure
    ) VALUES (
      NEW.id, NEW.asset_id, 'BOUNDED', d.policy_version,
      CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_entry_stake END,
      greatest(d.pool_max_user_market_stake, CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_user_market_stake END),
      greatest(d.pool_max_market_total, CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_market_total END),
      d.pool_max_payout_multiple,
      CASE WHEN v_requested_model = 'ORDER_BOOK' THEN v_requested_max ELSE d.order_max_order_notional END,
      greatest(d.order_max_user_market_exposure, CASE WHEN v_requested_model = 'ORDER_BOOK' THEN v_requested_max ELSE d.order_max_user_market_exposure END)
    );
  END IF;

  RETURN NEW;
END;
$function$;
