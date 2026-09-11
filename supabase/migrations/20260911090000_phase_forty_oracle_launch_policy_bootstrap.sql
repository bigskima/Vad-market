-- VAD Phase 40: governed launch oracle policy bootstrap.
--
-- The system may prepare a conservative DRAFT, but it never activates the policy.
-- Activation still requires an authenticated oracle reviewer and the existing
-- approval/audit path. This gives a fresh production environment a concrete policy
-- to review without bypassing maker/checker governance.

do $$
declare
  v_capability_id bigint;
  v_policy_public_id uuid;
begin
  select id into v_capability_id
  from oracle.capabilities
  where code='OBJECTIVE_EVENT_RESULT';

  if v_capability_id is null then
    raise exception 'OBJECTIVE_EVENT_RESULT oracle capability is required';
  end if;

  if not exists (
    select 1
    from oracle.policies
    where name='VAD Crypto Threshold Launch Policy'
  ) then
    insert into oracle.policies(
      name,
      capability_id,
      version,
      source_hierarchy,
      consensus_rule,
      close_rule,
      postponement_rule,
      cancellation_rule,
      void_rule,
      dispute_window_seconds,
      status,
      effective_at,
      created_by,
      approved_by
    ) values (
      'VAD Crypto Threshold Launch Policy',
      v_capability_id,
      1,
      '[
        {"provider_code":"PYTH","role":"PRIMARY"},
        {"provider_code":"COINGECKO","role":"CORROBORATING"}
      ]'::jsonb,
      '{
        "min_agreeing_providers":2,
        "distinct_providers":true,
        "tie_behavior":"NO_RESOLUTION"
      }'::jsonb,
      '{"mode":"SCHEDULED_CLOSE"}'::jsonb,
      '{"mode":"REVIEW"}'::jsonb,
      '{"mode":"VOID"}'::jsonb,
      '{"mode":"EQUAL_SPLIT"}'::jsonb,
      3600,
      'DRAFT',
      statement_timestamp(),
      null,
      null
    )
    returning public_id into v_policy_public_id;

    insert into audit.records(
      actor_type,
      action,
      resource_type,
      resource_id,
      reason,
      metadata
    ) values (
      'SYSTEM',
      'ORACLE_POLICY_DRAFT_CREATED',
      'ORACLE_POLICY',
      v_policy_public_id::text,
      'Prepared conservative launch crypto oracle policy draft for admin review',
      jsonb_build_object(
        'name','VAD Crypto Threshold Launch Policy',
        'version',1,
        'required_providers',jsonb_build_array('PYTH','COINGECKO'),
        'min_agreeing_providers',2
      )
    );
  end if;
end $$;

create or replace function public.admin_oracle_policy_catalog()
returns table(
  public_id uuid,
  name text,
  capability_code text,
  version integer,
  status text,
  source_hierarchy jsonb,
  consensus_rule jsonb,
  void_rule jsonb,
  dispute_window_seconds integer,
  effective_at timestamptz,
  created_by uuid,
  approved_by uuid,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not (
    private.has_permission('oracle.review')
    or private.has_permission('markets.manage')
    or private.has_permission('providers.manage')
  ) then
    raise exception 'Permission required' using errcode='42501';
  end if;

  return query
  select
    p.public_id,
    p.name,
    c.code,
    p.version,
    p.status,
    p.source_hierarchy,
    p.consensus_rule,
    p.void_rule,
    p.dispute_window_seconds,
    p.effective_at,
    p.created_by,
    p.approved_by,
    p.created_at
  from oracle.policies p
  join oracle.capabilities c on c.id=p.capability_id
  order by
    case p.status when 'DRAFT' then 0 when 'ACTIVE' then 1 else 2 end,
    p.name,
    p.version desc;
end;
$$;

revoke all on function public.admin_oracle_policy_catalog() from public,anon;
grant execute on function public.admin_oracle_policy_catalog() to authenticated;
