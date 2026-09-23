create or replace function private.onchain_bytes32(
  p_scope text,
  p_value text
)
returns text
language sql
immutable
security definer
set search_path=''
as $$
  select '0x'||encode(
    extensions.digest(
      convert_to(coalesce(p_scope,'')||':'||coalesce(p_value,''),'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

revoke all on function private.onchain_bytes32(text,text)
  from public,anon,authenticated;

create or replace function private.asset_amount_to_atomic(
  p_amount numeric,
  p_decimals smallint,
  p_require_exact boolean default true
)
returns numeric
language plpgsql
immutable
security definer
set search_path=''
as $$
declare
  v_scale numeric;
  v_raw numeric;
  v_atomic numeric;
begin
  if p_amount is null or p_amount<0 then
    raise exception 'Asset amount cannot be negative' using errcode='22023';
  end if;
  if p_decimals is null or p_decimals<0 or p_decimals>18 then
    raise exception 'Asset decimals are invalid' using errcode='22023';
  end if;

  v_scale:=power(10::numeric,p_decimals);
  v_raw:=p_amount*v_scale;

  if coalesce(p_require_exact,true) and v_raw<>trunc(v_raw) then
    raise exception 'Amount has more precision than the settlement asset supports'
      using errcode='22023';
  end if;

  v_atomic:=round(v_raw,0);
  if v_atomic<0 then
    raise exception 'Atomic asset amount is invalid' using errcode='22023';
  end if;

  return v_atomic;
end;
$$;

revoke all on function private.asset_amount_to_atomic(numeric,smallint,boolean)
  from public,anon,authenticated;

create table if not exists blockchain.transaction_authorizations (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  intent_id bigint not null unique
    references blockchain.transaction_intents(id) on delete restrict,
  chain_id bigint not null
    references blockchain.chains(id) on delete restrict,
  contract_deployment_id bigint not null
    references blockchain.contract_deployments(id) on delete restrict,
  asset_id bigint not null
    references public.assets(id) on delete restrict,
  asset_representation_id bigint not null
    references blockchain.asset_representations(id) on delete restrict,
  authorization_type text not null
    check (authorization_type in ('PREDICT_LOCK','CLAIM_PAYOUT','REFUND')),
  authorization_id text not null unique
    check (authorization_id ~ '^0x[0-9a-f]{64}$'),
  position_id text not null
    check (position_id ~ '^0x[0-9a-f]{64}$'),
  market_id text not null
    check (market_id ~ '^0x[0-9a-f]{64}$'),
  outcome_id text
    check (outcome_id is null or outcome_id ~ '^0x[0-9a-f]{64}$'),
  wallet_address text not null
    check (char_length(btrim(wallet_address)) between 3 and 200),
  amount numeric(38,18) not null check (amount>=0),
  amount_atomic numeric(38,0) not null check (amount_atomic>=0),
  fee_policy_name text not null
    check (fee_policy_name in ('trading_fee','settlement_fee')),
  fee_policy_version_id bigint
    references policy.policy_versions(id) on delete restrict,
  fee_amount numeric(38,18) not null default 0 check (fee_amount>=0),
  fee_amount_atomic numeric(38,0) not null default 0 check (fee_amount_atomic>=0),
  expires_at timestamptz not null,
  status text not null default 'PREPARED'
    check (status in ('PREPARED','SIGNED','CANCELLED','EXPIRED')),
  signer_address text,
  signature text,
  signed_at timestamptz,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload)='object'),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint blockchain_tx_authorization_signature_state check (
    (
      status='SIGNED'
      and signed_at is not null
      and signature is not null
      and signer_address is not null
    )
    or
    (
      status<>'SIGNED'
      and signed_at is null
      and signature is null
      and signer_address is null
    )
  ),
  constraint blockchain_tx_authorization_fee_policy check (
    fee_amount=0 or fee_policy_version_id is not null
  )
);

create index if not exists blockchain_tx_authorizations_chain_idx
  on blockchain.transaction_authorizations(chain_id,status,created_at desc);
create index if not exists blockchain_tx_authorizations_contract_idx
  on blockchain.transaction_authorizations(contract_deployment_id,status,created_at desc);
create index if not exists blockchain_tx_authorizations_position_idx
  on blockchain.transaction_authorizations(position_id,created_at desc);

alter table blockchain.transaction_authorizations enable row level security;
revoke all on table blockchain.transaction_authorizations from public,anon,authenticated;
grant all on table blockchain.transaction_authorizations to service_role;
grant usage,select on sequence blockchain.transaction_authorizations_id_seq to service_role;

drop trigger if exists blockchain_transaction_authorizations_set_updated_at
  on blockchain.transaction_authorizations;
create trigger blockchain_transaction_authorizations_set_updated_at
before update on blockchain.transaction_authorizations
for each row execute function private.set_updated_at();

create or replace function public.internal_prepare_onchain_prediction(
  p_user_id uuid,
  p_wallet_id uuid,
  p_instrument_public_id uuid,
  p_outcome_code text,
  p_chain_code text,
  p_amount numeric,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_account public.user_accounts;
  v_instrument market.instruments;
  v_asset public.assets;
  v_outcome market.outcomes;
  v_wallet blockchain.wallet_connections;
  v_venue market.instrument_venues;
  v_chain blockchain.chains;
  v_rep blockchain.asset_representations;
  v_deployment blockchain.contract_deployments;
  v_intent blockchain.transaction_intents;
  v_authorization blockchain.transaction_authorizations;
  v_fee numeric(38,18):=0;
  v_fee_pv bigint;
  v_amount_atomic numeric(38,0);
  v_fee_atomic numeric(38,0);
  v_fee_quantized numeric(38,18);
  v_scale numeric;
  v_deadline timestamptz;
  v_auth_id text;
  v_position_id text;
  v_market_id text;
  v_outcome_id text;
  v_expected_signer text;
  v_existing_user uuid;
begin
  if p_user_id is null or p_wallet_id is null or p_instrument_public_id is null then
    raise exception 'On-chain prediction identity is required' using errcode='22023';
  end if;
  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key))<12
     or char_length(btrim(p_idempotency_key))>240 then
    raise exception 'A valid on-chain idempotency key is required' using errcode='22023';
  end if;

  select ti.user_id into v_existing_user
  from blockchain.transaction_intents ti
  where ti.idempotency_key=p_idempotency_key;

  if v_existing_user is not null then
    if v_existing_user<>p_user_id then
      raise exception 'On-chain idempotency key belongs to another account'
        using errcode='23505';
    end if;

    select ti.* into v_intent
    from blockchain.transaction_intents ti
    where ti.idempotency_key=p_idempotency_key;
    select ta.* into v_authorization
    from blockchain.transaction_authorizations ta
    where ta.intent_id=v_intent.id;

    if v_authorization.id is null then
      raise exception 'Existing on-chain intent is missing its authorization'
        using errcode='P0001';
    end if;

    select c.* into v_chain from blockchain.chains c where c.id=v_authorization.chain_id;
    select cd.* into v_deployment from blockchain.contract_deployments cd where cd.id=v_authorization.contract_deployment_id;
    select ar.* into v_rep from blockchain.asset_representations ar where ar.id=v_authorization.asset_representation_id;

    return jsonb_build_object(
      'intentId',v_intent.public_id,
      'intentStatus',v_intent.status,
      'authorizationId',v_authorization.authorization_id,
      'authorizationStatus',v_authorization.status,
      'positionId',v_authorization.position_id,
      'marketId',v_authorization.market_id,
      'outcomeId',v_authorization.outcome_id,
      'walletAddress',v_authorization.wallet_address,
      'collateralAmount',v_authorization.amount,
      'collateralAmountAtomic',v_authorization.amount_atomic::text,
      'tradingFee',v_authorization.fee_amount,
      'tradingFeeAmountAtomic',v_authorization.fee_amount_atomic::text,
      'tradingFeePolicyVersionId',v_authorization.fee_policy_version_id,
      'deadline',extract(epoch from v_authorization.expires_at)::bigint,
      'chainCode',v_chain.code,
      'evmChainId',v_chain.evm_chain_id,
      'contractAddress',v_deployment.contract_address,
      'tokenAddress',v_rep.token_address,
      'tokenDecimals',v_rep.decimals,
      'expectedQuoteSigner',v_deployment.metadata->>'quote_signer_address',
      'protocolKey',v_deployment.protocol_key,
      'protocolVersion',v_deployment.protocol_version,
      'signature',v_authorization.signature
    );
  end if;

  select * into v_account
  from public.user_accounts ua
  where ua.user_id=p_user_id and ua.status='ACTIVE';
  if v_account.user_id is null then
    raise exception 'Active VAD account required' using errcode='42501';
  end if;

  select i.* into v_instrument
  from market.instruments i
  where i.public_id=p_instrument_public_id;
  if v_instrument.id is null then raise exception 'Market not found' using errcode='P0002'; end if;

  select * into v_asset from public.assets a where a.id=v_instrument.asset_id;
  if v_asset.code<>'USDC' or v_asset.status<>'ACTIVE' then
    raise exception 'This settlement protocol is available only for active USDC markets' using errcode='P0001';
  end if;
  if v_instrument.liquidity_model<>'POOL' then
    raise exception 'USDC Settlement V1 currently supports Peer Pool markets' using errcode='P0001';
  end if;
  if v_instrument.status<>'OPEN'
     or v_instrument.opened_at is null
     or v_instrument.opened_at>statement_timestamp()
     or (v_instrument.closed_at is not null and v_instrument.closed_at<=statement_timestamp()) then
    raise exception 'Market is not open' using errcode='P0001';
  end if;
  if not private.trade_access_satisfies(p_user_id,v_account.country_code,v_instrument.asset_id) then
    raise exception 'Trading is not available for this account and market' using errcode='P0001';
  end if;
  if p_amount is null or p_amount<v_instrument.min_order_notional then
    raise exception 'Stake is below the market minimum' using errcode='22023';
  end if;

  select * into v_outcome
  from market.outcomes o
  where o.instrument_id=v_instrument.id
    and o.code=upper(btrim(coalesce(p_outcome_code,'')));
  if v_outcome.id is null then raise exception 'Outcome not found' using errcode='P0002'; end if;

  select * into v_wallet
  from blockchain.wallet_connections wc
  where wc.public_id=p_wallet_id
    and wc.user_id=p_user_id
    and wc.status='VERIFIED';
  if v_wallet.id is null then
    raise exception 'A verified VAD wallet is required' using errcode='P0001';
  end if;

  select iv.* into v_venue
  from market.instrument_venues iv
  join blockchain.chains c on c.id=iv.chain_id
  where iv.instrument_id=v_instrument.id
    and iv.settlement_type='ONCHAIN'
    and iv.status='ACTIVE'
    and c.code=upper(btrim(coalesce(p_chain_code,'')))
    and c.status='ACTIVE'
    and c.chain_family='EVM'
  limit 1;
  if v_venue.id is null then
    raise exception 'This market is not active on the selected EVM network' using errcode='P0001';
  end if;

  select * into v_chain from blockchain.chains c where c.id=v_venue.chain_id;
  if v_chain.evm_chain_id is null then
    raise exception 'Selected EVM network is missing its chain ID' using errcode='P0001';
  end if;
  if v_wallet.chain_family<>v_chain.chain_family then
    raise exception 'Wallet family does not match this market network' using errcode='P0001';
  end if;

  if not exists(
    select 1
    from public.jurisdictions j
    join blockchain.jurisdiction_chains jc
      on jc.jurisdiction_id=j.id
     and jc.chain_id=v_chain.id
     and jc.status='ACTIVE'
    where j.country_code=v_account.country_code and j.status='ACTIVE'
  ) then
    raise exception 'This blockchain network is not enabled for your account location' using errcode='P0001';
  end if;

  select * into v_rep
  from blockchain.asset_representations ar
  where ar.id=v_venue.asset_representation_id
    and ar.chain_id=v_chain.id
    and ar.asset_id=v_instrument.asset_id
    and ar.status='ACTIVE';
  if v_rep.id is null then
    raise exception 'The approved USDC representation is not active on this network' using errcode='P0001';
  end if;
  if v_rep.token_standard<>'ERC20' or v_rep.token_address !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'USDC Settlement V1 requires an approved ERC-20 representation' using errcode='P0001';
  end if;

  select * into v_deployment
  from blockchain.contract_deployments cd
  where cd.id=v_venue.contract_deployment_id
    and cd.chain_id=v_chain.id
    and cd.protocol_key='VAD_SETTLEMENT_V1'
    and cd.protocol_version=1
    and cd.status='ACTIVE';
  if v_deployment.id is null or v_deployment.contract_address !~ '^0x[0-9a-fA-F]{40}$' then
    raise exception 'VAD Settlement V1 is not active on this network' using errcode='P0001';
  end if;

  v_expected_signer:=lower(btrim(coalesce(v_deployment.metadata->>'quote_signer_address','')));
  if v_expected_signer !~ '^0x[0-9a-f]{40}$' then
    raise exception 'VAD quote signer is not configured for this deployment' using errcode='P0001';
  end if;

  v_amount_atomic:=private.asset_amount_to_atomic(p_amount,v_rep.decimals,true);
  if v_amount_atomic<=0 then raise exception 'Stake amount must be greater than zero' using errcode='22023'; end if;

  select q.fee_amount,q.policy_version_id into v_fee,v_fee_pv
  from command.quote_trading_fee(p_amount,'TAKER') q;
  v_fee:=coalesce(v_fee,0);
  v_fee_atomic:=private.asset_amount_to_atomic(v_fee,v_rep.decimals,false);
  v_scale:=power(10::numeric,v_rep.decimals);
  v_fee_quantized:=v_fee_atomic/v_scale;
  v_deadline:=statement_timestamp()+interval '5 minutes';

  insert into blockchain.transaction_intents(
    user_id,wallet_connection_id,venue_id,action,outcome_id,amount,status,
    idempotency_key,expires_at,metadata
  ) values(
    p_user_id,v_wallet.id,v_venue.id,'PREDICT',v_outcome.id,p_amount,'CREATED',
    btrim(p_idempotency_key),v_deadline,
    jsonb_build_object(
      'protocol_key','VAD_SETTLEMENT_V1',
      'protocol_version',1,
      'asset_code','USDC',
      'fee_policy_name','trading_fee',
      'fee_policy_version_id',v_fee_pv
    )
  )
  returning * into v_intent;

  v_auth_id:=private.onchain_bytes32('authorization',v_intent.public_id::text);
  v_position_id:=private.onchain_bytes32('position',v_intent.public_id::text);
  v_market_id:=private.onchain_bytes32('market',v_instrument.public_id::text);
  v_outcome_id:=private.onchain_bytes32('outcome',v_outcome.public_id::text);

  insert into blockchain.transaction_authorizations(
    intent_id,chain_id,contract_deployment_id,asset_id,asset_representation_id,
    authorization_type,authorization_id,position_id,market_id,outcome_id,
    wallet_address,amount,amount_atomic,fee_policy_name,fee_policy_version_id,
    fee_amount,fee_amount_atomic,expires_at,status,payload,metadata
  ) values(
    v_intent.id,v_chain.id,v_deployment.id,v_instrument.asset_id,v_rep.id,
    'PREDICT_LOCK',v_auth_id,v_position_id,v_market_id,v_outcome_id,
    v_wallet.wallet_address,p_amount,v_amount_atomic,'trading_fee',v_fee_pv,
    v_fee_quantized,v_fee_atomic,v_deadline,'PREPARED',
    jsonb_build_object(
      'authorizationId',v_auth_id,
      'positionId',v_position_id,
      'marketId',v_market_id,
      'outcomeId',v_outcome_id,
      'user',v_wallet.wallet_address,
      'collateralAmount',v_amount_atomic::text,
      'tradingFeeAmount',v_fee_atomic::text,
      'tradingFeePolicyVersion',coalesce(v_fee_pv,0)::text,
      'deadline',extract(epoch from v_deadline)::bigint
    ),
    jsonb_build_object(
      'market_public_id',v_instrument.public_id,
      'outcome_public_id',v_outcome.public_id,
      'chain_code',v_chain.code,
      'token_address',v_rep.token_address,
      'token_decimals',v_rep.decimals,
      'expected_quote_signer',v_expected_signer
    )
  )
  returning * into v_authorization;

  update blockchain.transaction_intents set status='AWAITING_SIGNATURE'
  where id=v_intent.id returning * into v_intent;

  return jsonb_build_object(
    'intentId',v_intent.public_id,
    'intentStatus',v_intent.status,
    'authorizationId',v_authorization.authorization_id,
    'authorizationStatus',v_authorization.status,
    'positionId',v_authorization.position_id,
    'marketId',v_authorization.market_id,
    'outcomeId',v_authorization.outcome_id,
    'walletAddress',v_authorization.wallet_address,
    'collateralAmount',v_authorization.amount,
    'collateralAmountAtomic',v_authorization.amount_atomic::text,
    'tradingFee',v_authorization.fee_amount,
    'tradingFeeAmountAtomic',v_authorization.fee_amount_atomic::text,
    'tradingFeePolicyVersionId',v_authorization.fee_policy_version_id,
    'deadline',extract(epoch from v_authorization.expires_at)::bigint,
    'chainCode',v_chain.code,
    'evmChainId',v_chain.evm_chain_id,
    'contractAddress',v_deployment.contract_address,
    'tokenAddress',v_rep.token_address,
    'tokenDecimals',v_rep.decimals,
    'expectedQuoteSigner',v_expected_signer,
    'protocolKey',v_deployment.protocol_key,
    'protocolVersion',v_deployment.protocol_version,
    'signature',null
  );
