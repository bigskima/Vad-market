alter table market.proposals add column if not exists admission_lane text;
alter table market.proposals add column if not exists admission_confidence numeric;
alter table market.proposals add column if not exists admission_run_public_id uuid references ai.runs(public_id) on delete set null;
alter table market.proposals add column if not exists admission_evaluated_at timestamptz;
alter table market.proposals add column if not exists published_instrument_public_id uuid references market.instruments(public_id) on delete set null;

alter table market.proposals drop constraint if exists proposals_admission_lane_check;
alter table market.proposals add constraint proposals_admission_lane_check check (admission_lane is null or admission_lane in ('AUTO_PUBLISHED','UNDER_REVIEW','NEEDS_CLARIFICATION','MERGED'));
alter table market.proposals drop constraint if exists proposals_admission_confidence_check;
alter table market.proposals add constraint proposals_admission_confidence_check check (admission_confidence is null or (admission_confidence>=0 and admission_confidence<=1));

create index if not exists proposals_admission_lane_created_idx on market.proposals(admission_lane,created_at desc);
create index if not exists proposals_admission_run_idx on market.proposals(admission_run_public_id) where admission_run_public_id is not null;
create index if not exists proposals_published_instrument_idx on market.proposals(published_instrument_public_id) where published_instrument_public_id is not null;

insert into ai.prompt_versions(capability_key,version,system_prompt,output_schema,status)
values(
  'MARKET_ADMISSION',
  1,
  'You are VAD Market Admission Intelligence. Assess a proposed prediction market for objective, independently resolvable, non-manipulative publication. Never decide the eventual market outcome. Never invent dates, facts, official sources or event details that the proposer did not provide or that cannot be inferred safely. Normalize only what is present. If the question lacks a precise event, measurable YES/NO criterion, explicit closing time/date, or credible resolution basis, choose NEEDS_CLARIFICATION. If there is material manipulation, duplicate, legal, factual, source, or interpretation risk, choose REVIEW. Choose AUTO_PUBLISH only for a clear objective binary question that can be resolved from credible independent evidence. Return JSON only and conform to the supplied schema.',
  '{"type":"object","required":["suggestedDecision","normalizedQuestion","category","templateCode","normalizedParameters","resolutionScope","closesAt","resolvesAfter","confidence","objectivityScore","ambiguityScore","manipulationRiskScore","oracleAvailabilityScore","duplicateProbability","reasons","clarificationQuestions","riskFlags"],"properties":{"suggestedDecision":{"enum":["AUTO_PUBLISH","REVIEW","NEEDS_CLARIFICATION"]},"normalizedQuestion":{"type":"string"},"description":{"type":["string","null"]},"category":{"type":"string"},"templateCode":{"type":"string"},"normalizedParameters":{"type":"object"},"resolutionScope":{"type":"object"},"closesAt":{"type":["string","null"]},"resolvesAfter":{"type":["string","null"]},"confidence":{"type":"number","minimum":0,"maximum":1},"objectivityScore":{"type":"number","minimum":0,"maximum":1},"ambiguityScore":{"type":"number","minimum":0,"maximum":1},"manipulationRiskScore":{"type":"number","minimum":0,"maximum":1},"oracleAvailabilityScore":{"type":"number","minimum":0,"maximum":1},"duplicateProbability":{"type":"number","minimum":0,"maximum":1},"duplicateCandidateEventPublicId":{"type":["string","null"]},"canonicalizationDecision":{"enum":["EXACT_DUPLICATE","SEMANTIC_DUPLICATE","RELATED_EVENT","DISTINCT_EVENT","UNCERTAIN"]},"reasons":{"type":"array","items":{"type":"string"}},"clarificationQuestions":{"type":"array","items":{"type":"string"}},"riskFlags":{"type":"array","items":{"type":"string"}}}}'::jsonb,
  'ACTIVE'
)
on conflict(capability_key,version) do update
set system_prompt=excluded.system_prompt,output_schema=excluded.output_schema,status='ACTIVE';

update ai.prompt_versions set status='RETIRED' where capability_key='MARKET_ADMISSION' and version<>1 and status='ACTIVE';

