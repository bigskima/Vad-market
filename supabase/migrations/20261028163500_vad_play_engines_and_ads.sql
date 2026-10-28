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

alter table public.play_engine_registry
  add column if not exists runtime_ready boolean not null default false;

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


-- An experience cannot be published while its registered server engine/release is
-- still under review or paused. The catalogue does not make a missing engine live.
create or replace function public.play_guard_experience_publishing()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_engine_status text;
  v_release_status text;
  v_runtime_ready boolean;
begin
  if new.status <> 'PUBLISHED' then
    return new;
  end if;

  select r.rollout_status, rel.rollout_status, r.runtime_ready
    into v_engine_status, v_release_status, v_runtime_ready
  from public.play_engine_registry r
  join public.play_engine_releases rel on rel.engine_key = r.engine_key
  where r.engine_key = new.engine_key
    and rel.version = (
      select max(rel2.version)
      from public.play_engine_releases rel2
      where rel2.engine_key = r.engine_key
    );

  if v_engine_status is distinct from 'ENABLED'
     or v_release_status is distinct from 'ENABLED'
     or v_runtime_ready is distinct from true then
    raise exception 'The selected VAD Play engine must be enabled before publishing';
  end if;
  return new;
end;
$$;

drop trigger if exists play_experience_publish_guard on public.play_experiences;
create trigger play_experience_publish_guard
before insert or update of status, engine_key on public.play_experiences
for each row execute function public.play_guard_experience_publishing();

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

-- Initial progress is zero, but the qualifying amount is updated only by a reconciler
-- that reads the existing VAD payment/financial ledger; this table is not a money ledger.
alter table public.play_campaigns
  add column if not exists qualifying_funds_amount numeric(24,8) not null default 0
  check (qualifying_funds_amount >= 0);
alter table public.play_campaigns
  add column if not exists prize_delivered_at timestamptz;

grant select (qualifying_funds_amount) on public.play_campaigns to authenticated;

insert into public.play_ad_providers
  (provider_key, display_name, adapter_key, supported_platforms, status, public_config)
values
  ('direct-sponsor', 'Direct Sponsorship', 'DIRECT_SPONSOR', array['WEB','ANDROID','IOS']::text[], 'DISABLED', '{}'::jsonb)
on conflict (provider_key) do nothing;

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

-- Enforce campaign-to-engine mapping and basic state gates in the database.
-- Monetary proceeds must still be reconciled from VAD's existing financial ledger
-- by a trusted server workflow; this field is a projection, not the source of truth.
create or replace function public.play_validate_campaign_engine()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_family text;
  v_engine_status text;
  v_release_status text;
  v_runtime_ready boolean;
begin
  select r.engine_family, r.rollout_status, rel.rollout_status, r.runtime_ready
    into v_family, v_engine_status, v_release_status, v_runtime_ready
  from public.play_experiences e
  join public.play_engine_registry r on r.engine_key = e.engine_key
  left join public.play_engine_releases rel
    on rel.engine_key = r.engine_key
   and rel.version = (
      select max(rel2.version)
      from public.play_engine_releases rel2
      where rel2.engine_key = r.engine_key
   )
  where e.id = new.experience_id;

  if v_family is distinct from 'PRIZE_DRAW' then
    raise exception 'This experience is not registered for the prize-draw engine';
  end if;

  if new.status = 'OPEN' then
    if v_engine_status is distinct from 'ENABLED'
       or v_release_status is distinct from 'ENABLED'
       or v_runtime_ready is distinct from true then
      raise exception 'The prize-draw engine is not enabled for new campaigns';
    end if;
    if new.compliance_approved_at is null then
      raise exception 'Compliance approval is required before a campaign can open';
    end if;
  end if;

  if new.status in ('FUNDING_TARGET_MET','DRAW_ELIGIBLE','DRAW_AUTHORIZED','DRAWN','SETTLED') then
    if new.qualifying_funds_amount < new.funding_threshold_amount
       or new.funding_target_met_at is null then
      raise exception 'The campaign has not met its configured funding threshold';
    end if;
  end if;

  if new.status in ('DRAW_ELIGIBLE','DRAW_AUTHORIZED','DRAWN','SETTLED') then
    if new.entries_closed_at is null
       or new.funds_reconciled_at is null
       or new.prize_secured_at is null
       or new.compliance_approved_at is null then
      raise exception 'The draw requires closed entries, reconciled proceeds, a secured prize, and compliance approval';
    end if;
  end if;

  if new.status in ('DRAW_AUTHORIZED','DRAWN','SETTLED') and new.draw_authorized_at is null then
    raise exception 'An authorized draw record is required';
  end if;
  if new.status in ('DRAWN','SETTLED') and new.drawn_at is null then
    raise exception 'The draw result timestamp is required';
  end if;
  if new.status = 'SETTLED' and new.prize_delivered_at is null then
    raise exception 'Prize delivery must be confirmed before settlement';
  end if;

  return new;
