begin;

create or replace function public.internal_wallet_connections(p_user_id uuid)
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
language sql
stable
security definer
set search_path=''
as $$
  select
    wc.public_id,wc.chain_family,wc.wallet_provider,wc.wallet_address,
    wc.status,wc.proof_method,wc.verified_at,wc.revoked_at,wc.created_at,wc.updated_at
  from blockchain.wallet_connections wc
  where wc.user_id=p_user_id
  order by wc.updated_at desc,wc.id desc;
$$;

revoke all on function public.internal_wallet_connections(uuid) from public,anon,authenticated;
grant execute on function public.internal_wallet_connections(uuid) to service_role;

create or replace function public.internal_revoke_wallet_connection(
  p_user_id uuid,
  p_wallet_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_wallet blockchain.wallet_connections;
begin
  if p_user_id is null or p_wallet_id is null then
    raise exception 'Wallet identity is required' using errcode='22023';
  end if;

  select * into v_wallet
  from blockchain.wallet_connections
  where public_id=p_wallet_id
    and user_id=p_user_id
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
    p_user_id,'USER','CRYPTO_WALLET_REVOKED','BLOCKCHAIN_WALLET',
    v_wallet.public_id::text,'User disconnected an external wallet',
    jsonb_build_object('chain_family',v_wallet.chain_family,'wallet_address',v_wallet.wallet_address)
  );

  insert into eventing.domain_events(
    event_type,aggregate_type,aggregate_id,payload,idempotency_key
  ) values(
    'CRYPTO_WALLET_REVOKED','BLOCKCHAIN_WALLET',v_wallet.public_id::text,
    jsonb_build_object(
      'user_id',p_user_id,
      'chain_family',v_wallet.chain_family,
      'wallet_address',v_wallet.wallet_address
    ),
    'crypto-wallet-revoked:'||v_wallet.public_id::text||':'||extract(epoch from statement_timestamp())::bigint::text
  );

  return true;
end;
$$;

revoke all on function public.internal_revoke_wallet_connection(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.internal_revoke_wallet_connection(uuid,uuid)
  to service_role;

commit;