do $$
declare v_policy_id bigint; v_version_id bigint;
begin
  select id into v_policy_id from policy.policies where domain='MARKETS' and name='market_admission';
  if v_policy_id is null then
    insert into policy.policies(domain,name,description,status)
    values('MARKETS','market_admission','Server-authoritative admission thresholds, rate limits and fail-closed behavior for user-created markets.','ACTIVE')
    returning id into v_policy_id;
  end if;

  select id into v_version_id from policy.policy_versions where policy_id=v_policy_id and version=1;
  if v_version_id is null then
    insert into policy.policy_versions(policy_id,version,configuration,effective_at,reason,activation_mode)
    values(
      v_policy_id,
      1,
      '{"auto_publish_enabled":true,"minimum_question_characters":15,"maximum_question_characters":500,"max_pending_per_user":25,"max_submissions_per_hour":30,"minimum_ai_confidence":0.86,"minimum_objectivity_score":0.90,"maximum_ambiguity_score":0.15,"maximum_manipulation_risk_score":0.20,"minimum_oracle_availability_score":0.80,"maximum_duplicate_probability":0.25,"maximum_duplicate_candidates":20,"fallback_when_ai_unavailable":"UNDER_REVIEW","allowed_template_codes":["BINARY_EVENT"],"blocked_categories":[],"minimum_order_notional":100}'::jsonb,
      '-infinity'::timestamptz,
      'Initial fail-closed automated market admission policy',
      'LEGACY'
    ) returning id into v_version_id;
  end if;
  update policy.policies set status='ACTIVE',current_version_id=v_version_id,updated_at=statement_timestamp() where id=v_policy_id;
end $$;

create or replace function private.try_timestamptz(p_value text)
returns timestamptz
language plpgsql
stable
set search_path=''
as $$
begin
  if nullif(btrim(coalesce(p_value,'')),'') is null then return null; end if;
  return p_value::timestamptz;
exception when others then
  return null;
end; $$;

