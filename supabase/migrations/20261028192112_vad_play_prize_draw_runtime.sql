-- VAD Play phase 2: wallet-funded prize-draw entries, escrow reconciliation,
-- dual-control draw execution, explicit refunds, and campaign settlement.
-- All money movements use the existing finance ledger. This migration does not
-- enable a game engine, publish an experience, open a campaign, or execute a draw.

begin;

-- Review permissions are assignable through VAD's existing role/permission controls.
insert into admin.permissions (code, description)
values
  ('play.review', 'Perform independent legal/compliance review of VAD Play campaigns'),
  ('play.prize.verify', 'Verify prize availability and evidence for VAD Play campaigns')
on conflict (code) do update set description = excluded.description;

-- Extend the canonical VAD ledger with campaign escrow and Play revenue accounts.
alter table finance.ledger_accounts
  drop constraint if exists ledger_accounts_account_type_check;
alter table finance.ledger_accounts
  add constraint ledger_accounts_account_type_check check (
    account_type = any (array[
      'USER_AVAILABLE','USER_RESERVED','MARKET_COLLATERAL','WITHDRAWAL_PENDING',
      'PROVIDER_CLEARING','PLATFORM_TRADING_FEE_REVENUE',
      'PLATFORM_SETTLEMENT_FEE_REVENUE','PLATFORM_WITHDRAWAL_REVENUE',
      'REFUND_PAYABLE','CREATOR_REWARD_PAYABLE','GROWTH_REWARD_BUDGET',
      'TREASURY','SUSPENSE','CHARGEBACK_RECEIVABLE',
      'PLAY_CAMPAIGN_ESCROW','PLATFORM_PLAY_REVENUE'
    ]::text[])
  );

alter table public.play_campaigns
  add column if not exists max_tickets_per_purchase integer not null default 20
    check (max_tickets_per_purchase > 0);

