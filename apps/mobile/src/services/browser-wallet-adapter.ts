import {
  requestWalletChallenge,
  verifyWalletChallenge,
  type WalletChainFamily,
} from '@/services/wallet-api';

type Eip1193Provider = {
  request(args: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
  providers?: Eip1193Provider[];
  isMetaMask?: boolean;
  isRabby?: boolean;
};

type SolanaPublicKey = {
  toString(): string;
};

type SolanaProvider = {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: SolanaPublicKey }>;
  signMessage(
    message: Uint8Array,
    display?: string,
  ): Promise<{ signature: Uint8Array | number[] }>;
};

type BrowserWalletGlobals = {
  ethereum?: Eip1193Provider;
  solana?: SolanaProvider;
};

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function globals() {
  return globalThis as unknown as BrowserWalletGlobals;
}

function ensureBrowserWalletRuntime() {
  if (typeof document === 'undefined') {
    throw new Error('Browser wallet connection is only available on VAD web right now.');
  }
}

function pickEvmProvider() {
  const injected = globals().ethereum;
  if (!injected) throw new Error('No EVM wallet was detected in this browser.');

  const choices = injected.providers?.length ? injected.providers : [injected];
  return choices.find((provider) => provider.isRabby)
    ?? choices.find((provider) => provider.isMetaMask)
    ?? choices[0];
}

function evmProviderName(provider: Eip1193Provider) {
  if (provider.isRabby) return 'RABBY';
  if (provider.isMetaMask) return 'METAMASK';
  return 'INJECTED_EVM';
}

function utf8ToHex(value: string) {
  const bytes = new TextEncoder().encode(value);
  return `0x${Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function base58Encode(bytes: Uint8Array) {
  if (!bytes.length) return '';

  const digits = [0];

  for (const byte of bytes) {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const value = digits[index] * 256 + carry;
      digits[index] = value % 58;
      carry = Math.floor(value / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }

  for (let index = 0; index < bytes.length - 1 && bytes[index] === 0; index += 1) {
    digits.push(0);
  }

  return digits.reverse().map((digit) => BASE58_ALPHABET[digit]).join('');
}

async function connectEvmWallet() {
  const provider = pickEvmProvider();
  const accounts = await provider.request({ method: 'eth_requestAccounts' });
  const address = Array.isArray(accounts) ? String(accounts[0] ?? '').trim() : '';

  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error('The connected EVM wallet did not return a valid address.');
  }

  const walletProvider = evmProviderName(provider);
  const challenge = await requestWalletChallenge({
    chainFamily: 'EVM',
    walletAddress: address,
    walletProvider,
  });

  const signature = await provider.request({
    method: 'personal_sign',
    params: [utf8ToHex(challenge.message), address],
  });

  if (typeof signature !== 'string' || !signature.startsWith('0x')) {
    throw new Error('The wallet did not return a valid ownership signature.');
  }

  return verifyWalletChallenge({
    challengeId: challenge.challengeId,
    signature,
    walletProvider,
  });
}

async function connectSolanaWallet() {
  const provider = globals().solana;
  if (!provider) throw new Error('No Solana wallet was detected in this browser.');

  const connected = await provider.connect();
  const address = connected.publicKey?.toString().trim();
  if (!address) throw new Error('The connected Solana wallet did not return an address.');

  const walletProvider = provider.isPhantom ? 'PHANTOM' : 'INJECTED_SOLANA';
  const challenge = await requestWalletChallenge({
    chainFamily: 'SOLANA',
    walletAddress: address,
    walletProvider,
  });

  const signed = await provider.signMessage(
    new TextEncoder().encode(challenge.message),
    'utf8',
  );
  const signatureBytes = signed.signature instanceof Uint8Array
    ? signed.signature
    : Uint8Array.from(signed.signature ?? []);

  if (signatureBytes.length !== 64) {
    throw new Error('The Solana wallet did not return a valid ownership signature.');
  }

  return verifyWalletChallenge({
    challengeId: challenge.challengeId,
    signature: base58Encode(signatureBytes),
    walletProvider,
  });
}

export function browserWalletAvailability() {
  if (typeof document === 'undefined') return { evm: false, solana: false };

  const injected = globals();
  return {
    evm: Boolean(injected.ethereum),
    solana: Boolean(injected.solana),
  };
}

export async function connectAndVerifyBrowserWallet(chainFamily: WalletChainFamily) {
  ensureBrowserWalletRuntime();
  return chainFamily === 'EVM' ? connectEvmWallet() : connectSolanaWallet();
}
