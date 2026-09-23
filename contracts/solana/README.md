# VAD Settlement V1 — Solana

This is the Solana counterpart to the EVM VAD Settlement V1 protocol.

## Fee governance

Trading and settlement fee rates are not configured in this program. VAD's existing governed FEES policy remains the source of truth. The backend resolves the exact fee amount and fee-policy version, then co-signs the Solana transaction with the configured quote or settlement signer. Because the signer signs the entire transaction message, the user cannot change collateral, payout, fee or policy-version arguments without invalidating the VAD signature.

The user's Dynamic embedded wallet is still required to sign the transaction and pay network fees. VAD gas sponsorship is not required.

## Roles

- admin: rotates protocol authorities and pauses only new locks
- quote signer: co-signs position locks after VAD policy/fee checks
- settlement signer: co-signs payout claims after VAD calculates the canonical payout
- resolver: writes the canonical VAD market result
- treasury: receives VAD trading and settlement fees

No fee-rate setter exists in the program.

## Testnet deployment

The checked-in program id is a build placeholder only. Generate and commit the real program keypair/id before the first Solana Devnet deployment, then register that deployment in VAD configuration when Supabase is connected.
