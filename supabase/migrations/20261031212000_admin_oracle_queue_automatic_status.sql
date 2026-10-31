-- Replace the admin Oracle queue's blind manual-create prompt with a
-- status-aware queue. Automatic markets are monitored, not manually assigned
-- a winning outcome; policy disputes remain visible to authorized reviewers.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_oracle_queue_v2()
RETURNS TABLE(
  event_public_id uuid,
  event_title text,
  event_status text,
  resolution_id bigint,
  resolution_status text,
  outcome_code text,
  provisional_at timestamptz,
  active_disputes bigint,
  category text,
  resolver_type text,
  resolution_mode text,
  policy_name text,
  policy_version integer,
  latest_ai_status text,
  latest_ai_failure_reason text,
  latest_ai_attempt_at timestamptz,
  retry_after timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF NOT private.has_permission('oracle.review') THEN
    RAISE EXCEPTION 'Permission required' USING errcode='42501';
  END IF;

  RETURN QUERY
  SELECT
    e.public_id,
    e.title,
    e.status,
    r.id,
    r.status,
    r.outcome_code,
    r.created_at,
    (
      SELECT count(*)::bigint
      FROM oracle.disputes d
      WHERE d.event_id=e.id
        AND d.status IN ('OPEN','UNDER_REVIEW','ESCALATED')
    ),
    e.category,
    upper(coalesce(e.resolution_scope->>'resolver_type','')),
    CASE
      WHEN upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW'
        THEN 'AUTOMATIC'
      ELSE 'MANUAL_EXCEPTION'
    END,
    p.name,
    p.version,
    ai.status,
    ai.failure_reason,
    ai.created_at,
    CASE WHEN ai.created_at IS NOT NULL THEN ai.created_at+interval '4 minutes' ELSE NULL END
  FROM market.canonical_events e
  LEFT JOIN oracle.event_policy_bindings b ON b.event_id=e.id
  LEFT JOIN oracle.policies p ON p.id=b.oracle_policy_id
  LEFT JOIN LATERAL (
    SELECT rr.id,rr.status,rr.outcome_code,rr.created_at
    FROM oracle.resolutions rr
    WHERE rr.event_id=e.id AND rr.status='PROVISIONAL'
    ORDER BY rr.created_at DESC,rr.id DESC
    LIMIT 1
  ) r ON true
  LEFT JOIN LATERAL (
    SELECT a.status,a.failure_reason,a.created_at
    FROM oracle.ai_resolution_attempts a
    WHERE a.event_id=e.id
    ORDER BY a.created_at DESC,a.id DESC
    LIMIT 1
  ) ai ON true
  WHERE e.status IN ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED')
  ORDER BY
    CASE WHEN upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW' THEN 0 ELSE 1 END,
    e.updated_at ASC;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_oracle_queue_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_oracle_queue_v2() TO authenticated,service_role;

COMMIT;
