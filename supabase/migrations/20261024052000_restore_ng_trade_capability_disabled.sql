begin;

-- Revert the unintended phase-4 NG trading capability activation that was
-- bundled into the UI reconciliation. Restore the recorded pre-change posture.
-- Only retire the exact migration-created rule; never override a subsequent
-- independently approved capability change.
do $migration$
declare
  v_now timestamptz := statement_timestamp();
  v_next_version integer;
  v_rule_id bigint;
  v_before jsonb;
  v_after jsonb;
begin
  if exists (
    select 1
    from public.capability_rules r
    where r.capability_key = 'trade'
      and r.country_code = 'NG'
      and r.status = 'ACTIVE'
      and r.enabled
      and r.reason_code = 'PHASE_4_NG_TRADING_ENABLED'
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
       and status = 'ACTIVE'
       and enabled
       and reason_code = 'PHASE_4_NG_TRADING_ENABLED';

    insert into public.capability_rules (
      capability_key, country_code, version, enabled, reason_code,
      status, effective_at, expires_at, created_by, approved_by
    ) values (
      'trade', 'NG', v_next_version, false, 'PHASE_4_NOT_ENABLED',
      'ACTIVE', v_now, null, null, null
    )
    returning id into v_rule_id;

    select to_jsonb(r) into v_after
    from public.capability_rules r
    where r.id = v_rule_id;

    insert into audit.records (
      actor_user_id, actor_type, action, resource_type, resource_id,
      before_state, after_state, reason, metadata
    ) values (
      null, 'SYSTEM', 'TRADING_CAPABILITY_RESTORED_DISABLED', 'CAPABILITY_RULE', v_rule_id::text,
      v_before, v_after,
      'Restore the pre-reconciliation NG trading capability posture; production activation remains separate for review.',
      jsonb_build_object(
        'migration', '20261024052000_restore_ng_trade_capability_disabled',
        'capability_key', 'trade',
        'country_code', 'NG',
        'restored_from_reason_code', 'PHASE_4_NG_TRADING_ENABLED'
      )
    );
  end if;
end;
$migration$;

commit;
