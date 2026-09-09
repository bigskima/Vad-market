-- VAD Phase 4B: same-outcome secondary matching and liquidity routing.

create or replace function command.match_secondary_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  incoming trading.orders; resting trading.orders; buyer trading.orders; seller trading.orders; instrument market.instruments;
  fill_qty numeric(38,18); price numeric(38,18); notional numeric(38,18); improvement numeric(38,18):=0;
  buyer_res trading.order_reservations; seller_res trading.share_reservations; seller_pos trading.positions;
  seller_cost numeric(38,18); seller_available bigint; buyer_available bigint;
  cash_journal bigint; improvement_journal bigint; match_id bigint; match_public_id uuid:=gen_random_uuid(); key text;
begin
  select * into incoming from trading.orders where id=p_order_id for update;
  if incoming.id is null or incoming.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;
  select * into instrument from market.instruments where id=incoming.instrument_id for share;
  if instrument.status<>'OPEN' then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('vad-orderbook:'||instrument.id::text,0));

  if incoming.side='BUY' then
    select o.* into resting from trading.orders o
    where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id
      and o.side='SELL' and o.status in ('OPEN','PARTIALLY_FILLED')
      and o.user_id<>incoming.user_id and o.limit_price<=incoming.limit_price
      and (o.expires_at is null or o.expires_at>statement_timestamp())
    order by o.limit_price asc,o.sequence_number asc limit 1 for update skip locked;
  else
    select o.* into resting from trading.orders o
    where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id
      and o.side='BUY' and o.status in ('OPEN','PARTIALLY_FILLED')
      and o.user_id<>incoming.user_id and o.limit_price>=incoming.limit_price
      and (o.expires_at is null or o.expires_at>statement_timestamp())
    order by o.limit_price desc,o.sequence_number asc limit 1 for update skip locked;
  end if;
  if resting.id is null then return 0; end if;

  fill_qty:=least(incoming.quantity-incoming.filled_quantity,resting.quantity-resting.filled_quantity);
  if fill_qty<=0 then return 0; end if;
  price:=resting.limit_price;
  notional:=round(price*fill_qty,18);
  if incoming.side='BUY' then buyer:=incoming; seller:=resting; else buyer:=resting; seller:=incoming; end if;

  select * into buyer_res from trading.order_reservations where order_id=buyer.id for update;
  select * into seller_res from trading.share_reservations where order_id=seller.id for update;
  select * into seller_pos from trading.positions
    where user_id=seller.user_id and instrument_id=seller.instrument_id and outcome_id=seller.outcome_id for update;
  if buyer_res.order_id is null or buyer_res.initial_reserved-buyer_res.consumed_notional-buyer_res.released_notional<notional then
    raise exception 'Buyer cash reservation is insufficient' using errcode='23514';
  end if;
  if seller_res.order_id is null or seller_res.initial_quantity-seller_res.consumed_quantity-seller_res.released_quantity<fill_qty then
    raise exception 'Seller share reservation is insufficient' using errcode='23514';
  end if;
  if seller_pos.user_id is null or seller_pos.quantity<fill_qty then
    raise exception 'Seller position is insufficient' using errcode='23514';
  end if;

  seller_cost:=case when seller_pos.quantity=0 then 0 else round(seller_pos.total_cost_basis*(fill_qty/seller_pos.quantity),18) end;
  seller_available:=finance.ensure_user_account(seller.user_id,instrument.asset_id,'USER_AVAILABLE');
  key:='secondary:'||resting.public_id::text||':'||incoming.public_id::text||':'||resting.filled_quantity::text||':'||incoming.filled_quantity::text||':'||fill_qty::text;
  cash_journal:=finance.transfer(instrument.asset_id,buyer_res.reserved_account_id,seller_available,notional,'SECONDARY_TRADE','cash:'||key,'SECONDARY_MATCH',match_public_id::text,'Transfer cash for existing VAD shares',buyer.user_id);

  if buyer.id=incoming.id and buyer.limit_price>price then
    improvement:=round((buyer.limit_price-price)*fill_qty,18);
    if improvement>0 then
      buyer_available:=finance.ensure_user_account(buyer.user_id,instrument.asset_id,'USER_AVAILABLE');
      improvement_journal:=finance.transfer(instrument.asset_id,buyer_res.reserved_account_id,buyer_available,improvement,'ORDER_PRICE_IMPROVEMENT_RELEASE','secondary-improvement:'||key,'SECONDARY_MATCH',match_public_id::text,'Release secondary trade price improvement',buyer.user_id);
    end if;
  end if;

  insert into trading.secondary_matches(public_id,instrument_id,outcome_id,maker_order_id,taker_order_id,buyer_user_id,seller_user_id,price,quantity,notional,cash_journal_id,price_improvement_journal_id,idempotency_key)
  values(match_public_id,instrument.id,incoming.outcome_id,resting.id,incoming.id,buyer.user_id,seller.user_id,price,fill_qty,notional,cash_journal,improvement_journal,key)
  returning id into match_id;
  insert into trading.secondary_fills(secondary_match_id,order_id,user_id,side,liquidity_role,price,quantity,notional) values
    (match_id,resting.id,resting.user_id,resting.side,'MAKER',price,fill_qty,notional),
    (match_id,incoming.id,incoming.user_id,incoming.side,'TAKER',price,fill_qty,notional);

  update trading.order_reservations
    set consumed_notional=consumed_notional+notional,released_notional=released_notional+improvement
    where order_id=buyer.id;
  update trading.share_reservations set consumed_quantity=consumed_quantity+fill_qty where order_id=seller.id;
  update trading.positions
    set quantity=quantity-fill_qty,total_cost_basis=greatest(total_cost_basis-seller_cost,0),
        realized_pnl=realized_pnl+(notional-seller_cost),updated_at=statement_timestamp()
    where user_id=seller.user_id and instrument_id=instrument.id and outcome_id=seller.outcome_id;
  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(buyer.user_id,instrument.id,buyer.outcome_id,fill_qty,notional,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update
    set quantity=trading.positions.quantity+excluded.quantity,
        total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,
        updated_at=statement_timestamp();

  update trading.orders set filled_quantity=filled_quantity+fill_qty,
    status=case when filled_quantity+fill_qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,
    updated_at=statement_timestamp() where id=resting.id;
  update trading.orders set filled_quantity=filled_quantity+fill_qty,
    status=case when filled_quantity+fill_qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,
    updated_at=statement_timestamp() where id=incoming.id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_MATCHED','SECONDARY_MATCH',match_public_id::text,
    jsonb_build_object('match_type','SECONDARY','instrument_id',instrument.public_id,'outcome_id',incoming.outcome_id,'price',price,'quantity',fill_qty,'buyer_user_id',buyer.user_id,'seller_user_id',seller.user_id),
    'event:'||key) on conflict(idempotency_key) do nothing;
  perform command.refresh_market_catalog(instrument.id);
  return 1;
