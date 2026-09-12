create schema if not exists growth;
revoke all on schema growth from public, anon, authenticated;
grant usage on schema growth to service_role;

insert into admin.permissions(code, description) values
('growth.read','View growth, referral, affiliate, campaign and reward operations'),
('growth.manage','Create and manage growth campaigns, partners, links and reward rules'),
('growth.review','Review reward eligibility, winners and partner changes'),
('growth.finance','Review growth budgets, reward liabilities and payout readiness')
on conflict(code) do update set description=excluded.description;

insert into admin.roles(code,name,description,is_system) values
('GROWTH_MANAGER','Growth Manager','Manage referral, affiliate, partner and promotional campaigns without payout authority.',true),
('GROWTH_REVIEWER','Growth Reviewer','Independently review growth rewards, winners and campaign payout readiness.',true)
on conflict(code) do update set name=excluded.name,description=excluded.description;

insert into admin.role_permissions(role_id,permission_id)
select r.id,p.id from admin.roles r join admin.permissions p on
(r.code='GROWTH_MANAGER' and p.code in ('growth.read','growth.manage')) or
(r.code='GROWTH_REVIEWER' and p.code in ('growth.read','growth.review','growth.finance')) or
(r.code='SUPER_ADMIN' and p.code in ('growth.read','growth.manage','growth.review','growth.finance'))
where r.code in ('GROWTH_MANAGER','GROWTH_REVIEWER','SUPER_ADMIN')
on conflict do nothing;

insert into control.services(service_key,name,description,category,default_enabled,user_scopable,inherits_app_pause,status)
values('growth_rewards','Growth & Rewards','Referral, affiliate, partner and promotional reward experiences.','GROWTH',true,true,true,'ACTIVE')
on conflict(service_key) do update set name=excluded.name,description=excluded.description,category=excluded.category,status='ACTIVE';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('growth-media','growth-media',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists growth_media_public_read on storage.objects;
create policy growth_media_public_read on storage.objects for select to anon,authenticated using(bucket_id='growth-media');
drop policy if exists growth_media_insert on storage.objects;
create policy growth_media_insert on storage.objects for insert to authenticated with check(bucket_id='growth-media' and (private.is_super_admin() or private.has_permission('growth.manage')));
drop policy if exists growth_media_update on storage.objects;
create policy growth_media_update on storage.objects for update to authenticated using(bucket_id='growth-media' and (private.is_super_admin() or private.has_permission('growth.manage'))) with check(bucket_id='growth-media' and (private.is_super_admin() or private.has_permission('growth.manage')));
drop policy if exists growth_media_delete on storage.objects;
create policy growth_media_delete on storage.objects for delete to authenticated using(bucket_id='growth-media' and (private.is_super_admin() or private.has_permission('growth.manage')));

create table growth.partners(
 id bigint generated always as identity primary key,
 public_id uuid not null unique default gen_random_uuid(),
 partner_type text not null check(partner_type in('CELEBRITY','INFLUENCER','CREATOR','COMMUNITY','MEDIA','AGENCY','BRAND','CAMPUS_AMBASSADOR','STRATEGIC_PARTNER','OTHER')),
 name text not null check(char_length(btrim(name)) between 2 and 120),
 display_name text not null check(char_length(btrim(display_name)) between 2 and 120),
 linked_user_id uuid null references auth.users(id) on delete set null,
 status text not null default 'DRAFT' check(status in('DRAFT','ACTIVE','PAUSED','SUSPENDED','ENDED','ARCHIVED')),
 bio text null check(bio is null or char_length(bio)<=1000),
 avatar_url text null,banner_url text null,
 contact_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(contact_metadata)='object'),
 public_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(public_metadata)='object'),
 created_by uuid null references auth.users(id) on delete set null,
 updated_by uuid null references auth.users(id) on delete set null,
 created_at timestamptz not null default statement_timestamp(),updated_at timestamptz not null default statement_timestamp()
);

