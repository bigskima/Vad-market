-- VAD Phase 1 runtime and control plane.
-- Adds the canonical event, market, trading, oracle, settlement, risk and AI
-- primitives that sit on top of the immutable Phase 1 foundation.

create schema if not exists market;
create schema if not exists trading;
create schema if not exists oracle;
create schema if not exists settlement;
create schema if not exists risk;
create schema if not exists ai;

revoke all on schema market, trading, oracle, settlement, risk, ai
  from public, anon, authenticated;
grant usage on schema market, trading, oracle, settlement, risk, ai to service_role;

alter default privileges in schema market, trading, oracle, settlement, risk, ai
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema market, trading, oracle, settlement, risk, ai
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema market, trading, oracle, settlement, risk, ai
  grant all on tables to service_role;
alter default privileges in schema market, trading, oracle, settlement, risk, ai
  grant usage, select on sequences to service_role;
alter default privileges in schema market, trading, oracle, settlement, risk, ai
  grant execute on functions to service_role;

-- Market templates -----------------------------------------------------------

create table market.templates (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null check (char_length(name) between 3 and 120),
  category text not null check (category ~ '^[A-Z][A-Z0-9_]*$'),
  outcome_schema text not null check (outcome_schema in ('BINARY', 'MULTI_OUTCOME')),
  parameter_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(parameter_schema) = 'object'),
  resolution_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(resolution_schema) = 'object'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED', 'RETIRED')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create trigger market_templates_set_updated_at
before update on market.templates
for each row execute function private.set_updated_at();

-- Canonical events -----------------------------------------------------------

create table market.canonical_events (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  template_id bigint not null references market.templates (id),
  title text not null check (char_length(title) between 5 and 280),
  description text,
  category text not null check (category ~ '^[A-Z][A-Z0-9_]*$'),
  canonical_fingerprint text not null unique check (char_length(canonical_fingerprint) between 16 and 256),
  normalized_parameters jsonb not null check (jsonb_typeof(normalized_parameters) = 'object'),
  resolution_scope jsonb not null check (jsonb_typeof(resolution_scope) = 'object'),
  opens_at timestamptz,
  closes_at timestamptz not null,
  resolves_after timestamptz,
  status text not null default 'DRAFT' check (status in (
    'DRAFT','UNDER_REVIEW','APPROVED','SCHEDULED','OPEN','SUSPENDED','CLOSED',
    'AWAITING_ORACLE','PROVISIONALLY_RESOLVED','DISPUTED','FINALIZED',
    'SETTLEMENT_PENDING','SETTLED','VOIDED','CANCELLED'
  )),
  originator_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint canonical_event_time_order check (
    (opens_at is null or opens_at < closes_at)
    and (resolves_after is null or resolves_after >= closes_at)
  )
);

create index canonical_events_status_close_idx on market.canonical_events (status, closes_at);
create index canonical_events_category_status_idx on market.canonical_events (category, status);

create trigger canonical_events_set_updated_at
before update on market.canonical_events
for each row execute function private.set_updated_at();

create table market.event_relationships (
  event_id bigint not null references market.canonical_events (id) on delete cascade,
  related_event_id bigint not null references market.canonical_events (id) on delete cascade,
  relationship_type text not null check (relationship_type in ('RELATED','PARENT','CHILD','CORRELATED','SAME_ENTITY','SAME_COMPETITION')),
  confidence numeric(7,6) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default statement_timestamp(),
  primary key (event_id, related_event_id, relationship_type),
  constraint event_relationship_not_self check (event_id <> related_event_id)
);

-- Proposal pipeline ----------------------------------------------------------

