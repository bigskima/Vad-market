-- VAD Phase 1: production-grade foundations with startup-level infrastructure.
--
-- This migration intentionally does not implement deposits, withdrawals, trading,
-- markets, or settlement. It establishes the authority, security, policy, audit,
-- asset, provider, and ledger primitives those later phases must build upon.

create schema if not exists private;
create schema if not exists admin;
create schema if not exists policy;
create schema if not exists finance;
create schema if not exists integration;
create schema if not exists audit;
create schema if not exists eventing;

revoke all on schema private, admin, policy, finance, integration, audit, eventing
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant usage on schema admin, policy, finance, integration, audit, eventing
  to service_role;

alter default privileges in schema public
  revoke all on tables from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema private, admin, policy, finance, integration, audit, eventing
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema private, admin, policy, finance, integration, audit, eventing
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema admin, policy, finance, integration, audit, eventing
  grant all on tables to service_role;
alter default privileges in schema admin, policy, finance, integration, audit, eventing
  grant usage, select on sequences to service_role;
alter default privileges in schema admin, policy, finance, integration, audit, eventing
  grant execute on functions to service_role;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := statement_timestamp();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

create or replace function private.reject_immutable_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_schema || '.' || tg_table_name
    using errcode = '55000';
end;
$$;

revoke all on function private.reject_immutable_mutation()
  from public, anon, authenticated;

-- Identity and public profile -------------------------------------------------

create table public.user_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'ACTIVE'
    check (status in (
      'ACTIVE', 'RESTRICTED', 'SUSPENDED', 'BANNED',
      'DEACTIVATED', 'UNDER_REVIEW'
    )),
  country_code text not null default 'NG'
    check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

comment on table public.user_accounts is
  'Private runtime account state. RLS permits a user to read only their own row; clients cannot change status or jurisdiction.';

create index user_accounts_status_country_idx
  on public.user_accounts (status, country_code);

create trigger user_accounts_set_updated_at
before update on public.user_accounts
for each row execute function private.set_updated_at();

alter table public.user_accounts enable row level security;

create policy user_accounts_select_own
on public.user_accounts
for select
to authenticated
using ((select auth.uid()) = user_id);

grant select (user_id, status, country_code, created_at, updated_at)
  on public.user_accounts to authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  handle text,
  display_name text,
  bio text,
  avatar_path text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint profiles_handle_format
    check (handle is null or handle ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_length
    check (display_name is null or char_length(display_name) between 1 and 80),
  constraint profiles_bio_length
    check (bio is null or char_length(bio) <= 500)
);

comment on table public.profiles is
  'Public social identity only. Email, phone, KYC, risk, finance, and admin data must never be added here.';

create unique index profiles_handle_unique_idx
  on public.profiles (lower(handle))
  where handle is not null;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_public_read
on public.profiles
for select
to anon, authenticated
using (true);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.profiles to anon, authenticated;
grant update (handle, display_name, bio, avatar_path)
  on public.profiles to authenticated;

-- Public registries -----------------------------------------------------------

