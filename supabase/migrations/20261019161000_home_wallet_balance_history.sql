-- Historical wallet balances are reconstructed from posted immutable ledger entries.
-- No synthetic points are generated; each daily value uses the same signed ledger
-- balance convention as finance.account_balance and the wallet summary.
create or replace function public.my_wallet_balance_history(p_days integer default 30)
returns table (
  observed_on date,
  asset_code text,
  balance numeric
)
language sql
stable
security definer
set search_path = ''
as $function$
  with params as (
    select greatest(7, least(coalesce(p_days, 30), 90))::integer as days
  ),
  eligible_assets as (
    select distinct a.id, a.code
    from public.assets a
    join public.jurisdiction_assets ja on ja.asset_id = a.id
    join public.jurisdictions j on j.id = ja.jurisdiction_id
    join public.user_accounts ua on ua.country_code = j.country_code
    where ua.user_id = auth.uid()
      and auth.uid() is not null
      and a.status = 'ACTIVE'
      and ja.status = 'ACTIVE'
      and j.status = 'ACTIVE'
  ),
  account_scope as (
    select la.id as account_id, la.asset_id, a.code as asset_code
    from finance.ledger_accounts la
    join eligible_assets a on a.id = la.asset_id
    where la.owner_type = 'USER'
      and la.owner_reference = auth.uid()::text
      and la.account_type in ('USER_AVAILABLE', 'USER_RESERVED', 'WITHDRAWAL_PENDING')
  ),
  calendar as (
    select generate_series(
      current_date - ((select days from params) - 1),
      current_date,
      interval '1 day'
    )::date as observed_on
  ),
  opening as (
    select s.asset_id,
      sum(case e.direction when 'CREDIT' then e.amount else -e.amount end)::numeric as amount
    from finance.ledger_entries e
    join finance.ledger_journals j on j.id = e.journal_id and j.status = 'POSTED'
    join account_scope s on s.account_id = e.account_id
    where j.created_at < current_date - ((select days from params) - 1)
    group by s.asset_id
  ),
  daily as (
    select s.asset_id, j.created_at::date as observed_on,
      sum(case e.direction when 'CREDIT' then e.amount else -e.amount end)::numeric as net_change
    from finance.ledger_entries e
    join finance.ledger_journals j on j.id = e.journal_id and j.status = 'POSTED'
    join account_scope s on s.account_id = e.account_id
    where j.created_at >= current_date - ((select days from params) - 1)
      and j.created_at < current_date + interval '1 day'
    group by s.asset_id, j.created_at::date
  ),
  grid as (
    select c.observed_on, a.code as asset_code, a.id as asset_id,
      coalesce(o.amount, 0)::numeric
      + sum(coalesce(d.net_change, 0)) over (
          partition by a.id order by c.observed_on
          rows between unbounded preceding and current row
        ) as balance
    from calendar c
    cross join eligible_assets a
    left join opening o on o.asset_id = a.id
    left join daily d on d.asset_id = a.id and d.observed_on = c.observed_on
  )
  select g.observed_on, g.asset_code, g.balance
  from grid g
  order by g.asset_code, g.observed_on;
$function$;

revoke all on function public.my_wallet_balance_history(integer) from public, anon;
grant execute on function public.my_wallet_balance_history(integer) to authenticated;
