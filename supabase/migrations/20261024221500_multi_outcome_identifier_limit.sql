begin;

-- Follow-up hardening for category-independent multi-outcome identifiers.
-- The original migration is intentionally immutable after merge. Codes must
-- stay within the 32-character on-chain gateway limit, including any suffix.
create or replace function public.admin_create_multi_outcome_market_v1(
  p_title text,
  p_description text,
  p_category text,
  p_outcomes jsonb,
  p_resolution_instructions text,
  p_source_name text,
  p_source_url text,
  p_opens_at timestamptz,
  p_closes_at timestamptz,
  p_resolves_after timestamptz,
  p_country_code text,
  p_asset_code text,
  p_publish_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_category text := btrim(coalesce(p_category, ''));
  v_instructions text := btrim(coalesce(p_resolution_instructions, ''));
  v_source_name text := btrim(coalesce(p_source_name, ''));
  v_source_url text := btrim(coalesce(p_source_url, ''));
  v_result jsonb;
  v_event_public_id uuid;
  v_instrument_public_id uuid;
  v_event_id bigint;
  v_instrument_id bigint;
  v_instrument_status text;
  v_asset_code text := upper(btrim(coalesce(p_asset_code, '')));
  v_item record;
  v_label text;
  v_code text;
  v_suffix text;
  v_option_count integer;
  v_option_payload jsonb := '[]'::jsonb;
  v_validation jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode = '42501';
  end if;

  if v_title = '' or char_length(v_title) > 180 then
    raise exception 'Enter a market question between 1 and 180 characters.' using errcode = '22023';
  end if;
  if v_category = '' then
    raise exception 'Choose a category for this market.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_outcomes) is distinct from 'array' then
    raise exception 'Add at least two outcome choices.' using errcode = '22023';
  end if;
  select count(*) into v_option_count from jsonb_array_elements(p_outcomes);
  if v_option_count < 2 or v_option_count > 20 then
    raise exception 'A multiple-outcome market must have between 2 and 20 choices.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements_text(p_outcomes) as choice(value)
    where btrim(coalesce(choice.value, '')) = ''
       or char_length(btrim(choice.value)) > 80
  ) then
    raise exception 'Each choice must have a name between 1 and 80 characters.' using errcode = '22023';
  end if;
  if (
    select count(distinct lower(btrim(choice.value)))
    from jsonb_array_elements_text(p_outcomes) as choice(value)
  ) <> v_option_count then
    raise exception 'Each outcome choice must be unique.' using errcode = '22023';
  end if;
  if char_length(v_instructions) < 10 or char_length(v_instructions) > 3000 then
    raise exception 'Add resolution instructions between 10 and 3000 characters.' using errcode = '22023';
  end if;
  if v_source_name = '' or char_length(v_source_name) > 180 then
    raise exception 'Name the authoritative result source.' using errcode = '22023';
  end if;
  if v_source_url <> '' and v_source_url !~* '^https://' then
    raise exception 'The source link must start with https://.' using errcode = '22023';
  end if;
  if p_opens_at is null or p_closes_at is null or p_resolves_after is null or p_closes_at <= p_opens_at then
    raise exception 'Choose valid opening, closing and result-checking times.' using errcode = '22023';
  end if;
  if p_publish_now and (p_opens_at > statement_timestamp() or p_closes_at <= statement_timestamp()) then
    raise exception 'Publish now is only available after opening time and before closing time. Save this market as a draft instead.' using errcode = '22023';
  end if;
  if v_asset_code not in ('NGN', 'USDC') then
    raise exception 'Choose an enabled NGN or USDC market currency.' using errcode = '22023';
  end if;

  -- Reuse VAD's existing market admission, event identity, jurisdiction, and
  -- publication path. This call is always a draft; publication happens only
  -- after outcomes and the resolution scope have been configured below.
  v_result := public.admin_create_custom_market_v2(
    v_title,
    v_description,
    v_category,
    p_opens_at,
    p_closes_at,
    p_resolves_after,
    upper(btrim(p_country_code)),
    v_asset_code,
    'POOL',
    false
  );

  if coalesce((v_result->>'merged_existing')::boolean, false) then
    raise exception 'A market with this question already exists. Open that market instead of replacing its outcome choices.' using errcode = '22023';
  end if;

  v_event_public_id := nullif(v_result->>'event_id', '')::uuid;
  v_instrument_public_id := nullif(v_result->>'instrument_id', '')::uuid;
  if v_event_public_id is null or v_instrument_public_id is null then
    raise exception 'VAD could not create a market record for these details.' using errcode = 'P0001';
  end if;

  select event.id, instrument.id, instrument.status
    into v_event_id, v_instrument_id, v_instrument_status
  from market.canonical_events event
  join market.instruments instrument on instrument.canonical_event_id = event.id
  join public.assets asset on asset.id = instrument.asset_id
  where event.public_id = v_event_public_id
    and instrument.public_id = v_instrument_public_id
    and asset.code = v_asset_code
  for update of event, instrument;

  if v_instrument_id is null or v_instrument_status <> 'DRAFT' then
    raise exception 'Only a new unpublished draft can be configured as a multiple-outcome market.' using errcode = 'P0001';
  end if;

  if exists (select 1 from trading.pool_stakes where instrument_id = v_instrument_id)
     or exists (select 1 from trading.orders where instrument_id = v_instrument_id)
     or exists (select 1 from trading.positions where instrument_id = v_instrument_id) then
    raise exception 'This market already has trading activity and its outcomes cannot be replaced.' using errcode = 'P0001';
  end if;

  delete from market.outcomes where instrument_id = v_instrument_id;

  for v_item in
    select choice.value as label, choice.ordinality as ordinal
    from jsonb_array_elements_text(p_outcomes) with ordinality as choice(value, ordinality)
    order by choice.ordinality
  loop
    v_label := btrim(v_item.label);
    v_code := trim(both '_' from regexp_replace(upper(v_label), '[^A-Z0-9]+', '_', 'g'));
    if v_code = '' or v_code !~ '^[A-Z]' then
      v_code := 'OPTION_' || v_item.ordinal::text;
    end if;
    -- Keep identifiers compatible with the on-chain gateway's 32-character limit.
    v_code := left(v_code, 32);
    if exists (select 1 from market.outcomes where instrument_id = v_instrument_id and code = v_code) then
      v_suffix := '_' || v_item.ordinal::text;
      v_code := left(v_code, 32 - char_length(v_suffix)) || v_suffix;
    end if;
    if exists (select 1 from market.outcomes where instrument_id = v_instrument_id and code = v_code) then
      raise exception 'Two choices produce the same internal identifier. Make the choice names more distinct.' using errcode = '22023';
    end if;

    insert into market.outcomes(instrument_id, code, label, display_order)
    values (v_instrument_id, v_code, v_label, v_item.ordinal - 1);

    v_option_payload := v_option_payload || jsonb_build_array(
      jsonb_build_object('code', v_code, 'label', v_label, 'displayOrder', v_item.ordinal - 1)
    );
  end loop;

  update market.instruments
  set market_type = 'MULTI_OUTCOME',
      liquidity_model = 'POOL',
      updated_at = statement_timestamp()
  where id = v_instrument_id;

  update market.canonical_events
  set resolution_scope = coalesce(resolution_scope, '{}'::jsonb) || jsonb_build_object(
        'resolver_type', 'VAD_REVIEW_V1',
        'market_format', 'MULTI_OUTCOME',
        'outcome_options', v_option_payload,
        'resolution_instructions', v_instructions,
        'source_name', v_source_name,
        'source_url', nullif(v_source_url, ''),
        'verification', 'Manual VAD review against the configured resolution instructions and source. The final result must match one configured outcome.',
        'configured_by', 'ADMIN_MULTI_OUTCOME_V1'
      ),
      updated_at = statement_timestamp()
  where id = v_event_id;

  select public.admin_validate_oracle_resolution_scope(
    resolution_scope, p_closes_at, p_resolves_after
  )
  into v_validation
  from market.canonical_events
  where id = v_event_id;

  if coalesce((v_validation->>'valid')::boolean, false) is not true then
    raise exception '%', coalesce(v_validation->>'reason', 'The multiple-outcome resolution rules are invalid.')
      using errcode = '22023';
  end if;

  perform command.refresh_market_catalog(v_instrument_id);

  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values (
    'MULTI_OUTCOME_MARKET_CREATED',
    'MARKET_INSTRUMENT',
    v_instrument_public_id::text,
    jsonb_build_object(
      'event_id', v_event_public_id,
      'instrument_id', v_instrument_public_id,
      'asset_code', v_asset_code,
      'category', v_category,
      'outcomes', v_option_payload,
      'configured_by', auth.uid()
    ),
    'multi-outcome-market-created:' || v_instrument_public_id::text
  ) on conflict (idempotency_key) do nothing;

  insert into audit.records(actor_user_id, actor_type, action, resource_type, resource_id, reason, metadata)
  values (
    auth.uid(), 'ADMIN', 'MULTI_OUTCOME_MARKET_CREATED', 'MARKET_INSTRUMENT',
    v_instrument_public_id::text,
    'Created a category-independent multiple-outcome market',
    jsonb_build_object('event_id', v_event_public_id, 'category', v_category, 'asset_code', v_asset_code, 'outcomes', v_option_payload)
  );

  if p_publish_now then
    perform public.admin_publish_market(v_instrument_public_id, 100, 'Published during multiple-outcome market creation');
    v_result := v_result || jsonb_build_object('publication_status', 'PUBLISHED');
  else
    v_result := v_result || jsonb_build_object('publication_status', 'DRAFT');
  end if;

  return v_result || jsonb_build_object(
    'market_format', 'MULTI_OUTCOME',
    'outcomes', v_option_payload,
    'resolution_mode', 'VAD_REVIEW_V1'
  );
end;
$function$;

grant execute on function public.admin_create_multi_outcome_market_v1(
  text, text, text, jsonb, text, text, text,
  timestamptz, timestamptz, timestamptz, text, text, boolean
) to authenticated;


commit;
