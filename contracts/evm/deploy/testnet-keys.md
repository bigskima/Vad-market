# Arc Testnet Keys and Existing Deployment

**Purpose:** configuration reference only. Never store private keys in this file or in Git.

## Existing deployment registry record

The connected Supabase project currently records:

- Network: Arc Testnet, chain ID `5042002`
- Registered VAD Settlement V1 contract: `0x73EE420e1089861c1e0b767d7AA367736322B2B6`
- USDC ERC-20: `0x3600000000000000000000000000000000000000` (6 decimals)
- RPC: `https://rpc.testnet.arc.io`
- Explorer: `https://explorer.testnet.arc.io`

The deployment row is marked ACTIVE in Supabase, but this is not enough to prove bytecode exists or that the deployed source matches the current repository. Verify chain ID, `eth_getCode`, contract getters, and explorer transaction before deciding to reuse or redeploy.

## Recorded role addresses

The current Supabase deployment metadata records quote signer, settlement signer, and resolver as the same public address:

`0x521436a148bcbca08b83c8c4a601abdc55eb3ac2`

The recorded treasury address is:

`0x5fbe1b76947b78c7dcc96991f0a99aff9fda6b36`

These are public addresses, not private keys. Use the authenticated `admin_signer_status` action in the existing `onchain-gateway` to confirm which signer secrets are configured and which addresses they derive. Compare these with the verified on-chain getters before trading. Do not overwrite existing Supabase signer secrets with candidate addresses from a draft plan.

## Key handling

- Existing quote/settlement/resolver private keys, if configured, must remain in Supabase Edge Function secrets.
- A deployment private key is separate from backend signing secrets unless intentionally assigned to both roles.
- If verification confirms the existing contract and signer configuration are correct, reuse them; no redeployment is required.
- If deployment is genuinely necessary, use a dedicated testnet-only deployer key in a local ignored environment file or secret manager. The deployer must have testnet USDC for gas. A normal deployment creates a new contract address; the existing address cannot simply be selected by supplying a private key.
- Never commit private keys, paste them into a migration, expose them in client-side environment variables, or use testnet keys on mainnet.
