-- VAD Phase 2: oracle maker/checker + canonical market activation runtime.
-- Admin actions are authenticated RPCs with server-side permission checks.

-- Replace blanket oracle-policy immutability with controlled draft -> active flow.
drop trigger if exists oracle_policies_immutable on oracle.policies;

alter table oracle.policies drop constraint if exists oracle_policy_dual_control;
alter table oracle.policies
  add constraint oracle_policy_dual_control
  check (
    (created_by is null and approved_by is null)
    or (created_by is not null and approved_by is null and status = 'DRAFT')
    or (created_by is not null and approved_by is not null and created_by <> approved_by)
  );

create or replace function oracle.guard_policy_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Oracle policies cannot be deleted' using errcode = '55000';
  end if;

  if old.status <> 'DRAFT' then
    raise exception 'Activated oracle policies are immutable' using errcode = '55000';
  end if;

  if new.status <> 'ACTIVE' then
    raise exception 'The only permitted oracle policy transition is DRAFT to ACTIVE'
      using errcode = '23514';
  end if;

  if new.approved_by is null or new.approved_by = old.created_by then
    raise exception 'A different authorized reviewer must approve the oracle policy'
      using errcode = '23514';
  end if;

  if row(
    new.id, new.public_id, new.name, new.capability_id, new.version,
    new.source_hierarchy, new.consensus_rule, new.close_rule,
    new.postponement_rule, new.cancellation_rule, new.void_rule,
    new.dispute_window_seconds, new.effective_at, new.created_by, new.created_at
  ) is distinct from row(
    old.id, old.public_id, old.name, old.capability_id, old.version,
    old.source_hierarchy, old.consensus_rule, old.close_rule,
    old.postponement_rule, old.cancellation_rule, old.void_rule,
    old.dispute_window_seconds, old.effective_at, old.created_by, old.created_at
  ) then
    raise exception 'Oracle policy facts cannot change during approval'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

revoke all on function oracle.guard_policy_mutation() from public, anon, authenticated;
create trigger oracle_policies_guard
before update or delete on oracle.policies
for each row execute function oracle.guard_policy_mutation();

