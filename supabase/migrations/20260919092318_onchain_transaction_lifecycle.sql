begin;

create table if not exists blockchain.transaction_intents (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_connection_id bigint not null references blockchain.wallet_connections(id) on delete restrict,
  venue_id bigint not null references market.instrument_venues(id) on delete restrict,
  action text not null check (action in ('PREDICT','CLAIM','REFUND')),
  outcome_id bigint references market.outcomes(id) on delete restrict,
  amount numeric(38,18),
  status text not null default 'CREATED'
    check (status in (
      'CREATED','AWAITING_SIGNATURE','SIGNED','SUBMITTED','CONFIRMING',
      'CONFIRMED','FAILED','CANCELLED','REPLACED','DROPPED'
    )),
  idempotency_key text not null unique
    check (char_length(btrim(idempotency_key)) between 12 and 240),
  expires_at timestamptz,
  signed_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  failed_at timestamptz,
  failure_code text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint blockchain_transaction_intent_action_shape check (
    (
      action='PREDICT'
      and outcome_id is not null
      and amount is not null
      and amount>0
    )
    or
    (
      action in ('CLAIM','REFUND')
      and (amount is null or amount>0)
    )
  )
);

create index if not exists blockchain_transaction_intents_user_idx
  on blockchain.transaction_intents(user_id,created_at desc);

create index if not exists blockchain_transaction_intents_wallet_idx
  on blockchain.transaction_intents(wallet_connection_id,status,created_at desc);

create index if not exists blockchain_transaction_intents_venue_idx
  on blockchain.transaction_intents(venue_id,status,created_at desc);

create index if not exists blockchain_transaction_intents_outcome_idx
  on blockchain.transaction_intents(outcome_id)
  where outcome_id is not null;

alter table blockchain.transaction_intents enable row level security;
revoke all on table blockchain.transaction_intents from public,anon,authenticated;
grant all on table blockchain.transaction_intents to service_role;
grant usage,select on sequence blockchain.transaction_intents_id_seq to service_role;

drop trigger if exists blockchain_transaction_intents_set_updated_at
  on blockchain.transaction_intents;
create trigger blockchain_transaction_intents_set_updated_at
before update on blockchain.transaction_intents
for each row execute function private.set_updated_at();

create or replace function private.validate_onchain_transaction_intent()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_wallet_user uuid;
  v_wallet_status text;
  v_wallet_family text;
  v_venue_type text;
  v_venue_status text;
  v_chain_family text;
begin
  select wc.user_id,wc.status,wc.chain_family
    into v_wallet_user,v_wallet_status,v_wallet_family
  from blockchain.wallet_connections wc
  where wc.id=new.wallet_connection_id;

  if v_wallet_user is distinct from new.user_id or v_wallet_status<>'VERIFIED' then
    raise exception 'A verified wallet owned by this VAD account is required'
      using errcode='23514';
  end if;

  select iv.settlement_type,iv.status,c.chain_family
    into v_venue_type,v_venue_status,v_chain_family
  from market.instrument_venues iv
  join blockchain.chains c on c.id=iv.chain_id
  where iv.id=new.venue_id;

  if v_venue_type is distinct from 'ONCHAIN'
     or v_venue_status is distinct from 'ACTIVE' then
    raise exception 'An active on-chain market venue is required'
      using errcode='23514';
  end if;

  if v_wallet_family is distinct from v_chain_family then
    raise exception 'Wallet family does not match the market venue chain'
      using errcode='23514';
  end if;

  if new.action='PREDICT' and not exists(
    select 1
    from market.outcomes o
    join market.instrument_venues iv on iv.instrument_id=o.instrument_id
    where o.id=new.outcome_id
      and iv.id=new.venue_id
  ) then
    raise exception 'Prediction outcome does not belong to the selected market venue'
      using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_onchain_transaction_intent()
  from public,anon,authenticated;

drop trigger if exists blockchain_transaction_intents_validate
  on blockchain.transaction_intents;
create trigger blockchain_transaction_intents_validate
before insert or update of user_id,wallet_connection_id,venue_id,action,outcome_id
on blockchain.transaction_intents
for each row execute function private.validate_onchain_transaction_intent();

create or replace function private.validate_onchain_intent_status_transition()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if new.status=old.status then
    return new;
  end if;

  if not (
    (old.status='CREATED' and new.status in ('AWAITING_SIGNATURE','FAILED','CANCELLED'))
    or (old.status='AWAITING_SIGNATURE' and new.status in ('SIGNED','FAILED','CANCELLED'))
    or (old.status='SIGNED' and new.status in ('SUBMITTED','FAILED','CANCELLED'))
    or (old.status='SUBMITTED' and new.status in ('CONFIRMING','CONFIRMED','FAILED','REPLACED','DROPPED'))
    or (old.status='CONFIRMING' and new.status in ('CONFIRMED','FAILED','REPLACED','DROPPED'))
  ) then
    raise exception 'Invalid on-chain transaction intent status transition: % -> %',
      old.status,new.status
      using errcode='23514';
  end if;

  if new.status='SIGNED' and new.signed_at is null then
    new.signed_at=statement_timestamp();
  elsif new.status='SUBMITTED' and new.submitted_at is null then
    new.submitted_at=statement_timestamp();
  elsif new.status='CONFIRMED' and new.confirmed_at is null then
    new.confirmed_at=statement_timestamp();
  elsif new.status='FAILED' and new.failed_at is null then
    new.failed_at=statement_timestamp();
  end if;

  return new;
end;
$$;

