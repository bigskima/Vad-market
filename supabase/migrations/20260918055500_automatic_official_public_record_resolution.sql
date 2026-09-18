-- Automatic official public-record resolution for deterministic legislative adjournment markets.
insert into integration.providers(code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values(
  'US_SENATE','United States Senate','ORACLE','PRODUCTION','ACTIVE',25,
  '["LEGISLATIVE_SESSION_ADJOURNMENT"]'::jsonb,
  '{"adapter":"US_SENATE_FLOOR_V1","base_url":"https://www.senate.gov","configured":true,"credential_mode":"NONE","settlement_role":"OFFICIAL_PUBLIC_RECORD"}'::jsonb,
  null
)
on conflict(code,environment) do update set
  status='ACTIVE',
  capabilities=excluded.capabilities,
  public_metadata=excluded.public_metadata,
  updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'PUBLIC_EVENT','e63d82f5-3026-428b-a05e-1166a61f50b2',
       'https://www.senate.gov/legislative/floor_activity_pail.htm?os=v','ACTIVE',
       '{"authority":"United States Senate","host_allowlist":["senate.gov","www.senate.gov"],"record_type":"floor_proceedings"}'::jsonb
from integration.providers p
where p.code='US_SENATE' and p.environment='PRODUCTION'
on conflict(provider_id,resource_type,canonical_key) do update set
  external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

update market.canonical_events
set resolution_scope = resolution_scope
  || jsonb_build_object(
    'resolver_type','LEGISLATIVE_SESSION_ADJOURNMENT_V1',
    'legislative_date','2026-09-17',
    'cutoff_local_time','8:30 PM',
    'timezone','America/New_York'
  ),
  updated_at=statement_timestamp()
where public_id='e63d82f5-3026-428b-a05e-1166a61f50b2';

insert into oracle.policies(name,capability_id,version,source_hierarchy,consensus_rule,close_rule,postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,status,effective_at,created_by,approved_by)
select 'VAD Automatic Official Public Record Policy',old.capability_id,
  (select coalesce(max(version),0)+1 from oracle.policies where capability_id=old.capability_id),
  '[{"provider_code":"US_SENATE","role":"PRIMARY"}]'::jsonb,
  '{"environment":"PRODUCTION","tie_behavior":"NO_RESOLUTION","finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":false,"min_agreeing_providers":1}'::jsonb,
  old.close_rule,old.postponement_rule,old.cancellation_rule,old.void_rule,60,'ACTIVE',statement_timestamp(),null,old.approved_by
from oracle.policies old
where old.public_id='da18a5f7-ab70-4c98-99f4-83bd5b68fe05'
and not exists(select 1 from oracle.policies x where x.name='VAD Automatic Official Public Record Policy');

update oracle.event_policy_bindings b
set oracle_policy_id=p.id,bound_at=statement_timestamp()
from oracle.policies p, market.canonical_events e
where e.id=b.event_id and e.public_id='e63d82f5-3026-428b-a05e-1166a61f50b2'
  and p.name='VAD Automatic Official Public Record Policy';
