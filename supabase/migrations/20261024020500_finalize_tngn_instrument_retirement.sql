begin;

-- The TNGN asset and all TNGN trading/demo RPCs are already disabled. Close
-- any orphaned nonterminal instrument rows that remain without open exposure,
-- especially draft instruments which have no public market_catalog row.
with candidates as (
  select i.id,i.public_id,i.canonical_event_id,i.status as previous_status
  from market.instruments i
  join public.assets a on a.id=i.asset_id
  where a.code='TNGN'
    and i.status in ('DRAFT','OPEN','SUSPENDED','SETTLEMENT_PENDING')
    and not exists (
      select 1 from trading.orders o
      where o.instrument_id=i.id and o.status in ('OPEN','PARTIALLY_FILLED')
    )
    and not exists (
      select 1 from trading.pool_stakes s
      where s.instrument_id=i.id and s.status='OPEN'
    )
    and not exists (
      select 1 from trading.positions p
      where p.instrument_id=i.id and p.status='OPEN' and p.quantity<>0
    )
  for update
), retired as (
  update market.instruments i
  set status='CLOSED',
      closed_at=coalesce(i.closed_at,statement_timestamp()),
      updated_at=statement_timestamp()
  from candidates c
  where i.id=c.id
  returning i.id,i.public_id,i.canonical_event_id,c.previous_status
)
insert into audit.records(
  actor_user_id,actor_type,action,resource_type,resource_id,
  before_state,after_state,reason,request_id,occurred_at,metadata
)
select
  null,'SYSTEM','TNGN_INSTRUMENT_RETIRED','MARKET_INSTRUMENT',r.public_id::text,
  jsonb_build_object('status',r.previous_status,'asset_code','TNGN'),
  jsonb_build_object('status','CLOSED','asset_code','TNGN'),
  'Final TNGN decommissioning: close orphaned nonterminal instruments with no open orders, pool stakes or positions. Historical settled/closed records remain unchanged.',
  gen_random_uuid(),statement_timestamp(),
  jsonb_build_object('instrument_id',r.id,'canonical_event_id',r.canonical_event_id)
from retired r;

commit;
