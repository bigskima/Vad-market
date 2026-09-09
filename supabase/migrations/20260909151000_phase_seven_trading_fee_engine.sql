-- VAD Phase 7: policy-driven trading fees.
-- BUY orders reserve worst-case fee capacity up front; exact maker/taker fees are charged only on execution.
-- Fees are never taken from market collateral.

alter table policy.policy_versions drop constraint if exists policy_versions_dual_control;
alter table policy.policy_versions add constraint policy_versions_dual_control check (
  (created_by is null and approved_by is null)
  or (created_by is not null and approved_by is null)
  or (created_by is not null and approved_by is not null and created_by<>approved_by)
);

-- Ensure a safe zero-fee launch policy exists. Admin can publish later versions without code deployment.
do $$
declare pid bigint; vid bigint;
begin
  select id into pid from policy.policies where domain='FEES' and name='trading_fee';
  if pid is null then
    insert into policy.policies(domain,name,description,status)
    values('FEES','trading_fee','Maker/taker execution fee policy for VAD markets','ACTIVE')
    returning id into pid;
    insert into policy.policy_versions(policy_id,version,configuration,effective_at,reason)
    values(pid,1,jsonb_build_object('maker_rate_bps',0,'taker_rate_bps',0,'minimum_fee',0,'maximum_fee',null),statement_timestamp(),'Zero-fee launch default')
    returning id into vid;
    update policy.policies set current_version_id=vid where id=pid;
  end if;
end $$;

alter table trading.order_reservations
  add column if not exists initial_fee_reserved numeric(38,18) not null default 0 check(initial_fee_reserved>=0),
  add column if not exists consumed_fee numeric(38,18) not null default 0 check(consumed_fee>=0),
  add column if not exists released_fee numeric(38,18) not null default 0 check(released_fee>=0),
  add column if not exists fee_policy_version_id bigint references policy.policy_versions(id);

alter table trading.order_reservations drop constraint if exists order_fee_reservation_bounds;
alter table trading.order_reservations add constraint order_fee_reservation_bounds check(consumed_fee+released_fee<=initial_fee_reserved);

create table if not exists trading.execution_fees(
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  order_id bigint not null references trading.orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  instrument_id bigint not null references market.instruments(id),
  execution_type text not null check(execution_type in ('COMPLETE_SET','SECONDARY')),
  execution_reference text not null,
  liquidity_role text not null check(liquidity_role in ('MAKER','TAKER')),
  side text not null check(side in ('BUY','SELL')),
  notional numeric(38,18) not null check(notional>0),
  fee_amount numeric(38,18) not null check(fee_amount>=0),
  fee_policy_version_id bigint references policy.policy_versions(id),
  ledger_journal_id bigint references finance.ledger_journals(id),
  created_at timestamptz not null default statement_timestamp(),
  unique(execution_type,execution_reference,order_id)
);
create trigger execution_fees_immutable before update or delete on trading.execution_fees for each row execute function private.reject_immutable_mutation();
alter table trading.execution_fees enable row level security;
revoke all on trading.execution_fees from public,anon,authenticated;
grant all on trading.execution_fees to service_role;

create or replace function command.quote_trading_fee(p_notional numeric,p_liquidity_role text)
returns table(fee_amount numeric,policy_version_id bigint)
language plpgsql stable security definer set search_path=''
as $$
declare cfg jsonb; rate_bps numeric:=0; minimum_fee numeric:=0; maximum_fee numeric:=null;
begin
  select pv.configuration,pv.id into cfg,policy_version_id
  from policy.policies p join policy.policy_versions pv on pv.id=p.current_version_id
  where p.domain='FEES' and p.name='trading_fee' and p.status='ACTIVE'
    and pv.effective_at<=statement_timestamp() and (pv.expires_at is null or pv.expires_at>statement_timestamp()) limit 1;
  if cfg is not null then
    if upper(p_liquidity_role)='MAKER' then rate_bps:=coalesce((cfg->>'maker_rate_bps')::numeric,0);
    elsif upper(p_liquidity_role)='TAKER' then rate_bps:=coalesce((cfg->>'taker_rate_bps')::numeric,0);
    else raise exception 'Invalid liquidity role' using errcode='22023'; end if;
    minimum_fee:=coalesce((cfg->>'minimum_fee')::numeric,0);
    maximum_fee:=nullif(cfg->>'maximum_fee','')::numeric;
  end if;
  if rate_bps<0 or rate_bps>10000 then raise exception 'Trading fee rate is invalid' using errcode='23514'; end if;
  fee_amount:=greatest(round(p_notional*rate_bps/10000,18),minimum_fee);
  if maximum_fee is not null then fee_amount:=least(fee_amount,maximum_fee); end if;
  fee_amount:=greatest(fee_amount,0);
  return next;
