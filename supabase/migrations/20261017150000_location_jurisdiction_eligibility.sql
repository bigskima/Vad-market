-- Location evidence for jurisdiction-restricted services.
-- Coordinates are evaluated transiently and are not persisted.
create table if not exists public.user_location_verifications (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_country_code text,
  ip_country_code text,
  decision text not null check (decision in ('VERIFIED', 'DENIED', 'REVIEW')),
  reason_code text not null,
  vpn_detected boolean not null default false,
  proxy_detected boolean not null default false,
  tor_detected boolean not null default false,
  hosting_detected boolean not null default false,
  checked_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default statement_timestamp()
);

alter table public.user_location_verifications enable row level security;
drop policy if exists user_location_verifications_select_own on public.user_location_verifications;
create policy user_location_verifications_select_own
  on public.user_location_verifications for select to authenticated
  using (auth.uid() = user_id);
revoke all on public.user_location_verifications from anon, authenticated;
grant select on public.user_location_verifications to authenticated;

-- Transaction handlers must call this function before authorizing any NGN-restricted action.
-- A verified location expires quickly and is bound to a Nigerian account jurisdiction.
create or replace function public.can_access_ngn_services()
returns table (allowed boolean, reason_code text, expires_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce(ua.country_code = 'NG', false)
      and coalesce(lv.decision = 'VERIFIED', false)
      and coalesce(lv.device_country_code = 'NG', false)
      and coalesce(lv.ip_country_code = 'NG', false)
      and coalesce(lv.vpn_detected, true) = false
      and coalesce(lv.proxy_detected, true) = false
      and coalesce(lv.tor_detected, true) = false
      and coalesce(lv.hosting_detected, true) = false
      and coalesce(lv.expires_at > statement_timestamp(), false) as allowed,
    case
      when ua.country_code is distinct from 'NG' then 'ACCOUNT_NOT_ELIGIBLE'
      when lv.user_id is null then 'LOCATION_CHECK_REQUIRED'
      when lv.expires_at <= statement_timestamp() then 'LOCATION_CHECK_EXPIRED'
      when lv.decision <> 'VERIFIED' then lv.reason_code
      when lv.device_country_code is distinct from 'NG' or lv.ip_country_code is distinct from 'NG' then 'LOCATION_MISMATCH'
      when lv.vpn_detected or lv.proxy_detected or lv.tor_detected or lv.hosting_detected then 'NETWORK_RISK'
      else 'ALLOWED'
    end as reason_code,
    lv.expires_at
  from (select auth.uid() as user_id) current_user
  left join public.user_accounts ua on ua.user_id = current_user.user_id
  left join public.user_location_verifications lv on lv.user_id = current_user.user_id;
$$;

revoke all on function public.can_access_ngn_services() from public, anon;
grant execute on function public.can_access_ngn_services() to authenticated;