end;
$$;

drop trigger if exists play_campaign_engine_guard on public.play_campaigns;
create trigger play_campaign_engine_guard
before insert or update of
  experience_id, status, qualifying_funds_amount, funding_target_met_at,
  entries_closed_at, funds_reconciled_at, prize_secured_at, compliance_approved_at,
  draw_authorized_at, drawn_at, prize_delivered_at
on public.play_campaigns
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


-- VAD Play admin read/write API. All writes are permission-checked SECURITY DEFINER
-- routines; app clients are not granted direct INSERT/UPDATE/DELETE on these tables.
insert into admin.permissions (code, description)
values ('play.manage', 'Manage VAD Play experiences, campaign drafts, and sponsor placements')
on conflict (code) do update set description = excluded.description;

create or replace function public.admin_play_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'engines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'engine_key', r.engine_key,
        'engine_family', r.engine_family,
        'display_name', r.display_name,
        'description', r.description,
        'rollout_status', r.rollout_status,
        'runtime_ready', r.runtime_ready,
        'supported_platforms', r.supported_platforms,
        'requires_legal_review', r.requires_legal_review,
        'created_at', r.created_at,
        'updated_at', r.updated_at
      ) order by r.display_name)
      from public.play_engine_registry r
    ), '[]'::jsonb),
    'releases', coalesce((
      select jsonb_agg(to_jsonb(rel) order by rel.engine_key, rel.version desc)
      from public.play_engine_releases rel
    ), '[]'::jsonb),
    'experiences', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'slug', e.slug, 'title', e.title, 'subtitle', e.subtitle,
        'description', e.description, 'experience_type', e.experience_type,
        'engine_key', e.engine_key, 'status', e.status,
        'hero_asset_url', e.hero_asset_url, 'card_asset_url', e.card_asset_url,
        'image_alt', e.image_alt, 'display_order', e.display_order,
        'public_config', e.public_config, 'engine_config', e.engine_config,
        'published_at', e.published_at, 'created_at', e.created_at, 'updated_at', e.updated_at
      ) order by e.updated_at desc)
      from public.play_experiences e
    ), '[]'::jsonb),
    'campaigns', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'experience_id', c.experience_id, 'slug', c.slug,
        'title', c.title, 'prize_title', c.prize_title, 'currency_code', c.currency_code,
        'prize_cost_amount', c.prize_cost_amount, 'profit_target_mode', c.profit_target_mode,
        'profit_target_value', c.profit_target_value,
        'campaign_cost_budget_amount', c.campaign_cost_budget_amount,
        'funding_threshold_amount', c.funding_threshold_amount,
        'qualifying_funds_amount', c.qualifying_funds_amount,
        'entry_price_amount', c.entry_price_amount, 'max_entries', c.max_entries,
        'entry_limit_per_user', c.entry_limit_per_user, 'status', c.status,
        'rules_public', c.rules_public, 'opens_at', c.opens_at, 'closes_at', c.closes_at,
        'compliance_approved_at', c.compliance_approved_at, 'prize_secured_at', c.prize_secured_at,
        'funding_target_met_at', c.funding_target_met_at, 'entries_closed_at', c.entries_closed_at,
        'funds_reconciled_at', c.funds_reconciled_at, 'draw_authorized_at', c.draw_authorized_at,
        'drawn_at', c.drawn_at, 'prize_delivered_at', c.prize_delivered_at,
        'published_at', c.published_at, 'created_at', c.created_at, 'updated_at', c.updated_at
      ) order by c.updated_at desc)
      from public.play_campaigns c
    ), '[]'::jsonb),
    'adProviders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider_key', p.provider_key, 'display_name', p.display_name,
        'adapter_key', p.adapter_key, 'supported_platforms', p.supported_platforms,
        'status', p.status, 'public_config', p.public_config,
        'created_at', p.created_at, 'updated_at', p.updated_at
      ) order by p.display_name)
      from public.play_ad_providers p
    ), '[]'::jsonb),
    'adPlacements', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'placement_code', p.placement_code, 'provider_key', p.provider_key,
        'ad_format', p.ad_format, 'platforms', p.platforms,
        'placement_config', p.placement_config, 'reward_points', p.reward_points,
        'opt_in_required', p.opt_in_required, 'daily_user_cap', p.daily_user_cap,
        'starts_at', p.starts_at, 'ends_at', p.ends_at, 'status', p.status,
        'created_at', p.created_at, 'updated_at', p.updated_at
      ) order by p.updated_at desc)
      from public.play_ad_placements p
    ), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'reward_code', r.reward_code, 'title', r.title,
        'description', r.description, 'reward_type', r.reward_type,
        'points_cost', r.points_cost, 'inventory_limit', r.inventory_limit,
        'inventory_reserved', r.inventory_reserved, 'inventory_fulfilled', r.inventory_fulfilled,
        'status', r.status, 'starts_at', r.starts_at, 'ends_at', r.ends_at
      ) order by r.updated_at desc)
      from public.play_rewards r
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_play_upsert_experience(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_slug text;
  v_title text;
  v_engine_key text;
  v_type text;
  v_status text;
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Experience payload must be a JSON object' using errcode = '22023';
  end if;

  v_slug := lower(trim(coalesce(p_payload->>'slug','')));
  v_title := trim(coalesce(p_payload->>'title',''));
  v_engine_key := upper(trim(coalesce(p_payload->>'engine_key','')));
  v_type := upper(trim(coalesce(p_payload->>'experience_type','')));
  v_status := upper(coalesce(nullif(trim(p_payload->>'status'),''),'DRAFT'));
  v_id := nullif(p_payload->>'id','')::uuid;

  if v_slug = '' or v_title = '' or v_engine_key = '' or v_type = '' then
    raise exception 'Slug, title, experience type and engine are required' using errcode = '22023';
  end if;
  if v_status not in ('DRAFT','COMPLIANCE_REVIEW') then
    raise exception 'This workflow saves drafts; publishing requires a separate approved action' using errcode = '42501';
  end if;
  if p_payload ? 'public_config' and jsonb_typeof(p_payload->'public_config') <> 'object' then
    raise exception 'Public configuration must be a JSON object' using errcode = '22023';
  end if;
  if p_payload ? 'engine_config' and jsonb_typeof(p_payload->'engine_config') <> 'object' then
    raise exception 'Engine configuration must be a JSON object' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.play_experiences (
      slug, title, subtitle, description, experience_type, engine_key, status,
      hero_asset_url, card_asset_url, image_alt, display_order,
      public_config, engine_config, created_by
    ) values (
      v_slug, v_title, nullif(trim(coalesce(p_payload->>'subtitle','')),''),
      nullif(trim(coalesce(p_payload->>'description','')),''), v_type, v_engine_key, v_status,
      nullif(trim(coalesce(p_payload->>'hero_asset_url','')),''),
      nullif(trim(coalesce(p_payload->>'card_asset_url','')),''),
      nullif(trim(coalesce(p_payload->>'image_alt','')),''),
      coalesce(nullif(p_payload->>'display_order','')::integer,100),
      coalesce(p_payload->'public_config','{}'::jsonb),
      coalesce(p_payload->'engine_config','{}'::jsonb), auth.uid()
    ) returning id into v_id;
  else
    update public.play_experiences
    set slug = v_slug,
        title = v_title,
        subtitle = nullif(trim(coalesce(p_payload->>'subtitle','')),''),
        description = nullif(trim(coalesce(p_payload->>'description','')),''),
        experience_type = v_type,
        engine_key = v_engine_key,
        status = v_status,
        published_at = null,
        hero_asset_url = nullif(trim(coalesce(p_payload->>'hero_asset_url','')),''),
        card_asset_url = nullif(trim(coalesce(p_payload->>'card_asset_url','')),''),
        image_alt = nullif(trim(coalesce(p_payload->>'image_alt','')),''),
        display_order = coalesce(nullif(p_payload->>'display_order','')::integer,100),
        public_config = coalesce(p_payload->'public_config','{}'::jsonb),
        engine_config = coalesce(p_payload->'engine_config','{}'::jsonb),
        updated_at = now()
    where id = v_id and status in ('DRAFT','COMPLIANCE_REVIEW')
    returning id into v_id;

    if not found then
      raise exception 'Only an existing draft or compliance-review experience can be edited here' using errcode = '55000';
    end if;
  end if;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_id, auth.uid(), 'ADMIN', 'EXPERIENCE_DRAFT_SAVED',
    jsonb_build_object('slug', v_slug, 'engine_key', v_engine_key, 'status', v_status)
  );
  return v_id;
