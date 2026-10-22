-- Enable the Phase 4 Nigeria production trading capability requested for VAD launch.
-- Order placement still goes through the account, jurisdiction, location-verification,
-- available-balance/position, fee-reserve, market-window and idempotency guards.
begin;

do $migration$
declare
  v_now timestamptz := statement_timestamp();
  v_next_version integer;
  v_rule_id bigint;
  v_before jsonb;
  v_after jsonb;
begin
  -- This migration is safe to retry: never add another enabled version if an
  -- eligible production rule is already active.
  if not exists (
    select 1
    from public.capability_rules r
    where r.capability_key = 'trade'
      and r.country_code = 'NG'
      and r.status = 'ACTIVE'
      and r.enabled
      and r.effective_at <= v_now
      and (r.expires_at is null or r.expires_at > v_now)
  ) then
    select coalesce(max(r.version), 0) + 1
      into v_next_version
    from public.capability_rules r
    where r.capability_key = 'trade'
      and r.country_code = 'NG';

    select coalesce(jsonb_agg(to_jsonb(r) order by r.version), '[]'::jsonb)
      into v_before
    from public.capability_rules r
    where r.capability_key = 'trade'
      and r.country_code = 'NG'
      and r.status = 'ACTIVE';

    update public.capability_rules
       set status = 'RETIRED'
     where capability_key = 'trade'
       and country_code = 'NG'
       and status = 'ACTIVE';

    insert into public.capability_rules (
      capability_key,
      country_code,
      version,
      enabled,
      reason_code,
      status,
      effective_at,
      expires_at,
      created_by,
      approved_by
    ) values (
      'trade',
      'NG',
      v_next_version,
      true,
      'PHASE_4_NG_TRADING_ENABLED',
      'ACTIVE',
      v_now,
      null,
      null,
      null
    )
    returning id into v_rule_id;

    select to_jsonb(r)
      into v_after
    from public.capability_rules r
    where r.id = v_rule_id;

    insert into audit.records (
      actor_user_id,
      actor_type,
      action,
      resource_type,
      resource_id,
      before_state,
      after_state,
      reason,
      metadata
    ) values (
      null,
      'SYSTEM',
      'TRADING_CAPABILITY_ENABLED',
      'CAPABILITY_RULE',
      v_rule_id::text,
      v_before,
      v_after,
      'Requested VAD Nigeria trading activation; existing location and account eligibility checks remain required.',
      jsonb_build_object(
        'migration', '20261022144500_enable_ng_trade_capability',
        'capability_key', 'trade',
        'country_code', 'NG',
        'preserved_guards', jsonb_build_array(
          'active_account',
          'active_asset_and_jurisdiction',
          'verified_ng_location',
          'available_balance_or_position',
          'market_open_window',
          'idempotency',
          'trading_fee_policy'
        )
      )
    );
  end if;
end;
$migration$;

commit;
