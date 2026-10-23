begin;

-- Decommission test NGN completely. Preserve all historical synthetic demo
-- accounts, orders and ledger entries for audit, but remove TNGN from selection,
-- disable its global kill switch, prevent new catalog mirrors, and block trades.
insert into public.platform_feature_flags(flag_key,enabled,description,updated_at,updated_by)
values('TNGN_DEMO_MODE',false,'TNGN sandbox decommissioned; use the real NGN wallet.',statement_timestamp(),null)
on conflict(flag_key) do update
set enabled=false,
    description='TNGN sandbox decommissioned; use the real NGN wallet.',
    updated_at=statement_timestamp();

with normalized as (
  select p.user_id,
         p.enabled_asset_codes,
         p.preferred_asset_code,
         case when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG' else upper(trim(coalesce(ua.country_code,''))) end as country_code,
         exists (
           select 1 from public.assets a
           join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.status='ACTIVE'
           join public.jurisdictions j on j.id=ja.jurisdiction_id and j.status='ACTIVE'
           where a.code='NGN' and a.status='ACTIVE'
             and upper(trim(j.country_code)) in ('NG','NGA','NIGERIA')
         ) as ngn_available
  from public.user_currency_preferences p
  left join public.user_accounts ua on ua.user_id=p.user_id
), eligible as (
  select n.user_id,n.preferred_asset_code,n.country_code,n.ngn_available,
         array(
           select requested.code
           from unnest(n.enabled_asset_codes) with ordinality as requested(code,ordinality)
           where requested.code='USDC'
              or (requested.code='NGN' and n.country_code='NG' and n.ngn_available)
           order by requested.ordinality
         ) as remaining_eligible
  from normalized n
), replacements as (
  select user_id,
         case
           when cardinality(remaining_eligible)>0 then remaining_eligible
           when country_code='NG' and ngn_available then array['NGN']::text[]
           else array['USDC']::text[]
         end as enabled_asset_codes,
         preferred_asset_code
  from eligible
)
update public.user_currency_preferences p
set enabled_asset_codes=r.enabled_asset_codes,
    preferred_asset_code=case
      when r.preferred_asset_code is not null and r.preferred_asset_code=any(r.enabled_asset_codes) then r.preferred_asset_code
      else r.enabled_asset_codes[1]
    end,
    updated_at=statement_timestamp()
from replacements r
where p.user_id=r.user_id
  and ('TNGN'=any(p.enabled_asset_codes) or p.preferred_asset_code='TNGN');

update public.user_demo_preferences
set tngn_demo_enabled=false,updated_at=statement_timestamp()
where tngn_demo_enabled is distinct from false;

update public.assets
set status='DISABLED',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'sandbox_only',true,
      'decommissioned',true,
      'decommissioned_at',statement_timestamp(),
      'decommission_note','TNGN retired; use real NGN for fiat wallet activity'
    ),
    updated_at=statement_timestamp()
where code='TNGN' and status<>'DISABLED';

-- The live catalogue currently has no open TNGN rows, but close any that appear
-- before the guard is installed. Historical records and synthetic balances remain
-- unchanged; nothing is converted into real NGN.
update public.market_catalog
set status='CLOSED',updated_at=statement_timestamp()
where asset_code='TNGN' and status not in ('CLOSED','SETTLED');

-- Close existing practice markets and cancel outstanding synthetic orders.
-- This changes only sandbox status fields: it does not mint TNGN, post payouts,
-- alter real ledgers, or convert any test balance to NGN.
update public.demo_markets
set status='CLOSED'
where status='OPEN';

update public.demo_orders
set status='CANCELLED'
where status='OPEN';

