create or replace function public.admin_create_market_draft(
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
  v_proposal_public_id uuid;
  v_result jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  if nullif(btrim(p_title),'') is null then raise exception 'Market title is required' using errcode='22023'; end if;
  if nullif(btrim(p_category),'') is null then raise exception 'Market category is required' using errcode='22023'; end if;

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
    btrim(p_title),
    nullif(btrim(coalesce(p_description,'')),''),
    jsonb_build_object(
      'submitted_category',btrim(p_category),
      'requested_asset_code',upper(btrim(p_asset_code)),
      'admin_created',true
    ),
    'UNDER_REVIEW',
    'UNDER_REVIEW',
    1,
    'Created from VAD admin; automatic configuration pending',
    statement_timestamp()
  ) returning public_id into v_proposal_public_id;

  v_result:=public.admin_approve_market_proposal_auto(
    v_proposal_public_id,
    p_title,
    coalesce(p_description,''),
    p_category,
    p_opens_at,
    p_closes_at,
    p_resolves_after,
    p_country_code,
    p_asset_code
  );

  return v_result || jsonb_build_object('proposal_id',v_proposal_public_id,'admin_created',true);
end;
$$;

grant execute on function public.admin_create_market_draft(text,text,text,timestamptz,timestamptz,timestamptz,text,text) to authenticated;
