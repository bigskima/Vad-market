create schema if not exists experience;

revoke all on schema experience from public;
revoke all on schema experience from anon;
revoke all on schema experience from authenticated;

create table experience.product_tours (
  id bigint generated always as identity primary key,
  code text not null unique check (code = upper(code) and char_length(code) between 3 and 80),
  name text not null check (char_length(name) between 3 and 120),
  description text not null default '',
  status text not null default 'ACTIVE' check (status in ('DRAFT','ACTIVE','RETIRED')),
  auto_start boolean not null default true,
  current_version_id bigint,
  created_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create table experience.product_tour_versions (
  id bigint generated always as identity primary key,
  tour_id bigint not null references experience.product_tours(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  version_label text not null check (char_length(version_label) between 1 and 80),
  effective_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  auto_prompt_existing boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default statement_timestamp(),
  unique (tour_id, version_number),
  unique (tour_id, version_label),
  check (expires_at is null or expires_at > effective_at)
);

alter table experience.product_tours
  add constraint product_tours_current_version_fk
  foreign key (current_version_id) references experience.product_tour_versions(id);

create table experience.product_tour_steps (
  id bigint generated always as identity primary key,
  tour_version_id bigint not null references experience.product_tour_versions(id) on delete cascade,
  step_key text not null check (char_length(step_key) between 2 and 100),
  sequence integer not null check (sequence > 0),
  route text not null check (left(route, 1) = '/'),
  target_id text not null check (char_length(target_id) between 2 and 120),
  title text not null check (char_length(title) between 2 and 180),
  body text not null check (char_length(body) between 3 and 1200),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (tour_version_id, step_key),
  unique (tour_version_id, sequence)
);

create table experience.user_tour_progress (
  user_id uuid not null,
  tour_id bigint not null references experience.product_tours(id) on delete cascade,
  tour_version_id bigint not null references experience.product_tour_versions(id) on delete cascade,
  status text not null check (status in ('IN_PROGRESS','REMIND','COMPLETED','DISMISSED')),
  current_step_key text,
  remind_at timestamptz,
  completed_at timestamptz,
  last_started_at timestamptz,
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, tour_id),
  check ((status = 'REMIND' and remind_at is not null) or status <> 'REMIND')
);

create index user_tour_progress_due_idx
  on experience.user_tour_progress (status, remind_at)
  where status = 'REMIND';

alter table experience.product_tours enable row level security;
alter table experience.product_tour_versions enable row level security;
alter table experience.product_tour_steps enable row level security;
alter table experience.user_tour_progress enable row level security;

revoke all on all tables in schema experience from anon, authenticated;
revoke all on all sequences in schema experience from anon, authenticated;

create table if not exists policy.legal_document_drafts (
  document_key text primary key check (document_key in ('TERMS','PRIVACY')),
  policy_id bigint references policy.policies(id),
  title text not null check (char_length(title) between 3 and 180),
  summary text not null check (char_length(summary) between 3 and 1000),
  version_label text not null check (char_length(version_label) between 1 and 80),
  effective_date date not null,
  required_acceptance boolean not null default true,
  content text not null check (char_length(content) >= 50),
  updated_by uuid,
  updated_at timestamptz not null default statement_timestamp()
);

create table if not exists policy.user_policy_acceptances (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null,
  policy_id bigint not null references policy.policies(id),
  policy_version_id bigint not null references policy.policy_versions(id),
  document_key text not null check (document_key in ('TERMS','PRIVACY')),
  version_label text not null,
  content_hash text not null check (char_length(content_hash) = 64),
  accepted_at timestamptz not null default statement_timestamp(),
  source text not null default 'APP' check (source in ('APP','WEB')),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  unique (user_id, policy_version_id)
);

create index user_policy_acceptances_user_idx
  on policy.user_policy_acceptances (user_id, accepted_at desc);

alter table policy.legal_document_drafts enable row level security;
alter table policy.user_policy_acceptances enable row level security;
revoke all on policy.legal_document_drafts, policy.user_policy_acceptances from anon, authenticated;
revoke all on sequence policy.user_policy_acceptances_id_seq from anon, authenticated;

create or replace function private.prevent_policy_acceptance_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'Policy acceptance records are immutable' using errcode = '55000';
end;
$$;

create trigger user_policy_acceptances_immutable
before update or delete on policy.user_policy_acceptances
for each row execute function private.prevent_policy_acceptance_mutation();

create or replace function private.current_legal_policy_versions()
returns table (
  policy_id bigint,
  policy_version_id bigint,
  version_number integer,
  document_key text,
  configuration jsonb,
  effective_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (p.id)
    p.id,
    pv.id,
    pv.version,
    pv.configuration ->> 'documentKey',
    pv.configuration,
    pv.effective_at
  from policy.policies p
  join policy.policy_versions pv on pv.policy_id = p.id
  where p.domain = 'PLATFORM'
    and p.name in ('LEGAL_TERMS', 'LEGAL_PRIVACY')
    and p.status <> 'RETIRED'
    and pv.effective_at <= statement_timestamp()
    and (pv.expires_at is null or pv.expires_at > statement_timestamp())
    and pv.configuration ->> 'documentKey' in ('TERMS','PRIVACY')
  order by p.id, pv.effective_at desc, pv.version desc;
$$;

revoke all on function private.current_legal_policy_versions() from public, anon, authenticated;
revoke all on function private.prevent_policy_acceptance_mutation() from public, anon, authenticated;

create or replace function public.my_legal_policy_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with docs as (
    select
      c.policy_id,
      c.policy_version_id,
      c.version_number,
      c.document_key,
      c.configuration,
      c.effective_at,
      exists (
        select 1
        from policy.user_policy_acceptances a
        where a.user_id = auth.uid()
          and a.policy_version_id = c.policy_version_id
      ) as accepted
    from private.current_legal_policy_versions() c
  )
  select jsonb_build_object(
    'enforcementReady', true,
    'requiresAcceptance', exists (
      select 1 from docs
      where coalesce((configuration ->> 'requiredAcceptance')::boolean, false)
        and not accepted
    ),
    'documents', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', document_key,
          'policyId', policy_id,
          'policyVersionId', policy_version_id,
          'versionNumber', version_number,
          'title', configuration ->> 'title',
          'summary', configuration ->> 'summary',
          'version', configuration ->> 'versionLabel',
          'effectiveDate', configuration ->> 'effectiveDate',
          'requiredAcceptance', coalesce((configuration ->> 'requiredAcceptance')::boolean, false),
          'status', 'PUBLISHED',
          'content', configuration ->> 'content',
          'accepted', accepted
        ) order by case document_key when 'TERMS' then 1 else 2 end
      ) from docs
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.my_legal_policy_state() from public, anon;
grant execute on function public.my_legal_policy_state() to authenticated;

create or replace function public.accept_current_legal_policies(
  p_policy_version_ids bigint[],
  p_source text default 'APP'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  clean_source text := upper(trim(coalesce(p_source, 'APP')));
  missing_count integer;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if clean_source not in ('APP','WEB') then
    raise exception 'Unsupported acceptance source' using errcode = '22023';
  end if;

  select count(*) into missing_count
  from private.current_legal_policy_versions() c
  where coalesce((c.configuration ->> 'requiredAcceptance')::boolean, false)
    and not (c.policy_version_id = any(coalesce(p_policy_version_ids, '{}'::bigint[])));

  if missing_count > 0 then
    raise exception 'All required current policies must be accepted together' using errcode = '22023';
  end if;

  insert into policy.user_policy_acceptances (
    user_id,
    policy_id,
    policy_version_id,
    document_key,
    version_label,
    content_hash,
    source,
    metadata
  )
  select
    caller_id,
    c.policy_id,
    c.policy_version_id,
    c.document_key,
    c.configuration ->> 'versionLabel',
    encode(extensions.digest(c.configuration::text, 'sha256'), 'hex'),
    clean_source,
    jsonb_build_object('version_number', c.version_number, 'effective_at', c.effective_at)
  from private.current_legal_policy_versions() c
  where c.policy_version_id = any(coalesce(p_policy_version_ids, '{}'::bigint[]))
  on conflict (user_id, policy_version_id) do nothing;

  if exists (
    select 1
    from private.current_legal_policy_versions() c
    where coalesce((c.configuration ->> 'requiredAcceptance')::boolean, false)
      and not exists (
        select 1 from policy.user_policy_acceptances a
        where a.user_id = caller_id
          and a.policy_version_id = c.policy_version_id
      )
  ) then
    raise exception 'Required policy acceptance is incomplete' using errcode = '22023';
  end if;

  insert into audit.records (
    actor_user_id, actor_type, action, resource_type, resource_id, after_state, metadata
  ) values (
    caller_id,
    'USER',
    'LEGAL_POLICIES_ACCEPTED',
    'LEGAL_POLICY_ACCEPTANCE',
    caller_id::text,
    jsonb_build_object('policy_version_ids', to_jsonb(coalesce(p_policy_version_ids, '{}'::bigint[]))),
    jsonb_build_object('source', clean_source)
  );

  return true;
end;
$$;

revoke all on function public.accept_current_legal_policies(bigint[], text) from public, anon;
grant execute on function public.accept_current_legal_policies(bigint[], text) to authenticated;

create or replace function public.admin_legal_policy_workspace()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_super_admin() or private.has_permission('policies.manage')) then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'key', d.document_key,
        'policyId', d.policy_id,
        'currentVersionId', p.current_version_id,
        'title', d.title,
        'summary', d.summary,
        'version', d.version_label,
        'effectiveDate', d.effective_date::text,
        'requiredAcceptance', d.required_acceptance,
        'status', case when p.current_version_id is null then 'DRAFT' else 'PUBLISHED' end,
        'content', d.content,
        'updatedAt', d.updated_at,
        'canPublish', private.is_super_admin()
      ) order by case d.document_key when 'TERMS' then 1 else 2 end
    )
    from policy.legal_document_drafts d
    left join policy.policies p on p.id = d.policy_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_legal_policy_workspace() from public, anon;