-- Retain the initial-grant ledger trigger as an audit control. Because the TNGN
-- asset itself is disabled below and the global flag is off, no new sandbox
-- accounts, balances, orders, markets, or demo-ledger entries can be created.
create or replace function private.guard_tngn_demo_account_creation()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not coalesce((
    select f.enabled from public.platform_feature_flags f
    where f.flag_key='TNGN_DEMO_MODE'
  ),false)
  or exists (
    select 1 from public.assets a
    where a.code='TNGN' and a.status<>'ACTIVE'
  ) then
    if tg_op='INSERT' then
      raise exception 'TNGN demo accounts are retired.' using errcode='42501';
    elsif new.available_balance is distinct from old.available_balance then
      raise exception 'TNGN demo balances are frozen after retirement.' using errcode='42501';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_retired_tngn_demo_account_creation on public.demo_accounts;
create trigger prevent_retired_tngn_demo_account_creation
before insert or update of available_balance on public.demo_accounts
for each row execute function private.guard_tngn_demo_account_creation();

-- No further synthetic settlement events may credit old test accounts. Keep all
-- existing demo account balances, grant records and prior settlements for audit.
drop trigger if exists market_catalog_settle_tngn_orders on public.market_catalog;

-- Prevent any future insertion or reopening of a practice market after retirement.
create or replace function private.guard_tngn_demo_market_retirement()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not coalesce((
    select f.enabled from public.platform_feature_flags f
    where f.flag_key='TNGN_DEMO_MODE'
  ),false)
  or exists (
    select 1 from public.assets a
    where a.code='TNGN' and a.status<>'ACTIVE'
  ) then
    raise exception 'TNGN demo markets are retired.' using errcode='42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_retired_tngn_demo_market_write on public.demo_markets;
create trigger prevent_retired_tngn_demo_market_write
before insert or update of status on public.demo_markets
for each row execute function private.guard_tngn_demo_market_retirement();

-- Prevent new synthetic orders or demo-ledger entries, including privileged
-- publishing/trading code that bypasses application-level currency settings.
create or replace function private.guard_tngn_demo_order_retirement()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not coalesce((
    select f.enabled from public.platform_feature_flags f
    where f.flag_key='TNGN_DEMO_MODE'
  ),false)
  or exists (
    select 1 from public.assets a
    where a.code='TNGN' and a.status<>'ACTIVE'
  ) then
    raise exception 'TNGN demo orders are retired.' using errcode='42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_retired_tngn_demo_order_write on public.demo_orders;
create trigger prevent_retired_tngn_demo_order_write
before insert or update of status on public.demo_orders
for each row execute function private.guard_tngn_demo_order_retirement();

create or replace function private.guard_tngn_demo_ledger_retirement()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if not coalesce((
    select f.enabled from public.platform_feature_flags f
    where f.flag_key='TNGN_DEMO_MODE'
  ),false)
  or exists (
    select 1 from public.assets a
    where a.code='TNGN' and a.status<>'ACTIVE'
  ) then
    raise exception 'TNGN demo-ledger writes are retired.' using errcode='42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_retired_tngn_demo_ledger_write on public.demo_ledger_entries;
create trigger prevent_retired_tngn_demo_ledger_write
before insert on public.demo_ledger_entries
for each row execute function private.guard_tngn_demo_ledger_retirement();

-- Guard the public market catalogue as well, including writes from privileged
-- market-publishing code.
create or replace function private.guard_tngn_market_catalog_retirement()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.asset_code='TNGN' and (
    not coalesce((
      select f.enabled from public.platform_feature_flags f
      where f.flag_key='TNGN_DEMO_MODE'
    ),false)
    or exists (
      select 1 from public.assets a
      where a.code='TNGN' and a.status<>'ACTIVE'
    )
  ) then
    raise exception 'TNGN markets have been retired; publish markets using a supported real asset.' using errcode='42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists prevent_retired_tngn_market_catalog_write on public.market_catalog;
create trigger prevent_retired_tngn_market_catalog_write
before insert or update of asset_code on public.market_catalog
for each row execute function private.guard_tngn_market_catalog_retirement();

