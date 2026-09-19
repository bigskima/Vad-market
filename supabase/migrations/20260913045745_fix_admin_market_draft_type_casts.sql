create or replace function public.admin_approve_market_proposal_auto(
  p_proposal_public_id uuid,
  p_title text,
  p_description text,
  p_category text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_template_code text;
  v_policy_public_id uuid;
  v_asset public.assets;
  v_normalized jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if nullif(btrim(p_title),'') is null or nullif(btrim(p_category),'') is null then
    raise exception 'Market title and category are required' using errcode='22023';
  end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then
    raise exception 'Choose a valid opening, closing and resolution time' using errcode='22023';
  end if;

  select * into v_asset from public.assets where code=upper(btrim(p_asset_code)) and status='ACTIVE';
  if v_asset.id is null then raise exception 'Selected market currency is unavailable' using errcode='P0002'; end if;

  select t.code into v_template_code from market.templates t where t.status='ACTIVE' and t.code='BINARY_EVENT' limit 1;
  if v_template_code is null then
    select t.code into v_template_code from market.templates t where t.status='ACTIVE' order by t.id limit 1;
  end if;
  if v_template_code is null then raise exception 'No active market template is available' using errcode='P0001'; end if;

  if coalesce((v_asset.metadata->>'sandbox_only')::boolean,false) then
    select p.public_id into v_policy_public_id
    from oracle.policies p
    where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment',''))='SANDBOX'
    order by p.effective_at desc,p.version desc limit 1;
  else
    select p.public_id into v_policy_public_id
    from oracle.policies p
    where p.status='ACTIVE' and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))<>'SANDBOX'
    order by p.effective_at desc,p.version desc limit 1;
  end if;
  if v_policy_public_id is null then
    select p.public_id into v_policy_public_id from oracle.policies p where p.status='ACTIVE' and p.effective_at<=statement_timestamp() order by p.effective_at desc,p.version desc limit 1;
  end if;
  if v_policy_public_id is null then raise exception 'No active VAD resolution policy is available' using errcode='P0001'; end if;

  v_normalized:=jsonb_build_object(
    'subject',btrim(p_title),
    'time_scope',p_closes_at,
    'category',btrim(p_category),
    'configured_by','VAD_AUTO'
  );

  return public.admin_approve_market_proposal(
    p_proposal_public_id,
    v_template_code,
    btrim(p_title),
    coalesce(p_description,''),
    btrim(p_category),
    v_normalized,
    '{}'::jsonb,
    p_opens_at,
    p_closes_at,
    p_resolves_after,
    v_policy_public_id,
    upper(btrim(p_country_code)),
    upper(btrim(p_asset_code)),
    100::numeric,
    4::smallint
  );
end;
$$;
