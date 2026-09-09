-- VAD Phase 2: internal transactional command layer.
-- PostgreSQL owns transactional market/finance invariants. Edge Functions remain
-- for external provider/webhook boundaries, AI/oracle calls, and orchestration.

create schema if not exists command;
revoke all on schema command from public, anon, authenticated;
grant usage on schema command to service_role;

alter default privileges in schema command
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema command
  grant execute on functions to service_role;

create or replace function private.require_active_account()
returns public.user_accounts
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  account public.user_accounts;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into account from public.user_accounts ua where ua.user_id = auth.uid();
  if account.user_id is null then
    raise exception 'Account context unavailable' using errcode = 'P0001';
  end if;
  if account.status <> 'ACTIVE' then
    raise exception 'Account is not active' using errcode = 'P0001';
  end if;
  return account;
end;
$$;
revoke all on function private.require_active_account() from public, anon;
grant execute on function private.require_active_account() to authenticated, service_role;

create or replace function private.capability_enabled(p_capability_key text, p_country_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select cr.enabled
    from public.capability_rules cr
    where cr.capability_key = p_capability_key
      and cr.country_code = p_country_code
      and cr.status = 'ACTIVE'
      and cr.effective_at <= statement_timestamp()
      and (cr.expires_at is null or cr.expires_at > statement_timestamp())
    order by cr.version desc
    limit 1
  ), false);
$$;
revoke all on function private.capability_enabled(text, text) from public, anon;
grant execute on function private.capability_enabled(text, text) to authenticated, service_role;

create or replace function finance.ensure_user_account(p_user_id uuid, p_asset_id bigint, p_account_type text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id bigint;
begin
  if p_account_type not in ('USER_AVAILABLE', 'USER_RESERVED', 'WITHDRAWAL_PENDING') then
    raise exception 'Unsupported user ledger account type %', p_account_type using errcode = '22023';
  end if;
  insert into finance.ledger_accounts(asset_id, account_type, owner_type, owner_reference)
  values (p_asset_id, p_account_type, 'USER', p_user_id::text)
  on conflict (asset_id, account_type, owner_type, owner_reference) do nothing;
  select la.id into account_id
  from finance.ledger_accounts la
  where la.asset_id = p_asset_id
    and la.account_type = p_account_type
    and la.owner_type = 'USER'
    and la.owner_reference = p_user_id::text;
  return account_id;
end;
$$;
revoke all on function finance.ensure_user_account(uuid, bigint, text) from public, anon, authenticated;
grant execute on function finance.ensure_user_account(uuid, bigint, text) to service_role;

create or replace function finance.account_balance(p_account_id bigint)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case le.direction when 'CREDIT' then le.amount else -le.amount end), 0)::numeric(38,18)
  from finance.ledger_entries le
  join finance.ledger_journals lj on lj.id = le.journal_id
  where le.account_id = p_account_id and lj.status = 'POSTED';
$$;
revoke all on function finance.account_balance(bigint) from public, anon, authenticated;
grant execute on function finance.account_balance(bigint) to service_role;

