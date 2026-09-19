insert into oracle.policies(name,capability_id,version,source_hierarchy,consensus_rule,close_rule,postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,status,effective_at,created_by,approved_by)
select 'VAD Automatic Official Public Record Policy',old.capability_id,(select coalesce(max(version),0)+1 from oracle.policies where capability_id=old.capability_id),'[{"provider_code":"US_SENATE","role":"PRIMARY"}]'::jsonb,'{"environment":"PRODUCTION","tie_behavior":"NO_RESOLUTION","finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":false,"min_agreeing_providers":1}'::jsonb,old.close_rule,old.postponement_rule,old.cancellation_rule,old.void_rule,60,'ACTIVE',statement_timestamp(),null,old.approved_by
from oracle.policies old where old.public_id='da18a5f7-ab70-4c98-99f4-83bd5b68fe05'
and not exists(select 1 from oracle.policies x where x.name='VAD Automatic Official Public Record Policy');

update oracle.event_policy_bindings b set oracle_policy_id=p.id,bound_at=statement_timestamp()
from oracle.policies p,market.canonical_events e
where e.id=b.event_id and e.public_id='e63d82f5-3026-428b-a05e-1166a61f50b2' and p.name='VAD Automatic Official Public Record Policy';