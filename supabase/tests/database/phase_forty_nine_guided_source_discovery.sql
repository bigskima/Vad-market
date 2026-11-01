-- Guided transfer, election and objective markets must use the shared automatic
-- evidence resolver without mandatory source names/URLs or manual-review fallback.
BEGIN;

DO $test$
DECLARE
  v_guided text := pg_get_functiondef(
    'public.admin_create_guided_market(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  );
  v_catalog text := pg_get_functiondef(
    'public.admin_create_catalog_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  );
  v_validator text := pg_get_functiondef(
    'private.validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  );
  v_readiness jsonb;
BEGIN
  IF position('Add the official result source VAD should use to verify this match.' IN v_guided)>0
     OR position('Add the official source VAD should use to verify the transfer.' IN v_guided)>0
     OR position('Add the official election result source VAD should use.' IN v_guided)>0
     OR position('Add the authoritative result source VAD should use.' IN v_guided)>0 THEN
    RAISE EXCEPTION 'Guided automatic evidence markets still require a pre-entered source name';
  END IF;

  IF position('Automatic public-source discovery' IN v_guided)=0
     OR position('Automatic public-source discovery' IN v_catalog)=0 THEN
    RAISE EXCEPTION 'Guided and catalog markets must default to public-source discovery';
  END IF;

  IF position('MANUAL_REVIEW_REQUIRED' IN v_validator)>0 THEN
    RAISE EXCEPTION 'The shared event validator must not downgrade the generic resolver to manual-only';
  END IF;

  v_readiness := private.validate_oracle_resolution_scope(
    jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'event_type','PLAYER_TRANSFER',
      'condition','Resolve YES if the named player officially joins the destination club by the published deadline; otherwise NO.',
      'subject',jsonb_build_object('player','Example Player','destination_club','Example FC')
    ),
    statement_timestamp()+interval '1 minute',
    statement_timestamp()+interval '2 minutes'
  );

  IF coalesce((v_readiness->>'valid')::boolean,false) IS NOT TRUE
     OR coalesce((v_readiness->>'autoPublishReady')::boolean,false) IS NOT TRUE
     OR v_readiness->>'resolutionMode'<>'AUTOMATIC' THEN
    RAISE EXCEPTION 'A guided transfer contract without source URLs must be eligible for automatic evidence discovery: %',v_readiness;
  END IF;
END;
$test$;

ROLLBACK;