create table market.proposals (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  proposer_user_id uuid not null references auth.users (id) on delete cascade,
  raw_question text not null check (char_length(raw_question) between 5 and 1000),
  raw_context text,
  normalized_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_payload) = 'object'),
  proposed_template_id bigint references market.templates (id),
  matched_canonical_event_id bigint references market.canonical_events (id),
  canonicalization_decision text check (canonicalization_decision in (
    'EXACT_DUPLICATE','SEMANTIC_DUPLICATE','RELATED_EVENT','DISTINCT_EVENT','UNCERTAIN'
  )),
  duplicate_probability numeric(7,6) check (duplicate_probability is null or duplicate_probability between 0 and 1),
  objectivity_score numeric(7,6) check (objectivity_score is null or objectivity_score between 0 and 1),
  oracle_availability_score numeric(7,6) check (oracle_availability_score is null or oracle_availability_score between 0 and 1),
  ambiguity_score numeric(7,6) check (ambiguity_score is null or ambiguity_score between 0 and 1),
  manipulation_risk_score numeric(7,6) check (manipulation_risk_score is null or manipulation_risk_score between 0 and 1),
  status text not null default 'SUBMITTED' check (status in (
    'SUBMITTED','PROCESSING','NEEDS_CLARIFICATION','UNDER_REVIEW','APPROVED','REJECTED','SOCIAL_ONLY','MERGED'
  )),
  decision_reason text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index market_proposals_user_time_idx on market.proposals (proposer_user_id, created_at desc);
create index market_proposals_status_idx on market.proposals (status, created_at);

create trigger market_proposals_set_updated_at
before update on market.proposals
for each row execute function private.set_updated_at();

-- Oracle registry ------------------------------------------------------------

create table oracle.capabilities (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  description text not null,
  created_at timestamptz not null default statement_timestamp()
);

create table oracle.policies (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  name text not null,
  capability_id bigint not null references oracle.capabilities (id),
  version integer not null check (version > 0),
  source_hierarchy jsonb not null check (jsonb_typeof(source_hierarchy) = 'array'),
  consensus_rule jsonb not null check (jsonb_typeof(consensus_rule) = 'object'),
  close_rule jsonb not null check (jsonb_typeof(close_rule) = 'object'),
  postponement_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(postponement_rule) = 'object'),
  cancellation_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(cancellation_rule) = 'object'),
  void_rule jsonb not null default '{}'::jsonb check (jsonb_typeof(void_rule) = 'object'),
  dispute_window_seconds integer not null default 3600 check (dispute_window_seconds >= 0),
  status text not null check (status in ('DRAFT','ACTIVE','RETIRED')),
  effective_at timestamptz not null,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  unique (name, version),
  constraint oracle_policy_dual_control check (
    (created_by is null and approved_by is null)
    or (created_by is not null and approved_by is not null and created_by <> approved_by)
  )
);

create trigger oracle_policies_immutable
before update or delete on oracle.policies
for each row execute function private.reject_immutable_mutation();

create table oracle.event_policy_bindings (
  event_id bigint primary key references market.canonical_events (id) on delete cascade,
  oracle_policy_id bigint not null references oracle.policies (id),
  bound_at timestamptz not null default statement_timestamp(),
  bound_by uuid
);

create table oracle.observations (
  id bigint generated always as identity primary key,
  event_id bigint not null references market.canonical_events (id) on delete cascade,
  provider_id bigint references integration.providers (id),
  source_code text not null,
  observed_outcome text,
  observation_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(observation_payload) = 'object'),
  evidence_reference text,
  observed_at timestamptz not null,
  received_at timestamptz not null default statement_timestamp(),
  verification_status text not null default 'RECEIVED' check (verification_status in ('RECEIVED','VERIFIED','REJECTED')),
  idempotency_key text not null unique
);

create index oracle_observations_event_time_idx on oracle.observations (event_id, received_at);

create table oracle.resolutions (
  id bigint generated always as identity primary key,
  event_id bigint not null references market.canonical_events (id),
  oracle_policy_id bigint not null references oracle.policies (id),
  outcome_code text,
  status text not null check (status in ('PROVISIONAL','CONFLICT','FINAL','VOID')),
  consensus_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(consensus_evidence) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  finalized_at timestamptz,
  unique (event_id, status) deferrable initially immediate,
  constraint oracle_resolution_finalized_state check (
    (status in ('FINAL','VOID')) = (finalized_at is not null)
  )
);

