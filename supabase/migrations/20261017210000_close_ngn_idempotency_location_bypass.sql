-- Close idempotency replay gaps for NGN operations: a previous key must not
-- bypass the current-location gate after a user leaves Nigeria or verification expires.
create or replace function public.create_payment_intent(
  p_operation text,
  p_asset_code text,
  p_amount numeric,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  quote jsonb;
  acct public.user_accounts;
  asset public.assets;
  provider bigint;
  intent payments.intents;
  available_account bigint;
  pending_account bigint;
begin
  acct := private.require_active_account();
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'Idempotency key is required' using errcode = '22023';
  end if;

  if upper(trim(coalesce(p_asset_code, ''))) = 'NGN'
     and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1), false) then
    raise exception 'NGN service requires current location verification' using errcode = '42501';
  end if;

  select * into intent
  from payments.intents
  where idempotency_key = trim(p_idempotency_key);
  if intent.id is not null then
    if intent.user_id <> auth.uid() then
      raise exception 'Idempotency key conflict' using errcode = '23505';
    end if;
    if intent.asset_id = (select a.id from public.assets a where a.code = 'NGN')
       and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1), false) then
      raise exception 'NGN service requires current location verification' using errcode = '42501';
    end if;
    return intent.public_id;
  end if;

  quote := public.payment_quote(p_operation, p_asset_code, p_amount);
  if not coalesce((quote->>'enabled')::boolean, false) then
    raise exception 'Payment unavailable: %', coalesce(quote->>'reason', 'UNKNOWN') using errcode = 'P0001';
  end if;

  select * into asset
  from public.assets
  where code = upper(p_asset_code) and status = 'ACTIVE'
  limit 1;
  select id into provider
  from integration.providers
  where code = quote->>'providerCode'
    and status in ('ACTIVE', 'DEGRADED')
  order by priority, id
  limit 1;
  if provider is null then
    raise exception 'Payment provider no longer available' using errcode = 'P0001';
  end if;

  insert into payments.intents(user_id, asset_id, operation, amount, fee_amount, provider_id, status, idempotency_key)
  values(auth.uid(), asset.id, upper(p_operation), p_amount, (quote->>'feeAmount')::numeric, provider, 'CREATED', trim(p_idempotency_key))
  returning * into intent;

  if upper(p_operation) = 'WITHDRAWAL' then
    available_account := finance.ensure_user_account(auth.uid(), asset.id, 'USER_AVAILABLE');
    pending_account := finance.ensure_user_account(auth.uid(), asset.id, 'WITHDRAWAL_PENDING');
    perform finance.transfer(
      asset.id, available_account, pending_account, p_amount,
      'WITHDRAWAL_RESERVE', 'withdrawal-reserve:' || intent.public_id::text,
      'PAYMENT_INTENT', intent.public_id::text, 'Reserve funds for withdrawal', auth.uid()
    );
  end if;

  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values(
    'PAYMENT_INTENT_CREATED', 'PAYMENT_INTENT', intent.public_id::text,
    jsonb_build_object('operation', intent.operation, 'asset', asset.code, 'amount', intent.amount, 'provider_code', quote->>'providerCode'),
    'payment-intent-created:' || intent.public_id::text
  ) on conflict(idempotency_key) do nothing;
  return intent.public_id;
end;
$function$;