grant execute on function public.admin_legal_policy_workspace() to authenticated;

create or replace function public.admin_save_legal_policy_draft(
  p_document_key text,
  p_title text,
  p_summary text,
  p_version_label text,
  p_effective_date date,
  p_required_acceptance boolean,
  p_content text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_key text := upper(trim(coalesce(p_document_key, '')));
  before_row jsonb;
begin
  if not (private.is_super_admin() or private.has_permission('policies.manage')) then
    raise exception 'Permission required' using errcode = '42501';
  end if;
  if clean_key not in ('TERMS','PRIVACY') then
    raise exception 'Unsupported legal document' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_title,''))) < 3
    or char_length(trim(coalesce(p_summary,''))) < 3
    or char_length(trim(coalesce(p_version_label,''))) < 1
    or char_length(trim(coalesce(p_content,''))) < 50 then
    raise exception 'Complete the title, description, version and policy text before saving' using errcode = '22023';
  end if;

  select to_jsonb(d) into before_row
  from policy.legal_document_drafts d
  where d.document_key = clean_key;

  insert into policy.legal_document_drafts (
    document_key, policy_id, title, summary, version_label, effective_date,
    required_acceptance, content, updated_by, updated_at
  )
  values (
    clean_key,
    (select id from policy.policies where domain='PLATFORM' and name = case clean_key when 'TERMS' then 'LEGAL_TERMS' else 'LEGAL_PRIVACY' end),
    trim(p_title), trim(p_summary), trim(p_version_label), p_effective_date,
    coalesce(p_required_acceptance, true), p_content, auth.uid(), statement_timestamp()
  )
  on conflict (document_key) do update set
    title = excluded.title,
    summary = excluded.summary,
    version_label = excluded.version_label,
    effective_date = excluded.effective_date,
    required_acceptance = excluded.required_acceptance,
    content = excluded.content,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into audit.records (
    actor_user_id, actor_type, action, resource_type, resource_id,
    before_state, after_state, metadata
  ) values (
    auth.uid(), 'USER', 'LEGAL_POLICY_DRAFT_SAVED', 'LEGAL_POLICY_DRAFT', clean_key,
    before_row,
    (select to_jsonb(d) from policy.legal_document_drafts d where d.document_key = clean_key),
    jsonb_build_object('document_key', clean_key)
  );

  return true;
