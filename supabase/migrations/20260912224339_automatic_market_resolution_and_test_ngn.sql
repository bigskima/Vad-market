-- VAD derives resolution configuration. Admins approve market facts/timing; they do not author resolver JSON.
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
begin
  v_scope:=p_proposal.normalized_payload->'ai_admission'->'resolutionScope';
  if jsonb_typeof(v_scope) <> 'object' or v_scope='{}'::jsonb then
    v_scope:=jsonb_build_object(
      'resolver_type','VAD_REVIEW_V1',
      'condition',format('Resolve YES when authoritative evidence confirms the market proposition: %s',btrim(p_title)),
      'verification','VAD oracle review using approved authoritative evidence sources.',
      'category',v_category,
      'market_question',btrim(p_title),
      'resolution_time',p_resolves_after
    );
  else
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
  end if;
  return v_scope;
end;
$$;
revoke all on function private.derive_market_resolution_scope(market.proposals,text,text,timestamptz) from public,anon,authenticated;

create or replace function public.admin_approve_market_proposal(
  p_proposal_public_id uuid,
  p_template_code text,
  p_title text,
  p_description text,
  p_category text,
  p_normalized_parameters jsonb,
  p_resolution_scope jsonb,
  p_opens_at timestamp with time zone,
  p_closes_at timestamp with time zone,
  p_resolves_after timestamp with time zone,
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

  insert into oracle.event_policy_bindings(event_id,oracle_policy_id,bound_by) values(event_id,oracle_policy.id,auth.uid()) on conflict(event_id) do nothing;
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

-- Synthetic sandbox currency: separate asset, impossible to confuse with withdrawable NGN.
insert into public.assets(code,name,symbol,asset_type,minor_units,accounting_precision,display_precision,pricing_precision,status,metadata)
values('TNGN','Test NGN (Sandbox)','₦T','FIAT',2,8,2,6,'ACTIVE',jsonb_build_object('sandbox_only',true,'non_withdrawable',true,'test_credit_amount',100000,'description','Synthetic VAD testing currency; no real-world value'))
on conflict(code) do update set name=excluded.name,symbol=excluded.symbol,status='ACTIVE',metadata=excluded.metadata,updated_at=statement_timestamp();

insert into public.jurisdiction_assets(jurisdiction_id,asset_id,status)
select j.id,a.id,'ACTIVE' from public.jurisdictions j cross join public.assets a where j.country_code='NG' and j.status='ACTIVE' and a.code='TNGN'
on conflict(jurisdiction_id,asset_id) do update set status='ACTIVE';

create or replace function private.grant_test_ngn(p_user_id uuid,p_country_code text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_asset_id bigint;
  v_user_account bigint;
  v_treasury_account bigint;
begin
  if upper(coalesce(p_country_code,''))<>'NG' then return; end if;
  select id into v_asset_id from public.assets where code='TNGN' and status='ACTIVE';
  if v_asset_id is null then return; end if;
  v_user_account:=finance.ensure_user_account(p_user_id,v_asset_id,'USER_AVAILABLE');
  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
  values(v_asset_id,'TREASURY','PLATFORM','SANDBOX_TEST_NGN_ISSUER')
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
  select id into v_treasury_account from finance.ledger_accounts where asset_id=v_asset_id and account_type='TREASURY' and owner_type='PLATFORM' and owner_reference='SANDBOX_TEST_NGN_ISSUER';
  perform finance.transfer(v_asset_id,v_treasury_account,v_user_account,100000,'SANDBOX_TEST_CREDIT','sandbox-test-ngn:'||p_user_id::text,'USER',p_user_id::text,'100,000 Test NGN sandbox credit. Synthetic funds have no cash value and cannot be withdrawn.',null);
end;
$$;
revoke all on function private.grant_test_ngn(uuid,text) from public,anon,authenticated;

create or replace function private.grant_test_ngn_on_account()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  perform private.grant_test_ngn(new.user_id,new.country_code);
  return new;
end;
$$;
revoke all on function private.grant_test_ngn_on_account() from public,anon,authenticated;

drop trigger if exists trg_grant_test_ngn_on_account on public.user_accounts;
create trigger trg_grant_test_ngn_on_account after insert on public.user_accounts for each row execute function private.grant_test_ngn_on_account();

do $$ declare r record; begin
  for r in select user_id,country_code from public.user_accounts loop
    perform private.grant_test_ngn(r.user_id,r.country_code);
  end loop;
end $$;
