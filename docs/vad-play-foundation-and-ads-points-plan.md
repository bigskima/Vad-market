# VAD Play: foundation and ads-to-points plan

## Product direction

VAD Play is a universal entertainment hub inside VAD Market, not a single lucky-draw or spin app. The shared hub owns discovery, navigation, identity and eligibility entry points, activity history, and consistent visual treatment. Each activity type owns its own rules and server-side engine.

Potential modules include prize draws, spins and instant-win games, scratch-and-reveal, jackpots and pools, skill-led contests, partner experiences, and future formats. These are product ideas, not published or available experiences. Types and presentation metadata are database-driven. A new mechanic may still require a reviewed engine implementation; configuration must never make a missing engine appear operational.

## Foundation scope in this branch

- Add VAD Play to the existing product navigation.
- Add separate Discover, Games, and My Play screens plus an experience detail route.
- Load the visible catalogue from the play_experiences table. No sample campaigns, fabricated ticket counts, simulated balances, or locally invented activity rows are inserted.
- Search and type filters operate on the loaded database catalogue. My Play reads authenticated-user activity records only.
- Add initial tables for published experience metadata, configurable prize-campaign economics, and private participation history. Authenticated app users are read-only.
- Store prize cost, profit target mode/value, campaign cost budget, entry price, caps, schedule, lifecycle and audit timestamps in the database. Require explicit per-campaign economics rather than defaulting to an illustrative prize value or profit rate.
- Derive funding_threshold_amount in the database from that campaign's prize cost, explicitly configured profit target, and explicitly configured budgeted campaign expenses. Profit target mode, target value, and campaign cost budget must be supplied for each campaign; there is no preset currency threshold or default profit percentage. A percentage is interpreted as a percentage of that campaign's prize cost.
- Use the existing VAD brand image for the hub hero and database-provided HTTPS media URLs for individual experiences. Do not simulate three-dimensional assets in JavaScript or commit a static concept mockup as if it were a real feature.
- Include loading, retry, empty and not-available states instead of inventing catalogue contents.

## Deliberate non-goals

This foundation does not accept paid entries, run spins, calculate final odds, move money, issue points, mark ads complete, publish experiences, or execute prize draws. The schema models future configuration; the generated threshold does not itself make a campaign eligible for a draw. There are no seeded fictional experiences.

Before a real-money prize draw is activated, a separate server-side implementation must verify settled payment proceeds, deduplicate/replay-protect payment events, net applicable fees and refunds, and perform funding-threshold state transitions atomically. It must close entries and freeze the ticket set, reconcile balances, confirm the required prize and compliance conditions, authorize the draw, select a result through an auditable random process, verify the winner and track prize delivery. Expired or underfunded campaigns need a disclosed cancellation/refund workflow. A client must never authorize a draw.

## Follow-on game-engine architecture

1. Keep an experience registry with metadata, category/type keys, media, lifecycle state, eligibility policy, and a versioned engine key.
2. Route each interaction through the corresponding server-side engine. Shared backend services provide identity and eligibility checks, payment adapters, events/audit records, notifications, and the user's activity timeline.
3. Treat money movements as existing payment and financial-ledger records, not as play_participations rows.
4. Prize campaigns count only provider-verified, settled proceeds under the campaign's published financial definition. Refunds and chargebacks reduce qualified proceeds. Any percentage payment-processing cost should be explicitly incorporated into the net target calculation.
5. Draw authorization must require the configured funding threshold, closed and frozen entries, successful reconciliation, confirmed prize arrangements, compliance approval, and valid campaign rules. Keep audit evidence for review.
6. Instant-win outcome tables, chance weights, reward inventory and payout ceilings remain server-side, versioned and testable. The client cannot choose a result or report its own win.

## Ads and points redeemable for VAD rewards

The proposed feature is a separate Rewards service exposed inside VAD Play, with optional ad placements governed by an admin campaign console. Rewarded ads should be opt-in and clearly labelled. They must not interrupt essential wallet, account, security or prediction-market actions.

### Proposed user flow

1. The user opens Rewards and sees available earn methods, points balance sourced from the server, reward catalogue, eligibility, terms and daily limits.
2. The app requests a rewarded-ad session from the backend. The short-lived session ID is unique and tied to the user, placement, provider and eligible campaign.
3. Completion is verified through a trusted ad-provider callback where available. A client video-ended event or a button tap alone must not award points.
4. The backend verifies the provider transaction/event ID, session, user mapping, campaign dates, consent and region/age eligibility, frequency caps, available budget and fraud checks. Replayed completion callbacks are idempotent.
5. A successful completion appends a credit event to an immutable points ledger. The UI balance is derived from that ledger and server-side holds; the client cannot set its balance.
6. Redemption checks current points price, available inventory, eligibility and fulfilment requirements atomically. Points are reserved once; a failed redemption releases or reverses the reservation with an auditable ledger entry.
7. The user sees pending, earned, reversed, expired and redeemed transactions, plus the fulfilment state and support path for each redemption.

### Reward examples to evaluate

Potential admin-managed rewards include VAD membership/perks, fee discounts or credits where legally and technically permitted, partner vouchers, data/airtime, merchandise, and eligible Play benefits. Free entries or chance-based rewards should remain disabled until the specific promotion is legally reviewed in the relevant jurisdiction. Points should be non-cash and non-transferable by default. A cash-like redemption path requires separate legal, fraud and ledger review; reward points must not be silently mixed into NGN or USDC wallet balances.

### Backend data boundaries