end;
$$;

revoke all on function public.admin_save_legal_policy_draft(text,text,text,text,date,boolean,text) from public, anon;
grant execute on function public.admin_save_legal_policy_draft(text,text,text,text,date,boolean,text) to authenticated;

create or replace function public.admin_publish_legal_policy(
  p_document_key text,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_key text := upper(trim(coalesce(p_document_key, '')));
  clean_reason text := trim(coalesce(p_reason, ''));
  draft policy.legal_document_drafts;
  pol policy.policies;
  next_version integer;
  version_id bigint;
  cfg jsonb;
begin
  if not private.is_super_admin() then
    raise exception 'Super Admin required to publish legal policies' using errcode = '42501';
  end if;
  if clean_key not in ('TERMS','PRIVACY') then
    raise exception 'Unsupported legal document' using errcode = '22023';
  end if;
  if char_length(clean_reason) < 3 or char_length(clean_reason) > 1000 then
    raise exception 'A publication reason between 3 and 1000 characters is required' using errcode = '22023';
  end if;

  select * into draft from policy.legal_document_drafts where document_key = clean_key;
  if draft.document_key is null then
    raise exception 'Save this policy draft before publishing' using errcode = 'P0002';
  end if;
  if draft.effective_date > current_date then
    raise exception 'Future-dated legal policy publishing is not enabled yet' using errcode = '22023';
  end if;

  select * into pol
  from policy.policies
  where domain = 'PLATFORM'
    and name = case clean_key when 'TERMS' then 'LEGAL_TERMS' else 'LEGAL_PRIVACY' end
  for update;

  if pol.id is null then
    insert into policy.policies (domain, name, description, status, created_by)
    values (
      'PLATFORM',
      case clean_key when 'TERMS' then 'LEGAL_TERMS' else 'LEGAL_PRIVACY' end,
      case clean_key when 'TERMS' then 'VAD Terms of Use shown to product users.' else 'VAD Privacy Notice shown to product users.' end,
      'DRAFT',
      auth.uid()
    ) returning * into pol;
  end if;

  if exists (
    select 1 from policy.policy_versions pv
    where pv.policy_id = pol.id
      and pv.configuration ->> 'versionLabel' = draft.version_label
  ) then
    raise exception 'That version label has already been published. Use a new version label.' using errcode = '23505';
  end if;

  select coalesce(max(version), 0) + 1 into next_version
  from policy.policy_versions where policy_id = pol.id;

  cfg := jsonb_build_object(
    'documentKey', clean_key,
    'title', draft.title,
    'summary', draft.summary,
    'versionLabel', draft.version_label,
    'effectiveDate', draft.effective_date::text,
    'requiredAcceptance', draft.required_acceptance,
    'content', draft.content
  );

  insert into policy.policy_versions (
    policy_id, version, configuration, effective_at, created_by, approved_by,
    reason, activation_mode
  ) values (
    pol.id, next_version, cfg, statement_timestamp(), auth.uid(), auth.uid(),
    clean_reason, 'SUPER_ADMIN_DIRECT'
  ) returning id into version_id;

  update policy.policies
  set current_version_id = version_id,
      status = 'ACTIVE',
      updated_at = statement_timestamp()
  where id = pol.id;

  update policy.legal_document_drafts
  set policy_id = pol.id,
      updated_by = auth.uid(),
      updated_at = statement_timestamp()
  where document_key = clean_key;

  insert into audit.records (
    actor_user_id, actor_type, action, resource_type, resource_id,
    after_state, reason, metadata
  ) values (
    auth.uid(), 'USER', 'LEGAL_POLICY_PUBLISHED', 'POLICY_VERSION', version_id::text,
    jsonb_build_object(
      'document_key', clean_key,
      'policy_id', pol.id,
      'policy_version_id', version_id,
      'version_number', next_version,
      'configuration', cfg
    ),
    clean_reason,
    jsonb_build_object('governance','SUPER_ADMIN_DIRECT','requires_user_acceptance',draft.required_acceptance)
  );

  return version_id;
end;
$$;

revoke all on function public.admin_publish_legal_policy(text,text) from public, anon;
grant execute on function public.admin_publish_legal_policy(text,text) to authenticated;

create or replace function public.my_product_tour(p_tour_code text default 'GETTING_STARTED')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  tour_row experience.product_tours;
  version_row experience.product_tour_versions;
  progress_row experience.user_tour_progress;
  has_progress boolean := false;
  should_start boolean := false;
  steps_json jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into tour_row
  from experience.product_tours
  where code = upper(trim(coalesce(p_tour_code,'')))
    and status = 'ACTIVE';

  if tour_row.id is null or tour_row.current_version_id is null then
    return jsonb_build_object('available', false, 'shouldStart', false, 'steps', '[]'::jsonb);
  end if;

  select * into version_row
  from experience.product_tour_versions
  where id = tour_row.current_version_id
    and effective_at <= statement_timestamp()
    and (expires_at is null or expires_at > statement_timestamp());

  if version_row.id is null then
    return jsonb_build_object('available', false, 'shouldStart', false, 'steps', '[]'::jsonb);
  end if;

  select * into progress_row
  from experience.user_tour_progress
  where user_id = caller_id and tour_id = tour_row.id;
  has_progress := progress_row.user_id is not null;

  if not has_progress then
    should_start := tour_row.auto_start;
  elsif progress_row.tour_version_id <> version_row.id and version_row.auto_prompt_existing then
    should_start := true;
  elsif progress_row.status = 'REMIND' then
    should_start := progress_row.remind_at <= statement_timestamp();
  elsif progress_row.status = 'IN_PROGRESS' then
    should_start := true;
  else
    should_start := false;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.step_key,
      'targetId', s.target_id,
      'route', s.route,
      'title', s.title,
      'body', s.body,
      'sequence', s.sequence,
      'metadata', s.metadata
    ) order by s.sequence
  ), '[]'::jsonb)
  into steps_json
  from experience.product_tour_steps s
  where s.tour_version_id = version_row.id and s.enabled;

  return jsonb_build_object(
    'available', true,
    'tourCode', tour_row.code,
    'name', tour_row.name,
    'versionId', version_row.id,
    'version', version_row.version_label,
    'shouldStart', should_start,
    'steps', steps_json,
    'progress', case when has_progress then jsonb_build_object(
      'status', progress_row.status,
      'currentStepKey', progress_row.current_step_key,
      'remindAt', progress_row.remind_at,
      'completedAt', progress_row.completed_at,
      'lastStartedAt', progress_row.last_started_at,
      'tourVersionId', progress_row.tour_version_id
    ) else jsonb_build_object(
      'status', 'NEW',
      'currentStepKey', null,
      'remindAt', null,
      'completedAt', null,
      'lastStartedAt', null,
      'tourVersionId', version_row.id
    ) end
  );
