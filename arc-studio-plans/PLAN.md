# VAD Market — Arc Testnet + Full Prediction Market Platform

## Summary

VAD Market (Value Asset Depot) is an existing, multi-layered prediction market and social conviction platform built on Expo / React Native, Supabase, and an EVM settlement contract. This plan continues development in the existing repository, wires real on-chain USDC trading and settlement to Arc Testnet, expands multi-category oracle resolution (sports, crypto, economics, politics, entertainment, and more), and connects the existing frontend to verified backend and on-chain functionality — without replacing anything that already works.

---

## Architecture Map

```
Expo + React Native (apps/mobile)  — existing, extend in place
  Expo Router (product) group      — 5 tabs: Home, Markets, Community, Portfolio, Wallet
  Features: home, markets, portfolio, wallet, account, admin, social,
            navigation, tour, notifications, growth, assistant
  Services: ~50 Supabase RPC / Edge Function service files
  Dynamic WaaS (v1.33.x)           — embedded EVM + Solana wallets
  viem                             — EVM tx encoding
  chain-core package               — auth assertion/validation helpers

Supabase (PostgreSQL + Auth + RLS + Edge Functions)
  ~120 migrations applied; all blockchain.* tables exist
  Schemas: public, private, market, trading, oracle, settlement, risk,
           ai, blockchain, integration, identity, policy, growth, notification
  Edge Functions (called): onchain-gateway, wallet-gateway
  RPC: my_market_onchain_venues, prepare_onchain_prediction,
       record_onchain_submission, my_onchain_positions, etc.

VadSettlementV1.sol (contracts/evm/)
  601 lines, Foundry test suite present
  NOT YET DEPLOYED to any testnet — Phase 2 blocker
  Deploy target: Arc Testnet (chain ID 5042002)

Oracle providers
  Table exists, no live adapters yet
  All 18 categories covered by verified free/public data sources — see Oracle Provider Map below
  No manual-only resolution: every category has an authoritative automated source
  Admin reviews fetched evidence before on-chain finalization (review ≠ sole source)

Dynamic WaaS wallet
  Social login (Google/Apple), email/password, free account
  EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID must be configured before Phase 5
```

---

## Key Decisions

| Decision | Choice |
|---|---|
| Testnet signer keys | Ephemeral fresh keys generated at deploy time; no real value |
| Oracle strategy | Fully automated data-driven resolution for all 18 categories — no manual fallback. Each category maps to a verified free/public authoritative source. Admin can review evidence before finalising resolution; admin cannot be the only source of truth. |
| Wallet | Dynamic WaaS — social login (Google, Apple), email auth |
| Build order | Full phased plan in order; Phase 2 first |

---

## Audit Findings (Phase 1 — complete)

### Contract
- `VadSettlementV1.sol` — sound, no architectural changes needed. EIP-712 lock/settle, reentrancy guard, malleable-sig guard, two-step admin transfer, immutable settlement token, non-settlement token recovery only. Ready for testnet deploy.
- Foundry test suite (`VadSettlementV1.t.sol`) present and covers happy path. Needs fork test and edge-case extensions.
- Deploy script (`DeployVadSettlementV1.s.sol`) ready; use `ALLOW_NON_MAINNET_DEPLOY=true` for testnet.

### Database
- All `blockchain.*` tables exist (chains, asset_representations, contract_deployments, wallet_connections, transaction_intents, transaction_authorizations, transactions, positions, settlement_entitlements).
- ARC_TESTNET registered: chain ID 5042002, USDC `0x3600000000000000000000000000000000000000`, RPC `https://rpc.testnet.arc.network`, explorer `https://testnet.arcscan.app`. All DISABLED pending admin activation.
- Arc Mainnet registered: chain ID 5042, same USDC address. DISABLED pending security review.
- TNGN correctly retired across migrations 20261023–20261024. Hard-stopped in trading ticket. Do not touch.
- `onchain-gateway` Edge Function called for prepare_prediction, record_submission, check_intent, fail_intent, prepare_settlement. Wiring exists; Edge Function implementation must exist server-side.

