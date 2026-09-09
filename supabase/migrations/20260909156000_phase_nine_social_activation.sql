-- VAD Phase 9: activate social participation by publishing new capability-policy versions.
-- Preserve prior disabled versions for audit/history.

insert into public.capability_rules(capability_key,country_code,version,enabled,reason_code,status,effective_at)
select 'create_post','NG',coalesce(max(version),0)+1,true,'NIGERIA_SOCIAL_LAUNCH','ACTIVE',statement_timestamp()
from public.capability_rules where capability_key='create_post' and country_code='NG';

insert into public.capability_rules(capability_key,country_code,version,enabled,reason_code,status,effective_at)
select 'submit_market_proposal','NG',coalesce(max(version),0)+1,true,'NIGERIA_MARKET_PROPOSAL_LAUNCH','ACTIVE',statement_timestamp()
from public.capability_rules where capability_key='submit_market_proposal' and country_code='NG';