end;
$$;

create or replace function public.admin_play_upsert_campaign(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_experience_id uuid;
  v_slug text;
  v_title text;
  v_prize_title text;
  v_currency text;
  v_profit_mode text;
  v_prize_cost numeric;
  v_profit_value numeric;
  v_cost_budget numeric;
  v_entry_price numeric;
  v_max_entries integer;
  v_max_tickets_per_purchase integer;
  v_entry_limit_per_user integer;
  v_rules_public jsonb;
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Campaign payload must be a JSON object' using errcode = '22023';
  end if;

  v_id := nullif(p_payload->>'id','')::uuid;
  v_experience_id := nullif(p_payload->>'experience_id','')::uuid;
  v_slug := lower(trim(coalesce(p_payload->>'slug','')));
  v_title := trim(coalesce(p_payload->>'title',''));
  v_prize_title := trim(coalesce(p_payload->>'prize_title',''));
  v_currency := upper(trim(coalesce(p_payload->>'currency_code','')));
  v_profit_mode := upper(trim(coalesce(p_payload->>'profit_target_mode','')));
  v_prize_cost := nullif(p_payload->>'prize_cost_amount','')::numeric;
  v_profit_value := nullif(p_payload->>'profit_target_value','')::numeric;
  v_cost_budget := nullif(p_payload->>'campaign_cost_budget_amount','')::numeric;
  v_entry_price := nullif(p_payload->>'entry_price_amount','')::numeric;
  v_max_entries := nullif(p_payload->>'max_entries','')::integer;
  v_max_tickets_per_purchase := nullif(p_payload->>'max_tickets_per_purchase','')::integer;
  v_entry_limit_per_user := nullif(p_payload->>'entry_limit_per_user','')::integer;
  v_rules_public := coalesce(p_payload->'rules_public','{}'::jsonb);

  if v_experience_id is null or v_slug = '' or v_title = '' or v_prize_title = '' or v_currency = '' then
    raise exception 'Experience, slug, campaign title, prize title and currency are required' using errcode = '22023';
  end if;
  if v_profit_mode not in ('PERCENT_OF_PRIZE','FIXED_AMOUNT')
     or v_prize_cost is null or v_profit_value is null
     or v_cost_budget is null or v_entry_price is null then
    raise exception 'Prize cost, profit mode/value, campaign cost budget, and entry price must all be explicitly configured' using errcode = '22023';
  end if;
  if jsonb_typeof(v_rules_public) <> 'object'
     or jsonb_typeof(coalesce(p_payload->'engine_config','{}'::jsonb)) <> 'object' then
    raise exception 'Campaign rules and engine configuration must be JSON objects' using errcode = '22023';
  end if;
  if v_max_entries is null or v_max_entries <= 0
     or v_max_tickets_per_purchase is null or v_max_tickets_per_purchase <= 0
     or v_max_tickets_per_purchase > v_max_entries
     or (v_entry_limit_per_user is not null and (v_entry_limit_per_user <= 0 or v_entry_limit_per_user > v_max_entries)) then
    raise exception 'Configure valid finite campaign, per-purchase and optional per-user entry caps' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(v_rules_public->>'terms',''))) < 20
     or char_length(btrim(coalesce(v_rules_public->>'refund_policy',''))) < 10 then
    raise exception 'Campaign terms and refund/shortfall policy are required before saving this campaign' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.play_campaigns (
      experience_id, slug, title, prize_title, currency_code,
      prize_cost_amount, profit_target_mode, profit_target_value,
      campaign_cost_budget_amount, entry_price_amount,
      max_entries, max_tickets_per_purchase, entry_limit_per_user, rules_public, engine_config, created_by
    ) values (
      v_experience_id, v_slug, v_title, v_prize_title, v_currency,
      v_prize_cost, v_profit_mode, v_profit_value,
      v_cost_budget, v_entry_price,
      v_max_entries, v_max_tickets_per_purchase, v_entry_limit_per_user,
      v_rules_public,
      coalesce(p_payload->'engine_config','{}'::jsonb), auth.uid()
    ) returning id into v_id;
  else
    update public.play_campaigns
    set experience_id = v_experience_id, slug = v_slug, title = v_title,
        prize_title = v_prize_title, currency_code = v_currency,
        prize_cost_amount = v_prize_cost, profit_target_mode = v_profit_mode,
        profit_target_value = v_profit_value, campaign_cost_budget_amount = v_cost_budget,
        entry_price_amount = v_entry_price,
        max_entries = v_max_entries,
        max_tickets_per_purchase = v_max_tickets_per_purchase,
        entry_limit_per_user = v_entry_limit_per_user,
        rules_public = v_rules_public,
        engine_config = coalesce(p_payload->'engine_config','{}'::jsonb),
        updated_at = now()
    where id = v_id and status in ('DRAFT','COMPLIANCE_REVIEW')
    returning id into v_id;

    if not found then
      raise exception 'Only existing draft or compliance-review campaigns can be edited' using errcode = '55000';
    end if;
  end if;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_DRAFT_SAVED',
    jsonb_build_object('campaign_id', v_id, 'slug', v_slug, 'profit_target_mode', v_profit_mode)
  );
  return v_id;
