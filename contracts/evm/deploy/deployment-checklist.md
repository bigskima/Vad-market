# VAD Settlement V1 — Arc Testnet Deployment & Verification

## Current state: verify before redeploying

The connected Supabase project already contains an ACTIVE `ARC_TESTNET` record and an ACTIVE `VAD_SETTLEMENT_V1` registry row for:

- Chain ID: `5042002`
- Existing registered contract: `0x73EE420e1089861c1e0b767d7AA367736322B2B6`
- USDC ERC-20: `0x3600000000000000000000000000000000000000` (6 decimals)
- Official Arc Testnet RPC: `https://rpc.testnet.arc.io`
- Official explorer: `https://explorer.testnet.arc.io`

**Do not deploy a second contract merely because Arc Studio added a deployment checklist.** A database row records configuration; it does not prove that bytecode exists at the address or that it matches the current source. Verify the existing deployment first.

## Step 1 — Install and pin the Arc-compatible toolchain

Follow the currently published Arc instructions and verify the downloaded release. Use `arc-forge` / `arc-cast` if required by the supported Arc toolchain. Do not run a remote install script without reviewing it first.

## Step 2 — Verify the network and existing contract

Set the official endpoint locally:

```sh
export ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io
arc-cast chain-id --rpc-url "$ARC_TESTNET_RPC_URL"
```

Expected chain ID: `5042002`.

Check whether code exists at the existing registered contract:

```sh
arc-cast code 0x73EE420e1089861c1e0b767d7AA367736322B2B6 --rpc-url "$ARC_TESTNET_RPC_URL"
```

If the result is `0x`, no contract bytecode exists at that address on the queried network. If bytecode exists, call and record the contract's `settlementToken()`, `quoteSigner()`, `settlementSigner()`, `resolver()`, `treasury()`, and `admin()` getters. Verify the chain ID and transaction on the official explorer, and compare the deployed bytecode/source against this repository's current contract version.

## Step 3 — Decide whether redeployment is needed

- **Reuse the existing contract** if bytecode is present, the deployed version matches the application/ABI, and its signer/admin/token configuration is correct. Keep the existing address and database record; do not run a second deployment or an activation migration.
- **Deploy a new testnet contract only if verification fails or the deployed version is incompatible.** A normal deployment script does not let you choose an arbitrary existing contract address. The transaction creates a new address from the deployer account and its nonce. Record the new address and deployment transaction after verification, then update the existing registry row using the schema actually present in Supabase.
- Never activate a contract merely because a SQL migration contains an address. Verify bytecode and constructor roles first.

## Step 4 — Reuse existing Supabase signer secrets only after matching addresses

The existing database row records the quote signer, settlement signer, and resolver as the same address (`0x521436a148bcbca08b83c8c4a601abdc55eb3ac2`) and records treasury as `0x5fbe1b76947b78c7dcc96991f0a99aff9fda6b36`. These are public addresses, not private keys.

Use the authenticated admin signer-status action in `onchain-gateway` to see which signer roles are configured and which addresses the existing Supabase Edge Function secrets derive. Compare those results with the on-chain getters. If they match, keep using the existing secrets; do not replace them with a new set of addresses from a draft checklist. If they do not match, resolve the mismatch before testing trades.

**Never store private keys in Git, migrations, logs, this checklist, or client-side variables.** Keep signing keys in Supabase Edge Function secrets. Do not fetch, print, or copy their values into the repository.

## Step 5 — Deployment wallet is separate from user wallets and signer secrets

Only if a new contract is required, use a dedicated, testnet-only deployer wallet with testnet USDC for gas. Its private key belongs in a local, ignored environment file or secret manager. The deployment key is distinct from the quote/settlement/resolver keys unless intentionally configured otherwise.

```sh
# Store locally; never commit this file.
VAD_DEPLOYER_PRIVATE_KEY=<testnet-only-deployer-private-key>
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io
ARC_USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
VAD_ADMIN=<chosen-admin-address>
VAD_QUOTE_SIGNER=<verified-quote-signer-address>
VAD_SETTLEMENT_SIGNER=<verified-settlement-signer-address>
VAD_RESOLVER=<verified-resolver-address>
VAD_TREASURY=<verified-treasury-address>
ALLOW_NON_MAINNET_DEPLOY=true
```

Run the project's reviewed Arc deployment command, then record the deployed address, transaction hash, block number, and role addresses. Do not hardcode new keys into Supabase migrations. Do not use any testnet key on mainnet.

## Step 6 — Reconcile and push Supabase migrations

The live `blockchain.contract_deployments` schema has no `deployer_address` or `deploy_tx_hash` columns; deployment metadata belongs in its existing `metadata` JSONB field. The live database already has an active deployment row. Do not insert a placeholder deployment or blindly activate the chain again.

The Arc Testnet config-correction migration only updates the RPC/explorer metadata to the currently documented endpoints. Review it, confirm the migration history and dry-run show only intended changes, then push it through the normal migration workflow. Do not apply the removed placeholder activation migration. If a new contract is ever deployed, create a separate, schema-correct reconciliation migration using the real address and transaction evidence.

## Step 7 — End-to-end acceptance tests

1. `arc-forge build --root contracts/evm` and `arc-forge test --root contracts/evm -vvv` pass.
2. Verify contract bytecode, token address, signer/admin getters, and the deployment transaction on Arc Testnet.
3. Confirm the existing Supabase signer-status addresses match the deployed contract.
4. Complete a real testnet USDC position lock through the existing VAD Market application.
5. Verify indexed transaction/receipt and position records; resolve a test market; test winner payout, losing position, void/refund, expired signatures, and replay rejection.
6. Confirm the UI only reports success after a verified transaction and reconciled receipt.

No Arc Mainnet deployment or real-fund activation is part of this checklist.
