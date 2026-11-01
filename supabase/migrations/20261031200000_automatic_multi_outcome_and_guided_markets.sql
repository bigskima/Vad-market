-- Extend automatic VAD evidence resolution to all generic categories and
-- multi-outcome markets. This removes the manual-only creation branch while
-- preserving exact outcome matching, independent evidence and oracle dispute
-- safeguards.

BEGIN;

-- A market may use explicit official source URLs, or rely on the configured
-- Tavily discovery adapter to locate an official primary page and independent
-- corroborating public evidence. Supplied URLs remain strictly HTTPS/public.
CREATE OR REPLACE FUNCTION private.require_vad_auto_resolution_source_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_scope jsonb := coalesce(NEW.resolution_scope, '{}'::jsonb);
  v_resolver text := upper(coalesce(v_scope->>'resolver_type', ''));
  v_url text := nullif(btrim(coalesce(v_scope->>'source_url', v_scope->>'sourceUrl', '')), '');
  v_item text;
BEGIN
  IF v_resolver NOT IN ('VAD_REVIEW_V1', 'AI_EVIDENCE_RULE_V1') THEN
    RETURN NEW;
  END IF;

  IF v_url IS NOT NULL AND (
    v_url !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
    OR v_url ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
    OR v_url ~* '[.](local|localhost|test|internal)([:/]|$)'
  ) THEN
    RAISE EXCEPTION 'A supplied result source URL must be a public HTTPS website.'
      USING errcode = '22023';
  END IF;

  IF jsonb_typeof(v_scope->'sources') = 'array' THEN
    FOR v_item IN
      SELECT value FROM jsonb_array_elements_text(v_scope->'sources') AS source(value)
    LOOP
      IF v_item !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
        OR v_item ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
        OR v_item ~* '[.](local|localhost|test|internal)([:/]|$)' THEN
        RAISE EXCEPTION 'Every supplied result source must be a public HTTPS website.'
          USING errcode = '22023';
      END IF;
    END LOOP;
  END IF;

  -- No URL is required. The shared worker performs broad public-source
  -- discovery and independently fetches a direct page before it can resolve.
  RETURN NEW;
END;
$function$;

-- Teach the central validator that VAD_REVIEW_V1 is an automatic evidence
-- resolver, not a manual-review resolver. The same rule applies to every
-- category and to multi-outcome contracts.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'private.validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  ready_provider_count integer:=0;
  mapped_provider_count integer:=0;
begin$old$;
  v_new := $new$  ready_provider_count integer:=0;
  mapped_provider_count integer:=0;
  auto_resolution_text text;
  auto_source_url text;
  auto_policy_count integer:=0;
  auto_model_count integer:=0;
  auto_dispute_window integer:=0;
