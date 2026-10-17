-- Enforce current-location eligibility inside the shared trading access gate.
-- This protects quote, order placement, pooled staking and on-chain prediction preparation
-- wherever those operations call private.trade_access_satisfies().
create or replace function private.trade_access_satisfies(
  p_user_id uuid,
  p_country_code text,
  p_asset_id bigint
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_policy_enabled boolean := false;
  v_sandbox_only boolean := false;
  v_asset_code text;
begin
  if p_user_id is null or p_asset_id is null then return false; end if;
  if not private.service_available('trading', p_user_id) then return false; end if;
  if not private.asset_available_in_country(p_country_code, p_asset_id) then return false; end if;

  select a.code, lower(coalesce(a.metadata->>'sandbox_only', 'false')) = 'true'
    into v_asset_code, v_sandbox_only
  from public.assets a
  where a.id = p_asset_id and a.status = 'ACTIVE';

  if v_asset_code = 'NGN' then
    if p_country_code is distinct from 'NG'
       or not exists (
         select 1
         from public.user_accounts ua
         join public.user_location_verifications lv on lv.user_id = ua.user_id
         where ua.user_id = p_user_id
           and ua.country_code = 'NG'
           and lv.decision = 'VERIFIED'
           and lv.reason_code = 'ALLOWED'
           and lv.device_country_code = 'NG'
           and lv.ip_country_code = 'NG'
           and lv.vpn_detected = false
           and lv.proxy_detected = false
           and lv.tor_detected = false
           and lv.hosting_detected = false
           and lv.expires_at > statement_timestamp()
       ) then
      return false;
    end if;
  end if;

  select coalesce((
    select cr.enabled
    from public.capability_rules cr
    where cr.capability_key = 'trade'
      and cr.country_code = p_country_code
      and cr.status = 'ACTIVE'
      and cr.effective_at <= statement_timestamp()
      and (cr.expires_at is null or cr.expires_at > statement_timestamp())
    order by cr.version desc
    limit 1
  ), false) into v_policy_enabled;

  if v_policy_enabled then return true; end if;
  if coalesce(v_sandbox_only, false) then
    return private.tester_access_satisfies(p_user_id, 'SANDBOX');
  end if;
  return private.tester_access_satisfies(p_user_id, 'PRODUCTION');
end;
$function$;
