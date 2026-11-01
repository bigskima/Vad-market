-- Route completed sports markets to the category-agnostic public-record
-- resolver only when a primary result exists, corroborating source(s) remain
-- unavailable, and no provider disagreement or active dispute exists.
-- Two independent AI models and two evidence paths remain mandatory.

CREATE OR REPLACE FUNCTION private.route_stalled_sports_markets_to_ai_resolution()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_event record;
  v_scope jsonb;
  v_routed integer := 0;
BEGIN
  FOR v_event IN
    SELECT
      e.id,
      e.public_id,
      e.title,
      e.category,
      e.resolution_scope,
      p.id AS policy_id,
      p.public_id AS policy_public_id,
      p.source_hierarchy
    FROM market.canonical_events e
    JOIN oracle.event_policy_bindings b ON b.event_id = e.id
    JOIN oracle.policies p ON p.id = b.oracle_policy_id AND p.status = 'ACTIVE'
    WHERE e.status = 'AWAITING_ORACLE'
      AND upper(coalesce(e.category, '')) = 'SPORTS'
      AND upper(coalesce(e.resolution_scope->>'resolver_type', '')) IN (
        'FOOTBALL_MATCH_RESULT_V1',
        'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
      )
      AND greatest(
        coalesce(e.resolves_after, e.closes_at),
        coalesce(
          nullif(e.resolution_scope->>'resolution_deadline', '')::timestamptz,
          e.resolves_after,
          e.closes_at
        )
      ) <= statement_timestamp() - interval '2 minutes'
      AND EXISTS (
        SELECT 1
        FROM market.instruments i
        JOIN public.assets a ON a.id = i.asset_id
        WHERE i.canonical_event_id = e.id
          AND i.status = 'CLOSED'
          AND a.code <> 'TNGN'
          AND NOT coalesce((a.metadata->>'sandbox_only')::boolean, false)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM market.instruments i
        JOIN public.assets a ON a.id = i.asset_id
        WHERE i.canonical_event_id = e.id
          AND i.status IN ('DRAFT', 'OPEN', 'SUSPENDED')
          AND a.code <> 'TNGN'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM oracle.resolutions r
        WHERE r.event_id = e.id
          AND r.status IN ('PROVISIONAL', 'FINAL', 'VOID')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM oracle.disputes d
        WHERE d.event_id = e.id
          AND d.status IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED')
      )
      -- The configured policy must identify a primary provider and at least
      -- one independent corroborating provider; no source names are guessed.
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p.source_hierarchy) h
        JOIN integration.providers ip
          ON upper(ip.code) = upper(coalesce(h->>'provider_code', h->>'providerCode', ''))
        WHERE upper(coalesce(h->>'role', '')) = 'PRIMARY'
      )
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p.source_hierarchy) h
        JOIN integration.providers ip
          ON upper(ip.code) = upper(coalesce(h->>'provider_code', h->>'providerCode', ''))
        WHERE upper(coalesce(h->>'role', '')) = 'CORROBORATING'
      )
      -- A verified primary observation is already available.
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p.source_hierarchy) h
        JOIN integration.providers ip
          ON upper(ip.code) = upper(coalesce(h->>'provider_code', h->>'providerCode', ''))
        JOIN oracle.observations o
          ON o.provider_id = ip.id
         AND o.event_id = e.id
         AND o.verification_status = 'VERIFIED'
        WHERE upper(coalesce(h->>'role', '')) = 'PRIMARY'
      )
      -- Do not route conflicting evidence to AI. Disagreement remains in the
      -- dispute/verification path and can never be silently overridden.
      AND NOT EXISTS (
        SELECT 1
        FROM oracle.observations left_obs
        JOIN oracle.observations right_obs
          ON right_obs.event_id = left_obs.event_id
         AND right_obs.provider_id <> left_obs.provider_id
         AND upper(right_obs.observed_outcome) <> upper(left_obs.observed_outcome)
        WHERE left_obs.event_id = e.id
          AND left_obs.verification_status = 'VERIFIED'
          AND right_obs.verification_status = 'VERIFIED'
      )
      -- Every corroborating provider must have explicitly failed/skipped its
      -- final-result lookup. No response or a not-final result is not enough.
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p.source_hierarchy) h
        JOIN integration.providers ip
          ON upper(ip.code) = upper(coalesce(h->>'provider_code', h->>'providerCode', ''))
        LEFT JOIN LATERAL (
          SELECT ia.status, ia.failure_code, ia.completed_at, ia.started_at, ia.created_at
          FROM oracle.ingestion_attempts ia
          WHERE ia.event_id = e.id
            AND ia.provider_id = ip.id
            AND ia.resolver_type = e.resolution_scope->>'resolver_type'
          ORDER BY coalesce(ia.completed_at, ia.started_at, ia.created_at) DESC,
                   ia.id DESC
          LIMIT 1
        ) latest_attempt ON true
        WHERE upper(coalesce(h->>'role', '')) = 'CORROBORATING'
          AND (
            latest_attempt.status IS DISTINCT FROM 'SKIPPED'
            AND latest_attempt.status IS DISTINCT FROM 'FAILED'
            OR coalesce(latest_attempt.failure_code, '') NOT IN (
              'MATCH_NOT_FOUND',
              'MATCH_TIME_MISMATCH',
              'RESOLVER_NOT_SUPPORTED_BY_PROVIDER',
              'PROVIDER_NOT_COMPATIBLE',
              'RESOURCE_NOT_BOUND',
              'PROVIDER_HTTP_403',
              'PROVIDER_HTTP_429',
              'PROVIDER_TIMEOUT',
              'PROVIDER_NETWORK_ERROR',
              'PROVIDER_PAYLOAD_INVALID'
            )
          )
      )
    ORDER BY coalesce(e.resolves_after, e.closes_at), e.id
    FOR UPDATE OF e SKIP LOCKED
  LOOP
    v_scope := coalesce(v_event.resolution_scope, '{}'::jsonb)
      || jsonb_build_object(
        'deterministic_resolver_type',
          v_event.resolution_scope->>'resolver_type',
        'resolver_type', 'AI_EVIDENCE_RULE_V1',
        'ai_resolution_fallback', jsonb_build_object(
          'mode', 'CATEGORY_PUBLIC_RECORD_FALLBACK_V1',
          'routed_at', statement_timestamp(),
          'reason', 'PRIMARY_RESULT_VERIFIED_CORROBORATING_PROVIDER_UNAVAILABLE',
          'previous_policy_id', v_event.policy_public_id
        )
      );

    UPDATE market.canonical_events
    SET resolution_scope = v_scope,
        updated_at = statement_timestamp()
    WHERE id = v_event.id
      AND status = 'AWAITING_ORACLE'
      AND upper(coalesce(resolution_scope->>'resolver_type', '')) IN (
        'FOOTBALL_MATCH_RESULT_V1',
        'FOOTBALL_TOTAL_GOALS_THRESHOLD_V1'
      );

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    -- The event-scope update enriches official competition URLs. This binding
    -- update invokes the existing resolver-policy router, which selects the
    -- approved PUBLIC_RECORD + TAVILY policy for the real-asset event.
    UPDATE oracle.event_policy_bindings
    SET bound_at = statement_timestamp()
    WHERE event_id = v_event.id;

    INSERT INTO eventing.domain_events(
      event_type, aggregate_type, aggregate_id, payload, idempotency_key
    ) VALUES (
      'MARKET_AI_FALLBACK_ROUTED',
      'CANONICAL_EVENT',
      v_event.public_id::text,
      jsonb_build_object(
        'previous_resolver', v_event.resolution_scope->>'resolver_type',
        'resolver_type', 'AI_EVIDENCE_RULE_V1',
        'previous_policy_id', v_event.policy_public_id,
        'required_ai_model_agreement', 2,
        'required_evidence_paths', jsonb_build_array('DIRECT', 'SEARCH')
      ),
      'market-ai-fallback-routed:' || v_event.public_id::text
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO audit.records(
      actor_type, action, resource_type, resource_id, reason, after_state, metadata
    ) VALUES (
      'SYSTEM',
      'MARKET_AI_FALLBACK_ROUTED',
      'CANONICAL_EVENT',
      v_event.public_id::text,
      'The primary provider supplied a verified result, but the configured corroborating source remained unavailable after the published resolution time. The market was routed to two-model, two-evidence-path automatic public-record resolution; conflicting observations and active disputes are excluded.',
      jsonb_build_object(
        'resolver_type', 'AI_EVIDENCE_RULE_V1',
        'status', 'AWAITING_ORACLE'
      ),
      jsonb_build_object(
        'previous_resolver', v_event.resolution_scope->>'resolver_type',
        'previous_policy_id', v_event.policy_public_id,
        'source_hierarchy', v_event.source_hierarchy
      )
    );

    v_routed := v_routed + 1;
  END LOOP;

  RETURN v_routed;
END;
$function$;

REVOKE ALL ON FUNCTION private.route_stalled_sports_markets_to_ai_resolution() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.route_stalled_sports_markets_to_ai_resolution() TO service_role;

-- The deterministic oracle runtime must not repeatedly attempt to parse
-- AI_EVIDENCE_RULE_V1. Those events belong exclusively to market-resolution-worker.
DO $patch$
DECLARE
  v_definition text;
  v_needle text;
  v_replacement text;
BEGIN
  SELECT pg_get_functiondef(
    'public.internal_oracle_due_events(uuid,integer)'::regprocedure
  ) INTO v_definition;

  v_needle := $needle$      and upper(btrim(coalesce(event.resolution_scope->>'resolver_type',''))) <> 'VAD_REVIEW_V1'$needle$;
  v_replacement := $replacement$      and upper(btrim(coalesce(event.resolution_scope->>'resolver_type',''))) NOT IN ('VAD_REVIEW_V1', 'AI_EVIDENCE_RULE_V1')$replacement$;

  IF position(v_needle IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find deterministic oracle resolver filter; refusing to patch an unexpected function body.';
  END IF;

  EXECUTE replace(v_definition, v_needle, v_replacement);
END;
$patch$;

-- The automatic fallback is independent from game resolution and runs only
-- against stale, eligible market events.
DO $schedule$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'vad-route-stalled-sports-to-ai-resolution'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'vad-route-stalled-sports-to-ai-resolution',
    '* * * * *',
    'SELECT private.route_stalled_sports_markets_to_ai_resolution();'
  );
END;
$schedule$;

COMMIT;