begin$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find generic resolution validator declarations; refusing to patch an unexpected function body.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  resolver_type:=upper(btrim(coalesce(p_scope->>'resolver_type',p_scope->>'resolverType','')));
  if resolver_type='' then return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','A deterministic resolver_type is required.','riskFlag','RESOLVER_TYPE_REQUIRED'); end if;$old$;

  v_new := $new$  resolver_type:=upper(btrim(coalesce(p_scope->>'resolver_type',p_scope->>'resolverType','')));
  if resolver_type='' then return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','A resolver_type is required.','riskFlag','RESOLVER_TYPE_REQUIRED'); end if;

  if resolver_type in ('VAD_REVIEW_V1','AI_EVIDENCE_RULE_V1') then
    auto_resolution_text:=btrim(coalesce(
      p_scope->>'condition',
      p_scope->>'resolution_instructions',
      p_scope->>'resolutionInstructions',
      p_scope->>'resolution_rule',
      p_scope->>'resolutionRule',
      ''
    ));
    if char_length(auto_resolution_text)<10 or char_length(auto_resolution_text)>4000 then
      return jsonb_build_object(
        'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
        'reason','Add clear resolution instructions between 10 and 4000 characters.',
        'riskFlag','RESOLUTION_INSTRUCTIONS_REQUIRED'
      );
    end if;

    if p_closes_at is null or p_resolves_after is null or p_resolves_after<p_closes_at then
      return jsonb_build_object(
        'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
        'reason','The result-checking time must be at or after market close.',
        'riskFlag','RESOLUTION_TIMING_INVALID'
      );
    end if;

    auto_source_url:=nullif(btrim(coalesce(p_scope->>'source_url',p_scope->>'sourceUrl','')),'');
    if auto_source_url is not null and (
      auto_source_url !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
      or auto_source_url ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
      or auto_source_url ~* '[.](local|localhost|test|internal)([:/]|$)'
    ) then
      return jsonb_build_object(
        'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
        'reason','A supplied result source must be a public HTTPS website.',
        'riskFlag','RESOLUTION_SOURCE_INVALID'
      );
    end if;

    if upper(coalesce(p_scope->>'market_format',''))='MULTI_OUTCOME' then
      if jsonb_typeof(p_scope->'outcome_options') is distinct from 'array' then
        return jsonb_build_object(
          'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
          'reason','Configure between 2 and 20 named outcome choices.',
          'riskFlag','OUTCOME_OPTIONS_INVALID'
        );
      end if;
      if jsonb_array_length(p_scope->'outcome_options')<2
         or jsonb_array_length(p_scope->'outcome_options')>20 then
        return jsonb_build_object(
          'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
          'reason','Configure between 2 and 20 named outcome choices.',
          'riskFlag','OUTCOME_OPTIONS_INVALID'
        );
      end if;

      if exists (
        select 1
        from jsonb_array_elements(p_scope->'outcome_options') as choice(value)
        where jsonb_typeof(choice.value)<>'object'
          or nullif(btrim(coalesce(choice.value->>'code','')),'') is null
          or nullif(btrim(coalesce(choice.value->>'label','')),'') is null
          or char_length(btrim(coalesce(choice.value->>'label','')))>80
      ) then
        return jsonb_build_object(
          'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
          'reason','Every outcome must have a valid internal code and a named label up to 80 characters.',
          'riskFlag','OUTCOME_OPTIONS_INVALID'
        );
      end if;

      if (
        select count(distinct lower(btrim(choice.value->>'label')))
        from jsonb_array_elements(p_scope->'outcome_options') as choice(value)
      ) <> jsonb_array_length(p_scope->'outcome_options')
      or (
        select count(distinct upper(btrim(choice.value->>'code')))
        from jsonb_array_elements(p_scope->'outcome_options') as choice(value)
      ) <> jsonb_array_length(p_scope->'outcome_options') then
        return jsonb_build_object(
          'valid',false,'autoPublishReady',false,'resolverType',resolver_type,
          'reason','Outcome labels and internal codes must be unique.',
          'riskFlag','OUTCOME_OPTIONS_NOT_UNIQUE'
        );
      end if;
    end if;

    -- The configured automatic evidence policy needs the official public-record
    -- adapter plus an independently operated search/corroboration adapter.
    select count(distinct ip.code)::integer
      into mapped_provider_count
    from integration.providers ip
    where ip.code in ('PUBLIC_RECORD','TAVILY')
      and ip.provider_type='ORACLE'
      and ip.environment='PRODUCTION'
      and ip.status in ('ACTIVE','DEGRADED')
      and ip.capabilities @> '["PUBLIC_RECORD_EVIDENCE"]'::jsonb
      and coalesce((ip.public_metadata->>'configured')::boolean,false)=true
      and (ip.code<>'TAVILY' or ip.secret_reference is not null);

    select count(*)::integer
      into auto_policy_count
    from oracle.policies p
    where p.status='ACTIVE'
      and p.approved_by is not null
      and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))='PRODUCTION'
      and upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW'
      and coalesce(p.void_rule->>'mode','')='EQUAL_SPLIT'
      and exists (
        select 1 from jsonb_array_elements(coalesce(p.source_hierarchy,'[]'::jsonb)) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='PUBLIC_RECORD'
      )
      and exists (
        select 1 from jsonb_array_elements(coalesce(p.source_hierarchy,'[]'::jsonb)) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='TAVILY'
      )
    ;

    select count(*)::integer
      into auto_model_count
    from ai.providers ap
    join integration.providers ip on ip.id=ap.integration_provider_id
    where ap.status='ACTIVE'
      and ap.capabilities @> '["MARKET_RESOLUTION"]'::jsonb
      and ap.cost_policy->>'billing_mode'='FREE_ONLY'
      and ip.provider_type='AI'
      and ip.environment='PRODUCTION'
      and ip.status in ('ACTIVE','DEGRADED');

    select p.dispute_window_seconds
      into auto_dispute_window
    from oracle.policies p
    where p.status='ACTIVE'
      and p.approved_by is not null
      and p.effective_at<=statement_timestamp()
      and upper(coalesce(p.consensus_rule->>'environment','PRODUCTION'))='PRODUCTION'
      and upper(coalesce(p.consensus_rule->>'finalization_mode',''))='AUTO_AFTER_DISPUTE_WINDOW'
      and coalesce(p.void_rule->>'mode','')='EQUAL_SPLIT'
      and exists (
        select 1 from jsonb_array_elements(coalesce(p.source_hierarchy,'[]'::jsonb)) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='PUBLIC_RECORD'
      )
      and exists (
        select 1 from jsonb_array_elements(coalesce(p.source_hierarchy,'[]'::jsonb)) h
        where upper(coalesce(h->>'provider_code',h->>'providerCode',''))='TAVILY'
      )
    order by p.version desc,p.effective_at desc,p.id desc
    limit 1;

    if coalesce(mapped_provider_count,0)<2
       or coalesce(auto_policy_count,0)<1
       or coalesce(auto_model_count,0)<2
       or auto_dispute_window is null then
      return jsonb_build_object(
        'valid',true,
        'autoPublishReady',false,
        'resolverType',resolver_type,
        'resolutionMode','AUTOMATIC',
        'requiredIndependentAiModels',2,
        'requiredEvidencePaths',jsonb_build_array('DIRECT','SEARCH'),
        'requiredIndependentOracleProviders',2,
        'readyEvidenceProviders',coalesce(mapped_provider_count,0),
        'readyAiModels',coalesce(auto_model_count,0),
        'reason','The market rules are valid, but the automatic evidence policy, two free AI models or both independent evidence providers are not ready. Keep this market as a draft until the automatic resolver is healthy.',
        'riskFlag','AUTO_RESOLUTION_RUNTIME_NOT_READY'
      );
    end if;

    return jsonb_build_object(
      'valid',true,
      'autoPublishReady',true,
      'resolverType',resolver_type,
      'marketFormat',upper(coalesce(p_scope->>'market_format','BINARY')),
      'resolutionMode','AUTOMATIC',
      'requiredIndependentAiModels',2,
      'requiredEvidencePaths',jsonb_build_array('DIRECT','SEARCH'),
      'requiredIndependentOracleProviders',2,
      'readyEvidenceProviders',mapped_provider_count,
      'readyAiModels',auto_model_count,
      'finalizationMode','AUTO_AFTER_DISPUTE_WINDOW',
      'disputeWindowSeconds',auto_dispute_window,
      'reason','Automatic resolution is configured. VAD checks the published rule against a direct public record and independent search evidence, requires two agreeing AI models and oracle consensus, then finalizes after the published dispute window. Missing or conflicting evidence remains unresolved.',
      'riskFlag',null
    );
  end if;

  if resolver_type='' then return jsonb_build_object('valid',false,'autoPublishReady',false,'reason','A resolver_type is required.','riskFlag','RESOLVER_TYPE_REQUIRED'); end if;$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find the resolver-type decision point; refusing to patch an unexpected validator body.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$patch$;

