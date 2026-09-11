update ai.providers ap
set cost_policy = coalesce(ap.cost_policy,'{}'::jsonb) || jsonb_build_object(
      'billing_mode','FREE_ONLY',
      'paid_spend_limit',0,
      'revenue_gate_required',true,
      'updated_reason','VAD free-first launch policy'
    ),
    updated_at=statement_timestamp()
from integration.providers ip
where ip.id=ap.integration_provider_id
  and ip.code in ('CLOUDFLARE_WORKERS_AI','GEMINI');

update integration.providers
set status='DISABLED', updated_at=statement_timestamp()
where provider_type='AI'
  and code in ('OPENAI','ANTHROPIC');

update ai.providers ap
set status='DISABLED',
    cost_policy = coalesce(ap.cost_policy,'{}'::jsonb) || jsonb_build_object(
      'billing_mode','DISABLED_UNTIL_REVENUE',
      'paid_spend_limit',0,
      'revenue_gate_required',true
    ),
    updated_at=statement_timestamp()
from integration.providers ip
where ip.id=ap.integration_provider_id
  and ip.code in ('OPENAI','ANTHROPIC');

create or replace function public.internal_market_admission_context(
  p_proposal_public_id uuid,
  p_user_id uuid,
  p_asset_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
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
    and coalesce(ip.public_metadata->>'endpoint','') like 'https://%'
    and coalesce(ap.cost_policy->>'billing_mode','')='FREE_ONLY';

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
end;
$$;

revoke all on function public.internal_market_admission_context(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.internal_market_admission_context(uuid,uuid,text) to service_role;

insert into audit.records(actor_type, action, resource_type, resource_id, reason, metadata)
values('SYSTEM','AI_FREE_ONLY_ROUTING_GATE_ENABLED','AI_ROUTING','MARKET_ADMISSION','VAD pre-revenue AI routing accepts only models explicitly configured as FREE_ONLY.',jsonb_build_object('enabled_order',jsonb_build_array('CLOUDFLARE_WORKERS_AI','GEMINI'),'disabled',jsonb_build_array('OPENAI','ANTHROPIC'),'paid_spend_limit',0));
