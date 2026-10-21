begin;

-- Read-only Wallet activity for the isolated TNGN sandbox ledger.
-- This does not query or write finance.ledger_accounts or real wallet activity.
create or replace function public.my_tngn_demo_ledger_activity(p_limit integer default 100)
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  v_status := public.get_demo_mode_status();
  if not coalesce((v_status->>'user_enabled')::boolean, false) then
    return;
  end if;

  return query
  select jsonb_build_object(
    'activity_id', 'tngn-demo-' || entry.id::text,
    'asset_code', 'TNGN',
    'activity_type', entry.entry_type,
    'direction', case when entry.amount < 0 then 'DEBIT' else 'CREDIT' end,
    'amount', abs(entry.amount),
    'account_type', 'DEMO',
    'market_id', coalesce(order_row.instrument_public_id::text, market.market_key),
    'market_title', coalesce(order_row.market_title, market.title),
    'reference_type', 'DEMO_LEDGER_ENTRY',
    'reference_id', entry.reference_id,
    'description', case entry.entry_type
      when 'DEMO_GRANT' then 'Synthetic TNGN practice balance'
      when 'DEMO_STAKE' then 'TNGN demo market stake'
      when 'DEMO_REFUND' then 'TNGN demo stake refund'
      when 'DEMO_SETTLEMENT' then 'TNGN demo market settlement'
      else 'TNGN demo ledger entry'
    end,
    'created_at', entry.created_at
  )
  from public.demo_ledger_entries entry
  left join public.demo_orders order_row
    on order_row.public_id::text = entry.reference_id
   and order_row.user_id = entry.user_id
  left join public.demo_markets market
    on market.id = order_row.demo_market_id
  where entry.user_id = auth.uid()
  order by entry.created_at desc, entry.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 200));
end;
$$;

revoke all on function public.my_tngn_demo_ledger_activity(integer) from public, anon;
grant execute on function public.my_tngn_demo_ledger_activity(integer) to authenticated;

commit;
