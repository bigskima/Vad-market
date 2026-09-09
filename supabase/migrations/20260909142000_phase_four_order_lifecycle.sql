-- VAD Phase 4C: expose SELL safely through existing order RPCs and ensure close/cancel
-- releases the correct reservation type.

create or replace function command.reserve_for_order(
  p_user_id uuid,p_market_id bigint,p_outcome_id bigint,p_side text,p_price numeric,p_quantity numeric,p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  instrument market.instruments; outcome market.outcomes; required_amount numeric(38,18);
  available_account bigint; reserved_account bigint; current_available numeric(38,18); available_shares numeric(38,18);
  order_public_id uuid; order_id bigint; seq bigint;
begin
  if p_side not in ('BUY','SELL') then raise exception 'Unsupported order side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 then raise exception 'Price must be positive' using errcode='22023'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Quantity must be positive' using errcode='22023'; end if;
  select * into instrument from market.instruments where id=p_market_id for share;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status<>'OPEN' then raise exception 'Market is not open' using errcode='P0001'; end if;
  if instrument.opened_at is null or instrument.opened_at>statement_timestamp() or (instrument.closed_at is not null and instrument.closed_at<=statement_timestamp()) then
    raise exception 'Market is outside its trading window' using errcode='P0001';
  end if;
  if p_price>=instrument.settlement_unit then raise exception 'Price must be below settlement unit' using errcode='22023'; end if;
  select * into outcome from market.outcomes where id=p_outcome_id and instrument_id=p_market_id;
  if outcome.id is null then raise exception 'Outcome not found for market' using errcode='P0002'; end if;
  required_amount:=round(p_price*p_quantity,18);
  if required_amount<instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode='22023'; end if;

  select o.id,o.public_id into order_id,order_public_id from trading.orders o
    where o.idempotency_key=p_idempotency_key and o.user_id=p_user_id;
  if order_public_id is not null then
    perform command.match_best_order(order_id);
    return order_public_id;
  end if;

  seq:=nextval('trading.order_sequence');
  if p_side='BUY' then
    available_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_AVAILABLE');
    reserved_account:=finance.ensure_user_account(p_user_id,instrument.asset_id,'USER_RESERVED');
    perform pg_advisory_xact_lock(hashtextextended('vad-wallet:'||p_user_id::text||':'||instrument.asset_id::text,0));
    current_available:=finance.account_balance(available_account);
    if current_available<required_amount then raise exception 'Insufficient available balance' using errcode='P0001'; end if;
    perform finance.transfer(instrument.asset_id,available_account,reserved_account,required_amount,'ORDER_RESERVE','reserve:'||p_idempotency_key,'ORDER',p_idempotency_key,'Reserve funds for VAD limit order',p_user_id);
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key)
    values(p_user_id,p_market_id,p_outcome_id,'BUY','LIMIT',p_price,p_quantity,0,reserved_account,seq,'OPEN',p_idempotency_key)
    returning id,public_id into order_id,order_public_id;
    insert into trading.order_reservations(order_id,asset_id,reserved_account_id,initial_reserved)
    values(order_id,instrument.asset_id,reserved_account,required_amount);
  else
    perform pg_advisory_xact_lock(hashtextextended('vad-position:'||p_user_id::text||':'||p_market_id::text||':'||p_outcome_id::text,0));
    available_shares:=command.position_available_to_sell(p_user_id,p_market_id,p_outcome_id);
    if available_shares<p_quantity then raise exception 'Insufficient available shares' using errcode='P0001'; end if;
    insert into trading.orders(user_id,instrument_id,outcome_id,side,order_type,limit_price,quantity,filled_quantity,reserved_account_id,sequence_number,status,idempotency_key)
    values(p_user_id,p_market_id,p_outcome_id,'SELL','LIMIT',p_price,p_quantity,0,null,seq,'OPEN',p_idempotency_key)
    returning id,public_id into order_id,order_public_id;
    insert into trading.share_reservations(order_id,user_id,instrument_id,outcome_id,initial_quantity)
    values(order_id,p_user_id,p_market_id,p_outcome_id,p_quantity);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_PLACED','ORDER',order_public_id::text,
    jsonb_build_object('order_id',order_public_id,'instrument_id',p_market_id,'outcome_id',p_outcome_id,'user_id',p_user_id,'side',p_side,'price',p_price,'quantity',p_quantity),
    'order-placed:'||order_public_id::text);
  perform command.match_best_order(order_id);
  return order_public_id;