create table if not exists public.play_campaign_entry_orders (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.play_campaigns(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  ticket_count integer not null check (ticket_count > 0),
  currency_code text not null check (currency_code ~ '^[A-Z][A-Z0-9]{2,9}$'),
  unit_price_amount numeric(24,8) not null check (unit_price_amount > 0),
  total_amount numeric(24,8) not null check (total_amount > 0),
  status text not null default 'CREATED'
    check (status in ('CREATED','PAID','REFUNDED','FAILED')),
  idempotency_key text not null
    check (char_length(btrim(idempotency_key)) between 8 and 200),
  ledger_journal_id bigint references finance.ledger_journals(id) on delete restrict,
  refund_journal_id bigint references finance.ledger_journals(id) on delete restrict,
  refund_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refunded_at timestamptz,
  unique (user_id, idempotency_key),
  check ((status = 'REFUNDED') = (refunded_at is not null)),
  check ((status = 'PAID') = (ledger_journal_id is not null)),
  check ((status = 'REFUNDED') = (refund_journal_id is not null))
);

create index if not exists play_campaign_entry_orders_campaign_status_idx
  on public.play_campaign_entry_orders(campaign_id, status, created_at);
create index if not exists play_campaign_entry_orders_user_recent_idx
  on public.play_campaign_entry_orders(user_id, created_at desc);

create table if not exists public.play_tickets (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  ticket_code text not null unique
    check (ticket_code ~ '^[A-F0-9]{16}$'),
  campaign_id uuid not null references public.play_campaigns(id) on delete restrict,
  entry_order_id uuid not null references public.play_campaign_entry_orders(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','WINNER','REFUNDED','VOIDED')),
  created_at timestamptz not null default now(),
  unique (entry_order_id, id),
  check (status <> 'WINNER' or status = 'WINNER')
);

create index if not exists play_tickets_campaign_order_idx
  on public.play_tickets(campaign_id, id) where status in ('ACTIVE','WINNER');
create index if not exists play_tickets_user_recent_idx
  on public.play_tickets(user_id, created_at desc);
create index if not exists play_tickets_order_idx
  on public.play_tickets(entry_order_id, id);

create table if not exists public.play_campaign_reviews (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.play_campaigns(id) on delete restrict,
  review_type text not null check (review_type in ('LEGAL','PRIZE')),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  evidence_reference text not null
    check (char_length(btrim(evidence_reference)) between 3 and 500),
  notes text check (notes is null or char_length(notes) <= 2000),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists play_campaign_reviews_latest_idx
  on public.play_campaign_reviews(campaign_id, review_type, created_at desc, id desc);

create table if not exists public.play_campaign_draws (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.play_campaigns(id) on delete restrict,
  status text not null default 'AUTHORIZED'
    check (status in ('AUTHORIZED','DRAWN','VOIDED')),
  ticket_count_snapshot bigint not null check (ticket_count_snapshot > 0),
  entries_digest text not null check (entries_digest ~ '^[a-f0-9]{64}$'),
  seed_commitment text not null check (seed_commitment ~ '^[a-f0-9]{64}$'),
  seed_secret text not null check (seed_secret ~ '^[a-f0-9]{64}$'),
  seed_reveal text check (seed_reveal is null or seed_reveal ~ '^[a-f0-9]{64}$'),
  winning_ticket_id bigint references public.play_tickets(id) on delete restrict,
  authorized_by uuid not null references auth.users(id) on delete restrict,
  authorized_at timestamptz not null default now(),
  executed_by uuid references auth.users(id) on delete restrict,
  executed_at timestamptz,
  selection_counter bigint not null default 0 check (selection_counter >= 0),
  result_digest text check (result_digest is null or result_digest ~ '^[a-f0-9]{64}$'),
  voided_by uuid references auth.users(id) on delete restrict,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 5 and 500),
  created_at timestamptz not null default now(),
  check ((status = 'DRAWN') = (winning_ticket_id is not null)),
  check ((status in ('DRAWN','VOIDED')) = (seed_reveal is not null)),
  check ((status = 'DRAWN') = (executed_at is not null)),
  check (status <> 'DRAWN' or executed_by is not null),
  check (
    (status = 'VOIDED' and voided_by is not null and voided_at is not null and void_reason is not null)
    or
    (status <> 'VOIDED' and voided_by is null and voided_at is null and void_reason is null)
  )
);

create table if not exists public.play_campaign_settlements (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null unique references public.play_campaigns(id) on delete restrict,
  currency_code text not null check (currency_code ~ '^[A-Z][A-Z0-9]{2,9}$'),
  qualifying_funds_amount numeric(24,8) not null check (qualifying_funds_amount >= 0),
  prize_cost_recovered numeric(24,8) not null check (prize_cost_recovered > 0),
  campaign_costs_recovered numeric(24,8) not null check (campaign_costs_recovered >= 0),
  profit_target_amount numeric(24,8) not null check (profit_target_amount >= 0),
  excess_amount numeric(24,8) not null check (excess_amount >= 0),
  prize_journal_id bigint not null references finance.ledger_journals(id) on delete restrict,
  costs_journal_id bigint references finance.ledger_journals(id) on delete restrict,
  profit_journal_id bigint references finance.ledger_journals(id) on delete restrict,
  delivery_evidence_reference text not null
    check (char_length(btrim(delivery_evidence_reference)) between 3 and 500),
  settled_by uuid not null references auth.users(id) on delete restrict,
  settled_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists play_campaign_settlements_recent_idx
  on public.play_campaign_settlements(settled_at desc);

alter table public.play_campaign_entry_orders enable row level security;
alter table public.play_tickets enable row level security;
alter table public.play_campaign_reviews enable row level security;
alter table public.play_campaign_draws enable row level security;
alter table public.play_campaign_settlements enable row level security;

drop policy if exists play_entry_orders_read_own on public.play_campaign_entry_orders;
create policy play_entry_orders_read_own on public.play_campaign_entry_orders
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists play_tickets_read_own on public.play_tickets;
create policy play_tickets_read_own on public.play_tickets
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.play_campaign_entry_orders, public.play_tickets,
  public.play_campaign_reviews, public.play_campaign_draws,
  public.play_campaign_settlements from anon, authenticated;

grant select (
  id, campaign_id, user_id, ticket_count, currency_code, unit_price_amount,
  total_amount, status, idempotency_key, created_at, updated_at, refunded_at
) on public.play_campaign_entry_orders to authenticated;

grant select (
  id, public_id, ticket_code, campaign_id, entry_order_id, user_id, status, created_at
) on public.play_tickets to authenticated;

grant all on public.play_campaign_entry_orders, public.play_tickets,
  public.play_campaign_reviews, public.play_campaign_draws,
  public.play_campaign_settlements to service_role;

grant usage, select on sequence public.play_tickets_id_seq,
  public.play_campaign_reviews_id_seq to service_role;

grant select (max_tickets_per_purchase) on public.play_campaigns to authenticated;

create or replace function private.play_campaign_escrow_account(p_campaign_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_asset public.assets;
  v_account_id bigint;
begin
  select * into v_campaign
  from public.play_campaigns
  where id = p_campaign_id;
  if v_campaign.id is null then
    raise exception 'Play campaign not found' using errcode = 'P0002';
  end if;

  select * into v_asset
  from public.assets
  where code = upper(v_campaign.currency_code)
    and status = 'ACTIVE'
  limit 1;
  if v_asset.id is null then
    raise exception 'Campaign currency is not an active VAD asset' using errcode = '22023';
  end if;
  if coalesce((v_asset.metadata->>'sandbox_only')::boolean, false)
     or coalesce((v_asset.metadata->>'non_withdrawable')::boolean, false) then
    raise exception 'Sandbox or non-withdrawable assets cannot fund paid Play entries' using errcode = '42501';
  end if;

  insert into finance.ledger_accounts(asset_id, account_type, owner_type, owner_reference)
  values (
    v_asset.id,
    'PLAY_CAMPAIGN_ESCROW',
    'PLATFORM',
    'VAD_PLAY_CAMPAIGN:' || p_campaign_id::text
  )
  on conflict (asset_id, account_type, owner_type, owner_reference) do nothing;

  select id into v_account_id
  from finance.ledger_accounts
  where asset_id = v_asset.id
    and account_type = 'PLAY_CAMPAIGN_ESCROW'
    and owner_type = 'PLATFORM'
    and owner_reference = 'VAD_PLAY_CAMPAIGN:' || p_campaign_id::text
    and status = 'ACTIVE'
  for update;

  if v_account_id is null then
    raise exception 'Campaign escrow account is not active' using errcode = '55000';
  end if;
  return v_account_id;
end;
$$;

revoke all on function private.play_campaign_escrow_account(uuid) from public, anon, authenticated;

create or replace function private.play_reconcile_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_escrow_id bigint;
  v_balance numeric(38,18);
  v_status text;
begin
  select * into v_campaign
  from public.play_campaigns
  where id = p_campaign_id
  for update;
  if v_campaign.id is null then
    raise exception 'Play campaign not found' using errcode = 'P0002';
  end if;

  v_escrow_id := private.play_campaign_escrow_account(p_campaign_id);
  v_balance := finance.account_balance(v_escrow_id);

  if v_campaign.status not in ('OPEN','FUNDING_TARGET_MET','ENTRY_CLOSED','FUNDING_SHORTFALL','REFUNDING') then
    return jsonb_build_object(
      'campaignId', p_campaign_id,
      'status', v_campaign.status,
      'qualifyingFunds', v_campaign.qualifying_funds_amount,
      'fundingThreshold', v_campaign.funding_threshold_amount,
      'reconciled', false
    );
  end if;

  update public.play_campaigns
  set qualifying_funds_amount = greatest(v_balance, 0),
      funding_target_met_at = case
        when v_balance >= v_campaign.funding_threshold_amount
          then coalesce(v_campaign.funding_target_met_at, statement_timestamp())
        else v_campaign.funding_target_met_at
      end,
      status = case
        when v_campaign.status = 'OPEN' and v_balance >= v_campaign.funding_threshold_amount
          then 'FUNDING_TARGET_MET'
        else v_campaign.status
      end,
      funds_reconciled_at = case
        when v_campaign.status in ('ENTRY_CLOSED','FUNDING_SHORTFALL','REFUNDING')
          then statement_timestamp()
        else v_campaign.funds_reconciled_at
      end,
      updated_at = statement_timestamp()
  where id = p_campaign_id
  returning status into v_status;

  insert into public.play_game_audit_events(
    experience_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, 'SYSTEM', 'CAMPAIGN_FUNDS_RECONCILED',
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'ledger_escrow_balance', v_balance,
      'funding_threshold', v_campaign.funding_threshold_amount,
      'status', v_status
    )
  );

  return jsonb_build_object(
    'campaignId', p_campaign_id,
    'status', v_status,
    'qualifyingFunds', greatest(v_balance, 0),
    'fundingThreshold', v_campaign.funding_threshold_amount,
    'targetMet', v_balance >= v_campaign.funding_threshold_amount,
    'reconciled', true
  );
end;
$$;

revoke all on function private.play_reconcile_campaign(uuid) from public, anon, authenticated;

create or replace function public.play_buy_tickets(
  p_campaign_id uuid,
  p_ticket_count integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_account public.user_accounts;
  v_campaign public.play_campaigns;
  v_experience public.play_experiences;
  v_engine public.play_engine_registry;
  v_release public.play_engine_releases;
  v_asset public.assets;
  v_order public.play_campaign_entry_orders;
  v_available_id bigint;
  v_escrow_id bigint;
  v_journal_id bigint;
  v_current_balance numeric(38,18);
  v_total numeric(24,8);
  v_total_existing bigint;
  v_user_existing bigint;
  v_ticket_json jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in to enter a VAD Play campaign' using errcode = '28000';
  end if;
  v_account := private.require_active_account();

  if p_idempotency_key is null or char_length(btrim(p_idempotency_key)) < 8
     or char_length(btrim(p_idempotency_key)) > 200 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;
  if p_ticket_count is null or p_ticket_count <= 0 then
    raise exception 'Choose a positive number of tickets' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'vad-play-entry:' || v_user_id::text || ':' || btrim(p_idempotency_key), 0
  ));

  select * into v_order
  from public.play_campaign_entry_orders
  where user_id = v_user_id and idempotency_key = btrim(p_idempotency_key);

  if v_order.id is not null then
    if v_order.campaign_id <> p_campaign_id or v_order.ticket_count <> p_ticket_count then
      raise exception 'The idempotency key was already used for a different entry request' using errcode = '23505';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'ticketId', t.public_id,
      'ticketCode', t.ticket_code,
      'status', t.status
    ) order by t.id), '[]'::jsonb)
    into v_ticket_json
    from public.play_tickets t
    where t.entry_order_id = v_order.id;

    return jsonb_build_object(
      'entryOrderId', v_order.id,
      'campaignId', v_order.campaign_id,
      'status', v_order.status,
      'ticketCount', v_order.ticket_count,
      'totalAmount', v_order.total_amount,
      'currencyCode', v_order.currency_code,
      'tickets', v_ticket_json,
      'idempotentReplay', true
    );
  end if;

  select * into v_campaign
  from public.play_campaigns c
  where c.id = p_campaign_id
  for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status <> 'OPEN'
     or v_campaign.published_at is null
     or (v_campaign.opens_at is not null and v_campaign.opens_at > statement_timestamp())
     or (v_campaign.closes_at is not null and v_campaign.closes_at <= statement_timestamp()) then
    raise exception 'This campaign is not accepting entries right now' using errcode = 'P0001';
  end if;
  if v_campaign.compliance_approved_at is null or v_campaign.prize_secured_at is null then
    raise exception 'This campaign has not completed its required reviews' using errcode = '42501';
  end if;
  if p_ticket_count > v_campaign.max_tickets_per_purchase then
    raise exception 'The requested ticket count exceeds this campaign''s purchase limit' using errcode = '22023';
  end if;

  select * into v_experience
  from public.play_experiences
  where id = v_campaign.experience_id
    and status = 'PUBLISHED';
  if v_experience.id is null then
    raise exception 'The Play experience is not currently published' using errcode = 'P0001';
  end if;
  select * into v_engine
  from public.play_engine_registry
  where engine_key = v_experience.engine_key;
  select * into v_release
  from public.play_engine_releases
  where engine_key = v_experience.engine_key
  order by version desc
  limit 1;
  if v_engine.rollout_status is distinct from 'ENABLED'
     or v_release.rollout_status is distinct from 'ENABLED'
     or v_engine.runtime_ready is distinct from true then
    raise exception 'This game engine is not enabled for paid entries' using errcode = '42501';
  end if;

  select * into v_asset
  from public.assets
  where code = upper(v_campaign.currency_code) and status = 'ACTIVE'
  limit 1;
  if v_asset.id is null then
    raise exception 'Campaign currency is not available' using errcode = '22023';
  end if;
  if coalesce((v_asset.metadata->>'sandbox_only')::boolean, false)
     or coalesce((v_asset.metadata->>'non_withdrawable')::boolean, false) then
    raise exception 'Test or non-withdrawable balances cannot buy paid Play entries' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from public.jurisdictions j
    join public.jurisdiction_assets ja on ja.jurisdiction_id = j.id
    where j.country_code = v_account.country_code
      and j.status = 'ACTIVE'
      and ja.asset_id = v_asset.id
      and ja.status = 'ACTIVE'
  ) then
    raise exception 'This currency is not enabled for your jurisdiction' using errcode = '42501';
  end if;
  if v_asset.code = 'NGN'
     and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1), false) then
    raise exception 'Current location verification is required for NGN entries' using errcode = '42501';
  end if;
  if not private.kyc_access_satisfies(v_user_id, 'STANDARD', 'PRODUCTION') then
    raise exception 'Complete the required identity verification before purchasing paid entries' using errcode = '42501';
  end if;

  v_total := round(v_campaign.entry_price_amount * p_ticket_count, 8);
  if v_total <= 0 then
    raise exception 'Invalid entry amount' using errcode = '22023';
  end if;

  select count(*) into v_total_existing
  from public.play_tickets
  where campaign_id = p_campaign_id and status in ('ACTIVE','WINNER');
  if v_campaign.max_entries is null then
    raise exception 'The campaign must have a configured maximum entry count' using errcode = '23514';
  end if;
  if v_total_existing + p_ticket_count > v_campaign.max_entries then
    raise exception 'There are not enough entries remaining in this campaign' using errcode = '22023';
  end if;

  if v_campaign.entry_limit_per_user is not null then
    select count(*) into v_user_existing
    from public.play_tickets
    where campaign_id = p_campaign_id and user_id = v_user_id and status in ('ACTIVE','WINNER');
    if v_user_existing + p_ticket_count > v_campaign.entry_limit_per_user then
      raise exception 'This purchase would exceed your entry limit for this campaign' using errcode = '22023';
    end if;
  end if;

  v_available_id := finance.ensure_user_account(v_user_id, v_asset.id, 'USER_AVAILABLE');
  v_escrow_id := private.play_campaign_escrow_account(p_campaign_id);
  perform pg_advisory_xact_lock(hashtextextended(
    'vad-wallet:' || v_user_id::text || ':' || v_asset.id::text, 0
  ));
  v_current_balance := finance.account_balance(v_available_id);
  if v_current_balance < v_total then
    raise exception 'Insufficient available balance for these tickets' using errcode = 'P0001';
  end if;

  insert into public.play_campaign_entry_orders(
    campaign_id, user_id, ticket_count, currency_code,
    unit_price_amount, total_amount, status, idempotency_key
  ) values (
    p_campaign_id, v_user_id, p_ticket_count, v_campaign.currency_code,
    v_campaign.entry_price_amount, v_total, 'CREATED', btrim(p_idempotency_key)
  ) returning * into v_order;

  v_journal_id := finance.transfer(
    v_asset.id, v_available_id, v_escrow_id, v_total,
    'PLAY_ENTRY_PAYMENT',
    'play-entry:' || v_order.id::text,
    'PLAY_ENTRY_ORDER', v_order.id::text,
    'Payment for configured VAD Play prize-draw entries',
    v_user_id
  );

  insert into public.play_tickets(
    campaign_id, entry_order_id, user_id, ticket_code, status
  )
  select
    p_campaign_id, v_order.id, v_user_id,
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
    'ACTIVE'
  from generate_series(1, p_ticket_count);

  update public.play_campaign_entry_orders
  set status = 'PAID',
      ledger_journal_id = v_journal_id,
      updated_at = statement_timestamp()
  where id = v_order.id
  returning * into v_order;

  insert into public.play_participations(
    user_id, experience_id, campaign_id, activity_type, status,
    reference, amount, currency_code, public_summary, private_metadata
  ) values (
    v_user_id, v_campaign.experience_id, p_campaign_id, 'PRIZE_DRAW_ENTRY', 'CONFIRMED',
    v_order.id::text, v_total, v_campaign.currency_code,
    jsonb_build_object('campaignTitle', v_campaign.title, 'ticketCount', p_ticket_count),
    jsonb_build_object('ledgerJournalId', v_journal_id, 'ticketOrderId', v_order.id)
  );

  perform private.play_reconcile_campaign(p_campaign_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'ticketId', t.public_id,
    'ticketCode', t.ticket_code,
    'status', t.status
  ) order by t.id), '[]'::jsonb)
  into v_ticket_json
  from public.play_tickets t
  where t.entry_order_id = v_order.id;

  return jsonb_build_object(
    'entryOrderId', v_order.id,
    'campaignId', p_campaign_id,
    'status', v_order.status,
    'ticketCount', v_order.ticket_count,
    'totalAmount', v_order.total_amount,
    'currencyCode', v_order.currency_code,
    'tickets', v_ticket_json,
    'idempotentReplay', false
  );
