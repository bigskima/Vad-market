-- VAD Play foundation
-- Introduces a database-driven experience catalogue, a configurable prize campaign
-- model, and private participation history. It intentionally does not enable
-- client-side ticket purchases, ad-completion credits, or draw execution.
-- Those mutations require reviewed, idempotent server-side workflows.

create table if not exists public.play_experiences (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  subtitle text check (subtitle is null or char_length(subtitle) <= 240),
  description text check (description is null or char_length(description) <= 3000),
  -- Type and engine keys are extensible registry identifiers, not a fixed game list.
  experience_type text not null
    check (experience_type ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  engine_key text not null
    check (engine_key ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  status text not null default 'DRAFT'
    check (status in ('DRAFT','COMPLIANCE_REVIEW','PUBLISHED','PAUSED','RETIRED')),
  hero_asset_url text
    check (hero_asset_url is null or hero_asset_url ~ '^https://'),
  card_asset_url text
    check (card_asset_url is null or card_asset_url ~ '^https://'),
  image_alt text check (image_alt is null or char_length(image_alt) <= 240),
  display_order integer not null default 100,
  public_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_config) = 'object'),
  -- Runtime configuration is intentionally excluded from client SELECT grants.
  engine_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(engine_config) = 'object'),
  created_by uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'PUBLISHED' or published_at is not null)
);

create index if not exists play_experiences_published_order_idx
  on public.play_experiences(display_order, published_at desc)
  where status = 'PUBLISHED';

create table if not exists public.play_campaigns (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references public.play_experiences(id) on delete restrict,
  slug text not null,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  prize_title text not null check (char_length(btrim(prize_title)) between 2 and 240),
  currency_code text not null check (currency_code ~ '^[A-Z][A-Z0-9]{2,9}$'),
  prize_cost_amount numeric(24,8) not null check (prize_cost_amount > 0),
  profit_target_mode text not null
    check (profit_target_mode in ('PERCENT_OF_PRIZE','FIXED_AMOUNT')),
  -- In percentage mode 10 means ten percent of prize cost; in fixed mode this
  -- is an amount in the campaign currency.
  profit_target_value numeric(24,8) not null check (profit_target_value >= 0),
  -- Includes other budgeted campaign costs. Qualifying receipts must be net of
  -- any additional processing costs that the campaign rules say are deducted.
  campaign_cost_budget_amount numeric(24,8) not null
    check (campaign_cost_budget_amount >= 0),
  funding_threshold_amount numeric(24,8) generated always as (
    round(
      prize_cost_amount
      + case
          when profit_target_mode = 'PERCENT_OF_PRIZE'
            then prize_cost_amount * profit_target_value / 100
          else profit_target_value
        end
      + campaign_cost_budget_amount,
      8
    )
  ) stored,
  entry_price_amount numeric(24,8) not null check (entry_price_amount > 0),
  max_entries integer check (max_entries is null or max_entries > 0),
  entry_limit_per_user integer check (entry_limit_per_user is null or entry_limit_per_user > 0),
  status text not null default 'DRAFT'
    check (status in (
      'DRAFT','COMPLIANCE_REVIEW','OPEN','FUNDING_TARGET_MET','FUNDING_SHORTFALL',
      'ENTRY_CLOSED','DRAW_ELIGIBLE','DRAW_AUTHORIZED','DRAWN','CANCELLED','REFUNDING','SETTLED'
    )),
  rules_public jsonb not null default '{}'::jsonb
    check (jsonb_typeof(rules_public) = 'object'),
  engine_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(engine_config) = 'object'),
  opens_at timestamptz,
  closes_at timestamptz,
  compliance_approved_at timestamptz,
  prize_secured_at timestamptz,
  funding_target_met_at timestamptz,
  entries_closed_at timestamptz,
  funds_reconciled_at timestamptz,
  draw_authorized_at timestamptz,
  drawn_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (experience_id, slug),
  check (closes_at is null or opens_at is null or closes_at > opens_at),
  check (status <> 'OPEN' or published_at is not null)
);

