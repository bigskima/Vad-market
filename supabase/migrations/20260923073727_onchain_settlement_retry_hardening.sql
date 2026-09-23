begin;

create or replace function private.reset_onchain_settlement_entitlement_on_failure()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.status='FAILED'
     and old.status is distinct from new.status
     and new.action in ('CLAIM','REFUND') then
    update blockchain.settlement_entitlements
    set status='PENDING',
        settlement_intent_id=null,
        metadata=metadata||jsonb_build_object(
          'last_failed_intent_id',new.public_id,
          'last_failure_code',new.failure_code,
          'last_failed_at',statement_timestamp()
        ),
        updated_at=statement_timestamp()
    where settlement_intent_id=new.id
      and status in ('AUTHORIZED','SUBMITTED');
  end if;

  return new;
end;
$$;

revoke all on function private.reset_onchain_settlement_entitlement_on_failure()
  from public,anon,authenticated;

drop trigger if exists blockchain_reset_settlement_entitlement_on_failure
  on blockchain.transaction_intents;
create trigger blockchain_reset_settlement_entitlement_on_failure
after update of status on blockchain.transaction_intents
for each row
execute function private.reset_onchain_settlement_entitlement_on_failure();

create or replace function public.internal_fail_onchain_intent(
  p_user_id uuid,
  p_intent_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
  v_failure_code text;
begin
  if p_user_id is null or p_intent_id is null then
    raise exception 'On-chain failure identity is required' using errcode='22023';
  end if;

  select ti.* into v_intent
  from blockchain.transaction_intents ti
  where ti.public_id=p_intent_id
    and ti.user_id=p_user_id
  for update;

  if v_intent.id is null then
    raise exception 'On-chain transaction intent not found' using errcode='P0002';
  end if;

  if v_intent.status in ('CONFIRMED','FAILED','CANCELLED','REPLACED','DROPPED') then
    return true;
  end if;

  v_failure_code:=left(
    upper(regexp_replace(
      btrim(coalesce(p_failure_code,'ONCHAIN_FAILED')),
      '[^A-Z0-9_]+','_','g'
    )),
    80
  );
  if v_failure_code='' then v_failure_code:='ONCHAIN_FAILED'; end if;

  update blockchain.transaction_authorizations
  set status='CANCELLED',
      signer_address=null,
      signature=null,
      signed_at=null,
      updated_at=statement_timestamp()
  where intent_id=v_intent.id
    and status in ('PREPARED','SIGNED');

  update blockchain.transactions
  set status='FAILED',
      failure_code=v_failure_code,
      finalized=false,
      updated_at=statement_timestamp()
  where intent_id=v_intent.id
    and status in ('SUBMITTED','CONFIRMING');

  update blockchain.transaction_intents
  set status='FAILED',
      failure_code=v_failure_code
  where id=v_intent.id;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    p_user_id,'SYSTEM','ONCHAIN_INTENT_FAILED','ONCHAIN_TRANSACTION_INTENT',
    v_intent.public_id::text,'On-chain transaction intent failed before final confirmation',
    jsonb_build_object(
      'action',v_intent.action,
      'failure_code',v_failure_code,
      'retryable_settlement',v_intent.action in ('CLAIM','REFUND')
    )
  );

  return true;
end;
$$;

revoke all on function public.internal_fail_onchain_intent(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_fail_onchain_intent(uuid,uuid,text)
  to service_role;

commit;
