import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  defineChain,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
  type Hex,
} from 'npm:viem@2.56.8';
import { privateKeyToAccount } from 'npm:viem@2.56.8/accounts';

const settlementAbi = parseAbi([
  'event PositionLocked(bytes32 indexed positionId, bytes32 indexed marketId, bytes32 indexed outcomeId, address user, uint256 collateralAmount, uint256 tradingFeeAmount, uint256 tradingFeePolicyVersion)',
  'event PositionSettled(bytes32 indexed positionId, bytes32 indexed marketId, address indexed user, uint256 grossPayout, uint256 settlementFeeAmount, uint256 netPayout, uint256 settlementFeePolicyVersion, bytes32 resolutionHash)',
  'function resolutions(bytes32) view returns (bytes32 winningOutcomeId, bytes32 evidenceHash, bool resolved, bool voided, uint64 resolvedAt)',
  'function resolveMarket(bytes32 marketId, bytes32 winningOutcomeId, bool voided, bytes32 evidenceHash) returns (bytes32)',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: corsHeaders });

function env(name: string) {
  return Deno.env.get(name) ?? null;
}

function adminClient() {
  const url = env('SUPABASE_URL');
  const service = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !service) throw new Error('SUPABASE_RUNTIME_CONFIGURATION_MISSING');
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function userScopedClient(req: Request) {
  const url = env('SUPABASE_URL');
  const anon = env('SUPABASE_ANON_KEY') ?? env('SUPABASE_PUBLISHABLE_KEY');
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!url || !anon || !token) throw new Error('SUPABASE_USER_RUNTIME_CONFIGURATION_MISSING');

  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireCryptoAdmin(req: Request) {
  await requireUser(req);
  const client = userScopedClient(req);
  const { data, error } = await client.rpc('admin_my_access');
  if (error) throw new Error('ADMIN_ACCESS_CHECK_FAILED');

  const access = (data ?? {}) as {
    isSuperAdmin?: boolean;
    permissions?: string[];
  };
  const permissions = Array.isArray(access.permissions) ? access.permissions : [];

  if (!access.isSuperAdmin && !permissions.includes('assets.manage')) {
    throw new Response(JSON.stringify({ error: 'ADMIN_PERMISSION_REQUIRED' }), {
      status: 403,
      headers: corsHeaders,
    });
  }
}

async function requireUser(req: Request) {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) throw new Response(JSON.stringify({ error: 'AUTH_REQUIRED' }), {
    status: 401,
    headers: corsHeaders,
  });

  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: 'AUTH_INVALID' }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  return { user: data.user, admin };
}

function requireUuid(value: unknown, code: string) {
  const text = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(code);
  }
  return text;
}

function requireEvmHash(value: unknown) {
  const text = String(value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(text)) throw new Error('INVALID_EVM_TRANSACTION_HASH');
  return text;
}

function requireBytes32(value: unknown, code: string): Hex {
  const text = String(value ?? '').trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(text)) throw new Error(code);
  return text as Hex;
}

function requireEvmAddress(value: unknown, code: string): `0x${string}` {
  const text = String(value ?? '').trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(text)) throw new Error(code);
  return text as `0x${string}`;
}

function requireAmount(value: unknown) {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,18})?$/.test(text)) throw new Error('INVALID_AMOUNT');
  const numeric = Number(text);
  if (!Number.isFinite(numeric) || numeric <= 0) throw new Error('INVALID_AMOUNT');
  return text;
}

function requireIdempotencyKey(value: unknown) {
  const text = String(value ?? '').trim();
  if (text.length < 12 || text.length > 240) throw new Error('INVALID_IDEMPOTENCY_KEY');
  return text;
}

function requireChainCode(value: unknown) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{1,31}$/.test(text)) throw new Error('INVALID_CHAIN_CODE');
  return text;
}

function requireOutcomeCode(value: unknown) {
  const text = String(value ?? '').trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9_]{0,31}$/.test(text)) throw new Error('INVALID_OUTCOME_CODE');
  return text;
}

function privateKeyAccount(names: string[]) {
  for (const name of names) {
    const secret = env(name);
    if (!secret) continue;
    const key = secret.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
      throw new Error(`${name}_INVALID`);
    }
    return privateKeyToAccount(key as `0x${string}`);
  }
  return null;
}

