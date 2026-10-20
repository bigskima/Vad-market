begin;
alter table public.demo_orders alter column demo_market_id drop not null;
alter table public.demo_orders add column if not exists instrument_public_id uuid, add column if not exists market_title text, add column if not exists quoted_probability numeric(12,8), add column if not exists idempotency_key text;
create unique index if not exists demo_orders_idempotency_key_uidx on public.demo_orders(user_id,idempotency_key) where idempotency_key is not null;

create or replace function public.tngn_pool_quote(p_instrument_public_id uuid,p_outcome_code text,p_amount numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m record; o text:=upper(trim(coalesce(p_outcome_code,''))); p numeric; b numeric;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then raise exception 'Enable TNGN in Account and ensure platform TNGN is enabled.' using errcode='42501'; end if;
 if p_amount is null or p_amount<=0 or p_amount>100000 or o not in ('YES','NO') then raise exception 'Invalid TNGN stake or outcome.' using errcode='22023'; end if;
 select instrument_public_id,title,asset_code,status,yes_price,no_price,closes_at,resolution_status into m from public.market_catalog where instrument_public_id=p_instrument_public_id limit 1;
 if m.instrument_public_id is null then raise exception 'Market not found.' using errcode='P0002'; end if;
 if m.asset_code<>'TNGN' then raise exception 'This market is not denominated in TNGN.' using errcode='22023'; end if;
 if upper(coalesce(m.status,''))<>'OPEN' or (m.closes_at is not null and m.closes_at<=statement_timestamp()) or upper(coalesce(m.resolution_status,'')) in ('RESOLVED','FINAL','SETTLED','CLOSED') then raise exception 'Market is not open for trading.' using errcode='P0001'; end if;
 p:=case when o='YES' then m.yes_price::numeric else m.no_price::numeric end;
 if p is null or p<=0 or p>=1 then raise exception 'Live market price is unavailable.' using errcode='P0001'; end if;
 insert into public.demo_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 select available_balance into b from public.demo_accounts where user_id=auth.uid();
 return jsonb_build_object('instrumentPublicId',p_instrument_public_id,'instrumentId',null,'outcomeId',null,'outcomeCode',o,'assetId',null,'amount',p_amount,'tradingFee',0,'maximumCashDebit',p_amount,'poolTotalBefore',null,'outcomePoolBefore',null,'poolTotalAfter',null,'outcomePoolAfter',null,'impliedProbability',p,'estimatedGrossPayout',p_amount/p,'estimatedSettlementFee',0,'estimatedNetPayout',p_amount/p,'quotedAt',statement_timestamp(),'marketTitle',m.title,'assetCode','TNGN','availableBalance',b,'environment','TNGN');
end; $$;

create or replace function public.place_tngn_market_stake(p_instrument_public_id uuid,p_outcome_code text,p_amount numeric,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; b numeric; o public.demo_orders; k text:=trim(coalesce(p_idempotency_key,'')); outcome text:=upper(trim(coalesce(p_outcome_code,'')));
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if k='' or length(k)>160 then raise exception 'Valid idempotency key required.' using errcode='22023'; end if;
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then raise exception 'Enable TNGN in Account and ensure platform TNGN is enabled.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||k,0));
 select * into o from public.demo_orders where user_id=auth.uid() and idempotency_key=k limit 1;
 if o.id is not null then return jsonb_build_object('stakeId',o.public_id,'marketId',o.instrument_public_id,'marketTitle',o.market_title,'outcomeCode',o.outcome_code,'amount',o.stake,'tradingFee',0,'status',o.status,'assetCode','TNGN','environment','TNGN','idempotentReplay',true); end if;
 q:=public.tngn_pool_quote(p_instrument_public_id,outcome,p_amount);
 insert into public.demo_accounts(user_id) values(auth.uid()) on conflict(user_id) do nothing;
 select available_balance into b from public.demo_accounts where user_id=auth.uid() for update;
 if b<p_amount then raise exception 'Insufficient TNGN balance.' using errcode='22023'; end if;
 update public.demo_accounts set available_balance=available_balance-p_amount,updated_at=statement_timestamp() where user_id=auth.uid();
 insert into public.demo_orders(user_id,demo_market_id,outcome_code,side,stake,status,instrument_public_id,market_title,quoted_probability,idempotency_key)
 values(auth.uid(),null,outcome,'BUY',p_amount,'OPEN',p_instrument_public_id,q->>'marketTitle',(q->>'impliedProbability')::numeric,k) returning * into o;
 insert into public.demo_ledger_entries(user_id,entry_type,amount,reference_id) values(auth.uid(),'DEMO_STAKE',-p_amount,o.public_id::text);
 return jsonb_build_object('stakeId',o.public_id,'marketId',p_instrument_public_id,'marketTitle',o.market_title,'outcomeCode',outcome,'amount',p_amount,'tradingFee',0,'status','COMMITTED','assetCode','TNGN','environment','TNGN','availableBalance',b-p_amount,'realMoneyUsed',false,'quotedProbability',q->>'impliedProbability');
end; $$;

create or replace function public.my_tngn_market_orders()
returns setof jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then raise exception 'TNGN is disabled for this account.' using errcode='42501'; end if;
 return query select jsonb_build_object('orderId',o.public_id,'marketId',o.instrument_public_id,'marketTitle',o.market_title,'outcomeCode',o.outcome_code,'side',o.side,'stake',o.stake,'assetCode','TNGN','status',o.status,'finalOutcome',o.final_outcome,'payout',o.payout,'settledAt',o.settled_at,'createdAt',o.created_at,'quotedProbability',o.quoted_probability,'environment','TNGN') from public.demo_orders o where o.user_id=auth.uid() and o.instrument_public_id is not null order by o.created_at desc;
end; $$;
revoke all on function public.tngn_pool_quote(uuid,text,numeric) from public,anon;
revoke all on function public.place_tngn_market_stake(uuid,text,numeric,text) from public,anon;
revoke all on function public.my_tngn_market_orders() from public,anon;
grant execute on function public.tngn_pool_quote(uuid,text,numeric) to authenticated;
grant execute on function public.place_tngn_market_stake(uuid,text,numeric,text) to authenticated;
grant execute on function public.my_tngn_market_orders() to authenticated;
commit;