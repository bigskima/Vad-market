begin;

-- Add the missing grant operation to the already-deployed temporary NGN credit
-- framework. This is a capped, audited, non-withdrawable allocation into the
-- user's normal NGN USER_AVAILABLE account; market orders still use the same
-- market.instruments, trading.pool_stakes/orders and standard settlement paths.
create or replace function public.admin_grant_temporary_ngn_test_credit(
  p_email text,
  p_amount numeric,
  p_reason text default 'Temporary test allocation for standard NGN market settlement'
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_email text:=lower(trim(coalesce(p_email,'')));
  v_user_id uuid;
  v_user_status text;
  v_country_code text;
  v_asset_id bigint;
  v_available_id bigint;
  v_reserved_id bigint;
  v_pending_id bigint;
  v_available_balance numeric(38,18):=0;
  v_funding_id bigint;
  v_grant public.temporary_ngn_test_credit_grants%rowtype;
  v_journal_id bigint;
  v_reason text:=left(coalesce(nullif(trim(p_reason),''),'Temporary test allocation for standard NGN market settlement'),500);
begin
  if auth.uid() is null or not coalesce(private.is_super_admin(),false) then
    raise exception 'Super administrator permission is required to grant temporary NGN test funding.' using errcode='42501';
  end if;

  if v_email='' or length(v_email)>254 or position('@' in v_email)<2 or v_email ~ '[[:space:]]' then
    raise exception 'Enter a valid existing VAD account email.' using errcode='22023';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>500000 or p_amount<>round(p_amount,2) then
    raise exception 'Temporary NGN test credits must be greater than zero, no more than NGN 500,000, and have at most two decimals.' using errcode='22023';
  end if;

  select u.id into v_user_id
  from auth.users u
  where lower(u.email)=v_email
  limit 1;
  if v_user_id is null then
    raise exception 'No VAD account exists for that email address.' using errcode='P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('temporary-ngn-test-credit:'||v_user_id::text,0));

  select ua.status,
    case when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA')
      then 'NG' else upper(trim(coalesce(ua.country_code,''))) end
  into v_user_status,v_country_code
  from public.user_accounts ua
  where ua.user_id=v_user_id;

  if v_user_status is distinct from 'ACTIVE' then
    raise exception 'The recipient VAD account must be active.' using errcode='42501';
  end if;
  if v_country_code<>'NG' then
    raise exception 'Temporary NGN test allocations are restricted to active Nigerian accounts.' using errcode='42501';
  end if;

  select a.id into v_asset_id
  from public.assets a
  where a.code='NGN' and a.status='ACTIVE';
  if v_asset_id is null then
    raise exception 'The real NGN asset is not active.' using errcode='42501';
  end if;
  if not exists (
    select 1
    from public.assets a
    join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.status='ACTIVE'
    join public.jurisdictions j on j.id=ja.jurisdiction_id and j.status='ACTIVE'
    where a.id=v_asset_id and upper(trim(j.country_code)) in ('NG','NGA','NIGERIA')
  ) then
    raise exception 'NGN is not enabled by the current Nigeria jurisdiction policy.' using errcode='42501';
  end if;

  select * into v_grant
  from public.temporary_ngn_test_credit_grants g
  where g.user_id=v_user_id and g.asset_id=v_asset_id and g.status='ACTIVE'
  for update;
  if found then
    if v_grant.amount<>p_amount then
      raise exception 'This account already has an active temporary NGN test credit with a different amount. Revoke it after testing before granting another.' using errcode='55000';
    end if;
    v_available_id:=finance.ensure_user_account(v_user_id,v_asset_id,'USER_AVAILABLE');
    return jsonb_build_object(
      'status','ACTIVE','grantId',v_grant.public_id,'assetCode','NGN','amount',v_grant.amount,
      'availableBalance',greatest(finance.account_balance(v_available_id),0),
      'withdrawalsBlocked',true,'transfersBlocked',true,'depositsBlocked',true,
      'marketOrdersUseStandardSettlement',true,'idempotentReplay',true
    );
  end if;

  -- Do not mix this temporary credit with existing cash or pending/reserved
  -- real NGN. The normal market order functions will consume USER_AVAILABLE.
  select id into v_available_id from finance.ledger_accounts
  where asset_id=v_asset_id and owner_type='USER' and owner_reference=v_user_id::text
    and account_type='USER_AVAILABLE' and status='ACTIVE' for update;
  if v_available_id is not null then
    v_available_balance:=finance.account_balance(v_available_id);
    if v_available_balance<>0 then
      raise exception 'The NGN wallet must have a zero available balance before the isolated temporary test allocation can be granted.' using errcode='55000';
    end if;
  end if;

  v_reserved_id:=finance.ensure_user_account(v_user_id,v_asset_id,'USER_RESERVED');
  v_pending_id:=finance.ensure_user_account(v_user_id,v_asset_id,'WITHDRAWAL_PENDING');
  if finance.account_balance(v_reserved_id)<>0 or finance.account_balance(v_pending_id)<>0 then
    raise exception 'The NGN wallet has reserved or pending-withdrawal funds. Reconcile them before granting test credit.' using errcode='55000';
  end if;
  v_available_id:=finance.ensure_user_account(v_user_id,v_asset_id,'USER_AVAILABLE');

  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference,status)
  values(v_asset_id,'TREASURY','PLATFORM','VAD_TEMPORARY_TEST_CREDIT','ACTIVE')
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;

  select id into v_funding_id from finance.ledger_accounts
  where asset_id=v_asset_id and account_type='TREASURY' and owner_type='PLATFORM'
    and owner_reference='VAD_TEMPORARY_TEST_CREDIT' and status='ACTIVE'
  for update;
  if v_funding_id is null then
    raise exception 'Temporary NGN test-credit funding account could not be prepared.' using errcode='23514';
  end if;

  insert into public.temporary_ngn_test_credit_grants(
    user_id,asset_id,amount,status,reason,created_by
  ) values(v_user_id,v_asset_id,p_amount,'ACTIVE',v_reason,auth.uid())
  returning * into v_grant;

  v_journal_id:=finance.transfer(
    v_asset_id,v_funding_id,v_available_id,p_amount,
    'TEMPORARY_TEST_CREDIT','temporary-test-credit:'||v_grant.public_id::text,
    'TEMPORARY_TEST_CREDIT',v_grant.public_id::text,
    'Non-withdrawable NGN test allocation. Trades use standard live market settlement.',auth.uid()
  );

  update public.temporary_ngn_test_credit_grants
  set grant_journal_id=v_journal_id
  where id=v_grant.id;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,
    before_state,after_state,reason,request_id,occurred_at,metadata
  ) values(
    auth.uid(),'ADMIN','TEMPORARY_NGN_TEST_CREDIT_GRANTED','TEMPORARY_TEST_CREDIT',v_grant.public_id::text,
    jsonb_build_object('status','NONE'),
    jsonb_build_object('status','ACTIVE','amount',p_amount,'asset_code','NGN',
      'withdrawable',false,'transferable',false,'standard_market_settlement',true),
    v_reason,gen_random_uuid(),statement_timestamp(),
    jsonb_build_object('target_user_id',v_user_id,'target_email',v_email,
      'asset_code','NGN','amount',p_amount,'grant_journal_id',v_journal_id)
  );

  return jsonb_build_object(
    'status','ACTIVE','grantId',v_grant.public_id,'assetCode','NGN','amount',p_amount,
    'availableBalance',greatest(finance.account_balance(v_available_id),0),
    'grantJournalId',(select j.public_id from finance.ledger_journals j where j.id=v_journal_id),
    'withdrawalsBlocked',true,'transfersBlocked',true,'depositsBlocked',true,
    'marketOrdersUseStandardSettlement',true,'idempotentReplay',false
  );
end;
$function$;

revoke all on function public.admin_grant_temporary_ngn_test_credit(text,numeric,text) from public,anon;
grant execute on function public.admin_grant_temporary_ngn_test_credit(text,numeric,text) to authenticated;

select pg_notify('pgrst','reload schema');
commit;