function quoteSignerAccount() {
  return privateKeyAccount([
    'VAD_EVM_QUOTE_SIGNER_PRIVATE_KEY',
    'VAD_EVM_OPERATOR_PRIVATE_KEY',
  ]);
}

function settlementSignerAccount() {
  return privateKeyAccount([
    'VAD_EVM_SETTLEMENT_SIGNER_PRIVATE_KEY',
    'VAD_EVM_OPERATOR_PRIVATE_KEY',
  ]);
}

function resolverAccount() {
  return privateKeyAccount([
    'VAD_EVM_RESOLVER_PRIVATE_KEY',
    'VAD_EVM_OPERATOR_PRIVATE_KEY',
  ]);
}

function evmClients(input: {
  chainId: number;
  chainCode: string;
  rpcUrl: string;
  account?: ReturnType<typeof privateKeyToAccount>;
}) {
  const chain = defineChain({
    id: input.chainId,
    name: input.chainCode,
    nativeCurrency: {
      name: 'Native gas',
      symbol: 'GAS',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [input.rpcUrl] },
    },
  });

  return {
    publicClient: createPublicClient({
      chain,
      transport: http(input.rpcUrl),
    }),
    walletClient: input.account
      ? createWalletClient({
          account: input.account,
          chain,
          transport: http(input.rpcUrl),
        })
      : null,
  };
}

type PredictionAuthorization = {
  intentId: string;
  intentStatus: string;
  authorizationId: Hex;
  authorizationStatus: string;
  positionId: Hex;
  marketId: Hex;
  outcomeId: Hex;
  walletAddress: `0x${string}`;
  collateralAmount: string | number;
  collateralAmountAtomic: string;
  tradingFee: string | number;
  tradingFeeAmountAtomic: string;
  tradingFeePolicyVersionId: string | number | null;
  deadline: string | number;
  chainCode: string;
  evmChainId: string | number;
  contractAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenDecimals: number;
  expectedQuoteSigner: `0x${string}`;
  protocolKey: string;
  protocolVersion: number;
  signature?: Hex | null;
};

type SettlementResolution = {
  marketId: Hex;
  winningOutcomeId: Hex;
  voided: boolean;
  evidenceHash: Hex;
  economicVoid?: boolean;
  voidReason?: string;
};

type SettlementAuthorization = {
  noAction?: boolean;
  result?: string;
  positionId?: string;
  intentId?: string;
  intentStatus?: string;
  authorizationType?: 'CLAIM_PAYOUT' | 'REFUND';
  authorizationId?: Hex;
  marketId?: Hex;
  walletAddress?: `0x${string}`;
  grossPayout?: string | number;
  grossPayoutAtomic?: string;
  settlementFee?: string | number;
  settlementFeeAmountAtomic?: string;
  settlementFeePolicyVersionId?: string | number | null;
  resolution?: SettlementResolution;
  deadline?: string | number;
  chainCode?: string;
  evmChainId?: string | number;
  rpcUrl?: string;
  contractAddress?: `0x${string}`;
  tokenAddress?: `0x${string}`;
  tokenDecimals?: number;
  expectedSettlementSigner?: `0x${string}`;
  expectedResolver?: `0x${string}`;
  signature?: Hex | null;
};

type IntentProbe = {
  intentId: string;
  intentStatus: string;
  action: 'PREDICT' | 'CLAIM' | 'REFUND';
  authorizationType: 'PREDICT_LOCK' | 'CLAIM_PAYOUT' | 'REFUND';
  authorizationId: Hex;
  positionId: Hex;
  marketId: Hex;
  outcomeId: Hex | null;
  walletAddress: `0x${string}`;
  amountAtomic: string;
  feeAmountAtomic: string;
  feePolicyVersionId: string | number | null;
  authorizationPayload: Record<string, unknown>;
  chainCode: string;
  chainId: number | string;
  rpcUrl: string;
  confirmationTarget: number | string;
  contractAddress: `0x${string}`;
  transactionId: Hex;
  transactionStatus: string;
  currentConfirmations: number;
  finalized: boolean;
};


