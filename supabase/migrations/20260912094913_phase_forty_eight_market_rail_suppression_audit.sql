create or replace function public.admin_set_market_home_suppression(p_instrument_public_id uuid,p_surface text,p_suppressed boolean,p_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_surface text:=upper(btrim(coalesce(p_surface,'')));v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501';end if;
  if v_surface not in('FEATURED','TRENDING') then raise exception 'Choose Featured or Trending' using errcode='22023';end if;
  if char_length(v_reason)<3 then raise exception 'A reason is required' using errcode='22023';end if;
  if not exists(select 1 from market.instruments where public_id=p_instrument_public_id) then raise exception 'Market not found' using errcode='P0002';end if;
  insert into public.market_home_suppressions(instrument_public_id,suppress_featured,suppress_trending,reason,updated_by)
  values(p_instrument_public_id,v_surface='FEATURED' and p_suppressed,v_surface='TRENDING' and p_suppressed,v_reason,auth.uid())
  on conflict(instrument_public_id) do update set suppress_featured=case when v_surface='FEATURED' then p_suppressed else public.market_home_suppressions.suppress_featured end,suppress_trending=case when v_surface='TRENDING' then p_suppressed else public.market_home_suppressions.suppress_trending end,reason=v_reason,updated_by=auth.uid(),updated_at=statement_timestamp();
  perform private.refresh_featured_market_rankings();perform private.refresh_trending_market_rankings();
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN',case when p_suppressed then 'MARKET_HOME_SUPPRESSED' else 'MARKET_HOME_RESTORED' end,'MARKET',p_instrument_public_id::text,v_reason,jsonb_build_object('surface',v_surface));
  return true;
end;$$;