end;
$$;

revoke all on function public.internal_prepare_onchain_prediction(uuid,uuid,uuid,text,text,numeric,text)
  from public,anon,authenticated;
grant execute on function public.internal_prepare_onchain_prediction(uuid,uuid,uuid,text,text,numeric,text)
  to service_role;

create or replace function public.internal_complete_onchain_authorization(
  p_user_id uuid,
  p_intent_id uuid,
  p_signer_address text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
  v_auth blockchain.transaction_authorizations;
  v_expected_signer text;
begin
  if p_user_id is null or p_intent_id is null then
    raise exception 'On-chain authorization identity is required' using errcode='22023';
  end if;

  select ti.* into v_intent
  from blockchain.transaction_intents ti
  where ti.public_id=p_intent_id and ti.user_id=p_user_id
  for update;
  if v_intent.id is null then raise exception 'On-chain transaction intent not found' using errcode='P0002'; end if;

  select ta.* into v_auth
  from blockchain.transaction_authorizations ta
  where ta.intent_id=v_intent.id
  for update;
  if v_auth.id is null then raise exception 'On-chain authorization not found' using errcode='P0002'; end if;

  if v_auth.status='SIGNED' and v_auth.signature=p_signature then
    return jsonb_build_object(
      'intentId',v_intent.public_id,'status',v_intent.status,
      'signature',v_auth.signature,'signerAddress',v_auth.signer_address
    );
  end if;

  if v_intent.status<>'AWAITING_SIGNATURE' or v_auth.status<>'PREPARED' then
    raise exception 'On-chain authorization is not awaiting a signature' using errcode='P0001';
  end if;

  if v_auth.expires_at<=statement_timestamp() then
    update blockchain.transaction_authorizations set status='EXPIRED' where id=v_auth.id;
    update blockchain.transaction_intents
    set status='FAILED',failure_code='AUTHORIZATION_EXPIRED'
    where id=v_intent.id;
    raise exception 'On-chain authorization expired' using errcode='P0001';
  end if;

  v_expected_signer:=lower(btrim(coalesce(v_auth.metadata->>'expected_quote_signer','')));
  if lower(btrim(coalesce(p_signer_address,'')))<>v_expected_signer
     or v_expected_signer !~ '^0x[0-9a-f]{40}$' then
    raise exception 'Unexpected VAD quote signer' using errcode='23514';
  end if;
  if btrim(coalesce(p_signature,'')) !~ '^0x[0-9a-fA-F]{130}$' then
    raise exception 'Invalid VAD authorization signature' using errcode='22023';
  end if;

  update blockchain.transaction_authorizations
  set status='SIGNED',signer_address=v_expected_signer,
      signature=btrim(p_signature),signed_at=statement_timestamp()
  where id=v_auth.id
  returning * into v_auth;

  update blockchain.transaction_intents
  set status='SIGNED'
  where id=v_intent.id
  returning * into v_intent;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    p_user_id,'SYSTEM','ONCHAIN_AUTHORIZATION_SIGNED','ONCHAIN_TRANSACTION_INTENT',
    v_intent.public_id::text,'VAD signed an on-chain transaction authorization',
    jsonb_build_object(
      'authorization_type',v_auth.authorization_type,
      'authorization_id',v_auth.authorization_id,
      'fee_policy_name',v_auth.fee_policy_name,
      'fee_policy_version_id',v_auth.fee_policy_version_id,
      'fee_amount',v_auth.fee_amount
    )
  );

  return jsonb_build_object(
    'intentId',v_intent.public_id,'status',v_intent.status,
    'signature',v_auth.signature,'signerAddress',v_auth.signer_address
  );