end;
$$;

create or replace function public.admin_play_upsert_ad_placement(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text;
  v_provider_key text;
  v_status text;
  v_platforms text[];
  v_config jsonb;
  v_provider_status text;
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Ad placement payload must be a JSON object' using errcode = '22023';
  end if;

  v_id := nullif(p_payload->>'id','')::uuid;
  v_code := lower(trim(coalesce(p_payload->>'placement_code','')));
  v_provider_key := coalesce(nullif(trim(p_payload->>'provider_key'),''),'direct-sponsor');
  v_status := upper(coalesce(nullif(trim(p_payload->>'status'),''),'DRAFT'));
  if v_code = '' or v_provider_key <> 'direct-sponsor' then
    raise exception 'Provide a placement code for the supported direct-sponsor adapter' using errcode = '22023';
  end if;
  if v_status not in ('DRAFT','REVIEW_REQUIRED','PAUSED','ACTIVE','RETIRED') then
    raise exception 'Unsupported sponsor placement status' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'platforms') <> 'array' then
    raise exception 'Choose one or more supported platforms' using errcode = '22023';
  end if;
  v_platforms := array(
    select upper(value)
    from jsonb_array_elements_text(p_payload->'platforms') as items(value)
  );
  if cardinality(v_platforms) = 0 or not (v_platforms <@ array['WEB','ANDROID','IOS']::text[]) then
    raise exception 'Choose only WEB, ANDROID, and IOS platforms' using errcode = '22023';
  end if;
  v_config := coalesce(p_payload->'placement_config','{}'::jsonb);
  if jsonb_typeof(v_config) <> 'object' then
    raise exception 'Sponsor creative must be a JSON object' using errcode = '22023';
  end if;
  if v_status = 'ACTIVE' then
    if not private.is_super_admin() then
      raise exception 'Only a super admin can activate a sponsor placement' using errcode = '42501';
    end if;
    select p.status into v_provider_status
    from public.play_ad_providers p
    where p.provider_key = v_provider_key;
    if v_provider_status is distinct from 'ENABLED' then
      raise exception 'Enable the direct-sponsor provider before activating a placement' using errcode = '55000';
    end if;
  end if;

  if v_id is null then
    insert into public.play_ad_placements (
      placement_code, provider_key, ad_format, platforms, placement_config,
      reward_points, opt_in_required, daily_user_cap, starts_at, ends_at, status, created_by
    ) values (
      v_code, v_provider_key, 'DIRECT_SPONSOR', v_platforms, v_config,
      null, false,
      nullif(p_payload->>'daily_user_cap','')::integer,
      nullif(p_payload->>'starts_at','')::timestamptz,
      nullif(p_payload->>'ends_at','')::timestamptz,
      v_status, auth.uid()
    ) returning id into v_id;
  else
    update public.play_ad_placements
    set placement_code = v_code,
        provider_key = v_provider_key,
        platforms = v_platforms,
        placement_config = v_config,
        daily_user_cap = nullif(p_payload->>'daily_user_cap','')::integer,
        starts_at = nullif(p_payload->>'starts_at','')::timestamptz,
        ends_at = nullif(p_payload->>'ends_at','')::timestamptz,
        status = v_status,
        updated_at = now()
    where id = v_id
      and (
        status in ('DRAFT','REVIEW_REQUIRED','PAUSED','RETIRED')
        or (status = 'ACTIVE' and v_status = 'PAUSED')
      )
    returning id into v_id;
    if not found then
      raise exception 'Pause an active placement before editing it' using errcode = '55000';
    end if;
  end if;

  insert into public.play_game_audit_events(
    actor_user_id, actor_type, event_type, event_data
  ) values (
    auth.uid(), 'ADMIN', 'AD_PLACEMENT_SAVED',
    jsonb_build_object('placement_id',v_id,'placement_code',v_code,'status',v_status,'platforms',to_jsonb(v_platforms))
  );
  return v_id;