create or replace function public.submit_market_proposal(
  p_question text,
  p_context text default null,
  p_category text default null,
  p_confidence numeric default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  account public.user_accounts;
  proposal_id uuid;
  normalized jsonb;
  cfg jsonb;
  min_chars integer;
  max_chars integer;
  max_pending integer;
  max_hour integer;
begin
  account:=private.require_active_account();
  if not private.capability_enabled('submit_market_proposal',account.country_code) then raise exception 'Market proposals are not currently enabled' using errcode='P0001'; end if;
  cfg:=coalesce(private.active_policy_configuration('MARKETS','market_admission'),'{}'::jsonb);
  min_chars:=greatest(coalesce((cfg->>'minimum_question_characters')::integer,10),5);
  max_chars:=least(coalesce((cfg->>'maximum_question_characters')::integer,500),1000);
  max_pending:=greatest(coalesce((cfg->>'max_pending_per_user')::integer,25),1);
  max_hour:=greatest(coalesce((cfg->>'max_submissions_per_hour')::integer,30),1);

  if p_question is null or char_length(btrim(p_question))<min_chars or char_length(btrim(p_question))>max_chars then
    raise exception 'Question must be between % and % characters',min_chars,max_chars using errcode='22023';
  end if;
  if p_context is not null and char_length(p_context)>5000 then raise exception 'Context is too long' using errcode='22023'; end if;
  if p_confidence is not null and (p_confidence<0 or p_confidence>1) then raise exception 'Confidence must be between 0 and 1' using errcode='22023'; end if;

  if (select count(*) from market.proposals p where p.proposer_user_id=auth.uid() and p.status in ('SUBMITTED','PROCESSING','UNDER_REVIEW','NEEDS_CLARIFICATION')) >= max_pending then
    raise exception 'You already have too many proposals awaiting a decision' using errcode='P0001';
  end if;
  if (select count(*) from market.proposals p where p.proposer_user_id=auth.uid() and p.created_at>=statement_timestamp()-interval '1 hour') >= max_hour then
    raise exception 'Market proposal rate limit reached. Try again later.' using errcode='P0001';
  end if;

  normalized:=jsonb_strip_nulls(jsonb_build_object(
    'submitted_category',nullif(btrim(coalesce(p_category,'')),''),
    'proposer_confidence',p_confidence
  ));
  insert into market.proposals(proposer_user_id,raw_question,raw_context,normalized_payload,status)
  values(auth.uid(),btrim(p_question),nullif(btrim(coalesce(p_context,'')),''),normalized,'SUBMITTED')
  returning public_id into proposal_id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_PROPOSED','MARKET_PROPOSAL',proposal_id::text,jsonb_build_object('proposal_id',proposal_id,'proposer_user_id',auth.uid(),'admission_mode','AUTOMATED_FIRST'),'market-proposal:'||proposal_id::text);
  return proposal_id;
end; $$;

revoke all on function public.submit_market_proposal(text,text,text,numeric) from public,anon;
grant execute on function public.submit_market_proposal(text,text,text,numeric) to authenticated;

create or replace function public.internal_market_admission_context(
  p_proposal_public_id uuid,
  p_user_id uuid,
  p_asset_code text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_proposal market.proposals;
  v_account public.user_accounts;
  v_cfg jsonb;
  v_prompt record;
  v_template record;
  v_oracle_policy record;
  v_assets jsonb;
  v_selected_asset text;
  v_candidates jsonb;
  v_providers jsonb;
  v_max_candidates integer;
begin
  select * into v_proposal from market.proposals where public_id=p_proposal_public_id;
  if v_proposal.id is null or v_proposal.proposer_user_id<>p_user_id then raise exception 'Proposal not found' using errcode='P0002'; end if;
  select * into v_account from public.user_accounts where user_id=p_user_id and status='ACTIVE';
  if v_account.user_id is null then raise exception 'Active account required' using errcode='42501'; end if;

  v_cfg:=coalesce(private.active_policy_configuration('MARKETS','market_admission'),'{}'::jsonb);
  v_max_candidates:=greatest(1,least(coalesce((v_cfg->>'maximum_duplicate_candidates')::integer,20),50));

  select pv.id,pv.version,pv.system_prompt,pv.output_schema into v_prompt
  from ai.prompt_versions pv
  where pv.capability_key='MARKET_ADMISSION' and pv.status='ACTIVE'
  order by pv.version desc limit 1;

  select t.id,t.code,t.name,t.category,t.parameter_schema,t.resolution_schema into v_template
  from market.templates t
  where t.status='ACTIVE' and t.code=coalesce(nullif(v_cfg->'allowed_template_codes'->>0,''),'BINARY_EVENT')
  limit 1;

  select op.id,op.public_id,op.name,oc.code as capability_code,op.version into v_oracle_policy
  from oracle.policies op
  join oracle.capabilities oc on oc.id=op.capability_id
  where op.status='ACTIVE' and op.effective_at<=statement_timestamp() and oc.code='OBJECTIVE_EVENT_RESULT'
  order by op.version desc,op.id desc limit 1;

  select coalesce(jsonb_agg(a.code order by case when a.code='NGN' then 0 else 1 end,a.code),'[]'::jsonb) into v_assets
  from public.jurisdictions j
  join public.jurisdiction_assets ja on ja.jurisdiction_id=j.id and ja.status='ACTIVE'
  join public.assets a on a.id=ja.asset_id and a.status='ACTIVE'
  where j.country_code=v_account.country_code and j.status='ACTIVE';

  if nullif(upper(btrim(coalesce(p_asset_code,''))),'') is not null and v_assets ? upper(btrim(p_asset_code)) then
    v_selected_asset:=upper(btrim(p_asset_code));
  elsif jsonb_array_length(v_assets)=1 then
    v_selected_asset:=v_assets->>0;
  else
    v_selected_asset:=null;
  end if;

  select coalesce(jsonb_agg(x.payload order by x.rank desc,x.created_at desc),'[]'::jsonb) into v_candidates
  from (
    select jsonb_build_object('eventPublicId',ce.public_id,'title',ce.title,'category',ce.category,'closesAt',ce.closes_at,'status',ce.status) as payload,
      ts_rank_cd(to_tsvector('simple',coalesce(ce.title,'')||' '||coalesce(ce.description,'')),plainto_tsquery('simple',v_proposal.raw_question)) as rank,
      ce.created_at
    from market.canonical_events ce
    where ce.status not in ('CANCELLED','VOIDED')
      and to_tsvector('simple',coalesce(ce.title,'')||' '||coalesce(ce.description,'')) @@ plainto_tsquery('simple',v_proposal.raw_question)
    order by rank desc,ce.created_at desc
    limit v_max_candidates
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'aiProviderId',ap.id,
    'providerCode',ip.code,
    'providerName',ip.name,
    'environment',ip.environment,
    'adapter',ip.public_metadata->>'ai_adapter',
    'endpoint',ip.public_metadata->>'endpoint',
    'apiVersion',ip.public_metadata->>'api_version',
    'modelCode',ap.model_code,
    'secretReference',ip.secret_reference,
    'priority',ap.priority
  ) order by ap.priority,ip.priority,ap.id),'[]'::jsonb) into v_providers
  from ai.providers ap
  join integration.providers ip on ip.id=ap.integration_provider_id
  where ap.status in ('ACTIVE','DEGRADED')
    and ip.status in ('ACTIVE','DEGRADED')
    and ip.provider_type='AI'
    and ap.capabilities @> '["MARKET_ADMISSION"]'::jsonb
    and coalesce(ip.public_metadata->>'ai_adapter','')<>''
    and coalesce(ip.public_metadata->>'endpoint','') like 'https://%';

  update market.proposals
  set status=case when status='SUBMITTED' then 'PROCESSING' else status end,
      normalized_payload=normalized_payload||jsonb_strip_nulls(jsonb_build_object('requested_asset_code',v_selected_asset)),
      updated_at=statement_timestamp()
  where id=v_proposal.id;

  return jsonb_build_object(
    'proposal',jsonb_build_object('publicId',v_proposal.public_id,'question',v_proposal.raw_question,'context',v_proposal.raw_context,'submittedCategory',v_proposal.normalized_payload->>'submitted_category'),
    'countryCode',v_account.country_code,
    'activeAssetCodes',v_assets,
    'selectedAssetCode',v_selected_asset,
    'assetSelectionRequired',v_selected_asset is null and jsonb_array_length(v_assets)>1,
    'policy',v_cfg,
    'prompt',case when v_prompt.id is null then null else jsonb_build_object('id',v_prompt.id,'version',v_prompt.version,'systemPrompt',v_prompt.system_prompt,'outputSchema',v_prompt.output_schema) end,
    'template',case when v_template.id is null then null else jsonb_build_object('code',v_template.code,'name',v_template.name,'category',v_template.category,'parameterSchema',v_template.parameter_schema,'resolutionSchema',v_template.resolution_schema) end,
    'oraclePolicy',case when v_oracle_policy.id is null then null else jsonb_build_object('publicId',v_oracle_policy.public_id,'name',v_oracle_policy.name,'capabilityCode',v_oracle_policy.capability_code,'version',v_oracle_policy.version) end,
    'duplicateCandidates',v_candidates,
    'providers',v_providers
  );
