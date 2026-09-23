create or replace function private.asset_available_in_country(
  p_country_code text,
  p_asset_id bigint
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.jurisdictions j
    join public.jurisdiction_assets ja
      on ja.jurisdiction_id=j.id
     and ja.asset_id=p_asset_id
     and ja.status='ACTIVE'
    join public.assets a
      on a.id=ja.asset_id
     and a.status='ACTIVE'
    where j.country_code=upper(btrim(coalesce(p_country_code,'')))
      and j.status='ACTIVE'
  );
$$;

revoke all on function private.asset_available_in_country(text,bigint)
  from public,anon,authenticated;

create or replace function private.asset_available_for_user(
  p_user_id uuid,
  p_asset_id bigint
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.user_accounts ua
    where ua.user_id=p_user_id
      and ua.status='ACTIVE'
      and private.asset_available_in_country(ua.country_code,p_asset_id)
  );
$$;

revoke all on function private.asset_available_for_user(uuid,bigint)
  from public,anon,authenticated;

create or replace function private.asset_code_available_for_user(
  p_user_id uuid,
  p_asset_code text
)
returns boolean
language sql
stable
security definer
set search_path=''
as $
  select exists(
    select 1
    from public.assets a
    where a.code=upper(btrim(coalesce(p_asset_code,'')))
      and private.asset_available_for_user(p_user_id,a.id)
  );
$;

revoke all on function private.asset_code_available_for_user(uuid,text)
  from public,anon,authenticated;

create or replace function private.text_mentions_ngn(p_text text)
returns boolean
language sql
immutable
security invoker
set search_path=''
as $
  select coalesce(p_text,'') ~* '(^|[^[:alnum:]_])(NGN|NAIRA)([^[:alnum:]_]|$)|₦';
$;

revoke all on function private.text_mentions_ngn(text)
  from public,anon,authenticated;

