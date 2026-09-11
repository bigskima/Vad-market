-- VAD Phase 36: activate the existing Didit KYC route for launch.
-- The Edge runtime still validates that the required server secrets actually exist
-- before it creates a verification session, so this database readiness flag cannot
-- bypass missing credentials.

update integration.providers
set status='ACTIVE',
    public_metadata=jsonb_set(
      coalesce(public_metadata,'{}'::jsonb),
      '{configured}',
      'true'::jsonb,
      true
    ) || jsonb_build_object(
      'api_version','v3',
      'api_key_alias_supported',true,
      'launch_enabled',true
    ),
    updated_at=statement_timestamp()
where code='DIDIT'
  and environment='PRODUCTION'
  and provider_type='IDENTITY_VERIFICATION';

update integration.provider_routes r
set status='ACTIVE',updated_at=statement_timestamp()
from integration.providers p
where p.id=r.provider_id
  and p.code='DIDIT'
  and p.environment='PRODUCTION'
  and r.operation='KYC'
  and r.country_code='NG';

insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,after_state,metadata)
select null,'SYSTEM','PROVIDER_LAUNCH_ACTIVATED','PROVIDER',p.id::text,
       'Didit KYC enabled for VAD launch; runtime secret validation remains authoritative',
       jsonb_build_object('status',p.status,'configured',coalesce((p.public_metadata->>'configured')::boolean,false)),
       jsonb_build_object('provider_code',p.code,'environment',p.environment,'operation','KYC','country_code','NG','phase','36')
from integration.providers p
where p.code='DIDIT' and p.environment='PRODUCTION';