end;
$$;
revoke all on function command.quote_trading_fee(numeric,text) from public,anon,authenticated;
grant execute on function command.quote_trading_fee(numeric,text) to service_role;

create or replace function command.max_trading_fee_reserve(p_notional numeric)
returns table(fee_amount numeric,policy_version_id bigint)
language plpgsql stable security definer set search_path=''
as $$
declare maker numeric; taker numeric; pv1 bigint; pv2 bigint;
begin
  select q.fee_amount,q.policy_version_id into maker,pv1 from command.quote_trading_fee(p_notional,'MAKER') q;
  select q.fee_amount,q.policy_version_id into taker,pv2 from command.quote_trading_fee(p_notional,'TAKER') q;
  fee_amount:=greatest(coalesce(maker,0),coalesce(taker,0)); policy_version_id:=coalesce(pv1,pv2); return next;
end;
$$;
revoke all on function command.max_trading_fee_reserve(numeric) from public,anon,authenticated;
grant execute on function command.max_trading_fee_reserve(numeric) to service_role;

create or replace function command.charge_execution_fee(
  p_order_id bigint,p_execution_type text,p_execution_reference text,p_liquidity_role text,p_side text,p_notional numeric
)
returns numeric
language plpgsql security definer set search_path=''
as $$
declare ord trading.orders; instrument market.instruments; fee numeric(38,18); pv bigint; fee_account bigint; source_account bigint; journal_id bigint; res trading.order_reservations;
begin
  if exists(select 1 from trading.execution_fees where execution_type=p_execution_type and execution_reference=p_execution_reference and order_id=p_order_id) then
    select fee_amount into fee from trading.execution_fees where execution_type=p_execution_type and execution_reference=p_execution_reference and order_id=p_order_id; return fee;
  end if;
  select * into ord from trading.orders where id=p_order_id for update;
  select * into instrument from market.instruments where id=ord.instrument_id;
  select q.fee_amount,q.policy_version_id into fee,pv from command.quote_trading_fee(p_notional,p_liquidity_role) q;
  fee:=coalesce(fee,0);
  if fee>0 then
    fee_account:=finance.ensure_platform_account(instrument.asset_id,'PLATFORM_TRADING_FEE_REVENUE');
    if upper(p_side)='BUY' then
      select * into res from trading.order_reservations where order_id=ord.id for update;
      if res.order_id is null or res.initial_fee_reserved-res.consumed_fee-res.released_fee<fee then raise exception 'Reserved trading fee capacity is insufficient' using errcode='23514'; end if;
      source_account:=res.reserved_account_id;
      journal_id:=finance.transfer(instrument.asset_id,source_account,fee_account,fee,'TRADING_FEE','trade-fee:'||p_execution_type||':'||p_execution_reference||':'||ord.public_id::text,p_execution_type,p_execution_reference,'VAD execution fee',ord.user_id);
      update trading.order_reservations set consumed_fee=consumed_fee+fee where order_id=ord.id;
    else
      source_account:=finance.ensure_user_account(ord.user_id,instrument.asset_id,'USER_AVAILABLE');
      if finance.account_balance(source_account)<fee then raise exception 'Seller proceeds cannot cover trading fee' using errcode='23514'; end if;
      journal_id:=finance.transfer(instrument.asset_id,source_account,fee_account,fee,'TRADING_FEE','trade-fee:'||p_execution_type||':'||p_execution_reference||':'||ord.public_id::text,p_execution_type,p_execution_reference,'VAD execution fee',ord.user_id);
    end if;
  end if;
  insert into trading.execution_fees(order_id,user_id,instrument_id,execution_type,execution_reference,liquidity_role,side,notional,fee_amount,fee_policy_version_id,ledger_journal_id)
  values(ord.id,ord.user_id,ord.instrument_id,p_execution_type,p_execution_reference,upper(p_liquidity_role),upper(p_side),p_notional,fee,pv,journal_id);
  return fee;
end;
$$;
revoke all on function command.charge_execution_fee(bigint,text,text,text,text,numeric) from public,anon,authenticated;
grant execute on function command.charge_execution_fee(bigint,text,text,text,text,numeric) to service_role;

create or replace function command.complete_set_fill_fee_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform command.charge_execution_fee(new.order_id,'COMPLETE_SET',new.match_id::text,new.liquidity_role,'BUY',new.notional); return new; end; $$;
drop trigger if exists complete_set_fill_charge_fee on trading.fills;
create trigger complete_set_fill_charge_fee after insert on trading.fills for each row execute function command.complete_set_fill_fee_trigger();