create or replace function private.trade_access_satisfies(
  p_user_id uuid,
  p_country_code text,
  p_asset_id bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_policy_enabled boolean:=false;
  v_sandbox_only boolean:=false;
begin
  if p_user_id is null or p_asset_id is null then return false; end if;
  if not private.service_available('trading',p_user_id) then return false; end if;
  if not private.asset_available_in_country(p_country_code,p_asset_id) then return false; end if;

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

  if coalesce(v_sandbox_only,false) then
    return private.tester_access_satisfies(p_user_id,'SANDBOX');
  end if;

  return private.tester_access_satisfies(p_user_id,'PRODUCTION');
end;
$$;

revoke all on function private.trade_access_satisfies(uuid,text,bigint)
  from public,anon,authenticated;

drop policy if exists market_catalog_public_read on public.market_catalog;
drop policy if exists market_catalog_anon_read on public.market_catalog;
drop policy if exists market_catalog_authenticated_jurisdiction_read on public.market_catalog;

create policy market_catalog_anon_read
on public.market_catalog
for select
to anon
using (
  status = any(array[
    'OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED','VOIDED'
  ]::text[])
);

create policy market_catalog_authenticated_jurisdiction_read
on public.market_catalog
for select
to authenticated
using (
  status = any(array[
    'OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED','VOIDED'
  ]::text[])
  and exists (
    select 1
    from public.user_accounts ua
    join public.jurisdictions j
      on j.country_code=ua.country_code
     and j.status='ACTIVE'
    join public.jurisdiction_assets ja
      on ja.jurisdiction_id=j.id
     and ja.status='ACTIVE'
    join public.assets a
      on a.id=ja.asset_id
     and a.status='ACTIVE'
    where ua.user_id=(select auth.uid())
      and ua.status='ACTIVE'
      and a.code=market_catalog.asset_code
  )
);

create or replace function public.home_market_rails()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  acct public.user_accounts;
  f public.featured_market_settings;
  t public.trending_market_settings;
  v jsonb;
  x jsonb;
  y jsonb;
begin
  acct:=private.require_active_account();

  select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  select * into t from public.trending_market_settings where settings_key='HOME_TRENDING';

  if f.last_refreshed_at is null
     or f.last_refreshed_at<statement_timestamp()-interval '2 minutes' then
    perform private.refresh_featured_market_rankings();
    select * into f from public.featured_market_settings where settings_key='HOME_AUTOMATIC';
  end if;

  if t.last_refreshed_at is null
     or t.last_refreshed_at<statement_timestamp()-interval '2 minutes' then
    perform private.refresh_trending_market_rankings();
    select * into t from public.trending_market_settings where settings_key='HOME_TRENDING';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'instrument_public_id',c.instrument_public_id,
    'priority',c.priority,
    'published_at',c.published_at
  ) order by c.priority,c.published_at desc),'[]'::jsonb)
  into v
  from public.vad_market_curations c
  join market.instruments i on i.public_id=c.instrument_public_id
  where c.active and i.status='OPEN'
    and private.asset_available_in_country(acct.country_code,i.asset_id);

  if coalesce(f.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'instrument_public_id',r.instrument_public_id,
      'rank',r.rank,
      'volume_ngn',r.window_volume_ngn,
      'trade_count',r.trade_count,
      'last_trade_at',r.last_trade_at,
      'calculated_at',r.calculated_at
    ) order by r.rank),'[]'::jsonb)
    into x
    from public.featured_market_rankings r
    join market.instruments i on i.public_id=r.instrument_public_id
    where i.status='OPEN'
      and private.asset_available_in_country(acct.country_code,i.asset_id)
      and r.window_volume_ngn>=f.minimum_volume_ngn
      and r.rank<=f.max_markets;
  else
    x:='[]'::jsonb;
  end if;

  if coalesce(t.enabled,true) then
    select coalesce(jsonb_agg(jsonb_build_object(
      'instrument_public_id',r.instrument_public_id,
      'rank',r.rank,
      'momentum_score',r.momentum_score,
      'volume_ngn',r.short_volume_ngn,
      'trade_count',r.short_trade_count,
      'unique_traders',r.short_unique_traders,
      'volume_acceleration',r.volume_acceleration,
      'trade_acceleration',r.trade_acceleration,
      'price_movement',r.price_movement,
      'last_trade_at',r.last_trade_at,
      'calculated_at',r.calculated_at
    ) order by r.rank),'[]'::jsonb)
    into y
    from public.trending_market_rankings r
    join market.instruments i on i.public_id=r.instrument_public_id
    where i.status='OPEN'
      and private.asset_available_in_country(acct.country_code,i.asset_id)
      and r.rank<=t.max_markets;
  else
    y:='[]'::jsonb;
  end if;

  return jsonb_build_object(
    'vadMarkets',coalesce(v,'[]'::jsonb),
    'featuredMarkets',coalesce(x,'[]'::jsonb),
    'trendingMarkets',coalesce(y,'[]'::jsonb),
    'featuredSettings',jsonb_build_object(
      'enabled',coalesce(f.enabled,true),
      'minimumVolumeNgn',coalesce(f.minimum_volume_ngn,1000000),
      'windowHours',coalesce(f.window_hours,24),
      'maxMarkets',coalesce(f.max_markets,20),
      'lastRefreshedAt',f.last_refreshed_at
    ),
    'trendingSettings',jsonb_build_object(
      'enabled',coalesce(t.enabled,true),
      'windowMinutes',coalesce(t.window_minutes,60),
      'baselineHours',coalesce(t.baseline_hours,6),
      'minimumVolumeNgn',coalesce(t.minimum_volume_ngn,100000),
      'minimumTrades',coalesce(t.minimum_trades,5),
      'minimumUniqueTraders',coalesce(t.minimum_unique_traders,3),
      'minimumAcceleration',coalesce(t.minimum_acceleration,1.5),
      'maxMarkets',coalesce(t.max_markets,12),
      'lastRefreshedAt',t.last_refreshed_at
    )
  );
end;
$$;

revoke all on function public.home_market_rails() from public,anon;
grant execute on function public.home_market_rails() to authenticated;