### Frontend
- Trading ticket handles POOL (USDC + NGN), ORDER_BOOK (NGN), TNGN (hard-stopped), UnsupportedUsdcOrderBook (order-book USDC blocked — POOL only).
- Crypto assets (prices/tickers) already separated from prediction markets (`crypto-assets.tsx` and `financial-markets.tsx` routes are distinct).
- `presentation_profile` field on instruments: EVENT, CRYPTO, SPORTS, MUSIC, AI, STOCKS, ECONOMICS, ENTERTAINMENT, PUBLIC_EVENTS + extensible.
- Win/loss share cards exist in `result-card-share.ts`; winner celebration overlay present.

### Wallet
- Dynamic WaaS fully integrated on native and web variants.
- Wallet verification (challenge/sign) via `wallet-gateway` Edge Function.
- `verified-wallet-api` guards all on-chain actions — wallet must be VERIFIED before any lockPosition.

### Risks
| Risk | Severity |
|---|---|
| VadSettlementV1 not deployed to any testnet | High — Phase 2 blocker |
| Arc Testnet RPC/chain-ID may have changed since migration | Medium — verify before activation |
| Testnet signer key management and rotation plan | High — ephemeral keys chosen; document custody |
| `onchain-gateway` Edge Function implementation not in repo | High — must exist server-side in Supabase |
| Oracle provider API rate limits on free tiers | Medium — monitor; upgrade plan if needed |
| USDC ORDER_BOOK blocked in UI (POOL only) | Low — by design |

---

## Oracle Provider Map

Every category resolves from an authoritative automated source. The adapter fetches the outcome and hashes evidence on-chain. Admin reviews the fetched evidence before calling `resolveMarket` — admin cannot invent an outcome, only confirm or dispute what the data source returned.

| Category group | VAD categories | Primary data source | Free tier |
|---|---|---|---|
| Sports & esports | Sports, esports | **API-Football** (free tier, 100 req/day) + **ESPN public scores API** (unofficial public, no key) | Yes |
| Crypto predictions | Crypto price predictions | **CoinGecko Demo** API — `/simple/price`, `/coins/markets`; 100 calls/min, 10k/mo | Yes |
| Economics | Inflation, CPI, GDP, employment, FOMC rates | **MacroRadar** (keyless, CORS-open, 1hr cache — CPI, UNRATE, FEDFUNDS, GDP) + **StatisticsOfTheWorld** (1k req/day, 337 indicators from World Bank/IMF/Eurostat) | Yes |
| Politics & elections | Elections, referenda, public policy votes | **Global Election Index** — verified official results, election stage windows, resolvable sources flag; free REST | Yes |
| Financial markets | Stock indices, commodities, forex, interest rates | **MacroRadar** (indices, policy rates) + **Alpha Vantage** free tier (stock/forex, 25 req/day) + **CoinGecko** for crypto indices | Yes |
| Weather & climate | Weather outcomes, temperature, hurricanes | **Open-Meteo** (free, no key, global current + historical) + **Weather.gov** (official US NWS, no key) | Yes |
| Entertainment | Awards (Oscars, Grammy, BAFTA), box office, chart positions | **TMDB** (free, no hard rate limit — movie/TV releases, box office, award-nominated films) + **iTunes Search API** (no key — chart/music data) | Yes |
| Science & technology | AI milestones, space launches, scientific findings | **pdata.world** cross-reference (free, no key — Polymarket/Kalshi/Metaculus resolution data across tech and science categories) | Yes |
| Business & companies | Product launches, earnings, company events | **Alpha Vantage** earnings calendar (free tier) + **pdata.world** cross-reference | Yes |
| Law & regulation | Court decisions, regulatory approvals | **pdata.world** + **ClearMarket** resolution clarity grades (free, 1k req/day — named resolution sources from Kalshi/Polymarket) | Yes |
| Health & medical | Drug approvals, health statistics | **pdata.world** + official public health agency feeds (WHO, CDC — public REST) | Yes |
| Geopolitics & international | Treaties, conflicts, international agreements | **pdata.world** + **ClearMarket** resolution evidence cross-reference | Yes |
| Social trends | Internet culture, viral events, social statistics | **pdata.world** cross-reference (Polymarket/Kalshi social category) | Yes |
| Transport, infrastructure, energy, agriculture, real estate | Infrastructure milestones, energy policy, crop reports | **StatisticsOfTheWorld** (energy, agriculture, trade indicators) + **pdata.world** | Yes |
| Rankings & competitions | Public competitions, rankings, leaderboards | **pdata.world** + **TMDB** (film/TV award rankings) | Yes |
| Education & academic | Academic events, university rankings | **pdata.world** cross-reference | Yes |
| Other public events | Catch-all approved events | **pdata.world** + **ClearMarket** (authoritative named sources where available) | Yes |

