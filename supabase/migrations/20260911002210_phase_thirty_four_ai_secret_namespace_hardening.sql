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
  v_name text:=btrim(coalesce(p_provider_name,''));
  v_env text:=upper(btrim(coalesce(p_environment,'PRODUCTION')));
  v_adapter text:=upper(btrim(coalesce(p_adapter,'')));
  v_secret_reference text:=upper(btrim(coalesce(p_secret_reference,'')));
  v_existing_type text;
  v_provider_id bigint;
  v_ai_id bigint;
  v_status text;
begin
  if auth.uid() is null or not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
  if v_code !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'Invalid provider code' using errcode='22023'; end if;
  if char_length(v_name)<2 or char_length(v_name)>120 then raise exception 'Provider name must be 2-120 characters' using errcode='22023'; end if;
  if v_env not in ('SANDBOX','PRODUCTION') then raise exception 'Invalid environment' using errcode='22023'; end if;
  if v_adapter not in ('OPENAI_COMPATIBLE','GEMINI_GENERATE_CONTENT','ANTHROPIC_MESSAGES','CLOUDFLARE_WORKERS_AI') then raise exception 'Unsupported AI protocol adapter' using errcode='22023'; end if;
  if coalesce(p_endpoint,'') !~ '^https://[^[:space:]]+$' then raise exception 'AI endpoint must be HTTPS' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_endpoint,'')))>800 then raise exception 'AI endpoint is too long' using errcode='22023'; end if;
  if nullif(btrim(coalesce(p_model_code,'')),'') is null or char_length(btrim(p_model_code))>160 then raise exception 'A valid model code is required' using errcode='22023'; end if;
  if v_secret_reference !~ '^VAD_AI_[A-Z0-9_]+$' then raise exception 'AI secret references must use the VAD_AI_ namespace' using errcode='22023'; end if;
  if p_priority is null or p_priority<0 or p_priority>10000 then raise exception 'Priority must be between 0 and 10000' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_cost_policy,'{}'::jsonb))<>'object' then raise exception 'Cost policy must be an object' using errcode='22023'; end if;

  select provider_type,status into v_existing_type,v_status from integration.providers where code=v_code and environment=v_env;
  if v_existing_type is not null and v_existing_type<>'AI' then
    raise exception 'Provider code % is already used by a non-AI integration in this environment',v_code using errcode='23505';
  end if;

  insert into integration.providers(code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference)
  values(v_code,v_name,'AI',v_env,coalesce(v_status,'DISABLED'),p_priority,'["MARKET_ADMISSION"]'::jsonb,jsonb_strip_nulls(jsonb_build_object('configured',true,'ai_adapter',v_adapter,'endpoint',btrim(p_endpoint),'api_version',nullif(btrim(coalesce(p_api_version,'')),''))),v_secret_reference)
  on conflict(code,environment) do update set
    name=excluded.name,priority=excluded.priority,capabilities=excluded.capabilities,
    public_metadata=integration.providers.public_metadata||excluded.public_metadata,
    secret_reference=excluded.secret_reference,updated_at=statement_timestamp()
  returning id into v_provider_id;

  insert into ai.providers(integration_provider_id,model_code,status,capabilities,priority,cost_policy)
  values(v_provider_id,btrim(p_model_code),'ACTIVE','["MARKET_ADMISSION"]'::jsonb,p_priority,coalesce(p_cost_policy,'{}'::jsonb))
  on conflict(integration_provider_id,model_code) do update set status='ACTIVE',capabilities=excluded.capabilities,priority=excluded.priority,cost_policy=excluded.cost_policy,updated_at=statement_timestamp()
  returning id into v_ai_id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','AI_PROVIDER_MODEL_CONFIGURED','AI_PROVIDER',v_ai_id::text,'Configured provider-neutral AI model routing for market admission.',jsonb_build_object('provider_code',v_code,'environment',v_env,'adapter',v_adapter,'model_code',p_model_code,'priority',p_priority,'secret_reference',v_secret_reference));
  return v_ai_id;
end; $$;
revoke all on function public.admin_upsert_ai_provider_model(text,text,text,text,text,text,text,integer,jsonb,text) from public,anon;
grant execute on function public.admin_upsert_ai_provider_model(text,text,text,text,text,text,text,integer,jsonb,text) to authenticated;