async function adminSignerStatus(req: Request) {
  await requireCryptoAdmin(req);

  const quote = quoteSignerAccount();
  const settlement = settlementSignerAccount();
  const resolver = resolverAccount();

  return json({
    ok: true,
    signers: {
      quote: {
        configured: Boolean(quote),
        address: quote?.address ?? null,
      },
      settlement: {
        configured: Boolean(settlement),
        address: settlement?.address ?? null,
      },
      resolver: {
        configured: Boolean(resolver),
        address: resolver?.address ?? null,
      },
    },
    sharedOperator:
      Boolean(quote && settlement && resolver)
      && quote!.address.toLowerCase() === settlement!.address.toLowerCase()
      && quote!.address.toLowerCase() === resolver!.address.toLowerCase(),
  });
}

async function preparePrediction(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);

  const signer = quoteSignerAccount();
  if (!signer) return json({ error: 'ONCHAIN_QUOTE_SIGNER_NOT_CONFIGURED' }, 503);

  const walletId = requireUuid(body.walletId, 'INVALID_WALLET_ID');
  const marketId = requireUuid(body.marketId, 'INVALID_MARKET_ID');
  const amount = requireAmount(body.amount);
  const outcomeCode = requireOutcomeCode(body.outcomeCode);
  const chainCode = requireChainCode(body.chainCode);
  const idempotencyKey = requireIdempotencyKey(body.idempotencyKey);

  const { data, error } = await admin.rpc('internal_prepare_onchain_prediction', {
    p_user_id: user.id,
    p_wallet_id: walletId,
    p_instrument_public_id: marketId,
    p_outcome_code: outcomeCode,
    p_chain_code: chainCode,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !data || typeof data !== 'object') {
    console.error('onchain prediction prepare failed', {
      userId: user.id,
      code: error?.code,
      message: error?.message,
    });
    return json({
      error: 'ONCHAIN_PREDICTION_NOT_AVAILABLE',
      message: error?.message ?? 'VAD could not prepare this USDC prediction.',
    }, 409);
  }

  const authorization = data as PredictionAuthorization;

  if (authorization.signature && authorization.authorizationStatus === 'SIGNED') {
    return json({ ok: true, authorization });
  }

  if (
    authorization.protocolKey !== 'VAD_SETTLEMENT_V1' ||
    Number(authorization.protocolVersion) !== 1
  ) {
    return json({ error: 'UNSUPPORTED_SETTLEMENT_PROTOCOL' }, 409);
  }

  const expectedSigner = String(authorization.expectedQuoteSigner ?? '').toLowerCase();
  if (signer.address.toLowerCase() !== expectedSigner) {
    console.error('onchain quote signer mismatch', {
      chainCode: authorization.chainCode,
      expectedSigner,
      configuredSigner: signer.address.toLowerCase(),
    });
    return json({ error: 'ONCHAIN_QUOTE_SIGNER_MISMATCH' }, 503);
  }

  const chainId = Number(authorization.evmChainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return json({ error: 'INVALID_EVM_CHAIN_CONFIGURATION' }, 409);
  }

  const feePolicyVersion = authorization.tradingFeePolicyVersionId == null
    ? 0n
    : BigInt(String(authorization.tradingFeePolicyVersionId));

  const signature = await signer.signTypedData({
    domain: {
      name: 'VAD Settlement',
      version: '1',
      chainId,
      verifyingContract: authorization.contractAddress,
    },
    types: {
      LockAuthorization: [
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
    primaryType: 'LockAuthorization',
    message: {
      authorizationId: authorization.authorizationId,
      positionId: authorization.positionId,
      marketId: authorization.marketId,
      outcomeId: authorization.outcomeId,
      user: authorization.walletAddress,
      collateralAmount: BigInt(authorization.collateralAmountAtomic),
      tradingFeeAmount: BigInt(authorization.tradingFeeAmountAtomic),
      tradingFeePolicyVersion: feePolicyVersion,
      deadline: BigInt(String(authorization.deadline)),
    },
  });

  const { data: completed, error: completeError } = await admin.rpc(
    'internal_complete_onchain_authorization',
    {
      p_user_id: user.id,
      p_intent_id: authorization.intentId,
      p_signer_address: signer.address,
      p_signature: signature,
    },
  );

  if (completeError || !completed) {
    console.error('onchain authorization persist failed', {
      userId: user.id,
      code: completeError?.code,
    });
    return json({ error: 'ONCHAIN_AUTHORIZATION_PERSIST_FAILED' }, 500);
  }

  return json({
    ok: true,
    authorization: {
      ...authorization,
      authorizationStatus: 'SIGNED',
      intentStatus: 'SIGNED',
      signature,
      signerAddress: signer.address,
    },
  });
}

async function ensureCanonicalResolutionOnchain(
  authorization: SettlementAuthorization,
) {
  if (
    !authorization.resolution ||
    !authorization.contractAddress ||
    !authorization.chainCode ||
    !authorization.rpcUrl ||
    authorization.evmChainId == null
  ) {
    throw new Error('ONCHAIN_RESOLUTION_CONFIGURATION_INVALID');
  }

  const marketId = requireBytes32(authorization.resolution.marketId, 'INVALID_MARKET_BYTES32');
  const winningOutcomeId = requireBytes32(
    authorization.resolution.winningOutcomeId,
    'INVALID_WINNING_OUTCOME_BYTES32',
  );
  const evidenceHash = requireBytes32(
    authorization.resolution.evidenceHash,
    'INVALID_EVIDENCE_HASH',
  );
  const contractAddress = requireEvmAddress(
    authorization.contractAddress,
    'INVALID_SETTLEMENT_CONTRACT_ADDRESS',
  );
  const chainId = Number(authorization.evmChainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('INVALID_EVM_CHAIN_CONFIGURATION');
  }

  const resolver = resolverAccount();
  if (!resolver) throw new Error('ONCHAIN_RESOLVER_NOT_CONFIGURED');

  const expectedResolver = requireEvmAddress(
    authorization.expectedResolver,
    'INVALID_EXPECTED_RESOLVER',
  );
  if (resolver.address.toLowerCase() !== expectedResolver.toLowerCase()) {
    throw new Error('ONCHAIN_RESOLVER_MISMATCH');
  }

  const { publicClient, walletClient } = evmClients({
    chainId,
    chainCode: authorization.chainCode,
    rpcUrl: authorization.rpcUrl,
    account: resolver,
  });

  const current = await publicClient.readContract({
    address: contractAddress,
    abi: settlementAbi,
    functionName: 'resolutions',
    args: [marketId],
  });

  const [currentWinner, currentEvidence, resolved, currentVoided] = current;

  if (resolved) {
    if (
      String(currentWinner).toLowerCase() !== winningOutcomeId.toLowerCase() ||
      String(currentEvidence).toLowerCase() !== evidenceHash.toLowerCase() ||
      Boolean(currentVoided) !== Boolean(authorization.resolution.voided)
    ) {
      throw new Error('ONCHAIN_RESOLUTION_MISMATCH');
    }

    return { resolutionTransactionId: null as Hex | null };
  }

  if (!walletClient) throw new Error('ONCHAIN_RESOLVER_NOT_CONFIGURED');

  const resolutionTransactionId = await walletClient.writeContract({
    address: contractAddress,
    abi: settlementAbi,
    functionName: 'resolveMarket',
    args: [
      marketId,
      winningOutcomeId,
      Boolean(authorization.resolution.voided),
      evidenceHash,
    ],
  });

  const receipt = await publicClient.waitForTransactionReceipt({
    hash: resolutionTransactionId,
    confirmations: 1,
    timeout: 60_000,
  });

  if (receipt.status !== 'success') {
    throw new Error('ONCHAIN_RESOLUTION_TRANSACTION_FAILED');
  }

  return { resolutionTransactionId };
}

async function prepareSettlement(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);

  const signer = settlementSignerAccount();
  if (!signer) return json({ error: 'ONCHAIN_SETTLEMENT_SIGNER_NOT_CONFIGURED' }, 503);

  const walletId = requireUuid(body.walletId, 'INVALID_WALLET_ID');
  const positionId = requireUuid(body.positionId, 'INVALID_POSITION_ID');
  const idempotencyKey = requireIdempotencyKey(body.idempotencyKey);

  const { data, error } = await admin.rpc('internal_prepare_onchain_settlement', {
    p_user_id: user.id,
    p_wallet_id: walletId,
    p_position_public_id: positionId,
    p_idempotency_key: idempotencyKey,
  });

  if (error || !data || typeof data !== 'object') {
    console.error('onchain settlement prepare failed', {
      userId: user.id,
      code: error?.code,
      message: error?.message,
    });
    return json({
      error: 'ONCHAIN_SETTLEMENT_NOT_AVAILABLE',
      message: error?.message ?? 'VAD could not prepare this USDC settlement.',
    }, 409);
  }

  const authorization = data as SettlementAuthorization;
  if (authorization.noAction) {
    return json({ ok: true, settlement: authorization });
  }

  if (
    !authorization.intentId ||
    !authorization.authorizationId ||
    !authorization.positionId ||
    !authorization.marketId ||
    !authorization.walletAddress ||
    !authorization.grossPayoutAtomic ||
    authorization.settlementFeeAmountAtomic == null ||
    authorization.deadline == null ||
    !authorization.contractAddress ||
    authorization.evmChainId == null ||
    !authorization.chainCode ||
    !authorization.rpcUrl ||
    !authorization.resolution
  ) {
    return json({ error: 'INVALID_SETTLEMENT_AUTHORIZATION' }, 409);
  }

  if (authorization.signature && authorization.intentStatus === 'SIGNED') {
    return json({ ok: true, authorization });
  }

  const expectedSigner = requireEvmAddress(
    authorization.expectedSettlementSigner,
    'INVALID_EXPECTED_SETTLEMENT_SIGNER',
  );
  if (signer.address.toLowerCase() !== expectedSigner.toLowerCase()) {
    return json({ error: 'ONCHAIN_SETTLEMENT_SIGNER_MISMATCH' }, 503);
  }

  const { resolutionTransactionId } = await ensureCanonicalResolutionOnchain(authorization);

  const resolutionHash = keccak256(encodeAbiParameters(
    [
      { type: 'bytes32' },
      { type: 'bytes32' },
      { type: 'bool' },
      { type: 'bytes32' },
    ],
    [
      requireBytes32(authorization.resolution.marketId, 'INVALID_MARKET_BYTES32'),
      requireBytes32(
        authorization.resolution.winningOutcomeId,
        'INVALID_WINNING_OUTCOME_BYTES32',
      ),
      Boolean(authorization.resolution.voided),
      requireBytes32(authorization.resolution.evidenceHash, 'INVALID_EVIDENCE_HASH'),
    ],
  ));

  const { error: hashError } = await admin.rpc('internal_set_onchain_resolution_hash', {
    p_user_id: user.id,
    p_intent_id: authorization.intentId,
    p_resolution_hash: resolutionHash,
  });
  if (hashError) {
    console.error('settlement resolution hash persist failed', {
      userId: user.id,
      code: hashError.code,
    });
    return json({ error: 'ONCHAIN_RESOLUTION_HASH_NOT_RECORDED' }, 500);
  }

  const chainId = Number(authorization.evmChainId);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return json({ error: 'INVALID_EVM_CHAIN_CONFIGURATION' }, 409);
  }

  const feePolicyVersion = authorization.settlementFeePolicyVersionId == null
    ? 0n
    : BigInt(String(authorization.settlementFeePolicyVersionId));

  const signature = await signer.signTypedData({
    domain: {
      name: 'VAD Settlement',
      version: '1',
      chainId,
      verifyingContract: requireEvmAddress(
        authorization.contractAddress,
        'INVALID_SETTLEMENT_CONTRACT_ADDRESS',
      ),
    },
    types: {
      SettlementAuthorization: [
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
    primaryType: 'SettlementAuthorization',
    message: {
      authorizationId: authorization.authorizationId,
      positionId: requireBytes32(authorization.positionId, 'INVALID_POSITION_BYTES32'),
      marketId: requireBytes32(authorization.marketId, 'INVALID_MARKET_BYTES32'),
      user: requireEvmAddress(authorization.walletAddress, 'INVALID_WALLET_ADDRESS'),
      grossPayout: BigInt(authorization.grossPayoutAtomic),
      settlementFeeAmount: BigInt(authorization.settlementFeeAmountAtomic),
      settlementFeePolicyVersion: feePolicyVersion,
      resolutionHash,
      deadline: BigInt(String(authorization.deadline)),
    },
  });

  const { data: completed, error: completeError } = await admin.rpc(
    'internal_complete_onchain_authorization',
    {
      p_user_id: user.id,
      p_intent_id: authorization.intentId,
      p_signer_address: signer.address,
      p_signature: signature,
    },
  );

  if (completeError || !completed) {
    console.error('settlement authorization persist failed', {
      userId: user.id,
      code: completeError?.code,
    });
    return json({ error: 'ONCHAIN_SETTLEMENT_AUTHORIZATION_PERSIST_FAILED' }, 500);
  }

  return json({
    ok: true,
    authorization: {
      ...authorization,
      intentStatus: 'SIGNED',
      signature,
      signerAddress: signer.address,
      resolutionHash,
      resolutionTransactionId,
    },
  });
}

async function recordSubmission(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);
  const intentId = requireUuid(body.intentId, 'INVALID_INTENT_ID');
  const transactionId = requireEvmHash(body.transactionId);

  const { data, error } = await admin.rpc('internal_record_onchain_submission', {
    p_user_id: user.id,
    p_intent_id: intentId,
    p_transaction_id: transactionId,
  });

  if (error || !data) {
    console.error('onchain submission record failed', {
      userId: user.id,
      code: error?.code,
      message: error?.message,
    });
    return json({
      error: 'ONCHAIN_SUBMISSION_NOT_RECORDED',
      message: error?.message ?? 'VAD could not record this on-chain submission.',
    }, 409);
  }

  return json({ ok: true, submission: data });
}

function decodeReceiptEvent(probe: IntentProbe, logs: Array<{
  address: string;
  data: Hex;
  topics: readonly Hex[];
  logIndex: number | null;
}>) {
  const contract = probe.contractAddress.toLowerCase();
  const expectedEvent = probe.authorizationType === 'PREDICT_LOCK'
    ? 'PositionLocked'
    : 'PositionSettled';

  for (const log of logs) {
    if (log.address.toLowerCase() !== contract) continue;

    try {
      const decoded = decodeEventLog({
        abi: settlementAbi,
        eventName: expectedEvent,
        data: log.data,
        topics: log.topics,
      });
      const args = decoded.args as Record<string, unknown>;

      if (expectedEvent === 'PositionLocked') {
        return {
          eventIndex: Number(log.logIndex ?? 0),
          payload: {
            eventType: expectedEvent,
            positionId: String(args.positionId),
            marketId: String(args.marketId),
            outcomeId: String(args.outcomeId),
            user: String(args.user),
            collateralAmountAtomic: String(args.collateralAmount),
            tradingFeeAmountAtomic: String(args.tradingFeeAmount),
            tradingFeePolicyVersionId: String(args.tradingFeePolicyVersion),
          },
        };
      }

      return {
        eventIndex: Number(log.logIndex ?? 0),
        payload: {
          eventType: expectedEvent,
          positionId: String(args.positionId),
          marketId: String(args.marketId),
          user: String(args.user),
          grossPayoutAtomic: String(args.grossPayout),
          settlementFeeAmountAtomic: String(args.settlementFeeAmount),
          netPayoutAtomic: String(args.netPayout),
          settlementFeePolicyVersionId: String(args.settlementFeePolicyVersion),
          resolutionHash: String(args.resolutionHash),
        },
      };
    } catch {
      // Continue scanning the settlement contract logs.
    }
  }

  throw new Error('EXPECTED_SETTLEMENT_EVENT_NOT_FOUND');
}

async function checkIntent(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);
  const intentId = requireUuid(body.intentId, 'INVALID_INTENT_ID');

  const { data, error } = await admin.rpc('internal_onchain_intent_probe', {
    p_user_id: user.id,
    p_intent_id: intentId,
  });

  if (error || !data || typeof data !== 'object') {
    return json({
      error: 'ONCHAIN_INTENT_PROBE_FAILED',
      message: error?.message ?? 'VAD could not verify this transaction yet.',
    }, 409);
  }

  const probe = data as IntentProbe;
  if (probe.finalized && probe.transactionStatus === 'CONFIRMED') {
    return json({ ok: true, receipt: probe });
  }

  const chainId = Number(probe.chainId);
  const confirmationTarget = Math.max(1, Number(probe.confirmationTarget) || 3);
  const { publicClient } = evmClients({
    chainId,
    chainCode: probe.chainCode,
    rpcUrl: probe.rpcUrl,
  });

  let receipt;
  try {
    receipt = await publicClient.getTransactionReceipt({
      hash: requireEvmHash(probe.transactionId),
    });
  } catch {
    return json({
      ok: true,
      receipt: {
        intentId,
        status: 'SUBMITTED',
        confirmations: 0,
        finalized: false,
      },
    });
  }

  if (receipt.status !== 'success') {
    const { data: failed, error: failedError } = await admin.rpc(
      'internal_record_onchain_receipt',
      {
        p_user_id: user.id,
        p_intent_id: intentId,
        p_success: false,
        p_block_number: Number(receipt.blockNumber),
        p_block_hash: receipt.blockHash,
        p_confirmation_count: 0,
        p_finalized: false,
        p_event_index: 0,
        p_event_payload: {},
        p_failure_code: 'EVM_REVERT',
      },
    );

    if (failedError) {
      return json({ error: 'ONCHAIN_RECEIPT_RECORD_FAILED' }, 500);
    }

    return json({ ok: true, receipt: failed });
  }

  const latestBlock = await publicClient.getBlockNumber();
  const confirmations = latestBlock >= receipt.blockNumber
    ? Number(latestBlock - receipt.blockNumber + 1n)
    : 0;
  const finalized = confirmations >= confirmationTarget;

  const decoded = decodeReceiptEvent(
    probe,
    receipt.logs.map((log) => ({
      address: log.address,
      data: log.data,
      topics: log.topics,
      logIndex: log.logIndex,
    })),
  );

  const { data: recorded, error: recordError } = await admin.rpc(
    'internal_record_onchain_receipt',
    {
      p_user_id: user.id,
      p_intent_id: intentId,
      p_success: true,
      p_block_number: Number(receipt.blockNumber),
      p_block_hash: receipt.blockHash,
      p_confirmation_count: confirmations,
      p_finalized: finalized,
      p_event_index: decoded.eventIndex,
      p_event_payload: decoded.payload,
      p_failure_code: null,
    },
  );

  if (recordError || !recorded) {
    console.error('onchain receipt record failed', {
      userId: user.id,
      code: recordError?.code,
      message: recordError?.message,
    });
    return json({
      error: 'ONCHAIN_RECEIPT_RECORD_FAILED',
      message: recordError?.message ?? 'VAD could not persist transaction confirmation.',
    }, 409);
  }

  return json({ ok: true, receipt: recorded });
}

