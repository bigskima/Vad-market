export type VadFeePolicyName =
  | 'trading_fee'
  | 'settlement_fee'
  | 'payment_fees';

export type VadFeeAuthorization = {
  policyName: VadFeePolicyName;
  policyVersionId: string;
  amountAtomic: string;
};

export type OnchainPositionLockAuthorization = {
  authorizationId: string;
  positionId: string;
  marketId: string;
  outcomeId: string;
  userAddress: string;
  collateralAmountAtomic: string;
  tradingFee: VadFeeAuthorization;
  deadlineUnix: number;
};

export type OnchainSettlementAuthorization = {
  authorizationId: string;
  positionId: string;
  marketId: string;
  userAddress: string;
  grossPayoutAtomic: string;
  settlementFee: VadFeeAuthorization;
  resolutionHash: string;
  deadlineUnix: number;
};

export type SettlementProtocolDescriptor = {
  protocolKey: 'VAD_SETTLEMENT_V1';
  protocolVersion: 1;
  settlementAssetCode: 'USDC';
  feePolicySource: 'VAD_POLICY_ENGINE';
  feePolicyStoredOnchain: false;
};

export const VAD_SETTLEMENT_V1: SettlementProtocolDescriptor = {
  protocolKey: 'VAD_SETTLEMENT_V1',
  protocolVersion: 1,
  settlementAssetCode: 'USDC',
  feePolicySource: 'VAD_POLICY_ENGINE',
  feePolicyStoredOnchain: false,
};

export function assertFeeAuthorization(
  fee: VadFeeAuthorization,
  expectedPolicy: VadFeePolicyName,
) {
  if (fee.policyName !== expectedPolicy) {
    throw new Error(`Expected ${expectedPolicy} fee policy, received ${fee.policyName}.`);
  }

  const amount = parseAtomicAmount(fee.amountAtomic);
  if (amount > 0n && !isPositiveIntegerString(fee.policyVersionId)) {
    throw new Error('A positive VAD fee must reference the active fee-policy version.');
  }
}

export function assertPositionLockAuthorization(
  authorization: OnchainPositionLockAuthorization,
) {
  assertIdentifier(authorization.authorizationId, 'authorizationId');
  assertIdentifier(authorization.positionId, 'positionId');
  assertIdentifier(authorization.marketId, 'marketId');
  assertIdentifier(authorization.outcomeId, 'outcomeId');
  assertAddressLike(authorization.userAddress);
  if (parseAtomicAmount(authorization.collateralAmountAtomic) <= 0n) {
    throw new Error('On-chain collateral must be greater than zero.');
  }
  assertFeeAuthorization(authorization.tradingFee, 'trading_fee');
  assertDeadline(authorization.deadlineUnix);
}

export function assertSettlementAuthorization(
  authorization: OnchainSettlementAuthorization,
) {
  assertIdentifier(authorization.authorizationId, 'authorizationId');
  assertIdentifier(authorization.positionId, 'positionId');
  assertIdentifier(authorization.marketId, 'marketId');
  assertIdentifier(authorization.resolutionHash, 'resolutionHash');
  assertAddressLike(authorization.userAddress);

  const gross = parseAtomicAmount(authorization.grossPayoutAtomic);
  const fee = parseAtomicAmount(authorization.settlementFee.amountAtomic);
  if (fee > gross) {
    throw new Error('Settlement fee cannot exceed gross payout.');
  }
  assertFeeAuthorization(authorization.settlementFee, 'settlement_fee');
  assertDeadline(authorization.deadlineUnix);
}

export function parseAtomicAmount(value: string) {
  if (!/^\d+$/.test(value)) {
    throw new Error('Atomic token amounts must be unsigned integer strings.');
  }
  return BigInt(value);
}

function isPositiveIntegerString(value: string) {
  return /^\d+$/.test(value) && BigInt(value) > 0n;
}

function assertIdentifier(value: string, field: string) {
  if (!value || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
}

function assertAddressLike(value: string) {
  if (!value || value.trim().length < 3) {
    throw new Error('Wallet address is required.');
  }
}

function assertDeadline(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error('Authorization deadline must be a positive Unix timestamp.');
  }
}