-- The admin-facing multi-outcome validator previously returned
-- MANUAL_REVIEW_REQUIRED unconditionally. Reuse the same readiness checks used
-- by binary markets and preserve the outcome-count metadata.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_validate_oracle_resolution_scope(jsonb,timestamptz,timestamptz)'::regprocedure
  ) INTO v_definition;

  v_old := $old$    if v_source_name='' or char_length(v_source_name)>180
       or (v_source_url<>'' and v_source_url !~* '^https://') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','Provide a result source name and, if supplied, a secure https:// source link.','riskFlag','RESOLUTION_SOURCE_INVALID');
    end if;$old$;
  v_new := $new$    if char_length(v_source_name)>180
       or (v_source_url<>'' and v_source_url !~* '^https://') then
      return jsonb_build_object('valid',false,'autoPublishReady',false,'resolverType','VAD_REVIEW_V1',
        'reason','If supplied, the preferred source name and URL must be valid.','riskFlag','RESOLUTION_SOURCE_INVALID');
    end if;$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome source validation; refusing to patch an unexpected admin validator.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$    return jsonb_build_object(
      'valid',true,
      'autoPublishReady',false,
      'resolverType','VAD_REVIEW_V1',
      'marketFormat','MULTI_OUTCOME',
      'outcomeCount',v_choice_count,
      'requiredIndependentProviders',0,
      'reason','Market configuration is valid. An authorized Oracle reviewer must verify the official source and select one configured outcome; automatic finalization is disabled.',
      'riskFlag','MANUAL_REVIEW_REQUIRED'
    );$old$;
  v_new := $new$    return private.validate_oracle_resolution_scope(
      p_scope,p_closes_at,p_resolves_after
    ) || jsonb_build_object(
      'marketFormat','MULTI_OUTCOME',
      'outcomeCount',v_choice_count
    );$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find manual-only multi-outcome return; refusing to patch an unexpected admin validator.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$patch$;