create table oracle.disputes (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  event_id bigint not null references market.canonical_events (id),
  resolution_id bigint references oracle.resolutions (id),
  opened_by uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 5 and 2000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  status text not null default 'OPEN' check (status in ('OPEN','UNDER_REVIEW','UPHELD','REJECTED','ESCALATED','RESOLVED')),
  decision_reason text,
  resolved_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz
);

-- Asset-specific market instruments -----------------------------------------

create table market.instruments (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  canonical_event_id bigint not null references market.canonical_events (id),
  asset_id bigint not null references public.assets (id),
  market_type text not null default 'BINARY' check (market_type in ('BINARY','MULTI_OUTCOME')),
  liquidity_model text not null default 'ORDER_BOOK' check (liquidity_model in ('ORDER_BOOK','AMM','HYBRID')),
  settlement_unit numeric(38,18) not null check (settlement_unit > 0),
  pricing_precision smallint not null check (pricing_precision between 0 and 18),
  min_order_notional numeric(38,18) not null default 1 check (min_order_notional > 0),
  status text not null default 'DRAFT' check (status in ('DRAFT','OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED','VOIDED','CANCELLED')),
  opened_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (canonical_event_id, asset_id)
);

create index market_instruments_status_idx on market.instruments (status, canonical_event_id);
create trigger market_instruments_set_updated_at
before update on market.instruments
for each row execute function private.set_updated_at();

create table market.outcomes (
  id bigint generated always as identity primary key,
  instrument_id bigint not null references market.instruments (id) on delete cascade,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]*$'),
  label text not null,
  display_order smallint not null check (display_order >= 0),
  created_at timestamptz not null default statement_timestamp(),
  unique (instrument_id, code),
  unique (instrument_id, display_order)
);

-- Trading --------------------------------------------------------------------

create sequence trading.order_sequence as bigint;

create table trading.orders (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users (id) on delete restrict,
  instrument_id bigint not null references market.instruments (id),
  outcome_id bigint not null references market.outcomes (id),
  side text not null check (side in ('BUY','SELL')),
  order_type text not null default 'LIMIT' check (order_type in ('LIMIT')),
  limit_price numeric(38,18) not null check (limit_price > 0),
  quantity numeric(38,18) not null check (quantity > 0),
  filled_quantity numeric(38,18) not null default 0 check (filled_quantity >= 0),
  reserved_account_id bigint references finance.ledger_accounts (id),
  sequence_number bigint not null default nextval('trading.order_sequence'),
  status text not null default 'OPEN' check (status in ('OPEN','PARTIALLY_FILLED','FILLED','CANCELLED','EXPIRED','REJECTED')),
  idempotency_key text not null unique,
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint trading_order_fill_bounds check (filled_quantity <= quantity)
);

create index trading_orders_book_idx on trading.orders (instrument_id, outcome_id, side, status, limit_price, sequence_number);
create index trading_orders_user_idx on trading.orders (user_id, created_at desc);

create trigger trading_orders_set_updated_at
before update on trading.orders
for each row execute function private.set_updated_at();

create table trading.trades (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  instrument_id bigint not null references market.instruments (id),
  outcome_id bigint not null references market.outcomes (id),
  maker_order_id bigint not null references trading.orders (id),
  taker_order_id bigint not null references trading.orders (id),
  price numeric(38,18) not null check (price > 0),
  quantity numeric(38,18) not null check (quantity > 0),
  gross_notional numeric(38,18) not null check (gross_notional > 0),
  maker_fee numeric(38,18) not null default 0 check (maker_fee >= 0),
  taker_fee numeric(38,18) not null default 0 check (taker_fee >= 0),
  fee_policy_version_id bigint references policy.policy_versions (id),
  ledger_journal_id bigint references finance.ledger_journals (id),
  sequence_number bigint not null default nextval('trading.order_sequence'),
  executed_at timestamptz not null default statement_timestamp()
);

