begin;

-- An active temporary NGN test credit may trade on the real instrument and the
-- normal matching/resolution/settlement pipeline, but it cannot leave the
-- account through NGN deposits, withdrawals or peer transfers.
create or replace function private.guard_temporary_ngn_credit_asset_transfer()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_ngn_asset_id bigint;
begin
  select a.id into v_ngn_asset_id from public.assets a where a.code='NGN';
  if new.asset_id=v_ngn_asset_id and (
    exists(select 1 from public.temporary_ngn_test_credit_grants g
      where g.user_id=new.sender_user_id and g.asset_id=v_ngn_asset_id and g.status='ACTIVE')
    or exists(select 1 from public.temporary_ngn_test_credit_grants g
      where g.user_id=new.recipient_user_id and g.asset_id=v_ngn_asset_id and g.status='ACTIVE')
  ) then
    raise exception 'NGN transfers are locked while a temporary market-test credit is active. The credit can only be used on standard NGN market orders and settlement.' using errcode='42501';
  end if;
  return new;
end;
$function$;

revoke all on function private.guard_temporary_ngn_credit_asset_transfer() from public,anon,authenticated,service_role;
drop trigger if exists block_transfers_during_temporary_ngn_credit on public.asset_transfers;
create trigger block_transfers_during_temporary_ngn_credit
before insert or update of asset_id,sender_user_id,recipient_user_id on public.asset_transfers
for each row execute function private.guard_temporary_ngn_credit_asset_transfer();

