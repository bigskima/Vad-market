begin;

create or replace function public.admin_upsert_sports_competition(
  p_sport_code text,
  p_sport_name text,
  p_competition_code text,
  p_competition_name text,
  p_region text,
  p_aliases jsonb default '[]'::jsonb,
  p_result_mode text default 'VERIFIED',
  p_provider_code text default null,
  p_provider_competition_code text default null,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sport_code text:=upper(btrim(coalesce(p_sport_code,'')));
  v_sport_name text:=btrim(coalesce(p_sport_name,''));
  v_competition_code text:=upper(btrim(coalesce(p_competition_code,'')));
  v_competition_name text:=btrim(coalesce(p_competition_name,''));
  v_region text:=btrim(coalesce(p_region,''));
  v_result_mode text:=upper(btrim(coalesce(p_result_mode,'VERIFIED')));
  v_provider_code text:=upper(nullif(btrim(coalesce(p_provider_code,'')),''));
  v_provider_comp_code text:=upper(nullif(btrim(coalesce(p_provider_competition_code,'')),''));
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if v_sport_code !~ '^[A-Z][A-Z0-9_]{1,39}$'
     or v_competition_code !~ '^[A-Z][A-Z0-9_]{1,59}$' then
    raise exception 'Sport and competition codes must be uppercase letters, digits and underscores.' using errcode='22023';
  end if;
  if char_length(v_sport_name) not between 2 and 80
     or char_length(v_competition_name) not between 2 and 160 then
    raise exception 'Enter a valid sport name and competition name.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_aliases,'[]'::jsonb))<>'array' then
    raise exception 'Aliases must be a list of strings.' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_aliases,'[]'::jsonb)) x where jsonb_typeof(x)<>'string') then
    raise exception 'Each competition alias must be plain text.' using errcode='22023';
  end if;
  if v_result_mode not in ('AUTOMATIC','VERIFIED') then
    raise exception 'Choose Automatic or Verified result mode.' using errcode='22023';
  end if;
  if char_length(btrim(coalesce(p_reason,'')))<3 then
    raise exception 'Provide a reason for changing the sports catalog.' using errcode='22023';
  end if;

  if v_result_mode='AUTOMATIC' then
    if v_provider_code is null or v_provider_comp_code is null then
      raise exception 'Automatic results require an explicit provider and competition mapping.' using errcode='22023';
    end if;
    if not exists(
      select 1 from integration.providers p
      join oracle.provider_resources r on r.provider_id=p.id
      where p.code=v_provider_code and p.environment='PRODUCTION'
        and p.provider_type='ORACLE' and p.status in ('ACTIVE','DEGRADED')
        and r.resource_type='SPORTS_COMPETITION' and r.status='ACTIVE'
        and (r.canonical_key=v_sport_code||':'||v_provider_comp_code
          or r.external_key=v_provider_comp_code)
    ) then
      raise exception 'Automatic mode is allowed only for an active Oracle competition mapping.' using errcode='22023';
    end if;
  else
    v_provider_code:=null;
    v_provider_comp_code:=null;
  end if;

  insert into market.sports_competitions(
    sport_code,sport_name,competition_code,competition_name,region,result_mode,
    provider_code,provider_competition_code,aliases,status,metadata,updated_at
  ) values(
    v_sport_code,v_sport_name,v_competition_code,v_competition_name,v_region,
    v_result_mode,v_provider_code,v_provider_comp_code,coalesce(p_aliases,'[]'::jsonb),
    'ACTIVE',
    jsonb_build_object('managed_by','ADMIN','automatic_mapping_verified',v_result_mode='AUTOMATIC'),
    statement_timestamp()
  )
  on conflict(sport_code,competition_code) do update set
    sport_name=excluded.sport_name,
    competition_name=excluded.competition_name,
    region=excluded.region,
    result_mode=excluded.result_mode,
    provider_code=excluded.provider_code,
    provider_competition_code=excluded.provider_competition_code,
    aliases=excluded.aliases,
    status='ACTIVE',
    metadata=market.sports_competitions.metadata||excluded.metadata,
    updated_at=statement_timestamp();

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','SPORTS_COMPETITION_UPSERTED','SPORTS_COMPETITION',
    v_sport_code||':'||v_competition_code,btrim(p_reason),
    jsonb_build_object(
      'sport_name',v_sport_name,'competition_name',v_competition_name,
      'region',v_region,'result_mode',v_result_mode,
      'provider_code',v_provider_code,'provider_competition_code',v_provider_comp_code
    ));
  return true;
end;
$function$;
revoke all on function public.admin_upsert_sports_competition(text,text,text,text,text,jsonb,text,text,text,text) from public,anon;
grant execute on function public.admin_upsert_sports_competition(text,text,text,text,text,jsonb,text,text,text,text) to authenticated;


-- Keep the dedicated automatic-football picker synchronized with the database
-- sports catalogue and its admin enable/disable controls.
create or replace function public.admin_market_approval_options_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_tavily boolean;
  v_public boolean;
  v_football_competitions jsonb;
begin
  v:=public.admin_market_approval_options();
  select coalesce(jsonb_agg(s.competition_name order by s.display_order,s.competition_name),'[]'::jsonb)
  into v_football_competitions
  from market.sports_competitions s
  where s.sport_code='FOOTBALL'
    and s.status='ACTIVE'
    and s.result_mode='AUTOMATIC'
    and coalesce((s.metadata->>'free_tier')::boolean,false);
  v:=jsonb_set(v,'{guided,football,competitions}',coalesce(v_football_competitions,'[]'::jsonb),true);

  select exists(select 1 from integration.providers where code='TAVILY' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_tavily;
  select exists(select 1 from integration.providers where code='PUBLIC_RECORD' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_public;
  return jsonb_set(v,'{guided,evidence}',jsonb_build_object(
    'automaticAvailable',v_tavily or v_public,
    'broadSearchAvailable',v_tavily,
    'directPublicRecordAvailable',v_public,
    'automaticSourceName','VAD Evidence Gateway',
    'secretName','TAVILY_API_KEY'
  ),true);
end;
$function$;
revoke all on function public.admin_market_approval_options_v2() from public,anon;
grant execute on function public.admin_market_approval_options_v2() to authenticated;

commit;
