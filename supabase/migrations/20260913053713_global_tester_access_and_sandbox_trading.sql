create table if not exists compliance.kyc_global_access_override (
  singleton boolean primary key default true check (singleton),
  scope text not null default 'SANDBOX' check (scope in ('SANDBOX','ALL')),
  enabled boolean not null default false,
  reason text not null,
  expires_at timestamptz,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

alter table compliance.kyc_global_access_override enable row level security;
revoke all on compliance.kyc_global_access_override from anon, authenticated;

insert into compliance.kyc_global_access_override(singleton,scope,enabled,reason,expires_at)
values(true,'SANDBOX',true,'Global sandbox tester access enabled for VAD testing',null)
on conflict(singleton) do nothing;

create or replace function private.tester_access_satisfies(
  p_user_id uuid,
  p_environment text default 'PRODUCTION'
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_environment text:=upper(btrim(coalesce(p_environment,'PRODUCTION')));
  v_scope text;
begin
  select o.scope into v_scope
  from compliance.kyc_access_overrides o
  where o.user_id=p_user_id
    and o.enabled
    and (o.expires_at is null or o.expires_at>statement_timestamp())
  limit 1;

  if v_scope='ALL' then return true; end if;
  if v_scope='SANDBOX' and v_environment='SANDBOX' then return true; end if;

  v_scope:=null;
  select g.scope into v_scope
  from compliance.kyc_global_access_override g
  where g.singleton
    and g.enabled
    and (g.expires_at is null or g.expires_at>statement_timestamp())
  limit 1;

  if v_scope='ALL' then return true; end if;
  return v_scope='SANDBOX' and v_environment='SANDBOX';
end;
$$;

revoke all on function private.tester_access_satisfies(uuid,text) from public,anon,authenticated;

create or replace function private.kyc_access_satisfies(
  p_user_id uuid,
  p_required_level text,
  p_environment text default 'PRODUCTION'
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if private.kyc_satisfies(p_user_id,p_required_level) then
    return true;
  end if;
  return private.tester_access_satisfies(p_user_id,p_environment);
end;
$$;

revoke all on function private.kyc_access_satisfies(uuid,text,text) from public,anon,authenticated;

create or replace function public.my_tester_access_state()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;
  return jsonb_build_object(
    'sandbox',private.tester_access_satisfies(auth.uid(),'SANDBOX'),
    'production',private.tester_access_satisfies(auth.uid(),'PRODUCTION')
  );
end;
$$;

revoke all on function public.my_tester_access_state() from public,anon;
grant execute on function public.my_tester_access_state() to authenticated;

create or replace function public.admin_kyc_global_access_override()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  g compliance.kyc_global_access_override;
begin
  if auth.uid() is null or not (
    private.is_super_admin()
    or private.has_permission('compliance.manage')
    or private.has_permission('users.manage')
  ) then
    raise exception 'Compliance or user management permission required' using errcode='42501';
  end if;

  select * into g
  from compliance.kyc_global_access_override
  where singleton
  limit 1;

  return jsonb_build_object(
    'enabled',coalesce(g.enabled,false) and (g.expires_at is null or g.expires_at>statement_timestamp()),
    'scope',coalesce(g.scope,'SANDBOX'),
    'reason',g.reason,
    'expiresAt',g.expires_at,
    'updatedAt',g.updated_at
  );
end;
$$;

revoke all on function public.admin_kyc_global_access_override() from public,anon;
grant execute on function public.admin_kyc_global_access_override() to authenticated;

create or replace function public.admin_set_kyc_global_access_override(
  p_scope text,
  p_enabled boolean,
  p_reason text,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_scope text:=upper(btrim(coalesce(p_scope,'')));
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not (
    private.is_super_admin()
    or private.has_permission('compliance.manage')
  ) then
    raise exception 'Compliance management permission required' using errcode='42501';
  end if;
  if v_scope not in ('SANDBOX','ALL') then
    raise exception 'Override scope must be SANDBOX or ALL' using errcode='22023';
  end if;
  if char_length(v_reason)<3 then
    raise exception 'A reason is required for the global tester override' using errcode='22023';
  end if;
  if p_expires_at is not null and p_expires_at<=statement_timestamp() then
    raise exception 'Override expiry must be in the future' using errcode='22023';
  end if;

  insert into compliance.kyc_global_access_override(singleton,scope,enabled,reason,expires_at,updated_by)
  values(true,v_scope,coalesce(p_enabled,false),v_reason,p_expires_at,auth.uid())
  on conflict(singleton) do update set
    scope=excluded.scope,
    enabled=excluded.enabled,
    reason=excluded.reason,
    expires_at=excluded.expires_at,
    updated_by=auth.uid(),
    updated_at=statement_timestamp();

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN',
    case when p_enabled then 'KYC_GLOBAL_ACCESS_OVERRIDE_GRANTED' else 'KYC_GLOBAL_ACCESS_OVERRIDE_REVOKED' end,
    'KYC_GLOBAL_ACCESS','GLOBAL',v_reason,
    jsonb_build_object('scope',v_scope,'enabled',coalesce(p_enabled,false),'expiresAt',p_expires_at)
  );

  return jsonb_build_object(
    'enabled',coalesce(p_enabled,false),
    'scope',v_scope,
    'reason',v_reason,
    'expiresAt',p_expires_at,
    'updatedAt',statement_timestamp()
  );
end;
$$;

revoke all on function public.admin_set_kyc_global_access_override(text,boolean,text,timestamptz) from public,anon;
grant execute on function public.admin_set_kyc_global_access_override(text,boolean,text,timestamptz) to authenticated;

create or replace function private.trade_access_satisfies(
  p_user_id uuid,
  p_country_code text,
  p_asset_id bigint
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_policy_enabled boolean:=false;
  v_sandbox_only boolean:=false;
begin
  if p_user_id is null then return false; end if;
  if not private.service_available('trading',p_user_id) then return false; end if;

  select coalesce((
    select cr.enabled
    from public.capability_rules cr
    where cr.capability_key='trade'
      and cr.country_code=p_country_code
      and cr.status='ACTIVE'
      and cr.effective_at<=statement_timestamp()
      and (cr.expires_at is null or cr.expires_at>statement_timestamp())
    order by cr.version desc
    limit 1
  ),false) into v_policy_enabled;

  if v_policy_enabled then return true; end if;

  select lower(coalesce(a.metadata->>'sandbox_only','false'))='true'
    into v_sandbox_only
  from public.assets a
  where a.id=p_asset_id and a.status='ACTIVE';

  return coalesce(v_sandbox_only,false)
    and private.tester_access_satisfies(p_user_id,'SANDBOX');
end;
$$;

revoke all on function private.trade_access_satisfies(uuid,text,bigint) from public,anon,authenticated;

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
  select fee_amount,policy_version_id into maker_fee,maker_policy from command.quote_trading_fee(notional,'MAKER');
  select fee_amount,policy_version_id into taker_fee,taker_policy from command.quote_trading_fee(notional,'TAKER');
  if upper(p_side)='BUY' then fee_reserve:=command.max_trading_fee_reserve(notional);
  else available_shares:=command.position_available_to_sell(auth.uid(),instrument.id,outcome.id); end if;
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

create or replace function public.place_order(
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  account public.user_accounts;
  instrument market.instruments;
begin
  account:=private.require_active_account();
  select * into instrument from market.instruments where id=p_market_id;
  if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if not private.trade_access_satisfies(auth.uid(),account.country_code,instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode='P0001';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key)<8 or char_length(p_idempotency_key)>200 then
    raise exception 'A valid idempotency key is required' using errcode='22023';
  end if;
  return command.reserve_for_order(auth.uid(),p_market_id,p_outcome_id,upper(p_side),p_price,p_quantity,p_idempotency_key);
end;
$$;

revoke all on function public.place_order(bigint,bigint,text,numeric,numeric,text) from public,anon;
grant execute on function public.place_order(bigint,bigint,text,numeric,numeric,text) to authenticated;
