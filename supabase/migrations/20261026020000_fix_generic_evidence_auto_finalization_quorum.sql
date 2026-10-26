-- The AI evidence worker writes one verified observation for the primary
-- public-record source and one for the configured corroborating search source.
-- The finalizer intentionally refuses automatic finalization with fewer than
-- two agreeing providers, so the generic production evidence policy must match
-- that contract instead of remaining at a quorum of one.
begin;

update oracle.policies p
set consensus_rule = coalesce(p.consensus_rule, '{}'::jsonb)
  || jsonb_build_object(
    'min_agreeing_providers', 2,
    'distinct_providers', true
  )
where p.public_id = '0350f7b1-99ff-46e9-b7e6-ee2a8d8ac1ee'::uuid
  and p.status = 'ACTIVE'
  and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION')) = 'PRODUCTION'
  and upper(coalesce(p.consensus_rule->>'finalization_mode','')) = 'AUTO_AFTER_DISPUTE_WINDOW'
  and exists (
    select 1
    from jsonb_array_elements(coalesce(p.source_hierarchy,'[]'::jsonb)) source
    where upper(coalesce(source->>'provider_code',source->>'providerCode','')) = 'PUBLIC_RECORD'
  )
  and exists (
    select 1
    from jsonb_array_elements(coalesce(p.source_hierarchy,'[]'::jsonb)) source
    where upper(coalesce(source->>'provider_code',source->>'providerCode','')) = 'TAVILY'
  )
  and (
    coalesce((p.consensus_rule->>'min_agreeing_providers')::integer,1) < 2
    or coalesce((p.consensus_rule->>'distinct_providers')::boolean,false) is not true
  );

commit;