create table growth.campaigns(
 id bigint generated always as identity primary key,
 public_id uuid not null unique default gen_random_uuid(),
 code text not null unique check(code ~ '^[A-Z][A-Z0-9_]{2,39}$'),
 campaign_type text not null check(campaign_type in('REFERRAL','AFFILIATE','CHALLENGE','SPONSORED','CREATOR','SEASONAL','LAUNCH','EDUCATION')),
 name text not null check(char_length(btrim(name)) between 3 and 120),
 short_description text not null check(char_length(btrim(short_description)) between 3 and 280),
 full_description text null check(full_description is null or char_length(full_description)<=5000),
 status text not null default 'DRAFT' check(status in('DRAFT','SCHEDULED','ACTIVE','PAUSED','ENDED','CALCULATING','WINNERS_PENDING','WINNERS_APPROVED','PAYING','SETTLED','CANCELLED','ARCHIVED')),
 reward_asset_id bigint null references public.assets(id),
 reward_mode text not null default 'NONE' check(reward_mode in('NONE','FIXED_CPA','REVENUE_SHARE','HYBRID','PRIZE_POOL','PROMOTIONAL_CREDIT','FEE_CREDIT')),
 allocated_budget numeric not null default 0 check(allocated_budget>=0),
 funding_source text not null default 'VAD_MARKETING' check(funding_source in('VAD_MARKETING','PARTNER_FUNDED','SPONSOR_FUNDED','PROMOTIONAL_RESERVE','OTHER')),
 attribution_model text not null default 'LAST_TOUCH_BEFORE_SIGNUP' check(attribution_model in('FIRST_TOUCH','LAST_TOUCH_BEFORE_SIGNUP')),
 attribution_window_days integer not null default 30 check(attribution_window_days between 1 and 365),
 reward_config jsonb not null default '{}'::jsonb check(jsonb_typeof(reward_config)='object'),
 qualification_rule jsonb not null default '{}'::jsonb check(jsonb_typeof(qualification_rule)='object'),
 eligibility_rule jsonb not null default '{}'::jsonb check(jsonb_typeof(eligibility_rule)='object'),
 scoring_rule jsonb not null default '{}'::jsonb check(jsonb_typeof(scoring_rule)='object'),
 winner_rule jsonb not null default '{}'::jsonb check(jsonb_typeof(winner_rule)='object'),
 country_codes text[] not null default array['NG']::text[],
 per_user_reward_cap numeric null check(per_user_reward_cap is null or per_user_reward_cap>=0),
 per_user_qualification_cap integer null check(per_user_qualification_cap is null or per_user_qualification_cap>0),
 hero_image_url text null,card_image_url text null,square_image_url text null,
 badge_text text null check(badge_text is null or char_length(badge_text)<=40),
 sponsor_name text null check(sponsor_name is null or char_length(sponsor_name)<=120),
 visual_config jsonb not null default '{}'::jsonb check(jsonb_typeof(visual_config)='object'),
 terms_summary text null check(terms_summary is null or char_length(terms_summary)<=3000),
 starts_at timestamptz null,ends_at timestamptz null,
 created_by uuid null references auth.users(id) on delete set null,updated_by uuid null references auth.users(id) on delete set null,approved_by uuid null references auth.users(id) on delete set null,
 activated_at timestamptz null,created_at timestamptz not null default statement_timestamp(),updated_at timestamptz not null default statement_timestamp(),
 check(ends_at is null or starts_at is null or ends_at>starts_at)
);

create table growth.partner_contracts(
 id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),
 partner_id bigint not null references growth.partners(id) on delete restrict,campaign_id bigint null references growth.campaigns(id) on delete restrict,
 contract_type text not null check(contract_type in('CPA','REVENUE_SHARE','HYBRID','FLAT','TIERED')),
 status text not null default 'DRAFT' check(status in('DRAFT','ACTIVE','PAUSED','ENDED','ARCHIVED')),
 reward_asset_id bigint null references public.assets(id),cpa_amount numeric null check(cpa_amount is null or cpa_amount>=0),
 revenue_share_bps integer null check(revenue_share_bps is null or revenue_share_bps between 0 and 10000),revenue_share_days integer null check(revenue_share_days is null or revenue_share_days between 1 and 3650),
 flat_fee numeric null check(flat_fee is null or flat_fee>=0),payout_cap numeric null check(payout_cap is null or payout_cap>=0),
 terms jsonb not null default '{}'::jsonb check(jsonb_typeof(terms)='object'),starts_at timestamptz null,ends_at timestamptz null,
 created_by uuid null references auth.users(id) on delete set null,approved_by uuid null references auth.users(id) on delete set null,
 created_at timestamptz not null default statement_timestamp(),updated_at timestamptz not null default statement_timestamp(),check(ends_at is null or starts_at is null or ends_at>starts_at)
);

create table growth.links(
 id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),code text not null unique check(code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$'),
 link_kind text not null check(link_kind in('INVITE','REFERRAL','AFFILIATE','CAMPAIGN')),
 owner_user_id uuid null references auth.users(id) on delete set null,partner_id bigint null references growth.partners(id) on delete set null,campaign_id bigint null references growth.campaigns(id) on delete set null,
 rewardable boolean not null default false,status text not null default 'ACTIVE' check(status in('ACTIVE','PAUSED','EXPIRED','REVOKED')),
 destination_path text not null default '/home' check(destination_path ~ '^/[^/].*|^/$'),metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
 created_by uuid null references auth.users(id) on delete set null,created_at timestamptz not null default statement_timestamp(),expires_at timestamptz null,
 check((link_kind='INVITE' and owner_user_id is not null and partner_id is null) or link_kind<>'INVITE')
);
create unique index growth_one_invite_link_per_user on growth.links(owner_user_id) where link_kind='INVITE' and status='ACTIVE';
create index growth_links_campaign_idx on growth.links(campaign_id);create index growth_links_partner_idx on growth.links(partner_id);

