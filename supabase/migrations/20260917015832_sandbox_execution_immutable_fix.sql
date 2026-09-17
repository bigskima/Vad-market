create or replace function command.execute_sandbox_liquidity(p_order_id bigint)
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  ord trading.orders;
  instrument market.instruments;
  asset public.assets;
  res trading.order_reservations;
  qty numeric(38,18);
  ref_price numeric(38,18);
  user_amount numeric(38,18);
  subsidy numeric(38,18);
  improvement numeric(38,18);
  collateral_account bigint;
  issuer_account bigint;
  available_account bigint;
  user_journal bigint;
  subsidy_journal bigint;
  execution_public_id uuid;
  execution_fee numeric(38,18);
  issuer_reference text;
begin
  select * into ord from trading.orders where id=p_order_id for update;
  if ord.id is null or ord.side<>'BUY' or ord.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;

  select * into instrument from market.instruments where id=ord.instrument_id for share;
  if instrument.id is null or instrument.status<>'OPEN' then return 0; end if;

  select * into asset from public.assets where id=instrument.asset_id;
  if not coalesce((asset.metadata->>'sandbox_only')::boolean,false)
     or not coalesce((asset.metadata->>'sandbox_instant_liquidity')::boolean,false) then return 0; end if;

  ref_price:=nullif(asset.metadata->>'sandbox_reference_price','')::numeric;
  if ref_price is null or ref_price<=0 or ref_price>=instrument.settlement_unit then return 0; end if;
  if ord.limit_price<ref_price then return 0; end if;

  perform pg_advisory_xact_lock(hashtextextended('vad-sandbox-liquidity:'||instrument.id::text,0));
  select * into ord from trading.orders where id=p_order_id for update;
  qty:=ord.quantity-ord.filled_quantity;
  if qty<=0 or ord.status not in ('OPEN','PARTIALLY_FILLED') then return 0; end if;

  select * into res from trading.order_reservations where order_id=ord.id for update;
  if res.order_id is null then raise exception 'Sandbox order reservation is missing' using errcode='23514'; end if;

  user_amount:=round(ref_price*qty,18);
  subsidy:=round((instrument.settlement_unit-ref_price)*qty,18);
  improvement:=round((ord.limit_price-ref_price)*qty,18);
  if res.initial_reserved-res.consumed_notional-res.released_notional < user_amount+improvement then
    raise exception 'Sandbox order reservation is insufficient' using errcode='23514';
  end if;

  collateral_account:=finance.ensure_market_collateral_account(instrument.id,instrument.asset_id);
  issuer_reference:=coalesce(nullif(asset.metadata->>'sandbox_issuer_reference',''),'SANDBOX_TEST_NGN_ISSUER');
  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
  values(instrument.asset_id,'TREASURY','PLATFORM',issuer_reference)
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
  select id into issuer_account from finance.ledger_accounts
  where asset_id=instrument.asset_id and account_type='TREASURY' and owner_type='PLATFORM' and owner_reference=issuer_reference;

  execution_public_id:=gen_random_uuid();
  user_journal:=finance.transfer(
    instrument.asset_id,res.reserved_account_id,collateral_account,user_amount,
    'SANDBOX_MARKET_COLLATERAL','sandbox-user-collateral:'||ord.public_id::text,
    'SANDBOX_EXECUTION',execution_public_id::text,
    'Fund sandbox market collateral from tester order reservation',ord.user_id
  );
  if subsidy>0 then
    subsidy_journal:=finance.transfer(
      instrument.asset_id,issuer_account,collateral_account,subsidy,
      'SANDBOX_LIQUIDITY_SUBSIDY','sandbox-liquidity-subsidy:'||ord.public_id::text,
      'SANDBOX_EXECUTION',execution_public_id::text,
      'Synthetic sandbox liquidity subsidy; no real-world value',null
    );
  end if;
  if improvement>0 then
    available_account:=finance.ensure_user_account(ord.user_id,instrument.asset_id,'USER_AVAILABLE');
    perform finance.transfer(
      instrument.asset_id,res.reserved_account_id,available_account,improvement,
      'ORDER_PRICE_IMPROVEMENT_RELEASE','sandbox-improvement:'||ord.public_id::text,
      'SANDBOX_EXECUTION',execution_public_id::text,
      'Release sandbox limit-price improvement',ord.user_id
    );
  end if;

  update trading.order_reservations
  set consumed_notional=consumed_notional+user_amount,
      released_notional=released_notional+improvement
  where order_id=ord.id;

  insert into trading.positions(user_id,instrument_id,outcome_id,quantity,total_cost_basis,realized_pnl,fees_paid)
  values(ord.user_id,instrument.id,ord.outcome_id,qty,user_amount,0,0)
  on conflict(user_id,instrument_id,outcome_id) do update
  set quantity=trading.positions.quantity+excluded.quantity,
      total_cost_basis=trading.positions.total_cost_basis+excluded.total_cost_basis,
      updated_at=statement_timestamp();

  execution_fee:=command.charge_execution_fee(
    ord.id,'COMPLETE_SET','sandbox:'||execution_public_id::text,'TAKER','BUY',user_amount
  );

  insert into trading.sandbox_executions(
    public_id,order_id,user_id,instrument_id,outcome_id,price,quantity,notional,
    subsidy_amount,fee_amount,user_collateral_journal_id,subsidy_journal_id
  ) values(
    execution_public_id,ord.id,ord.user_id,instrument.id,ord.outcome_id,ref_price,qty,user_amount,
    subsidy,coalesce(execution_fee,0),user_journal,subsidy_journal
  );

  update trading.orders set filled_quantity=quantity,status='FILLED',updated_at=statement_timestamp() where id=ord.id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('SANDBOX_ORDER_EXECUTED','SANDBOX_EXECUTION',execution_public_id::text,
    jsonb_build_object('instrument_id',instrument.public_id,'order_id',ord.public_id,'outcome_id',ord.outcome_id,'price',ref_price,'quantity',qty,'notional',user_amount,'subsidy',subsidy),
    'sandbox-order-executed:'||ord.public_id::text)
  on conflict(idempotency_key) do nothing;

  perform command.refresh_market_catalog(instrument.id);
  return 1;
end;
$function$;