end;
$$;

revoke all on function public.play_buy_tickets(uuid, integer, text) from public, anon;
grant execute on function public.play_buy_tickets(uuid, integer, text) to authenticated;

create or replace function public.admin_play_enable_prize_draw_runtime(p_runtime_evidence_reference text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_engine public.play_engine_registry;
  v_release public.play_engine_releases;
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'Only a Super Admin can enable the prize-draw runtime' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_runtime_evidence_reference,''))) < 6 then
    raise exception 'Record a test/build evidence reference before enabling the runtime' using errcode = '22023';
  end if;

  select * into v_engine from public.play_engine_registry where engine_key = 'PRIZE_DRAW' for update;
  select * into v_release from public.play_engine_releases where engine_key = 'PRIZE_DRAW' order by version desc limit 1 for update;
  if v_engine.engine_key is null or v_release.engine_key is null then
    raise exception 'Prize-draw engine registration is missing' using errcode = 'P0002';
  end if;

  update public.play_engine_registry
  set runtime_ready = true, rollout_status = 'ENABLED', updated_at = statement_timestamp()
  where engine_key = 'PRIZE_DRAW';
  update public.play_engine_releases
  set rollout_status = 'ENABLED', enabled_at = coalesce(enabled_at, statement_timestamp())
  where engine_key = 'PRIZE_DRAW' and version = v_release.version;

  insert into public.play_game_audit_events(
    actor_user_id, actor_type, event_type, event_data
  ) values (
    auth.uid(), 'ADMIN', 'PRIZE_DRAW_RUNTIME_ENABLED',
    jsonb_build_object('engine_key','PRIZE_DRAW','version',v_release.version,'evidence_reference',btrim(p_runtime_evidence_reference))
  );
  return true;
end;
$$;

create or replace function public.admin_play_publish_experience(
  p_experience_id uuid,
  p_legal_review_reference text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_experience public.play_experiences;
  v_engine public.play_engine_registry;
  v_release public.play_engine_releases;
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'Only a Super Admin can publish a VAD Play experience' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_legal_review_reference,''))) < 6 then
    raise exception 'A legal review evidence reference is required before publishing' using errcode = '22023';
  end if;
  select * into v_experience
  from public.play_experiences where id=p_experience_id for update;
  if v_experience.id is null then
    raise exception 'Experience not found' using errcode = 'P0002';
  end if;
  if v_experience.status not in ('DRAFT','COMPLIANCE_REVIEW') then
    raise exception 'Only a draft or compliance-review experience can be published' using errcode = '55000';
  end if;
  select * into v_engine from public.play_engine_registry where engine_key=v_experience.engine_key;
  select * into v_release from public.play_engine_releases
  where engine_key=v_experience.engine_key order by version desc limit 1;
  if v_engine.rollout_status is distinct from 'ENABLED'
    or v_engine.runtime_ready is distinct from true
    or v_release.rollout_status is distinct from 'ENABLED' then
    raise exception 'The selected engine release is not enabled and runtime-ready' using errcode = '42501';
  end if;
  if v_experience.engine_key <> 'PRIZE_DRAW' then
    raise exception 'Only the prize-draw experience has an implemented paid runtime in this release' using errcode = '42501';
  end if;

  update public.play_experiences
  set status='PUBLISHED', published_at=statement_timestamp(), updated_at=statement_timestamp()
  where id=p_experience_id
  returning * into v_experience;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_experience.id, auth.uid(), 'ADMIN', 'EXPERIENCE_PUBLISHED',
    jsonb_build_object('experience_id',v_experience.id,'engine_key',v_experience.engine_key,'legal_review_reference',btrim(p_legal_review_reference))
  );
  return v_experience.id;
end;
$$;