create index trading_trades_instrument_time_idx on trading.trades (instrument_id, executed_at desc);

create trigger trading_trades_immutable
before update or delete on trading.trades
for each row execute function private.reject_immutable_mutation();

create table trading.positions (
  user_id uuid not null references auth.users (id) on delete restrict,
  instrument_id bigint not null references market.instruments (id),
  outcome_id bigint not null references market.outcomes (id),
  quantity numeric(38,18) not null default 0 check (quantity >= 0),
  total_cost_basis numeric(38,18) not null default 0 check (total_cost_basis >= 0),
  realized_pnl numeric(38,18) not null default 0,
  fees_paid numeric(38,18) not null default 0 check (fees_paid >= 0),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, instrument_id, outcome_id)
);

create trigger trading_positions_set_updated_at
before update on trading.positions
for each row execute function private.set_updated_at();

-- Settlement -----------------------------------------------------------------

create table settlement.runs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  instrument_id bigint not null references market.instruments (id),
  resolution_id bigint not null references oracle.resolutions (id),
  status text not null default 'PLANNED' check (status in ('PLANNED','VALIDATED','POSTING','SETTLED','FAILED')),
  gross_liability numeric(38,18) not null default 0 check (gross_liability >= 0),
  collateral_available numeric(38,18) not null default 0 check (collateral_available >= 0),
  settlement_fee_total numeric(38,18) not null default 0 check (settlement_fee_total >= 0),
  ledger_journal_id bigint references finance.ledger_journals (id),
  idempotency_key text not null unique,
  failure_reason text,
  created_at timestamptz not null default statement_timestamp(),
  settled_at timestamptz
);

create unique index settlement_one_successful_run_idx
  on settlement.runs (instrument_id)
  where status = 'SETTLED';

create table settlement.entitlements (
  id bigint generated always as identity primary key,
  run_id bigint not null references settlement.runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete restrict,
  outcome_id bigint not null references market.outcomes (id),
  quantity numeric(38,18) not null check (quantity > 0),
  gross_amount numeric(38,18) not null check (gross_amount >= 0),
  fee_amount numeric(38,18) not null default 0 check (fee_amount >= 0),
  net_amount numeric(38,18) not null check (net_amount >= 0),
  created_at timestamptz not null default statement_timestamp(),
  unique (run_id, user_id, outcome_id),
  constraint settlement_entitlement_math check (gross_amount = fee_amount + net_amount)
);

create trigger settlement_entitlements_immutable
before update or delete on settlement.entitlements
for each row execute function private.reject_immutable_mutation();

-- Risk -----------------------------------------------------------------------

create table risk.signals (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  instrument_id bigint references market.instruments (id) on delete set null,
  signal_type text not null check (signal_type ~ '^[A-Z][A-Z0-9_]*$'),
  severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')),
  score numeric(7,6) check (score is null or score between 0 and 1),
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'OPEN' check (status in ('OPEN','REVIEWING','DISMISSED','CONFIRMED','RESOLVED')),
  created_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz
);

-- AI runtime -----------------------------------------------------------------

