drop function if exists public.my_settlement_receipts();
create function public.my_settlement_receipts()
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
  where se.user_id=auth.uid() and sr.status='SETTLED'
  order by sr.settled_at desc nulls last,se.id desc;
$function$;
revoke all on function public.my_settlement_receipts() from public,anon;
grant execute on function public.my_settlement_receipts() to authenticated,service_role;