begin;

-- When the authoritative market read model marks a TNGN instrument resolved,
-- settle only its isolated test-currency orders using the recorded outcome.
create or replace function private.settle_tngn_market_orders(p_instrument_public_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare m record; o record; payout numeric(24,6); settled_count integer:=0; result_code text;
begin
 select instrument_public_id,asset_code,resolution_status,resolution_outcome
 into m from public.market_catalog where instrument_public_id=p_instrument_public_id;
 if m.instrument_public_id is null or m.asset_code<>'TNGN'
    or upper(coalesce(m.resolution_status,'')) not in ('RESOLVED','FINAL','SETTLED')
    or upper(coalesce(m.resolution_outcome,'')) not in ('YES','NO') then
   return 0;
 end if;
 result_code:=upper(m.resolution_outcome);
 for o in select * from public.demo_orders
   where instrument_public_id=p_instrument_public_id and status='OPEN'
   order by id for update
 loop
   payout:=case when upper(o.outcome_code)=result_code and o.quoted_probability>0
     then round(o.stake/o.quoted_probability,6) else 0 end;
   update public.demo_orders set status='SETTLED',final_outcome=result_code,payout=payout,settled_at=statement_timestamp()
   where id=o.id;
   if payout>0 then
     update public.demo_accounts set available_balance=available_balance+payout,updated_at=statement_timestamp()
     where user_id=o.user_id;
   end if;
   insert into public.demo_ledger_entries(user_id,entry_type,amount,reference_id)
   values(o.user_id,'DEMO_SETTLEMENT',payout,o.public_id::text);
   settled_count:=settled_count+1;
 end loop;
 return settled_count;
end; $$;

create or replace function public.my_tngn_market_orders()
returns setof jsonb language plpgsql security definer set search_path='' as $$
declare market_row record;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not coalesce((public.get_demo_mode_status()->>'user_enabled')::boolean,false) then
   return;
 end if;
 for market_row in
   select distinct instrument_public_id from public.demo_orders
   where user_id=auth.uid() and instrument_public_id is not null and status='OPEN'
 loop
   perform private.settle_tngn_market_orders(market_row.instrument_public_id);
 end loop;
 return query select jsonb_build_object(
   'orderId',o.public_id,'marketId',o.instrument_public_id,'marketTitle',o.market_title,
   'outcomeCode',o.outcome_code,'side',o.side,'stake',o.stake,'assetCode','TNGN',
   'status',o.status,'finalOutcome',o.final_outcome,'payout',o.payout,'settledAt',o.settled_at,
   'createdAt',o.created_at,'quotedProbability',o.quoted_probability,'environment','TNGN')
 from public.demo_orders o where o.user_id=auth.uid() and o.instrument_public_id is not null
 order by o.created_at desc;
end; $$;

revoke all on function private.settle_tngn_market_orders(uuid) from public,anon,authenticated;
revoke all on function public.my_tngn_market_orders() from public,anon;
grant execute on function public.my_tngn_market_orders() to authenticated;
commit;