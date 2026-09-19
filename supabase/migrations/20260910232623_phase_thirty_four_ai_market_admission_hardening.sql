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
  if auth.uid() is null or not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
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

create or replace function private.market_admission_duplicate_guard(
  p_proposal_public_id uuid,
  p_normalized_question text,
  p_canonicalization_decision text,
  p_duplicate_candidate_event_public_id uuid default null
) returns jsonb
language plpgsql stable security definer set search_path=''
as $$
declare
  v_proposal market.proposals;
  v_exact market.canonical_events;
  v_decision text:=upper(coalesce(p_canonicalization_decision,'UNCERTAIN'));
begin
  select * into v_proposal from market.proposals where public_id=p_proposal_public_id;
  if v_proposal.id is null then raise exception 'Proposal not found' using errcode='P0002'; end if;
  select * into v_exact from market.canonical_events ce
  where ce.status not in ('CANCELLED','VOIDED')
    and lower(regexp_replace(btrim(ce.title),'[^[:alnum:]]+','','g'))=lower(regexp_replace(btrim(coalesce(p_normalized_question,'')),'[^[:alnum:]]+','','g'))
  order by ce.created_at desc limit 1;
  if v_exact.id is not null then
    return jsonb_build_object('safe',false,'reason','EXACT_TITLE_DUPLICATE','eventPublicId',v_exact.public_id);
  end if;
  if p_duplicate_candidate_event_public_id is not null then
    return jsonb_build_object('safe',false,'reason','AI_DUPLICATE_CANDIDATE','eventPublicId',p_duplicate_candidate_event_public_id);
  end if;
  if v_decision<>'DISTINCT_EVENT' then
    return jsonb_build_object('safe',false,'reason','CANONICALIZATION_NOT_DISTINCT','decision',v_decision);
  end if;
  return jsonb_build_object('safe',true,'reason',null);
end; $$;
revoke all on function private.market_admission_duplicate_guard(uuid,text,text,uuid) from public,anon,authenticated;
grant execute on function private.market_admission_duplicate_guard(uuid,text,text,uuid) to service_role;