create or replace function public.admin_create_oracle_policy_draft(
  p_name text,
  p_capability_code text,
  p_source_hierarchy jsonb,
  p_consensus_rule jsonb,
  p_close_rule jsonb,
  p_postponement_rule jsonb,
  p_cancellation_rule jsonb,
  p_void_rule jsonb,
  p_dispute_window_seconds integer,
  p_effective_at timestamptz default statement_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  capability_id bigint;
  next_version integer;
  policy_public_id uuid;
begin
  if auth.uid() is null or not private.has_permission('oracle.review') then
    raise exception 'Oracle review permission required' using errcode = '42501';
  end if;

  select id into capability_id
  from oracle.capabilities
  where code = p_capability_code;

  if capability_id is null then
    raise exception 'Unknown oracle capability' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from oracle.policies
  where name = trim(p_name);

  insert into oracle.policies(
    name, capability_id, version, source_hierarchy, consensus_rule,
    close_rule, postponement_rule, cancellation_rule, void_rule,
    dispute_window_seconds, status, effective_at, created_by
  ) values (
    trim(p_name), capability_id, next_version, p_source_hierarchy,
    p_consensus_rule, p_close_rule, p_postponement_rule,
    p_cancellation_rule, p_void_rule, p_dispute_window_seconds,
    'DRAFT', p_effective_at, auth.uid()
  ) returning public_id into policy_public_id;

  insert into audit.records(
    actor_user_id, actor_type, action, resource_type, resource_id,
    reason, metadata
  ) values (
    auth.uid(), 'ADMIN', 'ORACLE_POLICY_DRAFT_CREATED', 'ORACLE_POLICY',
    policy_public_id::text, 'Created oracle policy draft',
    jsonb_build_object('name', trim(p_name), 'version', next_version)
  );

  return policy_public_id;
end;
$$;
revoke all on function public.admin_create_oracle_policy_draft(
  text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer,timestamptz
) from public, anon;
grant execute on function public.admin_create_oracle_policy_draft(
  text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer,timestamptz
) to authenticated;

create or replace function public.admin_approve_oracle_policy(p_policy_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target oracle.policies;
begin
  if auth.uid() is null or not private.has_permission('oracle.review') then
    raise exception 'Oracle review permission required' using errcode = '42501';
  end if;

  select * into target
  from oracle.policies
  where public_id = p_policy_public_id
  for update;

  if target.id is null then
    raise exception 'Oracle policy not found' using errcode = 'P0002';
  end if;

  if target.status <> 'DRAFT' then
    raise exception 'Only draft oracle policies can be approved' using errcode = 'P0001';
  end if;

  if target.created_by = auth.uid() then
    raise exception 'A different reviewer must approve this oracle policy'
      using errcode = '42501';
  end if;

  update oracle.policies
  set status = 'ACTIVE', approved_by = auth.uid()
  where id = target.id;

  insert into audit.records(
    actor_user_id, actor_type, action, resource_type, resource_id,
    reason, metadata
  ) values (
    auth.uid(), 'ADMIN', 'ORACLE_POLICY_APPROVED', 'ORACLE_POLICY',
    target.public_id::text, 'Approved oracle policy',
    jsonb_build_object('name', target.name, 'version', target.version)
  );

  return true;
end;
$$;
revoke all on function public.admin_approve_oracle_policy(uuid) from public, anon;
grant execute on function public.admin_approve_oracle_policy(uuid) to authenticated;

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
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  existing boolean := false;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode = '42501';
  end if;

  select * into proposal
  from market.proposals
  where public_id = p_proposal_public_id
  for update;

  if proposal.id is null then
    raise exception 'Market proposal not found' using errcode = 'P0002';
  end if;

  if proposal.status not in ('SUBMITTED','PROCESSING','UNDER_REVIEW','NEEDS_CLARIFICATION') then
    raise exception 'Proposal cannot be approved from its current state' using errcode = 'P0001';
  end if;

  select * into template from market.templates
  where code = p_template_code and status = 'ACTIVE';
  if template.id is null then
    raise exception 'Active market template not found' using errcode = '22023';
  end if;

  select * into oracle_policy from oracle.policies
  where public_id = p_oracle_policy_public_id
    and status = 'ACTIVE'
    and effective_at <= statement_timestamp();
  if oracle_policy.id is null then
    raise exception 'An active oracle policy is required before market activation'
      using errcode = 'P0001';
  end if;

  select * into jurisdiction from public.jurisdictions
  where country_code = upper(p_country_code) and status = 'ACTIVE';
  if jurisdiction.id is null then
    raise exception 'Jurisdiction is not active' using errcode = 'P0001';
  end if;

  select a.* into asset
  from public.assets a
  join public.jurisdiction_assets ja
    on ja.asset_id = a.id and ja.jurisdiction_id = jurisdiction.id
  where a.code = upper(p_asset_code)
    and a.status = 'ACTIVE'
    and ja.status = 'ACTIVE';
  if asset.id is null then
    raise exception 'Asset is not enabled for this jurisdiction' using errcode = 'P0001';
  end if;

  if p_closes_at <= p_opens_at or p_resolves_after < p_closes_at then
    raise exception 'Invalid market timing' using errcode = '22023';
  end if;

  fingerprint := command.compute_canonical_fingerprint(
    template.code,
    p_normalized_parameters,
    p_resolution_scope::text
  );

  select ce.id, ce.public_id into event_id, event_public_id
  from market.canonical_events ce
  where ce.canonical_fingerprint = fingerprint;

  if event_id is not null then
    existing := true;
    update market.proposals
    set matched_canonical_event_id = event_id,
        canonicalization_decision = 'EXACT_DUPLICATE',
        status = 'MERGED',
        decision_reason = 'Merged into existing canonical event',
        updated_at = statement_timestamp()
    where id = proposal.id;
  else
    insert into market.canonical_events(
      template_id, title, description, category, canonical_fingerprint,
      normalized_parameters, resolution_scope, opens_at, closes_at,
      resolves_after, status, originator_user_id
    ) values (
      template.id, trim(p_title), p_description, upper(p_category), fingerprint,
      p_normalized_parameters, p_resolution_scope, p_opens_at, p_closes_at,
      p_resolves_after, 'APPROVED', proposal.proposer_user_id
    ) returning id, public_id into event_id, event_public_id;

    update market.proposals
    set proposed_template_id = template.id,
        matched_canonical_event_id = event_id,
        canonicalization_decision = 'DISTINCT_EVENT',
        status = 'APPROVED',
        normalized_payload = p_normalized_parameters,
        decision_reason = 'Approved as a new canonical event',
        updated_at = statement_timestamp()
    where id = proposal.id;
  end if;

  insert into oracle.event_policy_bindings(event_id, oracle_policy_id, bound_by)
  values(event_id, oracle_policy.id, auth.uid())
  on conflict(event_id) do nothing;

  select i.id, i.public_id into instrument_id, instrument_public_id
  from market.instruments i
  where i.canonical_event_id = event_id and i.asset_id = asset.id;

  if instrument_id is null then
    insert into market.instruments(
      canonical_event_id, asset_id, market_type, liquidity_model,
      settlement_unit, pricing_precision, min_order_notional,
      status, opened_at, closed_at
    ) values (
      event_id, asset.id, 'BINARY', 'ORDER_BOOK', 1,
      p_pricing_precision, p_min_order_notional,
      case when p_opens_at <= statement_timestamp() then 'OPEN' else 'DRAFT' end,
      p_opens_at,
      p_closes_at
    ) returning id, public_id into instrument_id, instrument_public_id;

    insert into market.outcomes(instrument_id, code, label, display_order)
    values
      (instrument_id, 'YES', 'Yes', 1),
      (instrument_id, 'NO', 'No', 2);
  end if;

  if p_opens_at <= statement_timestamp() then
    update market.canonical_events set status = 'OPEN', updated_at = statement_timestamp()
    where id = event_id and status in ('APPROVED','SCHEDULED');
  else
    update market.canonical_events set status = 'SCHEDULED', updated_at = statement_timestamp()
    where id = event_id and status = 'APPROVED';
  end if;

  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values(
    'MARKET_APPROVED', 'CANONICAL_EVENT', event_public_id::text,
    jsonb_build_object(
      'event_id', event_public_id,
      'instrument_id', instrument_public_id,
      'asset_code', asset.code,
      'country_code', jurisdiction.country_code,
      'merged_existing', existing
    ),
    'market-approved:' || p_proposal_public_id::text
  ) on conflict(idempotency_key) do nothing;

  insert into audit.records(
    actor_user_id, actor_type, action, resource_type, resource_id,
    reason, metadata
  ) values(
    auth.uid(), 'ADMIN', 'MARKET_PROPOSAL_APPROVED', 'CANONICAL_EVENT',
    event_public_id::text, 'Approved market proposal',
    jsonb_build_object(
      'proposal_id', p_proposal_public_id,
      'instrument_id', instrument_public_id,
      'asset_code', asset.code,
      'canonical_fingerprint', fingerprint,
      'merged_existing', existing
    )
  );

  return jsonb_build_object(
    'event_id', event_public_id,
    'instrument_id', instrument_public_id,
    'asset_code', asset.code,
    'merged_existing', existing
  );
end;
$$;
revoke all on function public.admin_approve_market_proposal(
  uuid,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,
  uuid,text,text,numeric,smallint
) from public, anon;
grant execute on function public.admin_approve_market_proposal(
  uuid,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,
  uuid,text,text,numeric,smallint
) to authenticated;

create or replace function public.market_detail(p_instrument_public_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'instrumentId', i.public_id,
    'eventId', ce.public_id,
    'title', ce.title,
    'description', ce.description,
    'category', ce.category,
    'status', i.status,
    'assetCode', a.code,
    'settlementUnit', i.settlement_unit,
    'minimumOrderNotional', i.min_order_notional,
    'opensAt', ce.opens_at,
    'closesAt', ce.closes_at,
    'resolvesAfter', ce.resolves_after,
    'resolutionScope', ce.resolution_scope,
    'outcomes', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'label', o.label,
        'displayOrder', o.display_order
      ) order by o.display_order), '[]'::jsonb)
      from market.outcomes o
      where o.instrument_id = i.id
    ),
    'oracle', jsonb_build_object(
      'policyId', op.public_id,
      'policyName', op.name,
      'policyVersion', op.version,
      'sourceHierarchy', op.source_hierarchy,
      'consensusRule', op.consensus_rule,
      'closeRule', op.close_rule,
      'postponementRule', op.postponement_rule,
      'cancellationRule', op.cancellation_rule,
      'voidRule', op.void_rule,
      'disputeWindowSeconds', op.dispute_window_seconds
    )
  )
  from market.instruments i
  join market.canonical_events ce on ce.id = i.canonical_event_id
  join public.assets a on a.id = i.asset_id
  join oracle.event_policy_bindings epb on epb.event_id = ce.id
  join oracle.policies op on op.id = epb.oracle_policy_id
  where i.public_id = p_instrument_public_id;
$$;
revoke all on function public.market_detail(uuid) from public;
grant execute on function public.market_detail(uuid) to anon, authenticated;
