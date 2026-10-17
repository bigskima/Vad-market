import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { createPublicClient, defineChain, formatUnits, http, parseAbi } from 'viem';

import { VadText } from '@/components/ui/vad-text';
import { getCryptoNetworks } from '@/services/crypto-api';

const erc20Abi = parseAbi(['function balanceOf(address owner) view returns (uint256)']);

export function CryptoWalletBalance({ walletAddress, chainFamily }: { walletAddress: string; chainFamily: string }) {
  const [label, setLabel] = useState('Checking USDC network…');
  const [balance, setBalance] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (chainFamily !== 'EVM' || !/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
        setLabel('USDC balance is available for EVM wallets.');
        return;
      }
      try {
        const networks = await getCryptoNetworks();
        const network = networks.find((row) => row.asset_code === 'USDC' && row.chain_family === 'EVM' && row.evm_chain_id != null);
        if (!network) {
          if (active) {
            setBalance(null);
            setExplorerUrl(null);
            setLabel('USDC network is not active for this account yet.');
          }
          return;
        }
        const chainId = Number(network.evm_chain_id);
        if (!Number.isSafeInteger(chainId) || chainId <= 0 || !network.rpc_url || !network.token_address) {
          throw new Error('Active USDC network configuration is incomplete.');
        }
        const chain = defineChain({
          id: chainId,
          name: network.chain_name,
          nativeCurrency: { name: 'USDC', symbol: network.native_symbol, decimals: 18 },
          rpcUrls: { default: { http: [network.rpc_url] } },
          blockExplorers: network.explorer_url ? { default: { name: network.chain_name, url: network.explorer_url } } : undefined,
        });
        const client = createPublicClient({ chain, transport: http(network.rpc_url, { timeout: 10_000 }) });
        const raw = await client.readContract({
          address: network.token_address as `0x${string}`,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [walletAddress as `0x${string}`],
        });
        if (active) {
          setBalance(formatUnits(raw, network.token_decimals));
          setExplorerUrl(network.explorer_url);
          setLabel(network.chain_name);
        }
      } catch {
        if (active) {
          setBalance(null);
          setExplorerUrl(null);
          setLabel('USDC balance is temporarily unavailable.');
        }
      }
    })();
    return () => { active = false; };
  }, [walletAddress, chainFamily]);

  return (
    <View style={{ gap: 2 }}>
      <VadText variant="caption" tone="secondary">
        {balance == null ? label : `${label} · ${Number(balance).toLocaleString(undefined, { maximumFractionDigits: 6 })} USDC`}
      </VadText>
      {balance != null && explorerUrl ? (
        <VadText variant="caption" tone="tertiary">Live on-chain token balance · {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</VadText>
      ) : null}
    </View>
  );
}
