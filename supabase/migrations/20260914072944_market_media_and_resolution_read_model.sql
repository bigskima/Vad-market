alter table market.proposals
  add column if not exists media_path text;

alter table market.canonical_events
  add column if not exists media_path text;

alter table public.market_catalog
  add column if not exists resolves_after timestamptz,
  add column if not exists media_path text;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'market-media',
  'market-media',
  true,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict(id) do update
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists market_media_insert_own on storage.objects;
create policy market_media_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id='market-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy if exists market_media_select_own on storage.objects;
create policy market_media_select_own
on storage.objects
for select
to authenticated
using (
  bucket_id='market-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy if exists market_media_update_own on storage.objects;
create policy market_media_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id='market-media'
  and split_part(name,'/',1)=(select auth.uid())::text
)
with check (
  bucket_id='market-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

drop policy if exists market_media_delete_own on storage.objects;
create policy market_media_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id='market-media'
  and split_part(name,'/',1)=(select auth.uid())::text
);

create or replace function command.refresh_market_catalog(p_instrument_id bigint)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  instrument market.instruments;
  event market.canonical_events;
  asset public.assets;
  yes_outcome_id bigint;
  no_outcome_id bigint;
  yes_last numeric(38,18);
  no_last numeric(38,18);
  latest_fill timestamptz;
begin
  select * into instrument from market.instruments where id=p_instrument_id;
  if instrument.id is null then return; end if;
  select * into event from market.canonical_events where id=instrument.canonical_event_id;
  select * into asset from public.assets where id=instrument.asset_id;
  select id into yes_outcome_id from market.outcomes where instrument_id=instrument.id and code='YES';
  select id into no_outcome_id from market.outcomes where instrument_id=instrument.id and code='NO';
  select f.price into yes_last from trading.fills f where f.outcome_id=yes_outcome_id order by f.created_at desc,f.id desc limit 1;
  select f.price into no_last from trading.fills f where f.outcome_id=no_outcome_id order by f.created_at desc,f.id desc limit 1;
  select max(f.created_at) into latest_fill from trading.fills f join trading.orders o on o.id=f.order_id where o.instrument_id=instrument.id;

  insert into public.market_catalog(
    instrument_public_id,event_public_id,title,category,asset_code,market_type,status,
    closes_at,resolves_after,media_path,yes_price,no_price,last_trade_at,updated_at
  )
  values(
    instrument.public_id,event.public_id,event.title,event.category,asset.code,instrument.market_type,instrument.status,
    event.closes_at,event.resolves_after,event.media_path,yes_last,no_last,latest_fill,statement_timestamp()
  )
  on conflict(instrument_public_id) do update set
    event_public_id=excluded.event_public_id,
    title=excluded.title,
    category=excluded.category,
    asset_code=excluded.asset_code,
    market_type=excluded.market_type,
    status=excluded.status,
    closes_at=excluded.closes_at,
    resolves_after=excluded.resolves_after,
    media_path=excluded.media_path,
    yes_price=excluded.yes_price,
    no_price=excluded.no_price,
    last_trade_at=excluded.last_trade_at,
    updated_at=statement_timestamp();
end;
$function$;

create or replace function private.sync_market_media_from_proposal()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_instrument_id bigint;
begin
  if new.matched_canonical_event_id is null
     or upper(coalesce(new.canonicalization_decision,''))<>'DISTINCT_EVENT' then
    return new;
  end if;

  update market.canonical_events
  set media_path=new.media_path,
      updated_at=statement_timestamp()
  where id=new.matched_canonical_event_id
    and originator_user_id=new.proposer_user_id;

  for v_instrument_id in
    select i.id
    from market.instruments i
    where i.canonical_event_id=new.matched_canonical_event_id
  loop
    perform command.refresh_market_catalog(v_instrument_id);
  end loop;

  return new;
end;
$function$;

drop trigger if exists market_proposals_sync_market_media on market.proposals;
create trigger market_proposals_sync_market_media
after update of media_path,matched_canonical_event_id,canonicalization_decision
on market.proposals
for each row
execute function private.sync_market_media_from_proposal();