end; $$;

revoke all on function public.internal_market_admission_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.internal_market_admission_context(uuid,uuid,text) to service_role;

create or replace function public.internal_apply_market_admission_result(
  p_proposal_public_id uuid,
  p_user_id uuid,
  p_asset_code text,
  p_ai_provider_id bigint default null,
  p_prompt_version_id bigint default null,
  p_output jsonb default null,
  p_failure_reason text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  v_proposal market.proposals;
  v_account public.user_accounts;
  v_cfg jsonb;
  v_template market.templates;
  v_oracle_policy oracle.policies;
  v_asset public.assets;
  v_jurisdiction public.jurisdictions;
  v_run_public_id uuid;
  v_ai_lane text;
  v_lane text;
  v_reason text;
  v_question text;
  v_description text;
  v_category text;
  v_params jsonb;
  v_scope jsonb;
  v_closes_at timestamptz;
  v_resolves_after timestamptz;
  v_conf numeric;
  v_objectivity numeric;
  v_ambiguity numeric;
  v_manipulation numeric;
  v_oracle_availability numeric;
  v_duplicate numeric;
  v_min_conf numeric;
  v_min_obj numeric;
  v_max_amb numeric;
  v_max_manip numeric;
  v_min_oracle numeric;
  v_max_dup numeric;
  v_fingerprint text;
  v_existing_event market.canonical_events;
  v_event_id bigint;
  v_event_public_id uuid;
  v_instrument_id bigint;
  v_instrument_public_id uuid;
  v_required text;
  v_missing boolean:=false;
  v_blocked boolean:=false;
  v_min_order numeric;
begin
  select * into v_proposal from market.proposals where public_id=p_proposal_public_id for update;
  if v_proposal.id is null or v_proposal.proposer_user_id<>p_user_id then raise exception 'Proposal not found' using errcode='P0002'; end if;
  select * into v_account from public.user_accounts where user_id=p_user_id and status='ACTIVE';
  if v_account.user_id is null then raise exception 'Active account required' using errcode='42501'; end if;

  v_cfg:=coalesce(private.active_policy_configuration('MARKETS','market_admission'),'{}'::jsonb);
  v_min_conf:=coalesce((v_cfg->>'minimum_ai_confidence')::numeric,0.86);
  v_min_obj:=coalesce((v_cfg->>'minimum_objectivity_score')::numeric,0.90);
  v_max_amb:=coalesce((v_cfg->>'maximum_ambiguity_score')::numeric,0.15);
  v_max_manip:=coalesce((v_cfg->>'maximum_manipulation_risk_score')::numeric,0.20);
  v_min_oracle:=coalesce((v_cfg->>'minimum_oracle_availability_score')::numeric,0.80);
  v_max_dup:=coalesce((v_cfg->>'maximum_duplicate_probability')::numeric,0.25);
  v_min_order:=greatest(coalesce((v_cfg->>'minimum_order_notional')::numeric,100),0.00000001);

  insert into ai.runs(capability_key,provider_id,prompt_version_id,user_id,input_reference_type,input_reference_id,output_payload,validation_status,failure_reason,completed_at)
  values('MARKET_ADMISSION',p_ai_provider_id,p_prompt_version_id,p_user_id,'MARKET_PROPOSAL',p_proposal_public_id::text,p_output,
    case when p_output is null then 'FAILED' else 'VALID' end,
    nullif(btrim(coalesce(p_failure_reason,'')),''),statement_timestamp())
  returning public_id into v_run_public_id;

  if p_output is null then
    v_lane:='UNDER_REVIEW';
    v_reason:=coalesce(nullif(btrim(coalesce(p_failure_reason,'')),''),'AI intelligence unavailable; proposal routed to human review.');
    update market.proposals set status='UNDER_REVIEW',admission_lane=v_lane,admission_run_public_id=v_run_public_id,admission_evaluated_at=statement_timestamp(),decision_reason=v_reason,updated_at=statement_timestamp() where id=v_proposal.id;
    return jsonb_build_object('proposalId',v_proposal.public_id,'lane',v_lane,'status','UNDER_REVIEW','reason',v_reason,'runId',v_run_public_id,'published',false);
  end if;

  v_ai_lane:=upper(coalesce(p_output->>'suggestedDecision','REVIEW'));
  if v_ai_lane not in ('AUTO_PUBLISH','REVIEW','NEEDS_CLARIFICATION') then v_ai_lane:='REVIEW'; end if;
  v_question:=btrim(coalesce(p_output->>'normalizedQuestion',''));
  v_description:=nullif(btrim(coalesce(p_output->>'description',v_proposal.raw_context,'')),'');
  v_category:=upper(regexp_replace(coalesce(nullif(btrim(p_output->>'category'),''),nullif(btrim(v_proposal.normalized_payload->>'submitted_category'),''),'GENERAL'),'[^A-Za-z0-9]+','_','g'));
  if v_category !~ '^[A-Z][A-Z0-9_]*$' then v_category:='GENERAL'; end if;
  v_params:=case when jsonb_typeof(p_output->'normalizedParameters')='object' then p_output->'normalizedParameters' else '{}'::jsonb end;
  v_scope:=case when jsonb_typeof(p_output->'resolutionScope')='object' then p_output->'resolutionScope' else '{}'::jsonb end;
  v_closes_at:=private.try_timestamptz(p_output->>'closesAt');
  v_resolves_after:=private.try_timestamptz(p_output->>'resolvesAfter');
  v_conf:=case when jsonb_typeof(p_output->'confidence')='number' then (p_output->>'confidence')::numeric else null end;
  v_objectivity:=case when jsonb_typeof(p_output->'objectivityScore')='number' then (p_output->>'objectivityScore')::numeric else null end;
  v_ambiguity:=case when jsonb_typeof(p_output->'ambiguityScore')='number' then (p_output->>'ambiguityScore')::numeric else null end;
  v_manipulation:=case when jsonb_typeof(p_output->'manipulationRiskScore')='number' then (p_output->>'manipulationRiskScore')::numeric else null end;
  v_oracle_availability:=case when jsonb_typeof(p_output->'oracleAvailabilityScore')='number' then (p_output->>'oracleAvailabilityScore')::numeric else null end;
  v_duplicate:=case when jsonb_typeof(p_output->'duplicateProbability')='number' then (p_output->>'duplicateProbability')::numeric else null end;

  select * into v_template from market.templates where status='ACTIVE' and code=upper(coalesce(p_output->>'templateCode',''));
  select * into v_jurisdiction from public.jurisdictions where country_code=v_account.country_code and status='ACTIVE';
  if v_jurisdiction.id is not null then
    select a.* into v_asset from public.assets a join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.jurisdiction_id=v_jurisdiction.id
    where a.code=upper(coalesce(p_asset_code,'')) and a.status='ACTIVE' and ja.status='ACTIVE' limit 1;
  end if;
  select op.* into v_oracle_policy from oracle.policies op join oracle.capabilities oc on oc.id=op.capability_id
  where op.status='ACTIVE' and op.effective_at<=statement_timestamp() and oc.code='OBJECTIVE_EVENT_RESULT'
  order by op.version desc,op.id desc limit 1;

  if exists(select 1 from jsonb_array_elements_text(coalesce(v_cfg->'blocked_categories','[]'::jsonb)) c(value) where upper(c.value)=v_category) then v_blocked:=true; end if;
  if not exists(select 1 from jsonb_array_elements_text(coalesce(v_cfg->'allowed_template_codes','[]'::jsonb)) t(value) where upper(t.value)=v_template.code) then v_missing:=true; end if;
  if v_template.id is not null then
    for v_required in select jsonb_array_elements_text(coalesce(v_template.parameter_schema->'required','[]'::jsonb)) loop
      if not (v_params ? v_required) or nullif(btrim(coalesce(v_params->>v_required,'')),'') is null then v_missing:=true; end if;
    end loop;
  end if;

  if v_ai_lane='NEEDS_CLARIFICATION' or char_length(v_question)<5 or char_length(v_question)>280 or v_closes_at is null or v_resolves_after is null or v_closes_at<=statement_timestamp() or v_resolves_after<v_closes_at or v_template.id is null or v_asset.id is null or v_missing then
    v_lane:='NEEDS_CLARIFICATION';
    v_reason:=case
      when v_asset.id is null then 'Choose an active settlement asset for this market.'
      when v_closes_at is null or v_resolves_after is null then 'The market needs an explicit closing date and resolution timing.'
      when v_template.id is null or v_missing then 'The proposal is missing required canonical market structure.'
      else coalesce(p_output->'reasons'->>0,'The question needs clarification before it can become tradable.')
    end;
  elsif v_ai_lane<>'AUTO_PUBLISH' or not coalesce((v_cfg->>'auto_publish_enabled')::boolean,false) or v_blocked or v_oracle_policy.id is null or v_conf is null or v_objectivity is null or v_ambiguity is null or v_manipulation is null or v_oracle_availability is null or v_duplicate is null or v_conf<v_min_conf or v_objectivity<v_min_obj or v_ambiguity>v_max_amb or v_manipulation>v_max_manip or v_oracle_availability<v_min_oracle or v_duplicate>v_max_dup then
    v_lane:='UNDER_REVIEW';
    v_reason:=case
      when v_oracle_policy.id is null then 'No active objective-event oracle policy is available for automatic publication.'
      when v_blocked then 'This category requires human review under the active admission policy.'
      when v_duplicate is not null and v_duplicate>v_max_dup then 'Possible duplicate market requires canonical review.'
      when v_manipulation is not null and v_manipulation>v_max_manip then 'Manipulation risk requires human review.'
      else coalesce(p_output->'reasons'->>0,'Automated admission confidence was not high enough; queued for human review.')
    end;
  else
    v_lane:='AUTO_PUBLISHED';
    v_reason:='Passed deterministic validation and active AI admission thresholds.';
  end if;

  update market.proposals set
    normalized_payload=normalized_payload||jsonb_build_object('ai_admission',p_output,'requested_asset_code',upper(coalesce(p_asset_code,''))),
    objectivity_score=v_objectivity,
    oracle_availability_score=v_oracle_availability,
    ambiguity_score=v_ambiguity,
    manipulation_risk_score=v_manipulation,
    duplicate_probability=v_duplicate,
    admission_confidence=v_conf,
    admission_run_public_id=v_run_public_id,
    admission_evaluated_at=statement_timestamp(),
    admission_lane=v_lane,
    decision_reason=v_reason,
    status=case v_lane when 'NEEDS_CLARIFICATION' then 'NEEDS_CLARIFICATION' when 'UNDER_REVIEW' then 'UNDER_REVIEW' else status end,
    updated_at=statement_timestamp()
  where id=v_proposal.id;

  if v_lane<>'AUTO_PUBLISHED' then
    insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
    values(case when v_lane='NEEDS_CLARIFICATION' then 'MARKET_PROPOSAL_NEEDS_CLARIFICATION' else 'MARKET_PROPOSAL_REVIEW_REQUIRED' end,'MARKET_PROPOSAL',v_proposal.public_id::text,jsonb_build_object('proposal_id',v_proposal.public_id,'lane',v_lane,'reason',v_reason,'ai_run_id',v_run_public_id),'market-admission:'||v_proposal.public_id::text||':'||v_run_public_id::text)
    on conflict(idempotency_key) do nothing;
    return jsonb_build_object('proposalId',v_proposal.public_id,'lane',v_lane,'status',case when v_lane='NEEDS_CLARIFICATION' then 'NEEDS_CLARIFICATION' else 'UNDER_REVIEW' end,'reason',v_reason,'runId',v_run_public_id,'published',false,'clarificationQuestions',coalesce(p_output->'clarificationQuestions','[]'::jsonb),'riskFlags',coalesce(p_output->'riskFlags','[]'::jsonb));
  end if;

  if not private.service_available('market_publication',p_user_id) then
    v_lane:='UNDER_REVIEW'; v_reason:='Automatic publication is currently paused; proposal is preserved for review.';
    update market.proposals set status='UNDER_REVIEW',admission_lane=v_lane,decision_reason=v_reason,updated_at=statement_timestamp() where id=v_proposal.id;
    return jsonb_build_object('proposalId',v_proposal.public_id,'lane',v_lane,'status','UNDER_REVIEW','reason',v_reason,'runId',v_run_public_id,'published',false);
  end if;

  v_fingerprint:=command.compute_canonical_fingerprint(v_template.code,v_params,v_scope::text);
  select * into v_existing_event from market.canonical_events where canonical_fingerprint=v_fingerprint;
  if v_existing_event.id is not null then
    select i.id,i.public_id into v_instrument_id,v_instrument_public_id from market.instruments i where i.canonical_event_id=v_existing_event.id and i.asset_id=v_asset.id;
    update market.proposals set matched_canonical_event_id=v_existing_event.id,canonicalization_decision='EXACT_DUPLICATE',status='MERGED',admission_lane='MERGED',published_instrument_public_id=v_instrument_public_id,decision_reason='Merged into an existing canonical market.',updated_at=statement_timestamp() where id=v_proposal.id;
    return jsonb_build_object('proposalId',v_proposal.public_id,'lane','MERGED','status','MERGED','reason','Merged into an existing canonical market.','runId',v_run_public_id,'published',v_instrument_public_id is not null,'instrumentId',v_instrument_public_id,'eventId',v_existing_event.public_id);
  end if;

  insert into market.canonical_events(template_id,title,description,category,canonical_fingerprint,normalized_parameters,resolution_scope,opens_at,closes_at,resolves_after,status,originator_user_id)
  values(v_template.id,v_question,v_description,v_category,v_fingerprint,v_params,v_scope,statement_timestamp(),v_closes_at,v_resolves_after,'OPEN',p_user_id)
  returning id,public_id into v_event_id,v_event_public_id;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by) values(v_event_id,v_oracle_policy.id,null);
  insert into market.instruments(canonical_event_id,asset_id,market_type,liquidity_model,settlement_unit,pricing_precision,min_order_notional,status,opened_at,closed_at)
  values(v_event_id,v_asset.id,'BINARY','ORDER_BOOK',1,v_asset.pricing_precision,v_min_order,'OPEN',statement_timestamp(),v_closes_at)
  returning id,public_id into v_instrument_id,v_instrument_public_id;
  insert into market.outcomes(instrument_id,code,label,display_order) values(v_instrument_id,'YES','Yes',1),(v_instrument_id,'NO','No',2);
  perform command.refresh_market_catalog(v_instrument_id);

  update market.proposals set proposed_template_id=v_template.id,matched_canonical_event_id=v_event_id,canonicalization_decision='DISTINCT_EVENT',status='APPROVED',admission_lane='AUTO_PUBLISHED',published_instrument_public_id=v_instrument_public_id,decision_reason=v_reason,updated_at=statement_timestamp() where id=v_proposal.id;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_AUTO_PUBLISHED','MARKET_INSTRUMENT',v_instrument_public_id::text,jsonb_build_object('proposal_id',v_proposal.public_id,'event_id',v_event_public_id,'instrument_id',v_instrument_public_id,'asset_code',v_asset.code,'ai_run_id',v_run_public_id),'market-auto-published:'||v_proposal.public_id::text)
  on conflict(idempotency_key) do nothing;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(p_user_id,'SYSTEM','MARKET_AUTO_PUBLISHED','MARKET',v_instrument_public_id::text,v_reason,jsonb_build_object('proposal_id',v_proposal.public_id,'ai_run_id',v_run_public_id,'ai_provider_id',p_ai_provider_id,'prompt_version_id',p_prompt_version_id,'admission_confidence',v_conf,'asset_code',v_asset.code,'canonical_fingerprint',v_fingerprint));

  return jsonb_build_object('proposalId',v_proposal.public_id,'lane','AUTO_PUBLISHED','status','APPROVED','reason',v_reason,'runId',v_run_public_id,'published',true,'instrumentId',v_instrument_public_id,'eventId',v_event_public_id);
