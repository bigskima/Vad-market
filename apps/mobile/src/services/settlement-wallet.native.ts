import {
  getWalletAccounts,
} from '@dynamic-labs-sdk/client';
import { getWalletProviderFromWalletAccount } from '@dynamic-labs-sdk/client/core';
import { createWalletClientForWalletAccount } from '@dynamic-labs-sdk/evm/viem';
import { signAndSendTransaction } from '@dynamic-labs-sdk/solana';
import {
  assertPositionLockAuthorization,
  assertSettlementAuthorization,
  parseAtomicAmount,
  type OnchainPositionLockAuthorization,
  type OnchainSettlementAuthorization,
} from '@vad/chain-core';
import { Buffer } from 'buffer';
import {
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  encodeFunctionData,
  isAddress,
  isHex,
  type Address,
  type Hex,
} from 'viem';

import {
  dynamicClient,
  initializeDynamicWalletClient,
} from '@/lib/dynamic-client.native';

const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const settlementAbi = [
  {
    type: 'function',
    name: 'lockPosition',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'authorization',
        type: 'tuple',
        components: [
          { name: 'authorizationId', type: 'bytes32' },
          { name: 'positionId', type: 'bytes32' },
          { name: 'marketId', type: 'bytes32' },
          { name: 'outcomeId', type: 'bytes32' },
          { name: 'user', type: 'address' },
          { name: 'collateralAmount', type: 'uint256' },
          { name: 'tradingFeeAmount', type: 'uint256' },
          { name: 'tradingFeePolicyVersion', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'settlePosition',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'authorization',
        type: 'tuple',
        components: [
          { name: 'authorizationId', type: 'bytes32' },
          { name: 'positionId', type: 'bytes32' },
          { name: 'marketId', type: 'bytes32' },
          { name: 'user', type: 'address' },
          { name: 'grossPayout', type: 'uint256' },
          { name: 'settlementFeeAmount', type: 'uint256' },
          { name: 'settlementFeePolicyVersion', type: 'uint256' },
          { name: 'resolutionHash', type: 'bytes32' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export type EvmSettlementNetwork = {
  chainCode: string;
  networkId: string;
  contractAddress: string;
  settlementTokenAddress: string;
};

export type EvmLockExecution = {
  network: EvmSettlementNetwork;
  authorization: OnchainPositionLockAuthorization;
  vadSignature: string;
  approvalRequired: boolean;
};

export type EvmSettlementExecution = {
  network: EvmSettlementNetwork;
  authorization: OnchainSettlementAuthorization;
  vadSignature: string;
};

export type SolanaPreparedExecution = {
  chainCode: string;
  networkId: string;
  programId: string;
  userAddress: string;
  vadSignerAddress: string;
  serializedTransactionBase64: string;
};

export async function submitEvmPositionLock(
  execution: EvmLockExecution,
) {
  assertPositionLockAuthorization(execution.authorization);
  const contractAddress = asAddress(execution.network.contractAddress, 'VAD settlement contract');
  const settlementTokenAddress = asAddress(
    execution.network.settlementTokenAddress,
    'USDC token',
  );
  const userAddress = asAddress(execution.authorization.userAddress, 'wallet');
  const signature = asHex(execution.vadSignature, 'VAD quote signature');
  const wallet = await getEvmWallet(execution.network.networkId);

  if (wallet.account.address.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error('The active Dynamic wallet does not match this VAD authorization.');
  }

  const collateralAmount = parseAtomicAmount(
    execution.authorization.collateralAmountAtomic,
  );
  const tradingFeeAmount = parseAtomicAmount(
    execution.authorization.tradingFee.amountAtomic,
  );

  let approvalTransactionHash: Hex | null = null;
  if (execution.approvalRequired) {
    const approvalData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [contractAddress, collateralAmount + tradingFeeAmount],
    });

    approvalTransactionHash = await wallet.client.sendTransaction({
      account: wallet.client.account,
      chain: wallet.client.chain,
      to: settlementTokenAddress,
      data: approvalData,
      value: 0n,
    });

    if (wallet.provider.confirmTransaction) {
      await wallet.provider.confirmTransaction({
        transactionHash: approvalTransactionHash,
        walletAccount: wallet.account,
      });
    }
  }

  const data = encodeFunctionData({
    abi: settlementAbi,
    functionName: 'lockPosition',
    args: [
      {
        authorizationId: asBytes32(execution.authorization.authorizationId, 'authorizationId'),
        positionId: asBytes32(execution.authorization.positionId, 'positionId'),
        marketId: asBytes32(execution.authorization.marketId, 'marketId'),
        outcomeId: asBytes32(execution.authorization.outcomeId, 'outcomeId'),
        user: userAddress,
        collateralAmount,
        tradingFeeAmount,
        tradingFeePolicyVersion: BigInt(
          execution.authorization.tradingFee.policyVersionId || '0',
        ),
        deadline: BigInt(execution.authorization.deadlineUnix),
      },
      signature,
    ],
  });

  const transactionHash = await wallet.client.sendTransaction({
    account: wallet.client.account,
    chain: wallet.client.chain,
    to: contractAddress,
    data,
    value: 0n,
  });

  return {
    chainCode: execution.network.chainCode,
    approvalTransactionHash,
    transactionHash,
  };
}

export async function submitEvmSettlement(
  execution: EvmSettlementExecution,
) {
  assertSettlementAuthorization(execution.authorization);
  const contractAddress = asAddress(execution.network.contractAddress, 'VAD settlement contract');
  const userAddress = asAddress(execution.authorization.userAddress, 'wallet');
  const signature = asHex(execution.vadSignature, 'VAD settlement signature');
  const wallet = await getEvmWallet(execution.network.networkId);

  if (wallet.account.address.toLowerCase() !== userAddress.toLowerCase()) {
    throw new Error('The active Dynamic wallet does not match this VAD settlement authorization.');
  }

  const data = encodeFunctionData({
    abi: settlementAbi,
    functionName: 'settlePosition',
    args: [
      {
        authorizationId: asBytes32(execution.authorization.authorizationId, 'authorizationId'),
        positionId: asBytes32(execution.authorization.positionId, 'positionId'),
        marketId: asBytes32(execution.authorization.marketId, 'marketId'),
        user: userAddress,
        grossPayout: parseAtomicAmount(execution.authorization.grossPayoutAtomic),
        settlementFeeAmount: parseAtomicAmount(
          execution.authorization.settlementFee.amountAtomic,
        ),
        settlementFeePolicyVersion: BigInt(
          execution.authorization.settlementFee.policyVersionId || '0',
        ),
        resolutionHash: asBytes32(execution.authorization.resolutionHash, 'resolutionHash'),
        deadline: BigInt(execution.authorization.deadlineUnix),
      },
      signature,
    ],
  });

  const transactionHash = await wallet.client.sendTransaction({
    account: wallet.client.account,
    chain: wallet.client.chain,
    to: contractAddress,
    data,
    value: 0n,
  });

  return {
    chainCode: execution.network.chainCode,
    transactionHash,
  };
}

export async function submitSolanaPreparedSettlement(
  execution: SolanaPreparedExecution,
) {
  await initializeDynamicWalletClient();
  if (!dynamicClient) throw new Error('Dynamic wallet is not configured.');

  const account = getWalletAccounts(dynamicClient).find(
    (candidate) => candidate.chain === 'SOL',
  );
  if (!account || account.chain !== 'SOL') {
    throw new Error('A Dynamic Solana embedded wallet is required.');
  }

  const expectedUser = new PublicKey(execution.userAddress);
  if (account.address !== expectedUser.toBase58()) {
    throw new Error('The active Dynamic Solana wallet does not match this VAD authorization.');
  }

  const provider = getWalletProviderFromWalletAccount(
    { walletAccount: account },
    dynamicClient,
  );
  const activeNetwork = await provider.getActiveNetworkId();
  if (String(activeNetwork.networkId) !== execution.networkId) {
    if (!provider.switchActiveNetwork) {
      throw new Error('This wallet cannot switch to the required Solana network.');
    }
    await provider.switchActiveNetwork({ networkId: execution.networkId });
  }

  const transaction = VersionedTransaction.deserialize(
    Buffer.from(execution.serializedTransactionBase64, 'base64'),
  );
  assertPreparedSolanaTransaction(
    transaction,
    expectedUser,
    new PublicKey(execution.vadSignerAddress),
    new PublicKey(execution.programId),
  );

  const { signature } = await signAndSendTransaction(
    {
      walletAccount: account,
      transaction,
      sponsorshipMode: 'off',
    },
    dynamicClient,
  );

  return {
    chainCode: execution.chainCode,
    transactionId: signature,
  };
}

async function getEvmWallet(networkId: string) {
  await initializeDynamicWalletClient();
  if (!dynamicClient) throw new Error('Dynamic wallet is not configured.');

  const account = getWalletAccounts(dynamicClient).find(
    (candidate) => candidate.chain === 'EVM',
  );
  if (!account || account.chain !== 'EVM') {
    throw new Error('A Dynamic EVM embedded wallet is required.');
  }

  const provider = getWalletProviderFromWalletAccount(
    { walletAccount: account },
    dynamicClient,
  );
  const activeNetwork = await provider.getActiveNetworkId();
  if (String(activeNetwork.networkId) !== networkId) {
    if (!provider.switchActiveNetwork) {
      throw new Error('This wallet cannot switch to the required EVM network.');
    }
    await provider.switchActiveNetwork({ networkId });
  }

  const client = await createWalletClientForWalletAccount(
    { walletAccount: account },
    dynamicClient,
  );

  return { account, provider, client };
}

function assertPreparedSolanaTransaction(
  transaction: VersionedTransaction,
  expectedUser: PublicKey,
  expectedVadSigner: PublicKey,
  expectedProgram: PublicKey,
) {
  const staticKeys = transaction.message.staticAccountKeys;
  if (!staticKeys.some((key) => key.equals(expectedProgram))) {
    throw new Error('Prepared Solana transaction does not target the configured VAD program.');
  }

  const signerCount = transaction.message.header.numRequiredSignatures;
  const signerKeys = staticKeys.slice(0, signerCount);
  const userIndex = signerKeys.findIndex((key) => key.equals(expectedUser));
  const vadSignerIndex = signerKeys.findIndex((key) => key.equals(expectedVadSigner));

  if (userIndex < 0) {
    throw new Error('Prepared Solana transaction does not require the active user wallet.');
  }
  if (vadSignerIndex < 0) {
    throw new Error('Prepared Solana transaction does not require the configured VAD signer.');
  }

  const vadSignature = transaction.signatures[vadSignerIndex];
  if (!vadSignature || vadSignature.every((byte) => byte === 0)) {
    throw new Error('Prepared Solana transaction is missing the VAD authorization signature.');
  }
}

function asAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new Error(`${label} address is invalid.`);
  return value;
}

function asHex(value: string, label: string): Hex {
  if (!isHex(value)) throw new Error(`${label} must be hex encoded.`);
  return value;
}

function asBytes32(value: string, label: string): Hex {
  const hex = asHex(value, label);
  if (hex.length !== 66) throw new Error(`${label} must be a 32-byte hex value.`);
  return hex;
}
