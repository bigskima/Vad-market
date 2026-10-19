begin;

create table if not exists public.platform_feature_flags (
  flag_key text primary key,
  enabled boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default statement_timestamp(),
  updated_by uuid null references auth.users(id)
);
alter table public.platform_feature_flags enable row level security;
revoke all on public.platform_feature_flags from anon, authenticated;
insert into public.platform_feature_flags(flag_key,enabled,description)
values ('TNGN_DEMO_MODE', false, 'Globally controls isolated TNGN demo accounts and markets')
on conflict(flag_key) do nothing;

create table if not exists public.user_demo_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tngn_demo_enabled boolean not null default false,
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.user_demo_preferences enable row level security;
revoke all on public.user_demo_preferences from anon, authenticated;

-- Demo ledger is deliberately separate from finance.ledger_accounts and cannot
-- be credited by payment-provider webhooks or withdrawn.
create table if not exists public.demo_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  asset_code text not null default 'TNGN' check (asset_code='TNGN'),
  available_balance numeric(24,6) not null default 100000 check (available_balance>=0),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.demo_accounts enable row level security;
revoke all on public.demo_accounts from anon, authenticated;

create table if not exists public.demo_markets (
  id bigint generated always as identity primary key,
  market_key text not null unique,
  title text not null,
  description text not null default '',
  category text not null default 'DEMO',
  status text not null default 'OPEN' check (status in ('OPEN','CLOSED')),
  outcomes jsonb not null default '[{"code":"YES","label":"Yes"},{"code":"NO","label":"No"}]'::jsonb,
  created_at timestamptz not null default statement_timestamp()
);
alter table public.demo_markets enable row level security;
revoke all on public.demo_markets from anon, authenticated;

create table if not exists public.demo_orders (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  demo_market_id bigint not null references public.demo_markets(id),
  outcome_code text not null,
  side text not null check (side in ('BUY','SELL')),
  stake numeric(24,6) not null check (stake>0),
  status text not null default 'OPEN' check (status in ('OPEN','CANCELLED','SETTLED')),
  created_at timestamptz not null default statement_timestamp()
);
alter table public.demo_orders enable row level security;
revoke all on public.demo_orders from anon, authenticated;

create table if not exists public.demo_ledger_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('DEMO_GRANT','DEMO_STAKE','DEMO_REFUND','DEMO_SETTLEMENT')),
  amount numeric(24,6) not null,
  reference_id text,
  created_at timestamptz not null default statement_timestamp()
);
alter table public.demo_ledger_entries enable row level security;
revoke all on public.demo_ledger_entries from anon, authenticated;

insert into public.demo_markets(market_key,title,description,category,outcomes)
values
 ('demo-sample-yes-no','Demo market: sample prediction','Practice only. This market has no real-world value or settlement.','DEMO','[{"code":"YES","label":"Yes"},{"code":"NO","label":"No"}]'::jsonb),
 ('demo-sample-choice','Demo market: sample choice','Practice selecting an outcome using synthetic TNGN.','DEMO','[{"code":"A","label":"Option A"},{"code":"B","label":"Option B"},{"code":"C","label":"Option C"}]'::jsonb)
on conflict(market_key) do nothing;

create or replace function public.get_demo_mode_status()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_global boolean; v_user boolean;
begin
 if auth.uid() is null then return jsonb_build_object('globally_enabled',false,'user_enabled',false); end if;
 select coalesce(enabled,false) into v_global from public.platform_feature_flags where flag_key='TNGN_DEMO_MODE';
 select coalesce(tngn_demo_enabled,false) into v_user from public.user_demo_preferences where user_id=auth.uid();
 v_global:=coalesce(v_global,false); v_user:=coalesce(v_user,false);
 return jsonb_build_object('globally_enabled',v_global,'user_enabled',v_global and v_user);
end; $$;

