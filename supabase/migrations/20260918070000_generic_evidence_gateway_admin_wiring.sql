-- Generic evidence gateway, additive to existing resolver and settlement flows.
insert into integration.providers(code,name,provider_type,environment,status,priority,capabilities,public_metadata,secret_reference) values ('TAVILY','Tavily Web Evidence','ORACLE','PRODUCTION','ACTIVE',40,'["PUBLIC_RECORD_EVIDENCE"]'::jsonb,'{"adapter":"TAVILY_SEARCH_V1","base_url":"https://api.tavily.com","configured":true,"credential_mode":"BEARER_SECRET","settlement_role":"DISCOVERY_CORROBORATING","provider_agnostic":true}'::jsonb,'TAVILY_API_KEY') on conflict(code,environment) do update set name=excluded.name,status=excluded.status,priority=excluded.priority,capabilities=excluded.capabilities,public_metadata=excluded.public_metadata,secret_reference=excluded.secret_reference,updated_at=statement_timestamp();

insert into oracle.policies(name,capability_id,version,source_hierarchy,consensus_rule,close_rule,postponement_rule,cancellation_rule,void_rule,dispute_window_seconds,status,effective_at,created_by,approved_by) select 'VAD Generic Evidence Gateway Policy',p.capability_id,5,'[{"role":"PRIMARY","provider_code":"PUBLIC_RECORD"},{"role":"CORROBORATING","provider_code":"TAVILY"}]'::jsonb,'{"environment":"PRODUCTION","tie_behavior":"NO_RESOLUTION","finalization_mode":"AUTO_AFTER_DISPUTE_WINDOW","distinct_providers":false,"min_agreeing_providers":1}'::jsonb,p.close_rule,p.postponement_rule,p.cancellation_rule,p.void_rule,greatest(p.dispute_window_seconds,60),'ACTIVE',statement_timestamp(),null,p.approved_by from oracle.policies p where p.name='VAD Generic Public Record Policy' and p.status='ACTIVE' and not exists(select 1 from oracle.policies x where x.name='VAD Generic Evidence Gateway Policy' and x.version=5) order by p.version desc limit 1;