end;
$$;

revoke all on function public.my_product_tour(text) from public, anon;
grant execute on function public.my_product_tour(text) to authenticated;

create or replace function public.set_my_product_tour_progress(
  p_tour_code text,
  p_tour_version_id bigint,
  p_status text,
  p_current_step_key text default null,
  p_remind_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  clean_status text := upper(trim(coalesce(p_status,'')));
  tour_row experience.product_tours;
  now_at timestamptz := statement_timestamp();
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if clean_status not in ('IN_PROGRESS','REMIND','COMPLETED','DISMISSED') then
    raise exception 'Unsupported tour progress status' using errcode = '22023';
  end if;

  select * into tour_row
  from experience.product_tours
  where code = upper(trim(coalesce(p_tour_code,''))) and status = 'ACTIVE';

  if tour_row.id is null or tour_row.current_version_id <> p_tour_version_id then
    raise exception 'The guided tour has changed. Reload it and try again.' using errcode = '40001';
  end if;

  if p_current_step_key is not null and not exists (
    select 1 from experience.product_tour_steps
    where tour_version_id = p_tour_version_id and step_key = p_current_step_key and enabled
  ) then
    raise exception 'Tour step not found' using errcode = '22023';
  end if;

  if clean_status = 'REMIND' and (p_remind_at is null or p_remind_at <= now_at) then
    raise exception 'Reminder time must be in the future' using errcode = '22023';
  end if;

  insert into experience.user_tour_progress (
    user_id, tour_id, tour_version_id, status, current_step_key, remind_at,
    completed_at, last_started_at, updated_at
  ) values (
    caller_id,
    tour_row.id,
    p_tour_version_id,
    clean_status,
    p_current_step_key,
    case when clean_status = 'REMIND' then p_remind_at else null end,
    case when clean_status = 'COMPLETED' then now_at else null end,
    case when clean_status = 'IN_PROGRESS' then now_at else null end,
    now_at
  )
  on conflict (user_id, tour_id) do update set
    tour_version_id = excluded.tour_version_id,
    status = excluded.status,
    current_step_key = excluded.current_step_key,
    remind_at = excluded.remind_at,
    completed_at = case
      when excluded.status = 'COMPLETED' then excluded.completed_at
      when excluded.status = 'IN_PROGRESS' then null
      else experience.user_tour_progress.completed_at
    end,
    last_started_at = case
      when excluded.status = 'IN_PROGRESS' then excluded.last_started_at
      else experience.user_tour_progress.last_started_at
    end,
    updated_at = excluded.updated_at;

  return (
    select jsonb_build_object(
      'status', p.status,
      'currentStepKey', p.current_step_key,
      'remindAt', p.remind_at,
      'completedAt', p.completed_at,
      'lastStartedAt', p.last_started_at,
      'tourVersionId', p.tour_version_id
    )
    from experience.user_tour_progress p
    where p.user_id = caller_id and p.tour_id = tour_row.id
  );
end;
$$;

revoke all on function public.set_my_product_tour_progress(text,bigint,text,text,timestamptz) from public, anon;
grant execute on function public.set_my_product_tour_progress(text,bigint,text,text,timestamptz) to authenticated;

do $$
declare
  terms_policy_id bigint;
  privacy_policy_id bigint;
  terms_version_id bigint;
  privacy_version_id bigint;
  tour_id bigint;
  tour_version_id bigint;
  terms_content text := $terms$
VAD TERMS OF USE

1. ABOUT THESE TERMS
These Terms of Use explain the rules that apply when you access or use VAD. By agreeing to these terms, you confirm that you have read them, understand them and agree to follow them while using VAD.

2. YOUR ACCOUNT
You are responsible for keeping your sign-in details secure and for activity carried out through your account. Information you provide to VAD should be accurate and kept up to date. Some features may require identity verification before they become available.

3. MARKETS AND DECISIONS
VAD presents markets about future events and outcomes. Market prices can change and do not guarantee what will happen. You are responsible for reviewing the market question, closing time, resolution information and your own financial position before taking part.

4. FUNDS AND TRANSACTIONS
Available currencies, payment methods, limits, fees and processing times may vary. Money committed to an open order may not be available for another action until that order is filled, cancelled or otherwise released. A withdrawal may remain pending while it is being processed.

5. FAIR USE
You must not use VAD to mislead other people, manipulate markets, interfere with the service, abuse another account, evade restrictions or carry out unlawful activity. VAD may limit or stop access where needed to protect users, markets or the platform.

6. MARKET RESOLUTION
Each market has its own resolution information. Outcomes may depend on approved sources and the rules shown for that market. Where an event is postponed, cancelled, unclear or disputed, the applicable market rules determine what happens next.

7. CONTENT AND COMMUNITY
When you post content, you are responsible for what you share. Do not post unlawful, deceptive, abusive or privacy-invasive material. VAD may moderate content to keep the community useful and safe.

8. CHANGES TO VAD
Features, available markets and service providers may change over time. Important changes that require a new agreement should be presented to you before you continue using affected parts of VAD.

9. LIMITATION AND RESPONSIBILITY
Use VAD carefully and make decisions based on your own assessment. Service interruptions, delayed information or third-party failures can occur. Nothing displayed in VAD should be treated as a guarantee of an outcome or return.

10. CONTACT AND QUESTIONS
If you have a question about these terms or your account, use the support options made available in VAD.
$terms$;
  privacy_content text := $privacy$
VAD PRIVACY NOTICE

1. WHAT THIS NOTICE COVERS
This notice explains the information VAD may use to provide the product, protect accounts, operate markets, process payments and improve the experience.

2. INFORMATION YOU PROVIDE
This can include your email address, phone number, profile information, support messages and information required for identity verification. If you create community content, that content and the profile information you choose to show may be visible to other people.

3. ACCOUNT AND PRODUCT ACTIVITY
VAD may record sign-ins, device and session information, market views, orders, positions, payment activity, settings and actions you take in the product. This helps VAD operate your account, show the correct information and investigate errors or abuse.

4. IDENTITY VERIFICATION
When verification is required, VAD may use a verification provider to check identity information. The information shown to VAD and the information retained by a verification provider can differ. The verification experience should explain what is requested before you continue.

5. PAYMENTS
Payment and withdrawal information may be shared with payment providers when needed to complete a transaction, resolve a payment issue, meet legal requirements or prevent fraud.

6. WHY INFORMATION IS USED
Information may be used to provide VAD, authenticate users, keep balances and positions accurate, process transactions, meet compliance obligations, prevent abuse, communicate important updates, provide support and improve reliability.

7. WHEN INFORMATION MAY BE SHARED
Information may be shared with service providers that help VAD deliver a feature, with authorities where legally required, or as needed to investigate fraud, security incidents or harmful activity. VAD should not expose private account information to other users unless you choose to make information public through a product feature.

8. RETENTION
Information should be kept only for as long as needed for the purpose it was collected, including account operation, dispute handling, security, compliance and legal recordkeeping.

9. YOUR CHOICES
Where available, you can update profile information, manage product settings and contact support about privacy questions. Some records may need to be retained even after an account change when required for security, financial records or legal obligations.

10. POLICY UPDATES
If this notice changes in a way that requires your agreement, VAD should show the updated version and ask you to review it before continuing.
$privacy$;
begin
  insert into policy.policies (domain, name, description, status, created_by)
  values ('PLATFORM','LEGAL_TERMS','VAD Terms of Use shown to product users.','DRAFT',null)
  on conflict (domain, name) do update set description = excluded.description
  returning id into terms_policy_id;

  insert into policy.policies (domain, name, description, status, created_by)
  values ('PLATFORM','LEGAL_PRIVACY','VAD Privacy Notice shown to product users.','DRAFT',null)
  on conflict (domain, name) do update set description = excluded.description
  returning id into privacy_policy_id;

  select current_version_id into terms_version_id from policy.policies where id = terms_policy_id;
  if terms_version_id is null then
    insert into policy.policy_versions (
      policy_id, version, configuration, effective_at, created_by, approved_by, reason, activation_mode
    ) values (
      terms_policy_id, 1,
      jsonb_build_object(
        'documentKey','TERMS',
        'title','VAD Terms of Use',
        'summary','The rules for using VAD, creating an account and participating in markets.',
        'versionLabel','2026.09',
        'effectiveDate',current_date::text,
        'requiredAcceptance',true,
        'content',terms_content
      ),
      statement_timestamp(), null, null, 'Initial legal policy bootstrap', 'LEGACY'
    ) returning id into terms_version_id;
    update policy.policies set current_version_id = terms_version_id, status='ACTIVE', updated_at=statement_timestamp() where id=terms_policy_id;
  end if;

  select current_version_id into privacy_version_id from policy.policies where id = privacy_policy_id;
  if privacy_version_id is null then
    insert into policy.policy_versions (
      policy_id, version, configuration, effective_at, created_by, approved_by, reason, activation_mode
    ) values (
      privacy_policy_id, 1,
      jsonb_build_object(
        'documentKey','PRIVACY',
        'title','VAD Privacy Notice',
        'summary','How VAD handles account, verification, payment, device and product-use information.',
        'versionLabel','2026.09',
        'effectiveDate',current_date::text,
        'requiredAcceptance',true,
        'content',privacy_content
      ),
      statement_timestamp(), null, null, 'Initial legal policy bootstrap', 'LEGACY'
    ) returning id into privacy_version_id;
    update policy.policies set current_version_id = privacy_version_id, status='ACTIVE', updated_at=statement_timestamp() where id=privacy_policy_id;
  end if;

  insert into policy.legal_document_drafts (
    document_key, policy_id, title, summary, version_label, effective_date,
    required_acceptance, content
  ) values
  ('TERMS', terms_policy_id, 'VAD Terms of Use', 'The rules for using VAD, creating an account and participating in markets.', '2026.09-next', current_date, true, terms_content),
  ('PRIVACY', privacy_policy_id, 'VAD Privacy Notice', 'How VAD handles account, verification, payment, device and product-use information.', '2026.09-next', current_date, true, privacy_content)
  on conflict (document_key) do nothing;

  insert into experience.product_tours (
    code, name, description, status, auto_start
  ) values (
    'GETTING_STARTED',
    'Getting started with VAD',
    'A guided walkthrough of the most important VAD product controls and routes.',
    'ACTIVE',
    true
  )
  on conflict (code) do update set
    name = excluded.name,
    description = excluded.description,
    status = excluded.status
  returning id into tour_id;

  select current_version_id into tour_version_id from experience.product_tours where id = tour_id;
  if tour_version_id is null then
    insert into experience.product_tour_versions (
      tour_id, version_number, version_label, effective_at, auto_prompt_existing
    ) values (
      tour_id, 1, '2026.09', statement_timestamp(), false
    ) returning id into tour_version_id;

    insert into experience.product_tour_steps (
      tour_version_id, step_key, sequence, route, target_id, title, body
    ) values
    (tour_version_id,'home-overview',1,'/home','home-overview','Your starting point','This is your VAD home. It brings live markets, featured opportunities and community activity together in one place.'),
    (tour_version_id,'search-markets',2,'/home','global-search','Find a market quickly','Use Search whenever you already know the event, topic or market you want to find.'),
    (tour_version_id,'explore-markets',3,'/home','home-explore-markets','Browse every market','Tap Explore markets when you want to see the full market catalogue and compare more choices.'),
    (tour_version_id,'featured-markets',4,'/home','home-featured-markets','See what deserves a closer look','Featured markets highlight questions that are currently important or useful to discover.'),
    (tour_version_id,'market-categories',5,'/home','home-categories','Jump into a topic','These shortcuts take you straight to markets in a category without making you search first.'),
    (tour_version_id,'trending-markets',6,'/home','home-trending','Follow current activity','Trending markets help you notice questions where people have been active recently.'),
    (tour_version_id,'community-preview',7,'/home','home-community','Learn from the community','Read what other people are saying, then open the full feed when you want more context around a market.'),
    (tour_version_id,'market-discovery',8,'/markets','markets-discovery','Narrow down the market list','Search, choose a category and change the ordering here. Use these controls together to get to the right market faster.'),
    (tour_version_id,'market-cards',9,'/markets','markets-results','Open a market before taking a position','Each market card shows the question and current pricing. Open one to review the full details before you decide what to do.'),
    (tour_version_id,'wallet-balance',10,'/wallet','wallet-balance','Know what is available','Your wallet separates money that is ready to use, money committed to open orders and withdrawals that are still processing.'),
    (tour_version_id,'wallet-actions',11,'/wallet','wallet-actions','Move money from one place','Deposit, withdraw and open your payment history from these shortcuts. VAD keeps each currency balance separate.'),
    (tour_version_id,'wallet-activity',12,'/wallet','wallet-activity','Check what happened to a payment','Recent activity shows the latest deposits, withdrawals and refunds. Open an item when you need its full status.'),
    (tour_version_id,'portfolio-summary',13,'/portfolio','portfolio-summary','See what you currently hold','Your portfolio brings together your positions, shares held, open orders and the currencies you are using.'),
    (tour_version_id,'portfolio-switcher',14,'/portfolio','portfolio-switcher','Switch between holdings and orders','Use these tabs to move between positions you already hold and orders that are still waiting to fill.'),
    (tour_version_id,'verification',15,'/account','account-verification','Check your verification','Identity verification lives here. VAD will show your current status and the next step when verification is required.'),
    (tour_version_id,'funding-settings',16,'/account','account-funding','Review funding access','Open Funding & withdrawals to see availability, limits, fees and payment activity connected to your account.'),
    (tour_version_id,'tour-and-policies',17,'/account','account-guidance','Come back whenever you need help','You can take this guided tour again from your account settings, and you can always return to VAD policies and privacy information here.');

    update experience.product_tours
    set current_version_id = tour_version_id, updated_at = statement_timestamp()
    where id = tour_id;
  end if;
end;
$$;