create or replace function public.set_market_proposal_media(
  p_proposal_public_id uuid,
  p_media_path text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_proposal market.proposals;
  v_path text:=nullif(btrim(coalesce(p_media_path,'')),'');
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;

  select * into v_proposal
  from market.proposals
  where public_id=p_proposal_public_id
  for update;

  if v_proposal.id is null or v_proposal.proposer_user_id<>auth.uid() then
    raise exception 'Market proposal not found' using errcode='P0002';
  end if;

  if v_path is not null then
    if split_part(v_path,'/',1)<>auth.uid()::text
       or position('..' in v_path)>0
       or left(v_path,1)='/' then
      raise exception 'Invalid market media path' using errcode='22023';
    end if;

    if not exists(
      select 1
      from storage.objects o
      where o.bucket_id='market-media' and o.name=v_path
    ) then
      raise exception 'Market media upload not found' using errcode='P0002';
    end if;
  end if;

  update market.proposals
  set media_path=v_path,
      updated_at=statement_timestamp()
  where id=v_proposal.id;

  return true;
end;
$function$;

revoke all on function public.set_market_proposal_media(uuid,text) from public;
revoke all on function public.set_market_proposal_media(uuid,text) from anon;
grant execute on function public.set_market_proposal_media(uuid,text) to authenticated;

create or replace function public.admin_set_market_media(
  p_instrument_public_id uuid,
  p_media_path text
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_instrument market.instruments;
  v_event market.canonical_events;
  v_path text:=nullif(btrim(coalesce(p_media_path,'')),'');
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;

  select * into v_instrument
  from market.instruments
  where public_id=p_instrument_public_id
  for update;

  if v_instrument.id is null then
    raise exception 'Market not found' using errcode='P0002';
  end if;

  if v_path is not null then
    if split_part(v_path,'/',1)<>auth.uid()::text
       or position('..' in v_path)>0
       or left(v_path,1)='/' then
      raise exception 'Invalid market media path' using errcode='22023';
    end if;

    if not exists(
      select 1
      from storage.objects o
      where o.bucket_id='market-media' and o.name=v_path
    ) then
      raise exception 'Market media upload not found' using errcode='P0002';
    end if;
  end if;

  select * into v_event
  from market.canonical_events
  where id=v_instrument.canonical_event_id
  for update;

  update market.canonical_events
  set media_path=v_path,
      updated_at=statement_timestamp()
  where id=v_event.id;

  perform command.refresh_market_catalog(v_instrument.id);

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'ADMIN','MARKET_MEDIA_UPDATED','MARKET',v_instrument.public_id::text,
    case when v_path is null then 'Removed market media' else 'Updated market media' end,
    jsonb_build_object('media_path',v_path,'event_id',v_event.public_id)
  );

  return true;
end;
$function$;

revoke all on function public.admin_set_market_media(uuid,text) from public;
revoke all on function public.admin_set_market_media(uuid,text) from anon;
grant execute on function public.admin_set_market_media(uuid,text) to authenticated;

create or replace function public.market_detail(p_instrument_public_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'instrumentId',i.public_id,
    'eventId',ce.public_id,
    'title',ce.title,
    'description',ce.description,
    'category',ce.category,
    'status',i.status,
    'assetCode',a.code,
    'settlementUnit',i.settlement_unit,
    'minimumOrderNotional',i.min_order_notional,
    'opensAt',ce.opens_at,
    'closesAt',ce.closes_at,
    'resolvesAfter',ce.resolves_after,
    'mediaPath',ce.media_path,
    'resolutionScope',ce.resolution_scope,
    'outcomes',(
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',o.id,'code',o.code,'label',o.label,'displayOrder',o.display_order
      ) order by o.display_order),'[]'::jsonb)
      from market.outcomes o
      where o.instrument_id=i.id
    ),
    'oracle',jsonb_build_object(
      'policyId',op.public_id,
      'policyName',op.name,
      'policyVersion',op.version,
      'sourceHierarchy',op.source_hierarchy,
      'consensusRule',op.consensus_rule,
      'closeRule',op.close_rule,
      'postponementRule',op.postponement_rule,
      'cancellationRule',op.cancellation_rule,
      'voidRule',op.void_rule,
      'disputeWindowSeconds',op.dispute_window_seconds
    )
  )
  from market.instruments i
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join public.assets a on a.id=i.asset_id
  join oracle.event_policy_bindings epb on epb.event_id=ce.id
  join oracle.policies op on op.id=epb.oracle_policy_id
  where i.public_id=p_instrument_public_id;
$function$;

do $block$
declare
  v_id bigint;
begin
  for v_id in
    select i.id
    from market.instruments i
    join public.market_catalog mc on mc.instrument_public_id=i.public_id
  loop
    perform command.refresh_market_catalog(v_id);
  end loop;
end;
$block$;