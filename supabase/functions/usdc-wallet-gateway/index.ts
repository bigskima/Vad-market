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
const erc20Abi = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

type NetworkConfig = {
  id: number;
  code: string;
  name: string;
  evm_chain_id: number;
  native_symbol: string;
  explorer_url: string | null;
  status: string;
  metadata: Record<string, unknown> | null;
  token_address: string | null;
  token_decimals: number | null;
  representation_status: string | null;
  settlement_ready: boolean;
  venue_ready: boolean;
  jurisdiction_ready: boolean;
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
    const { data, error } = await admin.rpc('internal_usdc_wallet_balance_config', {
      p_user_id: authData.user.id,
    });
    if (error || !data || typeof data !== 'object') {
      return json({ error: 'USDC_NETWORK_CONFIGURATION_UNAVAILABLE' }, 503);
    }

    const config = data as { wallets?: unknown; networks?: unknown };
    const wallets = [...new Set((Array.isArray(config.wallets) ? config.wallets : [])
      .map((value) => String(value ?? '').trim())
      .filter((address) => /^0x[0-9a-fA-F]{40}$/.test(address)))].slice(0, 10);
    const networks = (Array.isArray(config.networks) ? config.networks : []) as NetworkConfig[];
    if (!wallets.length) return json({ ok: true, wallets: [], networks: [] });

    const results = await Promise.all(networks.map(async (network) => {
      const metadata = network.metadata ?? {};
      const rpcUrl = typeof metadata.rpc_url === 'string' ? metadata.rpc_url : '';
      const tokenAddress = String(network.token_address ?? '');
      const tokenDecimals = Number(network.token_decimals ?? 6);
      const base = {
        chainCode: network.code,
        chainName: network.name,
        chainId: Number(network.evm_chain_id),
        nativeSymbol: network.native_symbol,
        explorerUrl: network.explorer_url,
        tradingReady: network.status === 'ACTIVE'
          && network.representation_status === 'ACTIVE'
          && network.settlement_ready
          && network.venue_ready
          && network.jurisdiction_ready,
        tokenAddress: /^0x[0-9a-fA-F]{40}$/.test(tokenAddress) ? tokenAddress : null,
      };

      if (
        !rpcUrl.startsWith('https://') ||
        !Number.isSafeInteger(Number(network.evm_chain_id)) ||
        !/^0x[0-9a-fA-F]{40}$/.test(tokenAddress) ||
        !Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18
      ) {
        return { ...base, balances: [], readStatus: 'NOT_CONFIGURED' as const };
      }

      try {
        const nativeDecimals = Number(metadata.native_gas_decimals ?? 18);
        const clientChain = defineChain({
          id: Number(network.evm_chain_id),
          name: network.name,
          nativeCurrency: {
            name: network.code === 'ARC' ? 'USDC' : network.native_symbol,
            symbol: network.native_symbol,
            decimals: nativeDecimals,
          },
          rpcUrls: { default: { http: [rpcUrl] } },
          blockExplorers: network.explorer_url
            ? { default: { name: network.name + ' Explorer', url: network.explorer_url } }
            : undefined,
        });
        const client = createPublicClient({
          chain: clientChain,
          transport: http(rpcUrl, { timeout: 8000, retryCount: 1 }),
        });

        const balances = await Promise.all(wallets.map(async (walletAddress) => {
          try {
            const [tokenBalance, nativeBalance] = await Promise.all([
              client.readContract({
                address: tokenAddress as `0x${string}`,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [walletAddress as `0x${string}`],
              }),
              client.getBalance({ address: walletAddress as `0x${string}` }),
            ]);
            return {
              walletAddress,
              balance: formatUnits(tokenBalance, tokenDecimals),
              tokenDecimals,
              gasReady: nativeBalance > 0n,
              // Arc exposes the same USDC asset as native gas and an ERC-20 interface.
              // Do not add those two representations or display them as separate balances.
              gasBalance: network.code === 'ARC' ? null : formatUnits(nativeBalance, nativeDecimals),
              gasSymbol: network.code === 'ARC' ? 'USDC' : network.native_symbol,
            };
          } catch {
            return {
              walletAddress,
              balance: null,
              tokenDecimals,
              gasReady: false,
              gasBalance: null,
              gasSymbol: network.native_symbol,
              readError: 'RPC_UNAVAILABLE',
            };
          }
        }));
        const allReadsFailed = balances.every((balance) => balance.balance === null);
        return { ...base, balances, readStatus: allReadsFailed ? 'RPC_UNAVAILABLE' as const : 'OK' as const };
      } catch {
        return { ...base, balances: [], readStatus: 'RPC_UNAVAILABLE' as const };
      }
    }));

    return json({ ok: true, wallets, networks: results });
  } catch {
    return json({ error: 'USDC_BALANCE_LOOKUP_FAILED' }, 503);
  }
});
