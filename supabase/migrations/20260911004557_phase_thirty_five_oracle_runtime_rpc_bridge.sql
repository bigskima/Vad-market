-- VAD Phase 35: keep the oracle schema private while exposing one service-role-only
-- RPC bridge for the Edge Function runtime.

create or replace function public.internal_record_verified_oracle_observation(
  p_event_id bigint,
  p_provider_id bigint,
  p_source_code text,
  p_observed_outcome text,
  p_payload jsonb,
  p_evidence_reference text,
  p_observed_at timestamptz,
  p_idempotency_key text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.role()<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  return oracle.record_verified_observation(
    p_event_id,
    p_provider_id,
    p_source_code,
    p_observed_outcome,
    coalesce(p_payload,'{}'::jsonb),
    p_evidence_reference,
    p_observed_at,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.internal_record_verified_oracle_observation(bigint,bigint,text,text,jsonb,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.internal_record_verified_oracle_observation(bigint,bigint,text,text,jsonb,text,timestamptz,text) to service_role;
