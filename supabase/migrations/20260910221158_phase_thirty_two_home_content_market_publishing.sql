create table public.home_promotions (
  public_id uuid primary key default gen_random_uuid(),
  banner_kind text not null check (banner_kind in ('TEXT','IMAGE')),
  title text,
  body text,
  image_url text,
  target_path text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint home_promotions_route_internal check (target_path ~ '^/[^/].*|^/$'),
  constraint home_promotions_schedule check (ends_at is null or starts_at is null or ends_at > starts_at),
  constraint home_promotions_payload check (
    (banner_kind='TEXT' and nullif(btrim(title),'') is not null and image_url is null)
    or
    (banner_kind='IMAGE' and image_url ~ '^https://[^[:space:]]+$')
  )
);

create table public.public_notices (
  public_id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(btrim(message)) between 3 and 220),
  tone text not null default 'WARNING' check (tone in ('WARNING','SUCCESS')),
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','ARCHIVED')),
  priority integer not null default 100 check (priority between 0 and 10000),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint public_notices_schedule check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table public.market_featured (
  instrument_public_id uuid primary key references market.instruments(public_id) on delete cascade,
  active boolean not null default true,
  feature_rank integer not null default 100 check (feature_rank between 0 and 10000),
  featured_at timestamptz not null default statement_timestamp(),
  featured_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp()
);

create trigger home_promotions_set_updated_at before update on public.home_promotions for each row execute function private.set_updated_at();
create trigger public_notices_set_updated_at before update on public.public_notices for each row execute function private.set_updated_at();
create trigger market_featured_set_updated_at before update on public.market_featured for each row execute function private.set_updated_at();

alter table public.home_promotions enable row level security;
alter table public.public_notices enable row level security;
alter table public.market_featured enable row level security;

grant select on public.home_promotions, public.public_notices, public.market_featured to anon, authenticated;

create policy home_promotions_public_read on public.home_promotions for select to anon, authenticated
using (status='PUBLISHED' and (starts_at is null or starts_at <= statement_timestamp()) and (ends_at is null or ends_at > statement_timestamp()));
create policy home_promotions_admin_read on public.home_promotions for select to authenticated
using (private.has_permission('content.moderate'));

create policy public_notices_public_read on public.public_notices for select to anon, authenticated
using (status='PUBLISHED' and (starts_at is null or starts_at <= statement_timestamp()) and (ends_at is null or ends_at > statement_timestamp()));
create policy public_notices_admin_read on public.public_notices for select to authenticated
using (private.has_permission('content.moderate'));

create policy market_featured_public_read on public.market_featured for select to anon, authenticated using (active);
create policy market_featured_admin_read on public.market_featured for select to authenticated using (private.has_permission('markets.manage'));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('home-promotions','home-promotions',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy home_promotions_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='home-promotions' and private.has_permission('content.moderate'));
create policy home_promotions_storage_update on storage.objects for update to authenticated
using (bucket_id='home-promotions' and private.has_permission('content.moderate'))
with check (bucket_id='home-promotions' and private.has_permission('content.moderate'));
create policy home_promotions_storage_delete on storage.objects for delete to authenticated
using (bucket_id='home-promotions' and private.has_permission('content.moderate'));

