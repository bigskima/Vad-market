create or replace function public.internal_apply_market_admission_result_v2(
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
  v_output jsonb:=p_output;
  v_guard jsonb;
  v_candidate uuid;
  v_decision text;
  v_reasons jsonb;
  v_flags jsonb;
begin
  if v_output is not null and upper(coalesce(v_output->>'suggestedDecision','REVIEW'))='AUTO_PUBLISH' then
    begin
      v_candidate:=nullif(v_output->>'duplicateCandidateEventPublicId','')::uuid;
    exception when invalid_text_representation then
      v_candidate:=null;
      v_output:=jsonb_set(v_output,'{suggestedDecision}','"REVIEW"'::jsonb,true);
      v_output:=jsonb_set(v_output,'{riskFlags}',coalesce(v_output->'riskFlags','[]'::jsonb)||'"INVALID_DUPLICATE_REFERENCE"'::jsonb,true);
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

  return public.internal_apply_market_admission_result(
    p_proposal_public_id,
    p_user_id,
    p_asset_code,
    p_ai_provider_id,
    p_prompt_version_id,
    v_output,
    p_failure_reason
  );
end; $$;

revoke all on function public.internal_apply_market_admission_result(uuid,uuid,text,bigint,bigint,jsonb,text) from public,anon,authenticated,service_role;
revoke all on function public.internal_apply_market_admission_result_v2(uuid,uuid,text,bigint,bigint,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_apply_market_admission_result_v2(uuid,uuid,text,bigint,bigint,jsonb,text) to service_role;