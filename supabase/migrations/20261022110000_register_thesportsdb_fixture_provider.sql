begin;

-- TheSportsDB supplies sports/competition/season/event discovery across a broad
-- range of sports. It is explicitly discovery-only; it does not become an Oracle
-- outcome source or gain settlement authority by being enabled here.
insert into integration.providers(
  code,name,provider_type,environment,status,priority,
  secret_reference,public_metadata,capabilities,updated_at
) values(
  'THESPORTSDB','TheSportsDB public multi-sport fixture catalogue','ORACLE','PRODUCTION','ACTIVE',80,
  null,
  '{
    "adapter":"THESPORTSDB_V1",
    "fixture_adapter":"THESPORTSDB_V1",
    "base_url":"https://www.thesportsdb.com/api/v1/json/123",
    "configured":true,
    "fixture_discovery_enabled":true,
    "credential_mode":"PUBLIC_DEMO_KEY",
    "attribution_required":true,
    "attribution_url":"https://www.thesportsdb.com/",
    "settlement_role":"DISCOVERY_ONLY",
    "fixture_requests_per_day":40,
    "fixture_requests_per_minute":4,
    "fixture_catalog_cache_seconds":21600,
    "fixture_cache_seconds":900,
    "fixture_stale_seconds":86400,
    "discovery_note":"Free key has request and catalogue limits. Returned fixtures are only suggestions; result verification and settlement use VAD-approved Oracle rules."
  }'::jsonb,
  '["SPORTS_FIXTURE_DISCOVERY"]'::jsonb,
  statement_timestamp()
)
on conflict(code,environment) do update set
  name=excluded.name,
  provider_type='ORACLE',
  status='ACTIVE',
  priority=excluded.priority,
  secret_reference=null,
  public_metadata=integration.providers.public_metadata||excluded.public_metadata,
  capabilities=excluded.capabilities,
  updated_at=statement_timestamp();

commit;