create table growth.attributions(
 id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),attributed_user_id uuid not null unique references auth.users(id) on delete restrict,
 link_id bigint not null references growth.links(id) on delete restrict,campaign_id bigint null references growth.campaigns(id) on delete restrict,partner_id bigint null references growth.partners(id) on delete restrict,inviter_user_id uuid null references auth.users(id) on delete set null,
 attribution_model text not null,source text not null default 'CODE' check(source in('CODE','LINK','DEEPLINK','ADMIN')),
 claimed_at timestamptz not null default statement_timestamp(),locked_at timestamptz not null default statement_timestamp(),metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object')
);
create index growth_attributions_campaign_idx on growth.attributions(campaign_id);create index growth_attributions_partner_idx on growth.attributions(partner_id);create index growth_attributions_inviter_idx on growth.attributions(inviter_user_id);

create table growth.reward_rules(
 id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),campaign_id bigint not null references growth.campaigns(id) on delete cascade,
 rule_code text not null check(rule_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),beneficiary_type text not null check(beneficiary_type in('REFERRER','PARTNER','PARTICIPANT','WINNER')),
 reward_kind text not null check(reward_kind in('REFERRAL_REWARD','AFFILIATE_COMMISSION','CAMPAIGN_REWARD','PROMOTIONAL_CREDIT','FEE_CREDIT','PRIZE_PAYOUT')),
 trigger_event text not null check(trigger_event ~ '^[A-Z][A-Z0-9_]*$'),model text not null check(model in('FIXED','REVENUE_SHARE','TIERED','PRIZE','NONE')),
 configuration jsonb not null default '{}'::jsonb check(jsonb_typeof(configuration)='object'),priority integer not null default 100 check(priority between 0 and 10000),active boolean not null default true,
 created_by uuid null references auth.users(id) on delete set null,created_at timestamptz not null default statement_timestamp(),unique(campaign_id,rule_code)
);

create table growth.qualification_events(
 id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete restrict,campaign_id bigint null references growth.campaigns(id) on delete restrict,
 event_type text not null check(event_type ~ '^[A-Z][A-Z0-9_]*$'),source_event_id uuid null references eventing.domain_events(id) on delete set null,subject_type text null,subject_id text null,
 occurred_at timestamptz not null,metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),idempotency_key text not null unique,recorded_at timestamptz not null default statement_timestamp()
);
create index growth_qualification_user_idx on growth.qualification_events(user_id,occurred_at desc);create index growth_qualification_campaign_idx on growth.qualification_events(campaign_id,occurred_at desc);

create table growth.reward_entitlements(
 id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),campaign_id bigint not null references growth.campaigns(id) on delete restrict,rule_id bigint null references growth.reward_rules(id) on delete restrict,attribution_id bigint null references growth.attributions(id) on delete restrict,
 beneficiary_user_id uuid null references auth.users(id) on delete restrict,beneficiary_partner_id bigint null references growth.partners(id) on delete restrict,
 reward_kind text not null check(reward_kind in('REFERRAL_REWARD','AFFILIATE_COMMISSION','CAMPAIGN_REWARD','PROMOTIONAL_CREDIT','FEE_CREDIT','PRIZE_PAYOUT')),
 asset_id bigint not null references public.assets(id),amount numeric not null check(amount>0),status text not null default 'PENDING' check(status in('PENDING','QUALIFYING','EARNED','HELD','APPROVED','PAYABLE','PAID','REVERSED','DISQUALIFIED')),
 source_reference text null,hold_until timestamptz null,approved_by uuid null references auth.users(id) on delete set null,approved_at timestamptz null,ledger_journal_id bigint null references finance.ledger_journals(id) on delete set null,
 idempotency_key text not null unique,metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),created_at timestamptz not null default statement_timestamp(),updated_at timestamptz not null default statement_timestamp(),
 check(((beneficiary_user_id is not null)::int + (beneficiary_partner_id is not null)::int)=1)
);
create index growth_rewards_campaign_idx on growth.reward_entitlements(campaign_id,status);create index growth_rewards_user_idx on growth.reward_entitlements(beneficiary_user_id,created_at desc) where beneficiary_user_id is not null;create index growth_rewards_partner_idx on growth.reward_entitlements(beneficiary_partner_id,created_at desc) where beneficiary_partner_id is not null;