create or replace function public.create_conviction_post(
  p_body text,
  p_post_type text default 'ANALYSIS',
  p_instrument_public_id uuid default null,
  p_stance_outcome_code text default null,
  p_confidence numeric default null,
  p_media_path text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  acct public.user_accounts;
  instrument market.instruments;
  event_id bigint;
  outcome_code text;
  post_id uuid;
  kind text:=upper(trim(coalesce(p_post_type,'ANALYSIS')));
begin
  acct:=private.require_active_account();
  if not private.capability_enabled('create_post',acct.country_code) then
    raise exception 'Posting is not currently enabled' using errcode='P0001';
  end if;
  if kind not in ('ANALYSIS','PREDICTION','COMMENTARY','SHORT_VIDEO') then
    raise exception 'Invalid post type' using errcode='22023';
  end if;
  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>5000 then
    raise exception 'Post must be 1-5000 characters' using errcode='22023';
  end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then
    raise exception 'Confidence must be between 0 and 1' using errcode='22023';
  end if;

  if not private.asset_code_available_for_user(p_user_id := auth.uid(),p_asset_code := 'NGN')
     and private.text_mentions_ngn(p_body) then
    raise exception 'NGN content is not available for your account location' using errcode='P0001';
  end if;

  if p_instrument_public_id is not null then
    select * into instrument from market.instruments where public_id=p_instrument_public_id;
    if instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;
    if not private.asset_available_in_country(acct.country_code,instrument.asset_id) then
      raise exception 'This market is not available for your account location' using errcode='P0001';
    end if;
    event_id:=instrument.canonical_event_id;
    if p_stance_outcome_code is not null then
      outcome_code:=upper(trim(p_stance_outcome_code));
      if not exists(select 1 from market.outcomes where instrument_id=instrument.id and code=outcome_code) then
        raise exception 'Stance is not a market outcome' using errcode='22023';
      end if;
    end if;
  elsif p_stance_outcome_code is not null then
    raise exception 'A market is required for an outcome stance' using errcode='22023';
  end if;

  if kind='PREDICTION' and outcome_code is null then
    raise exception 'Prediction posts require a market outcome stance' using errcode='22023';
  end if;

  insert into social.posts(
    author_user_id,post_type,body,media_path,canonical_event_id,
    instrument_id,stance_outcome_code,confidence,status
  )
  values(
    auth.uid(),kind,trim(p_body),nullif(trim(coalesce(p_media_path,'')),''),
    event_id,instrument.id,outcome_code,p_confidence,'PUBLISHED'
  )
  returning public_id into post_id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values(
    'SOCIAL_POST_PUBLISHED','SOCIAL_POST',post_id::text,
    jsonb_build_object(
      'post_id',post_id,'author_user_id',auth.uid(),'post_type',kind,
      'instrument_public_id',p_instrument_public_id
    ),
    'social-post:'||post_id::text
  );

  return post_id;
end;
$$;

revoke all on function public.create_conviction_post(text,text,uuid,text,numeric,text) from public,anon;
grant execute on function public.create_conviction_post(text,text,uuid,text,numeric,text) to authenticated;

create or replace function public.social_feed(p_limit integer default 30,p_offset integer default 0)
returns table(
  post_public_id uuid,
  author_user_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_path text,
  post_type text,
  body text,
  media_path text,
  stance_outcome_code text,
  confidence numeric,
  instrument_public_id uuid,
  event_public_id uuid,
  market_title text,
  asset_code text,
  yes_price numeric,
  no_price numeric,
  reaction_count bigint,
  comment_count bigint,
  viewer_liked boolean,
  viewer_follows_author boolean,
  created_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select
    p.public_id,p.author_user_id,pr.handle,pr.display_name,pr.avatar_path,
    p.post_type,p.body,p.media_path,p.stance_outcome_code,p.confidence,
    i.public_id,e.public_id,e.title,a.code,mc.yes_price,mc.no_price,
    (select count(*) from social.reactions r where r.post_id=p.id and r.reaction_type='LIKE'),
    (select count(*) from social.comments c where c.post_id=p.id and c.status='PUBLISHED'),
    exists(select 1 from social.reactions vr where vr.post_id=p.id and vr.user_id=auth.uid() and vr.reaction_type='LIKE'),
    exists(select 1 from social.follows f where f.follower_user_id=auth.uid() and f.followed_user_id=p.author_user_id),
    p.created_at
  from social.posts p
  left join public.profiles pr on pr.user_id=p.author_user_id
  left join market.instruments i on i.id=p.instrument_id
  left join market.canonical_events e on e.id=p.canonical_event_id
  left join public.assets a on a.id=i.asset_id
  left join public.market_catalog mc on mc.instrument_public_id=i.public_id
  where p.status='PUBLISHED'
    and (i.id is null or private.asset_available_for_user(auth.uid(),i.asset_id))
    and (
      private.asset_code_available_for_user(auth.uid(),'NGN')
      or not private.text_mentions_ngn(p.body)
    )
  order by (
    case when exists(
      select 1 from social.follows f2
      where f2.follower_user_id=auth.uid() and f2.followed_user_id=p.author_user_id
    ) then 1 else 0 end
  ) desc,p.created_at desc
  limit least(greatest(coalesce(p_limit,30),1),100)
  offset greatest(coalesce(p_offset,0),0);
$$;

revoke all on function public.social_feed(integer,integer) from public,anon;
grant execute on function public.social_feed(integer,integer) to authenticated;

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

  select sp.id into v_post_id
  from social.posts sp
  left join market.instruments i on i.id=sp.instrument_id
  where sp.public_id=p_post_public_id
    and sp.status='PUBLISHED'
    and (i.id is null or private.asset_available_for_user(auth.uid(),i.asset_id));

  if v_post_id is null then raise exception 'Post not found' using errcode='P0002'; end if;

  delete from social.reactions
  where post_id=v_post_id and user_id=auth.uid() and reaction_type='LIKE';
  if found then return false; end if;

  insert into social.reactions(post_id,user_id,reaction_type)
  values(v_post_id,auth.uid(),'LIKE');
  return true;
end;
$$;

revoke all on function public.toggle_post_like(uuid) from public,anon;
grant execute on function public.toggle_post_like(uuid) to authenticated;

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

  if p_body is null or char_length(trim(p_body))<1 or char_length(p_body)>2000 then
    raise exception 'Comment must be 1-2000 characters' using errcode='22023';
  end if;

  if not private.asset_code_available_for_user(auth.uid(),'NGN')
     and private.text_mentions_ngn(p_body) then
    raise exception 'NGN content is not available for your account location' using errcode='P0001';
  end if;

  select sp.id into v_post_id
  from social.posts sp
  left join market.instruments i on i.id=sp.instrument_id
  where sp.public_id=p_post_public_id
    and sp.status='PUBLISHED'
    and (i.id is null or private.asset_available_for_user(auth.uid(),i.asset_id));

  if v_post_id is null then raise exception 'Post not found' using errcode='P0002'; end if;

  insert into social.comments(post_id,author_user_id,body)
  values(v_post_id,auth.uid(),trim(p_body))
  returning public_id into comment_id;
  return comment_id;
end;
$$;

revoke all on function public.add_post_comment(uuid,text) from public,anon;
grant execute on function public.add_post_comment(uuid,text) to authenticated;

create or replace function public.post_comments(p_post_public_id uuid,p_limit integer default 50)
returns table(
  comment_public_id uuid,
  author_user_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_path text,
  body text,
  created_at timestamptz,
  parent_comment_public_id uuid
)
language sql
security definer
set search_path=''
as $$
  select
    c.public_id,c.author_user_id,p.handle,p.display_name,p.avatar_path,
    c.body,c.created_at,parent.public_id
  from social.comments c
  join social.posts sp on sp.id=c.post_id
  left join market.instruments i on i.id=sp.instrument_id
  left join public.profiles p on p.user_id=c.author_user_id
  left join social.comments parent on parent.id=c.parent_comment_id
  where sp.public_id=p_post_public_id
    and sp.status='PUBLISHED'
    and c.status='PUBLISHED'
    and (i.id is null or private.asset_available_for_user(auth.uid(),i.asset_id))
    and (
      private.asset_code_available_for_user(auth.uid(),'NGN')
      or not private.text_mentions_ngn(c.body)
    )
  order by c.created_at asc
  limit least(greatest(coalesce(p_limit,50),1),200);
$$;

revoke all on function public.post_comments(uuid,integer) from public,anon;
grant execute on function public.post_comments(uuid,integer) to authenticated;


create or replace function public.internal_prepare_user_ai_assistant_v3(
  p_user_id uuid,
  p_thread_public_id uuid default null,
  p_market_public_id uuid default null,
  p_route text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_base jsonb;
  v_allowed_codes text[];
  v_filtered jsonb;
  v_market jsonb;
  v_has_ngn boolean:=false;
begin
  if p_user_id is null then
    raise exception 'Assistant account is required' using errcode='42501';
  end if;

  select coalesce(array_agg(a.code order by a.code),array[]::text[])
    into v_allowed_codes
  from public.user_accounts ua
  join public.jurisdictions j
    on j.country_code=ua.country_code
   and j.status='ACTIVE'
  join public.jurisdiction_assets ja
    on ja.jurisdiction_id=j.id
   and ja.status='ACTIVE'
  join public.assets a
    on a.id=ja.asset_id
   and a.status='ACTIVE'
  where ua.user_id=p_user_id
    and ua.status='ACTIVE';

  if coalesce(array_length(v_allowed_codes,1),0)=0 then
    raise exception 'No active assets are available for this account' using errcode='P0001';
  end if;

  v_has_ngn:='NGN'=any(v_allowed_codes);
  v_base:=public.internal_prepare_user_ai_assistant_v2(
    p_user_id,p_thread_public_id,p_market_public_id,p_route
  );

  select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_filtered
  from jsonb_array_elements(coalesce(v_base#>'{context,wallet}','[]'::jsonb)) item
  where upper(coalesce(item->>'assetCode',''))=any(v_allowed_codes);
  v_base:=jsonb_set(v_base,'{context,wallet}',v_filtered,true);

  select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_filtered
  from jsonb_array_elements(coalesce(v_base#>'{context,paymentActivity}','[]'::jsonb)) item
  where upper(coalesce(item->>'assetCode',''))=any(v_allowed_codes);
  v_base:=jsonb_set(v_base,'{context,paymentActivity}',v_filtered,true);

  select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_filtered
  from jsonb_array_elements(coalesce(v_base#>'{context,positions}','[]'::jsonb)) item
  where upper(coalesce(item->>'assetCode',''))=any(v_allowed_codes);
  v_base:=jsonb_set(v_base,'{context,positions}',v_filtered,true);

  select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_filtered
  from jsonb_array_elements(coalesce(v_base#>'{context,openOrders}','[]'::jsonb)) item
  where upper(coalesce(item->>'assetCode',''))=any(v_allowed_codes);
  v_base:=jsonb_set(v_base,'{context,openOrders}',v_filtered,true);

  select coalesce(jsonb_agg(item),'[]'::jsonb)
    into v_filtered
  from jsonb_array_elements(coalesce(v_base#>'{context,marketDirectory}','[]'::jsonb)) item
  where upper(coalesce(item->>'assetCode',''))=any(v_allowed_codes);
  v_base:=jsonb_set(v_base,'{context,marketDirectory}',v_filtered,true);

  v_market:=v_base#>'{context,market}';
  if v_market is not null
     and jsonb_typeof(v_market)='object'
     and not upper(coalesce(v_market->>'assetCode',''))=any(v_allowed_codes) then
    v_base:=jsonb_set(v_base,'{context,market}','null'::jsonb,true);
  end if;

  if not v_has_ngn then
    v_base:=jsonb_set(v_base,'{context,settlements}','[]'::jsonb,true);

    select coalesce(jsonb_agg(item),'[]'::jsonb)
      into v_filtered
    from jsonb_array_elements(coalesce(v_base->'history','[]'::jsonb)) item
    where not private.text_mentions_ngn(item->>'content');
    v_base:=jsonb_set(v_base,'{history}',v_filtered,true);
  end if;

  v_base:=jsonb_set(
    v_base,
    '{user,activeAssetCodes}',
    to_jsonb(v_allowed_codes),
    true
  );
  v_base:=jsonb_set(
    v_base,
    '{context,activeAssetCodes}',
    to_jsonb(v_allowed_codes),
    true
  );

  return v_base;
end;
$$;

revoke all on function public.internal_prepare_user_ai_assistant_v3(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_prepare_user_ai_assistant_v3(uuid,uuid,uuid,text)
  to service_role;
