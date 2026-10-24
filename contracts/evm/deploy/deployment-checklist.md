# VAD Settlement V1 — Full Deployment Checklist
Phase 2 / Phase 3 gating steps. Complete in order.

---

## Step 1: Install arc-forge (local machine)
```sh
bash contracts/evm/deploy/install-arc-foundry.sh
arc-forge --version   # must print Arc Foundry version
```
Standard `forge` will NOT work for deployment — Arc uses its own fork.

---

## Step 2: Fund deployer wallet on Arc Testnet
Address: `0x52dAe9a2ae632Df8b4f5db1C7D2FE1A9e45992D2`

Go to https://faucet.circle.com, select **Arc Testnet**, select **USDC**, paste the address.
Repeat for treasury: `0x9a85eCc03742F34b184528AC7150A66D2B8cD161`

Minimum: 1 USDC each (USDC pays gas on Arc).

---

## Step 3: Create local .env.testnet (never commit this file)
```sh
cat > .env.testnet << 'EOF'
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io
ARC_USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
VAD_DEPLOYER_PRIVATE_KEY=0x<deployer private key from testnet-keys.md>
VAD_ADMIN=0x52dAe9a2ae632Df8b4f5db1C7D2FE1A9e45992D2
VAD_QUOTE_SIGNER=0x1394c9c507f5640953EB03bBf5DFA8d11F7f634b
VAD_SETTLEMENT_SIGNER=0xe732881D5b561EA8B70A5B5e65c4ace10c757F3a
VAD_RESOLVER=0xE98598caE77D7D6e73470f77D509E155B0C780Cd
VAD_TREASURY=0x9a85eCc03742F34b184528AC7150A66D2B8cD161
ALLOW_NON_MAINNET_DEPLOY=true
EOF
```

---

## Step 4: Deploy VadSettlementV1
```sh
source .env.testnet
arc-forge script contracts/evm/script/DeployVadSettlementV1.s.sol:DeployVadSettlementV1 \
  --root contracts/evm \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --broadcast
```
Record the deployed contract address from the output.
Verify on https://explorer.testnet.arc.io using the tx hash.

---

## Step 5: Apply Supabase migrations
```sh
# Apply config correction first
supabase db push  # or apply via Supabase dashboard / CLI

# Edit 20261024110000_arc_testnet_activation.sql:
# Replace '0x_REPLACE_WITH_DEPLOYED_CONTRACT_ADDRESS' with the actual address
# Then apply:
supabase db push
```

---

## Step 6: Set Supabase Edge Function secrets
In Supabase Dashboard → Edge Functions → Secrets, add:

| Secret name | Value |
|---|---|
| `VAD_EVM_QUOTE_SIGNER_PRIVATE_KEY` | 0x4c0596bf48df9b0732cf1c0aef65fde3c266fecef7f5a35110e508657f43f051 |
| `VAD_EVM_SETTLEMENT_SIGNER_PRIVATE_KEY` | 0x679b5118b857abe3bc46b32ee7d90d14aeeed8bfce2afb8a962db7852a3f2505 |
| `VAD_EVM_RESOLVER_PRIVATE_KEY` | 0x3dfc95e815229a7fcac5b93906d4d597733cad84179619012c16a02b76ce3041 |

Or via CLI:
```sh
supabase secrets set VAD_EVM_QUOTE_SIGNER_PRIVATE_KEY=0x4c0596bf48df9b0732cf1c0aef65fde3c266fecef7f5a35110e508657f43f051
supabase secrets set VAD_EVM_SETTLEMENT_SIGNER_PRIVATE_KEY=0x679b5118b857abe3bc46b32ee7d90d14aeeed8bfce2afb8a962db7852a3f2505
supabase secrets set VAD_EVM_RESOLVER_PRIVATE_KEY=0x3dfc95e815229a7fcac5b93906d4d597733cad84179619012c16a02b76ce3041
```
These are TESTNET ephemeral keys with no real value.

---

## Step 7: Verify the Edge Function reads signers
Call the admin signer status action (requires a super-admin JWT):
```sh
curl -X POST "$SUPABASE_URL/functions/v1/onchain-gateway" \
  -H "Authorization: Bearer <super-admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"action":"admin_signer_status"}'
```
Expected: `{"ok":true,"signers":{"quote":{"configured":true,"address":"0x1394..."},...}}`

---

## Step 8: Verify onchain-gateway can prepare predictions
Enable the ARC_TESTNET chain in DB (migration already handles this), create a test market, and test-trade via the app. Check traces.

---

## Step 9: Update AGENTS.md contract address
Once deployed, update the VAD Settlement V1 deployment record in AGENTS.md with:
- Contract address
- Deploy tx hash
- Block number

---

## Checklist status
- [x] arc-forge install script written (contracts/evm/deploy/install-arc-foundry.sh)
- [ ] arc-forge installed on deployer machine
- [ ] Deployer wallet funded via faucet
- [x] Testnet config correction migration written
- [x] Testnet activation migration written (awaiting contract address)
- [x] 23/23 Foundry unit tests pass
- [ ] VadSettlementV1 deployed to Arc Testnet
- [ ] Activation migration applied
- [ ] Edge Function secrets set
- [ ] End-to-end trade verified on Arc Testnet
