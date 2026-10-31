-- The no-key public web search adapter must be a distinct, configured Oracle
-- source and may corroborate the public-record path for any generic category.
BEGIN;

DO $test$
DECLARE
  v_policy_source_hierarchy jsonb;
  v_validator text;
  v_provider_count integer;
  v_readiness jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM integration.providers
    WHERE code='PUBLIC_WEB_SEARCH'
      AND provider_type='ORACLE'
      AND environment='PRODUCTION'
      AND status='ACTIVE'
      AND capabilities @> '["PUBLIC_RECORD_EVIDENCE"]'::jsonb
      AND public_metadata->>'adapter'='PUBLIC_WEB_SEARCH_V1'
      AND public_metadata->>'credential_mode'='NONE'
      AND secret_reference IS NULL
  ) THEN
    RAISE EXCEPTION 'Public keyless search provider is not registered with the expected Oracle capability';
  END IF;

  SELECT p.source_hierarchy INTO v_policy_source_hierarchy
  FROM oracle.policies p
  WHERE p.name='VAD Generic Evidence Gateway Policy'
    AND p.status='DRAFT'
    AND p.approved_by IS NULL
  ORDER BY p.version DESC
  LIMIT 1;

  IF v_policy_source_hierarchy IS NULL
     OR NOT v_policy_source_hierarchy @> '[{"role":"PRIMARY","provider_code":"PUBLIC_RECORD"}]'::jsonb
     OR NOT v_policy_source_hierarchy @> '[{"role":"CORROBORATING","provider_code":"PUBLIC_WEB_SEARCH"}]'::jsonb THEN
    RAISE EXCEPTION 'A pending generic policy draft must include PUBLIC_RECORD and PUBLIC_WEB_SEARCH corroboration without modifying the approved policy: %',v_policy_source_hierarchy;
  END IF;

  v_validator := pg_get_functiondef(
    'private.validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  );

  IF position('PUBLIC_WEB_SEARCH' IN v_validator)=0 THEN
    RAISE EXCEPTION 'Automatic resolver readiness must recognise the keyless corroborating provider';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM oracle.policies p
    WHERE p.name='VAD Generic Evidence Gateway Policy'
      AND p.status='ACTIVE'
      AND p.approved_by IS NOT NULL
      AND p.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"PUBLIC_RECORD"}]'::jsonb
      AND p.source_hierarchy @> '[{"role":"CORROBORATING","provider_code":"TAVILY"}]'::jsonb
      AND NOT p.source_hierarchy @> '[{"role":"CORROBORATING","provider_code":"PUBLIC_WEB_SEARCH"}]'::jsonb
  ) THEN
    RAISE EXCEPTION 'The existing approved policy must remain immutable while the new provider awaits separate review';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='oracle.policies'::regclass
      AND tgname='vad_generic_search_policy_activation_rebind'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Approved policy activation must automatically rebind existing generic markets';
  END IF;

  v_readiness := private.validate_oracle_resolution_scope(
    jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'resolution_instructions','Use the official result for this public event, and confirm it from a separate reputable public publisher.',
      'category','TECHNOLOGY'
    ),
    statement_timestamp()+interval '1 minute',
    statement_timestamp()+interval '2 minutes'
  );

  IF coalesce((v_readiness->>'valid')::boolean,false) IS NOT TRUE
     OR coalesce((v_readiness->>'autoPublishReady')::boolean,false) IS NOT TRUE
     OR v_readiness->>'resolutionMode'<>'AUTOMATIC' THEN
    RAISE EXCEPTION 'Generic technology event should be ready for automatic evidence resolution: %',v_readiness;
  END IF;
END;
$test$;

ROLLBACK;
