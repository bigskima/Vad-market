-- Every category-aware public-record market is processed by the shared
-- automatic resolver; provider failures do not route contradictory outcomes
-- or unresolved events into automatic payout.
BEGIN;

DO $test$
DECLARE
  v_due text := pg_get_functiondef('public.internal_market_resolution_due_events(integer)'::regprocedure);
  v_finalizer text := pg_get_functiondef('oracle.finalize_due_automatic_resolutions(integer)'::regprocedure);
  v_route text := pg_get_functiondef('private.route_stalled_sports_markets_to_ai_resolution()'::regprocedure);
BEGIN
  IF position('VAD_REVIEW_V1' IN v_due) = 0
     OR position('AI_EVIDENCE_RULE_V1' IN v_due) = 0 THEN
    RAISE EXCEPTION 'The shared automatic resolver must claim both generic public-evidence resolver types';
  END IF;

  IF position('category' IN lower(v_due)) > 0
     AND position('category =' IN lower(v_due)) > 0 THEN
    RAISE EXCEPTION 'The generic automatic resolver must not be restricted to one market category';
  END IF;

  IF position('PUBLIC_RECORD' IN v_route) = 0
     OR position('TAVILY' IN v_route) = 0
     OR position('oracle.disputes' IN v_route) = 0
     OR position('oracle.observations' IN v_route) = 0 THEN
    RAISE EXCEPTION 'Sports fallback must use public-record evidence and protect disputes/conflicting observations';
  END IF;

  IF position('AI_EVIDENCE_RULE_V1' IN pg_get_functiondef('public.internal_oracle_due_events(uuid,integer)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Deterministic oracle ingestion must exclude AI_EVIDENCE_RULE_V1 from its own adapter queue';
  END IF;

  IF position('AI_EVIDENCE_POLICY_V1' IN v_finalizer) = 0
     OR position('AUTO_AFTER_DISPUTE_WINDOW' IN v_finalizer) = 0 THEN
    RAISE EXCEPTION 'Automatic public-evidence outcomes must pass through the automatic finalizer and dispute window';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM oracle.policies p
    WHERE p.name = 'VAD Generic Evidence Gateway Policy'
      AND p.status = 'ACTIVE'
      AND p.approved_by IS NOT NULL
      AND p.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"PUBLIC_RECORD"},{"role":"CORROBORATING","provider_code":"TAVILY"}]'::jsonb
      AND p.void_rule->>'mode' = 'EQUAL_SPLIT'
  ) THEN
    RAISE EXCEPTION 'An approved generic PUBLIC_RECORD + TAVILY production policy is required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='vad-ai-market-resolution' AND active)
     OR NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='vad-finalize-oracle-resolutions' AND active)
     OR NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='vad-settle-finalized-markets' AND active)
     OR NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='vad-route-stalled-sports-to-ai-resolution' AND active) THEN
    RAISE EXCEPTION 'Automatic resolution, finalization, settlement and sports fallback schedulers must remain active';
  END IF;
END;
$test$;

ROLLBACK;
