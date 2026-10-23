begin;

-- Keep TNGN demo-account activation and the user's enabled-currency preference
-- in one transaction. Previously the client wrote user_demo_preferences and
-- user_currency_preferences separately, so one could succeed while the other
-- failed and the wallet/markets/portfolio then disagreed about the active mode.
create or replace function public.set_my_currency_preferences(
  p_enabled_asset_codes text[],
  p_preferred_asset_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_country text;
  v_eligible text[];
  v_requested text[];
  v_enabled text[];
  v_preferred text;
  v_global_tngn boolean:=false;
  v_demo_enabled boolean:=false;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select policy.country_code,policy.eligible_asset_codes
    into v_country,v_eligible
  from public.get_my_currency_policy() policy
  limit 1;

  if v_eligible is null or cardinality(v_eligible)=0 then
    raise exception 'No currencies are eligible for this account.' using errcode='42501';
  end if;

  v_requested:=coalesce(p_enabled_asset_codes,v_eligible);
  if cardinality(v_requested)=0 then
    raise exception 'Enable at least one eligible currency.' using errcode='22023';
  end if;

  if exists (
    select 1 from unnest(v_requested) as requested(code)
    where requested.code is null or requested.code <> all(v_eligible)
  ) then
    raise exception 'One or more selected currencies are not eligible for this account.' using errcode='42501';
  end if;

  select array_agg(normalized.code order by normalized.first_position)
    into v_enabled
  from (
    select requested.code,min(requested.ordinality) as first_position
    from unnest(v_requested) with ordinality as requested(code,ordinality)
    group by requested.code
  ) normalized;

  if v_enabled is null or cardinality(v_enabled)=0 then
    raise exception 'Enable at least one eligible currency.' using errcode='22023';
  end if;

  v_demo_enabled:='TNGN'=any(v_enabled);
  if v_demo_enabled then
    select coalesce(flag.enabled,false)
      into v_global_tngn
    from public.platform_feature_flags flag
    where flag.flag_key='TNGN_DEMO_MODE';
    if not coalesce(v_global_tngn,false) then
      raise exception 'TNGN test trading is disabled by platform settings.' using errcode='42501';
    end if;
  end if;

  v_preferred:=case
    when p_preferred_asset_code=any(v_enabled) then p_preferred_asset_code
    else v_enabled[1]
  end;

  insert into public.user_currency_preferences(
    user_id,enabled_asset_codes,preferred_asset_code,updated_at
  )
  values(auth.uid(),v_enabled,v_preferred,statement_timestamp())
  on conflict(user_id) do update
    set enabled_asset_codes=excluded.enabled_asset_codes,
        preferred_asset_code=excluded.preferred_asset_code,
        updated_at=excluded.updated_at;

  insert into public.user_demo_preferences(user_id,tngn_demo_enabled,updated_at)
  values(auth.uid(),v_demo_enabled,statement_timestamp())
  on conflict(user_id) do update
    set tngn_demo_enabled=excluded.tngn_demo_enabled,
        updated_at=excluded.updated_at;

  if v_demo_enabled then
    insert into public.demo_accounts(user_id)
    values(auth.uid())
    on conflict(user_id) do nothing;
  end if;
  -- Disabling TNGN only disables access; existing isolated demo balance,
  -- order history and ledger entries are retained.

  return jsonb_build_object(
    'country_code',v_country,
    'eligible_asset_codes',v_eligible,
    'enabled_asset_codes',v_enabled,
    'preferred_asset_code',v_preferred,
    'tngn_demo_enabled',v_demo_enabled
  );
end;
$function$;

revoke all on function public.set_my_currency_preferences(text[],text) from public,anon;
grant execute on function public.set_my_currency_preferences(text[],text) to authenticated;

-- Each real/catalog market can have a separate TNGN instrument variant that
-- shares the same canonical event and resolution, while demo stakes settle only
-- to demo_accounts/demo_ledger_entries. This is the sandbox equivalent of the
-- market, not a separate manually maintained demo_markets subset.
create or replace function private.ensure_tngn_market_variant(p_instrument_public_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_source_catalog public.market_catalog%rowtype;
  v_source_instrument market.instruments%rowtype;
  v_variant market.instruments%rowtype;
  v_catalog_row public.market_catalog%rowtype;
  v_tngn_asset_id bigint;
  v_variant_exists boolean:=false;
begin
  select * into v_source_catalog
  from public.market_catalog
  where instrument_public_id=p_instrument_public_id;
  if not found then return; end if;

  -- Avoid creating real-money mirrors from TNGN; only binary NGN/USDC source
  -- markets are mirrored into the synthetic TNGN ledger.
  if v_source_catalog.asset_code not in ('NGN','USDC')
     or upper(coalesce(v_source_catalog.market_type,''))<>'BINARY' then
    return;
  end if;

  select i.* into v_source_instrument
  from market.instruments i
  join public.assets a on a.id=i.asset_id
  where i.public_id=v_source_catalog.instrument_public_id
    and a.code=v_source_catalog.asset_code
    and a.status='ACTIVE';
  if not found then return; end if;

  select a.id into v_tngn_asset_id
  from public.assets a
  where a.code='TNGN'
    and a.status='ACTIVE'
    and coalesce((a.metadata->>'sandbox_only')::boolean,false);
  if v_tngn_asset_id is null then return; end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_source_instrument.canonical_event_id::text||':TNGN',0)
  );

  select i.* into v_variant
  from market.instruments i
  where i.canonical_event_id=v_source_instrument.canonical_event_id
    and i.asset_id=v_tngn_asset_id
  for update;
  v_variant_exists:=found;

  -- Do not resurrect an expired/closed/settled source as a new sandbox market.
  if not v_variant_exists
     and upper(coalesce(v_source_catalog.status,'')) not in ('DRAFT','OPEN','SCHEDULED','PUBLISHED') then
    return;
  end if;

  if not v_variant_exists then
    insert into market.instruments(
      public_id,canonical_event_id,asset_id,market_type,liquidity_model,
      settlement_unit,pricing_precision,min_order_notional,status,opened_at,closed_at
    )
    values(
      gen_random_uuid(),v_source_instrument.canonical_event_id,v_tngn_asset_id,
      'BINARY','POOL',v_source_instrument.settlement_unit,
      v_source_instrument.pricing_precision,v_source_instrument.min_order_notional,
      v_source_instrument.status,v_source_instrument.opened_at,v_source_instrument.closed_at
    )
    on conflict(canonical_event_id,asset_id) do nothing
    returning * into v_variant;

    if v_variant.id is null then
      select i.* into v_variant
      from market.instruments i
      where i.canonical_event_id=v_source_instrument.canonical_event_id
        and i.asset_id=v_tngn_asset_id
      for update;
    end if;
  else
    update market.instruments
    set status=v_source_instrument.status,
        liquidity_model='POOL',
        opened_at=v_source_instrument.opened_at,
        closed_at=v_source_instrument.closed_at,
        updated_at=statement_timestamp()
    where id=v_variant.id
      and (status is distinct from v_source_instrument.status
        or liquidity_model is distinct from 'POOL'
        or opened_at is distinct from v_source_instrument.opened_at
        or closed_at is distinct from v_source_instrument.closed_at)
    returning * into v_variant;
    if v_variant.id is null then
      select i.* into v_variant from market.instruments i where i.public_id=v_variant.public_id;
    end if;
  end if;

  insert into market.outcomes(instrument_id,code,label,display_order)
  select v_variant.id,o.code,o.label,o.display_order
  from market.outcomes o
  where o.instrument_id=v_source_instrument.id
  on conflict(instrument_id,code) do nothing;

  -- Keep the market/event, timing, price, status and resolution linked to the
  -- source. TNGN activity/volume stays isolated and is never copied from NGN.
  v_catalog_row:=v_source_catalog;
  v_catalog_row.instrument_public_id:=v_variant.public_id;
  v_catalog_row.asset_code:='TNGN';
  v_catalog_row.liquidity_mode:='POOL';
  v_catalog_row.last_trade_at:=null;
  v_catalog_row.updated_at:=statement_timestamp();
  v_catalog_row.yes_volume:=0;
  v_catalog_row.no_volume:=0;
  v_catalog_row.total_volume:=0;
  v_catalog_row.participant_count:=0;

  insert into public.market_catalog
  select (v_catalog_row).*
  on conflict(instrument_public_id) do update
  set event_public_id=excluded.event_public_id,
      title=excluded.title,
      category=excluded.category,
      market_type=excluded.market_type,
      status=excluded.status,
      closes_at=excluded.closes_at,
      yes_price=excluded.yes_price,
      no_price=excluded.no_price,
      updated_at=statement_timestamp(),
      resolves_after=excluded.resolves_after,
      media_path=excluded.media_path,
      liquidity_mode='POOL',
      reference_price=excluded.reference_price,
      opens_at=excluded.opens_at,
      resolution_status=excluded.resolution_status,
      resolution_outcome=excluded.resolution_outcome,
      resolution_finalized_at=excluded.resolution_finalized_at,
      category_code=excluded.category_code,
      presentation_profile=excluded.presentation_profile,
      group_key=excluded.group_key,
      market_context=excluded.market_context;
end;
$function$;

create or replace function private.on_market_catalog_tngn_variant_sync()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.ensure_tngn_market_variant(new.instrument_public_id);
  return new;
end;
$function$;

revoke all on function private.ensure_tngn_market_variant(uuid) from public,anon,authenticated;
revoke all on function private.on_market_catalog_tngn_variant_sync() from public,anon,authenticated;

drop trigger if exists market_catalog_sync_tngn_variant on public.market_catalog;
create trigger market_catalog_sync_tngn_variant
after insert or update on public.market_catalog
for each row execute function private.on_market_catalog_tngn_variant_sync();

-- Idempotently add variants for any already-live/upcoming binary source markets.
do $backfill$
declare v_market record;
begin
  for v_market in
    select instrument_public_id
    from public.market_catalog
    where asset_code in ('NGN','USDC')
      and upper(coalesce(market_type,''))='BINARY'
      and upper(coalesce(status,'')) in ('DRAFT','OPEN','SCHEDULED','PUBLISHED')
  loop
    perform private.ensure_tngn_market_variant(v_market.instrument_public_id);
  end loop;
end;
$backfill$;

select pg_notify('pgrst','reload schema');
commit;