create or replace function private.issue_temporary_ngn_test_credit(
  p_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_actor_user_id uuid,
  p_request_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_email text;
  v_country_code text;
  v_user_status text;
  v_asset_id bigint;
  v_available_id bigint;
  v_reserved_id bigint;
  v_pending_id bigint;
  v_funding_id bigint;
  v_funding_status text;
  v_available_status text;
  v_reserved_status text;
  v_pending_status text;
  v_grant public.temporary_ngn_test_credit_grants%rowtype;
  v_journal_id bigint;
  v_journal_public_id uuid;
  v_available_balance numeric(38,18);
begin
  if p_user_id is null then
    raise exception 'A target VAD user is required.' using errcode='22023';
  end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then
    raise exception 'Temporary NGN test credit must be positive and use at most two decimal places.' using errcode='22023';
  end if;
  if nullif(trim(p_request_key),'') is null or length(trim(p_request_key))<8 then
    raise exception 'An idempotency key is required for a temporary test credit.' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('temporary-ngn-test-credit:'||p_user_id::text,0));

  select u.email into v_user_email from auth.users u where u.id=p_user_id;
  if v_user_email is null then
    raise exception 'The target VAD user does not exist.' using errcode='P0002';
  end if;

  select ua.status,case
    when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG'
    else upper(trim(coalesce(ua.country_code,'')))
  end
  into v_user_status,v_country_code
  from public.user_accounts ua where ua.user_id=p_user_id;
  if v_user_status is distinct from 'ACTIVE' or v_country_code<>'NG' then
    raise exception 'Temporary NGN test credit is restricted to active Nigerian VAD accounts.' using errcode='42501';
  end if;

  select a.id into v_asset_id from public.assets a where a.code='NGN' and a.status='ACTIVE';
  if v_asset_id is null then
    raise exception 'The real NGN asset is not active; no credit was issued.' using errcode='42501';
  end if;
  if not exists (
    select 1 from public.jurisdiction_assets ja
    join public.jurisdictions j on j.id=ja.jurisdiction_id
    where ja.asset_id=v_asset_id and ja.status='ACTIVE' and j.status='ACTIVE'
      and upper(trim(j.country_code)) in ('NG','NGA','NIGERIA')
  ) then
    raise exception 'NGN is not enabled by Nigerian jurisdiction policy; no credit was issued.' using errcode='42501';
  end if;

  select * into v_grant
  from public.temporary_ngn_test_credit_grants g
  where g.user_id=p_user_id and g.asset_id=v_asset_id and g.status='ACTIVE'
  order by g.created_at desc
  limit 1
  for update;
  if v_grant.id is not null then
    if v_grant.amount<>p_amount then
      raise exception 'An active NGN test credit already exists for this user at a different amount.' using errcode='23505';
    end if;
    select j.public_id into v_journal_public_id from finance.ledger_journals j where j.id=v_grant.grant_journal_id;
    select finance.account_balance(la.id) into v_available_balance
    from finance.ledger_accounts la
    where la.asset_id=v_asset_id and la.account_type='USER_AVAILABLE'
      and la.owner_type='USER' and la.owner_reference=p_user_id::text;
    return jsonb_build_object('status','ACTIVE','grantId',v_grant.public_id,'grantJournalId',v_journal_public_id,
      'amount',v_grant.amount,'availableBalance',coalesce(v_available_balance,0),'idempotentReplay',true);
  end if;

  if exists (
    select 1 from finance.ledger_journals j
    where j.idempotency_key='temporary-test-credit-grant:'||trim(p_request_key)
  ) then
    raise exception 'This test-credit request key was already used. No new credit was issued.' using errcode='23505';
  end if;

  if exists (
    select 1 from finance.ledger_accounts la
    where la.asset_id=v_asset_id and la.owner_type='USER' and la.owner_reference=p_user_id::text
      and la.account_type in ('USER_AVAILABLE','USER_RESERVED','WITHDRAWAL_PENDING')
      and finance.account_balance(la.id)<>0
  ) then
    raise exception 'This user already has real NGN ledger funds. A temporary credit cannot be mixed with existing NGN balances.' using errcode='55000';
  end if;

  if exists (
    select 1 from payments.intents pi
    where pi.user_id=p_user_id and pi.asset_id=v_asset_id
      and pi.operation in ('DEPOSIT','WITHDRAWAL')
      and pi.status not in ('SETTLED','FAILED','CANCELLED','EXPIRED','SUCCEEDED','REJECTED')
  ) then
    raise exception 'Resolve existing NGN deposit or withdrawal intents before issuing a temporary test credit.' using errcode='55000';
  end if;

  if exists (
    select 1 from trading.orders o join market.instruments i on i.id=o.instrument_id
    where o.user_id=p_user_id and i.asset_id=v_asset_id and o.status in ('OPEN','PARTIALLY_FILLED')
  ) or exists (
    select 1 from trading.pool_stakes s join market.instruments i on i.id=s.instrument_id
    where s.user_id=p_user_id and i.asset_id=v_asset_id and i.status='OPEN'
  ) or exists (
    select 1 from trading.positions pos join market.instruments i on i.id=pos.instrument_id
    where pos.user_id=p_user_id and i.asset_id=v_asset_id and i.status='OPEN' and pos.quantity<>0
  ) then
    raise exception 'Resolve all existing NGN orders, stakes and positions before issuing a temporary test credit.' using errcode='55000';
  end if;

  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference,status)
  values(v_asset_id,'TREASURY','PLATFORM','VAD_TEMPORARY_TEST_CREDIT','ACTIVE')
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;
  select la.id,la.status into v_funding_id,v_funding_status
  from finance.ledger_accounts la
  where la.asset_id=v_asset_id and la.account_type='TREASURY'
    and la.owner_type='PLATFORM' and la.owner_reference='VAD_TEMPORARY_TEST_CREDIT'
  for update;
  if v_funding_id is null or v_funding_status<>'ACTIVE' then
    raise exception 'The temporary test-credit issuer ledger account is not active.' using errcode='23514';
  end if;

  v_available_id:=finance.ensure_user_account(p_user_id,v_asset_id,'USER_AVAILABLE');
  v_reserved_id:=finance.ensure_user_account(p_user_id,v_asset_id,'USER_RESERVED');
  v_pending_id:=finance.ensure_user_account(p_user_id,v_asset_id,'WITHDRAWAL_PENDING');

  select status into v_available_status from finance.ledger_accounts where id=v_available_id for update;
  select status into v_reserved_status from finance.ledger_accounts where id=v_reserved_id for update;
  select status into v_pending_status from finance.ledger_accounts where id=v_pending_id for update;
  if v_available_status<>'ACTIVE' or v_reserved_status<>'ACTIVE' or v_pending_status<>'ACTIVE' then
    raise exception 'A user NGN wallet ledger account is frozen or closed. No test credit was issued.' using errcode='42501';
  end if;

  insert into public.temporary_ngn_test_credit_grants(
    user_id,asset_id,amount,status,reason,created_by
  ) values(
    p_user_id,v_asset_id,p_amount,'ACTIVE',
    coalesce(nullif(trim(p_reason),''),'Temporary non-withdrawable NGN market-testing credit using standard market settlement.'),
    p_actor_user_id
  ) returning * into v_grant;

  v_journal_id:=finance.transfer(
    v_asset_id,v_funding_id,v_available_id,p_amount,
    'TEMPORARY_TEST_CREDIT_GRANT',
    'temporary-test-credit-grant:'||trim(p_request_key),
    'TEMPORARY_TEST_CREDIT',v_grant.public_id::text,
    'Non-withdrawable temporary NGN market test credit for '||v_user_email||'. This is synthetic test funding, not a cash deposit; it is restricted to standard market order and settlement testing.',
    p_actor_user_id
  );

  update public.temporary_ngn_test_credit_grants
  set grant_journal_id=v_journal_id
  where id=v_grant.id;

  insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,before_state,after_state,reason,request_id,occurred_at,metadata)
  values(p_actor_user_id,case when p_actor_user_id is null then 'SYSTEM' else 'ADMIN' end,
    'TEMPORARY_NGN_TEST_CREDIT_GRANTED','TEMPORARY_TEST_CREDIT',v_grant.public_id::text,
    null,jsonb_build_object('status','ACTIVE','asset_code','NGN','amount',p_amount,
      'withdrawals_blocked',true,'transfers_blocked',true,'deposits_blocked',true,
      'market_orders_use_standard_settlement',true),
    coalesce(nullif(trim(p_reason),''),'Temporary NGN market-test credit'),
    gen_random_uuid(),statement_timestamp(),
    jsonb_build_object('user_id',p_user_id,'email',v_user_email,'asset_code','NGN',
      'amount',p_amount,'grant_journal_id',v_journal_id,'synthetic_non_cash_credit',true));

  return jsonb_build_object('status','ACTIVE','grantId',v_grant.public_id,
    'grantJournalId',v_journal_id,'amount',p_amount,
    'availableBalance',finance.account_balance(v_available_id),'idempotentReplay',false);