create table public.assets (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z0-9]{2,12}$'),
  name text not null check (char_length(name) between 1 and 80),
  symbol text not null check (char_length(symbol) between 1 and 12),
  asset_type text not null check (asset_type in ('FIAT', 'STABLECOIN', 'CRYPTO')),
  minor_units smallint not null check (minor_units between 0 and 18),
  accounting_precision smallint not null check (accounting_precision between minor_units and 18),
  display_precision smallint not null check (display_precision between 0 and accounting_precision),
  pricing_precision smallint not null check (pricing_precision between 0 and accounting_precision),
  network text,
  contract_address text,
  status text not null check (status in ('ACTIVE', 'DISABLED', 'SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint assets_contract_pair
    check (
      (contract_address is null)
      or (network is not null and asset_type <> 'FIAT')
    )
);

comment on table public.assets is
  'Asset-neutral registry. Status is authoritative; a client must never infer that a listed asset is enabled.';

create index assets_status_idx on public.assets (status);

create trigger assets_set_updated_at
before update on public.assets
for each row execute function private.set_updated_at();

alter table public.assets enable row level security;

create policy assets_public_read
on public.assets
for select
to anon, authenticated
using (true);

grant select on public.assets to anon, authenticated;

create table public.jurisdictions (
  id bigint generated always as identity primary key,
  country_code text not null unique check (country_code ~ '^[A-Z]{2}$'),
  name text not null check (char_length(name) between 1 and 80),
  status text not null check (status in ('ACTIVE', 'DISABLED', 'SUSPENDED')),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index jurisdictions_status_idx on public.jurisdictions (status);

create trigger jurisdictions_set_updated_at
before update on public.jurisdictions
for each row execute function private.set_updated_at();

alter table public.jurisdictions enable row level security;

create policy jurisdictions_public_read
on public.jurisdictions
for select
to anon, authenticated
using (true);

grant select on public.jurisdictions to anon, authenticated;

create table public.jurisdiction_assets (
  jurisdiction_id bigint not null references public.jurisdictions (id),
  asset_id bigint not null references public.assets (id),
  status text not null check (status in ('ACTIVE', 'DISABLED', 'SUSPENDED')),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (jurisdiction_id, asset_id)
);

create index jurisdiction_assets_asset_id_idx
  on public.jurisdiction_assets (asset_id);
create index jurisdiction_assets_status_idx
  on public.jurisdiction_assets (status);

create trigger jurisdiction_assets_set_updated_at
before update on public.jurisdiction_assets
for each row execute function private.set_updated_at();

alter table public.jurisdiction_assets enable row level security;

create policy jurisdiction_assets_public_read
on public.jurisdiction_assets
for select
to anon, authenticated
using (true);

grant select on public.jurisdiction_assets to anon, authenticated;

-- These are safe-to-disclose, versioned decisions consumed through the
-- runtime-capabilities Edge Function. No client role can insert or update them.
create table public.capability_rules (
  id bigint generated always as identity primary key,
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_]*$'),
  country_code text not null default 'NG'
    check (country_code ~ '^[A-Z]{2}$'),
  version integer not null check (version > 0),
  enabled boolean not null,
  reason_code text not null check (reason_code ~ '^[A-Z][A-Z0-9_]*$'),
  status text not null check (status in ('DRAFT', 'ACTIVE', 'RETIRED')),
  effective_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  created_by uuid,
  approved_by uuid,
  constraint capability_rules_time_window
    check (expires_at is null or expires_at > effective_at),
  unique (capability_key, country_code, version)
);

create index capability_rules_active_lookup_idx
  on public.capability_rules (country_code, capability_key, effective_at desc)
  where status = 'ACTIVE';

alter table public.capability_rules enable row level security;

create policy capability_rules_authenticated_read
on public.capability_rules
for select
to authenticated
using (
  status = 'ACTIVE'
  and effective_at <= statement_timestamp()
  and (expires_at is null or expires_at > statement_timestamp())
);

grant select (
  capability_key, country_code, version, enabled, reason_code,
  effective_at, expires_at
) on public.capability_rules to authenticated;

-- Admin RBAC -----------------------------------------------------------------

create table admin.roles (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text not null,
  is_system boolean not null default true,
  created_at timestamptz not null default statement_timestamp()
);

create table admin.permissions (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[a-z][a-z0-9_.]*$'),
  description text not null,
  created_at timestamptz not null default statement_timestamp()
);

create table admin.role_permissions (
  role_id bigint not null references admin.roles (id) on delete cascade,
  permission_id bigint not null references admin.permissions (id) on delete cascade,
  created_at timestamptz not null default statement_timestamp(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx
  on admin.role_permissions (permission_id);

create table admin.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id bigint not null references admin.roles (id),
  assigned_by uuid,
  approved_by uuid,
  reason text not null check (char_length(reason) between 3 and 500),
  effective_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  constraint user_roles_time_window
    check (expires_at is null or expires_at > effective_at),
  constraint user_roles_dual_control
    check (
      (assigned_by is null and approved_by is null)
      or (
        assigned_by is not null
        and approved_by is not null
        and assigned_by <> approved_by
      )
    )
);

create index user_roles_user_id_idx on admin.user_roles (user_id);
create index user_roles_role_id_idx on admin.user_roles (role_id);
create index user_roles_assigned_by_idx on admin.user_roles (assigned_by)
  where assigned_by is not null;
create index user_roles_approved_by_idx on admin.user_roles (approved_by)
  where approved_by is not null;
create unique index user_roles_active_unique_idx
  on admin.user_roles (user_id, role_id)
  where revoked_at is null;

alter table admin.roles enable row level security;
alter table admin.permissions enable row level security;
alter table admin.role_permissions enable row level security;
alter table admin.user_roles enable row level security;

create or replace function private.has_permission(p_permission_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := (select auth.uid());
begin
  if caller_id is null then
    return false;
  end if;

  return exists (
    select 1
    from admin.user_roles ur
    join admin.role_permissions rp on rp.role_id = ur.role_id
    join admin.permissions p on p.id = rp.permission_id
    where ur.user_id = caller_id
      and p.code = p_permission_code
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
  );
end;
$$;

revoke all on function private.has_permission(text) from public, anon;
grant execute on function private.has_permission(text) to authenticated;

-- Versioned policy and feature configuration ---------------------------------

create table policy.policies (
  id bigint generated always as identity primary key,
  domain text not null check (domain in (
    'ASSETS', 'PROVIDERS', 'KYC', 'FEES', 'MARKETS', 'ORACLE',
    'RISK', 'LIMITS', 'DISPUTES', 'AI_ROUTING', 'ALGORITHMS',
    'CREATOR_CAPABILITIES', 'FEATURE_FLAGS', 'PLATFORM'
  )),
  name text not null,
  description text not null,
  status text not null check (status in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED')),
  current_version_id bigint,
  created_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (domain, name)
);

create table policy.policy_versions (
  id bigint generated always as identity primary key,
  policy_id bigint not null references policy.policies (id),
  version integer not null check (version > 0),
  configuration jsonb not null check (jsonb_typeof(configuration) = 'object'),
  effective_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid,
  approved_by uuid,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default statement_timestamp(),
  constraint policy_versions_time_window
    check (expires_at is null or expires_at > effective_at),
  constraint policy_versions_dual_control
    check (
      (created_by is null and approved_by is null)
      or (
        created_by is not null
        and approved_by is not null
        and created_by <> approved_by
      )
    ),
  unique (policy_id, version)
);

alter table policy.policies
  add constraint policies_current_version_fk
  foreign key (current_version_id) references policy.policy_versions (id);

create index policies_current_version_id_idx
  on policy.policies (current_version_id)
  where current_version_id is not null;
create index policy_versions_policy_id_idx
  on policy.policy_versions (policy_id);
create index policy_versions_effective_idx
  on policy.policy_versions (policy_id, effective_at desc);

create trigger policies_set_updated_at
before update on policy.policies
for each row execute function private.set_updated_at();

create trigger policy_versions_immutable
before update or delete on policy.policy_versions
for each row execute function private.reject_immutable_mutation();

create table policy.feature_flags (
  id bigint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  description text not null,
  status text not null check (status in ('ACTIVE', 'RETIRED')),
  current_version_id bigint,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table policy.feature_flag_versions (
  id bigint generated always as identity primary key,
  feature_flag_id bigint not null references policy.feature_flags (id),
  version integer not null check (version > 0),
  enabled boolean not null,
  rules jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  effective_at timestamptz not null,
  expires_at timestamptz,
  created_by uuid,
  approved_by uuid,
  reason text not null check (char_length(reason) between 3 and 1000),
  created_at timestamptz not null default statement_timestamp(),
  constraint feature_flag_versions_time_window
    check (expires_at is null or expires_at > effective_at),
  constraint feature_flag_versions_dual_control
    check (
      (created_by is null and approved_by is null)
      or (
        created_by is not null
        and approved_by is not null
        and created_by <> approved_by
      )
    ),
  unique (feature_flag_id, version)
);

alter table policy.feature_flags
  add constraint feature_flags_current_version_fk
  foreign key (current_version_id) references policy.feature_flag_versions (id);

create index feature_flags_current_version_id_idx
  on policy.feature_flags (current_version_id)
  where current_version_id is not null;
create index feature_flag_versions_feature_flag_id_idx
  on policy.feature_flag_versions (feature_flag_id);

create trigger feature_flags_set_updated_at
before update on policy.feature_flags
for each row execute function private.set_updated_at();

create trigger feature_flag_versions_immutable
before update or delete on policy.feature_flag_versions
for each row execute function private.reject_immutable_mutation();

alter table policy.policies enable row level security;
alter table policy.policy_versions enable row level security;
alter table policy.feature_flags enable row level security;
alter table policy.feature_flag_versions enable row level security;

-- Audit and event outbox ------------------------------------------------------

create table audit.records (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  actor_type text not null check (actor_type in ('USER', 'ADMIN', 'SERVICE', 'SYSTEM')),
  action text not null check (action ~ '^[A-Z][A-Z0-9_]*$'),
  resource_type text not null,
  resource_id text,
  before_state jsonb,
  after_state jsonb,
  reason text,
  request_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default statement_timestamp(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
);

comment on table audit.records is
  'Immutable audit evidence. Actor UUIDs are intentionally not foreign keys so account deletion cannot rewrite history.';

create index audit_records_actor_time_idx
  on audit.records (actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index audit_records_resource_idx
  on audit.records (resource_type, resource_id, occurred_at desc);
create index audit_records_request_id_idx
  on audit.records (request_id);

create trigger audit_records_immutable
before update or delete on audit.records
for each row execute function private.reject_immutable_mutation();

alter table audit.records enable row level security;

create table eventing.domain_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type ~ '^[A-Z][A-Z0-9_]*$'),
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  idempotency_key text unique,
  request_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default statement_timestamp(),
  processed_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text
);

create index domain_events_unprocessed_idx
  on eventing.domain_events (occurred_at)
  where processed_at is null;
create index domain_events_aggregate_idx
  on eventing.domain_events (aggregate_type, aggregate_id, occurred_at);
create index domain_events_event_type_idx
  on eventing.domain_events (event_type, occurred_at desc);

create or replace function eventing.guard_domain_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Domain events cannot be deleted'
      using errcode = '55000';
  end if;

  if row(
    new.id, new.event_type, new.aggregate_type, new.aggregate_id,
    new.payload, new.idempotency_key, new.request_id, new.occurred_at
  ) is distinct from row(
    old.id, old.event_type, old.aggregate_type, old.aggregate_id,
    old.payload, old.idempotency_key, old.request_id, old.occurred_at
  ) then
    raise exception 'Domain event facts are immutable'
      using errcode = '55000';
  end if;

  if new.attempt_count < old.attempt_count then
    raise exception 'Domain event attempt count cannot decrease'
      using errcode = '23514';
  end if;

  if old.processed_at is not null and new.processed_at is distinct from old.processed_at then
    raise exception 'A processed domain event cannot be reopened'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

create trigger domain_events_guard
before update or delete on eventing.domain_events
for each row execute function eventing.guard_domain_event_mutation();

revoke all on function eventing.guard_domain_event_mutation()
  from public, anon, authenticated;

alter table eventing.domain_events enable row level security;

-- Provider registry ----------------------------------------------------------

create table integration.providers (
  id bigint generated always as identity primary key,
  code text not null check (code ~ '^[A-Z][A-Z0-9_]*$'),
  name text not null,
  provider_type text not null check (provider_type in (
    'PAYMENT', 'IDENTITY_VERIFICATION', 'ORACLE', 'AI', 'NOTIFICATION'
  )),
  environment text not null check (environment in ('SANDBOX', 'PRODUCTION')),
  status text not null check (status in ('ACTIVE', 'DISABLED', 'DEGRADED', 'UNAVAILABLE')),
  priority integer not null default 100 check (priority >= 0),
  capabilities jsonb not null default '[]'::jsonb
    check (jsonb_typeof(capabilities) = 'array'),
  public_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_metadata) = 'object'),
  secret_reference text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (code, environment)
);

comment on column integration.providers.secret_reference is
  'A Vault/secret-manager reference only. Provider credentials must never be stored in this table.';

create index providers_routing_idx
  on integration.providers (provider_type, environment, status, priority);

create trigger providers_set_updated_at
before update on integration.providers
for each row execute function private.set_updated_at();

create table integration.provider_health (
  provider_id bigint primary key references integration.providers (id) on delete cascade,
  status text not null check (status in ('HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'UNKNOWN')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  success_rate numeric(7,6) check (success_rate is null or success_rate between 0 and 1),
  error_rate numeric(7,6) check (error_rate is null or error_rate between 0 and 1),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  checked_at timestamptz not null default statement_timestamp(),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object')
);

alter table integration.providers enable row level security;
alter table integration.provider_health enable row level security;

-- Asset-neutral double-entry ledger skeleton ---------------------------------

create table finance.ledger_accounts (
  id bigint generated always as identity primary key,
  asset_id bigint not null references public.assets (id),
  account_type text not null check (account_type in (
    'USER_AVAILABLE', 'USER_RESERVED', 'MARKET_COLLATERAL',
    'WITHDRAWAL_PENDING', 'PROVIDER_CLEARING',
    'PLATFORM_TRADING_FEE_REVENUE', 'PLATFORM_SETTLEMENT_FEE_REVENUE',
    'PLATFORM_WITHDRAWAL_REVENUE', 'REFUND_PAYABLE',
    'CREATOR_REWARD_PAYABLE', 'TREASURY', 'SUSPENSE',
    'CHARGEBACK_RECEIVABLE'
  )),
  owner_type text not null check (owner_type in (
    'USER', 'MARKET', 'PROVIDER', 'PLATFORM', 'CREATOR', 'EXTERNAL'
  )),
  owner_reference text not null check (char_length(owner_reference) between 1 and 200),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'FROZEN', 'CLOSED')),
  created_at timestamptz not null default statement_timestamp(),
  closed_at timestamptz,
  constraint ledger_accounts_closed_state
    check ((status = 'CLOSED') = (closed_at is not null)),
  unique (asset_id, account_type, owner_type, owner_reference)
);

comment on table finance.ledger_accounts is
  'Accounts classify ownership and purpose. No mutable balance column is permitted; balances are derived from posted entries.';

create index ledger_accounts_asset_id_idx
  on finance.ledger_accounts (asset_id);
create index ledger_accounts_owner_idx
  on finance.ledger_accounts (owner_type, owner_reference);

create table finance.ledger_journals (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  asset_id bigint not null references public.assets (id),
  journal_type text not null check (journal_type ~ '^[A-Z][A-Z0-9_]*$'),
  status text not null default 'DRAFT' check (status in ('DRAFT', 'POSTED')),
  idempotency_key text not null unique
    check (char_length(idempotency_key) between 8 and 200),
  request_id uuid not null default gen_random_uuid(),
  reference_type text,
  reference_id text,
  description text not null check (char_length(description) between 3 and 500),
  reversal_of_journal_id bigint unique references finance.ledger_journals (id),
  created_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  posted_at timestamptz,
  constraint ledger_journals_posted_state
    check ((status = 'POSTED') = (posted_at is not null)),
  constraint ledger_journals_reference_pair
    check ((reference_type is null) = (reference_id is null))
);

create index ledger_journals_asset_id_idx
  on finance.ledger_journals (asset_id);
create index ledger_journals_status_created_idx
  on finance.ledger_journals (status, created_at);
create index ledger_journals_reference_idx
  on finance.ledger_journals (reference_type, reference_id)
  where reference_type is not null;
create index ledger_journals_reversal_of_idx
  on finance.ledger_journals (reversal_of_journal_id)
  where reversal_of_journal_id is not null;

create table finance.ledger_entries (
  id bigint generated always as identity primary key,
  journal_id bigint not null references finance.ledger_journals (id),
  account_id bigint not null references finance.ledger_accounts (id),
  sequence_number smallint not null check (sequence_number > 0),
  direction text not null check (direction in ('DEBIT', 'CREDIT')),
  amount numeric(38,18) not null check (amount > 0),
  memo text,
  created_at timestamptz not null default statement_timestamp(),
  unique (journal_id, sequence_number)
);

comment on column finance.ledger_entries.amount is
  'Exact decimal amount; floating-point money is forbidden.';

create index ledger_entries_journal_id_idx
  on finance.ledger_entries (journal_id);
create index ledger_entries_account_id_idx
  on finance.ledger_entries (account_id);

create or replace function finance.guard_ledger_entry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_journal_id bigint := coalesce(new.journal_id, old.journal_id);
  journal_status text;
  journal_asset_id bigint;
  account_asset_id bigint;
begin
  select j.status, j.asset_id
    into journal_status, journal_asset_id
  from finance.ledger_journals j
  where j.id = target_journal_id
  for update;

  if journal_status is null then
    raise exception 'Ledger journal % does not exist', target_journal_id
      using errcode = '23503';
  end if;

  if journal_status <> 'DRAFT' then
    raise exception 'Entries for posted journal % are immutable', target_journal_id
      using errcode = '55000';
  end if;

  if tg_op <> 'DELETE' then
    select a.asset_id into account_asset_id
    from finance.ledger_accounts a
    where a.id = new.account_id;

    if account_asset_id is distinct from journal_asset_id then
      raise exception 'Ledger entry account asset must match journal asset'
        using errcode = '23514';
    end if;

    return new;
  end if;

  return old;
end;
$$;

create trigger ledger_entries_guard
before insert or update or delete on finance.ledger_entries
for each row execute function finance.guard_ledger_entry_mutation();

create or replace function finance.guard_ledger_journal_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  entry_count bigint;
  debit_total numeric(38,18);
  credit_total numeric(38,18);
begin
  if tg_op = 'DELETE' then
    raise exception 'Ledger journals cannot be deleted'
      using errcode = '55000';
  end if;

  if old.status <> 'DRAFT' then
    raise exception 'Posted ledger journals are immutable'
      using errcode = '55000';
  end if;

  if new.status <> 'POSTED' or new.posted_at is null then
    raise exception 'The only journal transition is DRAFT to POSTED'
      using errcode = '23514';
  end if;

  if row(
    new.id, new.public_id, new.asset_id, new.journal_type,
    new.idempotency_key, new.request_id, new.reference_type,
    new.reference_id, new.description, new.reversal_of_journal_id,
    new.created_by, new.created_at
  ) is distinct from row(
    old.id, old.public_id, old.asset_id, old.journal_type,
    old.idempotency_key, old.request_id, old.reference_type,
    old.reference_id, old.description, old.reversal_of_journal_id,
    old.created_by, old.created_at
  ) then
    raise exception 'Journal metadata cannot change while posting'
      using errcode = '55000';
  end if;

  select
    count(*),
    coalesce(sum(e.amount) filter (where e.direction = 'DEBIT'), 0),
    coalesce(sum(e.amount) filter (where e.direction = 'CREDIT'), 0)
  into entry_count, debit_total, credit_total
  from finance.ledger_entries e
  where e.journal_id = old.id;

  if entry_count < 2 then
    raise exception 'A posted journal requires at least two entries'
      using errcode = '23514';
  end if;

  if debit_total <> credit_total then
    raise exception 'Ledger journal % is unbalanced: debits %, credits %',
      old.id, debit_total, credit_total
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger ledger_journals_guard
before update or delete on finance.ledger_journals
for each row execute function finance.guard_ledger_journal_mutation();

create or replace function finance.post_ledger_journal(
  p_journal_id bigint,
  p_expected_entry_count integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  journal_public_id uuid;
  journal_status text;
  actual_entry_count integer;
begin
  select j.public_id, j.status
    into journal_public_id, journal_status
  from finance.ledger_journals j
  where j.id = p_journal_id
  for update;

  if journal_public_id is null then
    raise exception 'Ledger journal % does not exist', p_journal_id
      using errcode = 'P0002';
  end if;

  if journal_status = 'POSTED' then
    return journal_public_id;
  end if;

  select count(*) into actual_entry_count
  from finance.ledger_entries e
  where e.journal_id = p_journal_id;

  if p_expected_entry_count is not null
    and actual_entry_count <> p_expected_entry_count then
    raise exception 'Expected % entries, found %',
      p_expected_entry_count, actual_entry_count
      using errcode = '23514';
  end if;

  update finance.ledger_journals
  set status = 'POSTED', posted_at = statement_timestamp()
  where id = p_journal_id;

  insert into eventing.domain_events (
    event_type, aggregate_type, aggregate_id, payload,
    idempotency_key, request_id
  )
  select
    'LEDGER_JOURNAL_POSTED',
    'LEDGER_JOURNAL',
    j.public_id::text,
    jsonb_build_object('journal_id', j.public_id, 'asset_id', j.asset_id),
    'ledger-journal-posted:' || j.public_id::text,
    j.request_id
  from finance.ledger_journals j
  where j.id = p_journal_id
  on conflict (idempotency_key) do nothing;

  return journal_public_id;
end;
$$;

revoke all on function finance.guard_ledger_entry_mutation()
  from public, anon, authenticated;
revoke all on function finance.guard_ledger_journal_mutation()
  from public, anon, authenticated;
revoke all on function finance.post_ledger_journal(bigint, integer)
  from public, anon, authenticated;
grant execute on function finance.post_ledger_journal(bigint, integer)
  to service_role;

alter table finance.ledger_accounts enable row level security;
alter table finance.ledger_journals enable row level security;
alter table finance.ledger_entries enable row level security;

-- Auth provisioning and user-visible audit -----------------------------------

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Country is intentionally server-controlled. Never trust raw_user_meta_data
  -- for authorization, jurisdiction, limits, roles, or any financial decision.
  insert into public.user_accounts (user_id, country_code)
  values (new.id, 'NG');

  insert into public.profiles (user_id, display_name, avatar_path)
  values (
    new.id,
    nullif(left(trim(new.raw_user_meta_data ->> 'display_name'), 80), ''),
    nullif(new.raw_user_meta_data ->> 'avatar_path', '')
  );

  insert into eventing.domain_events (
    event_type, aggregate_type, aggregate_id, payload,
    idempotency_key
  ) values (
    'USER_REGISTERED', 'USER', new.id::text,
    jsonb_build_object('user_id', new.id, 'country_code', 'NG'),
    'user-registered:' || new.id::text
  );

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user()
  from public, anon, authenticated, service_role;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.audit_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into audit.records (
    actor_user_id, actor_type, action, resource_type, resource_id,
    before_state, after_state
  ) values (
    (select auth.uid()),
    'USER',
    'PROFILE_UPDATED',
    'PROFILE',
    new.user_id::text,
    to_jsonb(old),
    to_jsonb(new)
  );

  return new;
end;
$$;

revoke all on function private.audit_profile_update()
  from public, anon, authenticated, service_role;

create trigger profiles_audit_update
after update on public.profiles
for each row execute function private.audit_profile_update();

-- Seed controlled Phase 1 state ----------------------------------------------

-- Backfill any Auth users that predate this first application migration.
insert into public.user_accounts (user_id, country_code)
select u.id, 'NG'
from auth.users u
on conflict (user_id) do nothing;

insert into public.profiles (user_id, display_name, avatar_path)
select
  u.id,
  nullif(left(trim(u.raw_user_meta_data ->> 'display_name'), 80), ''),
  nullif(u.raw_user_meta_data ->> 'avatar_path', '')
from auth.users u
on conflict (user_id) do nothing;

insert into eventing.domain_events (
  event_type, aggregate_type, aggregate_id, payload, idempotency_key
)
select
  'USER_REGISTERED',
  'USER',
  u.id::text,
  jsonb_build_object('user_id', u.id, 'country_code', 'NG', 'backfilled', true),
  'user-registered:' || u.id::text
from auth.users u
on conflict (idempotency_key) do nothing;

insert into public.assets (
  code, name, symbol, asset_type, minor_units,
  accounting_precision, display_precision, pricing_precision,
  status, metadata
) values
  ('NGN', 'Nigerian Naira', '₦', 'FIAT', 2, 8, 2, 6, 'ACTIVE',
    '{"launch_asset": true}'::jsonb),
  ('USDC', 'USD Coin', 'USDC', 'STABLECOIN', 6, 8, 6, 6, 'DISABLED',
    '{"foundation_only": true}'::jsonb)
on conflict (code) do nothing;

insert into public.jurisdictions (country_code, name, status, metadata)
values ('NG', 'Nigeria', 'ACTIVE', '{"launch_market": true}'::jsonb)
on conflict (country_code) do nothing;

insert into public.jurisdiction_assets (jurisdiction_id, asset_id, status)
select j.id, a.id,
  case when a.code = 'NGN' then 'ACTIVE' else 'DISABLED' end
from public.jurisdictions j
cross join public.assets a
where j.country_code = 'NG'
  and a.code in ('NGN', 'USDC')
on conflict (jurisdiction_id, asset_id) do nothing;

insert into public.capability_rules (
  capability_key, country_code, version, enabled,
  reason_code, status, effective_at, approved_by
) values
  ('create_post', 'NG', 1, false, 'PHASE_6_NOT_ENABLED', 'ACTIVE', '-infinity', null),
  ('submit_market_proposal', 'NG', 1, false, 'PHASE_3_NOT_ENABLED', 'ACTIVE', '-infinity', null),
  ('view_portfolio', 'NG', 1, false, 'PHASE_4_NOT_ENABLED', 'ACTIVE', '-infinity', null),
  ('trade', 'NG', 1, false, 'PHASE_4_NOT_ENABLED', 'ACTIVE', '-infinity', null),
  ('deposit', 'NG', 1, false, 'PHASE_2_NOT_ENABLED', 'ACTIVE', '-infinity', null),
  ('withdraw', 'NG', 1, false, 'PHASE_2_NOT_ENABLED', 'ACTIVE', '-infinity', null)
on conflict (capability_key, country_code, version) do nothing;

insert into admin.roles (code, name, description) values
  ('SUPER_ADMIN', 'Super Admin', 'Emergency and platform-wide control with dual-control obligations.'),
  ('FINANCE_ADMIN', 'Finance Admin', 'Ledger, payments, withdrawals, reconciliation, fees, and revenue operations.'),
  ('MARKET_ADMIN', 'Market Admin', 'Market proposals, canonical events, and market governance.'),
  ('ORACLE_REVIEWER', 'Oracle Reviewer', 'Oracle evidence, conflicts, disputes, and resolution review.'),
  ('RISK_ADMIN', 'Risk Admin', 'Risk cases, controls, and safety actions.'),
  ('COMPLIANCE_ADMIN', 'Compliance Admin', 'Identity verification and compliance review.'),
  ('CONTENT_MODERATOR', 'Content Moderator', 'User-generated content moderation.'),
  ('SUPPORT_AGENT', 'Support Agent', 'Scoped customer support case access.'),
  ('READ_ONLY_AUDITOR', 'Read-only Auditor', 'Read-only audit and control evidence access.')
on conflict (code) do nothing;

insert into admin.permissions (code, description) values
  ('admin.roles.manage', 'Assign, approve, and revoke administrative roles.'),
  ('assets.manage', 'Manage asset lifecycle and jurisdiction availability.'),
  ('audit.read', 'Read immutable audit evidence.'),
  ('finance.read', 'Read finance and ledger reports.'),
  ('finance.journals.post', 'Post balanced ledger journals through trusted services.'),
  ('markets.manage', 'Review and administer market lifecycle.'),
  ('oracle.review', 'Review oracle evidence and disputes.'),
  ('policies.manage', 'Create and approve versioned platform policies.'),
  ('providers.manage', 'Configure provider routing and health state.'),
  ('risk.manage', 'Review and act on risk signals.'),
  ('compliance.manage', 'Review KYC and compliance cases.'),
  ('content.moderate', 'Moderate user-generated content.'),
  ('support.read', 'Read support-safe user and case information.')
on conflict (code) do nothing;

insert into admin.role_permissions (role_id, permission_id)
select r.id, p.id
from admin.roles r
cross join admin.permissions p
where r.code = 'SUPER_ADMIN'
on conflict do nothing;

with grants(role_code, permission_code) as (
  values
    ('FINANCE_ADMIN', 'finance.read'),
    ('FINANCE_ADMIN', 'finance.journals.post'),
    ('FINANCE_ADMIN', 'assets.manage'),
    ('MARKET_ADMIN', 'markets.manage'),
    ('ORACLE_REVIEWER', 'oracle.review'),
    ('RISK_ADMIN', 'risk.manage'),
    ('COMPLIANCE_ADMIN', 'compliance.manage'),
    ('CONTENT_MODERATOR', 'content.moderate'),
    ('SUPPORT_AGENT', 'support.read'),
    ('READ_ONLY_AUDITOR', 'audit.read'),
    ('READ_ONLY_AUDITOR', 'finance.read')
)
insert into admin.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join admin.roles r on r.code = g.role_code
join admin.permissions p on p.code = g.permission_code
on conflict do nothing;

insert into policy.policies (
  domain, name, description, status
) values (
  'PLATFORM',
  'launch_phase',
  'Controls which product phase is operationally enabled.',
  'ACTIVE'
)
on conflict (domain, name) do nothing;

insert into policy.policy_versions (
  policy_id, version, configuration, effective_at, reason
)
select
  p.id,
  1,
  '{"phase": 1, "country_code": "NG", "settlement_asset": "NGN"}'::jsonb,
  '-infinity',
  'Initial Phase 1 foundation from the VAD architecture directive.'
from policy.policies p
where p.domain = 'PLATFORM' and p.name = 'launch_phase'
on conflict (policy_id, version) do nothing;

update policy.policies p
set current_version_id = pv.id
from policy.policy_versions pv
where pv.policy_id = p.id
  and p.domain = 'PLATFORM'
  and p.name = 'launch_phase'
  and pv.version = 1
  and p.current_version_id is null;

insert into policy.feature_flags (code, name, description, status) values
  ('USDC', 'USDC', 'Enable USDC as a settlement asset.', 'ACTIVE'),
  ('CRYPTO_WALLET', 'Crypto Wallet', 'Enable crypto wallet rails.', 'ACTIVE'),
  ('POLITICAL_MARKETS', 'Political Markets', 'Enable the political market category.', 'ACTIVE'),
  ('PREDICTION_BATTLES', 'Prediction Battles', 'Enable social prediction battles.', 'ACTIVE'),
  ('THESIS', 'Thesis', 'Enable creator thesis collections.', 'ACTIVE'),
  ('AMM', 'AMM', 'Enable automated market-maker liquidity.', 'ACTIVE'),
  ('CREATOR_REVENUE_SHARE', 'Creator Revenue Share', 'Enable creator revenue sharing.', 'ACTIVE'),
  ('AI_CREATOR_ASSISTANT', 'AI Creator Assistant', 'Enable AI-assisted creator tools.', 'ACTIVE')
on conflict (code) do nothing;

insert into policy.feature_flag_versions (
  feature_flag_id, version, enabled, rules, effective_at, reason
)
select
  f.id,
  1,
  false,
  '{}'::jsonb,
  '-infinity',
  'Disabled at Phase 1 launch foundation.'
from policy.feature_flags f
on conflict (feature_flag_id, version) do nothing;

update policy.feature_flags f
set current_version_id = fv.id
from policy.feature_flag_versions fv
where fv.feature_flag_id = f.id
  and fv.version = 1
  and f.current_version_id is null;

insert into finance.ledger_accounts (
  asset_id, account_type, owner_type, owner_reference
)
select a.id, account_type, 'PLATFORM', 'VAD'
from public.assets a
cross join (values ('TREASURY'), ('SUSPENSE')) as account_types(account_type)
where a.code = 'NGN'
on conflict (asset_id, account_type, owner_type, owner_reference) do nothing;

-- No public client gets direct access to protected schemas. Explicit service
-- grants make the intended trusted boundary visible and auditable.
grant select, insert, update, delete on all tables in schema admin, policy, integration
  to service_role;
grant select, insert, update, delete on all tables in schema finance, eventing
  to service_role;
grant select, insert on audit.records to service_role;
grant usage, select on all sequences in schema admin, policy, finance, integration, audit
  to service_role;