end;
$$;

-- Execute one complete-set match so a routing loop can interleave both liquidity sources.
create or replace function command.match_one_complementary_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  incoming trading.orders; resting trading.orders; instrument market.instruments;
  qty numeric(38,18); maker_price numeric(38,18); taker_price numeric(38,18); maker_amount numeric(38,18); taker_amount numeric(38,18); improvement numeric(38,18);
  collateral_account bigint; taker_available bigint; collateral_journal bigint; improvement_journal bigint; match_id bigint; match_public_id uuid:=gen_random_uuid(); key text;
begin
  select * into incoming from trading.orders where id=p_order_id for update;
  if incoming.id is null or incoming.side<>'BUY' or incoming.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;
  select * into instrument from market.instruments where id=incoming.instrument_id for share;
  perform pg_advisory_xact_lock(hashtextextended('vad-orderbook:'||instrument.id::text,0));
  select o.* into resting from trading.orders o
  where o.instrument_id=incoming.instrument_id and o.outcome_id<>incoming.outcome_id and o.side='BUY'
    and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id
    and o.limit_price+incoming.limit_price>=instrument.settlement_unit
    and (o.expires_at is null or o.expires_at>statement_timestamp())
  order by o.limit_price desc,o.sequence_number asc limit 1 for update skip locked;
  if resting.id is null then return 0; end if;
  qty:=least(incoming.quantity-incoming.filled_quantity,resting.quantity-resting.filled_quantity);
  if qty<=0 then return 0; end if;
  maker_price:=resting.limit_price; taker_price:=round(instrument.settlement_unit-maker_price,18);
  maker_amount:=round(maker_price*qty,18); taker_amount:=round(taker_price*qty,18);
  if taker_price<=0 or taker_price>incoming.limit_price or round(maker_amount+taker_amount,18)<>round(instrument.settlement_unit*qty,18) then
    raise exception 'Complete-set pricing invariant failed' using errcode='23514';
  end if;
  if not exists(select 1 from trading.order_reservations r where r.order_id=resting.id and r.initial_reserved-r.consumed_notional-r.released_notional>=maker_amount)
     or not exists(select 1 from trading.order_reservations r where r.order_id=incoming.id and r.initial_reserved-r.consumed_notional-r.released_notional>=taker_amount) then
    raise exception 'Complete-set reservation invariant failed' using errcode='23514';
  end if;
  key:='match:'||resting.public_id::text||':'||incoming.public_id::text||':'||resting.filled_quantity::text||':'||incoming.filled_quantity::text||':'||qty::text;
  collateral_account:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  collateral_journal:=finance.collateralize_complete_set(instrument.asset_id,resting.reserved_account_id,incoming.reserved_account_id,collateral_account,maker_amount,taker_amount,'collateral:'||key,match_public_id::text);
  improvement:=round((incoming.limit_price-taker_price)*qty,18);
  if improvement>0 then
    taker_available:=finance.ensure_user_account(incoming.user_id,instrument.asset_id,'USER_AVAILABLE');
    improvement_journal:=finance.transfer(instrument.asset_id,incoming.reserved_account_id,taker_available,improvement,'ORDER_PRICE_IMPROVEMENT_RELEASE','improvement:'||key,'MATCH',match_public_id::text,'Release complete-set price improvement',incoming.user_id);
  end if;
  insert into trading.matches(public_id,instrument_id,maker_order_id,taker_order_id,quantity,settlement_unit,maker_price,taker_price,collateral_amount,collateral_journal_id,price_improvement_journal_id,idempotency_key)
  values(match_public_id,instrument.id,resting.id,incoming.id,qty,instrument.settlement_unit,maker_price,taker_price,round(instrument.settlement_unit*qty,18),collateral_journal,improvement_journal,key)
  returning id into match_id;
  insert into trading.fills(match_id,order_id,user_id,outcome_id,liquidity_role,price,quantity,notional) values
    (match_id,resting.id,resting.user_id,resting.outcome_id,'MAKER',maker_price,qty,maker_amount),
    (match_id,incoming.id,incoming.user_id,incoming.outcome_id,'TAKER',taker_price,qty,taker_amount);
  update trading.order_reservations set consumed_notional=consumed_notional+maker_amount where order_id=resting.id;
  update trading.order_reservations set consumed_notional=consumed_notional+taker_amount,released_notional=released_notional+improvement where order_id=incoming.id;
  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(resting.user_id,instrument.id,resting.outcome_id,qty,maker_amount,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update set quantity=trading.positions.quantity+excluded.quantity,total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,updated_at=statement_timestamp();
  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(incoming.user_id,instrument.id,incoming.outcome_id,qty,taker_amount,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update set quantity=trading.positions.quantity+excluded.quantity,total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,updated_at=statement_timestamp();
  update trading.orders set filled_quantity=filled_quantity+qty,status=case when filled_quantity+qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,updated_at=statement_timestamp() where id=resting.id;
  update trading.orders set filled_quantity=filled_quantity+qty,status=case when filled_quantity+qty>=quantity then 'FILLED' else 'PARTIALLY_FILLED' end,updated_at=statement_timestamp() where id=incoming.id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('ORDER_MATCHED','MATCH',match_public_id::text,jsonb_build_object('match_type','COMPLETE_SET','instrument_id',instrument.public_id,'quantity',qty,'maker_price',maker_price,'taker_price',taker_price),'event:'||key)
  on conflict(idempotency_key) do nothing;
  perform command.refresh_market_catalog(instrument.id);
  return 1;
end;
$$;

create or replace function command.match_best_order(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  incoming trading.orders; instrument market.instruments; secondary_price numeric(38,18); complementary_price numeric(38,18);
  secondary_seq bigint; complementary_seq bigint; n integer; total integer:=0;
begin
  loop
    select * into incoming from trading.orders where id=p_order_id for update;
    exit when incoming.id is null or incoming.status not in ('OPEN','PARTIALLY_FILLED') or incoming.filled_quantity>=incoming.quantity;
    select * into instrument from market.instruments where id=incoming.instrument_id;
    secondary_price:=null; complementary_price:=null; secondary_seq:=null; complementary_seq:=null;
    if incoming.side='SELL' then
      select o.limit_price,o.sequence_number into secondary_price,secondary_seq from trading.orders o
      where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id and o.side='BUY'
        and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id and o.limit_price>=incoming.limit_price
      order by o.limit_price desc,o.sequence_number asc limit 1;
      exit when secondary_price is null;
      n:=command.match_secondary_order(incoming.id);
    else
      select o.limit_price,o.sequence_number into secondary_price,secondary_seq from trading.orders o
      where o.instrument_id=incoming.instrument_id and o.outcome_id=incoming.outcome_id and o.side='SELL'
        and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id and o.limit_price<=incoming.limit_price
      order by o.limit_price asc,o.sequence_number asc limit 1;
      select round(instrument.settlement_unit-o.limit_price,18),o.sequence_number into complementary_price,complementary_seq from trading.orders o
      where o.instrument_id=incoming.instrument_id and o.outcome_id<>incoming.outcome_id and o.side='BUY'
        and o.status in ('OPEN','PARTIALLY_FILLED') and o.user_id<>incoming.user_id and o.limit_price+incoming.limit_price>=instrument.settlement_unit
      order by o.limit_price desc,o.sequence_number asc limit 1;
      exit when secondary_price is null and complementary_price is null;
      if complementary_price is null or (secondary_price is not null and (secondary_price<complementary_price or (secondary_price=complementary_price and secondary_seq<=complementary_seq))) then
        n:=command.match_secondary_order(incoming.id);
      else
        n:=command.match_one_complementary_order(incoming.id);
      end if;
    end if;
    exit when coalesce(n,0)=0;
    total:=total+n;
  end loop;
  return total;
end;
$$;

revoke all on function command.match_secondary_order(bigint),command.match_one_complementary_order(bigint),command.match_best_order(bigint) from public,anon,authenticated;
grant execute on function command.match_secondary_order(bigint),command.match_one_complementary_order(bigint),command.match_best_order(bigint) to service_role;
