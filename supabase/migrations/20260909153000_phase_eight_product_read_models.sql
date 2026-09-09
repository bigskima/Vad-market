-- VAD Phase 8: consumer/admin read models and fee-aware trade quote.

create or replace function public.trade_quote(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_side text,
  p_price numeric,
  p_quantity numeric
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  notional numeric(38,18);
  fee_reserve numeric(38,18):=0;
  maker_fee numeric(38,18):=0;
  taker_fee numeric(38,18):=0;
  available_shares numeric(38,18):=0;
  maker_policy bigint;
  taker_policy bigint;
begin
  acct:=private.require_active_account();
  select * into instrument from market.instruments where public_id=p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.status<>'OPEN' then raise exception 'Market is not open' using errcode='P0001'; end if;
  select * into outcome from market.outcomes where instrument_id=instrument.id and code=upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;
  if upper(p_side) not in ('BUY','SELL') then raise exception 'Invalid side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_price>=instrument.settlement_unit then raise exception 'Invalid price' using errcode='22023'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Invalid quantity' using errcode='22023'; end if;

  notional:=round(p_price*p_quantity,18);
  if notional<instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode='22023'; end if;

  select fee_amount,policy_version_id into maker_fee,maker_policy from command.quote_trading_fee(notional,'MAKER');
  select fee_amount,policy_version_id into taker_fee,taker_policy from command.quote_trading_fee(notional,'TAKER');

  if upper(p_side)='BUY' then
    fee_reserve:=command.max_trading_fee_reserve(notional);
  else
    available_shares:=command.position_available_to_sell(auth.uid(),instrument.id,outcome.id);
  end if;

  return jsonb_build_object(
    'instrumentPublicId',instrument.public_id,
    'instrumentId',instrument.id,
    'outcomeId',outcome.id,
    'outcomeCode',outcome.code,
    'side',upper(p_side),
    'price',p_price,
    'quantity',p_quantity,
    'notional',notional,
    'settlementUnit',instrument.settlement_unit,
    'potentialGrossSettlement',round(p_quantity*instrument.settlement_unit,18),
    'makerFee',maker_fee,
    'takerFee',taker_fee,
    'maximumFeeReserve',fee_reserve,
    'maximumCashReservation',case when upper(p_side)='BUY' then notional+fee_reserve else 0 end,
    'availableSharesToSell',available_shares,
    'makerFeePolicyVersionId',maker_policy,
    'takerFeePolicyVersionId',taker_policy,
    'quotedAt',statement_timestamp()
  );
end;
$$;

revoke all on function public.trade_quote(uuid,text,text,numeric,numeric) from public,anon;
grant execute on function public.trade_quote(uuid,text,text,numeric,numeric) to authenticated;

create or replace function public.my_market_proposals()
returns table(
  public_id uuid,
  question text,
  context text,
  category text,
  status text,
  confidence numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select p.public_id,p.question,p.context,p.category,p.status,p.creator_confidence,p.created_at,p.updated_at
  from market.proposals p
  where p.proposer_user_id=auth.uid()
  order by p.created_at desc;
$$;
revoke all on function public.my_market_proposals() from public,anon;
grant execute on function public.my_market_proposals() to authenticated;

create or replace function public.admin_market_queue()
returns table(
  proposal_public_id uuid,
  question text,
  context text,
  category text,
  proposal_status text,
  proposer_user_id uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('markets.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  return query
    select p.public_id,p.question,p.context,p.category,p.status,p.proposer_user_id,p.created_at
    from market.proposals p
    where p.status in ('SUBMITTED','UNDER_REVIEW','NEEDS_CLARIFICATION')
    order by p.created_at asc;
end;
$$;
revoke all on function public.admin_market_queue() from public,anon;
grant execute on function public.admin_market_queue() to authenticated;

create or replace function public.admin_oracle_queue()
returns table(
  event_public_id uuid,
  event_title text,
  event_status text,
  resolution_id bigint,
  resolution_status text,
  outcome_code text,
  provisional_at timestamptz,
  active_disputes bigint
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  return query
    select e.public_id,e.title,e.status,r.id,r.status,r.outcome_code,r.created_at,
      (select count(*) from oracle.disputes d where d.event_id=e.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED'))
    from market.canonical_events e
    left join oracle.resolutions r on r.event_id=e.id and r.status='PROVISIONAL'
    where e.status in ('AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED')
    order by e.updated_at asc;
end;
$$;
revoke all on function public.admin_oracle_queue() from public,anon;
grant execute on function public.admin_oracle_queue() to authenticated;

create or replace function public.admin_runtime_summary()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare result jsonb;
begin
  if not (private.has_permission('markets.manage') or private.has_permission('finance.read') or private.has_permission('oracle.review')) then
    raise exception 'Permission required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'openMarkets',(select count(*) from market.instruments where status='OPEN'),
    'awaitingOracle',(select count(*) from market.canonical_events where status='AWAITING_ORACLE'),
    'activeDisputes',(select count(*) from oracle.disputes where status in ('OPEN','UNDER_REVIEW','ESCALATED')),
    'openOrders',(select count(*) from trading.orders where status in ('OPEN','PARTIALLY_FILLED')),
    'pendingSettlements',(select count(*) from market.instruments where status='SETTLEMENT_PENDING'),
    'oracleProviders',(select count(*) from integration.providers where provider_type='ORACLE' and status in ('ACTIVE','DEGRADED')),
    'paymentProviders',(select count(*) from integration.providers where provider_type='PAYMENT' and status in ('ACTIVE','DEGRADED')),
    'generatedAt',statement_timestamp()
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_runtime_summary() from public,anon;
grant execute on function public.admin_runtime_summary() to authenticated;