create table ai.providers (
  id bigint generated always as identity primary key,
  integration_provider_id bigint not null references integration.providers (id) on delete cascade,
  model_code text not null,
  status text not null check (status in ('ACTIVE','DISABLED','DEGRADED')),
  capabilities jsonb not null default '[]'::jsonb check (jsonb_typeof(capabilities) = 'array'),
  priority integer not null default 100 check (priority >= 0),
  cost_policy jsonb not null default '{}'::jsonb check (jsonb_typeof(cost_policy) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (integration_provider_id, model_code)
);

create trigger ai_providers_set_updated_at
before update on ai.providers
for each row execute function private.set_updated_at();

create table ai.prompt_versions (
  id bigint generated always as identity primary key,
  capability_key text not null check (capability_key ~ '^[A-Z][A-Z0-9_]*$'),
  version integer not null check (version > 0),
  system_prompt text not null,
  output_schema jsonb not null default '{}'::jsonb check (jsonb_typeof(output_schema) = 'object'),
  status text not null check (status in ('DRAFT','ACTIVE','RETIRED')),
  created_at timestamptz not null default statement_timestamp(),
  unique (capability_key, version)
);

create trigger ai_prompt_versions_immutable
before update or delete on ai.prompt_versions
for each row execute function private.reject_immutable_mutation();

create table ai.runs (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  capability_key text not null,
  provider_id bigint references ai.providers (id),
  prompt_version_id bigint references ai.prompt_versions (id),
  user_id uuid references auth.users (id) on delete set null,
  input_reference_type text,
  input_reference_id text,
  output_payload jsonb,
  validation_status text not null default 'PENDING' check (validation_status in ('PENDING','VALID','INVALID','FAILED')),
  failure_reason text,
  created_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz
);

-- Security: private runtime tables are service-only in Phase 1. -------------

alter table market.templates enable row level security;
alter table market.canonical_events enable row level security;
alter table market.event_relationships enable row level security;
alter table market.proposals enable row level security;
alter table market.instruments enable row level security;
alter table market.outcomes enable row level security;
alter table oracle.capabilities enable row level security;
alter table oracle.policies enable row level security;
alter table oracle.event_policy_bindings enable row level security;
alter table oracle.observations enable row level security;
alter table oracle.resolutions enable row level security;
alter table oracle.disputes enable row level security;
alter table trading.orders enable row level security;
alter table trading.trades enable row level security;
alter table trading.positions enable row level security;
alter table settlement.runs enable row level security;
alter table settlement.entitlements enable row level security;
alter table risk.signals enable row level security;
alter table ai.providers enable row level security;
alter table ai.prompt_versions enable row level security;
alter table ai.runs enable row level security;

-- Public read model. Clients may read approved/open market data, never mutate it.

create table public.market_catalog (
  instrument_public_id uuid primary key,
  event_public_id uuid not null,
  title text not null,
  category text not null,
  asset_code text not null,
  market_type text not null,
  status text not null,
  closes_at timestamptz not null,
  yes_price numeric(38,18),
  no_price numeric(38,18),
  last_trade_at timestamptz,
  updated_at timestamptz not null default statement_timestamp()
);

alter table public.market_catalog enable row level security;
create policy market_catalog_public_read
on public.market_catalog
for select
to anon, authenticated
using (status in ('OPEN','SUSPENDED','CLOSED','SETTLEMENT_PENDING','SETTLED','VOIDED'));
grant select on public.market_catalog to anon, authenticated;

-- Launch seed: NGN active, future assets remain configuration, not code. ------

insert into market.templates (code, name, category, outcome_schema, parameter_schema, resolution_schema)
values
  ('BINARY_EVENT', 'Generic objective binary event', 'GENERAL', 'BINARY',
   '{"required":["subject","time_scope"]}'::jsonb,
   '{"outcomes":["YES","NO"]}'::jsonb)
on conflict (code) do nothing;

insert into oracle.capabilities (code, description)
values
  ('OBJECTIVE_EVENT_RESULT', 'Resolve an objective event through a versioned source hierarchy and consensus policy')
on conflict (code) do nothing;

insert into policy.feature_flags (code, name, description, status)
values
  ('USDC_MARKETS', 'USDC markets', 'Future USDC market instruments. Disabled for the Nigeria NGN-first launch.', 'ACTIVE'),
  ('AMM_LIQUIDITY', 'AMM liquidity', 'Future automated market maker engine. Order book is the launch liquidity model.', 'ACTIVE')
on conflict (code) do nothing;
