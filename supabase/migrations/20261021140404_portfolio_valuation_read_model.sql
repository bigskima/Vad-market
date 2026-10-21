begin;

create table if not exists public.portfolio_valuation_snapshots (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_code text not null,
  observed_at timestamptz not null default statement_timestamp(),
  cash_balance numeric(38,18) not null default 0,
  positions_value numeric(38,18) not null default 0,
  total_value numeric(38,18),
  valuation_complete boolean not null default false,
  open_position_count integer not null default 0,
  unpriced_position_count integer not null default 0,
  net_external_flow numeric(38,18) not null default 0
);

create index if not exists portfolio_valuation_snapshots_user_asset_time_idx
  on public.portfolio_valuation_snapshots(user_id, asset_code, observed_at desc);

alter table public.portfolio_valuation_snapshots enable row level security;
revoke all on table public.portfolio_valuation_snapshots from public, anon, authenticated;

create or replace function public.my_portfolio_position_marks()
returns table (
  instrument_id uuid,
  event_id uuid,
  market_title text,
  outcome_code text,
  asset_code text,
  quantity numeric,
  total_cost_basis numeric,
  fees_paid numeric,
  average_price numeric,
  market_status text,
  current_price numeric,
  current_value numeric,
  unrealized_pnl numeric,
  return_percentage numeric,
  marked_at timestamptz,
  mark_status text,
  media_path text
)
language sql
stable
security definer
set search_path = ''
as $$
  with position_source as (
    select
      i.id as instrument_id_internal,
      i.public_id as instrument_public_id,
      ce.public_id as event_public_id,
      ce.title as title,
      o.code as outcome,
      a.code as asset,
      p.quantity as qty,
      p.total_cost_basis as cost_basis,
      p.fees_paid as fees,
      case when p.quantity > 0 then p.total_cost_basis / p.quantity else 0 end as avg_price,
      upper(coalesce(mc.status, i.status, 'UNKNOWN')) as status,
      case o.code when 'YES' then mc.yes_price when 'NO' then mc.no_price else null end::numeric as price,
      mc.last_trade_at as last_traded,
      mc.media_path as media,
      exists (
        select 1
        from settlement.runs sr
        join settlement.entitlements se on se.run_id = sr.id
        where sr.instrument_id = i.id
          and sr.status = 'SETTLED'
          and se.user_id = p.user_id
          and se.outcome_id = p.outcome_id
      ) as has_settlement
    from trading.positions p
    join market.instruments i on i.id = p.instrument_id
    join market.canonical_events ce on ce.id = i.canonical_event_id
    join market.outcomes o on o.id = p.outcome_id
    join public.assets a on a.id = i.asset_id
    left join public.market_catalog mc on mc.instrument_public_id = i.public_id
    where p.user_id = auth.uid()
      and p.quantity > 0
      and a.code in (
        select unnest(policy.enabled_asset_codes)
        from public.get_my_currency_policy() policy
      )
  ),
  labelled as (
    select source.*,
      case
        when status = 'OPEN'
          and price between 0 and 1
          and last_traded >= statement_timestamp() - interval '24 hours'
          then 'MARKED'
        when status = 'OPEN' and last_traded is null then 'UNPRICED'
        when status = 'OPEN' then 'STALE'
        when status in ('SETTLED', 'RESOLVED', 'FINAL') and has_settlement then 'SETTLED'
        else 'UNAVAILABLE'
      end as valuation_status
    from position_source source
  )
  select
    instrument_public_id,
    event_public_id,
    title,
    outcome,
    asset,
    qty,
    cost_basis,
    fees,
    avg_price,
    status,
    case when valuation_status = 'MARKED' then price else null end,
    case
      when valuation_status = 'MARKED' then qty * price
      when valuation_status = 'SETTLED' then 0::numeric
      else null
    end,
    case
      when valuation_status = 'MARKED' then (qty * price) - cost_basis - fees
      else null
    end,
    case
      when valuation_status = 'MARKED' and cost_basis + fees > 0
        then ((qty * price) - cost_basis - fees) / (cost_basis + fees)
      else null
    end,
    last_traded,
    valuation_status,
    media
  from labelled
  order by title;
$$;

revoke all on function public.my_portfolio_position_marks() from public, anon;
grant execute on function public.my_portfolio_position_marks() to authenticated;

