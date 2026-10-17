import { getWalletAccounts } from '@dynamic-labs-sdk/client';
import { getWalletProviderFromWalletAccount } from '@dynamic-labs-sdk/client/core';
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem';
import { assertPositionLockAuthorization, assertSettlementAuthorization, parseAtomicAmount, type OnchainPositionLockAuthorization, type OnchainSettlementAuthorization } from '@vad/chain-core';
import { encodeFunctionData, isAddress, isHex, type Address, type Hex } from 'viem';
import { dynamicClient, initializeDynamicWalletClient } from '@/lib/dynamic-client.web';

const erc20Abi = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const;
const settlementAbi = [
  { type: 'function', name: 'lockPosition', stateMutability: 'nonpayable', inputs: [{ name: 'authorization', type: 'tuple', components: [{ name: 'authorizationId', type: 'bytes32' }, { name: 'positionId', type: 'bytes32' }, { name: 'marketId', type: 'bytes32' }, { name: 'outcomeId', type: 'bytes32' }, { name: 'user', type: 'address' }, { name: 'collateralAmount', type: 'uint256' }, { name: 'tradingFeeAmount', type: 'uint256' }, { name: 'tradingFeePolicyVersion', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] }, { name: 'signature', type: 'bytes' }], outputs: [] },
  { type: 'function', name: 'settlePosition', stateMutability: 'nonpayable', inputs: [{ name: 'authorization', type: 'tuple', components: [{ name: 'authorizationId', type: 'bytes32' }, { name: 'positionId', type: 'bytes32' }, { name: 'marketId', type: 'bytes32' }, { name: 'user', type: 'address' }, { name: 'grossPayout', type: 'uint256' }, { name: 'settlementFeeAmount', type: 'uint256' }, { name: 'settlementFeePolicyVersion', type: 'uint256' }, { name: 'resolutionHash', type: 'bytes32' }, { name: 'deadline', type: 'uint256' }] }, { name: 'signature', type: 'bytes' }], outputs: [] },
] as const;

export type EvmSettlementNetwork = { chainCode: string; networkId: string; contractAddress: string; settlementTokenAddress: string };
export type EvmLockExecution = { network: EvmSettlementNetwork; authorization: OnchainPositionLockAuthorization; vadSignature: string; approvalRequired: boolean };
export type EvmSettlementExecution = { network: EvmSettlementNetwork; authorization: OnchainSettlementAuthorization; vadSignature: string };
export type SolanaPreparedExecution = { chainCode: string; networkId: string; programId: string; userAddress: string; vadSignerAddress: string; serializedTransactionBase64: string };

export async function submitEvmPositionLock(execution: EvmLockExecution) {
  assertPositionLockAuthorization(execution.authorization);
  const contractAddress = asAddress(execution.network.contractAddress, 'VAD settlement contract');
  const tokenAddress = asAddress(execution.network.settlementTokenAddress, 'USDC token');
  const userAddress = asAddress(execution.authorization.userAddress, 'wallet');
  const signature = asHex(execution.vadSignature, 'VAD quote signature');
  const wallet = await getEvmWallet(execution.network.networkId);
  if (wallet.account.address.toLowerCase() !== userAddress.toLowerCase()) throw new Error('The active Dynamic wallet does not match this VAD authorization.');
  const collateral = parseAtomicAmount(execution.authorization.collateralAmountAtomic);
  const fee = parseAtomicAmount(execution.authorization.tradingFee.amountAtomic);
  let approvalTransactionHash: Hex | null = null;
  if (execution.approvalRequired) {
    const approvalData = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [contractAddress, collateral + fee] });
    approvalTransactionHash = await wallet.client.sendTransaction({ account: wallet.client.account, chain: wallet.client.chain, to: tokenAddress, data: approvalData, value: 0n });
    if (wallet.provider.confirmTransaction) await wallet.provider.confirmTransaction({ transactionHash: approvalTransactionHash, walletAccount: wallet.account });
  }
  const data = encodeFunctionData({ abi: settlementAbi, functionName: 'lockPosition', args: [{ authorizationId: asBytes32(execution.authorization.authorizationId, 'authorizationId'), positionId: asBytes32(execution.authorization.positionId, 'positionId'), marketId: asBytes32(execution.authorization.marketId, 'marketId'), outcomeId: asBytes32(execution.authorization.outcomeId, 'outcomeId'), user: userAddress, collateralAmount: collateral, tradingFeeAmount: fee, tradingFeePolicyVersion: BigInt(execution.authorization.tradingFee.policyVersionId || '0'), deadline: BigInt(execution.authorization.deadlineUnix) }, signature] });
  const transactionHash = await wallet.client.sendTransaction({ account: wallet.client.account, chain: wallet.client.chain, to: contractAddress, data, value: 0n });
  return { chainCode: execution.network.chainCode, approvalTransactionHash, transactionHash };
}

