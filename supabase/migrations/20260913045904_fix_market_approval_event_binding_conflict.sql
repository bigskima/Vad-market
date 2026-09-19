create or replace function public.admin_approve_market_proposal(
  p_proposal_public_id uuid,
  p_template_code text,
  p_title text,
  p_description text,
  p_category text,
  p_normalized_parameters jsonb,
  p_resolution_scope jsonb,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_oracle_policy_public_id uuid,
  p_country_code text,
  p_asset_code text,
  p_min_order_notional numeric default 100,
  p_pricing_precision smallint default 4
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  proposal market.proposals;
  template market.templates;
  oracle_policy oracle.policies;
  jurisdiction public.jurisdictions;
  asset public.assets;
  fingerprint text;
  event_id bigint;
  event_public_id uuid;
  instrument_id bigint;
  instrument_public_id uuid;
  existing boolean:=false;
  instrument_status text;
  v_resolution_scope jsonb;
  v_resolution_mode text;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then raise exception 'Market management permission required' using errcode='42501'; end if;
  select * into proposal from market.proposals where public_id=p_proposal_public_id for update;
  if proposal.id is null then raise exception 'Market proposal not found' using errcode='P0002'; end if;
  if proposal.status not in ('SUBMITTED','PROCESSING','UNDER_REVIEW','NEEDS_CLARIFICATION') then raise exception 'Proposal cannot be approved from its current state' using errcode='P0001'; end if;
  select * into template from market.templates where code=p_template_code and status='ACTIVE';
  if template.id is null then raise exception 'Active market template not found' using errcode='22023'; end if;
  select * into oracle_policy from oracle.policies where public_id=p_oracle_policy_public_id and status='ACTIVE' and effective_at<=statement_timestamp();
  if oracle_policy.id is null then raise exception 'An active oracle policy is required before market approval' using errcode='P0001'; end if;
  select * into jurisdiction from public.jurisdictions where country_code=upper(p_country_code) and status='ACTIVE';
  if jurisdiction.id is null then raise exception 'Jurisdiction is not active' using errcode='P0001'; end if;
  select a.* into asset from public.assets a join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.jurisdiction_id=jurisdiction.id where a.code=upper(p_asset_code) and a.status='ACTIVE' and ja.status='ACTIVE';
  if asset.id is null then raise exception 'Asset is not enabled for this jurisdiction' using errcode='P0001'; end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at<=p_opens_at or p_resolves_after<p_closes_at then raise exception 'Invalid market timing' using errcode='22023'; end if;

  v_resolution_scope:=private.derive_market_resolution_scope(proposal,p_title,p_category,p_resolves_after);
  v_resolution_mode:=case upper(coalesce(v_resolution_scope->>'resolver_type',''))
    when 'CRYPTO_PRICE_THRESHOLD_V1' then 'AUTOMATED'
    when 'FOOTBALL_MATCH_RESULT_V1' then 'AUTOMATED'
    else 'VAD_REVIEW'
  end;
  fingerprint:=command.compute_canonical_fingerprint(template.code,p_normalized_parameters,v_resolution_scope::text);
  select ce.id,ce.public_id into event_id,event_public_id from market.canonical_events ce where ce.canonical_fingerprint=fingerprint;
  if event_id is not null then
    existing:=true;
    update market.proposals set matched_canonical_event_id=event_id,canonicalization_decision='EXACT_DUPLICATE',status='MERGED',decision_reason='Merged into existing canonical event',updated_at=statement_timestamp() where id=proposal.id;
  else
    insert into market.canonical_events(template_id,title,description,category,canonical_fingerprint,normalized_parameters,resolution_scope,opens_at,closes_at,resolves_after,status,originator_user_id)
    values(template.id,btrim(p_title),p_description,upper(p_category),fingerprint,p_normalized_parameters,v_resolution_scope,p_opens_at,p_closes_at,p_resolves_after,case when p_opens_at>statement_timestamp() then 'SCHEDULED' else 'APPROVED' end,proposal.proposer_user_id)
    returning id,public_id into event_id,event_public_id;
    update market.proposals set proposed_template_id=template.id,matched_canonical_event_id=event_id,canonicalization_decision='DISTINCT_EVENT',status='APPROVED',normalized_payload=coalesce(normalized_payload,'{}'::jsonb)||jsonb_build_object('approved_parameters',p_normalized_parameters,'resolution_mode',v_resolution_mode),decision_reason='Approved as a new canonical event; VAD resolution path selected automatically; publication pending',updated_at=statement_timestamp() where id=proposal.id;
  end if;

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by)
  values(event_id,oracle_policy.id,auth.uid())
  on conflict on constraint event_policy_bindings_pkey do nothing;

  select i.id,i.public_id,i.status into instrument_id,instrument_public_id,instrument_status from market.instruments i where i.canonical_event_id=event_id and i.asset_id=asset.id;
  if instrument_id is null then
    insert into market.instruments(canonical_event_id,asset_id,market_type,liquidity_model,settlement_unit,pricing_precision,min_order_notional,status,opened_at,closed_at)
    values(event_id,asset.id,'BINARY','ORDER_BOOK',1,p_pricing_precision,p_min_order_notional,'DRAFT',null,p_closes_at)
    returning id,public_id,status into instrument_id,instrument_public_id,instrument_status;
    insert into market.outcomes(instrument_id,code,label,display_order) values(instrument_id,'YES','Yes',1),(instrument_id,'NO','No',2);
  end if;

  insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
  values('MARKET_APPROVED','CANONICAL_EVENT',event_public_id::text,jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'country_code',jurisdiction.country_code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','resolution_mode',v_resolution_mode),'market-approved:'||p_proposal_public_id::text)
  on conflict(idempotency_key) do nothing;
  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata)
  values(auth.uid(),'ADMIN','MARKET_PROPOSAL_APPROVED','CANONICAL_EVENT',event_public_id::text,'Approved market proposal; VAD selected the resolution path automatically; publication is a separate action',jsonb_build_object('proposal_id',p_proposal_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'canonical_fingerprint',fingerprint,'merged_existing',existing,'publication_required',instrument_status='DRAFT','resolution_mode',v_resolution_mode));
  return jsonb_build_object('event_id',event_public_id,'instrument_id',instrument_public_id,'asset_code',asset.code,'merged_existing',existing,'publication_required',instrument_status='DRAFT','instrument_status',instrument_status,'resolution_mode',v_resolution_mode,'resolution_scope',v_resolution_scope);
end;
$$;
