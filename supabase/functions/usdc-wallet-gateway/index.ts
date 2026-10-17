import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  parseAbi,
} from 'npm:viem@2.56.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

type ChainRow = {
  id: number;
  code: string;
  name: string;
  evm_chain_id: number;
  native_symbol: string;
  explorer_url: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
};
type WalletRow = {
  wallet_address: string;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization') ?? '';
  const token = authorization.replace(/^Bearer\\s+/i, '');
  if (!url || !serviceKey || !token) return json({ error: 'AUTH_REQUIRED' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: 'AUTH_INVALID' }, 401);

  let body: { action?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'INVALID_REQUEST' }, 400);
  }
  if (body.action !== 'balances') return json({ error: 'UNSUPPORTED_ACTION' }, 400);

  try {
    const [{ data: wallets, error: walletError }, { data: chains, error: chainError }, { data: asset, error: assetError }] = await Promise.all([
      admin.schema('blockchain').from('wallet_connections')
        .select('wallet_address')
        .eq('user_id', authData.user.id)
        .eq('chain_family', 'EVM')
        .eq('status', 'VERIFIED')
        .limit(10),
      admin.schema('blockchain').from('chains')
        .select('id,code,name,evm_chain_id,native_symbol,explorer_url,status,metadata')
        .in('code', ['ARC', 'POLYGON']),
      admin.from('assets').select('id').eq('code', 'USDC').maybeSingle(),
    ]);
    if (walletError || chainError || assetError || !asset?.id) {
      return json({ error: 'USDC_NETWORK_CONFIGURATION_UNAVAILABLE' }, 503);
    }

    const uniqueWallets = [...new Set(((wallets ?? []) as WalletRow[])
      .map((row) => String(row.wallet_address ?? '').trim())
      .filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address)))].slice(0, 10);
    if (!uniqueWallets.length) return json({ ok: true, wallets: [], networks: [] });

    const { data: representations, error: representationError } = await admin.schema('blockchain')
      .from('asset_representations')
      .select('chain_id,asset_id,token_address,decimals,status')
      .eq('asset_id', asset.id)
      .in('chain_id', ((chains ?? []) as ChainRow[]).map((chain) => chain.id));
    const { data: deployments, error: deploymentError } = await admin.schema('blockchain')
      .from('contract_deployments')
      .select('chain_id,status,protocol_key,protocol_version')
      .eq('protocol_key', 'VAD_SETTLEMENT_V1')
      .eq('protocol_version', 1)
      .in('chain_id', ((chains ?? []) as ChainRow[]).map((chain) => chain.id));
    if (representationError || deploymentError) return json({ error: 'USDC_NETWORK_CONFIGURATION_UNAVAILABLE' }, 503);

    const networks = await Promise.all(((chains ?? []) as ChainRow[]).map(async (chain) => {
      const metadata = chain.metadata ?? {};
      const rpcUrl = typeof metadata.rpc_url === 'string' ? metadata.rpc_url : '';
      const representation = (representations ?? []).find((row: any) => row.chain_id === chain.id);
      const hasDeployment = (deployments ?? []).some((row: any) =>
        row.chain_id === chain.id && row.status === 'ACTIVE');
      const ready = chain.status === 'ACTIVE' && representation?.status === 'ACTIVE' && hasDeployment;
      const base = {
        chainCode: chain.code,
        chainName: chain.name,
        chainId: Number(chain.evm_chain_id),
        nativeSymbol: chain.native_symbol,
        explorerUrl: chain.explorer_url,
        tradingReady: ready,
        tokenAddress: typeof representation?.token_address === 'string' ? representation.token_address : null,
      };
      if (!rpcUrl.startsWith('https://') || !/^0x[0-9a-fA-F]{40}$/.test(String(representation?.token_address ?? ''))) {
        return { ...base, balances: [], readStatus: 'NOT_CONFIGURED' as const };
      }

      const clientChain = defineChain({
        id: Number(chain.evm_chain_id),
        name: chain.name,
        nativeCurrency: {
          name: chain.code === 'ARC' ? 'USDC' : chain.native_symbol,
          symbol: chain.native_symbol,
          decimals: Number(metadata.native_gas_decimals ?? 18),
        },
        rpcUrls: { default: { http: [rpcUrl] } },
        blockExplorers: chain.explorer_url
          ? { default: { name: chain.name + ' Explorer', url: chain.explorer_url } }
          : undefined,
      });
      const client = createPublicClient({ chain: clientChain, transport: http(rpcUrl, { timeout: 8000, retryCount: 1 }) });
      const balances = await Promise.all(uniqueWallets.map(async (walletAddress) => {
        try {
          const [tokenBalance, nativeBalance] = await Promise.all([
            client.readContract({
              address: representation.token_address as `0x${string}`,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [walletAddress as `0x${string}`],
            }),
            client.getBalance({ address: walletAddress as `0x${string}` }),
          ]);
          const decimals = Number(representation.decimals ?? 6);
          const nativeDecimals = Number(metadata.native_gas_decimals ?? 18);
          return {
            walletAddress,
            balance: formatUnits(tokenBalance, decimals),
            tokenDecimals: decimals,
            gasReady: nativeBalance > 0n,
            gasBalance: chain.code === 'ARC' ? null : formatUnits(nativeBalance, nativeDecimals),
            gasSymbol: chain.code === 'ARC' ? 'USDC' : chain.native_symbol,
          };
        } catch {
          return { walletAddress, balance: null, tokenDecimals: Number(representation.decimals ?? 6), gasReady: false, gasBalance: null, gasSymbol: chain.native_symbol, readError: 'RPC_UNAVAILABLE' };
        }
      }));
      return { ...base, balances, readStatus: 'OK' as const };
    }));

    return json({ ok: true, wallets: uniqueWallets, networks });
  } catch {
    return json({ error: 'USDC_BALANCE_LOOKUP_FAILED' }, 503);
  }
});
