begin;

insert into control.services (
  service_key,
  name,
  description,
  category,
  default_enabled,
  user_scopable,
  inherits_app_pause,
  status
)
values
  (
    'auth_google',
    'Google sign-in',
    'Allow customers to sign in or create an account with Google.',
    'Authentication',
    true,
    false,
    false,
    'ACTIVE'
  ),
  (
    'auth_apple',
    'Apple sign-in',
    'Allow customers to sign in or create an account with Apple.',
    'Authentication',
    true,
    false,
    false,
    'ACTIVE'
  ),
  (
    'auth_phone_verification',
    'Phone verification',
    'Offer phone-number verification after sign-in.',
    'Authentication',
    true,
    false,
    false,
    'ACTIVE'
  )
on conflict (service_key) do update
set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  user_scopable = excluded.user_scopable,
  inherits_app_pause = excluded.inherits_app_pause,
  status = excluded.status,
  updated_at = statement_timestamp();

-- Optional authentication methods start fail-closed. A Super Admin can enable
-- them from Service Controls after the matching Supabase Auth provider is ready.
insert into control.service_overrides (
  service_key,
  scope_type,
  user_id,
  paused,
  reason,
  resumes_at,
  changed_by
)
values
  ('auth_google', 'GLOBAL', null, true, 'Google sign-in has not been enabled for customers yet.', null, null),
  ('auth_apple', 'GLOBAL', null, true, 'Apple sign-in has not been enabled for customers yet.', null, null),
  ('auth_phone_verification', 'GLOBAL', null, true, 'Phone verification has not been enabled for customers yet.', null, null)
on conflict (service_key) where scope_type = 'GLOBAL' do nothing;

create or replace function public.public_auth_method_state()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'emailPassword', true,
    'google', coalesce((private.service_control_state('auth_google', null)->>'enabled')::boolean, false),
    'apple', coalesce((private.service_control_state('auth_apple', null)->>'enabled')::boolean, false),
    'phoneVerification', coalesce((private.service_control_state('auth_phone_verification', null)->>'enabled')::boolean, false)
  );
$$;

revoke all on function public.public_auth_method_state() from public;
grant execute on function public.public_auth_method_state() to anon, authenticated;

-- A user with no KYC case used to receive providerConfigured=false unconditionally.
-- Resolve readiness from the current DIDIT integration instead, so the customer
-- page and the admin/provider state describe the same system state.
create or replace function public.my_kyc_status()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with didit as (
    select
      p.code,
      (
        p.status = 'ACTIVE'
        and coalesce((p.public_metadata->>'configured')::boolean, false)
      ) as provider_configured
    from integration.providers p
    where upper(p.code) = 'DIDIT'
      and p.environment = 'PRODUCTION'
    order by p.id desc
    limit 1
  ),
  latest_case as (
    select
      k.public_id,
      k.verification_level,
      k.status,
      coalesce(p.code, 'DIDIT') as provider_code,
      k.created_at,
      k.updated_at,
      k.completed_at,
      k.expires_at
    from compliance.kyc_cases k
    left join integration.providers p on p.id = k.provider_id
    where k.user_id = auth.uid()
    order by k.created_at desc
    limit 1
  ),
  availability as (
    select
      coalesce((select provider_configured from didit), false) as provider_configured,
      coalesce(
        (private.service_control_state('kyc_start', auth.uid())->>'enabled')::boolean,
        false
      ) as kyc_start_available
  )
  select
    case
      when exists (select 1 from latest_case) then (
        select jsonb_build_object(
          'casePublicId', c.public_id,
          'verificationLevel', c.verification_level,
          'status', c.status,
          'providerCode', c.provider_code,
          'providerConfigured', a.provider_configured,
          'kycStartAvailable', a.kyc_start_available,
          'createdAt', c.created_at,
          'updatedAt', c.updated_at,
          'completedAt', c.completed_at,
          'expiresAt', c.expires_at
        )
        from latest_case c
        cross join availability a
      )
      else (
        select jsonb_build_object(
          'status', 'NOT_STARTED',
          'providerCode', coalesce((select code from didit), 'DIDIT'),
          'providerConfigured', a.provider_configured,
          'kycStartAvailable', a.kyc_start_available
        )
        from availability a
      )
    end;
$$;

revoke all on function public.my_kyc_status() from public;
grant execute on function public.my_kyc_status() to authenticated;

commit;
