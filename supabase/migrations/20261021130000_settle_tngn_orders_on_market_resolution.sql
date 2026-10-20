begin;

-- Settle isolated TNGN orders at the authoritative resolution write, not only
-- when a user later opens Portfolio. The existing settlement function locks
-- and settles each order once, and never touches NGN/USDC finance tables.
create or replace function private.on_tngn_market_resolution_settle()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.asset_code = 'TNGN'
     and upper(coalesce(new.resolution_status,'')) in ('RESOLVED','FINAL','SETTLED')
     and upper(coalesce(new.resolution_outcome,'')) in ('YES','NO')
     and (
       old.resolution_status is distinct from new.resolution_status
       or old.resolution_outcome is distinct from new.resolution_outcome
       or old.asset_code is distinct from new.asset_code
     ) then
    perform private.settle_tngn_market_orders(new.instrument_public_id);
  end if;
  return new;
end;
$$;

drop trigger if exists market_catalog_settle_tngn_orders on public.market_catalog;
create trigger market_catalog_settle_tngn_orders
after update of resolution_status, resolution_outcome, asset_code
on public.market_catalog
for each row
execute function private.on_tngn_market_resolution_settle();

revoke all on function private.on_tngn_market_resolution_settle() from public, anon, authenticated;
commit;