end;
$$;

create or replace function public.cancel_order(p_order_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  account public.user_accounts; ord trading.orders; cash_res trading.order_reservations; share_res trading.share_reservations;
  instrument market.instruments; available_account bigint; releasable numeric(38,18):=0; shares_releasable numeric(38,18):=0;
begin
  account:=private.require_active_account();
  select * into ord from trading.orders where public_id=p_order_public_id and user_id=auth.uid() for update;
  if ord.id is null then raise exception 'Order not found' using errcode='P0002'; end if;
  if ord.status not in ('OPEN','PARTIALLY_FILLED') then raise exception 'Order cannot be cancelled from current state' using errcode='P0001'; end if;
  select * into instrument from market.instruments where id=ord.instrument_id;

  if ord.side='BUY' then
    select * into cash_res from trading.order_reservations where order_id=ord.id for update;
    if cash_res.order_id is null then raise exception 'Cash reservation is missing' using errcode='23514'; end if;
    releasable:=round(cash_res.initial_reserved-cash_res.consumed_notional-cash_res.released_notional,18);
    if releasable>0 then
      available_account:=finance.ensure_user_account(auth.uid(),instrument.asset_id,'USER_AVAILABLE');
      perform finance.transfer(instrument.asset_id,cash_res.reserved_account_id,available_account,releasable,'ORDER_RESERVATION_RELEASE','cancel:'||ord.public_id::text,'ORDER',ord.public_id::text,'Release unused VAD order cash',auth.uid());
      update trading.order_reservations set released_notional=released_notional+releasable where order_id=ord.id;
    end if;
  else
    select * into share_res from trading.share_reservations where order_id=ord.id for update;
    if share_res.order_id is null then raise exception 'Share reservation is missing' using errcode='23514'; end if;
    shares_releasable:=share_res.initial_quantity-share_res.consumed_quantity-share_res.released_quantity;
    if shares_releasable>0 then
      update trading.share_reservations set released_quantity=released_quantity+shares_releasable where order_id=ord.id;
    end if;
  end if;

  update trading.orders set status='CANCELLED',updated_at=statement_timestamp() where id=ord.id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_CANCELLED','ORDER',ord.public_id::text,
    jsonb_build_object('order_id',ord.public_id,'user_id',auth.uid(),'released_cash',releasable,'released_shares',shares_releasable),
    'order-cancelled:'||ord.public_id::text) on conflict(idempotency_key) do nothing;
  return true;
end;
$$;

create or replace function command.release_open_orders_for_instrument(p_instrument_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  ord trading.orders; cash_res trading.order_reservations; share_res trading.share_reservations; instrument market.instruments;
  available_account bigint; releasable numeric(38,18); n integer:=0;
begin
  select * into instrument from market.instruments where id=p_instrument_id for update;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  for ord in select * from trading.orders where instrument_id=p_instrument_id and status in ('OPEN','PARTIALLY_FILLED') for update loop
    if ord.side='BUY' then
      select * into cash_res from trading.order_reservations where order_id=ord.id for update;
      releasable:=coalesce(cash_res.initial_reserved-cash_res.consumed_notional-cash_res.released_notional,0);
      if releasable>0 then
        available_account:=finance.ensure_user_account(ord.user_id,instrument.asset_id,'USER_AVAILABLE');
        perform finance.transfer(instrument.asset_id,cash_res.reserved_account_id,available_account,releasable,'MARKET_CLOSE_ORDER_RELEASE','market-close:'||p_instrument_id::text||':'||ord.public_id::text,'ORDER',ord.public_id::text,'Release cash reservation at market close',ord.user_id);
        update trading.order_reservations set released_notional=released_notional+releasable where order_id=ord.id;
      end if;
    else
      select * into share_res from trading.share_reservations where order_id=ord.id for update;
      if share_res.order_id is not null then
        update trading.share_reservations set released_quantity=released_quantity+(initial_quantity-consumed_quantity-released_quantity) where order_id=ord.id;
      end if;
    end if;
    update trading.orders set status='CANCELLED',updated_at=statement_timestamp() where id=ord.id;
    n:=n+1;
  end loop;
  return n;
end;
$$;

revoke all on function command.release_open_orders_for_instrument(bigint) from public,anon,authenticated;
grant execute on function command.release_open_orders_for_instrument(bigint) to service_role;
