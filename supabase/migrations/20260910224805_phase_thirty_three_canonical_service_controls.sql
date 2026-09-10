create schema if not exists control;
revoke all on schema control from public, anon, authenticated;

create table control.services (
  service_key text primary key check (service_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  name text not null,
  description text not null,
  category text not null,
  default_enabled boolean not null default true,
  user_scopable boolean not null default true,
  inherits_app_pause boolean not null default true,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table control.service_overrides (
  id bigint generated always as identity primary key,
  public_id uuid not null unique default gen_random_uuid(),
  service_key text not null references control.services(service_key) on update cascade on delete restrict,
  scope_type text not null check (scope_type in ('GLOBAL','USER')),
  user_id uuid references auth.users(id) on delete cascade,
  paused boolean not null default true,
  reason text not null,
  resumes_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint service_override_scope check (
    (scope_type='GLOBAL' and user_id is null) or
    (scope_type='USER' and user_id is not null)
  ),
  constraint service_override_reason check (char_length(btrim(reason)) between 3 and 1000)
);

alter table control.services enable row level security;
alter table control.service_overrides enable row level security;

create unique index service_overrides_global_uniq on control.service_overrides(service_key) where scope_type='GLOBAL';
create unique index service_overrides_user_uniq on control.service_overrides(service_key,user_id) where scope_type='USER';
create index service_overrides_active_lookup_idx on control.service_overrides(service_key,scope_type,user_id,paused,resumes_at);
create index service_overrides_user_idx on control.service_overrides(user_id) where user_id is not null;
create index service_overrides_changed_by_idx on control.service_overrides(changed_by) where changed_by is not null;

insert into control.services(service_key,name,description,category,default_enabled,user_scopable,inherits_app_pause)
values
  ('app_access','App maintenance','Put user-initiated VAD actions into read-only maintenance mode while keeping safety-critical reconciliation and admin recovery available.','Platform',true,true,false),
  ('market_creation','Market creation','Submit new market proposals and future automated market admissions.','Markets',true,true,true),
  ('market_publication','Market publication','Move approved or automatically admitted market drafts into the live OPEN state.','Markets',true,false,false),
  ('trading','Trading','Place new market orders. Order cancellation remains available as a safety action.','Markets',true,true,true),
  ('portfolio','Portfolio access','View positions, orders and settlement receipts.','Markets',true,true,false),
  ('oracle_resolution','Oracle resolution','Create, review and finalize oracle resolutions and dispute decisions.','Markets',true,false,false),
  ('disputes','Resolution disputes','Open new resolution disputes. Existing disputes remain readable.','Markets',true,true,true),
  ('deposits','Deposits','Initiate new deposits. Existing provider callbacks and reconciliation continue.','Money',true,true,true),
  ('withdrawals','Withdrawals','Initiate new withdrawals. Existing provider callbacks, cancellation and reconciliation continue.','Money',true,true,true),
  ('settlement','Settlement execution','Execute new market settlement runs after final oracle resolution.','Money',true,false,false),
  ('social_posting','Community posting','Publish new conviction and community posts.','Community',true,true,true),
  ('social_comments','Community comments','Add new comments to community posts.','Community',true,true,true),
  ('social_reactions','Community reactions','Add or remove likes and similar lightweight reactions.','Community',true,true,true),
  ('social_following','Creator following','Follow or unfollow creators.','Community',true,true,true),
  ('kyc_start','KYC initiation','Start a new identity verification session. Existing webhooks continue processing.','Trust & Safety',true,true,true)
on conflict(service_key) do update set
  name=excluded.name,
  description=excluded.description,
  category=excluded.category,
  default_enabled=excluded.default_enabled,
  user_scopable=excluded.user_scopable,
  inherits_app_pause=excluded.inherits_app_pause,
  status='ACTIVE',
  updated_at=statement_timestamp();

create or replace function private.service_control_state(p_service_key text,p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_service control.services;
  v_override control.service_overrides;
  v_now timestamptz:=statement_timestamp();
  v_key text:=lower(btrim(coalesce(p_service_key,'')));
begin
  select * into v_service from control.services where service_key=v_key and status='ACTIVE';
  if v_service.service_key is null then
    return jsonb_build_object('serviceKey',v_key,'enabled',false,'reasonCode','UNKNOWN_SERVICE','message','This VAD service is not configured.','scope',null,'resumesAt',null);
  end if;

  if not v_service.default_enabled then
    return jsonb_build_object('serviceKey',v_key,'enabled',false,'reasonCode','SERVICE_DEFAULT_DISABLED','message','This VAD service is not enabled.','scope','DEFAULT','resumesAt',null);
  end if;

  if v_service.inherits_app_pause and v_key <> 'app_access' then
    select * into v_override
    from control.service_overrides
    where service_key='app_access' and scope_type='GLOBAL' and paused
      and (resumes_at is null or resumes_at>v_now)
    limit 1;
    if found then
      return jsonb_build_object('serviceKey',v_key,'enabled',false,'reasonCode','PLATFORM_MAINTENANCE','message',v_override.reason,'scope','GLOBAL','resumesAt',v_override.resumes_at,'inheritedFrom','app_access');
    end if;

    if p_user_id is not null then
      select * into v_override
      from control.service_overrides
      where service_key='app_access' and scope_type='USER' and user_id=p_user_id and paused
        and (resumes_at is null or resumes_at>v_now)
      limit 1;
      if found then
        return jsonb_build_object('serviceKey',v_key,'enabled',false,'reasonCode','ACCOUNT_ACTIONS_PAUSED','message',v_override.reason,'scope','USER','resumesAt',v_override.resumes_at,'inheritedFrom','app_access');
      end if;
    end if;
  end if;

  select * into v_override
  from control.service_overrides
  where service_key=v_key and scope_type='GLOBAL' and paused
    and (resumes_at is null or resumes_at>v_now)
  limit 1;
  if found then
    return jsonb_build_object('serviceKey',v_key,'enabled',false,'reasonCode','SERVICE_PAUSED','message',v_override.reason,'scope','GLOBAL','resumesAt',v_override.resumes_at);
  end if;

  if v_service.user_scopable and p_user_id is not null then
    select * into v_override
    from control.service_overrides
    where service_key=v_key and scope_type='USER' and user_id=p_user_id and paused
      and (resumes_at is null or resumes_at>v_now)
    limit 1;
    if found then
      return jsonb_build_object('serviceKey',v_key,'enabled',false,'reasonCode','ACCOUNT_SERVICE_PAUSED','message',v_override.reason,'scope','USER','resumesAt',v_override.resumes_at);
    end if;
  end if;

  return jsonb_build_object('serviceKey',v_key,'enabled',true,'reasonCode',null,'message',null,'scope',null,'resumesAt',null);
end;
$$;

create or replace function private.service_available(p_service_key text,p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((private.service_control_state(p_service_key,p_user_id)->>'enabled')::boolean,false);
$$;

create or replace function private.assert_service_available(p_service_key text,p_user_id uuid default auth.uid())
returns void
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_state jsonb;
begin
  v_state:=private.service_control_state(p_service_key,p_user_id);
  if not coalesce((v_state->>'enabled')::boolean,false) then
    raise exception '%',coalesce(nullif(v_state->>'message',''),'This VAD service is temporarily unavailable') using errcode='P0001',detail=coalesce(v_state->>'reasonCode','SERVICE_PAUSED');
  end if;
end;
$$;

create or replace function private.capability_enabled(p_capability_key text,p_country_code text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select
    coalesce((
      select cr.enabled
      from public.capability_rules cr
      where cr.capability_key=p_capability_key
        and cr.country_code=p_country_code
        and cr.status='ACTIVE'
        and cr.effective_at<=statement_timestamp()
        and (cr.expires_at is null or cr.expires_at>statement_timestamp())
      order by cr.version desc
      limit 1
    ),false)
    and case p_capability_key
      when 'create_post' then private.service_available('social_posting',auth.uid())
      when 'submit_market_proposal' then private.service_available('market_creation',auth.uid())
      when 'view_portfolio' then private.service_available('portfolio',auth.uid())
      when 'trade' then private.service_available('trading',auth.uid())
      when 'deposit' then private.service_available('deposits',auth.uid())
      when 'withdraw' then private.service_available('withdrawals',auth.uid())
      else true
    end;
$$;

create or replace function private.my_service_control_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_services jsonb;
begin
  select coalesce(jsonb_object_agg(s.service_key,private.service_control_state(s.service_key,auth.uid()) order by s.service_key),'{}'::jsonb)
  into v_services
  from control.services s
  where s.status='ACTIVE';

  return jsonb_build_object(
    'platform',private.service_control_state('app_access',auth.uid()),
    'services',v_services
  );
end;
$$;

revoke all on function private.service_control_state(text,uuid) from public, anon, authenticated;
revoke all on function private.service_available(text,uuid) from public, anon, authenticated;
revoke all on function private.assert_service_available(text,uuid) from public, anon, authenticated;
revoke all on function private.my_service_control_snapshot() from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.my_service_control_snapshot() to authenticated;

create or replace function public.my_service_control_snapshot()
returns jsonb
language plpgsql
stable
security invoker
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return private.my_service_control_snapshot();
end;
$$;
revoke all on function public.my_service_control_snapshot() from public, anon;
grant execute on function public.my_service_control_snapshot() to authenticated;

create or replace function public.internal_service_control_state(p_user_id uuid,p_service_key text)
returns jsonb
language sql
stable
security definer
set search_path=''
as $$
  select private.service_control_state(p_service_key,p_user_id);
$$;
revoke all on function public.internal_service_control_state(uuid,text) from public, anon, authenticated;
grant execute on function public.internal_service_control_state(uuid,text) to service_role;

create or replace function public.admin_service_control_catalog()
returns table(
  service_key text,
  name text,
  description text,
  category text,
  user_scopable boolean,
  inherits_app_pause boolean,
  global_paused boolean,
  global_reason text,
  global_resumes_at timestamptz,
  active_user_pauses bigint
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
  return query
  select
    s.service_key,s.name,s.description,s.category,s.user_scopable,s.inherits_app_pause,
    coalesce(g.paused and (g.resumes_at is null or g.resumes_at>statement_timestamp()),false) as global_paused,
    case when g.paused and (g.resumes_at is null or g.resumes_at>statement_timestamp()) then g.reason else null end,
    case when g.paused and (g.resumes_at is null or g.resumes_at>statement_timestamp()) then g.resumes_at else null end,
    (select count(*) from control.service_overrides u where u.service_key=s.service_key and u.scope_type='USER' and u.paused and (u.resumes_at is null or u.resumes_at>statement_timestamp()))
  from control.services s
  left join control.service_overrides g on g.service_key=s.service_key and g.scope_type='GLOBAL'
  where s.status='ACTIVE'
  order by case s.category when 'Platform' then 0 when 'Markets' then 1 when 'Money' then 2 when 'Community' then 3 else 4 end,s.name;
end;
$$;

create or replace function public.admin_user_service_controls(p_user_id uuid)
returns table(
  service_key text,
  name text,
  category text,
  enabled boolean,
  reason_code text,
  message text,
  pause_scope text,
  resumes_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
  if p_user_id is null or not exists(select 1 from public.user_accounts ua where ua.user_id=p_user_id) then raise exception 'User not found' using errcode='P0002'; end if;
  return query
  select
    s.service_key,s.name,s.category,
    coalesce((state.value->>'enabled')::boolean,false),
    state.value->>'reasonCode',state.value->>'message',state.value->>'scope',
    nullif(state.value->>'resumesAt','')::timestamptz
  from control.services s
  cross join lateral (select private.service_control_state(s.service_key,p_user_id) as value) state
  where s.status='ACTIVE' and s.user_scopable
  order by case s.category when 'Platform' then 0 when 'Markets' then 1 when 'Money' then 2 when 'Community' then 3 else 4 end,s.name;
end;
$$;

create or replace function public.admin_set_service_control(
  p_service_key text,
  p_paused boolean,
  p_reason text,
  p_resumes_at timestamptz default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_service control.services;
  v_before jsonb;
  v_after control.service_overrides;
  v_reason text:=btrim(coalesce(p_reason,''));
  v_scope text:=case when p_user_id is null then 'GLOBAL' else 'USER' end;
  v_resource_id text;
begin
  if auth.uid() is null or not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
  select * into v_service from control.services where service_key=lower(btrim(coalesce(p_service_key,''))) and status='ACTIVE';
  if v_service.service_key is null then raise exception 'Service control not found' using errcode='P0002'; end if;
  if p_user_id is not null and not v_service.user_scopable then raise exception 'This service supports global control only' using errcode='22023'; end if;
  if p_user_id is not null and not exists(select 1 from public.user_accounts ua where ua.user_id=p_user_id) then raise exception 'User not found' using errcode='P0002'; end if;
  if char_length(v_reason)<3 or char_length(v_reason)>1000 then raise exception 'A reason between 3 and 1000 characters is required' using errcode='22023'; end if;
  if p_paused and p_resumes_at is not null and p_resumes_at<=statement_timestamp() then raise exception 'Auto-resume time must be in the future' using errcode='22023'; end if;

  if p_user_id is null then
    select to_jsonb(o) into v_before from control.service_overrides o where o.service_key=v_service.service_key and o.scope_type='GLOBAL' for update;
    insert into control.service_overrides(service_key,scope_type,user_id,paused,reason,resumes_at,changed_by)
    values(v_service.service_key,'GLOBAL',null,p_paused,v_reason,case when p_paused then p_resumes_at else null end,auth.uid())
    on conflict(service_key) where scope_type='GLOBAL'
    do update set paused=excluded.paused,reason=excluded.reason,resumes_at=excluded.resumes_at,changed_by=auth.uid(),updated_at=statement_timestamp()
    returning * into v_after;
  else
    select to_jsonb(o) into v_before from control.service_overrides o where o.service_key=v_service.service_key and o.scope_type='USER' and o.user_id=p_user_id for update;
    insert into control.service_overrides(service_key,scope_type,user_id,paused,reason,resumes_at,changed_by)
    values(v_service.service_key,'USER',p_user_id,p_paused,v_reason,case when p_paused then p_resumes_at else null end,auth.uid())
    on conflict(service_key,user_id) where scope_type='USER'
    do update set paused=excluded.paused,reason=excluded.reason,resumes_at=excluded.resumes_at,changed_by=auth.uid(),updated_at=statement_timestamp()
    returning * into v_after;
  end if;

  v_resource_id:=v_service.service_key||':'||v_scope||case when p_user_id is null then '' else ':'||p_user_id::text end;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason,metadata)
  values(auth.uid(),'ADMIN',case when p_paused then 'SERVICE_PAUSED' else 'SERVICE_RESUMED' end,'SERVICE_CONTROL',v_resource_id,v_before,to_jsonb(v_after),v_reason,jsonb_build_object('service_key',v_service.service_key,'scope',v_scope,'user_id',p_user_id,'resumes_at',case when p_paused then p_resumes_at else null end));

  return jsonb_build_object('serviceKey',v_service.service_key,'scope',v_scope,'userId',p_user_id,'paused',p_paused,'resumesAt',case when p_paused then p_resumes_at else null end,'effectiveState',private.service_control_state(v_service.service_key,p_user_id));
end;
$$;

revoke all on function public.admin_service_control_catalog() from public, anon;
revoke all on function public.admin_user_service_controls(uuid) from public, anon;
revoke all on function public.admin_set_service_control(text,boolean,text,timestamptz,uuid) from public, anon;
grant execute on function public.admin_service_control_catalog() to authenticated;
grant execute on function public.admin_user_service_controls(uuid) to authenticated;
grant execute on function public.admin_set_service_control(text,boolean,text,timestamptz,uuid) to authenticated;

create or replace function public.add_post_comment(p_post_public_id uuid,p_body text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_post_id bigint; comment_id uuid;
begin
  perform private.require_active_account();
  perform private.assert_service_available('social_comments',auth.uid());
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>2000 then raise exception 'Comment must be 1-2000 characters' using errcode='22023'; end if;
  select id into v_post_id from social.posts where public_id=p_post_public_id and status='PUBLISHED';
  if v_post_id is null then raise exception 'Post not found' using errcode='P0002'; end if;
  insert into social.comments(post_id,author_user_id,body) values(v_post_id,auth.uid(),trim(p_body)) returning public_id into comment_id;
  return comment_id;
end;
$$;

create or replace function public.toggle_post_like(p_post_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_post_id bigint;
begin
  perform private.require_active_account();
  perform private.assert_service_available('social_reactions',auth.uid());
  select id into v_post_id from social.posts where public_id=p_post_public_id and status='PUBLISHED';
  if v_post_id is null then raise exception 'Post not found' using errcode='P0002'; end if;
  delete from social.reactions where post_id=v_post_id and user_id=auth.uid() and reaction_type='LIKE';
  if found then return false; end if;
  insert into social.reactions(post_id,user_id,reaction_type) values(v_post_id,auth.uid(),'LIKE');
  return true;
end;
$$;

create or replace function public.toggle_creator_follow(p_creator_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.require_active_account();
  perform private.assert_service_available('social_following',auth.uid());
  if p_creator_user_id is null or p_creator_user_id=auth.uid() then raise exception 'Invalid creator' using errcode='22023'; end if;
  if not exists(select 1 from public.user_accounts where user_id=p_creator_user_id and status='ACTIVE') then raise exception 'Creator not found' using errcode='P0002'; end if;
  delete from social.follows where follower_user_id=auth.uid() and followed_user_id=p_creator_user_id;
  if found then return false; end if;
  insert into social.follows(follower_user_id,followed_user_id) values(auth.uid(),p_creator_user_id);
  return true;
end;
$$;

create or replace function public.open_resolution_dispute(p_resolution_id bigint,p_reason text,p_evidence jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare acct public.user_accounts; r oracle.resolutions; pol oracle.policies; dispute_public_id uuid;
begin
  acct:=private.require_active_account();
  perform private.assert_service_available('disputes',auth.uid());
  select * into r from oracle.resolutions where id=p_resolution_id for share;
  if r.id is null or r.status<>'PROVISIONAL' then raise exception 'Provisional resolution required' using errcode='P0001'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  if statement_timestamp()>=r.created_at+make_interval(secs=>pol.dispute_window_seconds) then raise exception 'Dispute window has closed' using errcode='P0001'; end if;
  if p_reason is null or char_length(trim(p_reason))<5 or char_length(p_reason)>2000 then raise exception 'Dispute reason must be 5-2000 characters' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'[]'::jsonb))<>'array' then raise exception 'Evidence must be an array' using errcode='22023'; end if;
  insert into oracle.disputes(event_id,resolution_id,opened_by,reason,evidence,status) values(r.event_id,r.id,auth.uid(),trim(p_reason),coalesce(p_evidence,'[]'::jsonb),'OPEN') returning public_id into dispute_public_id;
  update market.canonical_events set status='DISPUTED',updated_at=statement_timestamp() where id=r.event_id;
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('ORACLE_DISPUTE_OPENED','ORACLE_DISPUTE',dispute_public_id::text,jsonb_build_object('resolution_id',r.id,'event_id',r.event_id,'opened_by',auth.uid()),'oracle-dispute-opened:'||dispute_public_id::text);
  return dispute_public_id;
end;
$$;

create or replace function public.admin_publish_market(p_instrument_public_id uuid,p_feature_rank integer default 100,p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_instrument market.instruments; v_event market.canonical_events; v_reason text:=btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  perform private.assert_service_available('market_publication',auth.uid());
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
end;
$$;

create or replace function public.admin_settle_market(p_instrument_public_id uuid)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare instrument_id bigint;
begin
  if not private.has_permission('finance.journals.post') then raise exception 'Permission required' using errcode='42501'; end if;
  perform private.assert_service_available('settlement',auth.uid());
  select id into instrument_id from market.instruments where public_id=p_instrument_public_id;
  if instrument_id is null then raise exception 'Market not found' using errcode='P0002'; end if;
  return settlement.execute_instrument(instrument_id);
end;
$$;

create or replace function public.admin_create_provisional_resolution(p_event_public_id uuid,p_outcome_code text,p_evidence jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare ev market.canonical_events; binding oracle.event_policy_bindings; pol oracle.policies; resolution_id bigint; existing oracle.resolutions;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  perform private.assert_service_available('oracle_resolution',auth.uid());
  select * into ev from market.canonical_events where public_id=p_event_public_id for update;
  if ev.id is null then raise exception 'Event not found' using errcode='P0002'; end if;
  if ev.status not in ('AWAITING_ORACLE','CLOSED','PROVISIONALLY_RESOLVED') then raise exception 'Event is not awaiting resolution' using errcode='P0001'; end if;
  select * into binding from oracle.event_policy_bindings where event_id=ev.id;
  select * into pol from oracle.policies where id=binding.oracle_policy_id;
  if pol.id is null or pol.status<>'ACTIVE' then raise exception 'Active oracle policy is required' using errcode='23514'; end if;
  if not exists(select 1 from market.instruments i join market.outcomes o on o.instrument_id=i.id where i.canonical_event_id=ev.id and o.code=upper(p_outcome_code)) then raise exception 'Outcome is not valid for this event' using errcode='22023'; end if;
  select * into existing from oracle.resolutions where event_id=ev.id and status='PROVISIONAL' for update;
  if existing.id is not null then
    if existing.created_by is distinct from auth.uid() then raise exception 'A provisional resolution already exists under another reviewer' using errcode='P0001'; end if;
    update oracle.resolutions set outcome_code=upper(p_outcome_code),consensus_evidence=coalesce(p_evidence,'{}'::jsonb) where id=existing.id;
    resolution_id:=existing.id;
  else
    insert into oracle.resolutions(event_id,oracle_policy_id,outcome_code,status,consensus_evidence,created_by) values(ev.id,pol.id,upper(p_outcome_code),'PROVISIONAL',coalesce(p_evidence,'{}'::jsonb),auth.uid()) returning id into resolution_id;
  end if;
  update market.canonical_events set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp() where id=ev.id;
  return resolution_id;
end;
$$;

create or replace function public.admin_finalize_resolution(p_resolution_id bigint,p_evidence jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare r oracle.resolutions; pol oracle.policies; ev market.canonical_events;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  perform private.assert_service_available('oracle_resolution',auth.uid());
  select * into r from oracle.resolutions where id=p_resolution_id for update;
  if r.id is null then raise exception 'Resolution not found' using errcode='P0002'; end if;
  if r.status<>'PROVISIONAL' then raise exception 'Only provisional resolutions can be finalized' using errcode='P0001'; end if;
  if r.created_by=auth.uid() then raise exception 'A different oracle reviewer must finalize the result' using errcode='42501'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  if statement_timestamp()<r.created_at+make_interval(secs=>pol.dispute_window_seconds) then raise exception 'Dispute window is still open' using errcode='P0001'; end if;
  if exists(select 1 from oracle.disputes d where d.resolution_id=r.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then raise exception 'Open dispute prevents finalization' using errcode='P0001'; end if;
  update oracle.resolutions set status='FINAL',consensus_evidence=consensus_evidence||coalesce(p_evidence,'{}'::jsonb),finalized_at=statement_timestamp(),finalized_by=auth.uid() where id=r.id;
  select * into ev from market.canonical_events where id=r.event_id for update;
  update market.canonical_events set status='FINALIZED',updated_at=statement_timestamp() where id=ev.id;
  update market.instruments set status='SETTLEMENT_PENDING',updated_at=statement_timestamp() where canonical_event_id=ev.id and status='CLOSED';
  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key) values('MARKET_FINALIZED','CANONICAL_EVENT',ev.public_id::text,jsonb_build_object('outcome_code',r.outcome_code,'resolution_id',r.id),'market-finalized:'||ev.public_id::text) on conflict(idempotency_key) do nothing;
  return true;
end;
$$;

create or replace function public.admin_finalize_void(p_resolution_id bigint,p_evidence jsonb default '{}'::jsonb)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare r oracle.resolutions; pol oracle.policies; ev market.canonical_events; mode text;
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  perform private.assert_service_available('oracle_resolution',auth.uid());
  select * into r from oracle.resolutions where id=p_resolution_id for update;
  if r.id is null or r.status<>'PROVISIONAL' then raise exception 'Provisional resolution required' using errcode='P0001'; end if;
  if r.created_by=auth.uid() then raise exception 'A different reviewer must finalize' using errcode='42501'; end if;
  select * into pol from oracle.policies where id=r.oracle_policy_id;
  mode:=coalesce(pol.void_rule->>'mode','');
  if mode<>'EQUAL_SPLIT' then raise exception 'This VAD runtime currently supports only EQUAL_SPLIT void policy' using errcode='0A000'; end if;
  if statement_timestamp()<r.created_at+make_interval(secs=>pol.dispute_window_seconds) then raise exception 'Dispute window is still open' using errcode='P0001'; end if;
  if exists(select 1 from oracle.disputes d where d.resolution_id=r.id and d.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then raise exception 'Open dispute prevents finalization' using errcode='P0001'; end if;
  update oracle.resolutions set status='VOID',outcome_code=null,consensus_evidence=consensus_evidence||coalesce(p_evidence,'{}'::jsonb),finalized_at=statement_timestamp(),finalized_by=auth.uid() where id=r.id;
  select * into ev from market.canonical_events where id=r.event_id for update;
  update market.canonical_events set status='FINALIZED',updated_at=statement_timestamp() where id=ev.id;
  update market.instruments set status='SETTLEMENT_PENDING',updated_at=statement_timestamp() where canonical_event_id=ev.id and status='CLOSED';
  return true;
end;
$$;

create or replace function public.admin_decide_resolution_dispute(p_dispute_public_id uuid,p_decision text,p_decision_reason text,p_replacement_outcome_code text default null)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare d oracle.disputes; r oracle.resolutions; decision text:=upper(p_decision);
begin
  if not private.has_permission('oracle.review') then raise exception 'Permission required' using errcode='42501'; end if;
  perform private.assert_service_available('oracle_resolution',auth.uid());
  if decision not in ('REJECT','UPHOLD','ESCALATE') then raise exception 'Invalid dispute decision' using errcode='22023'; end if;
  select * into d from oracle.disputes where public_id=p_dispute_public_id for update;
  if d.id is null or d.status not in ('OPEN','UNDER_REVIEW','ESCALATED') then raise exception 'Active dispute required' using errcode='P0001'; end if;
  select * into r from oracle.resolutions where id=d.resolution_id for update;
  if decision='ESCALATE' then
    update oracle.disputes set status='ESCALATED',decision_reason=p_decision_reason where id=d.id;
    return true;
  elsif decision='REJECT' then
    update oracle.disputes set status='REJECTED',decision_reason=p_decision_reason,resolved_by=auth.uid(),resolved_at=statement_timestamp() where id=d.id;
  else
    if p_replacement_outcome_code is null or not exists(select 1 from market.instruments i join market.outcomes o on o.instrument_id=i.id where i.canonical_event_id=d.event_id and o.code=upper(p_replacement_outcome_code)) then raise exception 'Valid replacement outcome required when upholding dispute' using errcode='22023'; end if;
    update oracle.resolutions set outcome_code=upper(p_replacement_outcome_code),consensus_evidence=consensus_evidence||jsonb_build_object('dispute_override',jsonb_build_object('dispute_id',d.public_id,'reviewer',auth.uid(),'reason',p_decision_reason)),created_at=statement_timestamp() where id=r.id and status='PROVISIONAL';
    update oracle.disputes set status='UPHELD',decision_reason=p_decision_reason,resolved_by=auth.uid(),resolved_at=statement_timestamp() where id=d.id;
  end if;
  if not exists(select 1 from oracle.disputes x where x.event_id=d.event_id and x.id<>d.id and x.status in ('OPEN','UNDER_REVIEW','ESCALATED')) then update market.canonical_events set status='PROVISIONALLY_RESOLVED',updated_at=statement_timestamp() where id=d.event_id; end if;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,after_state) values(auth.uid(),'USER','ORACLE_DISPUTE_DECISION','ORACLE_DISPUTE',d.public_id::text,p_decision_reason,jsonb_build_object('decision',decision,'replacement_outcome_code',p_replacement_outcome_code));
  return true;
end;
$$;