create index if not exists play_campaigns_experience_status_idx
  on public.play_campaigns(experience_id, status, closes_at);

-- The private timeline is populated by backend workflows. It is not a wallet ledger.
create table if not exists public.play_participations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  experience_id uuid references public.play_experiences(id) on delete set null,
  campaign_id uuid references public.play_campaigns(id) on delete set null,
  activity_type text not null
    check (activity_type ~ '^[A-Z][A-Z0-9_]{1,79}$'),
  status text not null
    check (status in ('PENDING','CREATED','CONFIRMED','COMPLETED','FAILED','REFUNDED','VOIDED')),
  reference text,
  amount numeric(24,8),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z][A-Z0-9]{2,9}$'),
  public_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(public_summary) = 'object'),
  private_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(private_metadata) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists play_participations_user_recent_idx
  on public.play_participations(user_id, occurred_at desc);

alter table public.play_experiences enable row level security;
alter table public.play_campaigns enable row level security;
alter table public.play_participations enable row level security;

drop policy if exists play_experiences_published_read on public.play_experiences;
create policy play_experiences_published_read
  on public.play_experiences for select to authenticated
  using (status = 'PUBLISHED' and (published_at is null or published_at <= statement_timestamp()));

drop policy if exists play_campaigns_public_read on public.play_campaigns;
create policy play_campaigns_public_read
  on public.play_campaigns for select to authenticated
  using (
    status in ('OPEN','FUNDING_TARGET_MET','FUNDING_SHORTFALL','ENTRY_CLOSED','DRAW_ELIGIBLE','DRAW_AUTHORIZED','DRAWN','SETTLED')
    and exists (
      select 1
      from public.play_experiences e
      where e.id = play_campaigns.experience_id
        and e.status = 'PUBLISHED'
        and (e.published_at is null or e.published_at <= statement_timestamp())
    )
  );

drop policy if exists play_participations_read_own on public.play_participations;
create policy play_participations_read_own
  on public.play_participations for select to authenticated
  using (user_id = (select auth.uid()));

-- Application users have read-only access to the catalogue and their own activity.
revoke all on public.play_experiences from anon, authenticated;
revoke all on public.play_campaigns from anon, authenticated;
revoke all on public.play_participations from anon, authenticated;

grant all on public.play_experiences, public.play_campaigns, public.play_participations to service_role;

grant select (
  id, slug, title, subtitle, description, experience_type, engine_key, status,
  hero_asset_url, card_asset_url, image_alt, display_order, public_config, published_at
) on public.play_experiences to authenticated;

grant select (
  id, experience_id, slug, title, prize_title, currency_code, prize_cost_amount,
  profit_target_mode, profit_target_value, campaign_cost_budget_amount,
  funding_threshold_amount, entry_price_amount, max_entries, entry_limit_per_user,
  status, rules_public, opens_at, closes_at, published_at
) on public.play_campaigns to authenticated;

grant select (
  id, user_id, experience_id, campaign_id, activity_type, status, reference,
  amount, currency_code, public_summary, occurred_at
) on public.play_participations to authenticated;

comment on table public.play_experiences is
  'Database-driven VAD Play experience catalogue. Publishing requires a separate permission-checked workflow.';
comment on table public.play_campaigns is
  'Configurable campaign economics. The generated funding threshold combines prize cost, configured profit target, and budgeted campaign costs. Qualifying proceeds must be reconciled server-side before draw eligibility.';
comment on table public.play_participations is
  'Private activity timeline populated by backend workflows. It is not a wallet ledger.';
comment on column public.play_campaigns.funding_threshold_amount is
  'Calculated in campaign currency. A ten percent profit target with zero budgeted campaign cost yields 1.10 times prize cost. The threshold alone does not authorize a draw.';
