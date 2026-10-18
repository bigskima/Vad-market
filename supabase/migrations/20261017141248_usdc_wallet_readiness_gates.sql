-- Make wallet network readiness reflect every database-controlled launch gate.
create or replace function public.internal_usdc_wallet_balance_config(p_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'wallets', coalesce((
      select jsonb_agg(distinct wc.wallet_address)
      from blockchain.wallet_connections wc
      where wc.user_id = p_user_id
        and wc.chain_family = 'EVM'
        and wc.status = 'VERIFIED'
        and wc.wallet_address ~* '^0x[0-9a-f]{40}$'
    ), '[]'::jsonb),
    'networks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'name', c.name,
        'evm_chain_id', c.evm_chain_id,
        'native_symbol', c.native_symbol,
        'explorer_url', c.explorer_url,
        'status', c.status,
        'metadata', c.metadata,
        'token_address', ar.token_address,
        'token_decimals', ar.decimals,
        'representation_status', ar.status,
        'settlement_ready', exists (
          select 1
          from blockchain.contract_deployments cd
          where cd.chain_id = c.id
            and cd.protocol_key = 'VAD_SETTLEMENT_V1'
            and cd.protocol_version = 1
            and cd.status = 'ACTIVE'
        ),
        'venue_ready', exists (
          select 1
          from market.instrument_venues iv
          where iv.chain_id = c.id
            and iv.settlement_type = 'ONCHAIN'
            and iv.status = 'ACTIVE'
        ),
        'jurisdiction_ready', exists (
          select 1
          from public.user_accounts ua
          join public.jurisdictions j
            on j.country_code = ua.country_code and j.status = 'ACTIVE'
          join blockchain.jurisdiction_chains jc
            on jc.jurisdiction_id = j.id
           and jc.chain_id = c.id
           and jc.status = 'ACTIVE'
          where ua.user_id = p_user_id and ua.status = 'ACTIVE'
        )
      ) order by c.code)
      from blockchain.chains c
      join public.assets a on a.code = 'USDC'
      left join blockchain.asset_representations ar
        on ar.chain_id = c.id and ar.asset_id = a.id
      where c.code in ('ARC', 'POLYGON')
    ), '[]'::jsonb)
  );
$function$;

revoke all on function public.internal_usdc_wallet_balance_config(uuid) from public, anon, authenticated;
grant execute on function public.internal_usdc_wallet_balance_config(uuid) to service_role;
