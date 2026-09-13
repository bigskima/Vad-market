create or replace function public.trade_quote(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_side text,
  p_price numeric,
  p_quantity numeric
) returns jsonb
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
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode='P0001';
  end if;
  if instrument.status<>'OPEN' then raise exception 'Market is not open' using errcode='P0001'; end if;
  select * into outcome from market.outcomes where instrument_id=instrument.id and code=upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;
  if upper(p_side) not in ('BUY','SELL') then raise exception 'Invalid side' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_price>=instrument.settlement_unit then raise exception 'Invalid price' using errcode='22023'; end if;
  if p_quantity is null or p_quantity<=0 then raise exception 'Invalid quantity' using errcode='22023'; end if;
  notional:=round(p_price*p_quantity,18);
  if notional<instrument.min_order_notional then raise exception 'Order is below market minimum notional' using errcode='22023'; end if;
  select q.fee_amount,q.policy_version_id into maker_fee,maker_policy from command.quote_trading_fee(notional,'MAKER') q;
  select q.fee_amount,q.policy_version_id into taker_fee,taker_policy from command.quote_trading_fee(notional,'TAKER') q;
  if upper(p_side)='BUY' then
    select q.fee_amount into fee_reserve from command.max_trading_fee_reserve(notional) q;
  else
    available_shares:=command.position_available_to_sell(auth.uid(),instrument.id,outcome.id);
  end if;
  return jsonb_build_object(
    'instrumentPublicId',instrument.public_id,'instrumentId',instrument.id,'outcomeId',outcome.id,
    'outcomeCode',outcome.code,'side',upper(p_side),'price',p_price,'quantity',p_quantity,'notional',notional,
    'settlementUnit',instrument.settlement_unit,'potentialGrossSettlement',round(p_quantity*instrument.settlement_unit,18),
    'makerFee',maker_fee,'takerFee',taker_fee,'maximumFeeReserve',fee_reserve,
    'maximumCashReservation',case when upper(p_side)='BUY' then notional+fee_reserve else 0 end,
    'availableSharesToSell',available_shares,'makerFeePolicyVersionId',maker_policy,
    'takerFeePolicyVersionId',taker_policy,'quotedAt',statement_timestamp()
  );
end;
$$;

revoke all on function public.trade_quote(uuid,text,text,numeric,numeric) from public,anon;
grant execute on function public.trade_quote(uuid,text,text,numeric,numeric) to authenticated;
