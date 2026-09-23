begin;

-- Sandbox RPC discovery remains database-driven. These are public testnet
-- endpoints used only for validation; production routing will continue through
-- provider configuration.
update blockchain.chains
set metadata=metadata||case code
  when 'BASE_SEPOLIA' then '{"rpc_url":"https://sepolia.base.org","confirmation_target":3}'::jsonb
  when 'POLYGON_AMOY' then '{"rpc_url":"https://rpc-amoy.polygon.technology","confirmation_target":3}'::jsonb
  when 'ARC_TESTNET' then '{"rpc_url":"https://rpc.testnet.arc.network","confirmation_target":3}'::jsonb
  else '{}'::jsonb
end,
updated_at=statement_timestamp()
where code in ('BASE_SEPOLIA','POLYGON_AMOY','ARC_TESTNET');

create table if not exists blockchain.positions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  position_id text not null unique check (position_id ~ '^0x[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_connection_id bigint not null references blockchain.wallet_connections(id) on delete restrict,
  venue_id bigint not null references market.instrument_venues(id) on delete restrict,
  instrument_id bigint not null references market.instruments(id) on delete restrict,
  outcome_id bigint not null references market.outcomes(id) on delete restrict,
  chain_id bigint not null references blockchain.chains(id) on delete restrict,
  contract_deployment_id bigint not null references blockchain.contract_deployments(id) on delete restrict,
  lock_intent_id bigint not null unique references blockchain.transaction_intents(id) on delete restrict,
  lock_authorization_id bigint not null unique references blockchain.transaction_authorizations(id) on delete restrict,
  lock_transaction_id bigint not null unique references blockchain.transactions(id) on delete restrict,
  collateral_amount numeric(38,18) not null check (collateral_amount>0),
  collateral_amount_atomic numeric(38,0) not null check (collateral_amount_atomic>0),
  trading_fee_amount numeric(38,18) not null default 0 check (trading_fee_amount>=0),
  trading_fee_amount_atomic numeric(38,0) not null default 0 check (trading_fee_amount_atomic>=0),
  trading_fee_policy_version_id bigint references policy.policy_versions(id) on delete restrict,
  status text not null default 'LOCKED'
    check (status in ('LOCKED','SETTLEMENT_READY','SETTLED','REFUNDED','LOST')),
  locked_at timestamptz not null default statement_timestamp(),
  settled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp()
);

create index if not exists blockchain_positions_user_idx
  on blockchain.positions(user_id,updated_at desc);
create index if not exists blockchain_positions_venue_status_idx
  on blockchain.positions(venue_id,status,id);
create index if not exists blockchain_positions_instrument_status_idx
  on blockchain.positions(instrument_id,status,id);
create index if not exists blockchain_positions_outcome_idx
  on blockchain.positions(outcome_id);
create index if not exists blockchain_positions_chain_idx
  on blockchain.positions(chain_id,status);

alter table blockchain.positions enable row level security;
revoke all on table blockchain.positions from public,anon,authenticated;
grant all on table blockchain.positions to service_role;
grant usage,select on sequence blockchain.positions_id_seq to service_role;

drop trigger if exists blockchain_positions_set_updated_at on blockchain.positions;
create trigger blockchain_positions_set_updated_at
before update on blockchain.positions
for each row execute function private.set_updated_at();

