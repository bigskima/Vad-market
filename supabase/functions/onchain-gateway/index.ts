import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { privateKeyToAccount } from 'npm:viem@2.56.8/accounts';

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

type PredictionAuthorization = {
  intentId: string;
  intentStatus: string;
  authorizationId: `0x${string}`;
  authorizationStatus: string;
  positionId: `0x${string}`;
  marketId: `0x${string}`;
  outcomeId: `0x${string}`;
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
  signature?: `0x${string}` | null;
};

function signerAccount() {
  const secret = env('VAD_EVM_QUOTE_SIGNER_PRIVATE_KEY');
  if (!secret) return null;
  const key = secret.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('ONCHAIN_SIGNER_SECRET_INVALID');
  }
  return privateKeyToAccount(key as `0x${string}`);
}

async function preparePrediction(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);

  const signer = signerAccount();
  if (!signer) return json({ error: 'ONCHAIN_SIGNER_NOT_CONFIGURED' }, 503);

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
    return json({ error: 'ONCHAIN_SIGNER_MISMATCH' }, 503);
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
  if (code.includes('AUTH')) return 401;
  if (code.includes('SIGNER')) return 503;
  return 500;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '').trim().toLowerCase();

    if (action === 'prepare_prediction') return await preparePrediction(req, body);
    if (action === 'record_submission') return await recordSubmission(req, body);
    if (action === 'fail_intent') return await failIntent(req, body);

    return json({ error: 'ACTION_NOT_SUPPORTED' }, 400);
  } catch (error) {
    if (error instanceof Response) return error;

    const code = error instanceof Error ? error.message : 'ONCHAIN_GATEWAY_FAILED';
    console.error('onchain gateway failure', { code });
    return json({ error: code }, errorStatus(code));
  }
});