create or replace function public.admin_play_review_campaign(
  p_campaign_id uuid,
  p_review_type text,
  p_approved boolean,
  p_evidence_reference text,
  p_notes text default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_review_id bigint;
  v_type text := upper(trim(coalesce(p_review_type,'')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if v_type not in ('LEGAL','PRIZE') then
    raise exception 'Review type must be LEGAL or PRIZE' using errcode = '22023';
  end if;
  if v_type='LEGAL' and not (private.is_super_admin() or private.has_permission('play.review')) then
    raise exception 'Legal-review permission required' using errcode = '42501';
  end if;
  if v_type='PRIZE' and not (private.is_super_admin() or private.has_permission('play.prize.verify')) then
    raise exception 'Prize-verification permission required' using errcode = '42501';
  end if;
  if p_approved and char_length(btrim(coalesce(p_evidence_reference,''))) < 6 then
    raise exception 'An evidence reference is required for an approval' using errcode = '22023';
  end if;
  if not p_approved and char_length(btrim(coalesce(p_notes,''))) < 3 then
    raise exception 'Record why the review was rejected' using errcode = '22023';
  end if;

  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status not in ('DRAFT','COMPLIANCE_REVIEW') then
    raise exception 'Reviews must be completed before campaign opening' using errcode = '55000';
  end if;
  if v_campaign.created_by = auth.uid() then
    raise exception 'The campaign creator cannot approve its own campaign' using errcode = '42501';
  end if;

  insert into public.play_campaign_reviews(
    campaign_id, review_type, decision, evidence_reference, notes, reviewer_user_id
  ) values (
    p_campaign_id, v_type, case when p_approved then 'APPROVED' else 'REJECTED' end,
    case when p_approved then btrim(p_evidence_reference) else coalesce(nullif(btrim(p_evidence_reference),''),'not-provided') end,
    nullif(btrim(coalesce(p_notes,'')),''), auth.uid()
  ) returning id into v_review_id;

  update public.play_campaigns
  set status='COMPLIANCE_REVIEW',
      compliance_approved_at = case
        when v_type='LEGAL' then case when p_approved then statement_timestamp() else null end
        else compliance_approved_at end,
      prize_secured_at = case
        when v_type='PRIZE' then case when p_approved then statement_timestamp() else null end
        else prize_secured_at end,
      updated_at=statement_timestamp()
  where id=p_campaign_id;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_REVIEW_RECORDED',
    jsonb_build_object('campaign_id',p_campaign_id,'review_type',v_type,'decision',case when p_approved then 'APPROVED' else 'REJECTED' end,'evidence_reference',coalesce(p_evidence_reference,''))
  );
  return v_review_id;
end;
$$;

create or replace function public.admin_play_open_campaign(
  p_campaign_id uuid,
  p_closes_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_experience public.play_experiences;
  v_engine public.play_engine_registry;
  v_release public.play_engine_releases;
  v_latest_legal text;
  v_latest_prize text;
  v_latest_legal_reviewer uuid;
  v_latest_prize_reviewer uuid;
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'Only a Super Admin can open a paid prize campaign' using errcode = '42501';
  end if;
  if p_closes_at is null or p_closes_at <= statement_timestamp() then
    raise exception 'A future campaign closing time is required' using errcode = '22023';
  end if;

  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status not in ('DRAFT','COMPLIANCE_REVIEW') then
    raise exception 'Only a reviewed draft campaign can be opened' using errcode = '55000';
  end if;
  if v_campaign.max_entries is null or v_campaign.max_entries <= 0 then
    raise exception 'Configure a finite campaign-wide maximum entry count before opening' using errcode = '22023';
  end if;
  if v_campaign.max_tickets_per_purchase <= 0
     or v_campaign.max_tickets_per_purchase > v_campaign.max_entries then
    raise exception 'Configure a valid per-purchase ticket limit for this campaign' using errcode = '22023';
  end if;
  if length(btrim(coalesce(v_campaign.rules_public->>'terms',''))) < 20
     or length(btrim(coalesce(v_campaign.rules_public->>'refund_policy',''))) < 10 then
    raise exception 'Published terms and a clear refund/shortfall policy are required before opening' using errcode = '22023';
  end if;

  select decision, reviewer_user_id into v_latest_legal, v_latest_legal_reviewer
  from public.play_campaign_reviews
  where campaign_id=p_campaign_id and review_type='LEGAL'
  order by created_at desc,id desc limit 1;
  select decision, reviewer_user_id into v_latest_prize, v_latest_prize_reviewer
  from public.play_campaign_reviews
  where campaign_id=p_campaign_id and review_type='PRIZE'
  order by created_at desc,id desc limit 1;
  if v_latest_legal is distinct from 'APPROVED'
     or v_latest_prize is distinct from 'APPROVED'
     or v_campaign.compliance_approved_at is null
     or v_campaign.prize_secured_at is null then
    raise exception 'Current legal and prize reviews must both be approved before opening' using errcode = '42501';
  end if;
  if v_latest_legal_reviewer is null or v_latest_prize_reviewer is null
     or v_latest_legal_reviewer = v_latest_prize_reviewer then
    raise exception 'Legal review and prize verification must be completed by different reviewers' using errcode = '42501';
  end if;

  select * into v_experience from public.play_experiences
  where id=v_campaign.experience_id and status='PUBLISHED';
  if v_experience.id is null then
    raise exception 'Publish the experience before opening its campaign' using errcode = '55000';
  end if;
  select * into v_engine from public.play_engine_registry where engine_key=v_experience.engine_key;
  select * into v_release from public.play_engine_releases
  where engine_key=v_experience.engine_key order by version desc limit 1;
  if v_experience.engine_key <> 'PRIZE_DRAW'
     or v_engine.rollout_status is distinct from 'ENABLED'
     or v_engine.runtime_ready is distinct from true
     or v_release.rollout_status is distinct from 'ENABLED' then
    raise exception 'The prize-draw engine is not runtime-ready and enabled' using errcode = '42501';
  end if;

  update public.play_campaigns
  set status='OPEN',
      opens_at=statement_timestamp(),
      closes_at=p_closes_at,
      published_at=statement_timestamp(),
      updated_at=statement_timestamp()
  where id=p_campaign_id;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_OPENED',
    jsonb_build_object('campaign_id',p_campaign_id,'closes_at',p_closes_at,'funding_threshold',v_campaign.funding_threshold_amount,'currency_code',v_campaign.currency_code)
  );
  return p_campaign_id;
end;
$$;

create or replace function public.admin_play_close_entries(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_reconciliation jsonb;
  v_next_status text;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  v_reconciliation := private.play_reconcile_campaign(p_campaign_id);
  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.status = 'OPEN' then
    if v_campaign.closes_at is null or v_campaign.closes_at > statement_timestamp() then
      raise exception 'Entries can only be closed early after the funding threshold has been reached' using errcode = '55000';
    end if;
    update public.play_campaigns
    set status='FUNDING_SHORTFALL',
        entries_closed_at=coalesce(entries_closed_at,statement_timestamp()),
        funds_reconciled_at=statement_timestamp(),
        qualifying_funds_amount=greatest((v_reconciliation->>'qualifyingFunds')::numeric,0),
        updated_at=statement_timestamp()
    where id=p_campaign_id;
    v_next_status := 'FUNDING_SHORTFALL';
  elsif v_campaign.status = 'FUNDING_TARGET_MET' then
    v_next_status := case
      when v_campaign.qualifying_funds_amount >= v_campaign.funding_threshold_amount
       and v_campaign.funds_reconciled_at is not null
       and v_campaign.prize_secured_at is not null
       and v_campaign.compliance_approved_at is not null
        then 'DRAW_ELIGIBLE'
      else 'ENTRY_CLOSED'
    end;
    update public.play_campaigns
    set status=v_next_status,
        entries_closed_at=coalesce(entries_closed_at,statement_timestamp()),
        funds_reconciled_at=statement_timestamp(),
        updated_at=statement_timestamp()
    where id=p_campaign_id;
  elsif v_campaign.status = 'ENTRY_CLOSED' then
    v_next_status := case
      when v_campaign.qualifying_funds_amount >= v_campaign.funding_threshold_amount
       and v_campaign.funds_reconciled_at is not null
       and v_campaign.prize_secured_at is not null
       and v_campaign.compliance_approved_at is not null
        then 'DRAW_ELIGIBLE'
      else 'ENTRY_CLOSED'
    end;
    update public.play_campaigns set status=v_next_status, funds_reconciled_at=statement_timestamp(), updated_at=statement_timestamp()
    where id=p_campaign_id;
  else
    raise exception 'Campaign is not in a state that can close entries' using errcode = '55000';
  end if;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_ENTRIES_CLOSED',
    jsonb_build_object('campaign_id',p_campaign_id,'resulting_status',v_next_status)
  );

  return jsonb_build_object('campaignId',p_campaign_id,'status',v_next_status,'reconciliation',v_reconciliation);
end;
$$;

create or replace function public.admin_play_authorize_draw(p_campaign_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_existing public.play_campaign_draws;
  v_ticket record;
  v_count bigint := 0;
  v_digest text := repeat('0',64);
  v_seed text;
  v_commitment text;
  v_draw_id uuid;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status <> 'DRAW_ELIGIBLE'
     or v_campaign.entries_closed_at is null
     or v_campaign.funds_reconciled_at is null
     or v_campaign.qualifying_funds_amount < v_campaign.funding_threshold_amount
     or v_campaign.prize_secured_at is null
     or v_campaign.compliance_approved_at is null then
    raise exception 'Campaign has not satisfied all draw eligibility checks' using errcode = '42501';
  end if;
  if exists (select 1 from public.play_campaign_draws where campaign_id=p_campaign_id) then
    raise exception 'A draw record already exists for this campaign' using errcode = '23505';
  end if;

  for v_ticket in
    select public_id,ticket_code
    from public.play_tickets
    where campaign_id=p_campaign_id and status='ACTIVE'
    order by id
  loop
    v_digest := encode(extensions.digest(v_digest || ':' || v_ticket.public_id::text || ':' || v_ticket.ticket_code,'sha256'),'hex');
    v_count := v_count + 1;
  end loop;
  if v_count <= 0 then
    raise exception 'No eligible tickets are available for this draw' using errcode = '55000';
  end if;

  v_seed := encode(extensions.gen_random_bytes(32),'hex');
  v_commitment := encode(extensions.digest(v_seed,'sha256'),'hex');
  insert into public.play_campaign_draws(
    campaign_id,status,ticket_count_snapshot,entries_digest,seed_commitment,seed_secret,authorized_by
  ) values (
    p_campaign_id,'AUTHORIZED',v_count,v_digest,v_commitment,v_seed,auth.uid()
  ) returning id into v_draw_id;

  update public.play_campaigns
  set status='DRAW_AUTHORIZED', draw_authorized_at=statement_timestamp(), updated_at=statement_timestamp()
  where id=p_campaign_id;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'DRAW_AUTHORIZED',
    jsonb_build_object('campaign_id',p_campaign_id,'draw_id',v_draw_id,'ticket_count',v_count,'entries_digest',v_digest,'seed_commitment',v_commitment)
  );

  return v_draw_id;
end;
$$;

create or replace function public.admin_play_execute_draw(p_draw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.play_campaign_draws;
  v_campaign public.play_campaigns;
  v_ticket record;
  v_count bigint := 0;
  v_digest text := repeat('0',64);
  v_random_bytes bytea;
  v_random_value numeric;
  v_random_limit numeric;
  v_random_counter bigint := 0;
  v_slot bigint;
  v_winner public.play_tickets;
  v_result_digest text;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  select * into v_draw from public.play_campaign_draws where id=p_draw_id for update;
  if v_draw.id is null then
    raise exception 'Authorized draw not found' using errcode = 'P0002';
  end if;
  if v_draw.status <> 'AUTHORIZED' then
    raise exception 'This draw is not awaiting execution' using errcode = '55000';
  end if;
  if v_draw.authorized_by = auth.uid() then
    raise exception 'Draw authorization and execution require two different administrators' using errcode = '42501';
  end if;

  select * into v_campaign from public.play_campaigns where id=v_draw.campaign_id for update;
  if v_campaign.status <> 'DRAW_AUTHORIZED' then
    raise exception 'Campaign is not in authorized-draw state' using errcode = '55000';
  end if;

  for v_ticket in
    select public_id,ticket_code
    from public.play_tickets
    where campaign_id=v_draw.campaign_id and status='ACTIVE'
    order by id
  loop
    v_digest := encode(extensions.digest(v_digest || ':' || v_ticket.public_id::text || ':' || v_ticket.ticket_code,'sha256'),'hex');
    v_count := v_count + 1;
  end loop;
  if v_count <> v_draw.ticket_count_snapshot or v_digest <> v_draw.entries_digest then
    raise exception 'The eligible ticket set changed after draw authorization' using errcode = '23514';
  end if;

  -- Rejection sampling avoids modulo bias when mapping a 64-bit digest to a ticket.
  v_random_limit := floor(18446744073709551616::numeric / v_count) * v_count;
  loop
    v_random_bytes := extensions.digest(
      decode(v_draw.seed_secret,'hex')
        || decode(v_draw.entries_digest,'hex')
        || convert_to(':' || v_random_counter::text,'UTF8'),
      'sha256'
    );
    v_random_value :=
        get_byte(v_random_bytes,0)::numeric * 72057594037927936
      + get_byte(v_random_bytes,1)::numeric * 281474976710656
      + get_byte(v_random_bytes,2)::numeric * 1099511627776
      + get_byte(v_random_bytes,3)::numeric * 4294967296
      + get_byte(v_random_bytes,4)::numeric * 16777216
      + get_byte(v_random_bytes,5)::numeric * 65536
      + get_byte(v_random_bytes,6)::numeric * 256
      + get_byte(v_random_bytes,7)::numeric;
    exit when v_random_value < v_random_limit;
    v_random_counter := v_random_counter + 1;
    if v_random_counter > 1000 then
      raise exception 'Deterministic winner selection could not produce an unbiased index' using errcode = '55000';
    end if;
  end loop;
  v_slot := mod(v_random_value, v_count)::bigint + 1;

  select * into v_winner
  from public.play_tickets
  where campaign_id=v_draw.campaign_id and status='ACTIVE'
  order by id
  offset (v_slot - 1)
  limit 1
  for update;
  if v_winner.id is null then
    raise exception 'Winner selection failed; no draw result was recorded' using errcode = '55000';
  end if;

  update public.play_tickets set status='WINNER' where id=v_winner.id;
  v_result_digest := encode(extensions.digest(
    v_draw.seed_secret || ':' || v_draw.entries_digest || ':' ||
    v_winner.public_id::text || ':' || v_slot::text || ':' || v_random_counter::text,
    'sha256'
  ),'hex');

  update public.play_campaign_draws
  set status='DRAWN',
      seed_reveal=seed_secret,
      winning_ticket_id=v_winner.id,
      executed_by=auth.uid(),
      executed_at=statement_timestamp(),
      selection_counter=v_random_counter,
      result_digest=v_result_digest
  where id=v_draw.id;

  update public.play_campaigns
  set status='DRAWN', drawn_at=statement_timestamp(), updated_at=statement_timestamp()
  where id=v_campaign.id;

  insert into public.play_participations(
    user_id,experience_id,campaign_id,activity_type,status,reference,currency_code,public_summary,private_metadata
  ) values (
    v_winner.user_id,v_campaign.experience_id,v_campaign.id,'PRIZE_DRAW_WIN','COMPLETED',
    v_winner.public_id::text,v_campaign.currency_code,
    jsonb_build_object('campaignTitle',v_campaign.title,'prizeTitle',v_campaign.prize_title,'ticketCode',v_winner.ticket_code),
    jsonb_build_object('drawId',v_draw.id,'resultDigest',v_result_digest)
  );

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'DRAW_EXECUTED',
    jsonb_build_object(
      'campaign_id',v_campaign.id,'draw_id',v_draw.id,
      'winning_ticket_id',v_winner.public_id,'winning_ticket_code',v_winner.ticket_code,
      'ticket_count',v_count,'entries_digest',v_digest,'seed_commitment',v_draw.seed_commitment,
      'seed_reveal',v_draw.seed_secret,'result_digest',v_result_digest,'slot',v_slot,
      'selection_counter',v_random_counter
    )
  );

  return jsonb_build_object(
    'campaignId',v_campaign.id,'drawId',v_draw.id,'status','DRAWN',
    'winningTicketId',v_winner.public_id,'winningTicketCode',v_winner.ticket_code,
    'ticketCount',v_count,'seedCommitment',v_draw.seed_commitment,'seedReveal',v_draw.seed_secret,
    'entriesDigest',v_digest,'resultDigest',v_result_digest,'selectionCounter',v_random_counter,
    'algorithm','SHA-256 seed commitment + ordered ticket-chain digest + rejection-sampled SHA-256 index',
    'executedAt',statement_timestamp()
  );
end;
$$;

create or replace function public.admin_play_void_authorized_draw(
  p_draw_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.play_campaign_draws;
  v_campaign public.play_campaigns;
  v_escrow_id bigint;
  v_balance numeric(38,18);
  v_next_status text;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'A clear draw-void reason is required' using errcode = '22023';
  end if;

  select * into v_draw
  from public.play_campaign_draws
  where id = p_draw_id
  for update;
  if v_draw.id is null then
    raise exception 'Draw record not found' using errcode = 'P0002';
  end if;
  if v_draw.status <> 'AUTHORIZED' then
    raise exception 'Only an authorized draw that has not executed can be voided' using errcode = '55000';
  end if;
  if v_draw.authorized_by = auth.uid() then
    raise exception 'A different administrator must void the authorized draw' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.play_campaigns
  where id = v_draw.campaign_id
  for update;
  if v_campaign.status <> 'DRAW_AUTHORIZED' then
    raise exception 'Campaign is not awaiting this authorized draw' using errcode = '55000';
  end if;

  v_escrow_id := private.play_campaign_escrow_account(v_campaign.id);
  v_balance := finance.account_balance(v_escrow_id);
  v_next_status := case
    when v_balance >= v_campaign.funding_threshold_amount then 'ENTRY_CLOSED'
    else 'FUNDING_SHORTFALL'
  end;

  update public.play_campaign_draws
  set status = 'VOIDED',
      seed_reveal = seed_secret,
      voided_by = auth.uid(),
      voided_at = statement_timestamp(),
      void_reason = left(btrim(p_reason), 500)
  where id = v_draw.id;

  update public.play_campaigns
  set status = v_next_status,
      qualifying_funds_amount = greatest(v_balance, 0),
      entries_closed_at = coalesce(entries_closed_at, statement_timestamp()),
      funds_reconciled_at = statement_timestamp(),
      updated_at = statement_timestamp()
  where id = v_campaign.id;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'AUTHORIZED_DRAW_VOIDED',
    jsonb_build_object(
      'campaign_id', v_campaign.id,
      'draw_id', v_draw.id,
      'authorizer', v_draw.authorized_by,
      'voided_by', auth.uid(),
      'reason', left(btrim(p_reason), 500),
      'seed_commitment', v_draw.seed_commitment,
      'seed_reveal', v_draw.seed_secret,
      'entries_digest', v_draw.entries_digest,
      'ticket_count_snapshot', v_draw.ticket_count_snapshot
    )
  );

  return jsonb_build_object(
    'drawId', v_draw.id,
    'campaignId', v_campaign.id,
    'status', 'VOIDED',
    'campaignStatus', v_next_status,
    'seedCommitment', v_draw.seed_commitment,
    'seedReveal', v_draw.seed_secret,
    'reason', left(btrim(p_reason), 500)
  );
end;
$$;

create or replace function public.admin_play_start_refunds(p_campaign_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_campaign public.play_campaigns;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 5 then
    raise exception 'A clear refund/cancellation reason is required' using errcode = '22023';
  end if;

  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status in ('DRAW_AUTHORIZED','DRAWN','SETTLED','CANCELLED') then
    raise exception 'A campaign with an authorized or completed draw cannot enter the pre-draw refund flow' using errcode = '55000';
  end if;
  if v_campaign.status not in ('OPEN','FUNDING_TARGET_MET','FUNDING_SHORTFALL','ENTRY_CLOSED','DRAW_ELIGIBLE') then
    raise exception 'Campaign is not in a refundable state' using errcode = '55000';
  end if;

  update public.play_campaigns
  set status='REFUNDING',
      entries_closed_at=coalesce(entries_closed_at,statement_timestamp()),
      updated_at=statement_timestamp()
  where id=p_campaign_id;

  insert into public.play_game_audit_events(
    experience_id,actor_user_id,actor_type,event_type,event_data
  ) values (
    v_campaign.experience_id,auth.uid(),'ADMIN','CAMPAIGN_REFUNDS_STARTED',
    jsonb_build_object('campaign_id',p_campaign_id,'reason',btrim(p_reason))
  );
  return true;
end;
$$;

create or replace function public.admin_play_refund_entry_order(p_entry_order_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.play_campaign_entry_orders;
  v_campaign public.play_campaigns;
  v_asset public.assets;
  v_user_available_id bigint;
  v_escrow_id bigint;
  v_balance numeric(38,18);
  v_journal_id bigint;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then
    raise exception 'A refund reason is required' using errcode = '22023';
  end if;

  select * into v_order from public.play_campaign_entry_orders where id=p_entry_order_id for update;
  if v_order.id is null then
    raise exception 'Entry order not found' using errcode = 'P0002';
  end if;
  if v_order.status='REFUNDED' then
    return jsonb_build_object('entryOrderId',v_order.id,'status','REFUNDED','alreadyRefunded',true);
  end if;
  if v_order.status <> 'PAID' then
    raise exception 'Only paid entry orders can be refunded' using errcode = '55000';
  end if;

  select * into v_campaign from public.play_campaigns where id=v_order.campaign_id for update;
  if v_campaign.status <> 'REFUNDING' then
    raise exception 'Start the campaign refund process before refunding individual orders' using errcode = '55000';
  end if;
  if exists (select 1 from public.play_campaign_draws where campaign_id=v_campaign.id and status in ('AUTHORIZED','DRAWN')) then
    raise exception 'A draw already exists; this order cannot use the pre-draw refund path' using errcode = '55000';
  end if;

  select * into v_asset from public.assets where code=v_order.currency_code and status='ACTIVE' limit 1;
  if v_asset.id is null then
    raise exception 'The entry currency is no longer active' using errcode = '55000';
  end if;
  v_user_available_id := finance.ensure_user_account(v_order.user_id,v_asset.id,'USER_AVAILABLE');
  v_escrow_id := private.play_campaign_escrow_account(v_order.campaign_id);
  perform pg_advisory_xact_lock(hashtextextended('vad-play-refund:'||v_order.id::text,0));
  v_balance := finance.account_balance(v_escrow_id);
  if v_balance < v_order.total_amount then
    raise exception 'Campaign escrow is insufficient to complete this refund; investigate reconciliation before retrying' using errcode = '23514';
  end if;

  v_journal_id := finance.transfer(
    v_asset.id,v_escrow_id,v_user_available_id,v_order.total_amount,
    'PLAY_ENTRY_REFUND','play-entry-refund:'||v_order.id::text,
    'PLAY_ENTRY_ORDER',v_order.id::text,
    'Refund for VAD Play campaign entry: '||left(btrim(p_reason),350),
    auth.uid()
  );

  update public.play_campaign_entry_orders
  set status='REFUNDED',refund_journal_id=v_journal_id,refund_reason=left(btrim(p_reason),500),
      refunded_at=statement_timestamp(),updated_at=statement_timestamp()
  where id=v_order.id;

  update public.play_tickets set status='REFUNDED' where entry_order_id=v_order.id and status='ACTIVE';
  update public.play_participations
  set status='REFUNDED',public_summary=public_summary||jsonb_build_object('refundReason',left(btrim(p_reason),300))
  where reference=v_order.id::text and activity_type='PRIZE_DRAW_ENTRY';

  perform private.play_reconcile_campaign(v_campaign.id);

  insert into public.play_game_audit_events(
    experience_id,actor_user_id,actor_type,event_type,event_data
  ) values (
    v_campaign.experience_id,auth.uid(),'ADMIN','CAMPAIGN_ENTRY_REFUNDED',
    jsonb_build_object('campaign_id',v_campaign.id,'entry_order_id',v_order.id,'amount',v_order.total_amount,'currency_code',v_order.currency_code,'ledger_journal_id',v_journal_id,'reason',left(btrim(p_reason),300))
  );

  return jsonb_build_object('entryOrderId',v_order.id,'status','REFUNDED','amount',v_order.total_amount,'currencyCode',v_order.currency_code,'ledgerJournalId',v_journal_id);
end;
$$;

create or replace function public.admin_play_finish_refunds(p_campaign_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_escrow_id bigint;
  v_balance numeric(38,18);
  v_unfinished bigint;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.id is null or v_campaign.status <> 'REFUNDING' then
    raise exception 'Campaign is not in the refunding state' using errcode = '55000';
  end if;

  select count(*) into v_unfinished
  from public.play_campaign_entry_orders
  where campaign_id=p_campaign_id and status='PAID';
  v_escrow_id := private.play_campaign_escrow_account(p_campaign_id);
  v_balance := finance.account_balance(v_escrow_id);
  if v_unfinished <> 0 or abs(v_balance) > 0.00000001 then
    raise exception 'All paid entry orders must be refunded and campaign escrow reconciled to zero' using errcode = '23514';
  end if;

  update public.play_campaigns
  set status='CANCELLED',qualifying_funds_amount=0,updated_at=statement_timestamp()
  where id=p_campaign_id;
  insert into public.play_game_audit_events(
    experience_id,actor_user_id,actor_type,event_type,event_data
  ) values (
    v_campaign.experience_id,auth.uid(),'ADMIN','CAMPAIGN_REFUNDS_COMPLETED',
    jsonb_build_object('campaign_id',p_campaign_id,'refunded_orders',true,'escrow_balance',v_balance)
  );
  return true;
end;
$$;

create or replace function public.admin_play_confirm_prize_delivery(
  p_campaign_id uuid,
  p_delivery_evidence_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.play_campaigns;
  v_draw public.play_campaign_draws;
  v_asset public.assets;
  v_escrow_id bigint;
  v_treasury_id bigint;
  v_revenue_id bigint;
  v_balance numeric(38,18);
  v_profit_target numeric(24,8);
  v_excess numeric(24,8);
  v_prize_journal_id bigint;
  v_costs_journal_id bigint;
  v_profit_journal_id bigint;
  v_settlement_id uuid;
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'Only a Super Admin can confirm prize delivery and settle a prize campaign' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_delivery_evidence_reference,''))) < 6 then
    raise exception 'A prize-delivery evidence reference is required' using errcode = '22023';
  end if;

  select * into v_campaign from public.play_campaigns where id=p_campaign_id for update;
  if v_campaign.id is null or v_campaign.status <> 'DRAWN' then
    raise exception 'Only a campaign with a recorded draw can settle' using errcode = '55000';
  end if;
  select * into v_draw from public.play_campaign_draws
  where campaign_id=p_campaign_id and status='DRAWN';
  if v_draw.id is null or v_draw.winning_ticket_id is null then
    raise exception 'A recorded winner is required before settlement' using errcode = '55000';
  end if;
  if exists (select 1 from public.play_campaign_settlements where campaign_id=p_campaign_id) then
    raise exception 'This campaign has already been settled' using errcode = '23505';
  end if;

  select * into v_asset from public.assets where code=v_campaign.currency_code and status='ACTIVE' limit 1;
  if v_asset.id is null then
    raise exception 'The campaign currency is no longer active' using errcode = '55000';
  end if;

  v_escrow_id := private.play_campaign_escrow_account(p_campaign_id);
  v_treasury_id := finance.ensure_platform_account(v_asset.id,'TREASURY');
  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference)
  values(v_asset.id,'PLATFORM_PLAY_REVENUE','PLATFORM','VAD')
  on conflict (asset_id,account_type,owner_type,owner_reference) do nothing;
  select id into v_revenue_id from finance.ledger_accounts
  where asset_id=v_asset.id and account_type='PLATFORM_PLAY_REVENUE'
    and owner_type='PLATFORM' and owner_reference='VAD' and status='ACTIVE'
  for update;
  if v_revenue_id is null then
    raise exception 'VAD Play revenue account is unavailable' using errcode = '55000';
  end if;

  v_balance := finance.account_balance(v_escrow_id);
  if v_balance < v_campaign.funding_threshold_amount
     or v_balance < v_campaign.prize_cost_amount + v_campaign.campaign_cost_budget_amount then
    raise exception 'Campaign escrow does not cover the reconciled threshold and configured recoveries' using errcode = '23514';
  end if;

  v_profit_target := case
    when v_campaign.profit_target_mode='PERCENT_OF_PRIZE'
      then round(v_campaign.prize_cost_amount*v_campaign.profit_target_value/100,8)
    else v_campaign.profit_target_value
  end;
  v_excess := greatest(round(v_balance-v_campaign.funding_threshold_amount,8),0);

  v_prize_journal_id := finance.transfer(
    v_asset.id,v_escrow_id,v_treasury_id,v_campaign.prize_cost_amount,
    'PLAY_PRIZE_COST_RECOVERY','play-settle:'||p_campaign_id::text||':prize',
    'PLAY_CAMPAIGN',p_campaign_id::text,'Recover prize procurement cost for settled VAD Play campaign',auth.uid()
  );

  if v_campaign.campaign_cost_budget_amount > 0 then
    v_costs_journal_id := finance.transfer(
      v_asset.id,v_escrow_id,v_treasury_id,v_campaign.campaign_cost_budget_amount,
      'PLAY_CAMPAIGN_COST_RECOVERY','play-settle:'||p_campaign_id::text||':costs',
      'PLAY_CAMPAIGN',p_campaign_id::text,'Recover configured campaign operating costs',auth.uid()
    );
  end if;

  if v_profit_target + v_excess > 0 then
    v_profit_journal_id := finance.transfer(
      v_asset.id,v_escrow_id,v_revenue_id,v_profit_target+v_excess,
      'PLAY_CAMPAIGN_PROFIT','play-settle:'||p_campaign_id::text||':profit',
      'PLAY_CAMPAIGN',p_campaign_id::text,'Record configured VAD Play campaign profit plus any disclosed collection excess',auth.uid()
    );
  end if;

  insert into public.play_campaign_settlements(
    campaign_id,currency_code,qualifying_funds_amount,prize_cost_recovered,
    campaign_costs_recovered,profit_target_amount,excess_amount,
    prize_journal_id,costs_journal_id,profit_journal_id,
    delivery_evidence_reference,settled_by
  ) values (
    p_campaign_id,v_campaign.currency_code,round(v_balance,8),v_campaign.prize_cost_amount,
    v_campaign.campaign_cost_budget_amount,v_profit_target,v_excess,
    v_prize_journal_id,v_costs_journal_id,v_profit_journal_id,
    btrim(p_delivery_evidence_reference),auth.uid()
  ) returning id into v_settlement_id;

  update public.play_campaigns
  set status='SETTLED',prize_delivered_at=statement_timestamp(),updated_at=statement_timestamp()
  where id=p_campaign_id;

  insert into public.play_game_audit_events(
    experience_id,actor_user_id,actor_type,event_type,event_data
  ) values (
    v_campaign.experience_id,auth.uid(),'ADMIN','CAMPAIGN_SETTLED',
    jsonb_build_object(
      'campaign_id',p_campaign_id,'settlement_id',v_settlement_id,
      'currency_code',v_campaign.currency_code,'qualifying_funds',round(v_balance,8),
      'prize_recovery',v_campaign.prize_cost_amount,
      'campaign_cost_recovery',v_campaign.campaign_cost_budget_amount,
      'profit_target',v_profit_target,'excess',v_excess,
      'delivery_evidence_reference',btrim(p_delivery_evidence_reference)
    )
  );

  return jsonb_build_object(
    'campaignId',p_campaign_id,'settlementId',v_settlement_id,'status','SETTLED',
    'currencyCode',v_campaign.currency_code,'qualifyingFunds',round(v_balance,8),
    'prizeCostRecovered',v_campaign.prize_cost_amount,
    'campaignCostsRecovered',v_campaign.campaign_cost_budget_amount,
    'profitTarget',v_profit_target,'excess',v_excess,
    'prizeJournalId',v_prize_journal_id,'costsJournalId',v_costs_journal_id,
    'profitJournalId',v_profit_journal_id
  );
end;
$$;

create or replace function public.play_draw_audit(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.play_campaign_draws;
  v_campaign public.play_campaigns;
  v_winner public.play_tickets;
begin
  select * into v_campaign from public.play_campaigns where id = p_campaign_id;
  if v_campaign.id is null then
    return null;
  end if;
  select * into v_draw from public.play_campaign_draws where campaign_id = p_campaign_id;
  if v_draw.id is null then
    return jsonb_build_object(
      'campaignId', p_campaign_id,
      'status', case when v_campaign.status in ('DRAW_AUTHORIZED','DRAW_ELIGIBLE') then v_campaign.status else 'NOT_DRAWN' end,
      'ticketCount', null,
      'entriesDigest', null,
      'seedCommitment', null
    );
  end if;
  if v_draw.status = 'VOIDED' then
    return jsonb_build_object(
      'campaignId', p_campaign_id, 'status', 'VOIDED', 'drawId', v_draw.id,
      'ticketCount', v_draw.ticket_count_snapshot, 'entriesDigest', v_draw.entries_digest,
      'seedCommitment', v_draw.seed_commitment, 'seedReveal', v_draw.seed_reveal,
      'voidedAt', v_draw.voided_at, 'voidReason', v_draw.void_reason,
      'authorizedAt', v_draw.authorized_at
    );
  end if;
  if v_draw.status <> 'DRAWN' then
    return jsonb_build_object(
      'campaignId', p_campaign_id, 'status', v_draw.status, 'drawId', v_draw.id,
      'ticketCount', v_draw.ticket_count_snapshot, 'entriesDigest', v_draw.entries_digest,
      'seedCommitment', v_draw.seed_commitment, 'authorizedAt', v_draw.authorized_at
    );
  end if;

  select * into v_winner from public.play_tickets where id = v_draw.winning_ticket_id;
  return jsonb_build_object(
    'campaignId', p_campaign_id, 'campaignTitle', v_campaign.title, 'status', 'DRAWN',
    'drawId', v_draw.id, 'ticketCount', v_draw.ticket_count_snapshot,
    'entriesDigest', v_draw.entries_digest, 'seedCommitment', v_draw.seed_commitment,
    'seedReveal', v_draw.seed_reveal, 'winningTicketId', v_winner.public_id,
    'winningTicketCode', v_winner.ticket_code,
    'algorithm', 'SHA-256 seed commitment + ordered ticket-chain digest + rejection-sampled SHA-256 index',
    'selectionCounter', v_draw.selection_counter,
    'authorizedAt', v_draw.authorized_at, 'executedAt', v_draw.executed_at,
    'resultDigest', v_draw.result_digest
  );
end;
$$;

create or replace function public.play_draw_audit_ticket_page(
  p_campaign_id uuid,
  p_after_ticket_id bigint default 0,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_tickets jsonb;
  v_next bigint;
  v_has_more boolean;
begin
  if not exists (
    select 1 from public.play_campaign_draws d
    where d.campaign_id = p_campaign_id and d.status = 'DRAWN'
  ) then
    raise exception 'Ticket audit pages are available only after a completed draw' using errcode = '55000';
  end if;

  with page as (
    select t.id, t.public_id, t.ticket_code, t.status
    from public.play_tickets t
    where t.campaign_id = p_campaign_id
      and t.status in ('ACTIVE','WINNER')
      and t.id > greatest(coalesce(p_after_ticket_id, 0), 0)
    order by t.id
    limit v_limit + 1
  ), ranked as (
    select page.*, row_number() over(order by page.id) as rn from page
  )
  select
    coalesce(jsonb_agg(jsonb_build_object('ticketId', public_id, 'ticketCode', ticket_code, 'status', status) order by id) filter(where rn <= v_limit), '[]'::jsonb),
    max(id) filter(where rn <= v_limit),
    count(*) > v_limit
  into v_tickets, v_next, v_has_more
  from ranked;

  return jsonb_build_object('campaignId', p_campaign_id, 'tickets', v_tickets, 'nextAfterTicketId', v_next, 'hasMore', v_has_more, 'pageSize', v_limit);
end;
$$;

create or replace function public.admin_play_list_operations(p_campaign_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'entryOrders',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',o.id,'campaign_id',o.campaign_id,'user_id',o.user_id,
        'ticket_count',o.ticket_count,'currency_code',o.currency_code,
        'unit_price_amount',o.unit_price_amount,'total_amount',o.total_amount,
        'status',o.status,'ledger_journal_id',o.ledger_journal_id,
        'refund_journal_id',o.refund_journal_id,'refund_reason',o.refund_reason,
        'created_at',o.created_at,'refunded_at',o.refunded_at,
        'campaign_title',o.campaign_title
      ) order by o.created_at desc)
      from (
        select order_row.*, campaign.title as campaign_title
        from public.play_campaign_entry_orders order_row
        join public.play_campaigns campaign on campaign.id=order_row.campaign_id
        where p_campaign_id is null or order_row.campaign_id=p_campaign_id
        order by order_row.created_at desc
        limit 30
      ) o
    ),'[]'::jsonb),
    'draws',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',d.id,'campaign_id',d.campaign_id,'status',d.status,
        'ticket_count_snapshot',d.ticket_count_snapshot,
        'entries_digest',d.entries_digest,'seed_commitment',d.seed_commitment,
        'selection_counter',d.selection_counter,
        'winning_ticket_id',d.winning_ticket_public_id,'winning_ticket_code',d.winning_ticket_code,
        'authorized_by',d.authorized_by,'authorized_at',d.authorized_at,
        'executed_by',d.executed_by,'executed_at',d.executed_at,
        'voided_by',d.voided_by,'voided_at',d.voided_at,'void_reason',d.void_reason,
        'result_digest',d.result_digest,'campaign_title',d.campaign_title
      ) order by d.authorized_at desc)
      from (
        select draw_row.*, ticket.public_id as winning_ticket_public_id,
               ticket.ticket_code as winning_ticket_code, campaign.title as campaign_title
        from public.play_campaign_draws draw_row
        join public.play_campaigns campaign on campaign.id=draw_row.campaign_id
        left join public.play_tickets ticket on ticket.id=draw_row.winning_ticket_id
        where p_campaign_id is null or draw_row.campaign_id=p_campaign_id
        order by draw_row.authorized_at desc
        limit 30
      ) d
    ),'[]'::jsonb),
    'settlements',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'campaign_id',s.campaign_id,'currency_code',s.currency_code,
        'qualifying_funds_amount',s.qualifying_funds_amount,
        'prize_cost_recovered',s.prize_cost_recovered,
        'campaign_costs_recovered',s.campaign_costs_recovered,
        'profit_target_amount',s.profit_target_amount,'excess_amount',s.excess_amount,
        'prize_journal_id',s.prize_journal_id,'costs_journal_id',s.costs_journal_id,
        'profit_journal_id',s.profit_journal_id,
        'delivery_evidence_reference',s.delivery_evidence_reference,'settled_by',s.settled_by,'settled_at',s.settled_at,
        'campaign_title',s.campaign_title
      ) order by s.settled_at desc)
      from (
        select settlement_row.*, campaign.title as campaign_title
        from public.play_campaign_settlements settlement_row
        join public.play_campaigns campaign on campaign.id=settlement_row.campaign_id
        where p_campaign_id is null or settlement_row.campaign_id=p_campaign_id
        order by settlement_row.settled_at desc
        limit 30
      ) s
    ),'[]'::jsonb)
  );
