-- Route future peer-funded test markets through pooled stake economics and dispatch settlement correctly.

update public.assets
set metadata = coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
  'peer_pool_default', true,
  'default_liquidity_model', 'POOL'
),
updated_at = statement_timestamp()
where code='TNGN';

create or replace function private.apply_asset_default_liquidity_model()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_asset public.assets;
begin
  select * into v_asset from public.assets where id=new.asset_id;
  if new.market_type='BINARY'
     and coalesce((v_asset.metadata->>'peer_pool_default')::boolean,false) then
    new.liquidity_model:='POOL';
  end if;
  return new;
end;
$function$;

drop trigger if exists apply_asset_default_liquidity_model_before_insert on market.instruments;
create trigger apply_asset_default_liquidity_model_before_insert
before insert on market.instruments
for each row execute function private.apply_asset_default_liquidity_model();

-- Preserve the existing order-book settler and put a stable dispatcher back on execute_instrument.
do $block$
begin
  if to_regprocedure('settlement.execute_orderbook_instrument(bigint)') is null
     and to_regprocedure('settlement.execute_instrument(bigint)') is not null then
    alter function settlement.execute_instrument(bigint) rename to execute_orderbook_instrument;
  end if;
end;
$block$;

create or replace function settlement.execute_instrument(p_instrument_id bigint)
returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_model text;
begin
  select liquidity_model into v_model from market.instruments where id=p_instrument_id;
  if v_model is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if v_model='POOL' then
    return settlement.execute_pool_instrument(p_instrument_id);
  end if;
  return settlement.execute_orderbook_instrument(p_instrument_id);
end;
$function$;
revoke all on function settlement.execute_instrument(bigint) from public,anon,authenticated;
grant execute on function settlement.execute_instrument(bigint) to service_role;

-- Include pooled stakes in settlement receipts while still excluding deprecated synthetic issuer executions.
create or replace function public.my_settlement_receipts()
returns table(
  settlement_id uuid,
  market_id uuid,
  market_title text,
  outcome_code text,
  asset_code text,
  quantity numeric,
  gross_amount numeric,
  fee_amount numeric,
  net_amount numeric,
  settled_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  select sr.public_id,mi.public_id,ce.title,mo.code,a.code,se.quantity,se.gross_amount,se.fee_amount,se.net_amount,sr.settled_at
  from settlement.entitlements se
  join settlement.runs sr on sr.id=se.run_id
  join market.instruments mi on mi.id=sr.instrument_id
  join market.canonical_events ce on ce.id=mi.canonical_event_id
  join market.outcomes mo on mo.id=se.outcome_id
  join public.assets a on a.id=mi.asset_id
  where se.user_id=auth.uid()
    and sr.status='SETTLED'
    and (
      exists(
        select 1
        from trading.pool_stakes ps
        where ps.user_id=auth.uid()
          and ps.instrument_id=mi.id
          and ps.outcome_id=se.outcome_id
      )
      or exists(
        select 1
        from trading.fills f
        join trading.orders o on o.id=f.order_id
        where o.user_id=auth.uid()
          and o.instrument_id=mi.id
          and o.outcome_id=se.outcome_id
      )
    )
  order by sr.settled_at desc nulls last,se.id desc;
$function$;
revoke all on function public.my_settlement_receipts() from public,anon;
grant execute on function public.my_settlement_receipts() to authenticated,service_role;

-- Link pooled-stake and trading-fee movements back to their market in wallet history.
create or replace function public.my_wallet_activity(p_limit integer default 100)
returns table(
  activity_id uuid,
  asset_code text,
  activity_type text,
  direction text,
  amount numeric,
  account_type text,
  market_id uuid,
  market_title text,
  reference_type text,
  reference_id text,
  description text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $function$
  with mine as (
    select
      j.public_id as activity_id,
      a.code as asset_code,
      j.journal_type as activity_type,
      e.direction,
      e.amount,
      la.account_type,
      j.reference_type,
      j.reference_id,
      j.description,
      j.created_at,
      j.id as journal_id
    from finance.ledger_entries e
    join finance.ledger_journals j on j.id=e.journal_id and j.status='POSTED'
    join finance.ledger_accounts la on la.id=e.account_id
    join public.assets a on a.id=j.asset_id
    where la.owner_type='USER'
      and la.owner_reference=auth.uid()::text
      and (
        la.account_type='USER_AVAILABLE'
        or (la.account_type='USER_RESERVED' and j.journal_type='TRADING_FEE')
      )
  ), linked as (
    select
      m.*,
      coalesce(o.instrument_id,ps.instrument_id,sr.instrument_id) as instrument_id
    from mine m
    left join trading.orders o
      on (m.reference_type='ORDER' and o.public_id::text=m.reference_id)
      or (m.activity_type='ORDER_RESERVE' and o.idempotency_key=m.reference_id)
    left join trading.pool_stakes ps
      on m.reference_type='POOL_STAKE' and ps.public_id::text=m.reference_id
    left join settlement.runs sr
      on m.reference_type='SETTLEMENT_RUN' and sr.public_id::text=m.reference_id
  )
  select
    l.activity_id,
    l.asset_code,
    l.activity_type,
    l.direction,
    l.amount,
    l.account_type,
    i.public_id as market_id,
    ce.title as market_title,
    l.reference_type,
    l.reference_id,
    l.description,
    l.created_at
  from linked l
  left join market.instruments i on i.id=l.instrument_id
  left join market.canonical_events ce on ce.id=i.canonical_event_id
  order by l.created_at desc,l.journal_id desc
  limit greatest(1,least(coalesce(p_limit,100),500));
$function$;
revoke all on function public.my_wallet_activity(integer) from public,anon;
grant execute on function public.my_wallet_activity(integer) to authenticated,service_role;