end;
$function$;

revoke all on function private.issue_temporary_ngn_test_credit(uuid,numeric,text,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.admin_grant_temporary_ngn_test_credit(
  p_user_email text,
  p_amount numeric,
  p_reason text default 'Temporary NGN market testing'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid;
begin
  if auth.uid() is null or not coalesce(private.is_super_admin(),false) then
    raise exception 'Super administrator permission is required to issue temporary NGN test credit.' using errcode='42501';
  end if;
  select u.id into v_user_id from auth.users u where lower(u.email)=lower(trim(coalesce(p_user_email,''))) limit 1;
  if v_user_id is null then
    raise exception 'No VAD account exists for the supplied email address.' using errcode='P0002';
  end if;
  return private.issue_temporary_ngn_test_credit(
    v_user_id,p_amount,p_reason,auth.uid(),'admin-'||gen_random_uuid()::text
  );
end;
$function$;

revoke all on function public.admin_grant_temporary_ngn_test_credit(text,numeric,text) from public,anon;
grant execute on function public.admin_grant_temporary_ngn_test_credit(text,numeric,text) to authenticated,service_role;

-- Issue the specifically requested one-time temporary credit using the same
-- grant + finance ledger journal path that the future admin grant API uses.
do $issue$
declare
  v_user_id uuid;
  v_email text;
  v_result jsonb;
begin
  select u.id,u.email into v_user_id,v_email
  from auth.users u
  where lower(u.email)='skima714@gmail.com'
  limit 1;
  if v_user_id is null then
    raise exception 'Target VAD account skima714@gmail.com was not found. No test credit was issued.';
  end if;
  v_result:=private.issue_temporary_ngn_test_credit(
    v_user_id,500000,
    'User-authorized temporary NGN market-testing credit. Non-withdrawable and non-transferable; usable only on real NGN market instruments through the standard order/matching/resolution/settlement engine. Not a deposit or cash-backed balance.',
    null,
    'authorized-skima714-ngn-market-test-20261024'
  );
  raise notice 'Temporary NGN market-test credit outcome: %',v_result;
end;
$issue$;

select pg_notify('pgrst','reload schema');
commit;