create or replace function public.place_pool_stake(
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  acct public.user_accounts;
  instrument market.instruments;
  outcome market.outcomes;
  existing trading.pool_stakes;
  v_public_id uuid := gen_random_uuid();
  v_available bigint;
  v_collateral bigint;
  v_fee_account bigint;
  v_balance numeric(38,18);
  v_fee numeric(38,18) := 0;
  v_fee_pv bigint;
  v_stake_journal bigint;
  v_fee_journal bigint;
begin
  acct := private.require_active_account();
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 or char_length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required' using errcode = '22023';
  end if;

  select * into existing
  from trading.pool_stakes
  where user_id = auth.uid() and idempotency_key = p_idempotency_key;
  if existing.id is not null then
    if exists (
      select 1
      from market.instruments i
      join public.assets a on a.id = i.asset_id
      where i.id = existing.instrument_id and a.code = 'NGN'
    ) and not coalesce((select gate.allowed from public.can_access_ngn_services() gate limit 1), false) then
      raise exception 'NGN service requires current location verification' using errcode = '42501';
    end if;
    return jsonb_build_object('stakeId', existing.public_id, 'amount', existing.amount, 'tradingFee', existing.trading_fee_amount, 'status', 'COMMITTED');
  end if;

  select * into instrument
  from market.instruments
  where public_id = p_instrument_public_id
  for share;
  if instrument.id is null then raise exception 'Market not found' using errcode = 'P0002'; end if;
  if instrument.liquidity_model <> 'POOL' then raise exception 'This market does not use pooled staking' using errcode = 'P0001'; end if;
  if instrument.status <> 'OPEN'
     or instrument.opened_at is null
     or instrument.opened_at > statement_timestamp()
     or (instrument.closed_at is not null and instrument.closed_at <= statement_timestamp()) then
    raise exception 'Market is not open' using errcode = 'P0001';
  end if;
  if not private.trade_access_satisfies(auth.uid(), acct.country_code, instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount < instrument.min_order_notional then
    raise exception 'Stake is below the market minimum' using errcode = '22023';
  end if;

  select * into outcome
  from market.outcomes
  where instrument_id = instrument.id and code = upper(trim(p_outcome_code));
  if outcome.id is null then raise exception 'Outcome not found' using errcode = 'P0002'; end if;

  select q.fee_amount, q.policy_version_id into v_fee, v_fee_pv
  from command.quote_trading_fee(p_amount, 'TAKER') q;
  v_fee := coalesce(v_fee, 0);
  v_available := finance.ensure_user_account(auth.uid(), instrument.asset_id, 'USER_AVAILABLE');
  v_collateral := finance.ensure_market_collateral_account(instrument.id, instrument.asset_id);
  perform pg_advisory_xact_lock(hashtextextended('vad-wallet:' || auth.uid()::text || ':' || instrument.asset_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('vad-pool:' || instrument.id::text, 0));
  v_balance := finance.account_balance(v_available);
  if v_balance < p_amount + v_fee then
    raise exception 'Insufficient available balance including trading fee' using errcode = 'P0001';
  end if;

  v_stake_journal := finance.transfer(
    instrument.asset_id, v_available, v_collateral, p_amount,
    'POOL_STAKE', 'pool-stake:' || v_public_id::text, 'POOL_STAKE', v_public_id::text,
    'Commit peer-funded VAD market stake', auth.uid()
  );
  if v_fee > 0 then
    v_fee_account := finance.ensure_platform_account(instrument.asset_id, 'PLATFORM_TRADING_FEE_REVENUE');
    v_fee_journal := finance.transfer(
      instrument.asset_id, v_available, v_fee_account, v_fee,
      'TRADING_FEE', 'pool-stake-fee:' || v_public_id::text, 'POOL_STAKE', v_public_id::text,
      'VAD pooled-stake execution fee', auth.uid()
    );
  end if;

  insert into trading.pool_stakes(
    public_id, user_id, instrument_id, outcome_id, amount, trading_fee_amount,
    fee_policy_version_id, stake_journal_id, fee_journal_id, idempotency_key
  ) values(
    v_public_id, auth.uid(), instrument.id, outcome.id, p_amount, v_fee,
    v_fee_pv, v_stake_journal, v_fee_journal, p_idempotency_key
  ) returning * into existing;

  insert into eventing.domain_events(event_type, aggregate_type, aggregate_id, payload, idempotency_key)
  values(
    'POOL_STAKE_PLACED', 'POOL_STAKE', v_public_id::text,
    jsonb_build_object('stake_id', v_public_id, 'instrument_id', instrument.public_id, 'user_id', auth.uid(), 'outcome', outcome.code, 'amount', p_amount, 'fee', v_fee),
    'pool-stake-placed:' || v_public_id::text
  ) on conflict(idempotency_key) do nothing;

  perform command.refresh_market_catalog(instrument.id);
  return jsonb_build_object('stakeId', v_public_id, 'marketId', instrument.public_id, 'outcomeCode', outcome.code, 'amount', p_amount, 'tradingFee', v_fee, 'status', 'COMMITTED');
end;
$function$;
