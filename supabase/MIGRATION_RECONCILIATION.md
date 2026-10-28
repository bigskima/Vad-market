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

## VAD Play production migration reconciliation — 2026-10-28

The VAD Play and tour SQL was applied to the linked production project after the combined application PR passed type-check, lint, tests, web build, SQL migration guard, full local PostgreSQL replay, and Play/tour pgTAP invariants.

The migration names and versions recorded by Supabase are now reflected by these repository files:

- `20261028192018_vad_play_foundation.sql`
- `20261028192102_vad_play_engines_and_ads.sql`
- `20261028192112_vad_play_prize_draw_runtime.sql`
- `20261028192121_vad_play_product_tour.sql`

Post-deploy checks confirmed the experience/campaign/ticket/draw/settlement tables and tour catalogue exist. The `GETTING_STARTED` tour now points to version `2026.10-vad-play`, including the enabled `play-hub-overview` step at `/play`.

The three game engines remain `REVIEW_REQUIRED` with `runtime_ready = false`; the direct-sponsor adapter remains `DISABLED`. No engine-enabling, paid-entry activation, or sponsor-enabling RPC was called. There were no new Edge Function source files in this feature, so no existing Edge Functions were redeployed.

Do not use an unattended blanket `supabase db push`. Preserve the recorded versions above and review the existing historical reconciliation exceptions before any broader database deployment.
