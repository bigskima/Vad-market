begin;

alter table public.demo_markets
  add column if not exists resolved_outcome text,
  add column if not exists resolved_at timestamptz;

alter table public.demo_orders
  add column if not exists final_outcome text,
  add column if not exists payout numeric(24,6) not null default 0 check (payout >= 0),
  add column if not exists settled_at timestamptz;

create or replace function public.admin_demo_markets()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.has_permission('policies.manage') then
    raise exception 'Platform settings permission required' using errcode='42501';
  end if;
  return query
    select jsonb_build_object(
      'key', m.market_key,
      'title', m.title,
      'description', m.description,
      'status', m.status,
      'outcomes', m.outcomes,
      'resolvedOutcome', m.resolved_outcome,
      'resolvedAt', m.resolved_at
    )
    from public.demo_markets m
    order by case when m.status = 'OPEN' then 0 else 1 end, m.id desc;
end;
$$;

create or replace function public.admin_resolve_demo_market(p_market_key text, p_outcome_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market public.demo_markets;
  v_outcome text := upper(trim(coalesce(p_outcome_code, '')));
  v_order record;
  v_payout numeric(24,6);
  v_settled integer := 0;
  v_winners integer := 0;
begin
  if auth.uid() is null or not private.has_permission('policies.manage') then
    raise exception 'Platform settings permission required' using errcode='42501';
  end if;
  if not coalesce((select enabled from public.platform_feature_flags where flag_key='TNGN_DEMO_MODE'), false) then
    raise exception 'TNGN demo mode is globally disabled' using errcode='42501';
  end if;

  select * into v_market
  from public.demo_markets
  where market_key = p_market_key
  for update;

  if v_market.id is null then
    raise exception 'Demo market not found' using errcode='P0002';
  end if;
  if v_market.status <> 'OPEN' then
    raise exception 'Demo market has already been closed' using errcode='P0001';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_market.outcomes) as outcome(item)
    where upper(item->>'code') = v_outcome
  ) then
    raise exception 'Resolution outcome is not valid for this demo market' using errcode='22023';
  end if;

  update public.demo_markets
  set status='CLOSED', resolved_outcome=v_outcome, resolved_at=statement_timestamp()
  where id=v_market.id;

  for v_order in
    select o.* from public.demo_orders o
    where o.demo_market_id=v_market.id and o.status='OPEN'
    order by o.id
    for update
  loop
    v_payout := case when upper(v_order.outcome_code)=v_outcome then v_order.stake * 2 else 0 end;
    update public.demo_orders
    set status='SETTLED', final_outcome=v_outcome, payout=v_payout, settled_at=statement_timestamp()
    where id=v_order.id;

    if v_payout > 0 then
      update public.demo_accounts
      set available_balance=available_balance+v_payout, updated_at=statement_timestamp()
      where user_id=v_order.user_id;
      insert into public.demo_ledger_entries(user_id,entry_type,amount,reference_id)
      values(v_order.user_id,'DEMO_SETTLEMENT',v_payout,v_order.public_id::text);
      v_winners := v_winners + 1;
    else
      insert into public.demo_ledger_entries(user_id,entry_type,amount,reference_id)
      values(v_order.user_id,'DEMO_SETTLEMENT',0,v_order.public_id::text);
    end if;
    v_settled := v_settled + 1;
  end loop;

  return jsonb_build_object(
    'marketKey', v_market.market_key,
    'status', 'CLOSED',
    'resolvedOutcome', v_outcome,
    'settledOrders', v_settled,
    'winningOrders', v_winners,
    'environment', 'DEMO',
    'realMoneyUsed', false
  );
end;
$$;

revoke all on function public.admin_demo_markets() from public, anon;
revoke all on function public.admin_resolve_demo_market(text,text) from public, anon;
grant execute on function public.admin_demo_markets() to authenticated;
grant execute on function public.admin_resolve_demo_market(text,text) to authenticated;

create or replace function public.my_demo_orders()
returns setof jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then
    raise exception 'TNGN demo mode is not available for this account' using errcode='42501';
  end if;
  return query
    select jsonb_build_object(
      'orderId',o.public_id,
      'marketKey',m.market_key,
      'marketTitle',m.title,
      'outcomeCode',o.outcome_code,
      'side',o.side,
      'stake',o.stake,
      'assetCode','TNGN',
      'status',o.status,
      'finalOutcome',o.final_outcome,
      'payout',o.payout,
      'settledAt',o.settled_at,
      'createdAt',o.created_at,
      'environment','DEMO'
    )
    from public.demo_orders o
    join public.demo_markets m on m.id=o.demo_market_id
    where o.user_id=auth.uid()
    order by o.created_at desc;
end;
$$;

commit;
