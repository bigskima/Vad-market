-- VAD Play: extensible game engines, ad placements and non-cash rewards.
-- This schema is deliberately configuration-only: provider integrations and game
-- runtime mutations must use authenticated, idempotent server-side workflows.
-- No paid game, ad provider, or reward is activated by this migration.

begin;

create table if not exists public.play_engine_registry (
  engine_key text primary key
    check (engine_key ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  engine_family text not null
    check (engine_family in ('PRIZE_DRAW','INSTANT_GAME','REVEAL_GAME')),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  description text,
  rollout_status text not null default 'REVIEW_REQUIRED'
    check (rollout_status in ('DRAFT','REVIEW_REQUIRED','ENABLED','PAUSED','RETIRED')),
  supported_platforms text[] not null default array['WEB','ANDROID','IOS']::text[]
    check (cardinality(supported_platforms) > 0 and supported_platforms <@ array['WEB','ANDROID','IOS']::text[]),
  requires_legal_review boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.play_engine_releases (
  engine_key text not null references public.play_engine_registry(engine_key) on delete restrict,
  version integer not null check (version > 0),
  rollout_status text not null default 'REVIEW_REQUIRED'
    check (rollout_status in ('DRAFT','REVIEW_REQUIRED','ENABLED','PAUSED','RETIRED')),
  config_schema jsonb not null default '{}'::jsonb
    check (jsonb_typeof(config_schema) = 'object'),
  release_notes text,
  created_at timestamptz not null default now(),
  enabled_at timestamptz,
  primary key (engine_key, version)
);

-- These are the three initially supported code engines, not pre-published games
-- or campaign defaults. They remain disabled pending runtime/compliance review.
insert into public.play_engine_registry
  (engine_key, engine_family, display_name, description, rollout_status, requires_legal_review)
values
  ('PRIZE_DRAW', 'PRIZE_DRAW', 'Prize Draws', 'Campaign-based prize draws with configured entry and funding rules.', 'REVIEW_REQUIRED', true),
  ('SPIN_AND_WIN', 'INSTANT_GAME', 'Spin & Win', 'Instant outcome game with server-controlled outcome probabilities and reward limits.', 'REVIEW_REQUIRED', true),
  ('SCRATCH_AND_REVEAL', 'REVEAL_GAME', 'Scratch & Reveal', 'Reveal-based game with server-controlled outcomes and reward limits.', 'REVIEW_REQUIRED', true)
on conflict (engine_key) do nothing;

insert into public.play_engine_releases (engine_key, version, rollout_status, config_schema, release_notes)
values
  ('PRIZE_DRAW', 1, 'REVIEW_REQUIRED', '{}'::jsonb, 'Initial registered engine contract; paid entry, payment reconciliation and auditable draw runtime are not enabled by this migration.'),
  ('SPIN_AND_WIN', 1, 'REVIEW_REQUIRED', '{}'::jsonb, 'Initial registered engine contract; outcome selection and reward settlement require a server runtime.'),
  ('SCRATCH_AND_REVEAL', 1, 'REVIEW_REQUIRED', '{}'::jsonb, 'Initial registered engine contract; reveal outcome and reward settlement require a server runtime.')
on conflict (engine_key, version) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'play_experiences_engine_registry_fk'
      and conrelid = 'public.play_experiences'::regclass
  ) then
    alter table public.play_experiences
      add constraint play_experiences_engine_registry_fk
      foreign key (engine_key) references public.play_engine_registry(engine_key)
      on update cascade on delete restrict not valid;
  end if;
end $$;

create table if not exists public.play_game_outcome_rules (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.play_experiences(id) on delete restrict,
  engine_key text not null,
  engine_version integer not null,
  outcome_code text not null check (outcome_code ~ '^[A-Z0-9][A-Z0-9_-]{0,79}$'),
  display_label text not null check (char_length(btrim(display_label)) between 1 and 160),
  weight_units bigint not null check (weight_units > 0),
  reward_kind text not null default 'NONE'
    check (reward_kind in ('NONE','PLAY_POINTS','NON_CASH_REWARD','PHYSICAL_PRIZE')),
  reward_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(reward_config) = 'object'),
  max_awards bigint check (max_awards is null or max_awards >= 0),
  awards_count bigint not null default 0 check (awards_count >= 0),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_id, engine_key, engine_version, outcome_code),
  foreign key (engine_key, engine_version)
    references public.play_engine_releases(engine_key, version) on delete restrict,
  check (max_awards is null or awards_count <= max_awards)
);

create index if not exists play_game_outcome_rules_active_idx
  on public.play_game_outcome_rules(experience_id, engine_key, engine_version)
  where active = true;