export async function submitEvmSettlement(execution: EvmSettlementExecution) {
  assertSettlementAuthorization(execution.authorization);
  const contractAddress = asAddress(execution.network.contractAddress, 'VAD settlement contract');
  const userAddress = asAddress(execution.authorization.userAddress, 'wallet');
  const signature = asHex(execution.vadSignature, 'VAD settlement signature');
  const wallet = await getEvmWallet(execution.network.networkId);
  if (wallet.account.address.toLowerCase() !== userAddress.toLowerCase()) throw new Error('The active Dynamic wallet does not match this VAD settlement authorization.');
  const data = encodeFunctionData({ abi: settlementAbi, functionName: 'settlePosition', args: [{ authorizationId: asBytes32(execution.authorization.authorizationId, 'authorizationId'), positionId: asBytes32(execution.authorization.positionId, 'positionId'), marketId: asBytes32(execution.authorization.marketId, 'marketId'), user: userAddress, grossPayout: parseAtomicAmount(execution.authorization.grossPayoutAtomic), settlementFeeAmount: parseAtomicAmount(execution.authorization.settlementFee.amountAtomic), settlementFeePolicyVersion: BigInt(execution.authorization.settlementFee.policyVersionId || '0'), resolutionHash: asBytes32(execution.authorization.resolutionHash, 'resolutionHash'), deadline: BigInt(execution.authorization.deadlineUnix) }, signature] });
  const transactionHash = await wallet.client.sendTransaction({ account: wallet.client.account, chain: wallet.client.chain, to: contractAddress, data, value: 0n });
  return { chainCode: execution.network.chainCode, transactionHash };
}

export async function submitSolanaPreparedSettlement(_execution: SolanaPreparedExecution): Promise<never> {
  throw new Error('Solana settlement signing is not enabled in the web app.');
}

async function getEvmWallet(networkId: string) {
  await initializeDynamicWalletClient();
  if (!dynamicClient) throw new Error('Dynamic wallet is not configured.');
  const account = getWalletAccounts(dynamicClient).find((candidate) => candidate.chain === 'EVM');
  if (!account || account.chain !== 'EVM') throw new Error('A Dynamic EVM embedded wallet is required.');
  const provider = getWalletProviderFromWalletAccount({ walletAccount: account }, dynamicClient);
  const activeNetwork = await provider.getActiveNetworkId();
  if (String(activeNetwork.networkId) !== networkId) {
    if (!provider.switchActiveNetwork) throw new Error('This wallet cannot switch to the required EVM network.');
    await provider.switchActiveNetwork({ networkId });
  }
  const client = await createWalletClientForWalletAccount({ walletAccount: account }, dynamicClient);
  return { account, provider, client };
}
function asAddress(value: string, label: string): Address { if (!isAddress(value)) throw new Error(`${label} address is invalid.`); return value; }
function asHex(value: string, label: string): Hex { if (!isHex(value)) throw new Error(`${label} must be hex encoded.`); return value; }
function asBytes32(value: string, label: string): Hex { if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error(`${label} must be bytes32.`); return value as Hex; }
