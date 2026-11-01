-- VAD market trading must not require a fresh GPS/device-location check.
-- Preserve account-country eligibility, jurisdiction asset enablement, capability,
-- test-credit isolation, market risk and account status. Payment and transfer
-- location verification intentionally remain unchanged.

CREATE OR REPLACE FUNCTION private.trade_access_satisfies(
  p_user_id uuid,
  p_country_code text,
  p_asset_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_policy_enabled boolean := false;
  v_sandbox_only boolean := false;
  v_asset_code text;
BEGIN
  IF p_user_id IS NULL OR p_asset_id IS NULL THEN
    RETURN false;
  END IF;
  IF NOT private.service_available('trading', p_user_id) THEN
    RETURN false;
  END IF;
  IF NOT private.asset_available_in_country(p_country_code, p_asset_id) THEN
    RETURN false;
  END IF;

  SELECT a.code, lower(coalesce(a.metadata->>'sandbox_only', 'false')) = 'true'
    INTO v_asset_code, v_sandbox_only
  FROM public.assets a
  WHERE a.id = p_asset_id AND a.status = 'ACTIVE';

  -- NGN remains restricted to Nigerian accounts and configured NGN jurisdiction
  -- availability, but trading no longer requires a device or network location receipt.
  IF v_asset_code = 'NGN' AND p_country_code IS DISTINCT FROM 'NG' THEN
    RETURN false;
  END IF;

  -- Sandbox isolation takes precedence over general country capability rules.
  IF coalesce(v_sandbox_only, false) THEN
    RETURN private.tester_access_satisfies(p_user_id, 'SANDBOX');
  END IF;

  SELECT coalesce((
    SELECT cr.enabled
    FROM public.capability_rules cr
    WHERE cr.capability_key = 'trade'
      AND cr.country_code = p_country_code
      AND cr.status = 'ACTIVE'
      AND cr.effective_at <= statement_timestamp()
      AND (cr.expires_at IS NULL OR cr.expires_at > statement_timestamp())
    ORDER BY cr.version DESC
    LIMIT 1
  ), false)
  INTO v_policy_enabled;

  IF v_policy_enabled THEN
    RETURN true;
  END IF;
  RETURN private.tester_access_satisfies(p_user_id, 'PRODUCTION');
END;
$function$;

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
    IF p_account_country_code IS DISTINCT FROM 'NG' THEN
      RAISE EXCEPTION 'NGN market trading is only available to eligible Nigerian accounts.'
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
    -- Retain the existing narrow temporary test-credit exception for NGN
    -- Order Book, but do not couple it to a GPS or IP location check.
    IF NOT (
      v_asset_code = 'NGN'
      AND p_account_country_code = 'NG'
      AND v_test_credit_active
      AND v_test_mode_enabled
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

CREATE OR REPLACE FUNCTION public.my_temporary_ngn_market_testing_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_grant public.temporary_ngn_test_credit_grants%rowtype;
  v_asset_id bigint;
  v_asset_status text;
  v_country text;
  v_account_status text;
  v_mode_enabled boolean := false;
  v_service_available boolean := false;
  v_asset_available boolean := false;
  v_eligible boolean := false;
  v_reason text := 'NO_ACTIVE_TEST_CREDIT';
  v_available_id bigint;
  v_balance numeric(38,18) := 0;
  v_open_markets integer := 0;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING errcode = '28000';
  END IF;

  SELECT a.id, a.status INTO v_asset_id, v_asset_status
  FROM public.assets a WHERE a.code = 'NGN';

  SELECT ua.country_code, ua.status INTO v_country, v_account_status
  FROM public.user_accounts ua WHERE ua.user_id = v_user_id;

  SELECT * INTO v_grant
  FROM public.temporary_ngn_test_credit_grants g
  WHERE g.user_id = v_user_id AND g.asset_id = v_asset_id AND g.status = 'ACTIVE'
  ORDER BY g.created_at DESC LIMIT 1;

  SELECT coalesce(preference.enabled, false) INTO v_mode_enabled
  FROM public.temporary_ngn_market_testing_preferences preference
  WHERE preference.user_id = v_user_id;
  v_mode_enabled := coalesce(v_mode_enabled, false);

  IF v_grant.id IS NULL THEN
    RETURN jsonb_build_object(
      'active', false, 'eligible', false, 'testModeEnabled', false,
      'reasonCode', 'NO_ACTIVE_TEST_CREDIT',
      'message', 'No active temporary NGN test allocation is assigned to this account.'
    );
  END IF;

  v_service_available := coalesce(private.service_available('trading', v_user_id), false);
  v_asset_available := coalesce(private.asset_available_in_country(coalesce(v_country, ''), v_asset_id), false);
  v_eligible := v_account_status = 'ACTIVE'
    AND v_country = 'NG'
    AND v_asset_status = 'ACTIVE'
    AND v_service_available
    AND v_asset_available;

  v_reason := CASE
    WHEN v_account_status IS DISTINCT FROM 'ACTIVE' THEN 'ACCOUNT_NOT_ACTIVE'
    WHEN v_country IS DISTINCT FROM 'NG' THEN 'ACCOUNT_NOT_ELIGIBLE'
    WHEN v_asset_status IS DISTINCT FROM 'ACTIVE' THEN 'NGN_ASSET_UNAVAILABLE'
    WHEN NOT v_service_available THEN 'TRADING_SERVICE_UNAVAILABLE'
    WHEN NOT v_asset_available THEN 'NGN_NOT_AVAILABLE_IN_JURISDICTION'
    ELSE 'READY'
  END;

  SELECT la.id INTO v_available_id
  FROM finance.ledger_accounts la
  WHERE la.asset_id = v_asset_id
    AND la.owner_type = 'USER'
    AND la.owner_reference = v_user_id::text
    AND la.account_type = 'USER_AVAILABLE'
    AND la.status = 'ACTIVE';
  IF v_available_id IS NOT NULL THEN
    v_balance := finance.account_balance(v_available_id);
  END IF;

  SELECT count(*)::integer INTO v_open_markets
  FROM market.instruments i
  WHERE i.asset_id = v_asset_id
    AND i.status = 'OPEN'
    AND i.opened_at IS NOT NULL
    AND i.opened_at <= statement_timestamp()
    AND (i.closed_at IS NULL OR i.closed_at > statement_timestamp());

  RETURN jsonb_build_object(
    'active', true,
    'eligible', v_eligible,
    'testModeEnabled', v_mode_enabled,
    'reasonCode', v_reason,
    'grantId', v_grant.public_id,
    'assetCode', 'NGN',
    'grantAmount', v_grant.amount,
    'availableBalance', greatest(v_balance, 0),
    'createdAt', v_grant.created_at,
    'openMarketCount', v_open_markets,
    'withdrawalsBlocked', true,
    'depositsBlocked', true,
    'marketOrdersUseStandardSettlement', true,
    'message', CASE
      WHEN NOT v_eligible THEN 'Temporary NGN test credit is assigned, but the account, trading service or NGN jurisdiction is not eligible.'
      WHEN v_open_markets = 0 THEN 'Temporary NGN test credit is eligible, but there is currently no open NGN market.'
      WHEN v_mode_enabled THEN 'Temporary test credit is enabled for the standard NGN market order and settlement pipeline. Deposits and withdrawals remain blocked.'
      ELSE 'Temporary NGN test credit is available. Enable market testing to use it in the standard NGN market order and settlement pipeline.'
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_my_temporary_ngn_market_testing(p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_grant public.temporary_ngn_test_credit_grants%rowtype;
  v_asset_id bigint;
  v_account_status text;
  v_country text;
  v_service_available boolean := false;
  v_asset_available boolean := false;
  v_previous boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING errcode = '28000';
  END IF;
  IF p_enabled IS NULL THEN
    RAISE EXCEPTION 'Choose whether temporary NGN market testing should be enabled.' USING errcode = '22023';
  END IF;

  SELECT id INTO v_asset_id
  FROM public.assets WHERE code = 'NGN' AND status = 'ACTIVE';
  IF v_asset_id IS NULL THEN
    RAISE EXCEPTION 'The NGN asset is unavailable.' USING errcode = '42501';
  END IF;

  SELECT ua.status, ua.country_code INTO v_account_status, v_country
  FROM public.user_accounts ua WHERE ua.user_id = v_user_id;

  SELECT * INTO v_grant
  FROM public.temporary_ngn_test_credit_grants g
  WHERE g.user_id = v_user_id AND g.asset_id = v_asset_id AND g.status = 'ACTIVE'
  ORDER BY g.created_at DESC LIMIT 1
  FOR UPDATE;
  IF v_grant.id IS NULL THEN
    RAISE EXCEPTION 'An active temporary NGN test allocation is required before enabling market testing.'
      USING errcode = '42501';
  END IF;

  SELECT coalesce(preference.enabled, false) INTO v_previous
  FROM public.temporary_ngn_market_testing_preferences preference
  WHERE preference.user_id = v_user_id;
  v_previous := coalesce(v_previous, false);

  IF p_enabled THEN
    IF v_account_status IS DISTINCT FROM 'ACTIVE' THEN
      RAISE EXCEPTION 'An active VAD account is required for NGN market testing.' USING errcode = '42501';
    END IF;
    IF v_country IS DISTINCT FROM 'NG' THEN
      RAISE EXCEPTION 'Temporary NGN market testing is only available to eligible Nigerian accounts.' USING errcode = '42501';
    END IF;

    v_service_available := coalesce(private.service_available('trading', v_user_id), false);
    IF NOT v_service_available THEN
      RAISE EXCEPTION 'The trading service is currently unavailable for this account.' USING errcode = '42501';
    END IF;
    v_asset_available := coalesce(private.asset_available_in_country(v_country, v_asset_id), false);
    IF NOT v_asset_available THEN
      RAISE EXCEPTION 'NGN is not currently available under this account''s jurisdiction policy.' USING errcode = '42501';
    END IF;
  END IF;

  INSERT INTO public.temporary_ngn_market_testing_preferences(user_id, enabled, updated_at)
  VALUES (v_user_id, p_enabled, statement_timestamp())
  ON CONFLICT (user_id) DO UPDATE
  SET enabled = excluded.enabled, updated_at = statement_timestamp();

  IF v_previous IS DISTINCT FROM p_enabled THEN
    INSERT INTO audit.records(
      actor_user_id, actor_type, action, resource_type, resource_id,
      before_state, after_state, reason, request_id, occurred_at, metadata
    ) VALUES (
      v_user_id, 'USER',
      CASE WHEN p_enabled THEN 'TEMPORARY_NGN_MARKET_TESTING_ENABLED' ELSE 'TEMPORARY_NGN_MARKET_TESTING_DISABLED' END,
      'TEMPORARY_NGN_MARKET_TESTING_PREFERENCE', v_user_id::text,
      jsonb_build_object('enabled', v_previous),
      jsonb_build_object('enabled', p_enabled, 'standard_settlement', true),
      CASE WHEN p_enabled THEN 'User opted in to the existing non-cash NGN test allocation for standard-market testing.'
           ELSE 'User opted out of temporary NGN market testing.' END,
      gen_random_uuid(), statement_timestamp(),
      jsonb_build_object('grant_id', v_grant.public_id, 'asset_code', 'NGN')
    );
  END IF;

  RETURN public.my_temporary_ngn_market_testing_status();
END;
$function$;

-- Existing pooled stake idempotency receipts are safe to replay without a
-- location check. The replay remains user-bound and does not move funds again.
DO $patch$
DECLARE
  v_definition text;
  v_needle text;
  v_updated text;
BEGIN
  SELECT pg_get_functiondef(
    'public.place_pool_stake_pre_market_limits(uuid,text,numeric,text)'::regprocedure
  ) INTO v_definition;

  v_needle := $needle$    if exists (
      select 1
      from market.instruments i
      join public.assets a on a.id = i.asset_id
      where i.id = existing.instrument_id and a.code = 'NGN'
    ) and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1), false) then
      raise exception 'NGN service requires current location verification' using errcode = '42501';
    end if;
$needle$;

  IF position(v_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected NGN location-gate block was not found in place_pool_stake_pre_market_limits; refusing to patch an unexpected function body.';
  END IF;

  v_updated := replace(v_definition, v_needle, '');
  EXECUTE v_updated;
END;
$patch$;

COMMENT ON FUNCTION private.trade_access_satisfies(uuid, text, bigint) IS
  'Market trade eligibility uses account country, enabled jurisdiction assets, trading capability and tester policy; no GPS/IP location check is required.';
COMMENT ON FUNCTION private.assert_market_trade_eligibility(bigint, uuid, text, bigint, boolean) IS
  'Shared eligibility gate for VAD Peer Pool and Order Book markets without per-trade GPS/IP verification; retains NGN account-country, test-credit and market-scope rules.';

COMMIT;