create or replace function command.secondary_fill_fee_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin perform command.charge_execution_fee(new.order_id,'SECONDARY',new.secondary_match_id::text,new.liquidity_role,new.side,new.notional); return new; end; $$;
drop trigger if exists secondary_fill_charge_fee on trading.secondary_fills;
create trigger secondary_fill_charge_fee after insert on trading.secondary_fills for each row execute function command.secondary_fill_fee_trigger();

create or replace function command.release_order_fee_reserve_trigger() returns trigger language plpgsql security definer set search_path='' as $$
declare res trading.order_reservations; instrument market.instruments; available_account bigint; amount numeric(38,18);
begin
  if new.side='BUY' and new.status in ('FILLED','CANCELLED','EXPIRED','REJECTED') and old.status is distinct from new.status then
    select * into res from trading.order_reservations where order_id=new.id for update;
    if res.order_id is not null then
      amount:=round(res.initial_fee_reserved-res.consumed_fee-res.released_fee,18);
      if amount>0 then
        select * into instrument from market.instruments where id=new.instrument_id;
        available_account:=finance.ensure_user_account(new.user_id,instrument.asset_id,'USER_AVAILABLE');
        perform finance.transfer(instrument.asset_id,res.reserved_account_id,available_account,amount,'ORDER_FEE_RESERVE_RELEASE','fee-release:'||new.public_id::text,'ORDER',new.public_id::text,'Release unused VAD trading fee reserve',new.user_id);
        update trading.order_reservations set released_fee=released_fee+amount where order_id=new.id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists order_terminal_release_fee_reserve on trading.orders;
create trigger order_terminal_release_fee_reserve after update of status on trading.orders for each row execute function command.release_order_fee_reserve_trigger();

create or replace function command.reserve_for_order(p_user_id uuid,p_market_id bigint,p_outcome_id bigint,p_side text,p_price numeric,p_quantity numeric,p_idempotency_key text)
returns uuid language plpgsql security definer set search_path='' as $$
declare instrument market.instruments; outcome market.outcomes; required_amount numeric(38,18); fee_reserve numeric(38,18):=0; fee_pv bigint; total_reserve numeric(38,18); available_account bigint; reserved_account bigint; current_available numeric(38,18); available_shares numeric(38,18); order_public_id uuid; order_id bigint; seq bigint;
begin
  if p_side not in ('BUY','SELL') then raise exception 'Unsupported order side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_quantity is null or p_quantity<=0 then raise exception 'Positive price and quantity required' using errcode='22023'; end if;
  select * into instrument from market.instruments where id=p_market_id for share;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status<>'OPEN' or instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then raise exception 'Market is not open for trading' using errcode='P0001'; end if;
  if p_price>=instrument.settlement_unit then raise exception 'Price must be below settlement unit' using errcode='22023'; end if;
  select * into outcome from market.outcomes where id=p_outcome_id and instrument_id=p_market_id; if outcome.id is null then raise exception 'Outcome not found for market' using errcode='P0002'; end if;
  required_amount:=round(p_price*p_quantity,18); if required_amount<instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode='22023'; end if;
  select o.id,o.public_id into order_id,order_public_id from trading.orders o where o.idempotency_key=p_idempotency_key and o.user_id=p_user_id;
  if order_public_id is not null then perform command.match_best_order(order_id); return order_public_id; end if;
  seq:=nextval('trading.order_sequence');
  if p_side='BUY' then
    select q.fee_amount,q.policy_version_id into fee_reserve,fee_pv from command.max_trading_fee_reserve(required_amount) q;
    total_reserve:=required_amount+coalesce(fee_reserve,0);
    available_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_AVAILABLE'); reserved_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_RESERVED');
    perform pg_advisory_xact_lock(hashtextextended('vad-wallet:'||p_user_id::text||':'||instrument.asset_id::text,0)); current_available:=finance.account_balance(available_account);
    if current_available<total_reserve then raise exception 'Insufficient available balance including trading fee reserve' using errcode='P0001'; end if;
    perform finance.transfer(instrument.asset_id,available_account,reserved_account,total_reserve,'ORDER_RESERVE','reserve:'||p_idempotency_key,'ORDER',p_idempotency_key,'Reserve notional and worst-case trading fee for VAD limit order',p_user_id);
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key) values(p_user_id,p_market_id,p_outcome_id,'BUY','LIMIT',p_price,p_quantity,0,reserved_account,seq,'OPEN',p_idempotency_key) returning id,public_id into order_id,order_public_id;
    insert into trading.order_reservations(order_id,asset_id,reserved_account_id,initial_reserved,initial_fee_reserved,fee_policy_version_id) values(order_id,instrument.asset_id,reserved_account,required_amount,coalesce(fee_reserve,0),fee_pv);
  else
    perform pg_advisory_xact_lock(hashtextextended('vad-position:'||p_user_id::text||':'||p_market_id::text||':'||p_outcome_id::text,0)); available_shares:=command.position_available_to_sell(p_user_id,p_market_id,p_outcome_id); if available_shares<p_quantity then raise exception 'Insufficient available shares' using errcode='P0001'; end if;
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key) values(p_user_id,p_market_id,p_outcome_id,'SELL','LIMIT',p_price,p_quantity,0,null,seq,'OPEN',p_idempotency_key) returning id,public_id into order_id,order_public_id;
    insert into trading.share_reservations(order_id,user_id,instrument_id,outcome_id,initial_quantity) values(order_id,p_user_id,p_market_id,p_outcome_id,p_quantity);
  end if;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('ORDER_PLACED','ORDER',order_public_id::text,jsonb_build_object('order_id',order_public_id,'instrument_id',p_market_id,'outcome_id',p_outcome_id,'user_id',p_user_id,'side',p_side,'price',p_price,'quantity',p_quantity,'fee_reserve',fee_reserve),'order-placed:'||order_public_id::text);
  perform command.match_best_order(order_id); return order_public_id;