end;
$$;

revoke all on function public.internal_complete_onchain_authorization(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.internal_complete_onchain_authorization(uuid,uuid,text,text)
  to service_role;

create or replace function public.internal_record_onchain_submission(
  p_user_id uuid,
  p_intent_id uuid,
  p_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
  v_auth blockchain.transaction_authorizations;
  v_venue market.instrument_venues;
  v_chain blockchain.chains;
  v_transaction blockchain.transactions;
  v_existing_intent_id bigint;
begin
  if p_user_id is null or p_intent_id is null then
    raise exception 'On-chain submission identity is required' using errcode='22023';
  end if;

  select ti.* into v_intent
  from blockchain.transaction_intents ti
  where ti.public_id=p_intent_id and ti.user_id=p_user_id
  for update;
  if v_intent.id is null then raise exception 'On-chain transaction intent not found' using errcode='P0002'; end if;

  if v_intent.status not in ('SIGNED','SUBMITTED','CONFIRMING') then
    raise exception 'On-chain transaction intent is not ready for submission' using errcode='P0001';
  end if;

  select ta.* into v_auth
  from blockchain.transaction_authorizations ta
  where ta.intent_id=v_intent.id;
  if v_auth.id is null or v_auth.status<>'SIGNED' then
    raise exception 'Signed VAD authorization is required before submission' using errcode='P0001';
  end if;

  select iv.* into v_venue from market.instrument_venues iv where iv.id=v_intent.venue_id;
  select c.* into v_chain from blockchain.chains c where c.id=v_venue.chain_id;
  if v_chain.chain_family<>'EVM' then
    raise exception 'This submission endpoint currently supports EVM only' using errcode='P0001';
  end if;
  if btrim(coalesce(p_transaction_id,'')) !~ '^0x[0-9a-fA-F]{64}$' then
    raise exception 'Invalid EVM transaction hash' using errcode='22023';
  end if;

  select t.intent_id into v_existing_intent_id
  from blockchain.transactions t
  where t.chain_id=v_chain.id
    and lower(t.transaction_id)=lower(btrim(p_transaction_id));
  if v_existing_intent_id is not null and v_existing_intent_id<>v_intent.id then
    raise exception 'Transaction hash already belongs to another VAD intent' using errcode='23505';
  end if;

  insert into blockchain.transactions(
    intent_id,chain_id,transaction_id,status,first_seen_at,metadata
  ) values(
    v_intent.id,v_chain.id,btrim(p_transaction_id),'SUBMITTED',
    statement_timestamp(),
    jsonb_build_object('source','CLIENT_SUBMISSION','authorization_id',v_auth.authorization_id)
  )
  on conflict(chain_id,transaction_id) do update set updated_at=statement_timestamp()
  returning * into v_transaction;

  if v_intent.status='SIGNED' then
    update blockchain.transaction_intents
    set status='SUBMITTED'
    where id=v_intent.id
    returning * into v_intent;
  end if;

  insert into eventing.domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values(
    'ONCHAIN_TRANSACTION_SUBMITTED','ONCHAIN_TRANSACTION_INTENT',
    v_intent.public_id::text,
    jsonb_build_object(
      'intent_id',v_intent.public_id,
      'transaction_id',v_transaction.transaction_id,
      'chain_code',v_chain.code,
      'authorization_id',v_auth.authorization_id
    ),
    'onchain-submitted:'||v_chain.code||':'||lower(v_transaction.transaction_id)
  )
  on conflict(idempotency_key) do nothing;

  return jsonb_build_object(
    'intentId',v_intent.public_id,'intentStatus',v_intent.status,
    'transactionId',v_transaction.transaction_id,
    'transactionStatus',v_transaction.status,'chainCode',v_chain.code
  );
end;
$$;

revoke all on function public.internal_record_onchain_submission(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_record_onchain_submission(uuid,uuid,text)
  to service_role;

create or replace function public.internal_fail_onchain_intent(
  p_user_id uuid,
  p_intent_id uuid,
  p_failure_code text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
begin
  select ti.* into v_intent
  from blockchain.transaction_intents ti
  where ti.public_id=p_intent_id and ti.user_id=p_user_id
  for update;
  if v_intent.id is null then raise exception 'On-chain transaction intent not found' using errcode='P0002'; end if;

  if v_intent.status in ('CONFIRMED','FAILED','CANCELLED','REPLACED','DROPPED') then
    return true;
  end if;

  update blockchain.transaction_authorizations
  set status='CANCELLED',signer_address=null,signature=null,signed_at=null
  where intent_id=v_intent.id and status in ('PREPARED','SIGNED');

  update blockchain.transaction_intents
  set status='FAILED',
      failure_code=left(
        upper(regexp_replace(
          btrim(coalesce(p_failure_code,'ONCHAIN_FAILED')),
          '[^A-Z0-9_]+','_','g'
        )),
        80
      )
  where id=v_intent.id;

  return true;
end;
$$;

revoke all on function public.internal_fail_onchain_intent(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_fail_onchain_intent(uuid,uuid,text)
  to service_role;