async function failIntent(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);
  const intentId = requireUuid(body.intentId, 'INVALID_INTENT_ID');
  const failureCode = String(body.failureCode ?? 'CLIENT_TRANSACTION_FAILED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .slice(0, 80);

  const { data, error } = await admin.rpc('internal_fail_onchain_intent', {
    p_user_id: user.id,
    p_intent_id: intentId,
    p_failure_code: failureCode || 'CLIENT_TRANSACTION_FAILED',
  });

  if (error || data !== true) {
    return json({ error: 'ONCHAIN_INTENT_NOT_UPDATED' }, 409);
  }

  return json({ ok: true });
}

function errorStatus(code: string) {
  if (code.startsWith('INVALID_')) return 400;
  if (code.includes('AUTH_REQUIRED') || code.includes('AUTH_INVALID')) return 401;
  if (
    code.includes('SIGNER') ||
    code.includes('RESOLVER_NOT_CONFIGURED') ||
    code.includes('RUNTIME_CONFIGURATION')
  ) return 503;
  if (
    code.includes('MISMATCH') ||
    code.includes('NOT_FOUND') ||
    code.includes('NOT_AVAILABLE')
  ) return 409;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '').trim().toLowerCase();

    if (action === 'admin_signer_status') return await adminSignerStatus(req);
    if (action === 'prepare_prediction') return await preparePrediction(req, body);
    if (action === 'prepare_settlement') return await prepareSettlement(req, body);
    if (action === 'record_submission') return await recordSubmission(req, body);
    if (action === 'check_intent') return await checkIntent(req, body);
    if (action === 'fail_intent') return await failIntent(req, body);

    return json({ error: 'ACTION_NOT_SUPPORTED' }, 400);
  } catch (error) {
    if (error instanceof Response) return error;

    const code = error instanceof Error ? error.message : 'ONCHAIN_GATEWAY_FAILED';
    console.error('onchain gateway failure', { code });
    return json({ error: code }, errorStatus(code));
  }
});