create table if not exists blockchain.settlement_entitlements (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  position_record_id bigint not null unique references blockchain.positions(id) on delete restrict,
  resolution_id bigint not null references oracle.resolutions(id) on delete restrict,
  entitlement_type text not null check (entitlement_type in ('CLAIM','REFUND','LOSS')),
  gross_payout numeric(38,18) not null check (gross_payout>=0),
  gross_payout_atomic numeric(38,0) not null check (gross_payout_atomic>=0),
  settlement_fee_amount numeric(38,18) not null default 0 check (settlement_fee_amount>=0),
  settlement_fee_amount_atomic numeric(38,0) not null default 0 check (settlement_fee_amount_atomic>=0),
  settlement_fee_policy_version_id bigint references policy.policy_versions(id) on delete restrict,
  net_payout numeric(38,18) not null check (net_payout>=0),
  net_payout_atomic numeric(38,0) not null check (net_payout_atomic>=0),
  status text not null default 'PENDING'
    check (status in ('PENDING','AUTHORIZED','SUBMITTED','CONFIRMED','NO_ACTION')),
  settlement_intent_id bigint unique references blockchain.transaction_intents(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint blockchain_settlement_entitlement_amounts check (
    settlement_fee_amount_atomic<=gross_payout_atomic
    and net_payout_atomic=gross_payout_atomic-settlement_fee_amount_atomic
  )
);

create index if not exists blockchain_settlement_entitlements_resolution_idx
  on blockchain.settlement_entitlements(resolution_id,status,id);
create index if not exists blockchain_settlement_entitlements_status_idx
  on blockchain.settlement_entitlements(status,updated_at desc);
create index if not exists blockchain_settlement_entitlements_fee_policy_idx
  on blockchain.settlement_entitlements(settlement_fee_policy_version_id)
  where settlement_fee_policy_version_id is not null;

alter table blockchain.settlement_entitlements enable row level security;
revoke all on table blockchain.settlement_entitlements from public,anon,authenticated;
grant all on table blockchain.settlement_entitlements to service_role;
grant usage,select on sequence blockchain.settlement_entitlements_id_seq to service_role;

drop trigger if exists blockchain_settlement_entitlements_set_updated_at
  on blockchain.settlement_entitlements;
create trigger blockchain_settlement_entitlements_set_updated_at
before update on blockchain.settlement_entitlements
for each row execute function private.set_updated_at();

create or replace function public.internal_onchain_intent_probe(
  p_user_id uuid,
  p_intent_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
  v_auth blockchain.transaction_authorizations;
  v_tx blockchain.transactions;
  v_venue market.instrument_venues;
  v_chain blockchain.chains;
  v_deployment blockchain.contract_deployments;
  v_rpc_url text;
  v_confirmation_target integer;
begin
  if p_user_id is null or p_intent_id is null then
    raise exception 'On-chain intent identity is required' using errcode='22023';
  end if;

  select * into v_intent
  from blockchain.transaction_intents
  where public_id=p_intent_id and user_id=p_user_id;
  if v_intent.id is null then
    raise exception 'On-chain transaction intent not found' using errcode='P0002';
  end if;

  select * into v_auth
  from blockchain.transaction_authorizations
  where intent_id=v_intent.id;
  if v_auth.id is null then
    raise exception 'On-chain authorization not found' using errcode='P0002';
  end if;

  select * into v_tx
  from blockchain.transactions
  where intent_id=v_intent.id
  order by created_at desc,id desc
  limit 1;
  if v_tx.id is null then
    raise exception 'On-chain transaction has not been submitted' using errcode='P0001';
  end if;

  select * into v_venue from market.instrument_venues where id=v_intent.venue_id;
  select * into v_chain from blockchain.chains where id=v_tx.chain_id;
  select * into v_deployment
  from blockchain.contract_deployments
  where id=v_auth.contract_deployment_id;

  v_rpc_url:=btrim(coalesce(v_chain.metadata->>'rpc_url',''));
  v_confirmation_target:=greatest(
    1,
    coalesce(nullif(v_chain.metadata->>'confirmation_target','')::integer,3)
  );

  if v_chain.chain_family<>'EVM' or v_rpc_url !~ '^https://' then
    raise exception 'EVM receipt verification is not configured for this network'
      using errcode='P0001';
  end if;

  return jsonb_build_object(
    'intentId',v_intent.public_id,
    'intentStatus',v_intent.status,
    'action',v_intent.action,
    'authorizationType',v_auth.authorization_type,
    'authorizationId',v_auth.authorization_id,
    'positionId',v_auth.position_id,
    'marketId',v_auth.market_id,
    'outcomeId',v_auth.outcome_id,
    'walletAddress',v_auth.wallet_address,
    'amountAtomic',v_auth.amount_atomic::text,
    'feeAmountAtomic',v_auth.fee_amount_atomic::text,
    'feePolicyVersionId',coalesce(v_auth.fee_policy_version_id,0),
    'authorizationPayload',v_auth.payload,
    'chainCode',v_chain.code,
    'chainId',v_chain.evm_chain_id,
    'rpcUrl',v_rpc_url,
    'confirmationTarget',v_confirmation_target,
    'contractAddress',v_deployment.contract_address,
    'transactionId',v_tx.transaction_id,
    'transactionStatus',v_tx.status,
    'currentConfirmations',v_tx.confirmation_count,
    'finalized',v_tx.finalized
  );
end;
$$;

revoke all on function public.internal_onchain_intent_probe(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.internal_onchain_intent_probe(uuid,uuid)
  to service_role;

create or replace function public.internal_record_onchain_receipt(
  p_user_id uuid,
  p_intent_id uuid,
  p_success boolean,
  p_block_number bigint,
  p_block_hash text,
  p_confirmation_count integer,
  p_finalized boolean,
  p_event_index integer default 0,
  p_event_payload jsonb default '{}'::jsonb,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
  v_auth blockchain.transaction_authorizations;
  v_tx blockchain.transactions;
  v_venue market.instrument_venues;
  v_event_type text;
  v_tx_status text;
  v_position blockchain.positions;
  v_entitlement blockchain.settlement_entitlements;
  v_net_atomic numeric(38,0);
begin
  if p_user_id is null or p_intent_id is null then
    raise exception 'On-chain receipt identity is required' using errcode='22023';
  end if;
  if p_confirmation_count is null or p_confirmation_count<0 then
    raise exception 'Confirmation count is invalid' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(p_event_payload,'{}'::jsonb))<>'object' then
    raise exception 'On-chain event payload must be an object' using errcode='22023';
  end if;

  select * into v_intent
  from blockchain.transaction_intents
  where public_id=p_intent_id and user_id=p_user_id
  for update;
  if v_intent.id is null then
    raise exception 'On-chain transaction intent not found' using errcode='P0002';
  end if;

  select * into v_auth
  from blockchain.transaction_authorizations
  where intent_id=v_intent.id;
  select * into v_tx
  from blockchain.transactions
  where intent_id=v_intent.id
  order by created_at desc,id desc
  limit 1
  for update;
  if v_auth.id is null or v_tx.id is null then
    raise exception 'On-chain transaction state is incomplete' using errcode='P0001';
  end if;

  if not coalesce(p_success,false) then
    if v_intent.status not in ('CONFIRMED','FAILED','CANCELLED','DROPPED') then
      update blockchain.transactions
      set status='FAILED',
          block_number=p_block_number,
          block_hash=nullif(btrim(coalesce(p_block_hash,'')),''),
          confirmation_count=p_confirmation_count,
          finalized=false,
          failure_code=coalesce(nullif(btrim(coalesce(p_failure_code,'')),''),'EVM_REVERT'),
          updated_at=statement_timestamp()
      where id=v_tx.id;

      update blockchain.transaction_intents
      set status='FAILED',
          failure_code=coalesce(nullif(btrim(coalesce(p_failure_code,'')),''),'EVM_REVERT')
      where id=v_intent.id;
    end if;

    return jsonb_build_object(
      'intentId',v_intent.public_id,'status','FAILED','finalized',false
    );
  end if;

  if p_block_number is null or p_block_number<0 then
    raise exception 'Confirmed receipt requires a block number' using errcode='22023';
  end if;
  if btrim(coalesce(p_block_hash,''))='' then
    raise exception 'Confirmed receipt requires a block hash' using errcode='22023';
  end if;

  if v_auth.authorization_type='PREDICT_LOCK' then
    v_event_type:='POSITION_LOCKED';
    if coalesce(p_event_payload->>'eventType','')<>'PositionLocked'
       or lower(coalesce(p_event_payload->>'positionId',''))<>v_auth.position_id
       or lower(coalesce(p_event_payload->>'marketId',''))<>v_auth.market_id
       or lower(coalesce(p_event_payload->>'outcomeId',''))<>lower(coalesce(v_auth.outcome_id,''))
       or lower(coalesce(p_event_payload->>'user',''))<>lower(v_auth.wallet_address)
       or coalesce(p_event_payload->>'collateralAmountAtomic','')<>v_auth.amount_atomic::text
       or coalesce(p_event_payload->>'tradingFeeAmountAtomic','')<>v_auth.fee_amount_atomic::text
       or coalesce(p_event_payload->>'tradingFeePolicyVersionId','')<>coalesce(v_auth.fee_policy_version_id,0)::text then
      raise exception 'PositionLocked event does not match the VAD authorization'
        using errcode='23514';
    end if;
  else
    v_event_type:='POSITION_SETTLED';
    v_net_atomic:=v_auth.amount_atomic-v_auth.fee_amount_atomic;
    if coalesce(p_event_payload->>'eventType','')<>'PositionSettled'
       or lower(coalesce(p_event_payload->>'positionId',''))<>v_auth.position_id
       or lower(coalesce(p_event_payload->>'marketId',''))<>v_auth.market_id
       or lower(coalesce(p_event_payload->>'user',''))<>lower(v_auth.wallet_address)
       or coalesce(p_event_payload->>'grossPayoutAtomic','')<>v_auth.amount_atomic::text
       or coalesce(p_event_payload->>'settlementFeeAmountAtomic','')<>v_auth.fee_amount_atomic::text
       or coalesce(p_event_payload->>'netPayoutAtomic','')<>v_net_atomic::text
       or coalesce(p_event_payload->>'settlementFeePolicyVersionId','')<>coalesce(v_auth.fee_policy_version_id,0)::text
       or lower(coalesce(p_event_payload->>'resolutionHash',''))<>lower(coalesce(v_auth.payload->>'resolutionHash','')) then
      raise exception 'PositionSettled event does not match the VAD authorization'
        using errcode='23514';
    end if;
  end if;

  v_tx_status:=case when coalesce(p_finalized,false) then 'CONFIRMED' else 'CONFIRMING' end;

  update blockchain.transactions
  set status=v_tx_status,
      block_number=p_block_number,
      block_hash=btrim(p_block_hash),
      confirmation_count=p_confirmation_count,
      finalized=coalesce(p_finalized,false),
      finalized_at=case when coalesce(p_finalized,false) then coalesce(finalized_at,statement_timestamp()) else finalized_at end,
      failure_code=null,
      updated_at=statement_timestamp()
  where id=v_tx.id;

  if v_intent.status<>v_tx_status then
    update blockchain.transaction_intents
    set status=v_tx_status,failure_code=null
    where id=v_intent.id;
  end if;

  select * into v_venue from market.instrument_venues where id=v_intent.venue_id;

  insert into blockchain.indexed_contract_events(
    chain_id,contract_deployment_id,venue_id,transaction_id,
    block_number,block_hash,event_index,event_type,wallet_address,amount,
    payload,finality_status,finalized_at
  ) values(
    v_tx.chain_id,v_auth.contract_deployment_id,v_intent.venue_id,v_tx.transaction_id,
    p_block_number,btrim(p_block_hash),greatest(coalesce(p_event_index,0),0),
    v_event_type,v_auth.wallet_address,v_auth.amount,
    p_event_payload,
    case when coalesce(p_finalized,false) then 'FINALIZED' else 'CONFIRMED' end,
    case when coalesce(p_finalized,false) then statement_timestamp() else null end
  )
  on conflict(chain_id,transaction_id,event_index) do update set
    block_number=excluded.block_number,
    block_hash=excluded.block_hash,
    event_type=excluded.event_type,
    wallet_address=excluded.wallet_address,
    amount=excluded.amount,
    payload=excluded.payload,
    finality_status=excluded.finality_status,
    finalized_at=excluded.finalized_at;

  if coalesce(p_finalized,false) and v_auth.authorization_type='PREDICT_LOCK' then
    insert into blockchain.positions(
      position_id,user_id,wallet_connection_id,venue_id,instrument_id,outcome_id,
      chain_id,contract_deployment_id,lock_intent_id,lock_authorization_id,
      lock_transaction_id,collateral_amount,collateral_amount_atomic,
      trading_fee_amount,trading_fee_amount_atomic,trading_fee_policy_version_id,
      status,locked_at,metadata
    ) values(
      v_auth.position_id,v_intent.user_id,v_intent.wallet_connection_id,
      v_intent.venue_id,v_venue.instrument_id,v_intent.outcome_id,
      v_tx.chain_id,v_auth.contract_deployment_id,v_intent.id,v_auth.id,
      v_tx.id,v_auth.amount,v_auth.amount_atomic,
      v_auth.fee_amount,v_auth.fee_amount_atomic,v_auth.fee_policy_version_id,
      'LOCKED',statement_timestamp(),
      jsonb_build_object(
        'authorization_id',v_auth.authorization_id,
        'transaction_id',v_tx.transaction_id
      )
    )
    on conflict(position_id) do nothing;
  elsif coalesce(p_finalized,false)
        and v_auth.authorization_type in ('CLAIM_PAYOUT','REFUND') then
    select * into v_entitlement
    from blockchain.settlement_entitlements
    where settlement_intent_id=v_intent.id
    for update;

    if v_entitlement.id is null then
      raise exception 'Settlement entitlement is missing for the confirmed payout'
        using errcode='23514';
    end if;

    update blockchain.settlement_entitlements
    set status='CONFIRMED'
    where id=v_entitlement.id;

    select * into v_position
    from blockchain.positions
    where id=v_entitlement.position_record_id
    for update;

    update blockchain.positions
    set status=case when v_auth.authorization_type='REFUND' then 'REFUNDED' else 'SETTLED' end,
        settled_at=statement_timestamp()
    where id=v_position.id;
  end if;

  return jsonb_build_object(
    'intentId',v_intent.public_id,
    'status',v_tx_status,
    'confirmations',p_confirmation_count,
    'finalized',coalesce(p_finalized,false),
    'eventType',v_event_type
  );
end;
$$;

revoke all on function public.internal_record_onchain_receipt(
  uuid,uuid,boolean,bigint,text,integer,boolean,integer,jsonb,text
) from public,anon,authenticated;
grant execute on function public.internal_record_onchain_receipt(
  uuid,uuid,boolean,bigint,text,integer,boolean,integer,jsonb,text
) to service_role;

create or replace function private.ensure_onchain_settlement_entitlements(
  p_instrument_id bigint
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_instrument market.instruments;
  v_resolution oracle.resolutions;
  v_winning_outcome bigint;
  v_venue record;
  v_rep blockchain.asset_representations;
  v_total_atomic numeric(38,0);
  v_winning_atomic numeric(38,0);
  v_winner_count integer;
  v_winner_index integer;
  v_allocated_atomic numeric(38,0);
  v_gross_atomic numeric(38,0);
  v_gross numeric(38,18);
  v_fee numeric(38,18);
  v_fee_atomic numeric(38,0);
  v_fee_policy bigint;
  v_net_atomic numeric(38,0);
  v_scale numeric;
  v_position blockchain.positions;
  v_economic_void boolean;
  v_market_id text;
  v_winning_outcome_id text;
  v_evidence_hash text;
begin
  select * into v_instrument
  from market.instruments
  where id=p_instrument_id;
  if v_instrument.id is null then
    raise exception 'Market not found' using errcode='P0002';
  end if;

  select r.* into v_resolution
  from oracle.resolutions r
  where r.event_id=v_instrument.canonical_event_id
    and r.status in ('FINAL','VOID')
  order by r.finalized_at desc nulls last,r.id desc
  limit 1;
  if v_resolution.id is null then
    raise exception 'Final canonical resolution is required before on-chain settlement'
      using errcode='P0001';
  end if;

  if exists(
    select 1
    from blockchain.transaction_intents ti
    join market.instrument_venues iv on iv.id=ti.venue_id
    where iv.instrument_id=v_instrument.id
      and ti.action='PREDICT'
      and (
        ti.status in ('SUBMITTED','CONFIRMING')
        or (
          ti.status in ('CREATED','AWAITING_SIGNATURE','SIGNED')
          and (ti.expires_at is null or ti.expires_at>statement_timestamp())
        )
      )
  ) then
    raise exception 'On-chain position confirmations are still pending for this market'
      using errcode='P0001';
  end if;

  if v_resolution.status='FINAL' then
    select o.id into v_winning_outcome
    from market.outcomes o
    where o.instrument_id=v_instrument.id
      and upper(o.code)=upper(v_resolution.outcome_code);
    if v_winning_outcome is null then
      raise exception 'Resolved outcome is missing from this market' using errcode='23514';
    end if;
  end if;

  v_market_id:=private.onchain_bytes32('market',v_instrument.public_id::text);
  v_evidence_hash:=private.onchain_bytes32(
    'resolution-evidence',
    v_resolution.id::text||':'||
    coalesce(v_resolution.status,'')||':'||
    coalesce(v_resolution.outcome_code,'VOID')||':'||
    coalesce(v_resolution.consensus_evidence::text,'{}')
  );

  for v_venue in
    select iv.id,iv.asset_representation_id
    from market.instrument_venues iv
    where iv.instrument_id=v_instrument.id
      and iv.settlement_type='ONCHAIN'
      and exists(
        select 1 from blockchain.positions bp
        where bp.venue_id=iv.id and bp.status='LOCKED'
      )
    order by iv.id
  loop
    select * into v_rep
    from blockchain.asset_representations
    where id=v_venue.asset_representation_id;
    if v_rep.id is null then
      raise exception 'On-chain venue settlement asset is missing' using errcode='23514';
    end if;
    v_scale:=power(10::numeric,v_rep.decimals);

    select coalesce(sum(bp.collateral_amount_atomic),0)
      into v_total_atomic
    from blockchain.positions bp
    where bp.venue_id=v_venue.id and bp.status='LOCKED';

    select coalesce(sum(bp.collateral_amount_atomic),0)
      into v_winning_atomic
    from blockchain.positions bp
    where bp.venue_id=v_venue.id
      and bp.status='LOCKED'
      and bp.outcome_id=v_winning_outcome;

    v_economic_void:=v_resolution.status='VOID' or coalesce(v_winning_atomic,0)=0;
    v_winning_outcome_id:=case
      when v_economic_void then '0x'||repeat('0',64)
      else private.onchain_bytes32(
        'outcome',
        (select o.public_id::text from market.outcomes o where o.id=v_winning_outcome)
      )
    end;

    if v_economic_void then
      for v_position in
        select * from blockchain.positions
        where venue_id=v_venue.id and status='LOCKED'
        order by id
      loop
        insert into blockchain.settlement_entitlements(
          position_record_id,resolution_id,entitlement_type,
          gross_payout,gross_payout_atomic,
          settlement_fee_amount,settlement_fee_amount_atomic,
          settlement_fee_policy_version_id,
          net_payout,net_payout_atomic,status,metadata
        ) values(
          v_position.id,v_resolution.id,'REFUND',
          v_position.collateral_amount,v_position.collateral_amount_atomic,
          0,0,null,
          v_position.collateral_amount,v_position.collateral_amount_atomic,
          'PENDING',
          jsonb_build_object(
            'marketId',v_market_id,
            'winningOutcomeId',v_winning_outcome_id,
            'voided',true,
            'evidenceHash',v_evidence_hash,
            'economicVoid',v_resolution.status<>'VOID',
            'voidReason',case
              when v_resolution.status='VOID' then 'CANONICAL_VOID'
              else 'NO_WINNING_POSITIONS'
            end
          )
        )
        on conflict(position_record_id) do nothing;

        update blockchain.positions
        set status='SETTLEMENT_READY'
        where id=v_position.id and status='LOCKED';
      end loop;
    else
      insert into blockchain.settlement_entitlements(
        position_record_id,resolution_id,entitlement_type,
        gross_payout,gross_payout_atomic,
        settlement_fee_amount,settlement_fee_amount_atomic,
        settlement_fee_policy_version_id,
        net_payout,net_payout_atomic,status,metadata
      )
      select
        bp.id,v_resolution.id,'LOSS',
        0,0,0,0,null,0,0,'NO_ACTION',
        jsonb_build_object(
          'marketId',v_market_id,
          'winningOutcomeId',v_winning_outcome_id,
          'voided',false,
          'evidenceHash',v_evidence_hash,
          'economicVoid',false
        )
      from blockchain.positions bp
      where bp.venue_id=v_venue.id
        and bp.status='LOCKED'
        and bp.outcome_id<>v_winning_outcome
      on conflict(position_record_id) do nothing;

      update blockchain.positions
      set status='LOST',settled_at=statement_timestamp()
      where venue_id=v_venue.id
        and status='LOCKED'
        and outcome_id<>v_winning_outcome;

      select count(*) into v_winner_count
      from blockchain.positions bp
      where bp.venue_id=v_venue.id
        and bp.status='LOCKED'
        and bp.outcome_id=v_winning_outcome;

      v_winner_index:=0;
      v_allocated_atomic:=0;

      for v_position in
        select * from blockchain.positions
        where venue_id=v_venue.id
          and status='LOCKED'
          and outcome_id=v_winning_outcome
        order by id
      loop
        v_winner_index:=v_winner_index+1;

        if v_winner_index=v_winner_count then
          v_gross_atomic:=v_total_atomic-v_allocated_atomic;
        else
          v_gross_atomic:=floor(
            v_total_atomic*v_position.collateral_amount_atomic/v_winning_atomic
          );
          v_allocated_atomic:=v_allocated_atomic+v_gross_atomic;
        end if;

        v_gross:=v_gross_atomic/v_scale;
        select q.fee_amount,q.policy_version_id
          into v_fee,v_fee_policy
        from command.quote_settlement_fee(v_gross) q;

        v_fee:=coalesce(v_fee,0);
        v_fee_atomic:=least(
          v_gross_atomic,
          private.asset_amount_to_atomic(v_fee,v_rep.decimals,false)
        );
        v_fee:=v_fee_atomic/v_scale;
        v_net_atomic:=v_gross_atomic-v_fee_atomic;

        insert into blockchain.settlement_entitlements(
          position_record_id,resolution_id,entitlement_type,
          gross_payout,gross_payout_atomic,
          settlement_fee_amount,settlement_fee_amount_atomic,
          settlement_fee_policy_version_id,
          net_payout,net_payout_atomic,status,metadata
        ) values(
          v_position.id,v_resolution.id,'CLAIM',
          v_gross,v_gross_atomic,
          v_fee,v_fee_atomic,
          case when v_fee_atomic>0 then v_fee_policy else null end,
          v_net_atomic/v_scale,v_net_atomic,'PENDING',
          jsonb_build_object(
            'marketId',v_market_id,
            'winningOutcomeId',v_winning_outcome_id,
            'voided',false,
            'evidenceHash',v_evidence_hash,
            'economicVoid',false
          )
        )
        on conflict(position_record_id) do nothing;

        update blockchain.positions
        set status='SETTLEMENT_READY'
        where id=v_position.id and status='LOCKED';
      end loop;
    end if;
  end loop;
end;
$$;

revoke all on function private.ensure_onchain_settlement_entitlements(bigint)
  from public,anon,authenticated;

create or replace function public.internal_prepare_onchain_settlement(
  p_user_id uuid,
  p_wallet_id uuid,
  p_position_public_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_position blockchain.positions;
  v_wallet blockchain.wallet_connections;
  v_entitlement blockchain.settlement_entitlements;
  v_intent blockchain.transaction_intents;
  v_auth blockchain.transaction_authorizations;
  v_venue market.instrument_venues;
  v_chain blockchain.chains;
  v_rep blockchain.asset_representations;
  v_deployment blockchain.contract_deployments;
  v_existing_user uuid;
  v_deadline timestamptz;
  v_auth_id text;
  v_original_auth blockchain.transaction_authorizations;
  v_expected_signer text;
  v_action text;
  v_auth_type text;
begin
  if p_user_id is null or p_wallet_id is null or p_position_public_id is null then
    raise exception 'Settlement identity is required' using errcode='22023';
  end if;
  if p_idempotency_key is null
     or char_length(btrim(p_idempotency_key))<12
     or char_length(btrim(p_idempotency_key))>240 then
    raise exception 'A valid settlement idempotency key is required' using errcode='22023';
  end if;

  select ti.user_id into v_existing_user
  from blockchain.transaction_intents ti
  where ti.idempotency_key=btrim(p_idempotency_key);

  if v_existing_user is not null then
    if v_existing_user<>p_user_id then
      raise exception 'Settlement idempotency key belongs to another account'
        using errcode='23505';
    end if;

    select * into v_intent
    from blockchain.transaction_intents
    where idempotency_key=btrim(p_idempotency_key);
    select * into v_auth
    from blockchain.transaction_authorizations
    where intent_id=v_intent.id;
    select * into v_chain from blockchain.chains where id=v_auth.chain_id;
    select * into v_rep from blockchain.asset_representations where id=v_auth.asset_representation_id;
    select * into v_deployment from blockchain.contract_deployments where id=v_auth.contract_deployment_id;

    return jsonb_build_object(
      'intentId',v_intent.public_id,
      'intentStatus',v_intent.status,
      'authorizationType',v_auth.authorization_type,
      'authorizationId',v_auth.authorization_id,
      'positionId',v_auth.position_id,
      'marketId',v_auth.market_id,
      'walletAddress',v_auth.wallet_address,
      'grossPayout',v_auth.amount,
      'grossPayoutAtomic',v_auth.amount_atomic::text,
      'settlementFee',v_auth.fee_amount,
      'settlementFeeAmountAtomic',v_auth.fee_amount_atomic::text,
      'settlementFeePolicyVersionId',coalesce(v_auth.fee_policy_version_id,0),
      'resolution',v_auth.metadata->'resolution',
      'deadline',extract(epoch from v_auth.expires_at)::bigint,
      'chainCode',v_chain.code,
      'evmChainId',v_chain.evm_chain_id,
      'rpcUrl',v_chain.metadata->>'rpc_url',
      'contractAddress',v_deployment.contract_address,
      'tokenAddress',v_rep.token_address,
      'tokenDecimals',v_rep.decimals,
      'expectedSettlementSigner',v_deployment.metadata->>'settlement_signer_address',
      'expectedResolver',v_deployment.metadata->>'resolver_address',
      'signature',v_auth.signature
    );
  end if;

  select * into v_position
  from blockchain.positions
  where public_id=p_position_public_id
    and user_id=p_user_id;
  if v_position.id is null then
    raise exception 'On-chain position not found' using errcode='P0002';
  end if;

  select * into v_wallet
  from blockchain.wallet_connections
  where public_id=p_wallet_id
    and user_id=p_user_id
    and status='VERIFIED';
  if v_wallet.id is null or v_wallet.id<>v_position.wallet_connection_id then
    raise exception 'The verified wallet does not own this VAD position'
      using errcode='P0001';
  end if;

  perform private.ensure_onchain_settlement_entitlements(v_position.instrument_id);

  select * into v_entitlement
  from blockchain.settlement_entitlements
  where position_record_id=v_position.id
  for update;
  if v_entitlement.id is null then
    raise exception 'Settlement entitlement is not available yet' using errcode='P0001';
  end if;

  if v_entitlement.entitlement_type='LOSS' then
    return jsonb_build_object(
      'positionId',v_position.public_id,
      'noAction',true,
      'result','LOST',
      'grossPayout',0,
      'settlementFee',0,
      'netPayout',0
    );
  end if;
  if v_entitlement.status not in ('PENDING','AUTHORIZED','SUBMITTED') then
    if v_entitlement.status='CONFIRMED' then
      return jsonb_build_object(
        'positionId',v_position.public_id,
        'noAction',true,
        'result',case when v_entitlement.entitlement_type='REFUND' then 'REFUNDED' else 'SETTLED' end,
        'grossPayout',v_entitlement.gross_payout,
        'settlementFee',v_entitlement.settlement_fee_amount,
        'netPayout',v_entitlement.net_payout
      );
    end if;
    raise exception 'Settlement entitlement is not available for authorization'
      using errcode='P0001';
  end if;

  select * into v_venue from market.instrument_venues where id=v_position.venue_id;
  select * into v_chain from blockchain.chains where id=v_position.chain_id;
  select * into v_rep from blockchain.asset_representations where id=v_venue.asset_representation_id;
  select * into v_deployment
  from blockchain.contract_deployments
  where id=v_position.contract_deployment_id
    and status='ACTIVE';

  if v_deployment.id is null
     or v_chain.status<>'ACTIVE'
     or v_rep.status<>'ACTIVE'
     or v_venue.status<>'ACTIVE' then
    raise exception 'This on-chain settlement venue is not active'
      using errcode='P0001';
  end if;

  v_expected_signer:=lower(btrim(coalesce(v_deployment.metadata->>'settlement_signer_address','')));
  if v_expected_signer !~ '^0x[0-9a-f]{40}$' then
    raise exception 'Settlement signer is not configured for this deployment'
      using errcode='P0001';
  end if;

  select * into v_original_auth
  from blockchain.transaction_authorizations
  where id=v_position.lock_authorization_id;

  v_action:=case when v_entitlement.entitlement_type='REFUND' then 'REFUND' else 'CLAIM' end;
  v_auth_type:=case when v_entitlement.entitlement_type='REFUND' then 'REFUND' else 'CLAIM_PAYOUT' end;
  v_deadline:=statement_timestamp()+interval '5 minutes';

  insert into blockchain.transaction_intents(
    user_id,wallet_connection_id,venue_id,action,outcome_id,amount,status,
    idempotency_key,expires_at,metadata
  ) values(
    p_user_id,v_position.wallet_connection_id,v_position.venue_id,
    v_action,null,v_entitlement.gross_payout,'CREATED',
    btrim(p_idempotency_key),v_deadline,
    jsonb_build_object(
      'protocol_key','VAD_SETTLEMENT_V1',
      'protocol_version',1,
      'asset_code','USDC',
      'position_record_id',v_position.public_id,
      'entitlement_id',v_entitlement.public_id,
      'fee_policy_name','settlement_fee',
      'fee_policy_version_id',v_entitlement.settlement_fee_policy_version_id
    )
  )
  returning * into v_intent;

  v_auth_id:=private.onchain_bytes32('settlement-authorization',v_intent.public_id::text);

  insert into blockchain.transaction_authorizations(
    intent_id,chain_id,contract_deployment_id,asset_id,asset_representation_id,
    authorization_type,authorization_id,position_id,market_id,outcome_id,
    wallet_address,amount,amount_atomic,fee_policy_name,fee_policy_version_id,
    fee_amount,fee_amount_atomic,expires_at,status,payload,metadata
  ) values(
    v_intent.id,v_position.chain_id,v_position.contract_deployment_id,
    v_original_auth.asset_id,v_original_auth.asset_representation_id,
    v_auth_type,v_auth_id,v_position.position_id,v_original_auth.market_id,null,
    v_original_auth.wallet_address,
    v_entitlement.gross_payout,v_entitlement.gross_payout_atomic,
    'settlement_fee',v_entitlement.settlement_fee_policy_version_id,
    v_entitlement.settlement_fee_amount,v_entitlement.settlement_fee_amount_atomic,
    v_deadline,'PREPARED',
    jsonb_build_object(
      'authorizationId',v_auth_id,
      'positionId',v_position.position_id,
      'marketId',v_original_auth.market_id,
      'user',v_original_auth.wallet_address,
      'grossPayout',v_entitlement.gross_payout_atomic::text,
      'settlementFeeAmount',v_entitlement.settlement_fee_amount_atomic::text,
      'settlementFeePolicyVersion',coalesce(v_entitlement.settlement_fee_policy_version_id,0)::text,
      'deadline',extract(epoch from v_deadline)::bigint
    ),
    jsonb_build_object(
      'position_record_id',v_position.public_id,
      'entitlement_id',v_entitlement.public_id,
      'expected_settlement_signer',v_expected_signer,
      'resolution',v_entitlement.metadata
    )
  )
  returning * into v_auth;

  update blockchain.transaction_intents
  set status='AWAITING_SIGNATURE'
  where id=v_intent.id
  returning * into v_intent;

  update blockchain.settlement_entitlements
  set status='AUTHORIZED',settlement_intent_id=v_intent.id
  where id=v_entitlement.id;

  return jsonb_build_object(
    'intentId',v_intent.public_id,
    'intentStatus',v_intent.status,
    'authorizationType',v_auth.authorization_type,
    'authorizationId',v_auth.authorization_id,
    'positionId',v_auth.position_id,
    'marketId',v_auth.market_id,
    'walletAddress',v_auth.wallet_address,
    'grossPayout',v_auth.amount,
    'grossPayoutAtomic',v_auth.amount_atomic::text,
    'settlementFee',v_auth.fee_amount,
    'settlementFeeAmountAtomic',v_auth.fee_amount_atomic::text,
    'settlementFeePolicyVersionId',coalesce(v_auth.fee_policy_version_id,0),
    'resolution',v_auth.metadata->'resolution',
    'deadline',extract(epoch from v_auth.expires_at)::bigint,
    'chainCode',v_chain.code,
    'evmChainId',v_chain.evm_chain_id,
    'rpcUrl',v_chain.metadata->>'rpc_url',
    'contractAddress',v_deployment.contract_address,
    'tokenAddress',v_rep.token_address,
    'tokenDecimals',v_rep.decimals,
    'expectedSettlementSigner',v_expected_signer,
    'expectedResolver',v_deployment.metadata->>'resolver_address',
    'signature',null
  );
end;
$$;

revoke all on function public.internal_prepare_onchain_settlement(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_prepare_onchain_settlement(uuid,uuid,uuid,text)
  to service_role;

create or replace function public.internal_set_onchain_resolution_hash(
  p_user_id uuid,
  p_intent_id uuid,
  p_resolution_hash text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_intent blockchain.transaction_intents;
  v_auth blockchain.transaction_authorizations;
begin
  if lower(btrim(coalesce(p_resolution_hash,''))) !~ '^0x[0-9a-f]{64}$' then
    raise exception 'Resolution hash is invalid' using errcode='22023';
  end if;

  select * into v_intent
  from blockchain.transaction_intents
  where public_id=p_intent_id and user_id=p_user_id
  for update;
  if v_intent.id is null then raise exception 'On-chain intent not found' using errcode='P0002'; end if;

  select * into v_auth
  from blockchain.transaction_authorizations
  where intent_id=v_intent.id
  for update;
  if v_auth.id is null
     or v_auth.authorization_type not in ('CLAIM_PAYOUT','REFUND')
     or v_auth.status<>'PREPARED'
     or v_intent.status<>'AWAITING_SIGNATURE' then
    raise exception 'Settlement authorization is not ready for its resolution hash'
      using errcode='P0001';
  end if;

  update blockchain.transaction_authorizations
  set payload=payload||jsonb_build_object(
        'resolutionHash',lower(btrim(p_resolution_hash))
      ),
      metadata=metadata||jsonb_build_object(
        'resolution_hash',lower(btrim(p_resolution_hash))
      ),
      updated_at=statement_timestamp()
  where id=v_auth.id;

  return true;
end;
$$;

revoke all on function public.internal_set_onchain_resolution_hash(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.internal_set_onchain_resolution_hash(uuid,uuid,text)
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
  v_signer_key text;
begin
  if p_user_id is null or p_intent_id is null then
    raise exception 'On-chain authorization identity is required' using errcode='22023';
  end if;

  select ti.* into v_intent
  from blockchain.transaction_intents ti
  where ti.public_id=p_intent_id and ti.user_id=p_user_id
  for update;
  if v_intent.id is null then
    raise exception 'On-chain transaction intent not found' using errcode='P0002';
  end if;

  select ta.* into v_auth
  from blockchain.transaction_authorizations ta
  where ta.intent_id=v_intent.id
  for update;
  if v_auth.id is null then
    raise exception 'On-chain authorization not found' using errcode='P0002';
  end if;

  if v_auth.status='SIGNED' and v_auth.signature=p_signature then
    return jsonb_build_object(
      'intentId',v_intent.public_id,'status',v_intent.status,
      'signature',v_auth.signature,'signerAddress',v_auth.signer_address
    );
  end if;

  if v_intent.status<>'AWAITING_SIGNATURE' or v_auth.status<>'PREPARED' then
    raise exception 'On-chain authorization is not awaiting a signature'
      using errcode='P0001';
  end if;

  if v_auth.expires_at<=statement_timestamp() then
    update blockchain.transaction_authorizations
    set status='EXPIRED'
    where id=v_auth.id;

    update blockchain.transaction_intents
    set status='FAILED',failure_code='AUTHORIZATION_EXPIRED'
    where id=v_intent.id;

    raise exception 'On-chain authorization expired' using errcode='P0001';
  end if;

  if v_auth.authorization_type='PREDICT_LOCK' then
    v_signer_key:='expected_quote_signer';
  else
    v_signer_key:='expected_settlement_signer';
    if coalesce(v_auth.payload->>'resolutionHash','') !~ '^0x[0-9a-f]{64}$' then
      raise exception 'Settlement authorization is missing its resolution hash'
        using errcode='23514';
    end if;
  end if;

  v_expected_signer:=lower(btrim(coalesce(v_auth.metadata->>v_signer_key,'')));
  if lower(btrim(coalesce(p_signer_address,'')))<>v_expected_signer
     or v_expected_signer !~ '^0x[0-9a-f]{40}$' then
    raise exception 'Unexpected VAD authorization signer' using errcode='23514';
  end if;
  if btrim(coalesce(p_signature,'')) !~ '^0x[0-9a-fA-F]{130}$' then
    raise exception 'Invalid VAD authorization signature' using errcode='22023';
  end if;

  update blockchain.transaction_authorizations
  set status='SIGNED',
      signer_address=v_expected_signer,
      signature=btrim(p_signature),
      signed_at=statement_timestamp()
  where id=v_auth.id
  returning * into v_auth;

  update blockchain.transaction_intents
  set status='SIGNED'
  where id=v_intent.id
  returning * into v_intent;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    p_user_id,'SYSTEM','ONCHAIN_AUTHORIZATION_SIGNED',
    'ONCHAIN_TRANSACTION_INTENT',v_intent.public_id::text,
    'VAD signed an on-chain transaction authorization',
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
    jsonb_build_object(
      'source','CLIENT_SUBMISSION',
      'authorization_id',v_auth.authorization_id,
      'authorization_type',v_auth.authorization_type
    )
  )
  on conflict(chain_id,transaction_id) do update
  set updated_at=statement_timestamp()
  returning * into v_transaction;

  if v_intent.status='SIGNED' then
    update blockchain.transaction_intents
    set status='SUBMITTED'
    where id=v_intent.id
    returning * into v_intent;
  end if;

  if v_auth.authorization_type in ('CLAIM_PAYOUT','REFUND') then
    update blockchain.settlement_entitlements
    set status='SUBMITTED'
    where settlement_intent_id=v_intent.id
      and status='AUTHORIZED';
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
      'authorization_id',v_auth.authorization_id,
      'authorization_type',v_auth.authorization_type
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

create or replace function public.my_onchain_positions()
returns table(
  position_record_id uuid,
  position_id text,
  instrument_public_id uuid,
  market_title text,
  outcome_code text,
  chain_code text,
  wallet_address text,
  collateral_amount numeric,
  trading_fee_amount numeric,
  position_status text,
  entitlement_type text,
  gross_payout numeric,
  settlement_fee numeric,
  net_payout numeric,
  entitlement_status text,
  locked_at timestamptz,
  settled_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select
    bp.public_id,
    bp.position_id,
    i.public_id,
    ce.title,
    o.code,
    c.code,
    wc.wallet_address,
    bp.collateral_amount,
    bp.trading_fee_amount,
    bp.status,
    se.entitlement_type,
    se.gross_payout,
    se.settlement_fee_amount,
    se.net_payout,
    se.status,
    bp.locked_at,
    bp.settled_at
  from blockchain.positions bp
  join market.instruments i on i.id=bp.instrument_id
  join market.canonical_events ce on ce.id=i.canonical_event_id
  join market.outcomes o on o.id=bp.outcome_id
  join blockchain.chains c on c.id=bp.chain_id
  join blockchain.wallet_connections wc on wc.id=bp.wallet_connection_id
  left join blockchain.settlement_entitlements se
    on se.position_record_id=bp.id
  where bp.user_id=auth.uid()
    and private.asset_available_for_user(auth.uid(),i.asset_id)
  order by bp.updated_at desc,bp.id desc;
$$;

revoke all on function public.my_onchain_positions() from public,anon;
grant execute on function public.my_onchain_positions() to authenticated;

commit;
