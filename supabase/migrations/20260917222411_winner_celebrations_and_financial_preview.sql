create table if not exists public.user_win_celebration_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  instrument_public_id uuid not null,
  outcome_code text not null,
  shown_at timestamptz not null default statement_timestamp(),
  created_at timestamptz not null default statement_timestamp(),
  primary key (user_id, instrument_public_id, outcome_code),
  constraint user_win_celebration_outcome_not_blank check (btrim(outcome_code) <> '')
);

alter table public.user_win_celebration_receipts enable row level security;
revoke all on table public.user_win_celebration_receipts from public, anon, authenticated;

create or replace function public.my_pending_win_celebrations(p_limit integer default 10)
returns table(
  market_id uuid,
  market_title text,
  category text,
  selected_outcome text,
  final_outcome text,
  asset_code text,
  stake_amount numeric,
  trading_fee numeric,
  gross_payout numeric,
  settlement_fee numeric,
  net_payout numeric,
  realized_pnl numeric,
  settled_at timestamptz,
  display_name text,
  handle text,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view your wins' using errcode='42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'Celebration limit must be between 1 and 50' using errcode='22023';
  end if;

  return query
  select
    h.market_id,
    h.market_title,
    mc.category,
    h.selected_outcome,
    h.final_outcome,
    h.asset_code,
    h.stake_amount,
    h.trading_fee,
    h.gross_payout,
    h.settlement_fee,
    h.net_payout,
    h.realized_pnl,
    h.settled_at,
    pr.display_name,
    pr.handle,
    pr.avatar_path
  from public.my_market_history() h
  left join public.market_catalog mc on mc.instrument_public_id=h.market_id
  left join public.profiles pr on pr.user_id=auth.uid()
  where h.result='WON'
    and h.settled_at is not null
    and not exists(
      select 1
      from public.user_win_celebration_receipts c
      where c.user_id=auth.uid()
        and c.instrument_public_id=h.market_id
        and upper(c.outcome_code)=upper(h.selected_outcome)
    )
  order by h.settled_at asc, h.market_id
  limit p_limit;
end;
$$;

create or replace function public.acknowledge_win_celebration(
  p_instrument_public_id uuid,
  p_outcome_code text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_outcome text:=upper(btrim(coalesce(p_outcome_code,'')));
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue' using errcode='42501';
  end if;
  if p_instrument_public_id is null or v_outcome='' then
    raise exception 'Win reference is required' using errcode='22023';
  end if;
  if not exists(
    select 1
    from public.my_market_history() h
    where h.market_id=p_instrument_public_id
      and upper(h.selected_outcome)=v_outcome
      and h.result='WON'
      and h.settled_at is not null
  ) then
    raise exception 'This win is not available for this account' using errcode='42501';
  end if;

  insert into public.user_win_celebration_receipts(user_id,instrument_public_id,outcome_code,shown_at)
  values(auth.uid(),p_instrument_public_id,v_outcome,statement_timestamp())
  on conflict(user_id,instrument_public_id,outcome_code)
  do update set shown_at=coalesce(public.user_win_celebration_receipts.shown_at,excluded.shown_at);

  return true;
end;
$$;

revoke all on function public.my_pending_win_celebrations(integer) from public,anon;
grant execute on function public.my_pending_win_celebrations(integer) to authenticated;
revoke all on function public.acknowledge_win_celebration(uuid,text) from public,anon;
grant execute on function public.acknowledge_win_celebration(uuid,text) to authenticated;

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
  potential_gross numeric(38,18):=0;
  estimated_settlement_fee numeric(38,18):=0;
  settlement_fee_policy bigint;
begin
  acct:=private.require_active_account();
  select * into instrument from market.instruments where public_id=p_instrument_public_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if instrument.liquidity_model='POOL' then raise exception 'This market uses peer-funded pooled staking' using errcode='P0001'; end if;
  if not private.trade_access_satisfies(auth.uid(),acct.country_code,instrument.asset_id) then raise exception 'Trading is not available for this account and market' using errcode='P0001'; end if;
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

  potential_gross:=round(p_quantity*instrument.settlement_unit,18);
  select q.fee_amount,q.policy_version_id
    into estimated_settlement_fee,settlement_fee_policy
  from command.quote_settlement_fee(potential_gross) q;

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
    'potentialGrossSettlement',potential_gross,
    'estimatedSettlementFee',coalesce(estimated_settlement_fee,0),
    'estimatedNetSettlement',greatest(potential_gross-coalesce(estimated_settlement_fee,0),0),
    'makerFee',maker_fee,
    'takerFee',taker_fee,
    'maximumFeeReserve',fee_reserve,
    'maximumCashReservation',case when upper(p_side)='BUY' then notional+fee_reserve else 0 end,
    'availableSharesToSell',available_shares,
    'makerFeePolicyVersionId',maker_policy,
    'takerFeePolicyVersionId',taker_policy,
    'settlementFeePolicyVersionId',settlement_fee_policy,
    'quotedAt',statement_timestamp()
  );
end;
$$;