create table if not exists public.play_game_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  experience_id uuid not null references public.play_experiences(id) on delete restrict,
  campaign_id uuid references public.play_campaigns(id) on delete restrict,
  engine_key text not null,
  engine_version integer not null,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  status text not null default 'CREATED'
    check (status in ('CREATED','IN_PROGRESS','OUTCOME_PENDING','COMPLETED','FAILED','CANCELLED','EXPIRED')),
  public_result jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_result) = 'object'),
  private_outcome jsonb not null default '{}'::jsonb
    check (jsonb_typeof(private_outcome) = 'object'),
  failure_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  foreign key (engine_key, engine_version)
    references public.play_engine_releases(engine_key, version) on delete restrict
);

create index if not exists play_game_sessions_user_recent_idx
  on public.play_game_sessions(user_id, created_at desc);
create index if not exists play_game_sessions_experience_status_idx
  on public.play_game_sessions(experience_id, status, created_at desc);

create table if not exists public.play_game_audit_events (
  id bigint generated always as identity primary key,
  session_id uuid references public.play_game_sessions(id) on delete restrict,
  experience_id uuid references public.play_experiences(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('USER','SYSTEM','ADMIN','PROVIDER')),
  event_type text not null check (event_type ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  event_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_data) = 'object'),
  occurred_at timestamptz not null default now()
);

create index if not exists play_game_audit_events_session_idx
  on public.play_game_audit_events(session_id, occurred_at desc);

