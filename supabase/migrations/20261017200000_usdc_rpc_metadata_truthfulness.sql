-- Keep RPC metadata truthful: these are public endpoints, not secret-backed URLs.
update blockchain.chains
set metadata = (coalesce(metadata, '{}'::jsonb) - 'rpc_url_configured_by_secret')
  || jsonb_build_object(
    'rpc_url_configured_by_secret', false,
    'rpc_url_public', true
  ),
  updated_at = statement_timestamp()
where code = 'ARC';
