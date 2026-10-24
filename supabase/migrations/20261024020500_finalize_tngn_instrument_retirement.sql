begin;

-- Refuse to close TNGN ledger accounts while unresolved exposure or reserved
-- funds remain. Historical balances are preserved, not converted into NGN.
do $guard$
begin
  if exists (
    select 1
    from trading.orders o
    join market.instruments i on i.id=o.instrument_id
    join public.assets a on a.id=i.asset_id
    where a.code='TNGN' and o.status in ('OPEN','PARTIALLY_FILLED')
  ) then
    raise exception 'TNGN retirement requires open/partially-filled orders to be cancelled through their normal workflow first.';
  end if;

  if exists (
    select 1
    from trading.pool_stakes s
    join market.instruments i on i.id=s.instrument_id
    join public.assets a on a.id=i.asset_id
    where a.code='TNGN' and i.status not in ('CLOSED','SETTLED','CANCELLED','VOIDED')
  ) then
    raise exception 'TNGN retirement cannot close accounts while a market with unsettled TNGN stakes remains.';
  end if;

  if exists (
    select 1
    from trading.positions p
    join market.instruments i on i.id=p.instrument_id
    join public.assets a on a.id=i.asset_id
    where a.code='TNGN' and i.status='OPEN' and p.quantity<>0
  ) then
    raise exception 'TNGN retirement cannot close accounts while open TNGN positions remain.';
  end if;

  if exists (
    select 1
    from finance.ledger_accounts la
    join public.assets a on a.id=la.asset_id
    where a.code='TNGN'
      and la.account_type in ('USER_RESERVED','WITHDRAWAL_PENDING')
      and finance.account_balance(la.id)<>0
  ) then
    raise exception 'TNGN retirement cannot close ledger accounts while reserved or pending-withdrawal balances remain.';
  end if;
end;
$guard$;

-- Close only nonterminal TNGN instruments with no open orders, stakes or
-- positions. Settled/closed historical instruments and their catalog rows stay.
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
      where s.instrument_id=i.id
    )
    and not exists (
      select 1 from trading.positions p
      where p.instrument_id=i.id and p.quantity<>0
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
  'Final TNGN decommissioning: close orphaned nonterminal instruments with no orders, stakes or positions. Historical settled/closed records remain unchanged.',
  gen_random_uuid(),statement_timestamp(),
  jsonb_build_object('instrument_id',r.id,'canonical_event_id',r.canonical_event_id)
from retired r;

-- Retire the TNGN ledger account endpoints while preserving all old posted
-- entries and balances for audit. The closed account balances are never moved
-- into the real NGN wallet.
insert into audit.records(
  actor_user_id,actor_type,action,resource_type,resource_id,
  before_state,after_state,reason,request_id,occurred_at,metadata
)
select
  null,'SYSTEM','TNGN_LEDGER_ACCOUNT_CLOSED','LEDGER_ACCOUNT',la.id::text,
  jsonb_build_object('status',la.status,'asset_code','TNGN',
    'account_type',la.account_type,'owner_type',la.owner_type,
    'owner_reference',la.owner_reference,'balance',finance.account_balance(la.id)),
  jsonb_build_object('status','CLOSED','asset_code','TNGN'),
  'TNGN is permanently retired. Existing synthetic balances and ledger entries are retained for historical audit, not converted to NGN.',
  gen_random_uuid(),statement_timestamp(),
  jsonb_build_object('ledger_account_id',la.id,'asset_code','TNGN')
from finance.ledger_accounts la
join public.assets a on a.id=la.asset_id
where a.code='TNGN' and la.status<>'CLOSED';

update finance.ledger_accounts la
set status='CLOSED',
    closed_at=coalesce(la.closed_at,statement_timestamp())
from public.assets a
where a.id=la.asset_id and a.code='TNGN' and la.status<>'CLOSED';

-- Make retirement irreversible through normal runtime write paths: no new
-- TNGN instrument can be created/reopened, and no new ledger journal can be
-- posted against the disabled test asset. Historical journals remain intact.
create or replace function private.guard_retired_tngn_instrument_write()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_code text;
begin
  select a.code into v_code from public.assets a where a.id=new.asset_id;
  if v_code='TNGN' then
    if tg_op='INSERT' or new.status in ('DRAFT','OPEN','SUSPENDED','SETTLEMENT_PENDING') then
      raise exception 'TNGN is permanently decommissioned. Create and trade markets only in eligible real assets.' using errcode='55000';
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_retired_tngn_instrument_write() from public,anon,authenticated,service_role;
drop trigger if exists prevent_retired_tngn_instrument_write on market.instruments;
create trigger prevent_retired_tngn_instrument_write
before insert or update of asset_id,status on market.instruments
for each row execute function private.guard_retired_tngn_instrument_write();

create or replace function private.guard_retired_tngn_ledger_journal()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if exists (
    select 1 from public.assets a
    where a.id=new.asset_id and a.code='TNGN'
  ) then
    raise exception 'TNGN is permanently decommissioned. No new ledger movements may be posted to the retired test asset.' using errcode='55000';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_retired_tngn_ledger_journal() from public,anon,authenticated,service_role;
drop trigger if exists prevent_retired_tngn_ledger_journal on finance.ledger_journals;
create trigger prevent_retired_tngn_ledger_journal
before insert on finance.ledger_journals
for each row execute function private.guard_retired_tngn_ledger_journal();

commit;
