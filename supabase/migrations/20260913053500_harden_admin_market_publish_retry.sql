create or replace function public.admin_publish_market(
  p_instrument_public_id uuid,
  p_feature_rank integer default 100,
  p_reason text default null
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_instrument market.instruments;
  v_event market.canonical_events;
  v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  perform private.assert_service_available('market_publication',auth.uid());
  if char_length(v_reason)<3 then
    raise exception 'A publication reason is required' using errcode='22023';
  end if;
  if p_feature_rank<0 or p_feature_rank>10000 then
    raise exception 'VAD Market priority is invalid' using errcode='22023';
  end if;

  select * into v_instrument
  from market.instruments
  where public_id=p_instrument_public_id
  for update;
  if v_instrument.id is null then
    raise exception 'Market not found' using errcode='P0002';
  end if;

  select * into v_event
  from market.canonical_events
  where id=v_instrument.canonical_event_id
  for update;

  -- Safe retry path. If the first request committed but its HTTP response was
  -- lost, a repeated publish request is treated as success and restores the
  -- VAD curation instead of incorrectly reporting that the market is no longer a draft.
  if v_instrument.status='OPEN' and v_event.status='OPEN' then
    insert into public.vad_market_curations(
      instrument_public_id,active,priority,published_at,published_by
    ) values(
      v_instrument.public_id,true,p_feature_rank,coalesce(v_instrument.opened_at,statement_timestamp()),auth.uid()
    )
    on conflict(instrument_public_id) do update
      set active=true,
          priority=excluded.priority,
          published_by=auth.uid(),
          updated_at=statement_timestamp();

    perform command.refresh_market_catalog(v_instrument.id);
    return true;
  end if;

  if v_instrument.status<>'DRAFT' then
    raise exception 'Only draft markets can be published' using errcode='P0001';
  end if;
  if v_event.status not in('APPROVED','SCHEDULED') then
    raise exception 'Market is not approved for publication' using errcode='P0001';
  end if;
  if v_event.opens_at is not null and v_event.opens_at>statement_timestamp() then
    raise exception 'Market cannot be published before its configured opening time' using errcode='P0001';
  end if;
  if v_event.closes_at<=statement_timestamp() then
    raise exception 'Market cannot be published after its closing time' using errcode='P0001';
  end if;

  update market.instruments
  set status='OPEN',opened_at=coalesce(opened_at,statement_timestamp())
  where id=v_instrument.id;

  update market.canonical_events
  set status='OPEN',updated_at=statement_timestamp()
  where id=v_event.id;

  insert into public.vad_market_curations(
    instrument_public_id,active,priority,published_at,published_by
  ) values(
    v_instrument.public_id,true,p_feature_rank,statement_timestamp(),auth.uid()
  )
  on conflict(instrument_public_id) do update
    set active=true,
        priority=excluded.priority,
        published_at=statement_timestamp(),
        published_by=auth.uid(),
        updated_at=statement_timestamp();

  insert into public.market_featured(
    instrument_public_id,active,feature_rank,featured_at,featured_by
  ) values(
    v_instrument.public_id,true,p_feature_rank,statement_timestamp(),auth.uid()
  )
  on conflict(instrument_public_id) do update
    set active=true,
        feature_rank=excluded.feature_rank,
        featured_at=statement_timestamp(),
        featured_by=auth.uid(),
        updated_at=statement_timestamp();

  perform command.refresh_market_catalog(v_instrument.id);
  perform private.refresh_featured_market_rankings();

  insert into eventing.domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values(
    'MARKET_PUBLISHED','MARKET',v_instrument.public_id::text,
    jsonb_build_object(
      'instrument_public_id',v_instrument.public_id,
      'event_public_id',v_event.public_id,
      'published_by',auth.uid(),
      'vad_market',true
    ),
    'market-published:'||v_instrument.public_id::text
  )
  on conflict(idempotency_key) do nothing;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','MARKET_PUBLISHED','MARKET',v_instrument.public_id::text,
    v_reason,jsonb_build_object('vad_market_priority',p_feature_rank)
  );

  return true;
end;
$$;

revoke all on function public.admin_publish_market(uuid,integer,text) from public,anon;
grant execute on function public.admin_publish_market(uuid,integer,text) to authenticated;
