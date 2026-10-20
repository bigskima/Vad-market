begin;

-- A hard server-side guard: the legacy real trading APIs must never accept
-- TNGN. TNGN orders belong exclusively to public.demo_accounts/demo_orders.
create or replace function private.prevent_real_tngn_trading()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset_code text;
begin
  select a.code into v_asset_code
  from market.instruments i
  join public.assets a on a.id=i.asset_id
  where i.id=new.instrument_id;

  if v_asset_code='TNGN' then
    raise exception 'TNGN is sandbox-only. Use the isolated demo account; real-ledger trading is disabled.'
      using errcode='42501';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_real_tngn_orders on trading.orders;
create trigger prevent_real_tngn_orders
before insert on trading.orders
for each row execute function private.prevent_real_tngn_trading();

drop trigger if exists prevent_real_tngn_pool_stakes on trading.pool_stakes;
create trigger prevent_real_tngn_pool_stakes
before insert on trading.pool_stakes
for each row execute function private.prevent_real_tngn_trading();

revoke all on function private.prevent_real_tngn_trading() from public, anon, authenticated;

commit;
