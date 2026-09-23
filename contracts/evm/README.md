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