end;
$$;

revoke all on function public.admin_play_enable_prize_draw_runtime(text) from public, anon;
revoke all on function public.admin_play_publish_experience(uuid,text) from public, anon;
revoke all on function public.admin_play_review_campaign(uuid,text,boolean,text,text) from public, anon;
revoke all on function public.admin_play_open_campaign(uuid,timestamptz) from public, anon;
revoke all on function public.admin_play_close_entries(uuid) from public, anon;
revoke all on function public.admin_play_authorize_draw(uuid) from public, anon;
revoke all on function public.admin_play_execute_draw(uuid) from public, anon;
revoke all on function public.admin_play_void_authorized_draw(uuid,text) from public, anon;
revoke all on function public.play_draw_audit_ticket_page(uuid,bigint,integer) from public;
revoke all on function public.admin_play_start_refunds(uuid,text) from public, anon;
revoke all on function public.admin_play_refund_entry_order(uuid,text) from public, anon;
revoke all on function public.admin_play_finish_refunds(uuid) from public, anon;
revoke all on function public.admin_play_confirm_prize_delivery(uuid,text) from public, anon;
revoke all on function public.play_draw_audit(uuid) from public;
revoke all on function public.admin_play_list_operations(uuid) from public, anon;

grant execute on function public.admin_play_enable_prize_draw_runtime(text) to authenticated;
grant execute on function public.admin_play_publish_experience(uuid,text) to authenticated;
grant execute on function public.admin_play_review_campaign(uuid,text,boolean,text,text) to authenticated;
grant execute on function public.admin_play_open_campaign(uuid,timestamptz) to authenticated;
grant execute on function public.admin_play_close_entries(uuid) to authenticated;
grant execute on function public.admin_play_authorize_draw(uuid) to authenticated;
grant execute on function public.admin_play_execute_draw(uuid) to authenticated;
grant execute on function public.admin_play_void_authorized_draw(uuid,text) to authenticated;
grant execute on function public.play_draw_audit_ticket_page(uuid,bigint,integer) to anon, authenticated;
grant execute on function public.admin_play_start_refunds(uuid,text) to authenticated;
grant execute on function public.admin_play_refund_entry_order(uuid,text) to authenticated;
grant execute on function public.admin_play_finish_refunds(uuid) to authenticated;
grant execute on function public.admin_play_confirm_prize_delivery(uuid,text) to authenticated;
grant execute on function public.play_draw_audit(uuid) to anon, authenticated;
grant execute on function public.admin_play_list_operations(uuid) to authenticated;

comment on table public.play_campaign_entry_orders is
  'Idempotent per-user entry purchases funded only by transfers through the existing VAD double-entry ledger.';
comment on table public.play_tickets is
  'Server-issued unique campaign tickets. Clients have no direct mutation privileges.';
comment on table public.play_campaign_draws is
  'Two-person draw audit. Seed commitment is recorded before execution; the seed is revealed only after the recorded draw.';
comment on table public.play_campaign_settlements is
  'Settlement breakdown referencing the existing finance ledger journals. Ledger entries remain the financial source of truth.';

commit;