- Provider adapter registry: supported provider, format, regions, status and callback-verification secret reference. Secrets stay in backend secret storage.
- Ad campaigns and placements: creative/media URLs, start/end dates, placements, regional and age eligibility, consent policy, per-user caps, reward amount, budget ceiling and lifecycle state.
- Ad reward sessions: short-lived attempt ID, user, provider, placement, expiry and verification state.
- Completion events: immutable, uniquely keyed provider event IDs, verification outcome, timestamp and minimal fraud metadata. Reject client-only completion claims.
- Points ledger: append-only earn, reserve, redeem, expire and reverse events with user, signed points, reason, source reference, idempotency key and timestamp. Do not permit client writes.
- Reward catalogue: database-driven title, category, art assets, points cost, inventory, geographic rules, terms, validity window and fulfilment adapter.
- Reward redemptions: lifecycle, points reservation/settlement references, inventory hold, fulfilment reference, failure details and compensating reversal.
- Reward policy: admin-controlled earning caps, expiry, eligibility, consent, fraud controls and versioned terms.

All mutations should go through authenticated, permission-checked, idempotent server functions. Row-level security should limit members to their own points ledger, ad-session history and redemptions. Public clients must not write provider events, points, balances or reward inventory. Keep a separate financial ledger for wallet credits; points are a loyalty unit, not money.

### Fraud controls and metrics

Verify completions server-side and deduplicate provider event IDs. Enforce daily/weekly caps, campaign budgets, cooldowns, device/account risk signals, and review of suspicious activity. Record consent and eligibility before starting an ad session. Make expiry, reversals and reward availability visible before users participate. Advertisers cannot choose winners or secretly alter game odds in exchange for impressions. Do not reward ad clicks or fabricate ad views; follow provider rewarded-ad and privacy policies.

Track ad fill rate, verified completions, cost per point, redemption rate, fulfilment delays, unfulfilled rewards, fraud rate and complaints.

## Suggested implementation order

1. Validate this navigation/catalogue foundation and apply its migration in a non-production environment.
2. Add an admin-controlled experience publishing workflow and load genuine asset URLs into the catalogue.
3. Implement one non-money game engine in isolation with accessible controls and server-side validation.
4. Implement prize-campaign funding, entry, cancellation/refund and draw-authorization workflows only after legal/compliance review.
5. Build the points ledger and reward redemption lifecycle before any ad point grants.
6. Add a provider adapter and verified rewarded-ad sessions, then connect them to points credits.
7. Add admin controls, fraud signals, reconciliation and operational monitoring before expanding providers or game types.

The central principle: VAD Play remains extensible while payments, odds, ad completions, points and rewards are separate, auditable server-side workflows.


## Implementation guardrails added in the engine-and-ads migration

- The prize-draw economics migration now requires an explicit profit target mode, profit target value, and campaign-cost budget for each campaign. No example prize cost, currency threshold, profit percentage, or campaign expense budget is prefilled.
- Built-in engine identifiers are registered as code capabilities, while their rollout status remains review-required. Registry rows do not claim a game is playable until the matching server runtime, tests, campaign controls, and compliance gates are implemented and enabled.
- Outcome rules and private game-session data are service-role-only. The client cannot set a result, inspect private outcome configuration, award itself points, or publish an experience.
- Ads are represented by provider adapters and per-placement configuration for WEB, ANDROID, and IOS. Providers and placements default to disabled; no demo ads or points are seeded. Provider credentials belong in managed secrets, never client-readable configuration.
- Ad sessions and completion callbacks are separate records. A video-ending event from the client alone is never sufficient to grant points. Provider-specific signature/transaction verification and idempotent award processing remain required before any placement can issue points.
- The points ledger is append-only and non-cash. It is separate from VAD's NGN/USDC wallet, settlement and accounting ledger. Reward catalogue and redemption records are user-readable only under their published/own-record policies; writes require secured server workflows.
- The new migration supplies schema and access boundaries, not a claim that paid entries, spins, scratch results, programmatic ad-network SDKs, points awards, or redemptions are live. Direct-sponsor creative slots now read only active, database-configured placements and render cross-platform on web, Android, and iOS; they remain empty unless an authorized provider and placement are configured. Programmatic AdSense/AdMob adapters, provider verification callbacks, points awards and redemptions need their provider-specific runtime implementation and configuration before they can be enabled.
- `qualifying_funds_amount` is only a campaign progress projection. Reconciliation must derive it from VAD's existing payment and financial-ledger records. Do not create a parallel source of money truth or increment campaign proceeds from client-submitted payment claims.
- Database guards keep registered engines in review until enabled, reject publishing experiences against non-enabled engine releases, require compliance approval before opening a prize campaign, and require funding, entry closure, funds reconciliation, prize security, authorized draw, recorded result, and prize delivery before settlement. These are defense-in-depth constraints; secure operational workflows and ledger reconciliation remain necessary.


## Admin configuration layer

The engine-and-ads migration includes permission-checked admin RPCs for reading the VAD Play configuration catalogue, saving unpublished experience drafts, saving prize-campaign drafts with explicitly supplied economics, configuring direct-sponsor placements across selected platforms, and enabling/disabling the direct-sponsor adapter under super-admin control. These RPCs never open a campaign, publish an experience, enable a game engine, or issue rewards.

The engine registry now includes a `runtime_ready` guard that defaults to false. Admin configuration alone cannot make an engine live; a runtime implementation and separate reviewed enablement step are required. Direct-sponsor placements are the only ad format rendered by the initial shared app slot. Other ad network adapters (including programmatic web/mobile providers) need their provider-specific SDK, consent, verification and platform configuration before activation.
