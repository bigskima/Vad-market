create or replace function public.admin_finance_summary()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  trading_policy jsonb;
  settlement_policy jsonb;
  payment_policy jsonb;
begin
  if not private.has_permission('finance.read') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  select coalesce(pv.configuration, '{}'::jsonb)
    into trading_policy
  from policy.policies p
  join policy.policy_versions pv on pv.id = p.current_version_id
  where p.domain = 'FEES'
    and p.name = 'trading_fee'
    and p.status = 'ACTIVE'
    and pv.effective_at <= statement_timestamp()
    and (pv.expires_at is null or pv.expires_at > statement_timestamp())
  limit 1;

  select coalesce(pv.configuration, '{}'::jsonb)
    into settlement_policy
  from policy.policies p
  join policy.policy_versions pv on pv.id = p.current_version_id
  where p.domain = 'FEES'
    and p.name = 'settlement_fee'
    and p.status = 'ACTIVE'
    and pv.effective_at <= statement_timestamp()
    and (pv.expires_at is null or pv.expires_at > statement_timestamp())
  limit 1;

  select coalesce(pv.configuration, '{}'::jsonb)
    into payment_policy
  from policy.policies p
  join policy.policy_versions pv on pv.id = p.current_version_id
  where p.domain = 'FEES'
    and p.name = 'payment_fees'
    and p.status = 'ACTIVE'
    and pv.effective_at <= statement_timestamp()
    and (pv.expires_at is null or pv.expires_at > statement_timestamp())
  limit 1;

  with account_balances as (
    select
      a.id as asset_id,
      a.code as asset_code,
      a.name as asset_name,
      a.status as asset_status,
      la.id as account_id,
      la.account_type,
      case when la.id is null then 0::numeric else finance.account_balance(la.id) end as balance
    from public.assets a
    left join finance.ledger_accounts la
      on la.asset_id = a.id
     and la.status <> 'CLOSED'
  ),
  revenue_accounts as (
    select
      ab.asset_id,
      ab.asset_code,
      ab.asset_name,
      ab.asset_status,
      ab.account_id,
      ab.account_type,
      ab.balance,
      case ab.account_type
        when 'PLATFORM_TRADING_FEE_REVENUE' then 'TRADING_FEES'
        when 'PLATFORM_SETTLEMENT_FEE_REVENUE' then 'SETTLEMENT_FEES'
        when 'PLATFORM_WITHDRAWAL_REVENUE' then 'WITHDRAWAL_FEES'
        else null
      end as source_code,
      case ab.account_type
        when 'PLATFORM_TRADING_FEE_REVENUE' then 'Trading fees'
        when 'PLATFORM_SETTLEMENT_FEE_REVENUE' then 'Settlement fees'
        when 'PLATFORM_WITHDRAWAL_REVENUE' then 'Withdrawal fees'
        else null
      end as source_label
    from account_balances ab
    where ab.account_type in (
      'PLATFORM_TRADING_FEE_REVENUE',
      'PLATFORM_SETTLEMENT_FEE_REVENUE',
      'PLATFORM_WITHDRAWAL_REVENUE'
    )
  ),
  revenue_earned as (
    select
      ra.asset_id,
      ra.account_type,
      coalesce(sum(
        case
          when le.direction = 'CREDIT' then le.amount
          when le.direction = 'DEBIT' and lj.reversal_of_journal_id is not null then -le.amount
          else 0
        end
      ), 0)::numeric as earned_lifetime,
      coalesce(sum(
        case
          when coalesce(lj.posted_at, lj.created_at) >= statement_timestamp() - interval '24 hours' then
            case
              when le.direction = 'CREDIT' then le.amount
              when le.direction = 'DEBIT' and lj.reversal_of_journal_id is not null then -le.amount
              else 0
            end
          else 0
        end
      ), 0)::numeric as earned_24h,
      coalesce(sum(
        case
          when coalesce(lj.posted_at, lj.created_at) >= statement_timestamp() - interval '30 days' then
            case
              when le.direction = 'CREDIT' then le.amount
              when le.direction = 'DEBIT' and lj.reversal_of_journal_id is not null then -le.amount
              else 0
            end
          else 0
        end
      ), 0)::numeric as earned_30d
    from revenue_accounts ra
    join finance.ledger_entries le on le.account_id = ra.account_id
    join finance.ledger_journals lj
      on lj.id = le.journal_id
     and lj.status = 'POSTED'
    where
      (ra.account_type = 'PLATFORM_TRADING_FEE_REVENUE' and lj.journal_type = 'TRADING_FEE')
      or (ra.account_type = 'PLATFORM_SETTLEMENT_FEE_REVENUE' and lj.journal_type = 'MARKET_SETTLEMENT')
      or (ra.account_type = 'PLATFORM_WITHDRAWAL_REVENUE' and lj.journal_type in ('WITHDRAWAL_FEE', 'PAYMENT_FEE', 'PAYMENT_SETTLEMENT'))
      or lj.reversal_of_journal_id is not null
    group by ra.asset_id, ra.account_type
  ),
  revenue_source_catalog as (
    select * from (values
      ('PLATFORM_TRADING_FEE_REVENUE'::text, 'TRADING_FEES'::text, 'Trading fees'::text),
      ('PLATFORM_SETTLEMENT_FEE_REVENUE'::text, 'SETTLEMENT_FEES'::text, 'Settlement fees'::text),
      ('PLATFORM_WITHDRAWAL_REVENUE'::text, 'WITHDRAWAL_FEES'::text, 'Withdrawal fees'::text)
    ) as x(account_type, source_code, source_label)
  ),
  platform_catalog as (
    select * from (values
      ('USER_AVAILABLE'::text, 'User available'::text),
      ('USER_RESERVED'::text, 'User reserved'::text),
      ('MARKET_COLLATERAL'::text, 'Market collateral'::text),
      ('WITHDRAWAL_PENDING'::text, 'Withdrawal pending'::text),
      ('PROVIDER_CLEARING'::text, 'Provider clearing'::text),
      ('REFUND_PAYABLE'::text, 'Refund payable'::text),
      ('CREATOR_REWARD_PAYABLE'::text, 'Creator rewards'::text),
      ('TREASURY'::text, 'Treasury'::text),
      ('SUSPENSE'::text, 'Suspense'::text),
      ('CHARGEBACK_RECEIVABLE'::text, 'Chargeback receivable'::text)
    ) as x(account_type, label)
  ),
  asset_rows as (
    select
      a.id as asset_id,
      jsonb_build_object(
        'assetCode', a.code,
        'assetName', a.name,
        'assetStatus', a.status,
        'vadRevenue', jsonb_build_object(
          'earnedLifetime', coalesce((
            select sum(coalesce(re.earned_lifetime, 0))
            from revenue_source_catalog rsc
            left join revenue_earned re
              on re.asset_id = a.id
             and re.account_type = rsc.account_type
          ), 0),
          'earned24h', coalesce((
            select sum(coalesce(re.earned_24h, 0))
            from revenue_source_catalog rsc
            left join revenue_earned re
              on re.asset_id = a.id
             and re.account_type = rsc.account_type
          ), 0),
          'earned30d', coalesce((
            select sum(coalesce(re.earned_30d, 0))
            from revenue_source_catalog rsc
            left join revenue_earned re
              on re.asset_id = a.id
             and re.account_type = rsc.account_type
          ), 0),
          'currentRevenueBalance', coalesce((
            select sum(coalesce(ab.balance, 0))
            from account_balances ab
            where ab.asset_id = a.id
              and ab.account_type in (
                'PLATFORM_TRADING_FEE_REVENUE',
                'PLATFORM_SETTLEMENT_FEE_REVENUE',
                'PLATFORM_WITHDRAWAL_REVENUE'
              )
          ), 0),
          'sources', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'code', rsc.source_code,
                'label', rsc.source_label,
                'earnedLifetime', coalesce(re.earned_lifetime, 0),
                'earned24h', coalesce(re.earned_24h, 0),
                'earned30d', coalesce(re.earned_30d, 0),
                'currentBalance', coalesce(ab.balance, 0)
              ) order by rsc.source_code
            ), '[]'::jsonb)
            from revenue_source_catalog rsc
            left join revenue_earned re
              on re.asset_id = a.id
             and re.account_type = rsc.account_type
            left join account_balances ab
              on ab.asset_id = a.id
             and ab.account_type = rsc.account_type
          )
        ),
        'platformBalance', jsonb_build_object(
          'total', coalesce((
            select sum(greatest(coalesce(ab.balance, 0), 0))
            from account_balances ab
            where ab.asset_id = a.id
              and ab.account_type in (
                'USER_AVAILABLE','USER_RESERVED','MARKET_COLLATERAL','WITHDRAWAL_PENDING',
                'PROVIDER_CLEARING','REFUND_PAYABLE','CREATOR_REWARD_PAYABLE','TREASURY',
                'SUSPENSE','CHARGEBACK_RECEIVABLE'
              )
          ), 0),
          'breakdown', (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'code', pc.account_type,
                'label', pc.label,
                'amount', greatest(coalesce(ab.balance, 0), 0),
                'signedBalance', coalesce(ab.balance, 0)
              ) order by pc.account_type
            ), '[]'::jsonb)
            from platform_catalog pc
            left join account_balances ab
              on ab.asset_id = a.id
             and ab.account_type = pc.account_type
          )
        )
      ) as payload
    from public.assets a
    where a.status = 'ACTIVE'
       or exists (select 1 from finance.ledger_accounts la where la.asset_id = a.id)
  )
  select jsonb_build_object(
    'assets', coalesce(jsonb_agg(ar.payload order by ar.asset_id), '[]'::jsonb),
    'feePolicies', jsonb_build_object(
      'trading', coalesce(trading_policy, '{}'::jsonb),
      'settlement', coalesce(settlement_policy, '{}'::jsonb),
      'payments', coalesce(payment_policy, '{}'::jsonb)
    ),
    'generatedAt', statement_timestamp()
  )
  into result
  from asset_rows ar;

  return result;
end;
$$;

revoke all on function public.admin_finance_summary() from public;
revoke all on function public.admin_finance_summary() from anon;
grant execute on function public.admin_finance_summary() to authenticated;
grant execute on function public.admin_finance_summary() to service_role;
