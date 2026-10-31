-- Register a no-key public-web search fallback as a distinct oracle source.
-- The resolver prefers Tavily when it returns independent results; otherwise it
-- uses DuckDuckGo HTML and Bing RSS through PUBLIC_WEB_SEARCH. Its observations
-- are never mislabeled as Tavily observations.

BEGIN;

INSERT INTO integration.providers(
  code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference
)
SELECT
  'PUBLIC_WEB_SEARCH',
  'Public Web Search (DuckDuckGo + Bing RSS)',
  'ORACLE',
  'PRODUCTION',
  'ACTIVE',
  45,
  '["PUBLIC_RECORD_EVIDENCE"]'::jsonb,
  jsonb_build_object(
    'adapter','PUBLIC_WEB_SEARCH_V1',
    'base_urls',jsonb_build_array(
      'https://html.duckduckgo.com/html/',
      'https://www.bing.com/search?format=rss'
    ),
    'configured',true,
    'credential_mode','NONE',
    'settlement_role','DISCOVERY_CORROBORATING',
    'provider_agnostic',true,
    'independent_host_required',true
  ),
  null
WHERE NOT EXISTS (
  SELECT 1 FROM integration.providers
  WHERE code='PUBLIC_WEB_SEARCH' AND environment='PRODUCTION'
);

UPDATE integration.providers
SET status='ACTIVE',
    priority=45,
    capabilities='["PUBLIC_RECORD_EVIDENCE"]'::jsonb,
    public_metadata=coalesce(public_metadata,'{}'::jsonb) || jsonb_build_object(
      'adapter','PUBLIC_WEB_SEARCH_V1',
      'base_urls',jsonb_build_array(
        'https://html.duckduckgo.com/html/',
        'https://www.bing.com/search?format=rss'
      ),
      'configured',true,
      'credential_mode','NONE',
      'settlement_role','DISCOVERY_CORROBORATING',
      'provider_agnostic',true,
      'independent_host_required',true
    ),
    secret_reference=null,
    updated_at=statement_timestamp()
WHERE code='PUBLIC_WEB_SEARCH' AND environment='PRODUCTION';

-- Approved policy rows are immutable. Create a system-originated draft version
-- with the new independent source. It remains DRAFT until a different reviewer
-- with oracle.review explicitly approves it through the existing policy workflow.
WITH source_policy AS (
  SELECT p.*
  FROM oracle.policies p
  WHERE p.name='VAD Generic Evidence Gateway Policy'
    AND p.status='ACTIVE'
    AND p.approved_by IS NOT NULL
  ORDER BY p.version DESC,p.effective_at DESC,p.id DESC
  LIMIT 1
),
new_draft AS (
  INSERT INTO oracle.policies(
    name,capability_id,version,source_hierarchy,consensus_rule,close_rule,
    postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,
    status,effective_at,created_by
  )
  SELECT
    p.name,
    p.capability_id,
    (SELECT coalesce(max(existing.version),0)+1
     FROM oracle.policies existing WHERE existing.name=p.name),
    CASE
      WHEN p.source_hierarchy @> '[{"provider_code":"PUBLIC_WEB_SEARCH"}]'::jsonb
        THEN p.source_hierarchy
      ELSE p.source_hierarchy || jsonb_build_array(
        jsonb_build_object('role','CORROBORATING','provider_code','PUBLIC_WEB_SEARCH')
      )
    END,
    p.consensus_rule,
    p.close_rule,
    p.postponement_rule,
    p.cancellation_rule,
    p.void_rule,
    p.dispute_window_seconds,
    'DRAFT',
    statement_timestamp(),
    NULL
  FROM source_policy p
  WHERE NOT EXISTS (
    SELECT 1 FROM oracle.policies draft
    WHERE draft.name=p.name
      AND draft.status='DRAFT'
      AND draft.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"PUBLIC_RECORD"}]'::jsonb
      AND draft.source_hierarchy @> '[{"role":"CORROBORATING","provider_code":"PUBLIC_WEB_SEARCH"}]'::jsonb
  )
  RETURNING public_id,name,version,source_hierarchy
)
INSERT INTO audit.records(
  actor_type,action,resource_type,resource_id,reason,after_state,metadata
)
SELECT
  'SYSTEM',
  'ORACLE_POLICY_DRAFT_CREATED',
  'ORACLE_POLICY',
  d.public_id::text,
  'Prepared a new immutable version of the generic automatic evidence policy. PUBLIC_WEB_SEARCH is an additional keyless corroboration provider; activation requires a separate Oracle reviewer approval.',
  jsonb_build_object('status','DRAFT','version',d.version),
  jsonb_build_object(
    'policy_name',d.name,
    'version',d.version,
    'new_provider_code','PUBLIC_WEB_SEARCH',
    'requires_separate_oracle_review',true
  )