-- Multi-outcome creation accepts an optional source hint and uses the same
-- automatic evidence resolver. The worker can discover official sources when
-- no URL is explicitly supplied.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_create_multi_outcome_market_v1(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  if v_source_name = '' or char_length(v_source_name) > 180 then
    raise exception 'Name the authoritative result source.' using errcode = '22023';
  end if;$old$;
  v_new := $new$  if char_length(v_source_name) > 180 then
    raise exception 'The preferred result source name must be 180 characters or fewer.' using errcode = '22023';
  end if;
  if v_source_name='' then
    v_source_name:='Automatic public-source discovery';
  end if;$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome source-name requirement.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := 'Manual VAD review against the configured resolution instructions and source. The final result must match one configured outcome.';
  v_new := 'Automatic VAD evidence resolution uses the published instructions and configured source hint, or discovers public sources when no URL is supplied. The final result must match exactly one configured outcome.';
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find manual multi-outcome verification description.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  return v_result || jsonb_build_object(
    'market_format', 'MULTI_OUTCOME',
    'outcomes', v_option_payload,
    'resolution_mode', 'VAD_REVIEW_V1'
  );$old$;
  v_new := $new$  return v_result || jsonb_build_object(
    'market_format', 'MULTI_OUTCOME',
    'outcomes', v_option_payload,
    'resolution_mode', 'AUTOMATIC_EVIDENCE'
  );$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome resolution mode return label.';
  END IF;
  v_definition := replace(v_definition,v_old,v_new);

  v_old := $old$  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    raise exception '%', coalesce(v_validation->>'reason', 'The multiple-outcome resolution rules are invalid.')
      using errcode = '22023';
  end if;$old$;
  v_new := $new$  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    raise exception '%', coalesce(v_validation->>'reason', 'The multiple-outcome resolution rules are invalid.')
      using errcode = '22023';
  end if;
  if coalesce(p_publish_now,false)
     and not coalesce((v_validation->>'autoPublishReady')::boolean,false) then
    raise exception '%',coalesce(v_validation->>'reason','Automatic resolution is not ready.')
      using errcode='23514';
  end if;$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome readiness check in v1.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$patch$;

DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_create_multi_outcome_market_v2(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,numeric,numeric,boolean,integer,text)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  if nullif(btrim(coalesce(p_source_url,'')),'') is null
    or btrim(coalesce(p_source_url,'')) !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
        or btrim(coalesce(p_source_url,'')) ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
        or btrim(coalesce(p_source_url,'')) ~* '[.](local|localhost|test|internal)([:/]|$)' then
    raise exception 'Automatic multi-outcome resolution requires an authoritative HTTPS source URL for direct evidence and scoped corroboration.' using errcode='22023';
  end if;$old$;
  v_new := $new$  if nullif(btrim(coalesce(p_source_url,'')),'') is not null
    and (
      btrim(coalesce(p_source_url,'')) !~* '^[h][t][t][p][s]://[^/[:space:]]+[.][^/[:space:]]+'
      or btrim(coalesce(p_source_url,'')) ~* '^[h][t][t][p][s]://[0-9]{1,3}([.][0-9]{1,3}){3}([:/]|$)'
      or btrim(coalesce(p_source_url,'')) ~* '[.](local|localhost|test|internal)([:/]|$)'
    ) then
    raise exception 'A supplied automatic multi-outcome source URL must be a public HTTPS website.' using errcode='22023';
  end if;$new$;

  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome mandatory source URL gate.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$declare
  v_result jsonb;
  v_id uuid;
begin$old$;
  v_new := $new$declare
  v_result jsonb;
  v_id uuid;
  v_validation jsonb;
begin$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome v2 local declarations.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  v_old := $old$  if v_id is null then raise exception 'The multiple-outcome market was created without a usable instrument ID.' using errcode='P0001'; end if;

  -- The underlying legacy helper labels this scope as manual, but VAD's existing
$old$;
  v_new := $new$  if v_id is null then raise exception 'The multiple-outcome market was created without a usable instrument ID.' using errcode='P0001'; end if;

  if coalesce(p_publish_now,false) then
    select public.admin_validate_oracle_resolution_scope(e.resolution_scope,e.closes_at,e.resolves_after)
      into v_validation
    from market.instruments i
    join market.canonical_events e on e.id=i.canonical_event_id
    where i.public_id=v_id;
    if not coalesce((v_validation->>'valid')::boolean,false)
       or not coalesce((v_validation->>'autoPublishReady')::boolean,false) then
      raise exception '%',coalesce(v_validation->>'reason','Automatic evidence resolution is not ready.')
        using errcode='23514';
    end if;
  end if;

  -- The underlying legacy helper labels this scope as manual, but VAD's existing
$new$;
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Could not find multi-outcome v2 publication readiness point.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);

  EXECUTE v_definition;
