# Supabase migration reconciliation

This repository is being aligned to the connected VAD Market Supabase project without replaying production SQL.

## Reconciled on 2026-09-19

- 32 repository migrations whose normalized SQL exactly matched live Supabase history were renamed to the live migration versions.
- 17 migrations that existed in Supabase history but not in the repository were imported from `supabase_migrations.schema_migrations.statements`.
- Current crypto migrations are version-aligned with Supabase:
  - `20260919082923_crypto_settlement_foundation.sql`
  - `20260919083217_crypto_settlement_fk_indexes.sql`
  - `20260919085322_wallet_verification_foundation.sql`
- Deployed Edge Function source was compared with the repository; `identity-gateway` was updated to the repository source.

## Remaining historical exceptions

The following repository revisions are intentionally kept because their SQL is not byte-equivalent to the older live migration with the same logical name, or because they are composite/reconciliation revisions whose effects are already partly present in the live schema:

- `20260911093000_phase_forty_oracle_scheduler.sql`
- `20260911102500_phase_forty_scheduler_portability.sql`
- `20260911104500_phase_forty_one_oracle_finalization.sql`
- `20260911110000_phase_forty_one_auto_finalization_hardening.sql`
- `20260912052500_fix_user_assistant_provider_fallback.sql`
- `20260912231500_tester_access_and_market_creation_usability.sql`
- `20260912234500_automatic_resolution_and_test_ngn.sql`
- `20260913051500_fix_admin_market_creation_runtime.sql`
- `20260918010000_admin_liquidity_choice_and_market_ai.sql`
- `20260918055500_automatic_official_public_record_resolution.sql`
- `20260918061000_generic_public_record_oracle.sql`
- `20260918070000_generic_evidence_gateway_admin_wiring.sql`

Do not use an unattended blanket `supabase db push` until these historical exceptions are converted into a single verified repository-state reconciliation migration or archived with equivalent state captured in a later migration.

New migrations created after this reconciliation must use the exact version returned by the linked Supabase project and be committed immediately.