create or replace function finance.transfer(
  p_asset_id bigint,
  p_from_account_id bigint,
  p_to_account_id bigint,
  p_amount numeric,
  p_journal_type text,
  p_idempotency_key text,
  p_reference_type text,
  p_reference_id text,
  p_description text,
  p_created_by uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  journal_id bigint;
  from_asset bigint;
  to_asset bigint;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be positive' using errcode = '22023';
  end if;
  select asset_id into from_asset from finance.ledger_accounts where id = p_from_account_id;
  select asset_id into to_asset from finance.ledger_accounts where id = p_to_account_id;
  if from_asset is distinct from p_asset_id or to_asset is distinct from p_asset_id then
    raise exception 'Cross-asset transfers are forbidden' using errcode = '23514';
  end if;
  insert into finance.ledger_journals(
    asset_id, journal_type, idempotency_key, reference_type, reference_id, description, created_by
  ) values (
    p_asset_id, p_journal_type, p_idempotency_key, p_reference_type,
    p_reference_id, p_description, p_created_by
  ) on conflict (idempotency_key) do nothing
  returning id into journal_id;
  if journal_id is null then
    select id into journal_id from finance.ledger_journals where idempotency_key = p_idempotency_key;
    return journal_id;
  end if;
  insert into finance.ledger_entries(journal_id, account_id, sequence_number, direction, amount)
  values
    (journal_id, p_from_account_id, 1, 'DEBIT', p_amount),
    (journal_id, p_to_account_id, 2, 'CREDIT', p_amount);
  perform finance.post_ledger_journal(journal_id, 2);
  return journal_id;
end;
$$;
revoke all on function finance.transfer(bigint, bigint, bigint, numeric, text, text, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function finance.transfer(bigint, bigint, bigint, numeric, text, text, text, text, text, uuid)
  to service_role;

create or replace function public.submit_market_proposal(
  p_question text,
  p_context text default null,
  p_category text default null,
  p_confidence numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.user_accounts;
  proposal_id uuid;
  normalized jsonb;
begin
  account := private.require_active_account();
  if not private.capability_enabled('submit_market_proposal', account.country_code) then
    raise exception 'Market proposals are not currently enabled' using errcode = 'P0001';
  end if;
  if p_question is null or char_length(trim(p_question)) < 10 or char_length(trim(p_question)) > 500 then
    raise exception 'Question must be between 10 and 500 characters' using errcode = '22023';
  end if;
  if p_context is not null and char_length(p_context) > 5000 then
    raise exception 'Context is too long' using errcode = '22023';
  end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then
    raise exception 'Confidence must be between 0 and 1' using errcode = '22023';
  end if;
  normalized := jsonb_strip_nulls(jsonb_build_object(
    'submitted_category', nullif(trim(coalesce(p_category, '')), ''),
    'proposer_confidence', p_confidence
  ));
  insert into market.proposals(proposer_user_id, raw_question, raw_context, normalized_payload, status)
  values (
    auth.uid(), trim(p_question), nullif(trim(coalesce(p_context, '')), ''), normalized, 'SUBMITTED'
  ) returning public_id into proposal_id;
  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values (
    'MARKET_PROPOSED', 'MARKET_PROPOSAL', proposal_id::text,
    jsonb_build_object('proposal_id', proposal_id, 'proposer_user_id', auth.uid()),
    'market-proposal:' || proposal_id::text
  );
  return proposal_id;
end;
$$;
revoke all on function public.submit_market_proposal(text, text, text, numeric) from public, anon;
grant execute on function public.submit_market_proposal(text, text, text, numeric) to authenticated;

create or replace function command.compute_canonical_fingerprint(
  p_template_code text,
  p_normalized_parameters jsonb,
  p_resolution_scope text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(
      coalesce(p_template_code, '') || '|' ||
      coalesce(p_normalized_parameters, '{}'::jsonb)::text || '|' ||
      coalesce(p_resolution_scope, ''),
      'sha256'
    ), 'hex'
  );
$$;
revoke all on function command.compute_canonical_fingerprint(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function command.compute_canonical_fingerprint(text, jsonb, text) to service_role;

create sequence if not exists trading.order_sequence;
revoke all on sequence trading.order_sequence from public, anon, authenticated;
grant usage, select on sequence trading.order_sequence to service_role;

create or replace function command.reserve_for_order(
  p_user_id uuid,
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  instrument market.instruments;
  outcome market.outcomes;
  required_amount numeric(38,18);
  available_account bigint;
  reserved_account bigint;
  current_available numeric(38,18);
  order_public_id uuid;
  seq bigint;
begin
  if p_side not in ('BUY', 'SELL') then
    raise exception 'Unsupported order side' using errcode = '22023';
  end if;
  if p_price is null or p_price <= 0 then
    raise exception 'Price must be positive' using errcode = '22023';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be positive' using errcode = '22023';
  end if;
  select * into instrument from market.instruments where id = p_market_id for share;
  if instrument.id is null then
    raise exception 'Market not found' using errcode = 'P0002';
  end if;
  if instrument.status <> 'OPEN' then
    raise exception 'Market is not open' using errcode = 'P0001';
  end if;
  if instrument.opened_at is null or instrument.opened_at > statement_timestamp()
     or (instrument.closed_at is not null and instrument.closed_at <= statement_timestamp()) then
    raise exception 'Market is outside its trading window' using errcode = 'P0001';
  end if;
  if p_price >= instrument.settlement_unit then
    raise exception 'Price must be below the settlement unit' using errcode = '22023';
  end if;
  select * into outcome from market.outcomes
  where id = p_outcome_id and instrument_id = p_market_id;
  if outcome.id is null then
    raise exception 'Outcome not found for market' using errcode = 'P0002';
  end if;
  if p_side = 'SELL' then
    raise exception 'SELL orders are disabled until share reservation is active' using errcode = '0A000';
  end if;
  required_amount := round(p_price * p_quantity, 18);
  if required_amount < instrument.min_order_notional then
    raise exception 'Order is below the market minimum notional' using errcode = '22023';
  end if;
  select public_id into order_public_id
  from trading.orders
  where idempotency_key = p_idempotency_key and user_id = p_user_id;
  if order_public_id is not null then
    return order_public_id;
  end if;
  available_account := finance.ensure_user_account(p_user_id, instrument.asset_id, 'USER_AVAILABLE');
  reserved_account := finance.ensure_user_account(p_user_id, instrument.asset_id, 'USER_RESERVED');
  perform pg_advisory_xact_lock(hashtextextended(
    'vad-wallet:' || p_user_id::text || ':' || instrument.asset_id::text, 0
  ));
  current_available := finance.account_balance(available_account);
  if current_available < required_amount then
    raise exception 'Insufficient available balance' using errcode = 'P0001';
  end if;
  perform finance.transfer(
    instrument.asset_id, available_account, reserved_account, required_amount,
    'ORDER_RESERVE', 'reserve:' || p_idempotency_key, 'ORDER', p_idempotency_key,
    'Reserve funds for VAD limit order', p_user_id
  );
  seq := nextval('trading.order_sequence');
  insert into trading.orders(
    user_id, instrument_id, outcome_id, side, order_type,
    limit_price, quantity, filled_quantity, reserved_account_id,
    sequence_number, status, idempotency_key
  ) values (
    p_user_id, p_market_id, p_outcome_id, p_side, 'LIMIT',
    p_price, p_quantity, 0, reserved_account, seq, 'OPEN', p_idempotency_key
  ) returning public_id into order_public_id;
  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values (
    'ORDER_PLACED', 'ORDER', order_public_id::text,
    jsonb_build_object(
      'order_id', order_public_id,
      'instrument_id', p_market_id,
      'outcome_id', p_outcome_id,
      'user_id', p_user_id,
      'side', p_side,
      'price', p_price,
      'quantity', p_quantity
    ),
    'order-placed:' || order_public_id::text
  );
  return order_public_id;
end;
$$;
revoke all on function command.reserve_for_order(uuid, bigint, bigint, text, numeric, numeric, text)
  from public, anon, authenticated;
grant execute on function command.reserve_for_order(uuid, bigint, bigint, text, numeric, numeric, text)
  to service_role;

create or replace function public.place_order(
  p_market_id bigint,
  p_outcome_id bigint,
  p_side text,
  p_price numeric,
  p_quantity numeric,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.user_accounts;
begin
  account := private.require_active_account();
  if not private.capability_enabled('trade', account.country_code) then
    raise exception 'Trading is not currently enabled' using errcode = 'P0001';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  return command.reserve_for_order(
    auth.uid(), p_market_id, p_outcome_id, upper(p_side), p_price, p_quantity, p_idempotency_key
  );
end;
$$;
revoke all on function public.place_order(bigint, bigint, text, numeric, numeric, text) from public, anon;
grant execute on function public.place_order(bigint, bigint, text, numeric, numeric, text) to authenticated;

create or replace function public.cancel_order(p_order_public_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account public.user_accounts;
  ord trading.orders;
  instrument market.instruments;
  available_account bigint;
  releasable numeric(38,18);
begin
  account := private.require_active_account();
  select * into ord
  from trading.orders
  where public_id = p_order_public_id and user_id = auth.uid()
  for update;
  if ord.id is null then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if ord.status not in ('OPEN', 'PARTIALLY_FILLED') then
    raise exception 'Order cannot be cancelled from its current state' using errcode = 'P0001';
  end if;
  if ord.side <> 'BUY' then
    raise exception 'Unsupported cancellation path for this order side' using errcode = '0A000';
  end if;
  select * into instrument from market.instruments where id = ord.instrument_id;
  releasable := round(ord.limit_price * (ord.quantity - ord.filled_quantity), 18);
  if releasable > 0 then
    available_account := finance.ensure_user_account(auth.uid(), instrument.asset_id, 'USER_AVAILABLE');
    perform finance.transfer(
      instrument.asset_id, ord.reserved_account_id, available_account, releasable,
      'ORDER_RESERVATION_RELEASE', 'cancel:' || ord.public_id::text,
      'ORDER', ord.public_id::text, 'Release unused VAD order reservation', auth.uid()
    );
  end if;
  update trading.orders set status = 'CANCELLED', updated_at = statement_timestamp() where id = ord.id;
  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values (
    'ORDER_CANCELLED', 'ORDER', ord.public_id::text,
    jsonb_build_object('order_id', ord.public_id, 'user_id', auth.uid(), 'released_amount', releasable),
    'order-cancelled:' || ord.public_id::text
  ) on conflict (idempotency_key) do nothing;
  return true;
end;
$$;
revoke all on function public.cancel_order(uuid) from public, anon;
grant execute on function public.cancel_order(uuid) to authenticated;

create or replace function public.my_wallet_summary()
returns table(asset_code text, available numeric, reserved numeric, withdrawal_pending numeric)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_assets as (
    select distinct a.id, a.code
    from public.assets a
    join public.jurisdiction_assets ja on ja.asset_id = a.id
    join public.jurisdictions j on j.id = ja.jurisdiction_id
    join public.user_accounts ua on ua.country_code = j.country_code
    where ua.user_id = auth.uid()
      and a.status = 'ACTIVE'
      and ja.status = 'ACTIVE'
      and j.status = 'ACTIVE'
  )
  select ea.code,
    coalesce(sum(case when la.account_type = 'USER_AVAILABLE' then finance.account_balance(la.id) else 0 end), 0)::numeric,
    coalesce(sum(case when la.account_type = 'USER_RESERVED' then finance.account_balance(la.id) else 0 end), 0)::numeric,
    coalesce(sum(case when la.account_type = 'WITHDRAWAL_PENDING' then finance.account_balance(la.id) else 0 end), 0)::numeric
  from eligible_assets ea
  left join finance.ledger_accounts la
    on la.asset_id = ea.id
   and la.owner_type = 'USER'
   and la.owner_reference = auth.uid()::text
  group by ea.id, ea.code
  order by ea.code;
$$;
revoke all on function public.my_wallet_summary() from public, anon;
grant execute on function public.my_wallet_summary() to authenticated;

create or replace function public.my_open_orders()
returns table(
  order_id uuid,
  market_id bigint,
  outcome_id bigint,
  side text,
  limit_price numeric,
  quantity numeric,
  filled_quantity numeric,
  remaining_quantity numeric,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.public_id, o.instrument_id, o.outcome_id, o.side, o.limit_price,
         o.quantity, o.filled_quantity, (o.quantity - o.filled_quantity),
         o.status, o.created_at
  from trading.orders o
  where o.user_id = auth.uid()
    and o.status in ('OPEN', 'PARTIALLY_FILLED')
  order by o.sequence_number desc;
$$;
revoke all on function public.my_open_orders() from public, anon;
grant execute on function public.my_open_orders() to authenticated;