revoke all on function public.place_tngn_market_stake(uuid,text,numeric,text) from public,anon,authenticated;
revoke all on function public.tngn_pool_quote(uuid,text,numeric) from public,anon,authenticated;
revoke all on function public.admin_set_tngn_demo_mode(boolean) from public,anon,authenticated;
revoke all on function public.set_my_demo_mode(boolean) from public,anon,authenticated;
revoke all on function public.place_demo_order(text,text,numeric,text) from public,anon,authenticated;
revoke all on function public.admin_create_demo_market(text,text,jsonb) from public,anon,authenticated;
revoke all on function public.admin_resolve_demo_market(text,text) from public,anon,authenticated;

-- Read-only demo history RPCs remain available for audit; no account can
-- create new TNGN activity or create/resolve new synthetic demo markets.

-- Peer asset transfers must move real, available ledger funds only. The request
-- key makes client retries idempotent; the balanced finance journal is the
-- source of truth for sender and recipient balances.
create table if not exists public.asset_transfers (
  public_id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id),
  recipient_user_id uuid not null references auth.users(id),
  asset_id bigint not null references public.assets(id),
  amount numeric(38,8) not null check (amount>0),
  idempotency_key uuid not null,
  status text not null default 'PROCESSING' check (status in ('PROCESSING','POSTED')),
  journal_id bigint references finance.ledger_journals(id),
  created_at timestamptz not null default statement_timestamp(),
  constraint asset_transfers_not_self check (sender_user_id<>recipient_user_id),
  constraint asset_transfers_idempotency unique(sender_user_id,idempotency_key),
  constraint asset_transfers_journal_unique unique(journal_id),
  constraint asset_transfers_posted_has_journal check ((status='POSTED')=(journal_id is not null))
);

alter table public.asset_transfers enable row level security;
drop policy if exists asset_transfers_read_participants on public.asset_transfers;
create policy asset_transfers_read_participants
on public.asset_transfers for select to authenticated
using (auth.uid()=sender_user_id or auth.uid()=recipient_user_id);
revoke all on public.asset_transfers from public,anon,authenticated;
grant select on public.asset_transfers to authenticated;

