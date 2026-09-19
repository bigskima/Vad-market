-- Allow Super Admin to decide which centrally configured AI models may serve
-- internal market admission and/or the dedicated user-facing VAD Assistant.

create or replace function public.admin_set_ai_model_capabilities(
  p_ai_provider_id bigint,
  p_capabilities jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_model ai.providers;
  v_caps jsonb;
  v_integration_caps jsonb;
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'Super Admin required' using errcode='42501';
  end if;
  if jsonb_typeof(coalesce(p_capabilities,'null'::jsonb))<>'array' then
    raise exception 'AI capabilities must be a list' using errcode='22023';
  end if;

  select coalesce(jsonb_agg(distinct upper(btrim(value)) order by upper(btrim(value))),'[]'::jsonb)
  into v_caps
  from jsonb_array_elements_text(p_capabilities) x(value)
  where nullif(btrim(value),'') is not null;

  if jsonb_array_length(v_caps)=0 then
    raise exception 'Choose at least one AI capability' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements_text(v_caps) x(value)
    where value not in ('MARKET_ADMISSION','USER_ASSISTANT')
  ) then
    raise exception 'Unsupported AI capability' using errcode='22023';
  end if;

  select * into v_model from ai.providers where id=p_ai_provider_id for update;
  if v_model.id is null then raise exception 'AI model not found' using errcode='P0002'; end if;

  update ai.providers
  set capabilities=v_caps,updated_at=statement_timestamp()
  where id=v_model.id;

  select coalesce(jsonb_agg(distinct c.value order by c.value),'[]'::jsonb)
  into v_integration_caps
  from ai.providers ap
  cross join lateral jsonb_array_elements_text(ap.capabilities) c(value)
  where ap.integration_provider_id=v_model.integration_provider_id;

  update integration.providers
  set capabilities=v_integration_caps,updated_at=statement_timestamp()
  where id=v_model.integration_provider_id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(
    auth.uid(),'ADMIN','AI_MODEL_CAPABILITIES_CHANGED','AI_PROVIDER',v_model.id::text,
    'Updated which VAD AI experiences may route to this model.',
    jsonb_build_object('before',v_model.capabilities,'after',v_caps)
  );

  return v_caps;
end;
$$;
revoke all on function public.admin_set_ai_model_capabilities(bigint,jsonb) from public,anon;
grant execute on function public.admin_set_ai_model_capabilities(bigint,jsonb) to authenticated;
