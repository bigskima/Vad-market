-- VAD Phase 9: Nigeria launch capabilities for social participation.
-- Financial trading remains controlled independently and is not enabled by this migration.

insert into public.capability_rules(capability_key,country_code,version,enabled,reason_code,status,effective_at)
select 'createPost','NG',1,true,'NIGERIA_SOCIAL_LAUNCH','ACTIVE',statement_timestamp()
where not exists(select 1 from public.capability_rules where capability_key='createPost' and country_code='NG');

insert into public.capability_rules(capability_key,country_code,version,enabled,reason_code,status,effective_at)
select 'submitMarketProposal','NG',1,true,'NIGERIA_MARKET_PROPOSAL_LAUNCH','ACTIVE',statement_timestamp()
where not exists(select 1 from public.capability_rules where capability_key='submitMarketProposal' and country_code='NG');
