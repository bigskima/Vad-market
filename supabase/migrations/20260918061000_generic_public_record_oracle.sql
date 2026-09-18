-- Generalize objective public-record evidence. No institution or market is encoded in runtime logic.
insert into integration.providers(code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
values('PUBLIC_RECORD','Configured Official Public Record','ORACLE','PRODUCTION','ACTIVE',25,'["PUBLIC_RECORD_EVIDENCE"]'::jsonb,
'{"adapter":"STRUCTURED_PUBLIC_RECORD_V1","configured":true,"credential_mode":"NONE","settlement_role":"OFFICIAL_PUBLIC_RECORD","provider_agnostic":true}'::jsonb,null)
on conflict(code,environment) do update set status='ACTIVE',capabilities=excluded.capabilities,public_metadata=excluded.public_metadata,updated_at=statement_timestamp();

insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata)
select p.id,'PUBLIC_EVENT',e.public_id::text,e.resolution_scope->>'source_url','ACTIVE',
 jsonb_build_object('authority',e.resolution_scope->>'source_name','host_allowlist',jsonb_build_array(regexp_replace(split_part(regexp_replace(e.resolution_scope->>'source_url','^https?://','','i'), '/', 1),'^www\\.','','i')),
 'field_pattern','adjourned\\s+at\\s+(\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?))','configured_from','resolution_scope')
from integration.providers p cross join market.canonical_events e
where p.code='PUBLIC_RECORD' and p.environment='PRODUCTION' and e.public_id='e63d82f5-3026-428b-a05e-1166a61f50b2'
on conflict(provider_id,resource_type,canonical_key) do update set external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

update market.canonical_events set resolution_scope=(resolution_scope-'legislative_date'-'cutoff_local_time')||jsonb_build_object(
'resolver_type','PUBLIC_RECORD_RULE_V1','record_date','2026-09-17',
'rule',jsonb_build_object('operator','BEFORE_OR_AT','field','adjourned\\s+at\\s+(\\d{1,2}:\\d{2}\\s*(?:a\\.?m\\.?|p\\.?m\\.?))','cutoff','8:30 PM','timezone','America/New_York'))
where public_id='e63d82f5-3026-428b-a05e-1166a61f50b2';

insert into oracle.policies(name,capability_id,version,source_hierarchy,consensus_rule,close_rule,postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,status,effective_at,created_by,approved_by)
select 'VAD Generic Public Record Policy',old.capability_id,(select coalesce(max(version),0)+1 from oracle.policies where capability_id=old.capability_id),
'[{"provider_code":"PUBLIC_RECORD","role":"PRIMARY"}]'::jsonb,
'{"environment":"PRODUCTION","tie_behavior":"NO_RESOLUTION","finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":false,"min_agreeing_providers":1}'::jsonb,
old.close_rule,old.postponement_rule,old.cancellation_rule,old.void_rule,60,'ACTIVE',statement_timestamp(),null,old.approved_by
from oracle.policies old where old.name='VAD Automatic Official Public Record Policy'
and not exists(select 1 from oracle.policies x where x.name='VAD Generic Public Record Policy');

delete from oracle.provider_resources where provider_id in(select id from integration.providers where code='US_SENATE');
update integration.providers set status='DISABLED' where code='US_SENATE';
