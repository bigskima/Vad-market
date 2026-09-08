# VAD backend domains

VAD begins as a modular monolith. Each folder owns a business boundary, while
Supabase supplies PostgreSQL, Auth, Storage, Realtime, and Edge Functions.

The dependency direction is database → domain service → policy → provider
adapter → Edge/API → client. Mobile and web clients may present decisions, but
they must never calculate authoritative eligibility, fees, balances, outcomes,
or settlement.

Phase 1 establishes `identity`, `policies`, `ledger`, `providers`, and `audit`.
Later domains must call those foundations instead of reimplementing them.
