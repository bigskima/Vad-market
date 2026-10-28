-- Keep per-market trade limits compatible with immutable trading-risk snapshots.
-- The requested maximum is injected only for the duration of guided market creation;
-- the risk policy is written once, at instrument insert, rather than updated afterward.

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
  SELECT EXISTS (SELECT 1 FROM public.assets a WHERE a.id = NEW.asset_id AND a.code = 'USDC')
  INTO v_usdc;

  INSERT INTO market.instrument_trading_risk_policies (
    instrument_id, asset_id, policy_mode, policy_version,
    pool_max_entry_stake, pool_max_user_market_stake, pool_max_market_total,
    pool_max_payout_multiple, order_max_order_notional, order_max_user_market_exposure
  ) VALUES (
    NEW.id, NEW.asset_id,
    CASE WHEN v_effective_model = 'POOL' AND v_usdc THEN 'LEGACY' ELSE 'BOUNDED' END,
    d.policy_version,
    CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_entry_stake END,
    greatest(d.pool_max_user_market_stake, CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_user_market_stake END),
    greatest(d.pool_max_market_total, CASE WHEN v_requested_model = 'POOL' THEN v_requested_max ELSE d.pool_max_market_total END),
    CASE WHEN v_effective_model = 'POOL' AND v_usdc THEN NULL ELSE d.pool_max_payout_multiple END,
    CASE WHEN v_requested_model = 'ORDER_BOOK' THEN v_requested_max ELSE d.order_max_order_notional END,
    greatest(d.order_max_user_market_exposure, CASE WHEN v_requested_model = 'ORDER_BOOK' THEN v_requested_max ELSE d.order_max_user_market_exposure END)
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.apply_market_trade_limits(
  p_instrument_public_id uuid,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_liquidity_model text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_instrument market.instruments;
  v_policy market.instrument_trading_risk_policies;
  v_defaults market.trading_risk_policy_defaults;
  v_model text := upper(btrim(coalesce(p_liquidity_model, '')));
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('markets.manage') THEN
    RAISE EXCEPTION 'Market management permission required' USING errcode = '42501';
  END IF;
  IF p_min_trade_amount IS NULL OR p_max_trade_amount IS NULL
     OR p_min_trade_amount <= 0 OR p_max_trade_amount <= p_min_trade_amount THEN
    RAISE EXCEPTION 'The maximum trade amount must be greater than a positive minimum.' USING errcode = '22023';
  END IF;
  IF v_model NOT IN ('POOL', 'ORDER_BOOK') THEN
    RAISE EXCEPTION 'Choose Peer Pool or Order Book.' USING errcode = '22023';
  END IF;
  IF p_max_trade_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Trade limits are above the supported configuration range.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_instrument
  FROM market.instruments
  WHERE public_id = p_instrument_public_id
  FOR UPDATE;
  IF v_instrument.id IS NULL THEN
    RAISE EXCEPTION 'Market instrument not found.' USING errcode = 'P0002';
  END IF;
  IF v_instrument.status <> 'DRAFT' THEN
    RAISE EXCEPTION 'Trade limits can only be set before market publication.' USING errcode = 'P0001';
  END IF;
  IF v_instrument.liquidity_model <> v_model THEN
    RAISE EXCEPTION 'The selected trading method does not match this market.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_defaults
  FROM market.trading_risk_policy_defaults
  WHERE asset_id = v_instrument.asset_id AND enabled = true;
  IF v_defaults.asset_id IS NULL THEN
    RAISE EXCEPTION 'No active trading risk policy is configured for this market asset.' USING errcode = '23514';
  END IF;
  IF v_model = 'POOL' AND p_max_trade_amount > v_defaults.pool_max_entry_stake THEN
    RAISE EXCEPTION 'The market maximum exceeds the configured Peer Pool entry limit of % for this currency.', v_defaults.pool_max_entry_stake USING errcode = '22023';
  END IF;
  IF v_model = 'ORDER_BOOK' AND p_max_trade_amount > v_defaults.order_max_order_notional THEN
    RAISE EXCEPTION 'The market maximum exceeds the configured Order Book order limit of % for this currency.', v_defaults.order_max_order_notional USING errcode = '22023';
  END IF;

  SELECT * INTO v_policy
  FROM market.instrument_trading_risk_policies
  WHERE instrument_id = v_instrument.id;
  IF v_policy.instrument_id IS NULL THEN
    RAISE EXCEPTION 'The market risk policy is missing; limits were not applied.' USING errcode = '23514';
  END IF;
  -- These policy rows are intentionally immutable. The market maximum must already
  -- be present from the INSERT-time snapshot; this function only records the minimum.
  IF v_model = 'POOL' AND v_policy.pool_max_entry_stake <> p_max_trade_amount THEN
    RAISE EXCEPTION 'The market risk snapshot does not contain the requested Peer Pool maximum. Recreate the draft after refreshing market configuration.' USING errcode = '23514';
  END IF;
  IF v_model = 'ORDER_BOOK' AND v_policy.order_max_order_notional <> p_max_trade_amount THEN
    RAISE EXCEPTION 'The market risk snapshot does not contain the requested Order Book maximum. Recreate the draft after refreshing market configuration.' USING errcode = '23514';
  END IF;

  UPDATE market.instruments
  SET min_order_notional = p_min_trade_amount,
      updated_at = statement_timestamp()
  WHERE id = v_instrument.id;

  INSERT INTO audit.records(actor_user_id, actor_type, action, resource_type, resource_id, reason, metadata)
  VALUES (
    auth.uid(), 'ADMIN', 'MARKET_TRADE_LIMITS_CONFIGURED', 'MARKET_INSTRUMENT', v_instrument.public_id::text,
    'Configured market-specific minimum and maximum trade amounts before publication',
    jsonb_build_object(
      'asset_id', v_instrument.asset_id,
      'liquidity_model', v_model,
      'min_trade_amount', p_min_trade_amount,
      'max_trade_amount', p_max_trade_amount,
      'policy_version', v_policy.policy_version
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_create_guided_market_v5(
  p_title text,
  p_description text,
  p_category text,
  p_market_setup jsonb,
  p_opens_at timestamp with time zone,
  p_closes_at timestamp with time zone,
  p_resolves_after timestamp with time zone,
  p_country_code text,
  p_asset_code text,
  p_liquidity_model text,
  p_min_trade_amount numeric,
  p_max_trade_amount numeric,
  p_publish_now boolean DEFAULT false,
  p_feature_rank integer DEFAULT 100,
  p_publication_reason text DEFAULT 'Published during guided market creation with explicit trade limits'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_result jsonb;
  v_id uuid;
  v_asset_id bigint;
  v_defaults market.trading_risk_policy_defaults;
  v_model text := upper(btrim(coalesce(p_liquidity_model, '')));
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_permission('markets.manage') THEN
    RAISE EXCEPTION 'Market management permission required' USING errcode = '42501';
  END IF;
  IF v_model NOT IN ('POOL', 'ORDER_BOOK') THEN
    RAISE EXCEPTION 'Choose Peer Pool or Order Book.' USING errcode = '22023';
  END IF;
  IF p_min_trade_amount IS NULL OR p_max_trade_amount IS NULL
     OR p_min_trade_amount <= 0 OR p_max_trade_amount <= p_min_trade_amount
     OR p_max_trade_amount > 1000000000000 THEN
    RAISE EXCEPTION 'Set a positive minimum and a larger maximum within the supported range.' USING errcode = '22023';
  END IF;

  SELECT a.id INTO v_asset_id
  FROM public.assets a
  WHERE upper(a.code) = upper(btrim(coalesce(p_asset_code, '')))
    AND a.status = 'ACTIVE';
  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'Selected market currency is unavailable.' USING errcode = 'P0002';
  END IF;

  SELECT * INTO v_defaults
  FROM market.trading_risk_policy_defaults
  WHERE asset_id = v_asset_id AND enabled = true;
  IF v_defaults.asset_id IS NULL THEN
    RAISE EXCEPTION 'No active trading risk policy is configured for this market asset.' USING errcode = '23514';
  END IF;
  IF v_model = 'POOL' AND p_max_trade_amount > v_defaults.pool_max_entry_stake THEN
    RAISE EXCEPTION 'The market maximum exceeds the configured Peer Pool entry limit of % for this currency.', v_defaults.pool_max_entry_stake USING errcode = '22023';
  END IF;
  IF v_model = 'ORDER_BOOK' AND p_max_trade_amount > v_defaults.order_max_order_notional THEN
    RAISE EXCEPTION 'The market maximum exceeds the configured Order Book order limit of % for this currency.', v_defaults.order_max_order_notional USING errcode = '22023';
  END IF;

  -- These transaction-local values are read by the instrument INSERT trigger.
  -- The new snapshot is inserted once with its market-specific cap. Never mutate it.
  PERFORM set_config('vad.market_trade_limits_model', v_model, true);
  PERFORM set_config('vad.market_trade_limits_max', p_max_trade_amount::text, true);

  v_result := public.admin_create_guided_market_v4(
    p_title, p_description, p_category, p_market_setup, p_opens_at, p_closes_at, p_resolves_after,
    p_country_code, p_asset_code, v_model, false
  );

  PERFORM set_config('vad.market_trade_limits_model', '', true);
  PERFORM set_config('vad.market_trade_limits_max', '', true);

  v_id := nullif(v_result->>'instrument_id', '')::uuid;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'The guided market was created without a usable instrument ID.' USING errcode = 'P0001';
  END IF;
  PERFORM private.apply_market_trade_limits(v_id, p_min_trade_amount, p_max_trade_amount, v_model);

  IF coalesce(p_publish_now, false) THEN
    IF p_opens_at > statement_timestamp() OR p_closes_at <= statement_timestamp() THEN
      RAISE EXCEPTION 'Publish now requires an open window that has started and has not closed.' USING errcode = '22023';
    END IF;
    PERFORM public.admin_publish_market(v_id, coalesce(p_feature_rank, 100), coalesce(nullif(btrim(coalesce(p_publication_reason, '')), ''), 'Published during creation with explicit trade limits'));
    v_result := v_result || jsonb_build_object('publication_status', 'PUBLISHED');
  ELSE
    v_result := v_result || jsonb_build_object('publication_status', 'DRAFT');
  END IF;

  RETURN v_result || jsonb_build_object(
    'min_trade_amount', p_min_trade_amount,
    'max_trade_amount', p_max_trade_amount,
    'liquidity_model', v_model
  );
END;
$function$;
