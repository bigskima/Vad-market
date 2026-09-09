-- VAD Phase 15: operational read model for account/admin identity and payment surfaces.

create or replace function public.admin_operations_summary()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if not private.has_permission('compliance.manage')
     and not private.has_permission('finance.read')
     and not private.has_permission('providers.manage')
     and not private.has_permission('support.read') then
    raise exception 'Permission required' using errcode='42501';
  end if;

  return jsonb_build_object(
    'kycAwaitingUser', (select count(*) from compliance.kyc_cases where status in ('CREATED','PROVIDER_PENDING')),
    'kycInReview', (select count(*) from compliance.kyc_cases where status='IN_REVIEW'),
    'kycVerified', (select count(*) from compliance.kyc_cases where status='VERIFIED'),
    'paymentCreated', (select count(*) from payments.intents where status='CREATED'),
    'paymentProviderPending', (select count(*) from payments.intents where status='PROVIDER_PENDING'),
    'paymentFailed', (select count(*) from payments.intents where status='FAILED'),
    'pendingProviderChanges', (select count(*) from integration.provider_change_requests where status='PENDING'),
    'configuredProviders', (select count(*) from integration.providers where coalesce((public_metadata->>'configured')::boolean,false)=true and status in ('ACTIVE','DEGRADED')),
    'generatedAt', statement_timestamp()
  );
end;
$$;
revoke all on function public.admin_operations_summary() from public,anon;
grant execute on function public.admin_operations_summary() to authenticated;

create or replace function public.my_account_operations()
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare kyc jsonb; readiness jsonb;
begin
  perform private.require_active_account();
  kyc:=public.my_kyc_status();
  readiness:=public.provider_readiness();
  return jsonb_build_object(
    'kyc',kyc,
    'providers',readiness,
    'paymentIntents',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from public.my_payment_intents(10) x),'[]'::jsonb),
    'generatedAt',statement_timestamp()
  );
end;
$$;
revoke all on function public.my_account_operations() from public,anon;
grant execute on function public.my_account_operations() to authenticated;
