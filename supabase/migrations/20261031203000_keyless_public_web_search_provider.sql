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

-- The search provider is an alternative corroborating source for the existing
-- generic gateway policy. Keep TAVILY in the hierarchy so configured customers
-- can continue using it; the worker records exactly which provider produced
-- the evidence for each observation.
UPDATE oracle.policies
SET source_hierarchy = CASE
  WHEN source_hierarchy @> '[{"provider_code":"PUBLIC_WEB_SEARCH"}]'::jsonb
    THEN source_hierarchy
  ELSE source_hierarchy || jsonb_build_array(
    jsonb_build_object('role','CORROBORATING','provider_code','PUBLIC_WEB_SEARCH')
  )
END
WHERE name='VAD Generic Evidence Gateway Policy'
  AND status='ACTIVE'
  AND approved_by IS NOT NULL;

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
