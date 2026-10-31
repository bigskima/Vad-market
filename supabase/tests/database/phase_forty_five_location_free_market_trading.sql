-- Market trades must not depend on a fresh GPS or IP geolocation verification.
-- NGN account-country/jurisdiction policy and payment/transfer controls remain.
BEGIN;

DO $test$
DECLARE
  v_trade_access text := pg_get_functiondef('private.trade_access_satisfies(uuid,text,bigint)'::regprocedure);
  v_eligibility text := pg_get_functiondef('private.assert_market_trade_eligibility(bigint,uuid,text,bigint,boolean)'::regprocedure);
  v_pool_commit text := pg_get_functiondef('public.place_pool_stake_pre_market_limits(uuid,text,numeric,text)'::regprocedure);
  v_test_status text := pg_get_functiondef('public.my_temporary_ngn_market_testing_status()'::regprocedure);
  v_test_toggle text := pg_get_functiondef('public.set_my_temporary_ngn_market_testing(boolean)'::regprocedure);
  v_payment text := pg_get_functiondef('public.create_payment_intent(text,text,numeric,text)'::regprocedure);
  v_transfer text := pg_get_functiondef('public.transfer_asset_to_email(text,text,numeric,uuid)'::regprocedure);
BEGIN
  IF position('user_location_verifications' IN v_trade_access) > 0
     OR position('can_access_ngn_services' IN v_trade_access) > 0 THEN
    RAISE EXCEPTION 'Market trade access must not read GPS/IP verification state';
  END IF;

  IF position('can_access_ngn_services' IN v_eligibility) > 0
     OR position('location verification' IN lower(v_eligibility)) > 0 THEN
    RAISE EXCEPTION 'Shared market trade eligibility must not require a location check';
  END IF;

  IF position('can_access_ngn_services' IN v_pool_commit) > 0
     OR position('user_location_verifications' IN v_pool_commit) > 0 THEN
    RAISE EXCEPTION 'Peer Pool idempotent commits must not reintroduce a location gate';
  END IF;

  IF position('can_access_ngn_services' IN v_test_status) > 0
     OR position('user_location_verifications' IN v_test_status) > 0 THEN
    RAISE EXCEPTION 'Temporary NGN test-credit status must not be blocked by GPS/IP verification';
  END IF;

  IF position('can_access_ngn_services' IN v_test_toggle) > 0
     OR position('user_location_verifications' IN v_test_toggle) > 0 THEN
    RAISE EXCEPTION 'Temporary NGN test-mode toggle must not require GPS/IP verification';
  END IF;

  IF position('p_account_country_code' IN v_eligibility) = 0
     OR position('asset_available_in_country' IN v_trade_access) = 0
     OR position('service_available' IN v_trade_access) = 0 THEN
    RAISE EXCEPTION 'Removing GPS must retain account country, jurisdiction asset and trading-service eligibility';
  END IF;

  IF position('can_access_ngn_services' IN v_payment) = 0
     OR position('can_access_ngn_services' IN v_transfer) = 0 THEN
    RAISE EXCEPTION 'NGN payment and transfer location controls must remain unchanged';
  END IF;
END;
$test$;

ROLLBACK;
