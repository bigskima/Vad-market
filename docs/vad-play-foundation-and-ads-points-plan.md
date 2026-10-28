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
- Store prize cost, profit target mode/value, campaign cost budget, entry price, caps, schedule, lifecycle and audit timestamps in the database.
- Derive funding_threshold_amount in the database: prize cost + configured profit target + budgeted campaign expenses. A percentage target of 10 means ten percent of prize cost. With a 5,000,000 prize, a 10% target and zero additional cost budget, the threshold is 5,500,000 in the configured campaign currency.
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
