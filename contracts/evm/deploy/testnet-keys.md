# Arc Testnet Ephemeral Keys — VAD Settlement V1
Generated: 2026-10-24. TESTNET ONLY. No real value.

## Network
- RPC: https://rpc.testnet.arc.io
- Chain ID: 5042002
- USDC: 0x3600000000000000000000000000000000000000

## Roles
| Role | Address |
|---|---|
| Deployer / Admin | 0x52dAe9a2ae632Df8b4f5db1C7D2FE1A9e45992D2 |
| Quote Signer | 0x1394c9c507f5640953EB03bBf5DFA8d11F7f634b |
| Settlement Signer | 0xe732881D5b561EA8B70A5B5e65c4ace10c757F3a |
| Resolver | 0xE98598caE77D7D6e73470f77D509E155B0C780Cd |
| Treasury | 0x9a85eCc03742F34b184528AC7150A66D2B8cD161 |

## Required .env.testnet variables (create this file locally, never commit)
```
ARC_TESTNET_RPC_URL=https://rpc.testnet.arc.io
ARC_USDC_TOKEN_ADDRESS=0x3600000000000000000000000000000000000000
VAD_DEPLOYER_PRIVATE_KEY=<deployer private key>
VAD_ADMIN=0x52dAe9a2ae632Df8b4f5db1C7D2FE1A9e45992D2
VAD_QUOTE_SIGNER=0x1394c9c507f5640953EB03bBf5DFA8d11F7f634b
VAD_SETTLEMENT_SIGNER=0xe732881D5b561EA8B70A5B5e65c4ace10c757F3a
VAD_RESOLVER=0xE98598caE77D7D6e73470f77D509E155B0C780Cd
VAD_TREASURY=0x9a85eCc03742F34b184528AC7150A66D2B8cD161
ALLOW_NON_MAINNET_DEPLOY=true
VAD_SETTLEMENT_V1_ADDRESS=  # fill after deploy
```

## Deploy command (after arc-forge install and .env.testnet populated)
```sh
source .env.testnet
arc-forge script script/DeployVadSettlementV1.s.sol:DeployVadSettlementV1 \
  --root contracts/evm \
  --rpc-url "$ARC_TESTNET_RPC_URL" \
  --broadcast
```

## Post-deploy
1. Record VAD_SETTLEMENT_V1_ADDRESS from output
2. Fund the deployer/treasury addresses via https://faucet.circle.com (select Arc Testnet + USDC)
3. Apply supabase/migrations/20261024110000_arc_testnet_activation.sql with the contract address