**Cross-reference layer (all categories):** pdata.world and ClearMarket are always available as secondary evidence sources. ClearMarket's `source_status` and named resolution source provide an independent cross-check for any market where the primary source agrees. This creates multi-source evidence hashing for disputed categories.

**Rate limit safety:** all free tiers listed above are sufficient for VAD's market volume at launch. Provider records in `integration.providers` include `rate_limit_per_day` and `current_usage` fields; the adapter layer enforces per-provider budgets before making external calls.

---

## Files to Create / Modify

### Phase 2 — Foundation and Arc Testnet Verification
1. `contracts/evm/README.md` — add testnet deployment record section (address, tx hash, block)
2. `supabase/migrations/YYYYMMDD_arc_testnet_verify_config.sql` — verify/correct chain ID, RPC, explorer, confirmation_target from current Circle/Arc docs
3. `supabase/migrations/YYYYMMDD_arc_testnet_activation.sql` — activate ARC_TESTNET chain, USDC token rep, NG jurisdiction route, contract_deployments row, instrument venue after deploy
4. `apps/mobile/src/services/usdc-wallet-api.ts` — extend to expose USDC balance from Arc Testnet RPC
5. `apps/mobile/.env.example` — document all required env vars including `EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID`

### Phase 3 — Settlement Integration
6. `apps/mobile/src/services/settlement-wallet.native.ts` — verify Arc Testnet chain ID handled; add missing error paths for USDC native-gas approval flow
7. `apps/mobile/src/services/onchain-settlement.native.ts` — verify claim + refund flows; extend error messages
8. `apps/mobile/src/services/onchain-settlement.ts` — web parity
9. `apps/mobile/src/services/onchain-api.ts` — add `getOnchainPositionDetail` helper for reconciliation screen
10. `packages/chain-core/src/index.ts` — add ARC_TESTNET chain descriptor constant
11. `contracts/evm/test/VadSettlementV1.t.sol` — extend: fork test, voided-market, lost-position, replay-attack

