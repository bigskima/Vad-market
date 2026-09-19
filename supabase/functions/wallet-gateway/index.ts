import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { verifyMessage } from 'npm:viem@2.56.8';
import { ed25519 } from 'npm:@noble/curves@2.4.0/ed25519.js';
import bs58 from 'npm:bs58@6.0.0';

type ChainFamily = 'EVM' | 'SOLANA';

type ChallengePayload = {
  challengeId: string;
  chainFamily: ChainFamily;
  walletAddress: string;
  walletAddressNormalized: string;
  message: string;
  expiresAt: string;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (!url || !service) throw new Error('Supabase runtime configuration is missing');
  return createClient(url, service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: Request) {
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
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

function randomHex(byteLength = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function normalizeWalletAddress(chainFamilyInput: unknown, addressInput: unknown) {
  const chainFamily = String(chainFamilyInput ?? '').trim().toUpperCase() as ChainFamily;
  const address = String(addressInput ?? '').trim();

  if (chainFamily === 'EVM') {
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      throw new Error('INVALID_EVM_ADDRESS');
    }
    return { chainFamily, address: address.toLowerCase() };
  }

  if (chainFamily === 'SOLANA') {
    let decoded: Uint8Array;
    try {
      decoded = bs58.decode(address);
    } catch {
      throw new Error('INVALID_SOLANA_ADDRESS');
    }
    if (decoded.length !== 32) throw new Error('INVALID_SOLANA_ADDRESS');
    return { chainFamily, address: bs58.encode(decoded) };
  }

  throw new Error('UNSUPPORTED_CHAIN_FAMILY');
}

function safeProvider(value: unknown) {
  const provider = String(value ?? '').trim();
  return provider ? provider.slice(0, 80) : null;
}

async function createChallenge(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);
  const normalized = normalizeWalletAddress(body.chainFamily, body.walletAddress);
  const challengeId = crypto.randomUUID();
  const nonce = randomHex(32);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 5 * 60 * 1000);
  const domain = env('VAD_WALLET_DOMAIN') ?? 'vad.market';

  const message = [
    'VAD Market wallet verification',
    `Domain: ${domain}`,
    `VAD account: ${user.id}`,
    `Chain family: ${normalized.chainFamily}`,
    `Wallet: ${normalized.address}`,
    `Challenge: ${nonce}`,
    `Issued at: ${issuedAt.toISOString()}`,
    `Expires at: ${expiresAt.toISOString()}`,
    '',
    'This signature only proves wallet ownership.',
    'It does not authorize a transaction or token transfer.',
  ].join('\n');

  const { data, error } = await admin.rpc('internal_create_wallet_verification_challenge', {
    p_user_id: user.id,
    p_public_id: challengeId,
    p_chain_family: normalized.chainFamily,
    p_wallet_address: normalized.address,
    p_wallet_address_normalized: normalized.address,
    p_nonce: nonce,
    p_challenge_message: message,
    p_expires_at: expiresAt.toISOString(),
  });

  if (error) {
    console.error('wallet challenge create failed', { userId: user.id, code: error.code });
    return json({ error: 'WALLET_CHALLENGE_CREATE_FAILED' }, 500);
  }

  return json({
    ...(data as Record<string, unknown>),
    walletProvider: safeProvider(body.walletProvider),
  });
}

async function verifyEvm(address: string, message: string, signature: string) {
  if (!/^0x[0-9a-fA-F]+$/.test(signature)) return false;
  try {
    return await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
  } catch {
    return false;
  }
}

function verifySolana(address: string, message: string, signature: string) {
  try {
    const publicKey = bs58.decode(address);
    const signatureBytes = bs58.decode(signature);
    if (publicKey.length !== 32 || signatureBytes.length !== 64) return false;
    return ed25519.verify(
      signatureBytes,
      new TextEncoder().encode(message),
      publicKey,
      { zip215: false },
    );
  } catch {
    return false;
  }
}

async function verifyChallenge(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);
  const challengeId = String(body.challengeId ?? '').trim();
  const signature = String(body.signature ?? '').trim();
  const walletProvider = safeProvider(body.walletProvider);

  if (!/^[0-9a-fA-F-]{36}$/.test(challengeId) || signature.length < 16 || signature.length > 512) {
    return json({ error: 'INVALID_WALLET_VERIFICATION_REQUEST' }, 400);
  }

  const { data, error } = await admin.rpc('internal_wallet_verification_challenge', {
    p_user_id: user.id,
    p_public_id: challengeId,
  });

  if (error || !data || typeof data !== 'object') {
    return json({ error: 'WALLET_CHALLENGE_UNAVAILABLE' }, 409);
  }

  const challenge = data as ChallengePayload;
  let valid = false;
  let proofMethod = '';

  if (challenge.chainFamily === 'EVM') {
    valid = await verifyEvm(challenge.walletAddressNormalized, challenge.message, signature);
    proofMethod = 'EIP191';
  } else if (challenge.chainFamily === 'SOLANA') {
    valid = verifySolana(challenge.walletAddressNormalized, challenge.message, signature);
    proofMethod = 'ED25519';
  }

  if (!valid) return json({ error: 'WALLET_SIGNATURE_INVALID' }, 422);

  const { data: completed, error: completeError } = await admin.rpc(
    'internal_complete_wallet_verification',
    {
      p_user_id: user.id,
      p_challenge_public_id: challengeId,
      p_wallet_provider: walletProvider,
      p_proof_method: proofMethod,
    },
  );

  if (completeError) {
    console.error('wallet verification complete failed', {
      userId: user.id,
      code: completeError.code,
    });
    return json({ error: 'WALLET_VERIFICATION_COMPLETE_FAILED' }, 409);
  }

  return json({ ok: true, wallet: completed });
}


async function listWallets(req: Request) {
  const { user, admin } = await requireUser(req);
  const { data, error } = await admin.rpc('internal_wallet_connections', {
    p_user_id: user.id,
  });
  if (error) {
    console.error('wallet list failed', { userId: user.id, code: error.code });
    return json({ error: 'WALLET_LIST_FAILED' }, 500);
  }
  return json({ ok: true, wallets: data ?? [] });
}

async function revokeWallet(req: Request, body: Record<string, unknown>) {
  const { user, admin } = await requireUser(req);
  const walletId = String(body.walletId ?? '').trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(walletId)) {
    return json({ error: 'INVALID_WALLET_ID' }, 400);
  }

  const { data, error } = await admin.rpc('internal_revoke_wallet_connection', {
    p_user_id: user.id,
    p_wallet_id: walletId,
  });
  if (error || data !== true) {
    console.error('wallet revoke failed', { userId: user.id, code: error?.code });
    return json({ error: 'WALLET_REVOKE_FAILED' }, 409);
  }

  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);

  try {
    const body = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '').trim().toLowerCase();

    if (action === 'challenge') return await createChallenge(req, body);
    if (action === 'verify') return await verifyChallenge(req, body);
    if (action === 'list') return await listWallets(req);
    if (action === 'revoke') return await revokeWallet(req, body);

    return json({ error: 'UNKNOWN_ACTION' }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error instanceof Error ? error.message : 'WALLET_GATEWAY_ERROR';
    if (code === 'INVALID_EVM_ADDRESS' || code === 'INVALID_SOLANA_ADDRESS' || code === 'UNSUPPORTED_CHAIN_FAMILY') {
      return json({ error: code }, 400);
    }
    console.error('wallet-gateway failure', { message: code });
    return json({ error: 'WALLET_GATEWAY_ERROR' }, 500);
  }
});
