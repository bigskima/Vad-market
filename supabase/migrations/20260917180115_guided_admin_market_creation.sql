-- Guided admin market creation keeps the existing custom creator intact while
-- adding domain-aware, user-friendly configuration for objective markets.

create or replace function public.admin_market_approval_options()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  result jsonb;
  football_sandbox boolean;
  football_production boolean;
begin
  if not private.has_permission('markets.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  select exists(
    select 1
    from oracle.policies p
    where p.status='ACTIVE'
      and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX'
      and exists(
        select 1
        from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA'
      )
  ) into football_sandbox;

  select exists(
    select 1
    from oracle.policies p
    where p.status='ACTIVE'
      and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX'
      and exists(
        select 1
        from jsonb_array_elements(p.source_hierarchy) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA'
      )
  ) into football_production;

  select jsonb_build_object(
    'templates',coalesce((
      select jsonb_agg(jsonb_build_object('code',t.code,'name',t.name) order by t.code)
      from market.templates t
      where t.status='ACTIVE'
    ),'[]'::jsonb),
    'oraclePolicies',coalesce((
      select jsonb_agg(jsonb_build_object('publicId',p.public_id,'name',p.name,'version',p.version) order by p.name,p.version desc)
      from oracle.policies p
      where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
    ),'[]'::jsonb),
    'jurisdictions',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'countryCode',j.country_code,
          'name',j.name,
          'assets',coalesce((
            select jsonb_agg(a.code order by a.code)
            from public.jurisdiction_assets ja
            join public.assets a on a.id=ja.asset_id
            where ja.jurisdiction_id=j.id and ja.status='ACTIVE' and a.status='ACTIVE'
          ),'[]'::jsonb)
        ) order by j.country_code
      )
      from public.jurisdictions j
      where j.status='ACTIVE'
    ),'[]'::jsonb),
    'guided',jsonb_build_object(
      'verifiedResultAvailable',true,
      'football',jsonb_build_object(
        'automaticSourceName','Football-Data.org',
        'automaticSandboxAvailable',football_sandbox,
        'automaticProductionAvailable',football_production
      )
    )
  ) into result;

  return result;
end;
$$;