### Phase 4 — Market Categories and Oracle
12. `supabase/migrations/YYYYMMDD_category_registry_expansion.sql` — all 18 categories in DB; preserve existing IDs
13. `supabase/migrations/YYYYMMDD_oracle_provider_adapters.sql` — register all oracle providers from the Oracle Provider Map in `integration.providers`; each row stores adapter_key, base_url, free_tier_rate_limit, and category_codes[]
14. `supabase/migrations/YYYYMMDD_oracle_resolution_evidence.sql` — add evidence_url, evidence_source, evidence_fetched_at, dispute_period_hours to oracle.resolutions if absent
15. `backend/domains/providers/oracle-adapter-interface.ts` — OracleAdapterContract interface (fetchOutcome, evidenceHash, healthCheck, categorySupport)
16. `backend/domains/providers/adapters/api-football-adapter.ts` — sports/esports scores and results, API-Football free tier
17. `backend/domains/providers/adapters/espn-public-adapter.ts` — ESPN public scores API (unofficial but public), additional sports coverage
18. `backend/domains/providers/adapters/coingecko-adapter.ts` — crypto prices, market cap, coin metadata; CoinGecko Demo (free, 10k calls/mo, 100/min)
19. `backend/domains/providers/adapters/openmeteo-adapter.ts` — weather/climate resolution; Open-Meteo (free, no key, global coverage)
20. `backend/domains/providers/adapters/macroradar-adapter.ts` — economics: CPI, inflation, unemployment, FOMC; MacroRadar free keyless API
21. `backend/domains/providers/adapters/statistics-of-world-adapter.ts` — economics: GDP, trade, employment from official agencies; StatisticsOfTheWorld free 1k req/day
22. `backend/domains/providers/adapters/global-election-index-adapter.ts` — politics/elections: verified official results, election calendars, stage windows; GlobalElectionIndex free API
23. `backend/domains/providers/adapters/tmdb-adapter.ts` — entertainment: box office, awards history, movie/TV release data; TMDB free (no rate limit for reasonable use)
24. `backend/domains/providers/adapters/pdata-adapter.ts` — multi-category cross-venue prediction market probability feed (Polymarket, Kalshi, Metaculus, Manifold); pdata.world free, no key; used as secondary signal/cross-check for any category not covered by a primary authoritative source
25. `backend/domains/providers/adapters/clearmarket-adapter.ts` — resolution clarity grades and named sources for Kalshi + Polymarket markets; ClearMarket free, 1k req/day anonymous; used as resolution evidence cross-reference
26. `apps/mobile/src/features/admin/sections/` — extend oracle/resolution admin: shows fetched evidence (source, timestamp, value), evidence hash, admin confirms or flags dispute before on-chain finalization
27. `apps/mobile/src/services/market-api.ts` — extend `presentation_profile` to all 18 category codes; extend category filter

### Phase 5 — Frontend Connection
21. `apps/mobile/src/features/markets/components/trading-ticket.tsx` — verify USDC POOL → Arc Testnet path; add network indicator; improve USDC approval UX
22. `apps/mobile/src/features/wallet/onchain-positions-panel.tsx` — live Arc Testnet data; LOCKED/SETTLED/REFUNDED status; explorer links
23. `apps/mobile/src/features/wallet/onchain-activity-panel.tsx` — live testnet tx history; on-chain confirmation indicator
24. `apps/mobile/src/features/wallet/usdc-wallet-balances.tsx` — verified USDC balance from Arc Testnet; pending vs confirmed
25. `apps/mobile/src/features/wallet/embedded-wallet-modal.tsx` — Dynamic WaaS social + email; wallet address with copy button
26. `apps/mobile/src/features/portfolio/portfolio-screen.tsx` — USDC on-chain positions section; gross payout, settlement fee, net payout
27. `apps/mobile/src/features/portfolio/result-card-share.ts` — USDC 6-decimal display; "USDC" asset label on share cards
28. `apps/mobile/src/features/home/home-screen.tsx` — confirm DB-driven category nav; no TNGN demo widget
29. `apps/mobile/src/providers/currency-preference-provider.tsx` — confirm TNGN not presented as default post-retirement

### Phase 6 — Verification and Security
30. `contracts/evm/test/VadSettlementV1.t.sol` — final security tests: replay, wrong signer, malleable sig, escrow underflow, pause, void, lost, won
31. `supabase/migrations/YYYYMMDD_settlement_accounting_invariants.sql` — DB-level check view: locked collateral per market vs marketEscrow
32. `apps/mobile/src/services/onchain-api.ts` — reconciliation helper: DB position status vs on-chain position status
33. `backend/tests/` — integration tests for onchain-gateway: prepare_prediction, record_submission, check_intent, fail_intent

### Phase 7 — Final Report
34. `arc-studio-plans/FINAL_REPORT.md` — changed files, migrations, deployment addresses, testnet tx evidence, risks, mainnet checklist