END;
$patch$;

-- Guided transfer, election, politics and general event markets already use
-- VAD_REVIEW_V1. Route AUTOMATIC checking through that shared resolver instead
-- of forcing the admin to choose Verified/manual review.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_create_guided_market(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  v_checking:=upper(btrim(coalesce(v_setup->>'result_checking','VERIFIED')));
  if v_checking not in ('AUTOMATIC','VERIFIED') then$old$;
  v_new := $new$  v_checking:=upper(btrim(coalesce(v_setup->>'result_checking','VERIFIED')));
  if v_checking='AUTOMATIC' and v_source_name='' then
    v_source_name:='Automatic public-source discovery';
  end if;
  if v_checking not in ('AUTOMATIC','VERIFIED') then$new$;
  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find guided-market result mode assignment.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);

  v_old := $old$    if v_checking='AUTOMATIC' then
      raise exception 'Player transfers currently use Verified result checking. Automatic checking is not enabled for this market type yet.' using errcode='22023';
    end if;$old$;
  IF position(v_old IN v_definition)>0 THEN
    v_definition:=replace(v_definition,'    if v_checking=''AUTOMATIC'' then'||chr(10)||
      '      raise exception ''Player transfers currently use Verified result checking. Automatic checking is not enabled for this market type yet.'' using errcode=''22023'';'||chr(10)||
      '    end if;','    -- Shared automatic public-evidence resolution is enabled for transfers.');
  END IF;

  v_old := $old$    if v_checking='AUTOMATIC' then
      raise exception 'Election markets currently use Verified result checking. Automatic checking is not enabled for this market type yet.' using errcode='22023';
    end if;$old$;
  IF position(v_old IN v_definition)>0 THEN
    v_definition:=replace(v_definition,'    if v_checking=''AUTOMATIC'' then'||chr(10)||
      '      raise exception ''Election markets currently use Verified result checking. Automatic checking is not enabled for this market type yet.'' using errcode=''22023'';'||chr(10)||
      '    end if;','    -- Shared automatic public-evidence resolution is enabled for election outcomes.');
  END IF;

  v_old := $old$    if v_checking='AUTOMATIC' then
      raise exception 'This market type currently uses Verified result checking. Choose Verified result to continue.' using errcode='22023';
    end if;$old$;
  IF position(v_old IN v_definition)>0 THEN
    v_definition:=replace(v_definition,'    if v_checking=''AUTOMATIC'' then'||chr(10)||
      '      raise exception ''This market type currently uses Verified result checking. Choose Verified result to continue.'' using errcode=''22023'';'||chr(10)||
      '    end if;','    -- Shared automatic public-evidence resolution is enabled for general events.');
  END IF;

  -- An explicit source name remains an optional hint for AUTOMATIC markets,
  -- and remains required for a manually configured Verified source.
  IF position('if v_source_name='''' then' IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find guided-market source-name gates.';
  END IF;
  v_definition:=replace(v_definition,'if v_source_name='''' then','if v_source_name='''' and v_checking<>''AUTOMATIC'' then');
  EXECUTE v_definition;
END;
$patch$;

-- Database-driven catalog market types also use automatic public evidence;
-- when no source name is supplied, the worker discovers a source at resolution.
DO $patch$
DECLARE
  v_definition text;
  v_old text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(
    'public.admin_create_catalog_market(text,text,text,jsonb,text,text,text,timestamptz,timestamptz,timestamptz,text,text,boolean)'::regprocedure
  ) INTO v_definition;

  v_old := $old$  if v_type.source_required and v_source_name='' then
    raise exception 'Add the authoritative result source VAD should use.' using errcode='22023';
  end if;$old$;
  v_new := $new$  if v_type.source_required and v_source_name='' then
    v_source_name:='Automatic public-source discovery';
  end if;$new$;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Could not find guided catalog required-source-name gate.';
  END IF;
  v_definition:=replace(v_definition,v_old,v_new);
  EXECUTE v_definition;
END;
$patch$;

-- The application worker requires two independent AI model decisions.
-- If fewer than two free runtimes are configured, resolution retries later;
-- it never downgrades to a single model for financial settlement.

COMMIT;
