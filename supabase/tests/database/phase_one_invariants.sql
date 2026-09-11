-- Run against a migrated database. Every change is rolled back.
begin;

do $$
declare
  ngn_id bigint;
  treasury_id bigint;
  suspense_id bigint;
  balanced_journal_id bigint;
  unbalanced_journal_id bigint;
  posted_public_id uuid;
begin
  select id into ngn_id
  from public.assets
  where code = 'NGN' and status = 'ACTIVE';

  if ngn_id is null then
    raise exception 'Expected active NGN launch asset';
  end if;

  if not exists (
    select 1 from public.assets where code = 'USDC' and status = 'DISABLED'
  ) then
    raise exception 'Expected disabled USDC foundation asset';
  end if;

  if not exists (
    select 1 from public.jurisdictions
    where country_code = 'NG' and status = 'ACTIVE'
  ) then
    raise exception 'Expected active Nigeria launch jurisdiction';
  end if;

  if (select count(*) from admin.roles) <> 10 then
    raise exception 'Expected ten seeded administrative roles';
  end if;

  if not exists (
    select 1
    from admin.roles r
    join admin.role_permissions rp on rp.role_id = r.id
    join admin.permissions p on p.id = rp.permission_id
    where r.code = 'PROVIDER_ADMIN'
      and p.code = 'providers.manage'
  ) then
    raise exception 'Expected scoped Provider Admin permission mapping';
  end if;

  if exists (
    select 1
    from public.capability_rules
    where status = 'ACTIVE' and enabled
  ) then
    raise exception 'No product capability may be enabled in Phase 1';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'user_accounts', 'profiles', 'assets', 'jurisdictions',
        'jurisdiction_assets', 'capability_rules'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'Every exposed VAD table must have RLS enabled';
  end if;

  select id into treasury_id
  from finance.ledger_accounts
  where asset_id = ngn_id
    and account_type = 'TREASURY'
    and owner_type = 'PLATFORM'
    and owner_reference = 'VAD';

  select id into suspense_id
  from finance.ledger_accounts
  where asset_id = ngn_id
    and account_type = 'SUSPENSE'
    and owner_type = 'PLATFORM'
    and owner_reference = 'VAD';

  insert into finance.ledger_journals (
    asset_id, journal_type, idempotency_key, description
  ) values (
    ngn_id, 'INVARIANT_TEST', 'test-balanced-journal',
    'Rolled-back balanced journal invariant test'
  ) returning id into balanced_journal_id;

  insert into finance.ledger_entries (
    journal_id, account_id, sequence_number, direction, amount
  ) values
    (balanced_journal_id, treasury_id, 1, 'DEBIT', 1.00000000),
    (balanced_journal_id, suspense_id, 2, 'CREDIT', 1.00000000);

  posted_public_id := finance.post_ledger_journal(balanced_journal_id, 2);

  if posted_public_id is null or not exists (
    select 1 from finance.ledger_journals
    where id = balanced_journal_id and status = 'POSTED'
  ) then
    raise exception 'Balanced journal did not post';
  end if;

  begin
    update finance.ledger_entries
    set amount = 2
    where journal_id = balanced_journal_id and sequence_number = 1;
    raise exception 'Posted entry mutation unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;

  insert into finance.ledger_journals (
    asset_id, journal_type, idempotency_key, description
  ) values (
    ngn_id, 'INVARIANT_TEST', 'test-unbalanced-journal',
    'Rolled-back unbalanced journal invariant test'
  ) returning id into unbalanced_journal_id;

  insert into finance.ledger_entries (
    journal_id, account_id, sequence_number, direction, amount
  ) values
    (unbalanced_journal_id, treasury_id, 1, 'DEBIT', 1.00000000),
    (unbalanced_journal_id, suspense_id, 2, 'CREDIT', 0.50000000);

  begin
    perform finance.post_ledger_journal(unbalanced_journal_id, 2);
    raise exception 'Unbalanced journal unexpectedly posted';
  exception
    when check_violation then null;
  end;

  if not exists (
    select 1 from finance.ledger_journals
    where id = unbalanced_journal_id and status = 'DRAFT'
  ) then
    raise exception 'Unbalanced journal did not remain draft';
  end if;
end;
$$;

rollback;