create or replace function public.my_portfolio_valuation_history(
  p_days integer default 3650,
  p_limit integer default 600
)
returns table (
  snapshot_id bigint,
  observed_at timestamptz,
  asset_code text,
  cash_balance numeric,
  positions_value numeric,
  total_value numeric,
  valuation_complete boolean,
  open_position_count integer,
  unpriced_position_count integer,
  net_external_flow numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_enabled_assets text[];
  v_asset text;
  v_status jsonb;
  v_cash numeric;
  v_position_value numeric;
  v_total_value numeric;
  v_open_positions integer;
  v_unpriced_positions integer;
  v_previous_at timestamptz;
  v_previous_cash numeric;
  v_previous_position_value numeric;
  v_previous_total_value numeric;
  v_previous_complete boolean;
  v_external_flow numeric;
  v_complete boolean;
  v_days integer := greatest(1, least(coalesce(p_days, 3650), 3650));
  v_limit integer := greatest(40, least(coalesce(p_limit, 600), 1000));
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  select coalesce(policy.enabled_asset_codes, array[]::text[])
    into v_enabled_assets
  from public.get_my_currency_policy() policy
  limit 1;
  v_status := public.get_demo_mode_status();

  foreach v_asset in array coalesce(v_enabled_assets, array[]::text[])
  loop
    if v_asset = 'TNGN' then
      if not coalesce((v_status->>'user_enabled')::boolean, false) then
        continue;
      end if;
      select coalesce(account.available_balance, 0)
        into v_cash
      from public.demo_accounts account
      where account.user_id = v_user;
      if not found then v_cash := 0; end if;
    else
      select coalesce(wallet.available, 0)
           + coalesce(wallet.reserved, 0)
           + coalesce(wallet.withdrawal_pending, 0)
        into v_cash
      from public.my_wallet_summary() wallet
      where wallet.asset_code = v_asset;
      if not found then v_cash := 0; end if;
    end if;

    select
      coalesce(sum(mark.current_value) filter (where mark.mark_status in ('MARKED', 'SETTLED')), 0),
      count(*) filter (where mark.mark_status <> 'SETTLED')::integer,
      count(*) filter (where mark.mark_status not in ('MARKED', 'SETTLED'))::integer
    into v_position_value, v_open_positions, v_unpriced_positions
    from public.my_portfolio_position_marks() mark
    where mark.asset_code = v_asset;

    v_open_positions := coalesce(v_open_positions, 0);
    v_unpriced_positions := coalesce(v_unpriced_positions, 0);
    v_position_value := coalesce(v_position_value, 0);

    if v_asset = 'TNGN' then
      select count(*)::integer into v_open_positions
      from public.demo_orders demo
      where demo.user_id = v_user and demo.status = 'OPEN';
      v_unpriced_positions := coalesce(v_open_positions, 0);
    end if;

    v_complete := v_unpriced_positions = 0;
    if v_complete then v_total_value := v_cash + v_position_value;
    else v_total_value := null;
    end if;

    select snapshot.observed_at, snapshot.cash_balance, snapshot.positions_value,
           snapshot.total_value, snapshot.valuation_complete
      into v_previous_at, v_previous_cash, v_previous_position_value,
           v_previous_total_value, v_previous_complete
    from public.portfolio_valuation_snapshots snapshot
    where snapshot.user_id = v_user and snapshot.asset_code = v_asset
    order by snapshot.observed_at desc, snapshot.id desc
    limit 1;

    v_external_flow := 0;
    if v_previous_at is not null and v_asset <> 'TNGN' then
      select coalesce(sum(
        case entry.direction when 'CREDIT' then entry.amount else -entry.amount end
      ), 0)::numeric
      into v_external_flow
      from finance.ledger_entries entry
      join finance.ledger_journals journal on journal.id = entry.journal_id and journal.status = 'POSTED'
      join finance.ledger_accounts account on account.id = entry.account_id
      join public.assets asset on asset.id = account.asset_id
      where account.owner_type = 'USER'
        and account.owner_reference = v_user::text
        and asset.code = v_asset
        and coalesce(journal.posted_at, journal.created_at) > v_previous_at
        and journal.journal_type ~* '(DEPOSIT|WITHDRAWAL|FUNDING|TOP.?UP|ONCHAIN.*RECEIPT|CRYPTO.*RECEIPT|PAYMENT_CREDIT)';
    end if;

    if v_previous_at is null
       or statement_timestamp() - v_previous_at >= interval '15 minutes'
       or v_cash is distinct from v_previous_cash
       or v_position_value is distinct from v_previous_position_value
       or v_total_value is distinct from v_previous_total_value
       or v_complete is distinct from v_previous_complete
       or coalesce(v_external_flow, 0) <> 0 then
      insert into public.portfolio_valuation_snapshots(
        user_id, asset_code, observed_at, cash_balance, positions_value,
        total_value, valuation_complete, open_position_count,
        unpriced_position_count, net_external_flow
      )
      values (
        v_user, v_asset, statement_timestamp(), v_cash, v_position_value,
        v_total_value, v_complete, v_open_positions,
        v_unpriced_positions, coalesce(v_external_flow, 0)
      );
    end if;
  end loop;

  return query
  with scoped as (
    select snapshot.*,
      row_number() over (partition by snapshot.asset_code order by snapshot.observed_at, snapshot.id) as rn,
      count(*) over (partition by snapshot.asset_code) as rows_in_asset
    from public.portfolio_valuation_snapshots snapshot
    where snapshot.user_id = v_user
      and snapshot.observed_at >= statement_timestamp() - make_interval(days => v_days)
  ),
  sampled as (
    select *
    from scoped
    where rn = 1
       or rn = rows_in_asset
       or mod(rn, greatest(1, ceil(rows_in_asset::numeric / v_limit)::integer)) = 0
  )
  select sampled.id, sampled.observed_at, sampled.asset_code,
    sampled.cash_balance, sampled.positions_value, sampled.total_value,
    sampled.valuation_complete, sampled.open_position_count,
    sampled.unpriced_position_count, sampled.net_external_flow
  from sampled
  order by sampled.observed_at, sampled.asset_code;
end;
$$;

revoke all on function public.my_portfolio_valuation_history(integer, integer) from public, anon;
grant execute on function public.my_portfolio_valuation_history(integer, integer) to authenticated;

commit;