FROM new_draft d;

-- The resolver must rebind only to an approved policy version that explicitly
-- includes the new corroborating provider. Existing VAD Generic Evidence v1
-- bindings continue using PUBLIC_RECORD + TAVILY until the draft is approved.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'private.route_vad_evidence_policy_by_resolver()'::regprocedure
  ) INTO v_definition;

  v_old := $old$      and exists (
        select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='TAVILY'
      )
  ) then
    return new;
  end if;$old$;
  v_new := $new$      and exists (
        select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='TAVILY'
      )
      and exists (
        select 1 from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='PUBLIC_WEB_SEARCH'
      )
  ) then
    return new;
  end if;$new$;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not locate current generic policy binding idempotency guard.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='TAVILY'
    )
  order by p.version desc,p.effective_at desc,p.id desc
  limit 1;$old$;
  v_new := $new$    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='TAVILY'
    )
    and exists (
      select 1 from jsonb_array_elements(p.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='PUBLIC_WEB_SEARCH'
    )
  order by p.version desc,p.effective_at desc,p.id desc
  limit 1;$new$;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not locate current generic policy selection source hierarchy.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch$;

-- Once (and only once) a reviewer approves this new version, rebind existing
-- generic markets to that version. The existing event-binding trigger selects
-- the highest active approved policy that includes PUBLIC_WEB_SEARCH.
CREATE OR REPLACE FUNCTION private.rebind_generic_markets_after_search_policy_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  IF OLD.status='ACTIVE'
     OR NEW.status<>'ACTIVE'
     OR NEW.name<>'VAD Generic Evidence Gateway Policy'
     OR NEW.approved_by IS NULL
     OR NOT (NEW.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"PUBLIC_RECORD"}]'::jsonb)
     OR NOT (NEW.source_hierarchy @> '[{"role":"CORROBORATING","provider_code":"PUBLIC_WEB_SEARCH"}]'::jsonb) THEN
    RETURN NEW;
  END IF;

  UPDATE oracle.event_policy_bindings b
  SET bound_at=statement_timestamp()
  FROM market.canonical_events e
  WHERE e.id=b.event_id
    AND b.oracle_policy_id<>NEW.id
    AND upper(coalesce(e.resolution_scope->>'resolver_type','')) IN ('VAD_REVIEW_V1','AI_EVIDENCE_RULE_V1')
    AND EXISTS (
      SELECT 1
      FROM market.instruments i
      JOIN public.assets a ON a.id=i.asset_id
      WHERE i.canonical_event_id=e.id
        AND upper(a.code)<>'TNGN'
        AND NOT coalesce((a.metadata->>'sandbox_only')::boolean,false)
    )
    AND NOT EXISTS (
      SELECT 1 FROM oracle.disputes d
      WHERE d.event_id=e.id AND d.status IN ('OPEN','UNDER_REVIEW','ESCALATED')
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS vad_generic_search_policy_activation_rebind ON oracle.policies;
CREATE TRIGGER vad_generic_search_policy_activation_rebind
AFTER UPDATE OF status ON oracle.policies
FOR EACH ROW
EXECUTE FUNCTION private.rebind_generic_markets_after_search_policy_approval();

-- The shared auto-readiness validator recognises both configured search adapters.
DO $patch$
DECLARE
  v_definition text;
  v_old text := 'ip.code in (''PUBLIC_RECORD'',''TAVILY'')';
  v_new text := 'ip.code in (''PUBLIC_RECORD'',''TAVILY'',''PUBLIC_WEB_SEARCH'')';
BEGIN
  SELECT pg_get_functiondef(
    'private.validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  ) INTO v_definition;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find automatic evidence provider readiness list; refusing to patch an unexpected validator.';
  END IF;

  EXECUTE replace(v_definition,v_old,v_new);
END;
$patch$;

COMMIT;