revoke all on function private.validate_onchain_intent_status_transition()
  from public,anon,authenticated;

drop trigger if exists blockchain_transaction_intents_status_guard
  on blockchain.transaction_intents;
create trigger blockchain_transaction_intents_status_guard
before update of status on blockchain.transaction_intents
for each row execute function private.validate_onchain_intent_status_transition();

create table if not exists blockchain.transactions (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  intent_id bigint not null references blockchain.transaction_intents(id) on delete restrict,
  chain_id bigint not null references blockchain.chains(id) on delete restrict,
  transaction_id text not null
    check (char_length(btrim(transaction_id)) between 20 and 220),
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','CONFIRMING','CONFIRMED','FAILED','REPLACED','DROPPED')),
  block_number bigint,
  block_hash text,
  confirmation_count integer not null default 0 check (confirmation_count>=0),
  finalized boolean not null default false,
  first_seen_at timestamptz,
  finalized_at timestamptz,
  failure_code text,
  replacement_transaction_id text,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata)='object'),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(chain_id,transaction_id)
);

create index if not exists blockchain_transactions_intent_idx
  on blockchain.transactions(intent_id,created_at desc);

create index if not exists blockchain_transactions_chain_status_idx
  on blockchain.transactions(chain_id,status,created_at desc);

alter table blockchain.transactions enable row level security;
revoke all on table blockchain.transactions from public,anon,authenticated;
grant all on table blockchain.transactions to service_role;
grant usage,select on sequence blockchain.transactions_id_seq to service_role;

drop trigger if exists blockchain_transactions_set_updated_at on blockchain.transactions;
create trigger blockchain_transactions_set_updated_at
before update on blockchain.transactions
for each row execute function private.set_updated_at();

create or replace function private.validate_onchain_transaction_chain()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_intent_chain bigint;
begin
  select iv.chain_id into v_intent_chain
  from blockchain.transaction_intents ti
  join market.instrument_venues iv on iv.id=ti.venue_id
  where ti.id=new.intent_id;

  if v_intent_chain is distinct from new.chain_id then
    raise exception 'Transaction chain does not match its VAD transaction intent'
      using errcode='23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_onchain_transaction_chain()
  from public,anon,authenticated;

drop trigger if exists blockchain_transactions_chain_guard
  on blockchain.transactions;
create trigger blockchain_transactions_chain_guard
before insert or update of intent_id,chain_id on blockchain.transactions
for each row execute function private.validate_onchain_transaction_chain();

create table if not exists blockchain.indexed_contract_events (
  id bigint generated always as identity primary key,
  chain_id bigint not null references blockchain.chains(id) on delete restrict,
  contract_deployment_id bigint not null references blockchain.contract_deployments(id) on delete restrict,
  venue_id bigint references market.instrument_venues(id) on delete restrict,
  transaction_id text not null
    check (char_length(btrim(transaction_id)) between 20 and 220),
  block_number bigint not null,
  block_hash text,
  event_index integer not null check (event_index>=0),
  event_type text not null check (event_type ~ '^[A-Z][A-Z0-9_]*$'),
  wallet_address text,
  amount numeric(38,18),
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload)='object'),
  finality_status text not null default 'OBSERVED'
    check (finality_status in ('OBSERVED','CONFIRMED','FINALIZED','REORGED')),
  observed_at timestamptz not null default statement_timestamp(),
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  unique(chain_id,transaction_id,event_index)
);

create index if not exists blockchain_indexed_events_contract_idx
  on blockchain.indexed_contract_events(contract_deployment_id,block_number,event_index);

create index if not exists blockchain_indexed_events_venue_idx
  on blockchain.indexed_contract_events(venue_id,block_number,event_index)
  where venue_id is not null;

alter table blockchain.indexed_contract_events enable row level security;
revoke all on table blockchain.indexed_contract_events from public,anon,authenticated;
grant all on table blockchain.indexed_contract_events to service_role;
grant usage,select on sequence blockchain.indexed_contract_events_id_seq to service_role;

create or replace function public.my_onchain_transaction_intents(
  p_limit integer default 50
)
returns table(
  intent_id uuid,
  action text,
  status text,
  chain_code text,
  wallet_address text,
  amount numeric,
  outcome_label text,
  transaction_id text,
  transaction_status text,
  confirmations integer,
  finalized boolean,
  failure_code text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to view on-chain activity' using errcode='42501';
  end if;

  return query
  select
    ti.public_id,
    ti.action,
    ti.status,
    c.code,
    wc.wallet_address,
    ti.amount,
    o.label,
    tx.transaction_id,
    tx.status,
    coalesce(tx.confirmation_count,0),
    coalesce(tx.finalized,false),
    coalesce(ti.failure_code,tx.failure_code),
    ti.created_at,
    ti.updated_at
  from blockchain.transaction_intents ti
  join blockchain.wallet_connections wc on wc.id=ti.wallet_connection_id
  join market.instrument_venues iv on iv.id=ti.venue_id
  join blockchain.chains c on c.id=iv.chain_id
  left join market.outcomes o on o.id=ti.outcome_id
  left join lateral (
    select t.*
    from blockchain.transactions t
    where t.intent_id=ti.id
    order by t.created_at desc,t.id desc
    limit 1
  ) tx on true
  where ti.user_id=auth.uid()
  order by ti.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
end;
$$;

revoke all on function public.my_onchain_transaction_intents(integer)
  from public,anon;
grant execute on function public.my_onchain_transaction_intents(integer)
  to authenticated;

commit;