create or replace function public.set_my_demo_mode(p_enabled boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_global boolean; v_enabled boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select coalesce(enabled,false) into v_global from public.platform_feature_flags where flag_key='TNGN_DEMO_MODE';
 v_enabled:=coalesce(v_global,false) and coalesce(p_enabled,false);
 insert into public.user_demo_preferences(user_id,tngn_demo_enabled,updated_at)
 values(auth.uid(),v_enabled,statement_timestamp())
 on conflict(user_id) do update set tngn_demo_enabled=excluded.tngn_demo_enabled,updated_at=excluded.updated_at;
 if v_enabled then
   insert into public.demo_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 else
   -- Keep demo history for the user, but no RPC can access it while disabled.
   null;
 end if;
 return v_enabled;
end; $$;

create or replace function public.admin_set_tngn_demo_mode(p_enabled boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null or not private.has_permission('policies.manage') then
   raise exception 'Platform settings permission required' using errcode='42501';
 end if;
 insert into public.platform_feature_flags(flag_key,enabled,description,updated_at,updated_by)
 values('TNGN_DEMO_MODE',coalesce(p_enabled,false),'Globally controls isolated TNGN demo accounts and markets',statement_timestamp(),auth.uid())
 on conflict(flag_key) do update set enabled=excluded.enabled,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 if not coalesce(p_enabled,false) then
   update public.user_demo_preferences set tngn_demo_enabled=false,updated_at=statement_timestamp() where tngn_demo_enabled=true;
 end if;
 return coalesce(p_enabled,false);
end; $$;

create or replace function public.my_demo_account()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_status jsonb; v_balance numeric;
begin
 v_status:=public.get_demo_mode_status();
 if coalesce((v_status->>'user_enabled')::boolean,false)=false then
   raise exception 'TNGN demo mode is not available for this account' using errcode='42501';
 end if;
 insert into public.demo_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 select available_balance into v_balance from public.demo_accounts where user_id=auth.uid();
 return jsonb_build_object('assetCode','TNGN','availableBalance',v_balance,'environment','DEMO','depositsEnabled',false,'withdrawalsEnabled',false,'realSettlementEnabled',false);
end; $$;

create or replace function public.my_demo_markets()
returns setof jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then
   raise exception 'TNGN demo mode is not available for this account' using errcode='42501';
 end if;
 return query select jsonb_build_object('id',m.id,'key',m.market_key,'title',m.title,'description',m.description,'category',m.category,'status',m.status,'assetCode','TNGN','outcomes',m.outcomes,'environment','DEMO')
 from public.demo_markets m where m.status='OPEN' order by m.id;
end; $$;

create or replace function public.place_demo_order(p_market_key text,p_outcome_code text,p_stake numeric,p_side text default 'BUY')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_market public.demo_markets; v_balance numeric; v_order public.demo_orders; v_side text:=upper(coalesce(p_side,'BUY')); v_outcome text:=upper(trim(coalesce(p_outcome_code,'')));
begin
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then
   raise exception 'TNGN demo mode is not available for this account' using errcode='42501';
 end if;
 if p_stake is null or p_stake<=0 or p_stake>100000 then raise exception 'Demo stake must be between 0 and 100000 TNGN' using errcode='22023'; end if;
 if v_side not in ('BUY','SELL') then raise exception 'Invalid demo order side' using errcode='22023'; end if;
 select * into v_market from public.demo_markets where market_key=p_market_key and status='OPEN' for share;
 if v_market.id is null then raise exception 'Demo market not found or closed' using errcode='P0002'; end if;
 if not exists(select 1 from jsonb_array_elements(v_market.outcomes) as outcome(item) where upper(item->>'code')=v_outcome) then raise exception 'Outcome is not valid for this demo market' using errcode='22023'; end if;
 insert into public.demo_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 select available_balance into v_balance from public.demo_accounts where user_id=auth.uid() for update;
 if v_balance<p_stake then raise exception 'Insufficient TNGN demo balance' using errcode='22023'; end if;
 update public.demo_accounts set available_balance=available_balance-p_stake,updated_at=statement_timestamp() where user_id=auth.uid();
 insert into public.demo_orders(user_id,demo_market_id,outcome_code,side,stake) values(auth.uid(),v_market.id,v_outcome,v_side,p_stake) returning * into v_order;
 insert into public.demo_ledger_entries(user_id,entry_type,amount,reference_id) values(auth.uid(),'DEMO_STAKE',-p_stake,v_order.public_id::text);
 return jsonb_build_object('orderId',v_order.public_id,'marketKey',v_market.market_key,'outcomeCode',v_outcome,'side',v_side,'stake',p_stake,'assetCode','TNGN','status','OPEN','environment','DEMO','availableBalance',v_balance-p_stake,'realMoneyUsed',false);
end; $$;

create or replace function public.my_demo_orders()
returns setof jsonb language plpgsql security definer set search_path=''
as $$
begin
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then
   raise exception 'TNGN demo mode is not available for this account' using errcode='42501';
 end if;
 return query select jsonb_build_object('orderId',o.public_id,'marketKey',m.market_key,'marketTitle',m.title,'outcomeCode',o.outcome_code,'side',o.side,'stake',o.stake,'assetCode','TNGN','status',o.status,'createdAt',o.created_at,'environment','DEMO')
 from public.demo_orders o join public.demo_markets m on m.id=o.demo_market_id where o.user_id=auth.uid() order by o.created_at desc;
end; $$;

-- Never expose direct table access. All user operations go through SECURITY
-- DEFINER RPCs that re-check the global and per-user gates on every request.
revoke all on function public.get_demo_mode_status() from public;
revoke all on function public.set_my_demo_mode(boolean) from public;
revoke all on function public.admin_set_tngn_demo_mode(boolean) from public;
revoke all on function public.my_demo_account() from public;
revoke all on function public.my_demo_markets() from public;
revoke all on function public.place_demo_order(text,text,numeric,text) from public;
revoke all on function public.my_demo_orders() from public;
grant execute on function public.get_demo_mode_status() to authenticated;
grant execute on function public.set_my_demo_mode(boolean) to authenticated;
grant execute on function public.admin_set_tngn_demo_mode(boolean) to authenticated;
grant execute on function public.my_demo_account() to authenticated;
grant execute on function public.my_demo_markets() to authenticated;
grant execute on function public.place_demo_order(text,text,numeric,text) to authenticated;
grant execute on function public.my_demo_orders() to authenticated;
commit;
