create or replace function private.derive_market_resolution_scope(
  p_proposal market.proposals,
  p_title text,
  p_category text,
  p_resolves_after timestamptz
) returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_scope jsonb;
  v_category text:=upper(btrim(coalesce(p_category,'')));
  v_resolver text;
  v_title text:=btrim(coalesce(p_title,''));
  v_asset_match text[];
  v_threshold_match text[];
  v_asset text;
  v_operator text;
  v_threshold numeric;
begin
  v_scope:=p_proposal.normalized_payload->'ai_admission'->'resolutionScope';

  if v_scope is null or jsonb_typeof(v_scope) <> 'object' or v_scope='{}'::jsonb then
    if v_category='CRYPTO' then
      v_asset_match:=regexp_match(upper(v_title),'\m(BTC|ETH|USDC)\M');
      v_asset:=case when v_asset_match is not null then v_asset_match[1] else null end;

      if v_title ~* '(at or above|at least)' then
        v_operator:='GTE';
        v_threshold_match:=regexp_match(v_title,'(?:at or above|at least)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      elsif v_title ~* '(above|over|greater than)' then
        v_operator:='GT';
        v_threshold_match:=regexp_match(v_title,'(?:above|over|greater than)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      elsif v_title ~* '(at or below|at most)' then
        v_operator:='LTE';
        v_threshold_match:=regexp_match(v_title,'(?:at or below|at most)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      elsif v_title ~* '(below|under|less than)' then
        v_operator:='LT';
        v_threshold_match:=regexp_match(v_title,'(?:below|under|less than)\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]+)?)','i');
      end if;

      if v_threshold_match is not null then
        begin
          v_threshold:=replace(v_threshold_match[1],',','')::numeric;
        exception when others then
          v_threshold:=null;
        end;
      end if;

      if v_asset is not null and v_operator is not null and v_threshold is not null and v_threshold>0 then
        return jsonb_build_object(
          'resolver_type','CRYPTO_PRICE_THRESHOLD_V1',
          'asset',v_asset,
          'quote','USD',
          'operator',v_operator,
          'threshold',v_threshold,
          'observation_time',p_resolves_after,
          'category',v_category,
          'market_question',v_title,
          'configured_by','VAD_AUTO'
        );
      end if;
    end if;

    return jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'condition',format('Resolve YES when authoritative evidence confirms the market proposition: %s',v_title),
      'verification','VAD oracle review using approved authoritative evidence sources.',
      'category',v_category,
      'market_question',v_title,
      'resolution_time',p_resolves_after,
      'configured_by','VAD_AUTO'
    );
  end if;

  v_resolver:=upper(coalesce(v_scope->>'resolver_type',v_scope->>'resolverType',''));
  if v_resolver not in ('CRYPTO_PRICE_THRESHOLD_V1','FOOTBALL_MATCH_RESULT_V1') then
    v_scope:=v_scope || jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'resolution_time',p_resolves_after,
      'category',v_category
    );
  else
    v_scope:=v_scope || jsonb_build_object(
      'resolution_time',p_resolves_after,
      'category',v_category
    );
  end if;
  return v_scope;
end;
$$;