CREATE OR REPLACE FUNCTION public.admin_create_guided_market_v4(p_title text, p_description text, p_category text, p_market_setup jsonb, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_resolves_after timestamp with time zone, p_country_code text, p_asset_code text, p_liquidity_model text, p_publish_now boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_setup jsonb:=coalesce(p_market_setup,'{}'::jsonb); v_kind text:=upper(btrim(coalesce(p_market_setup->>'kind',''))); v_checking text:=upper(btrim(coalesce(p_market_setup->>'result_checking','VERIFIED'))); v_phrase text:=btrim(coalesce(p_market_setup->>'evidence_phrase','')); v_url text:=btrim(coalesce(p_market_setup->>'source_url','')); v_source text:=btrim(coalesce(p_market_setup->>'source_name','')); v_verified jsonb; v_result jsonb; v_event_public_id uuid; v_instrument_public_id uuid; v_event_id bigint; v_policy_id bigint; v_provider_id bigint; v_host text;
begin
 if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
 if v_checking<>'AUTOMATIC' or v_kind='FOOTBALL_MATCH' then return public.admin_create_guided_market_v3(p_title,p_description,p_category,p_market_setup,p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,p_liquidity_model,p_publish_now); end if;
 if v_phrase='' then raise exception 'Add the evidence phrase that objectively confirms YES.' using errcode='22023'; end if;
 if char_length(v_phrase)<4 or char_length(v_phrase)>240 then raise exception 'Evidence phrase must be between 4 and 240 characters.' using errcode='22023'; end if;
 if v_url<>'' and v_url !~* '^https://' then raise exception 'Automatic evidence URLs must use https://' using errcode='22023'; end if;
 if v_source='' then v_source:='VAD Evidence Gateway'; end if;
 v_verified:=v_setup||jsonb_build_object('result_checking','VERIFIED','source_name',v_source);
 v_result:=public.admin_create_guided_market_v3(p_title,p_description,p_category,v_verified,p_opens_at,p_closes_at,p_resolves_after,p_country_code,p_asset_code,p_liquidity_model,false);
 v_event_public_id:=nullif(v_result->>'event_id','')::uuid; v_instrument_public_id:=nullif(v_result->>'instrument_id','')::uuid;
 select id into v_event_id from market.canonical_events where public_id=v_event_public_id for update;
 select id into v_policy_id from oracle.policies where name='VAD Generic Evidence Gateway Policy' and status='ACTIVE' order by version desc,effective_at desc limit 1;
 if v_event_id is null or v_policy_id is null then raise exception 'Automatic evidence routing is not ready.' using errcode='P0001'; end if;
 update market.canonical_events set resolution_scope=coalesce(resolution_scope,'{}'::jsonb)||jsonb_build_object('resolver_type','PUBLIC_RECORD_RULE_V1','event_type',coalesce(nullif(v_kind,''),'OBJECTIVE_EVENT'),'rule',jsonb_build_object('operator','CONTAINS','expected',v_phrase),'source_name',v_source,'source_url',nullif(v_url,''),'market_question',btrim(p_title),'verification','Automatic evidence gateway: direct authoritative record first when configured, then broad evidence discovery fallback.','configured_by','ADMIN_GUIDED_V4'),updated_at=statement_timestamp() where id=v_event_id;
 insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_at,bound_by) values(v_event_id,v_policy_id,statement_timestamp(),auth.uid()) on conflict(event_id) do update set oracle_policy_id=excluded.oracle_policy_id,bound_at=excluded.bound_at,bound_by=excluded.bound_by;
 if v_url<>'' then v_host:=lower(regexp_replace(v_url,'^https://([^/]+).*$','\1','i')); select id into v_provider_id from integration.providers where code='PUBLIC_RECORD' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED') order by priority,id limit 1; if v_provider_id is not null then insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata) values(v_provider_id,'PUBLIC_EVENT',v_event_public_id::text,v_url,'ACTIVE',jsonb_build_object('authority',v_source,'host_allowlist',jsonb_build_array(v_host),'market_question',btrim(p_title),'configured_by','ADMIN_GUIDED_V4')) on conflict(provider_id,resource_type,canonical_key) do update set external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp(); end if; end if;
 select id into v_provider_id from integration.providers where code='TAVILY' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED') order by priority,id limit 1;
 if v_provider_id is not null then insert into oracle.provider_resources(provider_id,resource_type,canonical_key,external_key,status,metadata) values(v_provider_id,'PUBLIC_EVENT',v_event_public_id::text,'SEARCH','ACTIVE',jsonb_build_object('search_query',btrim(p_title)||' '||v_phrase,'market_question',btrim(p_title),'authority',v_source,'host_allowlist',case when v_host is null then '[]'::jsonb else jsonb_build_array(v_host) end,'configured_by','ADMIN_GUIDED_V4')) on conflict(provider_id,resource_type,canonical_key) do update set external_key=excluded.external_key,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp(); end if;
 if p_publish_now then perform public.admin_publish_market(v_instrument_public_id,100,'Published during guided admin market creation'); v_result:=v_result||jsonb_build_object('publication_status','PUBLISHED'); else v_result:=v_result||jsonb_build_object('publication_status','DRAFT'); end if;
 return v_result||jsonb_build_object('result_checking','AUTOMATIC','result_source',case when v_url<>'' then v_source||' + VAD Evidence Gateway' else 'VAD Evidence Gateway' end,'evidence_route','PUBLIC_RECORD_RULE_V1');
end; $function$
;

CREATE OR REPLACE FUNCTION public.admin_market_approval_options_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ declare v jsonb; v_tavily boolean; v_public boolean; begin v:=public.admin_market_approval_options(); select exists(select 1 from integration.providers where code='TAVILY' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_tavily; select exists(select 1 from integration.providers where code='PUBLIC_RECORD' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_public; return jsonb_set(v,'{guided,evidence}',jsonb_build_object('automaticAvailable',v_tavily or v_public,'broadSearchAvailable',v_tavily,'directPublicRecordAvailable',v_public,'automaticSourceName','VAD Evidence Gateway','secretName','TAVILY_API_KEY'),true); end; $function$
;


revoke all on function public.admin_market_approval_options_v2() from public,anon;
grant execute on function public.admin_market_approval_options_v2() to authenticated;
revoke all on function public.admin_create_guided_market_v4(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,text,boolean) from public,anon;
grant execute on function public.admin_create_guided_market_v4(text,text,text,jsonb,timestamptz,timestamptz,timestamptz,text,text,text,boolean) to authenticated;
