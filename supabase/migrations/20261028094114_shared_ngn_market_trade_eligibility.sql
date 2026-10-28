-- Use one server-side NGN eligibility decision for Peer Pool and Order Book.
-- Temporary test-credit access is narrowly scoped: a current successful Nigeria
-- location check remains mandatory, test mode must be enabled, and the market is
-- isolated to eligible test-credit activity. This does not enable cash NGN trading.

CREATE OR REPLACE FUNCTION private.assert_market_trade_eligibility(
  p_instrument_id bigint,
  p_user_id uuid,
  p_account_country_code text,
  p_asset_id bigint,
  p_create_lock boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_asset_code text;
  v_location_allowed boolean := false;
  v_location_reason text;
  v_test_credit_active boolean := false;
  v_test_mode_enabled boolean := false;
  v_trade_allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Authentication is required to check trading eligibility.'
      USING errcode = '42501';
  END IF;

  IF p_instrument_id IS NULL OR p_asset_id IS NULL THEN
    RAISE EXCEPTION 'A market and currency are required to check trading eligibility.'
      USING errcode = '22023';
  END IF;

  SELECT a.code INTO v_asset_code
  FROM public.assets a
  WHERE a.id = p_asset_id AND a.status = 'ACTIVE';

  IF v_asset_code IS NULL THEN
    RAISE EXCEPTION 'Selected market currency is unavailable.'
      USING errcode = 'P0002';
  END IF;

  IF v_asset_code = 'NGN' THEN
    -- This is the single NGN location gate for both market formats. It checks
    -- account country, verified GPS country, network country, expiry and risk.
    SELECT c.allowed, c.reason_code
    INTO v_location_allowed, v_location_reason
    FROM public.can_access_ngn_services() c
    LIMIT 1;

    IF NOT coalesce(v_location_allowed, false) THEN
      RAISE EXCEPTION
        'NGN service requires current location verification (%). Verify your current location and try again.',
        coalesce(v_location_reason, 'LOCATION_CHECK_REQUIRED')
        USING errcode = '42501';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.temporary_ngn_test_credit_grants g
      WHERE g.user_id = p_user_id
        AND g.asset_id = p_asset_id
        AND g.status = 'ACTIVE'
    ) INTO v_test_credit_active;

    SELECT coalesce((
      SELECT preference.enabled
      FROM public.temporary_ngn_market_testing_preferences preference
      WHERE preference.user_id = p_user_id
    ), false) INTO v_test_mode_enabled;

    IF v_test_credit_active AND NOT v_test_mode_enabled THEN
      RAISE EXCEPTION
        'Enable temporary NGN market testing from Account before placing test trades.'
        USING errcode = '42501';
    END IF;
  END IF;

  v_trade_allowed := private.trade_access_satisfies(
    p_user_id, p_account_country_code, p_asset_id
  );

  IF NOT v_trade_allowed THEN
    -- Match Peer Pool's existing narrow test-credit exception for Order Book,
    -- but only after the common NGN location gate above has passed.
    IF NOT (
      v_asset_code = 'NGN'
      AND v_test_credit_active
      AND private.service_available('trading', p_user_id)
      AND private.asset_available_in_country(p_account_country_code, p_asset_id)
    ) THEN
      RAISE EXCEPTION
        'Trading is not available for this account and market. Check account eligibility and market capability.'
        USING errcode = 'P0001';
    END IF;
  END IF;

  IF v_asset_code = 'NGN' THEN
    PERFORM private.assert_temporary_ngn_market_scope(
      p_instrument_id, p_user_id, p_asset_id, coalesce(p_create_lock, false)
    );
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION private.assert_market_trade_eligibility(bigint, uuid, text, bigint, boolean)
  FROM PUBLIC, anon, authenticated;

DO $migration$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  -- Order-book quote: shared location + capability/test-credit gate; no market lock on preview.
  v_definition := pg_get_functiondef(
    'public.trade_quote(uuid,text,text,numeric,numeric)'::regprocedure
  );
  v_old := $old$  if not private.trade_access_satisfies(auth.uid(), acct.country_code, instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode = 'P0001';
  end if;$old$;
  v_new := $new$  perform private.assert_market_trade_eligibility(
    instrument.id, auth.uid(), acct.country_code, instrument.asset_id, false
  );$new$;
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Could not patch trade_quote eligibility block.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- Order-book placement: same gate, with the temporary-credit market lock acquired transactionally.
  v_definition := pg_get_functiondef(
    'public.place_order(bigint,bigint,text,numeric,numeric,text)'::regprocedure
  );
  v_old := $old$  if not private.trade_access_satisfies(auth.uid(),v_account.country_code,v_instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode='P0001';
  end if;$old$;
  v_new := $new$  perform private.assert_market_trade_eligibility(
    v_instrument.id, auth.uid(), v_account.country_code, v_instrument.asset_id, true
  );$new$;
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Could not patch place_order eligibility block.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- Peer Pool quote now uses the same location/capability helper as Order Book.
  v_definition := pg_get_functiondef(
    'public.pool_quote(uuid,text,numeric)'::regprocedure
  );
  v_old := $old$
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
  perform private.assert_temporary_ngn_market_scope(instrument.id, auth.uid(), instrument.asset_id, false);$old$;
  v_new := $new$
  perform private.assert_market_trade_eligibility(
    instrument.id, auth.uid(), acct.country_code, instrument.asset_id, false
  );$new$;
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Could not patch pool_quote eligibility block.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);

  -- Peer Pool commit shares the exact gate; its existing grant row lock remains in place.
  -- The existing scope(lock=true) call later in the function keeps the pool/wallet lock order.
  v_definition := pg_get_functiondef(
    'public.place_pool_stake_pre_market_limits(uuid,text,numeric,text)'::regprocedure
  );
  v_old := $old$
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
  end if;$old$;
  v_new := $new$
  perform private.assert_market_trade_eligibility(
    instrument.id, auth.uid(), acct.country_code, instrument.asset_id, false
  );$new$;
  IF strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Could not patch place_pool_stake_pre_market_limits eligibility block.';
  END IF;
  EXECUTE replace(v_definition, v_old, v_new);
END;
$migration$;
