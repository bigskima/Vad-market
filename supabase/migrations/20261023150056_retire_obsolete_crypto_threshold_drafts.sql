begin;

-- Retire only the stale unapproved CoinGecko + Coinbase drafts when an
-- already-approved, currently effective Coinbase + Kraken policy exists for
-- that same environment. Do not mutate any approved policy or market record.
with stale_drafts as (
  select d.id,d.public_id,d.name,d.version,d.source_hierarchy,d.consensus_rule
  from oracle.policies d
  where d.status='DRAFT'
    and d.name in ('VAD Crypto Threshold Launch Policy','VAD Sandbox Crypto Threshold Policy')
    and jsonb_typeof(d.source_hierarchy)='array'
    and jsonb_array_length(d.source_hierarchy)=2
    and exists(
      select 1 from jsonb_array_elements(d.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',''))='COINGECKO'
        and upper(coalesce(h->>'role',''))='PRIMARY'
    )
    and exists(
      select 1 from jsonb_array_elements(d.source_hierarchy) h
      where upper(coalesce(h->>'provider_code',''))='COINBASE'
        and upper(coalesce(h->>'role',''))='CORROBORATING'
    )
    and exists(
      select 1 from oracle.policies active_policy
      where active_policy.name=d.name
        and active_policy.status='ACTIVE'
        and active_policy.approved_by is not null
        and active_policy.effective_at<=statement_timestamp()
        and jsonb_typeof(active_policy.source_hierarchy)='array'
        and jsonb_array_length(active_policy.source_hierarchy)=2
        and upper(coalesce(active_policy.consensus_rule->>'distinct_providers','false'))='TRUE'
        and case
          when coalesce(active_policy.consensus_rule->>'min_agreeing_providers','') ~ '^[0-9]+$'
            then (active_policy.consensus_rule->>'min_agreeing_providers')::integer
          else 0
        end >= 2
        and exists(
          select 1 from jsonb_array_elements(active_policy.source_hierarchy) h
          where upper(coalesce(h->>'provider_code',''))='COINBASE'
            and upper(coalesce(h->>'role',''))='PRIMARY'
        )
        and exists(
          select 1 from jsonb_array_elements(active_policy.source_hierarchy) h
          where upper(coalesce(h->>'provider_code',''))='KRAKEN'
            and upper(coalesce(h->>'role',''))='CORROBORATING'
        )
    )
),
retired as (
  update oracle.policies p
  set status='RETIRED'
  from stale_drafts d
  where p.id=d.id and p.status='DRAFT'
  returning p.public_id,p.name,p.version,p.source_hierarchy,p.consensus_rule
)
insert into audit.records (
  actor_user_id,actor_type,action,resource_type,resource_id,
  before_state,after_state,reason,request_id,occurred_at,metadata
)
select
  null,'SYSTEM','ORACLE_POLICY_DRAFT_RETIRED','ORACLE_POLICY',r.public_id::text,
  jsonb_build_object('status','DRAFT','source_hierarchy',r.source_hierarchy,'consensus_rule',r.consensus_rule),
  jsonb_build_object('status','RETIRED','source_hierarchy',r.source_hierarchy,'consensus_rule',r.consensus_rule),
  'Retired an obsolete unapproved CoinGecko/Coinbase draft; an effective approved Coinbase/Kraken policy already exists.',
  gen_random_uuid(),statement_timestamp(),
  jsonb_build_object('policy_name',r.name,'version',r.version,'replacement_source_pair','COINBASE+KRAKEN')
from retired r;

commit;
