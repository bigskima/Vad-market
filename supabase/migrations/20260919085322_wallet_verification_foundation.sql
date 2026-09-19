begin;

alter table blockchain.wallet_connections
  add column if not exists wallet_address_normalized text;

update blockchain.wallet_connections
set wallet_address_normalized=case
  when chain_family='EVM' then lower(btrim(wallet_address))
  else btrim(wallet_address)
end
where wallet_address_normalized is null;

alter table blockchain.wallet_connections
  alter column wallet_address_normalized set not null;

create unique index if not exists blockchain_verified_wallet_identity_unique
  on blockchain.wallet_connections(chain_family,wallet_address_normalized)
  where status='VERIFIED';

create table if not exists blockchain.wallet_verification_challenges (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  chain_family text not null check (chain_family ~ '^[A-Z][A-Z0-9_]*$'),
  wallet_address text not null check (char_length(btrim(wallet_address)) between 3 and 200),
  wallet_address_normalized text not null check (char_length(btrim(wallet_address_normalized)) between 3 and 200),
  nonce text not null check (char_length(nonce) between 32 and 160),
  challenge_message text not null check (char_length(challenge_message) between 80 and 2000),
  expires_at timestamptz not null,
  used_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint wallet_verification_expiry_after_creation check (expires_at > created_at),
  constraint wallet_verification_verified_is_used check (verified_at is null or used_at is not null)
);

create index if not exists blockchain_wallet_challenges_user_idx
  on blockchain.wallet_verification_challenges(user_id,created_at desc);

create index if not exists blockchain_wallet_challenges_address_idx
  on blockchain.wallet_verification_challenges(chain_family,wallet_address_normalized,created_at desc);

alter table blockchain.wallet_verification_challenges enable row level security;
revoke all on table blockchain.wallet_verification_challenges from public,anon,authenticated;
grant all on table blockchain.wallet_verification_challenges to service_role;
grant usage,select on sequence blockchain.wallet_verification_challenges_id_seq to service_role;

