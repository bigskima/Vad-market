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
  select
    p.id,
    pv.id,
    pv.version,
    pv.configuration ->> 'documentKey',
    pv.configuration,
    pv.effective_at
  from policy.policies p
  join policy.policy_versions pv on pv.id = p.current_version_id
  where p.domain = 'PLATFORM'
    and p.name in ('LEGAL_TERMS', 'LEGAL_PRIVACY')
    and p.status <> 'RETIRED'
    and pv.effective_at <= statement_timestamp()
    and (pv.expires_at is null or pv.expires_at > statement_timestamp())
    and pv.configuration ->> 'documentKey' in ('TERMS','PRIVACY');
$$;

revoke all on function private.current_legal_policy_versions() from public, anon, authenticated;

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
    and not exists (
      select 1
      from policy.user_policy_acceptances a
      where a.user_id = caller_id
        and a.policy_version_id = c.policy_version_id
    )
    and not (c.policy_version_id = any(coalesce(p_policy_version_ids, '{}'::bigint[])));

  if missing_count > 0 then
    raise exception 'All newly required policy versions must be accepted before continuing' using errcode = '22023';
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
        select 1
        from policy.user_policy_acceptances a
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