create or replace function public.admin_upsert_home_promotion(
  p_public_id uuid,
  p_banner_kind text,
  p_title text,
  p_body text,
  p_image_url text,
  p_target_path text,
  p_status text default 'DRAFT',
  p_sort_order integer default 100
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_kind text:=upper(btrim(coalesce(p_banner_kind,'')));
  v_status text:=upper(btrim(coalesce(p_status,'DRAFT')));
  v_path text:=btrim(coalesce(p_target_path,''));
  v_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null or not private.has_permission('content.moderate') then raise exception 'Content moderation permission required' using errcode='42501'; end if;
  if v_kind not in ('TEXT','IMAGE') then raise exception 'Banner kind must be TEXT or IMAGE' using errcode='22023'; end if;
  if v_status not in ('DRAFT','PUBLISHED','ARCHIVED') then raise exception 'Invalid promotion status' using errcode='22023'; end if;
  if v_path='' or left(v_path,1) <> '/' or left(v_path,2)='//' or char_length(v_path)>512 then raise exception 'Promotion target must be a valid internal VAD route' using errcode='22023'; end if;
  if p_sort_order < 0 or p_sort_order > 10000 then raise exception 'Promotion sort order is invalid' using errcode='22023'; end if;
  if v_kind='TEXT' and nullif(btrim(coalesce(p_title,'')),'') is null then raise exception 'Text promotions require a title' using errcode='22023'; end if;
  if v_kind='IMAGE' and coalesce(p_image_url,'') !~ '^https://[^[:space:]]+$' then raise exception 'Image promotions require a secure HTTPS image URL' using errcode='22023'; end if;

  if p_public_id is null then
    insert into public.home_promotions(banner_kind,title,body,image_url,target_path,status,sort_order,created_by,updated_by)
    values(v_kind,nullif(btrim(coalesce(p_title,'')),''),nullif(btrim(coalesce(p_body,'')),''),case when v_kind='IMAGE' then btrim(p_image_url) else null end,v_path,v_status,p_sort_order,auth.uid(),auth.uid())
    returning public_id into v_id;
    v_before:=null;
  else
    select to_jsonb(hp) into v_before from public.home_promotions hp where hp.public_id=p_public_id for update;
    if v_before is null then raise exception 'Promotion not found' using errcode='P0002'; end if;
    update public.home_promotions set banner_kind=v_kind,title=nullif(btrim(coalesce(p_title,'')),''),body=nullif(btrim(coalesce(p_body,'')),''),image_url=case when v_kind='IMAGE' then btrim(p_image_url) else null end,target_path=v_path,status=v_status,sort_order=p_sort_order,updated_by=auth.uid() where public_id=p_public_id returning public_id into v_id;
  end if;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason)
  select auth.uid(),'ADMIN','HOME_PROMOTION_'||v_status,'HOME_PROMOTION',v_id::text,v_before,to_jsonb(hp),'Admin home promotion update' from public.home_promotions hp where hp.public_id=v_id;
  return v_id;
end; $$;

create or replace function public.admin_upsert_public_notice(
  p_public_id uuid,
  p_message text,
  p_tone text default 'WARNING',
  p_status text default 'DRAFT',
  p_priority integer default 100
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_tone text:=upper(btrim(coalesce(p_tone,'WARNING')));
  v_status text:=upper(btrim(coalesce(p_status,'DRAFT')));
  v_message text:=btrim(coalesce(p_message,''));
  v_id uuid;
  v_before jsonb;
begin
  if auth.uid() is null or not private.has_permission('content.moderate') then raise exception 'Content moderation permission required' using errcode='42501'; end if;
  if char_length(v_message) < 3 or char_length(v_message) > 220 then raise exception 'Public notice must be between 3 and 220 characters' using errcode='22023'; end if;
  if v_tone not in ('WARNING','SUCCESS') then raise exception 'Notice tone must be WARNING or SUCCESS' using errcode='22023'; end if;
  if v_status not in ('DRAFT','PUBLISHED','ARCHIVED') then raise exception 'Invalid notice status' using errcode='22023'; end if;
  if p_priority < 0 or p_priority > 10000 then raise exception 'Notice priority is invalid' using errcode='22023'; end if;

  if p_public_id is null then
    insert into public.public_notices(message,tone,status,priority,created_by,updated_by)
    values(v_message,v_tone,v_status,p_priority,auth.uid(),auth.uid()) returning public_id into v_id;
    v_before:=null;
  else
    select to_jsonb(pn) into v_before from public.public_notices pn where pn.public_id=p_public_id for update;
    if v_before is null then raise exception 'Public notice not found' using errcode='P0002'; end if;
    update public.public_notices set message=v_message,tone=v_tone,status=v_status,priority=p_priority,updated_by=auth.uid() where public_id=p_public_id returning public_id into v_id;
  end if;

  if v_status='PUBLISHED' then
    update public.public_notices set status='ARCHIVED',updated_by=auth.uid() where public_id<>v_id and status='PUBLISHED';
  end if;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason)
  select auth.uid(),'ADMIN','PUBLIC_NOTICE_'||v_status,'PUBLIC_NOTICE',v_id::text,v_before,to_jsonb(pn),'Admin public notice update' from public.public_notices pn where pn.public_id=v_id;
  return v_id;