create table if not exists public.play_ad_providers (
  provider_key text primary key check (provider_key ~ '^[a-z][a-z0-9_-]{1,79}$'),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 120),
  adapter_key text not null check (adapter_key ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  supported_platforms text[] not null
    check (cardinality(supported_platforms) > 0 and supported_platforms <@ array['WEB','ANDROID','IOS']::text[]),
  status text not null default 'DISABLED'
    check (status in ('DISABLED','CONFIGURED','ENABLED','PAUSED','REVIEW_REQUIRED')),
  public_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_config) = 'object'),
  secret_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.play_ad_placements (
  id uuid primary key default gen_random_uuid(),
  placement_code text not null unique
    check (placement_code ~ '^[a-z][a-z0-9_-]{1,99}$'),
  provider_key text not null references public.play_ad_providers(provider_key) on delete restrict,
  ad_format text not null
    check (ad_format in ('BANNER','NATIVE','INTERSTITIAL','REWARDED','DIRECT_SPONSOR')),
  platforms text[] not null
    check (cardinality(platforms) > 0 and platforms <@ array['WEB','ANDROID','IOS']::text[]),
  placement_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(placement_config) = 'object'),
  reward_points integer check (reward_points is null or reward_points > 0),
  opt_in_required boolean not null default false,
  daily_user_cap integer check (daily_user_cap is null or daily_user_cap > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'DISABLED'
    check (status in ('DRAFT','REVIEW_REQUIRED','ACTIVE','PAUSED','RETIRED')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (ad_format <> 'REWARDED' or opt_in_required = true),
  check (ad_format <> 'REWARDED' or reward_points is not null)
);

create index if not exists play_ad_placements_status_idx
  on public.play_ad_placements(status, starts_at, ends_at);

create table if not exists public.play_ad_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  placement_id uuid not null references public.play_ad_placements(id) on delete restrict,
  provider_key text not null references public.play_ad_providers(provider_key) on delete restrict,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  status text not null default 'CREATED'
    check (status in ('CREATED','DISPLAYED','COMPLETION_PENDING','VERIFIED','REJECTED','EXPIRED','CREDITED')),
  points_snapshot integer check (points_snapshot is null or points_snapshot > 0),
  provider_session_ref text,
  expires_at timestamptz not null,
  verified_at timestamptz,
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists play_ad_sessions_user_recent_idx
  on public.play_ad_sessions(user_id, created_at desc);

create table if not exists public.play_ad_completion_events (
  id bigint generated always as identity primary key,
  provider_key text not null references public.play_ad_providers(provider_key) on delete restrict,
  provider_event_id text not null,
  session_id uuid references public.play_ad_sessions(id) on delete restrict,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  signature_verified boolean not null default false,
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED','VERIFIED','REJECTED','PROCESSED')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider_key, provider_event_id)
);

create table if not exists public.play_points_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  event_type text not null
    check (event_type in ('EARN','ADJUSTMENT','REDEEM','EXPIRE','REVERSE')),
  points_delta bigint not null check (points_delta <> 0),
  source_type text not null check (source_type ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  source_reference text,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists play_points_ledger_user_recent_idx
  on public.play_points_ledger(user_id, created_at desc);

create or replace function public.prevent_play_points_ledger_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'play_points_ledger is append-only; write a compensating entry instead';
end;
$$;

drop trigger if exists play_points_ledger_append_only on public.play_points_ledger;
create trigger play_points_ledger_append_only
before update or delete on public.play_points_ledger
for each row execute function public.prevent_play_points_ledger_mutation();

create table if not exists public.play_rewards (
  id uuid primary key default gen_random_uuid(),
  reward_code text not null unique check (reward_code ~ '^[a-z][a-z0-9_-]{1,99}$'),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text,
  reward_type text not null
    check (reward_type in ('IN_APP_PERK','FEE_DISCOUNT','PARTNER_VOUCHER','AIRTIME_OR_DATA','MERCHANDISE','PLAY_BENEFIT')),
  points_cost bigint not null check (points_cost > 0),
  inventory_limit bigint check (inventory_limit is null or inventory_limit >= 0),
  inventory_reserved bigint not null default 0 check (inventory_reserved >= 0),
  inventory_fulfilled bigint not null default 0 check (inventory_fulfilled >= 0),
  geographic_rules jsonb not null default '{}'::jsonb check (jsonb_typeof(geographic_rules) = 'object'),
  terms text,
  fulfillment_config jsonb not null default '{}'::jsonb check (jsonb_typeof(fulfillment_config) = 'object'),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','REVIEW_REQUIRED','ACTIVE','PAUSED','SOLD_OUT','RETIRED')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (inventory_limit is null or inventory_reserved + inventory_fulfilled <= inventory_limit),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create index if not exists play_rewards_available_idx
  on public.play_rewards(status, starts_at, ends_at);

create table if not exists public.play_reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  reward_id uuid not null references public.play_rewards(id) on delete restrict,
  points_cost_snapshot bigint not null check (points_cost_snapshot > 0),
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 8 and 200),
  status text not null default 'PENDING'
    check (status in ('PENDING','APPROVED','FULFILLING','FULFILLED','CANCELLED','FAILED')),
  points_ledger_id bigint references public.play_points_ledger(id) on delete restrict,
  fulfillment_reference text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  unique (user_id, idempotency_key)
);

create index if not exists play_reward_redemptions_user_recent_idx
  on public.play_reward_redemptions(user_id, created_at desc);

-- Ensure campaign economics and the campaign-type mapping remain data-driven.
create or replace function public.play_validate_campaign_engine()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_family text;
begin
  select r.engine_family into v_family
  from public.play_experiences e
  join public.play_engine_registry r on r.engine_key = e.engine_key
  where e.id = new.experience_id;

  if v_family is distinct from 'PRIZE_DRAW' then
    raise exception 'This experience is not registered for the prize-draw engine';
  end if;
  return new;
end;
$$;

drop trigger if exists play_campaign_engine_guard on public.play_campaigns;
create trigger play_campaign_engine_guard
before insert or update of experience_id on public.play_campaigns
for each row execute function public.play_validate_campaign_engine();

alter table public.play_engine_registry enable row level security;
alter table public.play_engine_releases enable row level security;
alter table public.play_game_outcome_rules enable row level security;
alter table public.play_game_sessions enable row level security;
alter table public.play_game_audit_events enable row level security;
alter table public.play_ad_providers enable row level security;
alter table public.play_ad_placements enable row level security;
alter table public.play_ad_sessions enable row level security;
alter table public.play_ad_completion_events enable row level security;
alter table public.play_points_ledger enable row level security;
alter table public.play_rewards enable row level security;
alter table public.play_reward_redemptions enable row level security;

drop policy if exists play_engine_registry_read on public.play_engine_registry;
create policy play_engine_registry_read on public.play_engine_registry
  for select to authenticated using (true);
drop policy if exists play_engine_releases_read on public.play_engine_releases;
create policy play_engine_releases_read on public.play_engine_releases
  for select to authenticated using (rollout_status = 'ENABLED');
drop policy if exists play_game_sessions_read_own on public.play_game_sessions;
create policy play_game_sessions_read_own on public.play_game_sessions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists play_ad_placements_active_read on public.play_ad_placements;
create policy play_ad_placements_active_read on public.play_ad_placements
  for select to anon, authenticated using (
    status = 'ACTIVE'
    and (starts_at is null or starts_at <= statement_timestamp())
    and (ends_at is null or ends_at > statement_timestamp())
    and exists (
      select 1 from public.play_ad_providers p
      where p.provider_key = play_ad_placements.provider_key
        and p.status = 'ENABLED'
    )
  );
drop policy if exists play_ad_providers_public_read on public.play_ad_providers;
create policy play_ad_providers_public_read on public.play_ad_providers
  for select to anon, authenticated using (status = 'ENABLED');
drop policy if exists play_ad_sessions_read_own on public.play_ad_sessions;
create policy play_ad_sessions_read_own on public.play_ad_sessions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists play_points_ledger_read_own on public.play_points_ledger;
create policy play_points_ledger_read_own on public.play_points_ledger
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists play_rewards_active_read on public.play_rewards;
create policy play_rewards_active_read on public.play_rewards
  for select to anon, authenticated using (
    status = 'ACTIVE'
    and (starts_at is null or starts_at <= statement_timestamp())
    and (ends_at is null or ends_at > statement_timestamp())
  );
drop policy if exists play_reward_redemptions_read_own on public.play_reward_redemptions;
create policy play_reward_redemptions_read_own on public.play_reward_redemptions
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.play_engine_registry, public.play_engine_releases,
  public.play_game_outcome_rules, public.play_game_sessions, public.play_game_audit_events,
  public.play_ad_providers, public.play_ad_placements, public.play_ad_sessions,
  public.play_ad_completion_events, public.play_points_ledger, public.play_rewards,
  public.play_reward_redemptions
from anon, authenticated;

grant select (engine_key, engine_family, display_name, description, rollout_status, supported_platforms, requires_legal_review, created_at, updated_at)
  on public.play_engine_registry to authenticated;
grant select (engine_key, version, rollout_status, config_schema, release_notes, created_at, enabled_at)
  on public.play_engine_releases to authenticated;
grant select (id, user_id, experience_id, campaign_id, engine_key, engine_version, idempotency_key, status, public_result, started_at, completed_at, created_at)
  on public.play_game_sessions to authenticated;
grant select (provider_key, display_name, adapter_key, supported_platforms, status, public_config)
  on public.play_ad_providers to anon, authenticated;
grant select (id, placement_code, provider_key, ad_format, platforms, placement_config, reward_points, opt_in_required, daily_user_cap, starts_at, ends_at, status)
  on public.play_ad_placements to anon, authenticated;
grant select (id, user_id, placement_id, provider_key, idempotency_key, status, points_snapshot, provider_session_ref, expires_at, verified_at, credited_at, created_at)
  on public.play_ad_sessions to authenticated;
grant select (id, user_id, event_type, points_delta, source_type, source_reference, idempotency_key, metadata, created_at)
  on public.play_points_ledger to authenticated;
grant select (id, reward_code, title, description, reward_type, points_cost, inventory_limit, inventory_reserved, inventory_fulfilled, geographic_rules, terms, status, starts_at, ends_at)
  on public.play_rewards to anon, authenticated;
grant select (id, user_id, reward_id, points_cost_snapshot, idempotency_key, status, points_ledger_id, fulfillment_reference, failure_code, created_at, updated_at, fulfilled_at)
  on public.play_reward_redemptions to authenticated;

grant all on public.play_engine_registry, public.play_engine_releases, public.play_game_outcome_rules,
  public.play_game_sessions, public.play_game_audit_events, public.play_ad_providers,
  public.play_ad_placements, public.play_ad_sessions, public.play_ad_completion_events,
  public.play_points_ledger, public.play_rewards, public.play_reward_redemptions
to service_role;

grant usage, select on sequence public.play_game_audit_events_id_seq,
  public.play_ad_completion_events_id_seq, public.play_points_ledger_id_seq to service_role;

comment on table public.play_engine_registry is
  'Registry of implemented VAD Play game engines. Registry metadata does not make a missing server runtime operational.';
comment on table public.play_engine_releases is
  'Versioned, reviewed engine configurations. No engine is enabled by the initial seed.';
comment on table public.play_game_outcome_rules is
  'Server-only weighted outcome rules; clients cannot read, choose or alter outcomes.';
comment on table public.play_game_sessions is
  'Server-created game sessions with private outcomes separated from the public result.';
comment on table public.play_ad_providers is
  'Advertising adapter metadata. Credentials are secret references only and must not be stored in public_config.';
comment on table public.play_ad_completion_events is
  'Provider callback deduplication and verification record. Client-side video completion is not proof of an ad reward.';
comment on table public.play_points_ledger is
  'Append-only, non-cash points ledger; it is separate from NGN/USDC balances and wallet/settlement ledgers.';
comment on table public.play_rewards is
  'Admin-managed non-cash reward catalogue. Cash and crypto wallet credits are not supported by this points catalogue.';

commit;