end;
$$;

create or replace function public.admin_play_set_direct_sponsor_status(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_super_admin() then
    raise exception 'Only a super admin can enable direct sponsorship' using errcode = '42501';
  end if;
  update public.play_ad_providers
  set status = case when p_enabled then 'ENABLED' else 'DISABLED' end,
      updated_at = now()
  where provider_key = 'direct-sponsor';
  if not found then
    raise exception 'Direct-sponsor adapter is not registered' using errcode = '55000';
  end if;
  return true;
end;
$$;

revoke all on function public.admin_play_dashboard() from public, anon;
revoke all on function public.admin_play_upsert_experience(jsonb) from public, anon;
revoke all on function public.admin_play_upsert_campaign(jsonb) from public, anon;
revoke all on function public.admin_play_upsert_ad_placement(jsonb) from public, anon;
revoke all on function public.admin_play_set_direct_sponsor_status(boolean) from public, anon;
grant execute on function public.admin_play_dashboard() to authenticated;
grant execute on function public.admin_play_upsert_experience(jsonb) to authenticated;
grant execute on function public.admin_play_upsert_campaign(jsonb) to authenticated;
grant execute on function public.admin_play_upsert_ad_placement(jsonb) to authenticated;
grant execute on function public.admin_play_set_direct_sponsor_status(boolean) to authenticated;


commit;

comment on column public.play_campaigns.qualifying_funds_amount is
  'Reconciled qualifying campaign funds projection from the existing VAD financial ledger/campaign reserve. It is not a new wallet or financial ledger and is updated only by trusted server workflows.';
