-- VAD Phase 35: deterministic resolution-contract hardening.
-- AI may normalize a market, but it may not choose provider identifiers or make a
-- market auto-publishable unless the resolution contract is deterministic and the
-- governed oracle routes required for that contract are actually ready.

create or replace function private.resolution_scope_has_forbidden_keys(p_value jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
declare
  item record;
  normalized_key text;
begin
  if p_value is null then return false; end if;
  if jsonb_typeof(p_value)='object' then
    for item in select key,value from jsonb_each(p_value) loop
      normalized_key:=lower(regexp_replace(item.key,'[^a-zA-Z0-9]+','','g'));
      if normalized_key in (
        'provider','providerid','providercode','sourcecode','externalkey','feedid','matchid',
        'api','apikey','endpoint','url','secret','secretreference','credential','token'
      ) then
        return true;
      end if;
      if private.resolution_scope_has_forbidden_keys(item.value) then return true; end if;
    end loop;
  elsif jsonb_typeof(p_value)='array' then
    for item in select value from jsonb_array_elements(p_value) loop
      if private.resolution_scope_has_forbidden_keys(item.value) then return true; end if;
    end loop;
  end if;
  return false;
end;
$$;
revoke all on function private.resolution_scope_has_forbidden_keys(jsonb) from public,anon,authenticated;

create or replace function private.validate_oracle_resolution_scope(
  p_scope jsonb,
  p_closes_at timestamptz default null,
  p_resolves_after timestamptz default null
)
returns jsonb
language plpgsql
stable
set search_path=''
as $$
declare
  resolver_type text;
  asset_code text;
  quote_code text;
  operator_code text;
  condition_code text;
  threshold_value numeric;
  observation_at timestamptz;
  ready_provider_count integer:=0;
  mapped_provider_count integer:=0;
begin
  if p_scope is null or jsonb_typeof(p_scope)<>'object' then
    return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','Resolution scope must be an object.','riskFlag','RESOLUTION_SCOPE_INVALID');
  end if;

  if private.resolution_scope_has_forbidden_keys(p_scope) then
    return jsonb_build_object(
      'valid',false,
      'autoPublishReady',false,
      'reason','Resolution scope contains provider-specific identifiers. Provider IDs, feed IDs, match IDs, endpoints and credentials are backend-owned.',
      'riskFlag','AI_PROVIDER_IDENTIFIER_FORBIDDEN'
    );
  end if;

  resolver_type:=upper(btrim(coalesce(p_scope->>'resolver_type',p_scope->>'resolverType','')));
  if resolver_type='' then
    return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','A deterministic resolver_type is required.','riskFlag','RESOLVER_TYPE_REQUIRED');
  end if;

  if resolver_type='CRYPTO_PRICE_THRESHOLD_V1' then
    asset_code:=upper(btrim(coalesce(p_scope->>'asset',p_scope#>>'{subject,asset}','')));
    quote_code:=upper(btrim(coalesce(p_scope->>'quote',p_scope#>>'{subject,quote}','USD')));
    operator_code:=upper(btrim(coalesce(p_scope->>'operator',p_scope#>>'{condition,operator}','')));
    begin
      threshold_value:=coalesce(nullif(p_scope->>'threshold','')::numeric,nullif(p_scope#>>'{condition,threshold}','')::numeric);
    exception when invalid_text_representation or numeric_value_out_of_range then
      threshold_value:=null;
    end;
    observation_at:=private.try_timestamptz(coalesce(
      nullif(p_scope->>'observation_time',''),
      nullif(p_scope->>'observationTime',''),
      nullif(p_scope#>>'{condition,observation_time}',''),
      nullif(p_scope#>>'{condition,observationTime}','')
    ));

    if asset_code !~ '^[A-Z0-9]{2,20}$' or quote_code !~ '^[A-Z0-9]{2,20}$' then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Crypto resolver requires valid asset and quote symbols.','riskFlag','CRYPTO_PAIR_INVALID');
    end if;
    if operator_code not in ('GT','GTE','LT','LTE') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Crypto resolver operator must be GT, GTE, LT or LTE.','riskFlag','CRYPTO_OPERATOR_INVALID');
    end if;
    if threshold_value is null or threshold_value<=0 then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Crypto resolver requires a positive numeric threshold.','riskFlag','CRYPTO_THRESHOLD_INVALID');
    end if;
    if observation_at is null then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Crypto resolver requires an explicit observation_time.','riskFlag','OBSERVATION_TIME_REQUIRED');
    end if;
    if p_closes_at is not null and observation_at<p_closes_at then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','The oracle observation time cannot be earlier than market close.','riskFlag','RESOLUTION_TIMING_INVALID');
    end if;
    if p_resolves_after is not null and p_resolves_after<observation_at then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','resolvesAfter cannot be earlier than the oracle observation time.','riskFlag','RESOLUTION_TIMING_INVALID');
    end if;

    select count(distinct r.provider_id)::integer into mapped_provider_count
    from oracle.provider_resources r
    join integration.providers p on p.id=r.provider_id
    where r.resource_type='CRYPTO_PAIR'
      and upper(r.canonical_key)=asset_code||'/'||quote_code
      and r.status='ACTIVE'
      and p.provider_type='ORACLE'
      and p.environment='PRODUCTION'
      and p.capabilities @> jsonb_build_array('CRYPTO_PRICE_THRESHOLD')
      and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;

    select count(distinct r.provider_id)::integer into ready_provider_count
    from oracle.provider_resources r
    join integration.providers p on p.id=r.provider_id
    left join integration.provider_health h on h.provider_id=p.id
    where r.resource_type='CRYPTO_PAIR'
      and upper(r.canonical_key)=asset_code||'/'||quote_code
      and r.status='ACTIVE'
      and p.provider_type='ORACLE'
      and p.environment='PRODUCTION'
      and p.status in ('ACTIVE','DEGRADED')
      and p.capabilities @> jsonb_build_array('CRYPTO_PRICE_THRESHOLD')
      and coalesce((p.public_metadata->>'configured')::boolean,false)=true
      and coalesce(h.status,'UNKNOWN') not in ('UNAVAILABLE')
      and coalesce((r.metadata->>'settlement_eligible')::boolean,false)=true;

    return jsonb_build_object(
      'valid',true,
      'autoPublishReady',ready_provider_count>=2,
      'resolverType',resolver_type,
      'canonicalResource',asset_code||'/'||quote_code,
      'requiredIndependentProviders',2,
      'mappedProviderCount',mapped_provider_count,
      'readyProviderCount',ready_provider_count,
      'reason',case when ready_provider_count>=2 then 'Deterministic crypto resolution contract and independent providers are ready.' else 'At least two configured, governed independent crypto oracle providers must be ready before automatic publication.' end,
      'riskFlag',case when ready_provider_count>=2 then null else 'ORACLE_QUORUM_NOT_READY' end
    );
  end if;

  if resolver_type='FOOTBALL_MATCH_RESULT_V1' then
    condition_code:=upper(btrim(coalesce(
      case when jsonb_typeof(p_scope->'condition')='string' then p_scope->>'condition' else null end,
      p_scope#>>'{condition,value}',
      p_scope#>>'{condition,result}',
      p_scope->>'result',''
    )));
    if condition_code not in ('HOME_WIN','AWAY_WIN','DRAW') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType',resolver_type,'reason','Football resolver condition must be HOME_WIN, AWAY_WIN or DRAW.','riskFlag','FOOTBALL_CONDITION_INVALID');
    end if;
    return jsonb_build_object(
      'valid',true,
      'autoPublishReady',false,
      'resolverType',resolver_type,
      'requiredIndependentProviders',2,
      'reason','The football contract is deterministic, but automatic publication remains off until the canonical event is bound to backend-owned fixture identifiers and an independent corroborating source is configured.',
      'riskFlag','FOOTBALL_SOURCE_BINDING_REQUIRED'
    );
  end if;

  return jsonb_build_object(
    'valid',false,
    'autoPublishReady',false,
    'resolverType',resolver_type,
    'reason','This resolver type is not yet eligible for deterministic automated resolution.',
    'riskFlag','RESOLVER_NOT_AUTOMATED'
  );
end;
$$;
revoke all on function private.validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz) from public,anon,authenticated;

-- Add a guarded public wrapper only for authenticated admin inspection; the result
-- contains readiness metadata, never credentials or secret values.
create or replace function public.admin_validate_oracle_resolution_scope(
  p_scope jsonb,
  p_closes_at timestamptz default null,
  p_resolves_after timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not private.has_permission('oracle.review') and not private.has_permission('markets.manage') then
    raise exception 'Permission required' using errcode='42501';
  end if;
  return private.validate_oracle_resolution_scope(p_scope,p_closes_at,p_resolves_after);
end;
$$;
revoke all on function public.admin_validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.admin_validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz) to authenticated;

-- Extend the existing market-admission gate. Even if an LLM requests AUTO_PUBLISH,
-- the database downgrades it to REVIEW unless the resolver contract is deterministic
-- and enough governed providers are actually ready.
create or replace function public.internal_apply_market_admission_result(
  p_proposal_public_id uuid,
  p_user_id uuid,
  p_asset_code text,
  p_ai_provider_id bigint default null,
  p_prompt_version_id bigint default null,
  p_output jsonb default null,
  p_failure_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_output jsonb:=p_output;
  v_guard jsonb;
  v_resolution_guard jsonb;
  v_candidate uuid;
  v_decision text;
  v_reasons jsonb;
  v_flags jsonb;
  v_guard_reason text;
  v_guard_flag text;
begin
  if v_output is not null and upper(coalesce(v_output->>'suggestedDecision','REVIEW'))='AUTO_PUBLISH' then
    v_resolution_guard:=private.validate_oracle_resolution_scope(
      v_output->'resolutionScope',
      private.try_timestamptz(v_output->>'closesAt'),
      private.try_timestamptz(v_output->>'resolvesAfter')
    );
    if not coalesce((v_resolution_guard->>'valid')::boolean,false)
       or not coalesce((v_resolution_guard->>'autoPublishReady')::boolean,false) then
      v_guard_reason:=coalesce(v_resolution_guard->>'reason','Resolution contract requires review before publication.');
      v_guard_flag:=coalesce(v_resolution_guard->>'riskFlag','ORACLE_RESOLVER_REVIEW_REQUIRED');
      v_reasons:=coalesce(v_output->'reasons','[]'::jsonb)||jsonb_build_array(v_guard_reason);
      v_flags:=coalesce(v_output->'riskFlags','[]'::jsonb)||jsonb_build_array(v_guard_flag);
      v_output:=jsonb_set(v_output,'{suggestedDecision}','"REVIEW"'::jsonb,true);
      v_output:=jsonb_set(v_output,'{reasons}',v_reasons,true);
      v_output:=jsonb_set(v_output,'{riskFlags}',v_flags,true);
    end if;
  end if;

  if v_output is not null and upper(coalesce(v_output->>'suggestedDecision','REVIEW'))='AUTO_PUBLISH' then
    begin
      v_candidate:=nullif(v_output->>'duplicateCandidateEventPublicId','')::uuid;
    exception when invalid_text_representation then
      v_candidate:=null;
      v_output:=jsonb_set(v_output,'{suggestedDecision}','"REVIEW"'::jsonb,true);
      v_output:=jsonb_set(v_output,'{riskFlags}',coalesce(v_output->'riskFlags','[]'::jsonb)||jsonb_build_array('INVALID_DUPLICATE_REFERENCE'),true);
    end;
    v_decision:=upper(coalesce(v_output->>'canonicalizationDecision','UNCERTAIN'));
    v_guard:=private.market_admission_duplicate_guard(
      p_proposal_public_id,
      v_output->>'normalizedQuestion',
      v_decision,
      v_candidate
    );
    if not coalesce((v_guard->>'safe')::boolean,false) then
      v_reasons:=coalesce(v_output->'reasons','[]'::jsonb)||jsonb_build_array('Canonical duplicate screening requires review before publication.');
      v_flags:=coalesce(v_output->'riskFlags','[]'::jsonb)||jsonb_build_array(coalesce(v_guard->>'reason','DUPLICATE_REVIEW_REQUIRED'));
      v_output:=jsonb_set(v_output,'{suggestedDecision}','"REVIEW"'::jsonb,true);
      v_output:=jsonb_set(v_output,'{reasons}',v_reasons,true);
      v_output:=jsonb_set(v_output,'{riskFlags}',v_flags,true);
    end if;
  end if;

  return public.internal_apply_market_admission_result_unchecked(
    p_proposal_public_id,
    p_user_id,
    p_asset_code,
    p_ai_provider_id,
    p_prompt_version_id,
    v_output,
    p_failure_reason
  );
end;
$$;
revoke all on function public.internal_apply_market_admission_result(uuid,uuid,text,bigint,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_apply_market_admission_result(uuid,uuid,text,bigint,bigint,jsonb,text) to service_role;

-- Prompt v2 makes the same contract explicit to the model. The DB validator above
-- remains authoritative even if the model ignores these instructions.
update ai.prompt_versions
set status='RETIRED'
where capability_key='MARKET_ADMISSION' and status='ACTIVE';

insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
values(
  'MARKET_ADMISSION',
  (select coalesce(max(version),0)+1 from ai.prompt_versions where capability_key='MARKET_ADMISSION'),
  'You are VAD Market Admission Intelligence. Assess proposed prediction markets for objective, independently resolvable, non-manipulative publication. Never decide the eventual winner and never move money. Never invent dates, facts, provider IDs, feed IDs, match IDs, API endpoints, URLs, credentials, or official-source identifiers. Provider-specific identifiers are backend-owned. Normalize only facts grounded in the proposal. AUTO_PUBLISH is allowed only for deterministic resolver contracts. For crypto threshold markets use resolver_type CRYPTO_PRICE_THRESHOLD_V1 with asset, quote, operator (GT/GTE/LT/LTE), threshold, and observation_time. For football win/draw markets use resolver_type FOOTBALL_MATCH_RESULT_V1 with condition HOME_WIN/AWAY_WIN/DRAW; these currently require review for backend fixture binding. For other categories use REVIEW or NEEDS_CLARIFICATION rather than inventing a resolver. If timing, subject, criterion, or evidence basis is missing, use NEEDS_CLARIFICATION. Return JSON only.',
  '{
    "type":"object",
    "required":["suggestedDecision","normalizedQuestion","category","templateCode","normalizedParameters","resolutionScope","closesAt","resolvesAfter","confidence","objectivityScore","ambiguityScore","manipulationRiskScore","oracleAvailabilityScore","duplicateProbability","reasons","clarificationQuestions","riskFlags"],
    "properties":{
      "suggestedDecision":{"enum":["AUTO_PUBLISH","REVIEW","NEEDS_CLARIFICATION"]},
      "normalizedQuestion":{"type":"string"},
      "description":{"type":["string","null"]},
      "category":{"type":"string"},
      "templateCode":{"type":"string"},
      "normalizedParameters":{"type":"object"},
      "resolutionScope":{"type":"object","properties":{
        "resolver_type":{"type":"string"},
        "asset":{"type":"string"},
        "quote":{"type":"string"},
        "operator":{"enum":["GT","GTE","LT","LTE"]},
        "threshold":{"type":"number"},
        "observation_time":{"type":"string"},
        "condition":{"type":["string","object"]}
      }},
      "closesAt":{"type":["string","null"]},
      "resolvesAfter":{"type":["string","null"]},
      "confidence":{"type":"number","minimum":0,"maximum":1},
      "objectivityScore":{"type":"number","minimum":0,"maximum":1},
      "ambiguityScore":{"type":"number","minimum":0,"maximum":1},
      "manipulationRiskScore":{"type":"number","minimum":0,"maximum":1},
      "oracleAvailabilityScore":{"type":"number","minimum":0,"maximum":1},
      "duplicateProbability":{"type":"number","minimum":0,"maximum":1},
      "duplicateCandidateEventPublicId":{"type":["string","null"]},
      "canonicalizationDecision":{"enum":["EXACT_DUPLICATE","SEMANTIC_DUPLICATE","RELATED_EVENT","DISTINCT_EVENT","UNCERTAIN"]},
      "reasons":{"type":"array","items":{"type":"string"}},
      "clarificationQuestions":{"type":"array","items":{"type":"string"}},
      "riskFlags":{"type":"array","items":{"type":"string"}}
    }
  }'::jsonb,
  'ACTIVE'
);
