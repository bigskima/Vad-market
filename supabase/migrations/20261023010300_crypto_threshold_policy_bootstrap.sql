begin;

-- Clean-install bootstrap for the two-provider crypto threshold policy.
-- Existing approved policy versions are immutable; this only creates a DRAFT
-- version for an independent Oracle reviewer to inspect and approve.
insert into oracle.policies (
  public_id,name,capability_id,version,source_hierarchy,consensus_rule,
  close_rule,postponement_rule,cancellation_rule,void_rule,
  dispute_window_seconds,status,effective_at,created_by,approved_by
)
select
  gen_random_uuid(),current_policy.name,current_policy.capability_id,
  (select coalesce(max(existing.version),0)+1
   from oracle.policies existing where existing.name=current_policy.name),
  jsonb_build_array(
    jsonb_build_object('role','PRIMARY','provider_code','COINBASE','priority',10),
    jsonb_build_object('role','CORROBORATING','provider_code','KRAKEN','priority',20)
  ),
  coalesce(current_policy.consensus_rule,'{}'::jsonb) || jsonb_build_object(
    'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
    'distinct_providers',true,
    'min_agreeing_providers',2
  ),
  current_policy.close_rule,current_policy.postponement_rule,
  current_policy.cancellation_rule,current_policy.void_rule,
  current_policy.dispute_window_seconds,'DRAFT',statement_timestamp(),null,null
from oracle.policies current_policy
where current_policy.name in ('VAD Crypto Threshold Launch Policy','VAD Sandbox Crypto Threshold Policy')
  and current_policy.status='ACTIVE'
  and current_policy.approved_by is not null
  and not exists (
    select 1 from oracle.policies existing_draft
    where existing_draft.name=current_policy.name
      and existing_draft.status='DRAFT'
      and existing_draft.source_hierarchy @> '[{"role":"PRIMARY","provider_code":"COINBASE","priority":10},{"role":"CORROBORATING","provider_code":"KRAKEN","priority":20}]'::jsonb
  );

commit;
