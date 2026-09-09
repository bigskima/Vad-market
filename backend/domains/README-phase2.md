# VAD Phase 2 execution boundary

VAD uses PostgreSQL RPC/functions for deterministic, transactional internal commands and reserves Supabase Edge Functions for external boundaries.

## PostgreSQL owns

- authenticated market proposal submission
- canonical fingerprinting
- ledger account creation and balance derivation
- internal ledger transfers
- order fund reservation
- order placement and cancellation
- owner-scoped wallet/order reads
- oracle policy maker/checker state transitions
- canonical market approval/merge
- oracle-policy binding
- asset/jurisdiction eligibility enforcement
- market instrument/outcome creation

## Edge Functions own

- payment provider webhooks and external API calls
- KYC provider calls/webhooks
- AI provider calls
- external oracle/data-provider ingestion
- notification provider calls
- runtime orchestration where multiple external services are involved

Do not create one Edge Function per internal domain command. Financial invariants should remain inside atomic PostgreSQL transactions wherever practical.