create table growth.campaign_participants(campaign_id bigint not null references growth.campaigns(id) on delete cascade,user_id uuid not null references auth.users(id) on delete restrict,status text not null default 'ACTIVE' check(status in('ACTIVE','ELIGIBLE','DISQUALIFIED','WITHDRAWN')),joined_at timestamptz not null default statement_timestamp(),metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),primary key(campaign_id,user_id));
create table growth.score_events(id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),campaign_id bigint not null references growth.campaigns(id) on delete cascade,user_id uuid not null references auth.users(id) on delete restrict,event_type text not null check(event_type ~ '^[A-Z][A-Z0-9_]*$'),points numeric not null,reference_type text null,reference_id text null,idempotency_key text not null unique,metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),occurred_at timestamptz not null default statement_timestamp());
create index growth_score_campaign_user_idx on growth.score_events(campaign_id,user_id);
create table growth.campaign_winners(id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),campaign_id bigint not null references growth.campaigns(id) on delete restrict,user_id uuid not null references auth.users(id) on delete restrict,rank integer not null check(rank>0),score numeric null,reward_entitlement_id bigint null references growth.reward_entitlements(id) on delete set null,status text not null default 'PROPOSED' check(status in('PROPOSED','APPROVED','PAID','DISQUALIFIED')),selected_by text not null default 'RULE_ENGINE' check(selected_by in('RULE_ENGINE','RANDOM_DRAW','ADMIN_REVIEW')),approved_by uuid null references auth.users(id) on delete set null,created_at timestamptz not null default statement_timestamp(),unique(campaign_id,rank),unique(campaign_id,user_id));
create table growth.partner_settlements(id bigint generated always as identity primary key,public_id uuid not null unique default gen_random_uuid(),partner_id bigint not null references growth.partners(id) on delete restrict,asset_id bigint not null references public.assets(id),period_start date not null,period_end date not null,gross_amount numeric not null check(gross_amount>=0),adjustment_amount numeric not null default 0,net_amount numeric not null check(net_amount>=0),status text not null default 'DRAFT' check(status in('DRAFT','REVIEW','APPROVED','PAYABLE','PAID','CANCELLED')),ledger_journal_id bigint null references finance.ledger_journals(id) on delete set null,created_by uuid null references auth.users(id) on delete set null,approved_by uuid null references auth.users(id) on delete set null,created_at timestamptz not null default statement_timestamp(),unique(partner_id,asset_id,period_start,period_end),check(period_end>=period_start));

alter table growth.partners enable row level security;alter table growth.campaigns enable row level security;alter table growth.partner_contracts enable row level security;alter table growth.links enable row level security;alter table growth.attributions enable row level security;alter table growth.reward_rules enable row level security;alter table growth.qualification_events enable row level security;alter table growth.reward_entitlements enable row level security;alter table growth.campaign_participants enable row level security;alter table growth.score_events enable row level security;alter table growth.campaign_winners enable row level security;alter table growth.partner_settlements enable row level security;
revoke all on all tables in schema growth from public,anon,authenticated;grant all on all tables in schema growth to service_role;grant usage,select on all sequences in schema growth to service_role;

create view growth.campaign_budget_state with (security_invoker=false) as select c.id campaign_id,c.public_id,c.code,c.allocated_budget,coalesce(sum(r.amount) filter(where r.status in('PENDING','QUALIFYING','EARNED','HELD','APPROVED','PAYABLE','PAID')),0) committed_amount,coalesce(sum(r.amount) filter(where r.status='PAID'),0) paid_amount,greatest(c.allocated_budget-coalesce(sum(r.amount) filter(where r.status in('PENDING','QUALIFYING','EARNED','HELD','APPROVED','PAYABLE','PAID')),0),0) available_amount from growth.campaigns c left join growth.reward_entitlements r on r.campaign_id=c.id group by c.id,c.public_id,c.code,c.allocated_budget;
revoke all on growth.campaign_budget_state from public,anon,authenticated;grant select on growth.campaign_budget_state to service_role;
create view growth.challenge_leaderboard with (security_invoker=false) as select se.campaign_id,se.user_id,sum(se.points) score,rank() over(partition by se.campaign_id order by sum(se.points) desc,min(se.occurred_at) asc) rank from growth.score_events se group by se.campaign_id,se.user_id;
revoke all on growth.challenge_leaderboard from public,anon,authenticated;grant select on growth.challenge_leaderboard to service_role;

comment on schema growth is 'VAD growth bounded context: attribution, affiliates, campaigns, challenge scoring and reward liabilities.';
comment on table growth.links is 'Normal INVITE links are non-rewardable by default. Rewards require an explicit configured campaign or contract.';
comment on table growth.reward_entitlements is 'Reward liabilities only. These rows do not move money; payout posting is separately governed.';