end; $$;

create or replace function public.admin_market_publication_queue()
returns table(
  instrument_public_id uuid,
  event_public_id uuid,
  title text,
  category text,
  asset_code text,
  instrument_status text,
  event_status text,
  opens_at timestamptz,
  closes_at timestamptz,
  is_featured boolean,
  feature_rank integer,
  featured_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  return query
    select i.public_id,ce.public_id,ce.title,ce.category,a.code,i.status,ce.status,ce.opens_at,ce.closes_at,coalesce(mf.active,false),mf.feature_rank,mf.featured_at
    from market.instruments i
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    left join public.market_featured mf on mf.instrument_public_id=i.public_id
    where i.status in ('DRAFT','OPEN','SUSPENDED','CLOSED')
    order by case i.status when 'DRAFT' then 0 when 'OPEN' then 1 else 2 end, ce.created_at desc;
end; $$;

create or replace function public.admin_set_market_featured(p_instrument_public_id uuid,p_featured boolean,p_rank integer default 100,p_reason text default null)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_instrument market.instruments; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  if char_length(v_reason)<3 then raise exception 'A reason is required' using errcode='22023'; end if;
  if p_rank<0 or p_rank>10000 then raise exception 'Feature rank is invalid' using errcode='22023'; end if;
  select * into v_instrument from market.instruments where public_id=p_instrument_public_id for update;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  if p_featured and v_instrument.status <> 'OPEN' then raise exception 'Only published OPEN markets can be featured' using errcode='P0001'; end if;

  insert into public.market_featured(instrument_public_id,active,feature_rank,featured_at,featured_by)
  values(p_instrument_public_id,p_featured,p_rank,statement_timestamp(),auth.uid())
  on conflict(instrument_public_id) do update set active=excluded.active,feature_rank=excluded.feature_rank,featured_at=case when excluded.active then statement_timestamp() else public.market_featured.featured_at end,featured_by=auth.uid();

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN',case when p_featured then 'MARKET_FEATURED' else 'MARKET_UNFEATURED' end,'MARKET',p_instrument_public_id::text,v_reason,jsonb_build_object('feature_rank',p_rank));
  return true;
end; $$;

create or replace function public.admin_publish_market(p_instrument_public_id uuid,p_feature_rank integer default 100,p_reason text default null)
returns boolean
language plpgsql security definer set search_path=''
as $$
declare v_instrument market.instruments; v_event market.canonical_events; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  if char_length(v_reason)<3 then raise exception 'A publication reason is required' using errcode='22023'; end if;
  if p_feature_rank<0 or p_feature_rank>10000 then raise exception 'Feature rank is invalid' using errcode='22023'; end if;
  select * into v_instrument from market.instruments where public_id=p_instrument_public_id for update;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  select * into v_event from market.canonical_events where id=v_instrument.canonical_event_id for update;
  if v_instrument.status <> 'DRAFT' then raise exception 'Only DRAFT markets can be published' using errcode='P0001'; end if;
  if v_event.status not in ('APPROVED','SCHEDULED') then raise exception 'Canonical event is not approved for publication' using errcode='P0001'; end if;
  if v_event.opens_at is not null and v_event.opens_at > statement_timestamp() then raise exception 'Market cannot be published before its configured opening time' using errcode='P0001'; end if;
  if v_event.closes_at <= statement_timestamp() then raise exception 'Market cannot be published after its closing time' using errcode='P0001'; end if;

  update market.instruments set status='OPEN',opened_at=coalesce(opened_at,statement_timestamp()) where id=v_instrument.id;
  update market.canonical_events set status='OPEN' where id=v_event.id;

  insert into public.market_featured(instrument_public_id,active,feature_rank,featured_at,featured_by)
  values(v_instrument.public_id,true,p_feature_rank,statement_timestamp(),auth.uid())
  on conflict(instrument_public_id) do update set active=true,feature_rank=excluded.feature_rank,featured_at=statement_timestamp(),featured_by=auth.uid();

  perform command.refresh_market_catalog(v_instrument.id);

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_PUBLISHED','MARKET_INSTRUMENT',v_instrument.public_id::text,jsonb_build_object('instrument_id',v_instrument.public_id,'event_id',v_event.public_id,'feature_rank',p_feature_rank),'market-published:'||v_instrument.public_id::text)
  on conflict(idempotency_key) do nothing;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,before_state,after_state,metadata)
  values(auth.uid(),'ADMIN','MARKET_PUBLISHED','MARKET',v_instrument.public_id::text,v_reason,jsonb_build_object('instrument_status',v_instrument.status,'event_status',v_event.status),jsonb_build_object('instrument_status','OPEN','event_status','OPEN'),jsonb_build_object('automatically_featured',true,'feature_rank',p_feature_rank));
  return true;
