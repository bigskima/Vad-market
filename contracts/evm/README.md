# VAD Settlement V1 — EVM

This package contains the reference EVM settlement contract for VAD's USDC rail.

## Economic boundary

The contract is not VAD's fee-policy database. Trading and settlement fee rates, minimums, and maximums remain in the existing VAD FEES policy domain and Admin Dashboard. The trusted VAD quote/settlement service resolves the exact fee amount and active policy-version ID, then signs those immutable values.

The user signs/submits the resulting transaction. Changing any amount, fee, or policy-version value invalidates the VAD authorization.

## Flow

1. VAD canonical market and jurisdiction policy determine whether USDC trading is allowed.
2. VAD's existing fee engine resolves the trading fee and records the fee policy version.
3. The quote signer authorizes collateralAmount, tradingFeeAmount, and tradingFeePolicyVersion.
4. lockPosition transfers collateral plus fee from the user's self-custody wallet. The fee goes to the configured VAD treasury; collateral stays escrowed.
5. The canonical oracle/resolution engine resolves the market through the resolver role.
6. VAD calculates gross payout and settlement fee using the same governed settlement-fee policy used by the NGN rail.
7. The settlement signer authorizes the exact gross payout, fee amount, and policy version.
8. settlePosition enforces the canonical result and signed values, pays VAD's fee to treasury, and releases net payout to the user.

## Important properties

- One deployed protocol version can serve many VAD markets on a chain.
- The settlement token is immutable per deployment.
- There is deliberately no on-chain fee-rate setter.
- New position locks can be paused without blocking resolution or user settlement.
- A positive fee must carry a non-zero VAD fee-policy version ID.
- Direct callers cannot lower a fee after VAD signs the authorization.
- The configured settlement token cannot be recovered through the admin recovery path.

## Build and test

Run from the repository root:

```sh
forge build --root contracts/evm
forge test --root contracts/evm -vvv
```

The EVM contract workflow runs these commands on changes to `contracts/evm/**`.

## Guarded Arc Mainnet deployment

`script/DeployVadSettlementV1.s.sol` is a guarded deployment script. On Arc Mainnet it requires chain ID `5042` and the configured settlement token to equal `0x3600000000000000000000000000000000000000`. Non-mainnet deployment is blocked unless `ALLOW_NON_MAINNET_DEPLOY=true` is explicitly set; the override does not bypass the Arc Mainnet token-address check.

Required environment values (keep these in a secure local environment or secret manager; never commit them):

- `VAD_DEPLOYER_PRIVATE_KEY`
- `ARC_USDC_TOKEN_ADDRESS`
- `VAD_ADMIN` — preferably a controlled multisig
- `VAD_QUOTE_SIGNER`
- `VAD_SETTLEMENT_SIGNER`
- `VAD_RESOLVER`
- `VAD_TREASURY`
- `ARC_MAINNET_RPC_URL` for the RPC endpoint used by Foundry

After a formal security review and testnet lifecycle run, deploy with:

```sh
forge script script/DeployVadSettlementV1.s.sol:DeployVadSettlementV1 \
  --root contracts/evm \
  --rpc-url "$ARC_MAINNET_RPC_URL" \
  --broadcast
```

**Do not deploy or enable the production database switches yet.** Before mainnet deployment, confirm the official Arc documentation for chain ID and native USDC representation, fund the deployment account, review signer/admin custody, verify the source code using the currently supported official Arc explorer process, and complete end-to-end deposit/lock/resolve/claim/refund/reconciliation tests. The script intentionally does not store or print private keys.