create or replace function public.internal_create_wallet_verification_challenge(
  p_user_id uuid,
  p_public_id uuid,
  p_chain_family text,
  p_wallet_address text,
  p_wallet_address_normalized text,
  p_nonce text,
  p_challenge_message text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_family text:=upper(btrim(coalesce(p_chain_family,'')));
  v_address text:=btrim(coalesce(p_wallet_address,''));
  v_normalized text:=btrim(coalesce(p_wallet_address_normalized,''));
begin
  if p_user_id is null or p_public_id is null then
    raise exception 'Wallet verification identity is required' using errcode='22023';
  end if;
  if v_family not in ('EVM','SOLANA') then
    raise exception 'Unsupported wallet family' using errcode='22023';
  end if;
  if v_address='' or v_normalized='' then
    raise exception 'Wallet address is required' using errcode='22023';
  end if;
  if char_length(coalesce(p_nonce,''))<32 then
    raise exception 'Wallet challenge nonce is invalid' using errcode='22023';
  end if;
  if p_expires_at is null
     or p_expires_at<=statement_timestamp()
     or p_expires_at>statement_timestamp()+interval '10 minutes' then
    raise exception 'Wallet challenge expiry is invalid' using errcode='22023';
  end if;
  if position(p_user_id::text in p_challenge_message)=0
     or position(v_normalized in p_challenge_message)=0 then
    raise exception 'Wallet challenge message does not bind the account and wallet' using errcode='22023';
  end if;

  update blockchain.wallet_verification_challenges
  set used_at=coalesce(used_at,statement_timestamp())
  where user_id=p_user_id
    and chain_family=v_family
    and wallet_address_normalized=v_normalized
    and used_at is null;

  insert into blockchain.wallet_verification_challenges(
    public_id,user_id,chain_family,wallet_address,wallet_address_normalized,
    nonce,challenge_message,expires_at
  ) values(
    p_public_id,p_user_id,v_family,v_address,v_normalized,
    p_nonce,p_challenge_message,p_expires_at
  );

  return jsonb_build_object(
    'challengeId',p_public_id,
    'chainFamily',v_family,
    'walletAddress',v_address,
    'message',p_challenge_message,
    'expiresAt',p_expires_at
  );
end;
$$;

revoke all on function public.internal_create_wallet_verification_challenge(
  uuid,uuid,text,text,text,text,text,timestamptz
) from public,anon,authenticated;
grant execute on function public.internal_create_wallet_verification_challenge(
  uuid,uuid,text,text,text,text,text,timestamptz
) to service_role;

create or replace function public.internal_wallet_verification_challenge(
  p_user_id uuid,
  p_public_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_challenge blockchain.wallet_verification_challenges;
begin
  select * into v_challenge
  from blockchain.wallet_verification_challenges
  where public_id=p_public_id
    and user_id=p_user_id;

  if v_challenge.id is null then
    raise exception 'Wallet challenge not found' using errcode='P0002';
  end if;
  if v_challenge.used_at is not null then
    raise exception 'Wallet challenge has already been used' using errcode='P0001';
  end if;
  if v_challenge.expires_at<=statement_timestamp() then
    raise exception 'Wallet challenge has expired' using errcode='P0001';
  end if;

  return jsonb_build_object(
    'challengeId',v_challenge.public_id,
    'chainFamily',v_challenge.chain_family,
    'walletAddress',v_challenge.wallet_address,
    'walletAddressNormalized',v_challenge.wallet_address_normalized,
    'message',v_challenge.challenge_message,
    'expiresAt',v_challenge.expires_at
  );
end;
$$;

revoke all on function public.internal_wallet_verification_challenge(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.internal_wallet_verification_challenge(uuid,uuid)
  to service_role;

create or replace function public.internal_complete_wallet_verification(
  p_user_id uuid,
  p_challenge_public_id uuid,
  p_wallet_provider text,
  p_proof_method text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_challenge blockchain.wallet_verification_challenges;
  v_connection blockchain.wallet_connections;
  v_other_user uuid;
begin
  select * into v_challenge
  from blockchain.wallet_verification_challenges
  where public_id=p_challenge_public_id
    and user_id=p_user_id
  for update;

  if v_challenge.id is null then
    raise exception 'Wallet challenge not found' using errcode='P0002';
  end if;
  if v_challenge.used_at is not null then
    raise exception 'Wallet challenge has already been used' using errcode='P0001';
  end if;
  if v_challenge.expires_at<=statement_timestamp() then
    update blockchain.wallet_verification_challenges
    set used_at=statement_timestamp()
    where id=v_challenge.id;
    raise exception 'Wallet challenge has expired' using errcode='P0001';
  end if;

  select wc.user_id into v_other_user
  from blockchain.wallet_connections wc
  where wc.chain_family=v_challenge.chain_family
    and wc.wallet_address_normalized=v_challenge.wallet_address_normalized
    and wc.status='VERIFIED'
    and wc.user_id<>p_user_id
  limit 1;

  if v_other_user is not null then
    raise exception 'This wallet is already verified for another VAD account'
      using errcode='23505';
  end if;

  select * into v_connection
  from blockchain.wallet_connections
  where user_id=p_user_id
    and chain_family=v_challenge.chain_family
    and wallet_address_normalized=v_challenge.wallet_address_normalized
  order by id desc
  limit 1
  for update;

  if v_connection.id is null then
    insert into blockchain.wallet_connections(
      user_id,chain_family,wallet_provider,wallet_address,wallet_address_normalized,
      status,proof_method,verified_at,revoked_at,metadata
    ) values(
      p_user_id,v_challenge.chain_family,nullif(btrim(coalesce(p_wallet_provider,'')),''),
      v_challenge.wallet_address,v_challenge.wallet_address_normalized,
      'VERIFIED',nullif(btrim(coalesce(p_proof_method,'')),''),
      statement_timestamp(),null,
      jsonb_build_object('challenge_id',v_challenge.public_id)
    )
    returning * into v_connection;
  else
    update blockchain.wallet_connections
    set wallet_provider=nullif(btrim(coalesce(p_wallet_provider,'')),''),
        wallet_address=v_challenge.wallet_address,
        status='VERIFIED',
        proof_method=nullif(btrim(coalesce(p_proof_method,'')),''),
        verified_at=statement_timestamp(),
        revoked_at=null,
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('challenge_id',v_challenge.public_id),
        updated_at=statement_timestamp()
    where id=v_connection.id
    returning * into v_connection;
  end if;

  update blockchain.wallet_verification_challenges
  set used_at=statement_timestamp(),
      verified_at=statement_timestamp()
  where id=v_challenge.id;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    p_user_id,'USER','CRYPTO_WALLET_VERIFIED','BLOCKCHAIN_WALLET',
    v_connection.public_id::text,'User proved control of an external wallet',
    jsonb_build_object(
      'chain_family',v_connection.chain_family,
      'wallet_address',v_connection.wallet_address,
      'proof_method',v_connection.proof_method
    )
  );

  insert into eventing.domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values(
    'CRYPTO_WALLET_VERIFIED','BLOCKCHAIN_WALLET',v_connection.public_id::text,
    jsonb_build_object(
      'user_id',p_user_id,
      'chain_family',v_connection.chain_family,
      'wallet_address',v_connection.wallet_address
    ),
    'crypto-wallet-verified:'||v_challenge.public_id::text
  )
  on conflict(idempotency_key) do nothing;

  return jsonb_build_object(
    'walletId',v_connection.public_id,
    'chainFamily',v_connection.chain_family,
    'walletAddress',v_connection.wallet_address,
    'walletProvider',v_connection.wallet_provider,
    'status',v_connection.status,
    'verifiedAt',v_connection.verified_at
  );
end;
$$;

revoke all on function public.internal_complete_wallet_verification(uuid,uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.internal_complete_wallet_verification(uuid,uuid,text,text)
  to service_role;

create or replace function public.my_wallet_connections()
returns table(
  wallet_id uuid,
  chain_family text,
  wallet_provider text,
  wallet_address text,
  status text,
  proof_method text,
  verified_at timestamptz,
  revoked_at timestamptz,
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
    raise exception 'Sign in to view wallets' using errcode='42501';
  end if;

  return query
  select
    wc.public_id,wc.chain_family,wc.wallet_provider,wc.wallet_address,
    wc.status,wc.proof_method,wc.verified_at,wc.revoked_at,wc.created_at,wc.updated_at
  from blockchain.wallet_connections wc
  where wc.user_id=auth.uid()
  order by wc.updated_at desc,wc.id desc;
end;
$$;

revoke all on function public.my_wallet_connections() from public,anon;
grant execute on function public.my_wallet_connections() to authenticated;

create or replace function public.revoke_my_wallet_connection(p_wallet_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_wallet blockchain.wallet_connections;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage wallets' using errcode='42501';
  end if;

  select * into v_wallet
  from blockchain.wallet_connections
  where public_id=p_wallet_id
    and user_id=auth.uid()
  for update;

  if v_wallet.id is null then
    raise exception 'Wallet connection not found' using errcode='P0002';
  end if;

  if v_wallet.status='REVOKED' then
    return true;
  end if;

  update blockchain.wallet_connections
  set status='REVOKED',
      revoked_at=statement_timestamp(),
      updated_at=statement_timestamp()
  where id=v_wallet.id;

  insert into audit.records(
    actor_user_id,actor_type,action,resource_type,resource_id,reason,metadata
  ) values(
    auth.uid(),'USER','CRYPTO_WALLET_REVOKED','BLOCKCHAIN_WALLET',
    v_wallet.public_id::text,'User disconnected an external wallet',
    jsonb_build_object('chain_family',v_wallet.chain_family,'wallet_address',v_wallet.wallet_address)
  );

  insert into eventing.domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values(
    'CRYPTO_WALLET_REVOKED','BLOCKCHAIN_WALLET',v_wallet.public_id::text,
    jsonb_build_object(
      'user_id',auth.uid(),
      'chain_family',v_wallet.chain_family,
      'wallet_address',v_wallet.wallet_address
    ),
    'crypto-wallet-revoked:'||v_wallet.public_id::text||':'||extract(epoch from statement_timestamp())::bigint::text
  );

  return true;
end;
$$;

revoke all on function public.revoke_my_wallet_connection(uuid) from public,anon;
grant execute on function public.revoke_my_wallet_connection(uuid) to authenticated;

commit;