end;
$$;

create or replace function public.admin_create_trading_fee_policy_draft(p_maker_rate_bps numeric,p_taker_rate_bps numeric,p_minimum_fee numeric default 0,p_maximum_fee numeric default null,p_reason text default 'Trading fee policy update') returns bigint language plpgsql security definer set search_path='' as $$
declare pol policy.policies; next_version integer; version_id bigint;
begin
  if not private.has_permission('policies.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  if p_maker_rate_bps<0 or p_maker_rate_bps>10000 or p_taker_rate_bps<0 or p_taker_rate_bps>10000 then raise exception 'Fee rates must be 0-10000 bps' using errcode='22023'; end if;
  select * into pol from policy.policies where domain='FEES' and name='trading_fee' for update;
  select coalesce(max(version),0)+1 into next_version from policy.policy_versions where policy_id=pol.id;
  insert into policy.policy_versions(policy_id,version,configuration,effective_at,created_by,reason) values(pol.id,next_version,jsonb_build_object('maker_rate_bps',p_maker_rate_bps,'taker_rate_bps',p_taker_rate_bps,'minimum_fee',greatest(coalesce(p_minimum_fee,0),0),'maximum_fee',p_maximum_fee),statement_timestamp(),auth.uid(),p_reason) returning id into version_id;
  return version_id;
end;
$$;

create or replace function public.admin_approve_trading_fee_policy(p_policy_version_id bigint,p_effective_at timestamptz default statement_timestamp()) returns boolean language plpgsql security definer set search_path='' as $$
declare pv policy.policy_versions; pol policy.policies;
begin
  if not private.has_permission('policies.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  select * into pv from policy.policy_versions where id=p_policy_version_id for update;
  if pv.id is null or pv.created_by is null or pv.approved_by is not null then raise exception 'Pending policy version required' using errcode='P0001'; end if;
  if pv.created_by=auth.uid() then raise exception 'Different administrator must approve fee policy' using errcode='42501'; end if;
  update policy.policy_versions set approved_by=auth.uid(),effective_at=p_effective_at where id=pv.id;
  select * into pol from policy.policies where id=pv.policy_id for update;
  update policy.policies set current_version_id=pv.id,status='ACTIVE',updated_at=statement_timestamp() where id=pol.id;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state) values(auth.uid(),'USER','TRADING_FEE_POLICY_APPROVE','POLICY_VERSION',pv.id::text,jsonb_build_object('policy_id',pol.id,'version',pv.version,'effective_at',p_effective_at));
  return true;
end;
$$;

revoke all on function public.admin_create_trading_fee_policy_draft(numeric,numeric,numeric,numeric,text) from public,anon;
grant execute on function public.admin_create_trading_fee_policy_draft(numeric,numeric,numeric,numeric,text) to authenticated;
revoke all on function public.admin_approve_trading_fee_policy(bigint,timestamptz) from public,anon;
grant execute on function public.admin_approve_trading_fee_policy(bigint,timestamptz) to authenticated;