create or replace function public.transfer_asset_to_email(
  p_recipient_email text,
  p_asset_code text,
  p_amount numeric,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_sender_id uuid:=auth.uid();
  v_recipient_id uuid;
  v_sender_country text;
  v_recipient_country text;
  v_sender_status text;
  v_recipient_status text;
  v_asset_code text:=upper(trim(coalesce(p_asset_code,'')));
  v_asset_id bigint;
  v_minor_units integer;
  v_amount numeric;
  v_sender_eligible text[];
  v_sender_policy record;
  v_source_account_id bigint;
  v_recipient_account_id bigint;
  v_source_status text;
  v_recipient_account_status text;
  v_available numeric(38,18);
  v_transfer public.asset_transfers%rowtype;
  v_transfer_public_id uuid;
  v_journal_id bigint;
  v_journal_public_id uuid;
  v_idempotency text;
  v_email text:=lower(trim(coalesce(p_recipient_email,'')));
begin
  if v_sender_id is null then
    raise exception 'Sign in before sending assets.' using errcode='28000';
  end if;
  if p_idempotency_key is null then
    raise exception 'A transfer request key is required. Please retry.' using errcode='22023';
  end if;
  if v_email='' or length(v_email)>254 or position('@' in v_email)<2 or v_email ~ '[[:space:]]' then
    raise exception 'Enter a valid recipient email address.' using errcode='22023';
  end if;
  if v_asset_code not in ('NGN','USDC') then
    raise exception 'Only real NGN and VAD ledger USDC transfers are supported. TNGN has been decommissioned.' using errcode='22023';
  end if;
  if p_amount is null or p_amount<=0 or p_amount>999999999999999999 then
    raise exception 'Enter an amount greater than zero.' using errcode='22023';
  end if;

  select u.id into v_recipient_id
  from auth.users u
  where lower(u.email)=v_email
  limit 1;
  if v_recipient_id is null then
    raise exception 'No VAD account exists for that email address. No funds were moved.' using errcode='P0002';
  end if;
  if v_recipient_id=v_sender_id then
    raise exception 'Choose another VAD account. You cannot transfer assets to yourself.' using errcode='22023';
  end if;

  select ua.status,case when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG' else upper(trim(coalesce(ua.country_code,''))) end
    into v_sender_status,v_sender_country
  from public.user_accounts ua where ua.user_id=v_sender_id;
  if v_sender_status is distinct from 'ACTIVE' then
    raise exception 'Your VAD account is not active for transfers.' using errcode='42501';
  end if;
  select ua.status,case when upper(trim(coalesce(ua.country_code,''))) in ('NG','NGA','NIGERIA') then 'NG' else upper(trim(coalesce(ua.country_code,''))) end
    into v_recipient_status,v_recipient_country
  from public.user_accounts ua where ua.user_id=v_recipient_id;
  if v_recipient_status is distinct from 'ACTIVE' then
    raise exception 'The recipient account is registered but is not active for transfers.' using errcode='42501';
  end if;

  select a.id,a.minor_units into v_asset_id,v_minor_units
  from public.assets a
  where a.code=v_asset_code and a.status='ACTIVE';
  if v_asset_id is null then
    raise exception 'The selected asset is not currently available for transfers.' using errcode='42501';
  end if;
  if p_amount<>round(p_amount,v_minor_units) then
    raise exception 'The amount has too many decimal places for %.',v_asset_code using errcode='22023';
  end if;
  v_amount:=p_amount;

  select * into v_sender_policy from public.get_my_currency_policy() limit 1;
  v_sender_eligible:=coalesce(v_sender_policy.eligible_asset_codes,array[]::text[]);
  if not (v_asset_code=any(v_sender_eligible)) then
    raise exception 'Your account is not eligible to hold %.',v_asset_code using errcode='42501';
  end if;

  -- USD Coin is available to supported VAD accounts. NGN transfers require
  -- both accounts to be Nigerian and NGN to be enabled for that jurisdiction.
  if v_asset_code='NGN' then
    if not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1),false) then
      raise exception 'NGN transfers require current location verification in Nigeria.' using errcode='42501';
    end if;
    if v_sender_country<>'NG' or v_recipient_country<>'NG' then
      raise exception 'NGN transfers are only available between eligible Nigerian VAD accounts.' using errcode='42501';
    end if;
    if not exists (
      select 1
      from public.assets a
      join public.jurisdiction_assets ja on ja.asset_id=a.id and ja.status='ACTIVE'
      join public.jurisdictions j on j.id=ja.jurisdiction_id and j.status='ACTIVE'
      where a.id=v_asset_id
        and upper(trim(j.country_code)) in ('NG','NGA','NIGERIA')
    ) then
      raise exception 'NGN transfers are disabled by jurisdiction policy.' using errcode='42501';
    end if;
  end if;

  -- Serialize retries for the same sender/request key before checking for
  -- an existing transfer, preventing concurrent network retries from double-debiting.
  perform pg_advisory_xact_lock(hashtextextended(
    'asset-transfer-request:'||v_sender_id::text||':'||p_idempotency_key::text,0
  ));

  -- Existing request-key reuse is accepted only for the same immutable transfer.
  select * into v_transfer
  from public.asset_transfers t
  where t.sender_user_id=v_sender_id and t.idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_transfer.recipient_user_id<>v_recipient_id
       or v_transfer.asset_id<>v_asset_id
       or v_transfer.amount<>v_amount then
      raise exception 'This request key was already used for a different transfer. Start a new transfer.' using errcode='22023';
    end if;
    if v_transfer.status='POSTED' and v_transfer.journal_id is not null then
      select j.public_id into v_journal_public_id from finance.ledger_journals j where j.id=v_transfer.journal_id;
      return jsonb_build_object(
        'transferId',v_transfer.public_id,
        'journalId',v_journal_public_id,
        'assetCode',v_asset_code,
        'amount',v_amount,
        'status','POSTED',
        'idempotentReplay',true
      );
    end if;
    raise exception 'This transfer request is already being processed. Retry shortly using the same request.' using errcode='40001';
  end if;

  -- Serialize transfers involving these two user/asset accounts, then lock both
  -- ledger accounts so two simultaneous sends cannot spend the same available balance.
  perform pg_advisory_xact_lock(hashtextextended(
    'asset-transfer:'||least(v_sender_id::text,v_recipient_id::text)||':'||greatest(v_sender_id::text,v_recipient_id::text)||':'||v_asset_id::text,0
  ));

  select la.id,la.status into v_source_account_id,v_source_status
  from finance.ledger_accounts la
  where la.asset_id=v_asset_id and la.owner_type='USER'
    and la.owner_reference=v_sender_id::text and la.account_type='USER_AVAILABLE'
  for update;
  if v_source_account_id is null then
    raise exception 'Your % wallet is not ready for transfers. Fund it through an approved NGN/USDC funding method first.',v_asset_code using errcode='P0002';
  end if;
  if v_source_status<>'ACTIVE' then
    raise exception 'Your % wallet is frozen or closed and cannot send assets.',v_asset_code using errcode='42501';
  end if;

  insert into finance.ledger_accounts(asset_id,account_type,owner_type,owner_reference,status)
  values(v_asset_id,'USER_AVAILABLE','USER',v_recipient_id::text,'ACTIVE')
  on conflict(asset_id,account_type,owner_type,owner_reference) do nothing;

  select la.id,la.status into v_recipient_account_id,v_recipient_account_status
  from finance.ledger_accounts la
  where la.asset_id=v_asset_id and la.owner_type='USER'
    and la.owner_reference=v_recipient_id::text and la.account_type='USER_AVAILABLE'
  for update;
  if v_recipient_account_id is null then
    raise exception 'The recipient % wallet could not be prepared. No funds were moved.',v_asset_code using errcode='P0002';
  end if;
  if v_recipient_account_status<>'ACTIVE' then
    raise exception 'The recipient % wallet is frozen or closed. No funds were moved.',v_asset_code using errcode='42501';
  end if;

  v_available:=finance.account_balance(v_source_account_id);
  if v_available<v_amount then
    raise exception 'Insufficient available % balance. No funds were moved.',v_asset_code using errcode='22023';
  end if;

  insert into public.asset_transfers(
    sender_user_id,recipient_user_id,asset_id,amount,idempotency_key,status
  ) values(v_sender_id,v_recipient_id,v_asset_id,v_amount,p_idempotency_key,'PROCESSING')
  returning public_id into v_transfer_public_id;

  v_idempotency:='USER_ASSET_TRANSFER:'||v_sender_id::text||':'||p_idempotency_key::text;
  v_journal_id:=finance.transfer(
    v_asset_id,
    v_source_account_id,
    v_recipient_account_id,
    v_amount,
    'USER_ASSET_TRANSFER',
    v_idempotency,
    'USER_ASSET_TRANSFER',
    v_transfer_public_id::text,
    'VAD account-to-account transfer',
    v_sender_id
  );

  select j.public_id into v_journal_public_id
  from finance.ledger_journals j where j.id=v_journal_id;

  update public.asset_transfers
  set status='POSTED',journal_id=v_journal_id
  where public_id=v_transfer_public_id;

  return jsonb_build_object(
    'transferId',v_transfer_public_id,
    'journalId',v_journal_public_id,
    'assetCode',v_asset_code,
    'amount',v_amount,
    'status','POSTED',
    'idempotentReplay',false
  );
end;
$function$;

revoke all on function public.transfer_asset_to_email(text,text,numeric,uuid) from public,anon,authenticated;
grant execute on function public.transfer_asset_to_email(text,text,numeric,uuid) to authenticated;

select pg_notify('pgrst','reload schema');
commit;