end; $$;

revoke all on function public.internal_apply_market_admission_result(uuid,uuid,text,bigint,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_apply_market_admission_result(uuid,uuid,text,bigint,bigint,jsonb,text) to service_role;

create or replace function public.admin_ai_provider_catalog()
returns table(
  ai_provider_id bigint,
  provider_code text,
  provider_name text,
  environment text,
  provider_status text,
  model_code text,
  model_status text,
  adapter text,
  endpoint text,
  secret_reference text,
  priority integer,
  capabilities jsonb,
  cost_policy jsonb
)
language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then raise exception 'Provider management permission required' using errcode='42501'; end if;
  return query
  select ap.id,ip.code,ip.name,ip.environment,ip.status,ap.model_code,ap.status,ip.public_metadata->>'ai_adapter',ip.public_metadata->>'endpoint',ip.secret_reference,ap.priority,ap.capabilities,ap.cost_policy
  from ai.providers ap join integration.providers ip on ip.id=ap.integration_provider_id
  where ip.provider_type='AI' order by ap.priority,ip.priority,ap.id;
end; $$;

revoke all on function public.admin_ai_provider_catalog() from public,anon;
grant execute on function public.admin_ai_provider_catalog() to authenticated;

create or replace function public.admin_upsert_ai_provider_model(
  p_provider_code text,
  p_provider_name text,
  p_environment text,
  p_adapter text,
  p_endpoint text,
  p_model_code text,
  p_secret_reference text,
  p_priority integer default 100,
  p_cost_policy jsonb default '{}'::jsonb,
  p_api_version text default null
) returns bigint
language plpgsql security definer set search_path=''
as $$
declare
  v_code text:=upper(btrim(coalesce(p_provider_code,'')));
  v_env text:=upper(btrim(coalesce(p_environment,'PRODUCTION')));
  v_adapter text:=upper(btrim(coalesce(p_adapter,'')));
  v_provider_id bigint;
  v_ai_id bigint;
  v_status text;
begin
  if auth.uid() is null or not private.has_permission('providers.manage') then raise exception 'Provider management permission required' using errcode='42501'; end if;
  if v_code !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'Invalid provider code' using errcode='22023'; end if;
  if v_env not in ('SANDBOX','PRODUCTION') then raise exception 'Invalid environment' using errcode='22023'; end if;
  if v_adapter not in ('OPENAI_COMPATIBLE','GEMINI_GENERATE_CONTENT','ANTHROPIC_MESSAGES','CLOUDFLARE_WORKERS_AI') then raise exception 'Unsupported AI protocol adapter' using errcode='22023'; end if;
  if coalesce(p_endpoint,'') !~ '^https://[^[:space:]]+$' then raise exception 'AI endpoint must be HTTPS' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_model_code,'')),'') is null then raise exception 'Model code is required' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_secret_reference,'')),'') is null then raise exception 'Secret reference is required' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_cost_policy,'{}'::jsonb))<>'object' then raise exception 'Cost policy must be an object' using errcode='22023'; end if;

  select status into v_status from integration.providers where code=v_code and environment=v_env;
  insert into integration.providers(code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
  values(v_code,btrim(p_provider_name),'AI',v_env,coalesce(v_status,'DISABLED'),greatest(coalesce(p_priority,100),0),'["MARKET_ADMISSION"]'::jsonb,jsonb_strip_nulls(jsonb_build_object('configured',true,'ai_adapter',v_adapter,'endpoint',btrim(p_endpoint),'api_version',nullif(btrim(coalesce(p_api_version,'')),''))),btrim(p_secret_reference))
  on conflict(code,environment) do update set
    name=excluded.name,provider_type='AI',priority=excluded.priority,capabilities=excluded.capabilities,
    public_metadata=integration.providers.public_metadata||excluded.public_metadata,
    secret_reference=excluded.secret_reference,updated_at=statement_timestamp()
  returning id into v_provider_id;

  insert into ai.providers(integration_provider_id,model_code,status,capabilities,priority,cost_policy)
  values(v_provider_id,btrim(p_model_code),'ACTIVE','["MARKET_ADMISSION"]'::jsonb,greatest(coalesce(p_priority,100),0),coalesce(p_cost_policy,'{}'::jsonb))
  on conflict(integration_provider_id,model_code) do update set status='ACTIVE',capabilities=excluded.capabilities,priority=excluded.priority,cost_policy=excluded.cost_policy,updated_at=statement_timestamp()
  returning id into v_ai_id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','AI_PROVIDER_MODEL_CONFIGURED','AI_PROVIDER',v_ai_id::text,'Configured provider-neutral AI model routing for market admission.',jsonb_build_object('provider_code',v_code,'environment',v_env,'adapter',v_adapter,'model_code',p_model_code,'priority',p_priority,'secret_reference',p_secret_reference));
  return v_ai_id;
end; $$;

revoke all on function public.admin_upsert_ai_provider_model(text,text,text,text,text,text,text,integer,jsonb,text) from public,anon;
grant execute on function public.admin_upsert_ai_provider_model(text,text,text,text,text,text,text,integer,jsonb,text) to authenticated;

drop function if exists public.my_market_proposals();
create function public.my_market_proposals()
returns table(
  public_id uuid,
  question text,
  context text,
  category text,
  status text,
  confidence numeric,
  admission_lane text,
  admission_confidence numeric,
  decision_reason text,
  published_instrument_public_id uuid,
  clarification_questions jsonb,
  risk_flags jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql security definer set search_path=''
as $$
  select p.public_id,p.raw_question,p.raw_context,p.normalized_payload->>'submitted_category',p.status,
    nullif(p.normalized_payload->>'proposer_confidence','')::numeric,p.admission_lane,p.admission_confidence,p.decision_reason,p.published_instrument_public_id,
    coalesce(p.normalized_payload->'ai_admission'->'clarificationQuestions','[]'::jsonb),
    coalesce(p.normalized_payload->'ai_admission'->'riskFlags','[]'::jsonb),p.created_at,p.updated_at
  from market.proposals p where p.proposer_user_id=auth.uid() order by p.created_at desc;
$$;
revoke all on function public.my_market_proposals() from public,anon;
grant execute on function public.my_market_proposals() to authenticated;