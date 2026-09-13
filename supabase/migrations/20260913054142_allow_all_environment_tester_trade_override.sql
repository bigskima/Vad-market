create or replace function private.trade_access_satisfies(
  p_user_id uuid,
  p_country_code text,
  p_asset_id bigint
) returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_policy_enabled boolean:=false;
  v_sandbox_only boolean:=false;
begin
  if p_user_id is null then return false; end if;
  if not private.service_available('trading',p_user_id) then return false; end if;

  select coalesce((
    select cr.enabled
    from public.capability_rules cr
    where cr.capability_key='trade'
      and cr.country_code=p_country_code
      and cr.status='ACTIVE'
      and cr.effective_at<=statement_timestamp()
      and (cr.expires_at is null or cr.expires_at>statement_timestamp())
    order by cr.version desc
    limit 1
  ),false) into v_policy_enabled;

  if v_policy_enabled then return true; end if;

  select lower(coalesce(a.metadata->>'sandbox_only','false'))='true'
    into v_sandbox_only
  from public.assets a
  where a.id=p_asset_id and a.status='ACTIVE';

  if coalesce(v_sandbox_only,false) then
    return private.tester_access_satisfies(p_user_id,'SANDBOX');
  end if;

  return private.tester_access_satisfies(p_user_id,'PRODUCTION');
end;
$$;

revoke all on function private.trade_access_satisfies(uuid,text,bigint) from public,anon,authenticated;
