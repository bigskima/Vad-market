begin;

create or replace function public.admin_create_demo_market(
  p_title text,
  p_description text,
  p_outcomes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
  v_count integer;
begin
  if auth.uid() is null or not private.has_permission('policies.manage') then
    raise exception 'Platform settings permission required' using errcode='42501';
  end if;
  if not coalesce((select enabled from public.platform_feature_flags where flag_key='TNGN_DEMO_MODE'),false) then
    raise exception 'TNGN demo mode is globally disabled' using errcode='42501';
  end if;
  if p_title is null or char_length(trim(p_title)) < 3 or char_length(trim(p_title)) > 120 then
    raise exception 'Market title must be between 3 and 120 characters' using errcode='22023';
  end if;
  if char_length(coalesce(p_description,'')) > 500 then
    raise exception 'Market description must be 500 characters or fewer' using errcode='22023';
  end if;
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception 'Outcomes must be a JSON array' using errcode='22023';
  end if;
  v_count := jsonb_array_length(p_outcomes);
  if v_count < 2 or v_count > 8 then
    raise exception 'A sandbox market must have between 2 and 8 outcomes' using errcode='22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_outcomes) as outcome(item)
    where jsonb_typeof(item) <> 'object'
      or coalesce(trim(item->>'code'),'') = ''
      or char_length(trim(item->>'code')) > 12
      or coalesce(trim(item->>'label'),'') = ''
      or char_length(trim(item->>'label')) > 50
  ) then
    raise exception 'Every outcome needs a code and a label (max 12 and 50 characters)' using errcode='22023';
  end if;
  if (select count(distinct upper(trim(item->>'code'))) from jsonb_array_elements(p_outcomes) as outcome(item)) <> v_count then
    raise exception 'Outcome codes must be unique' using errcode='22023';
  end if;

  v_key := 'demo-custom-' || replace(gen_random_uuid()::text,'-','');
  insert into public.demo_markets(market_key,title,description,category,status,outcomes)
  values (
    v_key,
    trim(p_title),
    trim(coalesce(p_description,'')),
    'DEMO',
    'OPEN',
    (select jsonb_agg(jsonb_build_object('code',upper(trim(item->>'code')),'label',trim(item->>'label')) order by ordinal)
      from jsonb_array_elements(p_outcomes) with ordinality as outcome(item,ordinal))
  );
  return jsonb_build_object('key',v_key,'title',trim(p_title),'status','OPEN','environment','DEMO');
end;
$$;

revoke all on function public.admin_create_demo_market(text,text,jsonb) from public,anon;
grant execute on function public.admin_create_demo_market(text,text,jsonb) to authenticated;

commit;