end; $$;

create or replace function public.admin_approve_market_proposal(p_proposal_public_id uuid,p_template_code text,p_title text,p_description text,p_category text,p_normalized_parameters jsonb,p_resolution_scope jsonb,p_opens_at timestamptz,p_closes_at timestamptz,p_resolves_after timestamptz,p_oracle_policy_public_id uuid,p_country_code text,p_asset_code text,p_min_order_notional numeric default 100,p_pricing_precision smallint default 4)
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare proposal market.proposals; template market.templates; oracle_policy oracle.policies; jurisdiction public.jurisdictions; asset public.assets; fingerprint text; event_id bigint; event_public_id uuid; instrument_id bigint; instrument_public_id uuid; existing boolean:=false; instrument_status text; begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  select * into proposal from market.proposals where public_id=p_proposal_public_id for update;
  if proposal.id is null then raise exception 'Market proposal not found' using errcode='P0002'; end if;
  if proposal.status not in ('SUBMITTED','PROCESSING','UNDER_REVIEW','NEEDS_CLARIFICATION') then raise exception 'Proposal cannot be approved from its current state' using errcode='P0001'; end if;
  select * into template from market.templates where code=p_template_code and status='ACTIVE';
  if template.id is null then raise exception 'Active market template not found' using errcode='22023'; end if;
  select * into oracle_policy from oracle.policies where public_id=p_oracle_policy_public_id and status='ACTIVE' and effective_at<=statement_timestamp();
  if oracle_policy.id is null then raise exception 'An active oracle policy is required before market approval' using errcode='P0001'; end if;
  select * into jurisdiction from public.jurisdictions where country_code=upper(p_country_code) and status='ACTIVE';
  if jurisdiction.id is null then raise exception 'Jurisdiction is not active' using errcode='P0001'; end if;
  select a.* into asset from public.assets a join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.jurisdiction_id=jurisdiction.id where a.code=upper(p_asset_code) and a.status='ACTIVE' and ja.status='ACTIVE';
  if asset.id is null then raise exception 'Asset is not enabled for this jurisdiction' using errcode='P0001'; end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then raise exception 'Invalid market timing' using errcode='22023'; end if;
  fingerprint:=command.compute_canonical_fingerprint(template.code,p_normalized_parameters,p_resolution_scope::text);
  select ce.id,ce.public_id into event_id,event_public_id from market.canonical_events ce where ce.canonical_fingerprint=fingerprint;
  if event_id is not null then
    existing:=true;
    update market.proposals set matched_canonical_event_id=event_id,canonicalization_decision='EXACT_DUPLICATE',status='MERGED',decision_reason='Merged into existing canonical event',updated_at=statement_timestamp() where id=proposal.id;
  else
    insert into market.canonical_events(template_id,title,description,category,canonical_fingerprint,normalized_parameters,resolution_scope,opens_at,closes_at,resolves_after,status,originator_user_id)
    values(template.id,btrim(p_title),p_description,upper(p_category),fingerprint,p_normalized_parameters,p_resolution_scope,p_opens_at,p_closes_at,p_resolves_after,case when p_opens_at>statement_timestamp() then 'SCHEDULED' else 'APPROVED' end,proposal.proposer_user_id)
    returning id,public_id into event_id,event_public_id;
    update market.proposals set proposed_template_id=template.id,matched_canonical_event_id=event_id,canonicalization_decision='DISTINCT_EVENT',status='APPROVED',normalized_payload=p_normalized_parameters,decision_reason='Approved as a new canonical event; publication pending',updated_at=statement_timestamp() where id=proposal.id;
  end if;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by) values(event_id,oracle_policy.id,auth.uid()) on conflict(event_id) do nothing;
  select i.id,i.public_id,i.status into instrument_id,instrument_public_id,instrument_status from market.instruments i where i.canonical_event_id=event_id and i.asset_id=asset.id;
  if instrument_id is null then
    insert into market.instruments(canonical_event_id,asset_id,market_type,liquidity_model,settlement_unit,pricing_precision,min_order_notional,status,opened_at,closed_at)
    values(event_id,asset.id,'BINARY','ORDER_BOOK',1,p_pricing_precision,p_min_order_notional,'DRAFT',null,p_closes_at)
    returning id,public_id,status into instrument_id,instrument_public_id,instrument_status;
    insert into market.outcomes(instrument_id,code,label,display_order) values(instrument_id,'YES','Yes',1),(instrument_id,'NO','No',2);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_APPROVED','CANONICAL_EVENT',event_public_id::text,jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'country_code',jurisdiction.country_code,'merged_existing',existing,'publication_required',instrument_status='DRAFT'),'market-approved:'||p_proposal_public_id::text)
  on conflict(idempotency_key) do nothing;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_PROPOSAL_APPROVED','CANONICAL_EVENT',event_public_id::text,'Approved market proposal; publication is a separate action',jsonb_build_object('proposal_id',p_proposal_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'canonical_fingerprint',fingerprint,'merged_existing',existing,'publication_required',instrument_status='DRAFT'));
  return jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','instrument_status',instrument_status);
end; $$;

revoke execute on function public.admin_upsert_home_promotion(uuid,text,text,text,text,text,text,integer) from public,anon;
revoke execute on function public.admin_upsert_public_notice(uuid,text,text,text,integer) from public,anon;
revoke execute on function public.admin_market_publication_queue() from public,anon;
revoke execute on function public.admin_set_market_featured(uuid,boolean,integer,text) from public,anon;
revoke execute on function public.admin_publish_market(uuid,integer,text) from public,anon;
grant execute on function public.admin_upsert_home_promotion(uuid,text,text,text,text,text,text,integer) to authenticated;
grant execute on function public.admin_upsert_public_notice(uuid,text,text,text,integer) to authenticated;
grant execute on function public.admin_market_publication_queue() to authenticated;
grant execute on function public.admin_set_market_featured(uuid,boolean,integer,text) to authenticated;
grant execute on function public.admin_publish_market(uuid,integer,text) to authenticated;

insert into public.market_featured(instrument_public_id,active,feature_rank,featured_at)
select i.public_id,true,100,statement_timestamp() from market.instruments i where i.status='OPEN'
on conflict(instrument_public_id) do nothing;
