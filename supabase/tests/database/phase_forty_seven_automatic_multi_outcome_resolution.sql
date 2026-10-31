-- Generic categories and multi-outcome markets must resolve through the
-- shared automatic public-evidence lifecycle; they must not be assigned to a
-- manual-review settlement path.
BEGIN;

DO $test$
DECLARE
  v_scope jsonb := jsonb_build_object(
    'resolver_type','VAD_REVIEW_V1',
    'market_format','MULTI_OUTCOME',
    'resolution_instructions','Select the candidate explicitly named in the official published award result for the 2026 ceremony. If the award is cancelled, follow the published cancellation rule.',
    'source_name','Automatic public-source discovery',
    'outcome_options',jsonb_build_array(
      jsonb_build_object('code','CANDIDATE_A','label','Candidate A','displayOrder',0),
      jsonb_build_object('code','CANDIDATE_B','label','Candidate B','displayOrder',1),
      jsonb_build_object('code','CANDIDATE_C','label','Candidate C','displayOrder',2)
    )
  );
  v_readiness jsonb;
  v_admin_readiness jsonb;
  v_validator text;
  v_admin_validator text;
  v_v1 text;
  v_v2 text;
  v_guided text;
  v_catalog text;
  v_source_trigger text;
  v_ai_count integer;
BEGIN
  v_readiness := private.validate_oracle_resolution_scope(
    v_scope,
    statement_timestamp() + interval '1 minute',
    statement_timestamp() + interval '2 minutes'
  );

  IF coalesce((v_readiness->>'valid')::boolean,false) IS NOT TRUE
     OR coalesce((v_readiness->>'autoPublishReady')::boolean,false) IS NOT TRUE
     OR v_readiness->>'resolutionMode' <> 'AUTOMATIC'
     OR coalesce((v_readiness->>'requiredIndependentAiModels')::integer,0) <> 2
     OR coalesce((v_readiness->>'requiredIndependentOracleProviders')::integer,0) <> 2 THEN
    RAISE EXCEPTION 'Multi-outcome VAD_REVIEW_V1 scope without a source URL must be eligible for the shared automatic resolver: %',v_readiness;
  END IF;

  v_admin_readiness := public.admin_validate_oracle_resolution_scope(
    v_scope,
    statement_timestamp() + interval '1 minute',
    statement_timestamp() + interval '2 minutes'
  );

  IF coalesce((v_admin_readiness->>'valid')::boolean,false) IS NOT TRUE
     OR coalesce((v_admin_readiness->>'autoPublishReady')::boolean,false) IS NOT TRUE
     OR v_admin_readiness->>'resolutionMode' <> 'AUTOMATIC'
     OR v_admin_readiness->>'marketFormat' <> 'MULTI_OUTCOME'
     OR coalesce((v_admin_readiness->>'outcomeCount')::integer,0) <> 3 THEN
    RAISE EXCEPTION 'Admin multi-outcome validation must agree with the shared automatic resolver: %',v_admin_readiness;
  END IF;

  v_validator := pg_get_functiondef(
    'private.validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  );
  v_admin_validator := pg_get_functiondef(
    'public.admin_validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  );
  v_v1 := pg_get_functiondef(
    'public.admin_create_multi_outcome_market_v1(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  );
  v_v2 := pg_get_functiondef(
    'public.admin_create_multi_outcome_market_v2(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,numeric,numeric,boolean,integer,text)'::regprocedure
  );
  v_guided := pg_get_functiondef(
    'public.admin_create_guided_market(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  );
  v_catalog := pg_get_functiondef(
    'public.admin_create_catalog_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  );
  v_source_trigger := pg_get_functiondef(
    'private.require_vad_auto_resolution_source_url()'::regprocedure
  );

  IF position('MANUAL_REVIEW_REQUIRED' IN v_admin_validator)>0
     OR position('authorized Oracle reviewer must verify' IN v_admin_validator)>0 THEN
    RAISE EXCEPTION 'Admin validation still marks multi-outcome settlement as manual-only';
  END IF;

  IF position('Manual VAD review against' IN v_v1)>0
     OR position('resolution_mode'', ''AUTOMATIC_EVIDENCE' IN v_v1)=0 THEN
    RAISE EXCEPTION 'Multi-outcome creation still advertises a manual resolution mode';
  END IF;

  IF position('Automatic multi-outcome resolution requires an authoritative HTTPS source URL' IN v_v2)>0
     OR position('p_source_url' IN v_v2)=0 THEN
    RAISE EXCEPTION 'Multi-outcome create-v2 still requires a preconfigured source URL';
  END IF;

  IF position('Automatic checking is not enabled for this market type yet' IN v_guided)>0
     OR position('Choose Verified result to continue' IN v_guided)>0 THEN
    RAISE EXCEPTION 'Guided market creation still blocks automatic public-evidence resolution';
  END IF;

  IF position('v_source_name:=''Automatic public-source discovery''' IN v_catalog)=0 THEN
    RAISE EXCEPTION 'Catalog market creation must default to source discovery when the admin does not supply a source name';
  END IF;

  IF position('Automatic evidence resolution requires an authoritative HTTPS URL' IN v_source_trigger)>0 THEN
    RAISE EXCEPTION 'The source trigger must allow source discovery without a pre-entered URL';
  END IF;

  -- Two free production model runtimes and both independently configured
  -- public-evidence providers are a real readiness prerequisite, not a bypass.
  SELECT count(*)::integer INTO v_ai_count
  FROM ai.providers ap
  JOIN integration.providers ip ON ip.id=ap.integration_provider_id
  WHERE ap.status='ACTIVE'
    AND ap.capabilities @> '["MARKET_RESOLUTION"]'::jsonb
    AND ap.cost_policy->>'billing_mode'='FREE_ONLY'
    AND ip.provider_type='AI'
    AND ip.environment='PRODUCTION'
    AND ip.status IN ('ACTIVE','DEGRADED');
  IF v_ai_count<2 THEN
    RAISE EXCEPTION 'Automatic public-evidence publication must require two free AI runtimes (current count=%)',v_ai_count;
  END IF;
END;
$test$;

ROLLBACK;