create or replace function public.admin_create_custom_market(
  p_title text,
  p_description text,
  p_category text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_result jsonb;
  v_instrument_public_id uuid;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;

  if coalesce(p_publish_now,false) and p_opens_at>statement_timestamp() then
    raise exception 'Publish now is only available when the opening time has started. Choose Save as draft for a future opening time.' using errcode='22023';
  end if;

  v_result:=public.admin_create_market_draft(
    p_title,p_description,p_category,p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code
  );

  v_instrument_public_id:=nullif(v_result->>'instrument_id','')::uuid;
  if v_instrument_public_id is null then
    raise exception 'The market was created without a publishable market record' using errcode='P0001';
  end if;

  if coalesce(p_publish_now,false) then
    perform public.admin_publish_market(
      v_instrument_public_id,
      100,
      'Published during admin market creation'
    );
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;

  return v_result||jsonb_build_object('creation_style','CUSTOM');
end;
$$;

create or replace function public.admin_create_guided_market(
  p_title text,
  p_description text,
  p_category text,
  p_market_setup jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default false
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_setup jsonb:=coalesce(p_market_setup,'{}'::jsonb);
  v_kind text;
  v_checking text;
  v_title text:=btrim(coalesce(p_title,''));
  v_category text:=upper(btrim(coalesce(p_category,'')));
  v_source_name text:=btrim(coalesce(p_market_setup->>'source_name',''));
  v_source_url text:=btrim(coalesce(p_market_setup->>'source_url',''));
  v_scope jsonb;
  v_proposal_public_id uuid;
  v_result jsonb;
  v_asset public.assets;
  v_is_sandbox boolean:=false;
  v_template_code text;
  v_policy_public_id uuid;
  v_normalized jsonb;
  v_provider_id bigint;
  v_event_public_id uuid;
  v_instrument_public_id uuid;
  v_match_reference text;
  v_prediction text;
  v_prediction_label text;
  v_competition text;
  v_home_team text;
  v_away_team text;
  v_player text;
  v_destination_club text;
  v_country text;
  v_office text;
  v_candidate text;
  v_condition text;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if jsonb_typeof(v_setup)<>'object' then
    raise exception 'Market setup is invalid. Review the guided fields and try again.' using errcode='22023';
  end if;
  if v_title='' or v_category='' then
    raise exception 'Market question and category are required' using errcode='22023';
  end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null
     or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then
    raise exception 'Choose a valid opening, closing and result-checking time' using errcode='22023';
  end if;
  if coalesce(p_publish_now,false) and p_opens_at>statement_timestamp() then
    raise exception 'Publish now is only available when the opening time has started. Choose Save as draft for a future opening time.' using errcode='22023';
  end if;
  if v_source_url<>'' and v_source_url !~* '^https?://' then
    raise exception 'Source website must start with http:// or https://' using errcode='22023';
  end if;

  select * into v_asset
  from public.assets
  where code=upper(btrim(p_asset_code)) and status='ACTIVE';
  if v_asset.id is null then
    raise exception 'Selected market currency is unavailable' using errcode='P0002';
  end if;
  v_is_sandbox:=coalesce((v_asset.metadata->>'sandbox_only')::boolean,false);

  v_kind:=upper(btrim(coalesce(v_setup->>'kind','OBJECTIVE_EVENT')));
  v_checking:=upper(btrim(coalesce(v_setup->>'result_checking','VERIFIED')));
  if v_checking not in ('AUTOMATIC','VERIFIED') then
    raise exception 'Choose Automatic or Verified result checking' using errcode='22023';
  end if;

  if v_kind='FOOTBALL_MATCH' then
    v_competition:=btrim(coalesce(v_setup->>'competition',''));
    v_home_team:=btrim(coalesce(v_setup->>'home_team',''));
    v_away_team:=btrim(coalesce(v_setup->>'away_team',''));
    v_prediction:=upper(btrim(coalesce(v_setup->>'prediction','')));
    if v_competition='' or v_home_team='' or v_away_team='' then
      raise exception 'Competition, home team and away team are required' using errcode='22023';
    end if;
    if v_prediction not in ('HOME_WIN','DRAW','AWAY_WIN') then
      raise exception 'Choose whether the home team wins, the match is a draw, or the away team wins' using errcode='22023';
    end if;
    v_prediction_label:=case v_prediction
      when 'HOME_WIN' then v_home_team||' wins'
      when 'AWAY_WIN' then v_away_team||' wins'
      else 'the match ends in a draw'
    end;

    if v_checking='AUTOMATIC' then
      v_match_reference:=substring(btrim(coalesce(v_setup->>'match_reference','')) from '([0-9]+)[^0-9]*$');
      if v_match_reference is null or v_match_reference='' then
        raise exception 'Add the Football-Data match reference so VAD can check the final result automatically.' using errcode='22023';
      end if;

      select p.public_id into v_policy_public_id
      from oracle.policies p
      where p.status='ACTIVE'
        and p.effective_at<=statement_timestamp()
        and exists(
          select 1
          from jsonb_array_elements(p.source_hierarchy) h
          where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='FOOTBALL_DATA'
        )
        and (
          (v_is_sandbox and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX')
          or
          (not v_is_sandbox and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX')
        )
      order by p.effective_at desc,p.version desc
      limit 1;

      if v_policy_public_id is null then
        raise exception 'Automatic football results are not enabled for this market currency yet. Choose Verified result instead.' using errcode='P0001';
      end if;

      v_source_name:='Football-Data.org';
      v_scope:=jsonb_build_object(
        'resolver_type','FOOTBALL_MATCH_RESULT_V1',
        'condition',v_prediction,
        'event_type','FOOTBALL_MATCH',
        'subject',jsonb_build_object(
          'sport','FOOTBALL',
          'competition',v_competition,
          'home_team',v_home_team,
          'away_team',v_away_team
        ),
        'verification','Automatic final match result',
        'source_name',v_source_name,
        'market_question',v_title,
        'configured_by','ADMIN_GUIDED'
      );
    else
      if v_source_name='' then
        raise exception 'Add the official result source VAD should use to verify this match.' using errcode='22023';
      end if;
      v_scope:=jsonb_build_object(
        'resolver_type','VAD_REVIEW_V1',
        'event_type','FOOTBALL_MATCH',
        'condition',format('Resolve YES if %s; otherwise resolve NO.',v_prediction_label),
        'subject',jsonb_build_object(
          'sport','FOOTBALL',
          'competition',v_competition,
          'home_team',v_home_team,
          'away_team',v_away_team
        ),
        'verification','Verify the final result from the configured authoritative source.',
        'source_name',v_source_name,
        'source_url',nullif(v_source_url,''),
        'market_question',v_title,
        'configured_by','ADMIN_GUIDED'
      );
    end if;

  elsif v_kind='PLAYER_TRANSFER' then
    if v_checking='AUTOMATIC' then
      raise exception 'Player transfers currently use Verified result checking. Automatic checking is not enabled for this market type yet.' using errcode='22023';
    end if;
    v_player:=btrim(coalesce(v_setup->>'player',''));
    v_destination_club:=btrim(coalesce(v_setup->>'destination_club',''));
    if v_player='' or v_destination_club='' then
      raise exception 'Player and destination club are required' using errcode='22023';
    end if;
    if v_source_name='' then
      raise exception 'Add the official source VAD should use to verify the transfer.' using errcode='22023';
    end if;
    v_scope:=jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'event_type','PLAYER_TRANSFER',
      'condition',format('Resolve YES if %s officially becomes a player of %s by the result-checking deadline; otherwise resolve NO.',v_player,v_destination_club),
      'subject',jsonb_build_object('sport','FOOTBALL','player',v_player,'destination_club',v_destination_club),
      'verification','Verify the transfer from the configured authoritative source.',
      'source_name',v_source_name,
      'source_url',nullif(v_source_url,''),
      'market_question',v_title,
      'configured_by','ADMIN_GUIDED'
    );

  elsif v_kind='ELECTION_WINNER' then
    if v_checking='AUTOMATIC' then
      raise exception 'Election markets currently use Verified result checking. Automatic checking is not enabled for this market type yet.' using errcode='22023';
    end if;
    v_country:=btrim(coalesce(v_setup->>'country',''));
    v_office:=btrim(coalesce(v_setup->>'office',''));
    v_candidate:=btrim(coalesce(v_setup->>'candidate',''));
    if v_country='' or v_office='' or v_candidate='' then
      raise exception 'Country, office and candidate are required' using errcode='22023';
    end if;
    if v_source_name='' then
      raise exception 'Add the official election result source VAD should use.' using errcode='22023';
    end if;
    v_scope:=jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'event_type','ELECTION_WINNER',
      'condition',format('Resolve YES if %s is officially declared the winner of the %s in %s by the configured authoritative election source; otherwise resolve NO.',v_candidate,v_office,v_country),
      'subject',jsonb_build_object('country',v_country,'office',v_office,'candidate',v_candidate,'election_label',nullif(btrim(coalesce(v_setup->>'election_label','')),'')),
      'verification','Verify the final declared election result from the configured authoritative source.',
      'source_name',v_source_name,
      'source_url',nullif(v_source_url,''),
      'market_question',v_title,
      'configured_by','ADMIN_GUIDED'
    );

  elsif v_kind in ('SPORTS_EVENT','POLITICAL_EVENT','OBJECTIVE_EVENT') then
    if v_checking='AUTOMATIC' then
      raise exception 'This market type currently uses Verified result checking. Choose Verified result to continue.' using errcode='22023';
    end if;
    if v_source_name='' then
      raise exception 'Add the authoritative result source VAD should use.' using errcode='22023';
    end if;
    v_condition:=btrim(coalesce(v_setup->>'condition',''));
    if v_condition='' then
      v_condition:=format('Resolve YES when the configured authoritative source confirms the market proposition: %s',v_title);
    end if;
    v_scope:=jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'event_type',v_kind,
      'condition',v_condition,
      'verification','Verify the outcome from the configured authoritative source.',
      'source_name',v_source_name,
      'source_url',nullif(v_source_url,''),
      'market_question',v_title,
      'configured_by','ADMIN_GUIDED'
    );
  else
    raise exception 'Choose a supported guided market type or use Custom question.' using errcode='22023';
  end if;

  insert into market.proposals(
    proposer_user_id,
    raw_question,
    raw_context,
    normalized_payload,
    status,
    admission_lane,
    admission_confidence,
    decision_reason,
    admission_evaluated_at
  ) values(
    auth.uid(),
    v_title,
    nullif(btrim(coalesce(p_description,'')),''),
    jsonb_build_object(
      'submitted_category',v_category,
      'requested_asset_code',upper(btrim(p_asset_code)),
      'admin_created',true,
      'guided_creation',true,
      'guided_setup',v_setup,
      'ai_admission',jsonb_build_object('resolutionScope',v_scope)
    ),
    'UNDER_REVIEW',
    'UNDER_REVIEW',
    1,
    'Created from guided VAD admin market setup',
    statement_timestamp()
  ) returning public_id into v_proposal_public_id;

  if v_kind='FOOTBALL_MATCH' and v_checking='AUTOMATIC' then
    select t.code into v_template_code
    from market.templates t
    where t.status='ACTIVE' and t.code='BINARY_EVENT'
    limit 1;
    if v_template_code is null then
      select t.code into v_template_code
      from market.templates t
      where t.status='ACTIVE'
      order by t.id
      limit 1;
    end if;
    if v_template_code is null then
      raise exception 'No active market format is available' using errcode='P0001';
    end if;

    v_normalized:=jsonb_build_object(
      'subject',v_title,
      'time_scope',p_closes_at,
      'category',v_category,
      'configured_by','ADMIN_GUIDED',
      'guided_setup',v_setup
    );

    v_result:=public.admin_approve_market_proposal(
      v_proposal_public_id,
      v_template_code,
      v_title,
      coalesce(p_description,''),
      v_category,
      v_normalized,
      v_scope,
      p_opens_at,
      p_closes_at,
      p_resolves_after,
      v_policy_public_id,
      upper(btrim(p_country_code)),
      upper(btrim(p_asset_code)),
      100::numeric,
      4::smallint
    );
  else
    v_result:=public.admin_approve_market_proposal_auto(
      v_proposal_public_id,
      v_title,
      coalesce(p_description,''),
      v_category,
      p_opens_at,
      p_closes_at,
      p_resolves_after,
      upper(btrim(p_country_code)),
      upper(btrim(p_asset_code))
    );
  end if;

  v_event_public_id:=nullif(v_result->>'event_id','')::uuid;
  v_instrument_public_id:=nullif(v_result->>'instrument_id','')::uuid;

  if v_kind='FOOTBALL_MATCH' and v_checking='AUTOMATIC' then
    select ip.id into v_provider_id
    from integration.providers ip
    where ip.code='FOOTBALL_DATA'
      and ip.environment='PRODUCTION'
      and ip.provider_type='ORACLE'
      and ip.status in ('ACTIVE','DEGRADED')
    order by ip.priority,ip.id
    limit 1;

    if v_provider_id is null then
      raise exception 'Automatic football results are temporarily unavailable. Choose Verified result instead.' using errcode='P0001';
    end if;

    insert into oracle.provider_resources(
      provider_id,resource_type,canonical_key,external_key,status,metadata
    ) values(
      v_provider_id,
      'CANONICAL_EVENT',
      v_event_public_id::text,
      v_match_reference,
      'ACTIVE',
      jsonb_build_object(
        'configured_by','ADMIN_GUIDED',
        'competition',v_competition,
        'home_team',v_home_team,
        'away_team',v_away_team,
        'result_source','Football-Data.org',
        'updated_by',auth.uid()
      )
    )
    on conflict(provider_id,resource_type,canonical_key) do update set
      external_key=excluded.external_key,
      status='ACTIVE',
      metadata=excluded.metadata,
      updated_at=statement_timestamp();

    insert into audit.records(
      actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
    ) values(
      auth.uid(),'ADMIN','MARKET_RESULT_SOURCE_CONFIGURED','CANONICAL_EVENT',v_event_public_id::text,
      'Automatic football result checking configured from guided market creation',
      jsonb_build_object('source','Football-Data.org','match_reference',v_match_reference)
    );
  end if;

  if v_instrument_public_id is null then
    raise exception 'The market was created without a publishable market record' using errcode='P0001';
  end if;

  if coalesce(p_publish_now,false) then
    perform public.admin_publish_market(
      v_instrument_public_id,
      100,
      'Published during guided admin market creation'
    );
    v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED');
  else
    v_result:=v_result||jsonb_build_object('publication_status','DRAFT');
  end if;

  return v_result||jsonb_build_object(
    'proposal_id',v_proposal_public_id,
    'admin_created',true,
    'creation_style','GUIDED',
    'market_kind',v_kind,
    'result_checking',v_checking,
    'result_source',v_source_name
  );
end;
$$;

revoke all on function public.admin_create_custom_market(text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean) from public,anon;
grant execute on function public.admin_create_custom_market(text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean) to authenticated;

revoke all on function public.admin_create_guided_market(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean) from public,anon;
grant execute on function public.admin_create_guided_market(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean) to authenticated;