---

## Build Sequence

1. Verify Arc Testnet config (chain ID 5042002, RPC, USDC address) against current Circle/Arc docs. Write correction migration if anything changed.
2. Generate ephemeral keypairs for quoteSigner, settlementSigner, resolver, treasury. Store securely (not committed).
3. Deploy VadSettlementV1 to Arc Testnet with `ALLOW_NON_MAINNET_DEPLOY=true`. Record address and tx hash.
4. Write and apply activation migration: activate chain, token rep, jurisdiction route, contract_deployments row, instrument venue. Verify `my_crypto_network_runtime()` returns ARC_TESTNET row.
5. Configure `EXPO_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. Create test account via social login and email. Verify EVM embedded wallet created.
6. Run Foundry test suite; add fork test against Arc Testnet. All tests must pass.
7. End-to-end USDC POOL lifecycle: fund wallet → approve → lockPosition → resolveMarket (resolver key) → settlePosition (claim). Verify PositionLocked, MarketResolved, PositionSettled events on-chain.
8. Refund path: voided market → settlePosition → full collateral returned, zero fee, on-chain.
9. Lost position: losing outcome → NO_ACTION path in DB; zero payout enforced on-chain.
10. Category registry migration: all 18 categories; existing IDs preserved.
11. Oracle adapter interface + all 9 provider adapters (API-Football, ESPN-public, CoinGecko, Open-Meteo, MacroRadar, StatisticsOfWorld, GlobalElectionIndex, TMDB, pdata/ClearMarket cross-reference).
12. Admin oracle section: evidence review UI — admin sees fetched evidence before confirming on-chain finalization; no category relies on admin as the sole source of truth.
13. Frontend wiring: trading ticket, onchain positions panel, wallet balances, portfolio USDC section.
14. Security test pass: replay attack, wrong signer, wrong resolution hash, pauseNewLocks, escrow underflow — all revert correctly.
15. Mobile layout audit: no overlapping nav bars; correct at all breakpoints.
16. Final report with all evidence.

---

## Done When

- [ ] `forge test --root contracts/evm -vvv` passes including fork test on Arc Testnet
- [ ] VadSettlementV1 deployed to Arc Testnet; address in DB and README
- [ ] `my_crypto_network_runtime()` returns ARC_TESTNET row for an eligible user
- [ ] Test USDC POOL market creatable via admin APIs on ARC_TESTNET
- [ ] Lock, resolve, claim tx hashes verifiable on Arc Testnet explorer
- [ ] Voided market refund verifiable on-chain
- [ ] Replay attack (duplicate authorizationId) reverts with `AuthorizationAlreadyUsed`
- [ ] Wrong-user settlement reverts with `Unauthorized`
- [ ] Wrong resolution hash reverts with `InvalidResolution`
- [ ] Dynamic WaaS social + email creates EVM wallet and can sign transactions
- [ ] All 18 market categories in DB; no hardcoded categories in app code
- [ ] All 9 oracle provider adapters registered as configurable rows in `integration.providers`
- [ ] Every category in the Oracle Provider Map has an active adapter that can fetch and hash evidence
- [ ] Admin evidence-review UI shows source, fetched value, and evidence hash before on-chain finalization
- [ ] No category depends on admin as the sole source of truth
- [ ] Markets screen category filter is 100% DB-driven; all 18 categories browsable
- [ ] Portfolio USDC section shows locked, settled, and refunded positions
- [ ] Wallet screen shows verified Dynamic address and on-chain USDC balance
- [ ] Win/loss share cards display correct USDC amounts
- [ ] No TNGN demo widget on Home, Wallet, or Portfolio
- [ ] No duplicate tab bars on mobile
- [ ] Existing NGN, NGN order book, and NGN pool trading untouched
- [ ] Integration tests for onchain-gateway Edge Function pass
- [ ] Final report documents all changes, tx evidence, and mainnet activation checklist
