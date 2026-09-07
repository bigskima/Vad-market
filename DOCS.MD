# VAD — VALUE ASSET DEPOT

## Complete Product, Financial, Oracle, Algorithm & Runtime Architecture Directive

**Operating Company:** SKIMA Group LTD
**Product/Business Name:** VAD — Value Asset Depot

---

# 1. PRIMARY DIRECTIVE TO THE CHIEF DEVELOPMENT AI

This document is not a suggestion list.

Treat it as the architectural foundation for VAD.

Do not immediately jump into building screens.

VAD is fundamentally:

**a social conviction network + creator platform + prediction marketplace + financial market infrastructure.**

It is NOT merely:

* a sportsbook,
* a betting application,
* a Polymarket clone,
* a casino,
* a social network with betting buttons.

The concept is:

# OPEN CONVICTION. CONTROLLED TRUTH. SEGREGATED MONEY. CONFIGURABLE POLICY.

Users may freely:

* express predictions,
* create posts,
* create video analysis,
* debate,
* challenge each other,
* build theses,
* follow predictors,
* create social predictions,
* propose financial markets.

Users may NOT freely:

* create settlement rules,
* declare outcomes,
* change oracle definitions,
* change financial policies,
* create arbitrary liquidity,
* manipulate balances,
* resolve their own financial markets.

The system must separate:

**OPINION**

from

**FINANCIAL TRUTH.**

---

# 2. BUILD PHILOSOPHY

We do not have thousands of dollars to burn during startup.

However:

**low budget must NOT mean throwaway architecture.**

Build production-grade foundations from day one while intelligently using:

* open-source technologies,
* Supabase,
* free tiers,
* usage-based providers,
* provider abstraction,
* open standards,
* self-hostable libraries where practical,
* inexpensive infrastructure,
* incremental scaling.

Do not prematurely purchase enterprise infrastructure.

Also do not create technical debt by writing fake implementations that must later be completely removed.

The rule is:

# START SMALL. ARCHITECT LARGE.

A free-tier provider may be active today.

A paid enterprise provider may replace it tomorrow.

The rest of VAD should not care.

---

# 3. CORE TECHNOLOGY STACK

## Frontend

Use:

**Expo + React Native + TypeScript**

for:

* Android
* iOS
* customer web
* creator web
* admin web dashboard

Use:

**Expo Router**

for routing.

Use React Native Web for universal interfaces while allowing web-specific components where an admin dashboard genuinely needs desktop-oriented interactions.

Do NOT force every desktop admin component to behave like a phone screen merely for code reuse.

Expo officially supports universal web applications through React Native/Web and React DOM capabilities.

Recommended monorepo concept:

```text
/apps

    /vad
        customer/creator/trader application

    /admin
        VAD administration/control plane

/packages

    /ui
    /design-system
    /api-client
    /types
    /schemas
    /auth
    /config
    /analytics
```

Shared business truth must NOT live inside these packages.

They contain presentation, API clients and reusable UI.

---

# 4. BACKEND

Use Supabase heavily during the startup stage.

Use:

* PostgreSQL
* Supabase Auth
* Row Level Security
* Storage
* Realtime
* Edge Functions
* database functions where appropriate
* Postgres transactions
* scheduled workers/jobs
* queues/event processing patterns
* pgvector where useful
* audit tables
* immutable ledger patterns

Current Supabase Free includes 500 MB database storage, 50,000 MAU, 5 GB egress and two active free projects; it is suitable for getting VAD's early production system running, while the architecture must allow migration to paid capacity when real usage requires it.

Do not treat Supabase limits as VAD business limitations.

---

# 5. KYC

Initial preferred provider:

**Didit**

through a provider adapter.

Current Didit documentation describes 500 free monthly checks for each of several core identity-verification functions, making it attractive for an early-stage startup.

However NEVER build:

```text
diditVerificationId
diditStatus
```

throughout the domain.

Build:

```text
IdentityVerificationProvider
```

Then implementations:

```text
DiditAdapter

FutureProviderAdapter

ManualReviewAdapter
```

Core records should look conceptually like:

```text
identity_verification_sessions

provider_id
external_reference
user_id
verification_type
status
result
risk_signals
created_at
completed_at
metadata
```

This means replacing Didit does not require rebuilding VAD.

---

# 6. PAYMENTS

Initial VAD settlement focus:

## Nigeria

NGN

USD where a compliant/approved provider permits it.

Future:

USDC / additional crypto rails.

Do NOT architect payments around one company.

Create:

```text
PaymentProviderAdapter
```

with capabilities such as:

```text
getCapabilities()

createDeposit()

verifyDeposit()

createWithdrawal()

verifyWithdrawal()

refundPayment()

getTransaction()

getAccountDetails()

resolveBankAccount()

createVirtualAccount()

healthCheck()
```

Provider selection must happen dynamically.

A provider must declare:

```text
countries
currencies
deposit_methods
withdrawal_methods
limits
business_capabilities
health
priority
```

Never assume:

```text
Nigeria = Provider X
```

Instead runtime asks:

> Which approved provider currently supports this capability?

---

# 7. CURRENT BUSINESS GEOGRAPHY

VAD launches for Nigerians first.

Do not overcomplicate initial development with dozens of jurisdiction workflows.

Initial business configuration:

```text
Nigeria:
    NGN = enabled
    USD = enabled where payment capability permits
    crypto = foundation prepared
```

Other countries are not the initial operational focus.

Architecturally, future users outside Nigeria may eventually operate using crypto first.

Fiat currencies can later be activated country-by-country.

IMPORTANT:

This must remain CONFIGURATION.

Never write the Nigerian rule permanently into client or domain code.

A future administrator must eventually be able to configure:

```text
Ghana
GHS = enabled

Kenya
KES = enabled

United Kingdom
GBP = enabled
```

without rebuilding VAD's financial architecture.

---

# 8. CRYPTO IS FUTURE IMPLEMENTATION

Do NOT spend early startup resources building:

* smart contracts,
* blockchain AMMs,
* bridges,
* custom tokens,
* decentralized oracle contracts,
* on-chain settlement.

But the architecture MUST already understand:

```text
asset.type =
FIAT
STABLECOIN
CRYPTO
```

and provider abstraction must support future:

```text
CryptoSettlementProvider
WalletProvider
BlockchainOracleProvider
```

The VAD ledger should be asset-agnostic from day one.

Therefore adding USDC later should mean:

**adding a rail/provider/capability**

rather than rewriting:

* balances,
* markets,
* fees,
* settlement,
* portfolios.

---

# 9. THE MOST IMPORTANT FINANCIAL RULE

## NEVER MIX LIQUIDITY BETWEEN CURRENCIES.

Suppose this event exists:

> Will Chelsea win the Premier League?

This is ONE canonical event.

But financially:

```text
CANONICAL EVENT
        |
        |
        +---- NGN MARKET
        |       |
        |       +---- NGN order book
        |       +---- NGN collateral
        |       +---- NGN fees
        |       +---- NGN settlement
        |
        +---- USD MARKET
        |       |
        |       +---- USD order book
        |       +---- USD collateral
        |       +---- USD fees
        |       +---- USD settlement
        |
        +---- USDC MARKET [future]
                |
                +---- USDC liquidity
                +---- USDC collateral
```

They share:

* question,
* event,
* outcome,
* resolution,
* oracle.

They NEVER share:

* liquidity,
* collateral,
* fees,
* order books,
* balances,
* settlement money.

This is mandatory.

---

# 10. CANONICAL EVENT VS FINANCIAL MARKET

Chief dev must understand this distinction precisely.

## CANONICAL EVENT

Represents the REAL-WORLD proposition.

Example:

```text
Will Chelsea win the 2026/27 Premier League?
```

It contains truth-related information.

## MARKET INSTRUMENT

Represents a financially tradeable implementation of that event.

Example:

```text
Chelsea EPL 2026/27 Champion
Asset = NGN
```

Another instrument:

```text
Chelsea EPL 2026/27 Champion
Asset = USD
```

Same truth.

Different financial system.

---

# 11. WHY CANONICALIZATION EXISTS

Without canonicalization:

Creator A creates:

> Chelsea wins EPL.

Creator B creates:

> Chelsea Premier League champions?

Creator C creates:

> Will Chelsea win the league?

Creator D creates:

> Chelsea EPL winner 26/27.

The system could accidentally create:

4 financial markets,

4 order books,

4 liquidity pools,

4 prices,

possibly 4 different settlement configurations.

That is unacceptable.

It creates:

* spam,
* fragmented liquidity,
* confusing prices,
* oracle duplication,
* scam opportunities,
* manipulation surfaces.

Instead:

```text
Creator posts A
Creator posts B
Creator posts C
Creator posts D

        ↓

Canonical Event #1028

"Will Chelsea win the 2026/27 Premier League?"
```

All creator content references this canonical event.

There remains one NGN market and one USD market for that event.

---

# 12. CANONICAL MARKET ALGORITHM

Canonicalization must NOT rely solely on an LLM.

Use multiple stages.

## STEP 1 — STRUCTURAL NORMALIZATION

Convert proposal into structured components.

Example:

```text
subject:
Chelsea FC

event_type:
LEAGUE_CHAMPION

competition:
Premier League

season:
2026/27

outcome:
YES_NO

deadline/resolution scope:
official final league table
```

Use IDs rather than raw names wherever possible.

Example:

```text
team_id = CHELSEA_FC_ID
competition_id = EPL_ID
season_id = EPL_2026_27_ID
```

---

# 13. CANONICAL FINGERPRINT

Build a deterministic fingerprint.

Conceptually:

```text
fingerprint =
hash(
    template_type
    + normalized_entity_ids
    + competition_id
    + season_id
    + threshold
    + comparison_operator
    + resolution_scope
)
```

Example:

```text
LEAGUE_CHAMPION
CHELSEA_ID
EPL_ID
2026_27
```

produces one canonical identity.

If another proposal generates the same fingerprint:

DO NOT CREATE ANOTHER EVENT.

Attach it to the existing canonical event.

---

# 14. SEMANTIC DUPLICATE DETECTION

Not every duplicate will produce an immediately identical fingerprint.

Therefore use:

1. deterministic candidate search,
2. full-text search,
3. vector similarity,
4. entity matching,
5. AI semantic classification.

AI may return:

```text
SAME_EVENT
RELATED_EVENT
DISTINCT_EVENT
UNCERTAIN
```

But AI must NOT make the final financial decision by itself.

Example:

```text
Proposal:
Chelsea finishes above Arsenal.

Existing:
Chelsea wins Premier League.
```

They are related.

They are NOT the same market.

The deterministic validator must stop AI from incorrectly merging them.

---

# 15. CANONICALIZATION DECISION ALGORITHM

Conceptually:

```text
normalize proposal

extract entities

identify template

generate fingerprint

search exact fingerprint

IF exact:
    link existing event

ELSE:
    retrieve semantic candidates

    compare:
        event type
        entities
        season
        deadline
        thresholds
        operators
        resolution conditions

    AI assists semantic classification

    IF sufficiently identical:
        link canonical event

    ELSE IF uncertain:
        send governance review

    ELSE:
        create new canonical-event candidate
```

Every merge decision must be auditable.

Admins must be able to:

* inspect proposals,
* inspect candidate matches,
* approve merge,
* reject merge,
* split mistakenly merged events.

Never silently destroy historical references.

---

# 16. MARKET PROPOSAL PIPELINE

Users do NOT directly publish real-money markets.

Users propose them.

Pipeline:

```text
USER IDEA
   ↓
PROPOSAL
   ↓
CONTENT SAFETY
   ↓
ENTITY EXTRACTION
   ↓
MARKET TEMPLATE CLASSIFICATION
   ↓
CANONICALIZATION
   ↓
DUPLICATE CHECK
   ↓
AMBIGUITY CHECK
   ↓
ORACLE RESOLVABILITY CHECK
   ↓
MANIPULATION/RISK CHECK
   ↓
FINANCIAL ELIGIBILITY
   ↓
APPROVAL
   ↓
CANONICAL EVENT
   ↓
ASSET MARKET CREATION
```

This is how we control spam without killing creativity.

---

# 17. MARKET QUALITY SCORE ALGORITHM

A proposal can receive internal scores.

Example:

```text
objective_resolvability       0–100
oracle_availability           0–100
ambiguity                     0–100
duplicate_probability         0–100
manipulation_risk             0–100
creator_trust                 0–100
expected_interest             0–100
```

Do NOT treat one weighted AI score as absolute truth.

The score routes workflows.

Example:

```text
high resolution confidence
+
low ambiguity
+
trusted template
+
available oracle
=
auto-eligible for activation policy

uncertain
=
human review
```

Admins control thresholds.

---

# 18. ALGORITHM SYSTEM

VAD needs an explicit algorithm layer.

It is broader than AI.

Algorithms include:

## Market Algorithms

* canonicalization
* order matching
* pricing
* liquidity
* position accounting
* collateral calculation
* settlement

## Discovery Algorithms

* feed ranking
* trending markets
* creator recommendations
* personalized markets

## Trust Algorithms

* reputation
* calibration
* spam detection
* anomaly detection
* manipulation detection

## Oracle Algorithms

* source consensus
* source priority
* conflict detection
* finality

## Risk Algorithms

* position concentration
* suspicious account correlations
* wash trading patterns
* unusual trading before events
* velocity limits

Each algorithm must have:

```text
algorithm definition
version
parameters
activation status
effective date
audit history
```

Where appropriate, parameters should be runtime-configurable.

---

# 19. DO NOT CONFUSE ALGORITHM WITH AI

This distinction is critical.

An algorithm may be:

```text
if two trusted sources agree:
    provisional_result = result
```

No AI required.

An order-matching engine is an algorithm.

A settlement engine is an algorithm.

A fee calculator is an algorithm.

A canonical fingerprint generator is an algorithm.

AI is only one class of runtime intelligence.

---

# 20. AI ARCHITECTURE

AI should become a major VAD capability.

But:

# AI IS NOT AN ORACLE.

AI can reason about evidence.

Oracle infrastructure establishes authoritative facts.

AI may say:

> These two market proposals probably mean the same thing.

AI must NOT say:

> Chelsea won, therefore release $18,000.

Those are completely different powers.

---

# 21. AI RUNTIME

Create:

```text
AIProviderAdapter
```

Providers may eventually include:

```text
OpenAI
Gemini
Claude
local/open-source models
future providers
```

Do not hardcode prompts against one vendor.

Create:

```text
ai_providers
ai_models
ai_capabilities
ai_policy
ai_prompt_versions
ai_runs
ai_outputs
ai_costs
ai_failures
```

Capabilities could include:

```text
MARKET_STRUCTURING
DUPLICATE_DETECTION
AMBIGUITY_ANALYSIS
CONTENT_MODERATION
MARKET_SUMMARY
NEWS_SUMMARY
CREATOR_ASSISTANCE
RISK_TRIAGE
ENTITY_EXTRACTION
SEARCH_QUERY_GENERATION
FEED_ENRICHMENT
```

---

# 22. AI EXECUTION FLOW

Conceptually:

```text
request
↓
AI capability router
↓
active AI policy
↓
choose provider/model
↓
execute
↓
validate structured output
↓
store result
↓
deterministic domain validator
↓
domain action
```

AI output is NEVER trusted merely because the model produced JSON.

Schema validation and domain validation follow it.

---

# 23. AI FAILURE MUST NOT BREAK FINANCE

If every AI provider goes offline:

Users should still be able to:

* access balances,
* withdraw where permitted,
* view markets,
* settle deterministic markets,
* receive oracle resolution,
* use core financial infrastructure.

AI-dependent conveniences may degrade.

Financial truth must NOT.

---

# 24. AI VS ORACLE

Think of it this way:

## AI

Answers:

> What might this mean?

> Is this proposal ambiguous?

> Are these two sentences semantically equivalent?

> Can this creator post be summarized?

> Does this activity look suspicious?

## ORACLE

Answers:

> What officially happened?

For financial settlement:

**Oracle > AI.**

Always.

---

# 25. ORACLE NETWORK

Build an Oracle Registry rather than a single source.

Oracle capabilities could include:

```text
SPORT_MATCH_RESULT
SPORT_LEAGUE_TABLE
PLAYER_STAT
CRYPTO_PRICE
FX_RATE
ECONOMIC_DATA
ELECTION_RESULT
COMPANY_EVENT
ENTERTAINMENT_CHART
```

Sources can be:

* authoritative sources,
* structured API providers,
* secondary corroborating sources,
* controlled manual adjudication.

---

# 26. ORACLE POLICY

Before a market opens, define:

```text
oracle capability
primary source
secondary source(s)
source priority
consensus requirement
resolution deadline
postponement rule
cancellation rule
dispute period
void rule
finality rule
```

Lock the applicable policy version once trading starts.

Do not let administrators secretly rewrite what decides a market after money enters.

---

# 27. MARKET PRICING MODEL — INITIAL RECOMMENDATION

VAD should NOT initially behave like a sportsbook where the house sets odds.

VAD should NOT require the company to bankroll every market.

VAD should initially implement:

# FULLY COLLATERALIZED BINARY OUTCOME SHARES

# + CENTRAL LIMIT ORDER BOOK

# + PRICE-TIME PRIORITY

This provides a financially conservative starting point.

---

# 28. HOW A BINARY MARKET WORKS

Suppose:

> Will Event X happen?

There are:

```text
YES shares
NO shares
```

For a USD market, assume one complete outcome pair represents:

```text
$1 settlement collateral
```

Conceptually:

```text
1 YES share
+
1 NO share
=
$1 fully collateralized outcome set
```

Only one side ultimately receives the $1.

Therefore VAD does not have to gamble against users.

Money is collateralized.

---

# 29. WHY ENTRY TIME MATTERS

Users do NOT simply put money into a pot and divide it later.

They buy shares at a MARKET PRICE.

Suppose:

Monday:

YES price = $0.25.

A user spends:

```text
$250
```

They acquire approximately:

```text
1,000 YES shares
```

ignoring fees.

Friday:

new information appears.

YES now trades at:

```text
$0.80
```

Another person spending:

```text
$250
```

only acquires:

```text
312.5 YES shares
```

approximately.

Both spent $250.

But the earlier trader took greater uncertainty and acquired more shares.

If YES wins:

each YES share settles at:

```text
$1
```

Therefore earlier timing naturally matters through entry price.

No arbitrary bonus formula is required.

---

# 30. THE $18,000 EXAMPLE

Suppose the USD market has:

```text
$18,000
```

of fully collateralized complete outcome sets.

This means the market can settle exactly:

```text
$18,000
```

to whichever outcome ultimately wins.

Imagine current winning YES holders include:

Alice:

```text
4,000 YES shares
average acquisition = $0.35
cost basis ≈ $1,400
```

Bob:

```text
3,000 YES shares
average acquisition = $0.55
cost basis ≈ $1,650
```

Carol:

```text
2,000 YES shares
average acquisition = $0.80
cost basis ≈ $1,600
```

If YES resolves:

Alice receives:

```text
4,000 × $1 = $4,000
```

Bob:

```text
3,000 × $1 = $3,000
```

Carol:

```text
2,000 × $1 = $2,000
```

before any configured settlement fee.

Their original stakes were not equal.

Their timing was not equal.

Their acquisition prices were not equal.

Their share quantities represent those differences.

That is the brain behind settlement.

---

# 31. MOST IMPORTANT SETTLEMENT PRINCIPLE

Settlement pays:

# FINAL SHARE OWNERSHIP

NOT:

* whoever originally deposited,
* whoever originally created the position,
* raw lifetime stake,
* social reputation,
* how long the position existed.

If Alice later sells 1,000 YES shares to David:

Alice no longer owns those shares.

David becomes settlement owner.

This is what makes positions tradable.

---

# 32. PRICE-TIME PRIORITY

The matching engine should use deterministic:

# PRICE FIRST.

# TIME SECOND.

Better prices receive priority.

For orders at identical prices:

older orders execute first.

Every order receives server-generated:

```text
order_id
sequence_number
received_at
```

Never trust client timestamps for priority.

---

# 33. COMPLEMENTARY ORDER MATCHING

Suppose:

Trader A is willing to buy YES for:

```text
$0.60
```

Trader B is willing to buy NO for:

```text
$0.40
```

Together:

```text
$0.60 + $0.40 = $1
```

The matching engine can create:

```text
1 YES share for A
1 NO share for B
```

and lock:

```text
$1
```

collateral.

That $1 cannot become platform operating money.

It is settlement collateral.

---

# 34. ORDERS THAT CROSS

Suppose older resting YES order:

```text
YES = $0.60
```

Incoming NO buyer is willing to pay:

```text
up to $0.42
```

The two users are compatible because the incoming trader can accept the complementary:

```text
NO = $0.40
```

Under maker/resting price priority:

```text
YES = $0.60
NO = $0.40
```

The excess willingness does NOT become hidden platform profit.

Matching rules must be deterministic and transparent.

---

# 35. TRADING EXISTING SHARES

Once outcome shares exist, holders may place sell orders.

Example:

Alice owns YES purchased at:

```text
$0.30
```

Market now values YES at:

```text
$0.70
```

Alice can sell before event resolution.

The buyer pays Alice.

Ownership transfers.

Underlying settlement collateral remains protected.

This gives VAD genuine trading rather than simple betting.

---

# 36. EMPTY MARKET PROBLEM

A new order book may contain no counterparties.

Do not fake liquidity.

If no compatible order exists:

```text
ORDER REMAINS OPEN
```

The UI communicates:

> Waiting for a matching order.

Possible later solutions include:

* approved liquidity providers,
* creator/community liquidity incentives,
* market-making algorithms,
* treasury-funded liquidity under strict risk limits,
* AMM modules.

Do NOT require these for the first financial architecture.

---

# 37. WHY NOT START WITH A HOUSE-FUNDED AMM?

An AMM can provide constant liquidity.

But it introduces:

* treasury capital requirements,
* market-maker loss,
* parameter tuning,
* manipulation risks,
* low-liquidity pricing problems,
* additional risk accounting.

VAD currently has limited startup capital.

Therefore:

## CLOB FIRST.

Architect an interface allowing AMMs later.

Example:

```text
LiquidityEngine

OrderBookLiquidityEngine
AutomatedMarketMakerEngine [future]
HybridLiquidityEngine [future]
```

---

# 38. FUTURE AMM OPTION

Do not hardcode CLOB permanently either.

Market policy could eventually specify:

```text
liquidity_model =
ORDER_BOOK
AMM
HYBRID
```

But implement only the production-grade model actually needed now.

---

# 39. SOLVENCY INVARIANT

At all times:

```text
settlement collateral
>=
maximum possible settlement liability
```

For a fully collateralized binary market, this must be mathematically enforced.

Never allow:

```text
platform promises payout
without collateral
```

No administrator override should casually bypass this invariant.

---

# 40. LEDGER

Use a real double-entry ledger.

Never maintain financial truth through:

```text
users.balance = users.balance + 1000
```

Accounts should include concepts such as:

```text
USER_AVAILABLE
USER_RESERVED
MARKET_COLLATERAL
WITHDRAWAL_PENDING
PROVIDER_CLEARING
PLATFORM_FEE_REVENUE
REFUND_PAYABLE
TREASURY
CREATOR_REWARD_PAYABLE
```

Every money movement has:

```text
transaction_id
journal_id
asset_id
debit_account
credit_account
amount
reason
reference_type
reference_id
idempotency_key
created_at
```

Ledger entries become immutable.

Corrections use reversing entries.

---

# 41. ORDER RESERVATION

When a user places an order:

Do NOT immediately treat it as spent.

Move required funds:

```text
USER_AVAILABLE
→
USER_RESERVED
```

When filled:

appropriate amount becomes:

```text
MARKET_COLLATERAL
```

and fees move separately.

Unused reservation returns to:

```text
USER_AVAILABLE
```

when:

* order cancels,
* order expires,
* partial fill leaves remainder,
* market closes.

---

# 42. PLATFORM FEES

Fees must be controlled by a dedicated:

# FEE POLICY ENGINE.

No controller should contain business assumptions such as:

```text
fee = trade * 0.01
```

The runtime asks:

```text
FeePolicyEngine.quote(context)
```

---

# 43. INITIAL RECOMMENDED REVENUE MODEL

Do NOT maximize fee complexity at launch.

A transparent initial strategy could center on:

## EXECUTED TRADE FEE

Only executed volume attracts the fee.

An unfilled order should not pay a trading fee.

Potential policy:

```text
maker fee
taker fee
```

These may be:

```text
0%
X%
```

or another admin-selected configuration.

Do not hardcode actual percentages yet.

---

# 44. OPTIONAL FUTURE FEE TYPES

Architecture should support:

```text
TRADE_MAKER_FEE
TRADE_TAKER_FEE
SETTLEMENT_FEE
PROFIT_FEE
WITHDRAWAL_PLATFORM_FEE
PAYMENT_PROCESSING_PASS_THROUGH
CREATOR_SUBSCRIPTION
PREMIUM_ANALYTICS
CREATOR_REVENUE_SHARE
```

Do not activate all of them.

Architecture support does not equal launch activation.

---

# 45. COLLATERAL MUST NOT BE CONSUMED BY FEES

If a complete outcome set requires:

```text
$1
```

the full $1 remains settlement collateral.

Example:

Trade contribution:

```text
$100
```

Fee:

```text
$1
```

User debit may therefore be:

```text
$101
```

rather than placing only $99 into collateral and pretending $100 exists.

Never make fee revenue reduce solvency.

---

# 46. HUMAN-READABLE FEE ADMINISTRATION

Super Admin/Finance Admin should see:

## Standard NGN Trading Fee

Asset:

NGN

Market type:

All

Maker fee:

0.00%

Taker fee:

1.00%

Minimum fee:

₦0

Maximum fee:

None

Effective from:

Date/time

Status:

Active

Actions:

Save Draft

Publish New Version

Deactivate

The underlying database may be sophisticated.

The human interface must not require JSON editing.

---

# 47. POLICY ENGINE

This principle extends far beyond fees.

Policies control:

* asset availability,
* providers,
* fees,
* KYC,
* oracle consensus,
* market templates,
* proposal limits,
* liquidity model,
* order limits,
* withdrawal limits,
* dispute duration,
* market suspension,
* creator privileges,
* AI provider routing,
* risk thresholds,
* feature flags.

All should have:

```text
policy
policy version
status
effective_at
expires_at
created_by
approved_by
reason
audit record
```

---

# 48. HARD-CODING RULE

We want VAD to behave like a living platform.

A business administrator should be able to change common business operations without deploying a new application.

Examples that should NOT require app redeployment:

* enable/disable NGN
* enable USD
* activate a supported country
* change fee rate
* change withdrawal limit
* enable a market category
* suspend a provider
* switch between already-integrated providers
* change oracle source priority
* adjust dispute window
* change proposal threshold
* enable a feature
* suspend a market
* change AI model/provider
* configure KYC threshold
* add another supported currency to an already-generic asset system
* enable/disable creator features

---

# 49. IMPORTANT REALITY ABOUT NO-REDEPLOYMENT

Do NOT interpret "no hardcoding" as:

> software never gets deployed again.

Actual:

* new algorithms,
* schema changes,
* security fixes,
* completely new provider protocols,
* new application capabilities

may require code deployment.

The goal is:

# BUSINESS CHANGE ≠ CODE CHANGE.

Structural software upgrades can still be safely deployed.

This distinction prevents building an unsafe "everything is arbitrary JSON" architecture.

---

# 50. REFUNDS — DO NOT USE ONE WORD FOR DIFFERENT MONEY EVENTS

Refunds require explicit categories.

## PAYMENT REFUND

Example:

A deposit/payment is reversed through a payment provider.

Track:

```text
provider transaction
original payment
refund amount
refund reason
provider status
ledger effect
```

---

# 51. ORDER RELEASE

This is NOT really a refund.

If a user placed:

```text
₦50,000 order
```

and only:

```text
₦30,000
```

was filled,

remaining reservation:

```text
₦20,000
```

returns from:

```text
USER_RESERVED
→
USER_AVAILABLE
```

Call it reservation release.

---

# 52. MARKET CANCELLED BEFORE TRADING

If a market has no executions:

all open orders cancel.

All reserved money returns.

Any fee that was incorrectly reserved returns.

No financial position exists.

---

# 53. MARKET VOID AFTER TRADING HAS OCCURRED

This is substantially different.

You cannot naively "return everyone's original stake" because positions may have been sold many times.

Example:

Alice buys YES.

Alice sells YES to Bob.

Bob sells to Carol.

Whose "stake" gets refunded?

Therefore market void rules must exist BEFORE trading.

For binary markets, one solvency-preserving configurable rule is:

```text
YES share = 0.50 settlement unit
NO share = 0.50 settlement unit
```

when a market is formally void.

Then:

```text
0.50 + 0.50 = 1
```

and collateral remains conserved.

However the exact void policy must be visible before trading and stored as part of the contract.

---

# 54. PLATFORM-FAULT COMPENSATION

Do not manipulate normal settlement to compensate users for platform mistakes.

Create a separate compensation system.

Example:

```text
compensation_case
compensation_policy
ledger adjustment
reason
administrator
audit
```

This preserves financial history.

---

# 55. PAYMENT CHARGEBACK

A chargeback is NOT a refund.

Track separately.

Chargebacks create financial risk.

The risk engine must be able to:

* flag account,
* restrict withdrawal,
* establish receivable/debt,
* freeze risk amount,
* escalate review.

Never silently subtract historical market collateral.

---

# 56. SETTLEMENT ENGINE

Resolution and settlement must be separate.

## RESOLUTION ENGINE

Answers:

> Which outcome won?

## SETTLEMENT ENGINE

Answers:

> Given that outcome, what financial entries must happen?

That separation is mandatory.

---

# 57. SETTLEMENT FLOW

Example:

```text
MARKET CLOSED
↓
AWAIT ORACLE
↓
ORACLE OBSERVATIONS
↓
CONSENSUS
↓
PROVISIONAL RESULT
↓
DISPUTE WINDOW
↓
FINAL RESULT
↓
SETTLEMENT PLAN
↓
SOLVENCY CHECK
↓
LEDGER TRANSACTION
↓
POSITION FINALIZATION
↓
SETTLED
```

Settlement must be idempotent.

Calling settlement twice must NOT pay users twice.

---

# 58. SETTLEMENT ALGORITHM

Conceptually:

```text
load market

verify status = FINALIZED

load winning outcome

load all outstanding positions

calculate settlement value per position

load applicable fee policy version

calculate fees

verify:
    total gross payout
    <=
    collateral available

create settlement journal

for each winning holder:
    collateral → user available

for applicable fees:
    user/platform settlement flow
    → platform fee revenue

close all positions

mark market settled
```

Execute transactionally where possible.

---

# 59. POSITION COST BASIS

Store enough information for analytics.

A position needs:

```text
quantity
average acquisition price
realized pnl
unrealized pnl
fees paid
asset
market
outcome
```

Individual fills must remain separately stored.

Do not throw away execution history merely because an average price can be calculated.

---

# 60. FEED / CREATOR EXPERIENCE

The creator system is not a decoration.

It is a core distribution mechanism.

Example creator post:

> Chelsea is underpriced at 42%. Here is why.

Attached:

```text
Chelsea League Champion

YES 42%
NO 58%

NGN MARKET
USD MARKET
```

User can:

* watch
* read
* comment
* follow
* inspect creator record
* open canonical event
* trade
* challenge
* add to thesis
* bookmark
* share

---

# 61. CREATOR MARKET ORIGINATION

If a creator proposes a genuinely new valid event:

store attribution.

Example:

```text
canonical_event.originator_user_id
```

Creator profile can display:

```text
Markets originated
Accepted proposals
Rejected proposals
Volume influenced
Prediction accuracy
Calibration
```

Creator must NEVER control resolution.

---

# 62. CREATOR REPUTATION ALGORITHM

Do not simply calculate:

```text
wins / predictions
```

Eventually include probability calibration.

If someone repeatedly says:

```text
90% confidence
```

those predictions should occur approximately 90% of the time for them to be well calibrated.

Possible scoring models later:

* Brier score
* log score
* accuracy
* calibration error
* category-specific performance

Keep versions.

---

# 63. MARKET THESIS

Users can create a portfolio-like collection of convictions.

Example:

```text
MY FOOTBALL THESIS

Chelsea Top 4
Arsenal no trophy
Player X 15+ goals
Liverpool outside Top 2
```

It can contain:

* social predictions,
* financial positions,
* explanation/content.

Do not immediately turn multi-market theses into leveraged composite financial products.

That is a later financial engine.

---

# 64. BATTLES

Users may challenge predictions.

Example:

```text
Creator A:
Chelsea finishes above Arsenal

Creator B:
No
```

They may create social battle or use positions in the canonical underlying market.

Avoid creating a separate uncollateralized peer-to-peer payout engine for every battle during v1.

Use the canonical market as financial truth wherever possible.

---

# 65. MARKET DISCOVERY ALGORITHM

Feed ranking may consider:

* followed creators,
* market relevance,
* recent volume,
* price movement,
* creator quality,
* novelty,
* engagement,
* user interests,
* event urgency,
* liquidity.

AI can help classify content.

But do not create a purely engagement-maximizing algorithm that intentionally pushes users toward financial harm.

Market discovery and financial risk controls must remain distinct.

---

# 66. TRENDING ALGORITHM

A basic configurable trending score could use:

```text
volume velocity
unique traders
creator posts
price movement
comment velocity
share velocity
time decay
```

Weights are policy/configuration.

Do not hardcode them into screens.

---

# 67. RISK ENGINE

Risk signals can include:

* self-trading,
* linked-account trading,
* coordinated opposing positions,
* rapid deposit/trade/withdraw patterns,
* abnormal concentration,
* suspicious device relationships,
* creator collusion,
* unusual activity before event announcements,
* payment fraud,
* chargebacks,
* repeated disputed market proposals.

Risk engine outputs:

```text
ALLOW
REVIEW
LIMIT
HOLD
SUSPEND
FREEZE_SETTLEMENT
ESCALATE
```

---

# 68. AUDIT

Everything sensitive should create audit records.

Examples:

* market approval
* market rejection
* oracle policy change
* fee policy change
* provider switch
* market halt
* refund
* compensation
* KYC override
* settlement
* dispute decision
* administrator permission change

Include:

```text
who
what
before
after
why
when
request/reference
```

---

# 69. EVENT BUS

Do not couple every subsystem directly.

Use domain events.

Examples:

```text
MARKET_PROPOSED
MARKET_APPROVED
MARKET_OPENED
ORDER_PLACED
ORDER_MATCHED
POSITION_CHANGED
MARKET_CLOSED
ORACLE_OBSERVATION_RECEIVED
MARKET_PROVISIONALLY_RESOLVED
MARKET_FINALIZED
SETTLEMENT_COMPLETED
PAYMENT_RECEIVED
WITHDRAWAL_COMPLETED
KYC_COMPLETED
RISK_FLAG_CREATED
```

Consumers can include:

* notification engine,
* analytics,
* creator statistics,
* risk engine,
* audit,
* settlement,
* realtime updates.

---

# 70. API-FIRST ARCHITECTURE

The client never directly makes authoritative financial decisions.

Concept:

```text
EXPO APPLICATION
      |
      ↓
API / EDGE
      |
      ↓
AUTHORIZATION
      |
      ↓
DOMAIN SERVICE
      |
      ↓
POLICY ENGINE
      |
      ↓
DATABASE / LEDGER / PROVIDERS
```

Even if Supabase client libraries are used directly for safe reads/realtime, sensitive financial writes must go through trusted server-side operations.

---

# 71. EDGE FUNCTIONS

Use Edge Functions for privileged orchestration such as:

* payment callbacks
* order commands
* withdrawals
* market proposal processing
* AI calls
* KYC callbacks
* provider webhooks
* oracle ingestion
* settlement coordination
* admin policy operations

Never put service-role credentials in clients.

---

# 72. DATABASE TRANSACTIONS

Financial operations must use atomic database transactions where needed.

Example:

Order execution cannot do:

1. subtract money,
2. crash,
3. fail to issue shares.

Execution must either complete all required ledger/position operations or complete none.

---

# 73. IDEMPOTENCY

Every important financial command requires idempotency.

Examples:

```text
deposit webhook
order execution
withdrawal request
refund
oracle resolution
settlement
```

Provider retries must not create duplicate money.

---

# 74. REALTIME

Use realtime for:

* prices,
* best bid/ask,
* recent trades,
* order status,
* market status,
* creator comments where appropriate,
* notifications.

Realtime presentation is NOT financial authority.

The database/domain service remains authoritative.

---

# 75. ADMIN CONTROL PLANE

Admin dashboard must control VAD.

Sections should eventually include:

## Operations

Users

KYC

Markets

Market proposals

Oracle

Disputes

Payments

Withdrawals

Refunds

Risk

## Financial

Ledger

Revenue

Fees

Market collateral

Provider clearing

Reconciliation

## Configuration

Assets

Countries

Providers

Oracle policies

Fee policies

Risk policies

Market templates

Feature flags

AI providers

AI models

Algorithms

## Creator

Creators

Market originators

Content moderation

Reputation

---

# 76. HUMAN-READABLE CONFIGURATION

Never make management edit:

```text
{"maker_fee":0.00125}
```

Present:

> Maker Fee
> 0.125%

with explanation.

Likewise:

> Oracle Consensus
> Require 2 agreeing sources out of 3.

not:

```text
{"quorum":2,"source_count":3}
```

Database complexity belongs underneath.

---

# 77. LIVE CONFIGURATION

Cache configuration for performance.

But configuration changes need:

* version number,
* invalidation,
* reload,
* audit.

Clients may receive:

```text
runtime configuration version
```

and refresh when necessary.

---

# 78. FEATURE FLAGS

Every major unfinished/future subsystem should have feature/capability gating.

Examples:

```text
CRYPTO_WALLET
USDC_MARKETS
THESIS_TRADING
AMM
CREATOR_REVENUE_SHARE
PREDICTION_BATTLES
AI_MARKET_CREATION
POLITICAL_MARKETS
```

The code may exist.

Admin determines whether users see/use it.

---

# 79. SERVICE REGISTRY

Providers should be dynamically registered.

Concept:

```text
providers
provider_capabilities
provider_credentials
provider_routes
provider_health
provider_priority
```

Credentials remain secret.

Admin sees status, not raw secrets unless specifically permitted.

---

# 80. OBSERVABILITY

Use inexpensive/free tooling initially.

At minimum capture:

* structured logs,
* application errors,
* failed webhooks,
* failed orders,
* settlement failures,
* oracle disagreement,
* provider latency,
* provider downtime,
* ledger invariant failures.

Production financial errors must never disappear into console.log.

---

# 81. RECONCILIATION

Periodically compare:

```text
VAD ledger
vs
payment provider balance/transactions
```

If discrepancy exists:

create reconciliation issue.

Do not modify ledger silently to make totals match.

---

# 82. SECURITY

Implement:

* RLS,
* rate limiting,
* server authorization,
* admin RBAC,
* strong session handling,
* webhook signature verification,
* secret management,
* device/risk information,
* protected financial endpoints,
* withdrawal safeguards,
* audit trails.

Admin is not one universal role.

Use roles such as:

```text
SUPER_ADMIN
FINANCE_ADMIN
MARKET_ADMIN
ORACLE_REVIEWER
RISK_ADMIN
SUPPORT
CONTENT_MODERATOR
```

---

# 83. SEPARATION OF DUTIES

High-risk actions should eventually support maker-checker flow.

Example:

Finance Admin requests major refund.

Authorized second administrator approves.

Similarly for:

* large manual financial adjustment,
* oracle override,
* critical policy change,
* treasury movement.

---

# 84. STARTUP COST STRATEGY

Prioritize:

## Use now

Expo / React Native

Supabase

PostgreSQL

Supabase Edge Functions

Expo Push Notifications

open-source libraries

Didit free KYC allowance

provider free tiers

free error/analytics allowances where appropriate

## Avoid prematurely

custom blockchain

expensive streaming infrastructure

enterprise data warehouses

multiple paid microservices

Kubernetes

dozens of microservices

custom database infrastructure

expensive dedicated market-data systems

---

# 85. MODULAR MONOLITH FIRST

Do not build 50 microservices because VAD may eventually become huge.

Start with a properly separated modular backend.

Bounded contexts:

```text
Identity
Users
KYC
Social
Creators
Canonical Events
Markets
Orders
Positions
Liquidity
Oracle
Settlement
Ledger
Payments
Fees
Policies
Risk
Notifications
AI
Admin
Audit
```

Separate domain boundaries.

One infrastructure platform initially.

Extract services later when scale actually justifies it.

---

# 86. DATABASE IS NOT THE ARCHITECTURE

Do not dump everything into random tables and call it backend-first.

Each bounded context needs:

* ownership,
* invariants,
* services,
* events,
* policies,
* permissions.

For example:

Only Settlement Service may finalize financial settlement.

Only Ledger Service writes valid financial journal entries.

Only Oracle Resolution Service changes resolution state.

---

# 87. CORE INVARIANTS

These must eventually have automated tests.

### Financial

Ledger always balances.

No negative available balance unless explicitly supported.

Market settlement liability is fully collateralized.

Currency pools never mix.

Executed orders cannot exceed reserved funds.

Same settlement cannot execute twice.

### Market

Trading cannot occur before market activation.

Trading cannot occur after close.

Financial market cannot open without oracle policy.

Resolution policy cannot silently mutate after activation.

### Oracle

AI cannot finalize financial truth.

Creator cannot resolve own market.

Final settlement requires final resolution.

### Currency

NGN liability cannot be paid with USD collateral.

USD market cannot consume NGN pool.

---

# 88. TESTING

Build:

* unit tests,
* domain invariant tests,
* order matching tests,
* ledger balancing tests,
* canonicalization tests,
* settlement tests,
* fee tests,
* oracle conflict tests,
* refund/void tests,
* API integration tests,
* end-to-end critical flows.

Property-based tests are especially valuable for financial algorithms.

Example invariant:

Generate thousands of random trades.

At the end:

```text
total collateral
=
maximum settlement liability
```

must always hold.

---

# 89. FIRST MAJOR IMPLEMENTATION PHASES

## FOUNDATION

Repository architecture

Expo universal apps

Supabase

auth

profiles

admin RBAC

asset registry

configuration/policy engine

audit

provider framework

event system

## FINANCIAL CORE

ledger

accounts

deposits

withdrawals

fees

reconciliation

## MARKET CORE

canonical events

market proposals

templates

canonicalization

market instruments

## TRADING

orders

matching engine

positions

collateral

price history

## ORACLE

oracle registry

policies

observations

consensus

resolution

disputes

## SETTLEMENT

settlement planner

financial settlement

voiding

refund/compensation architecture

## SOCIAL

creator profiles

posts

video/content

comments

follows

market attachments

feeds

## INTELLIGENCE

AI runtime

recommendation algorithms

proposal assistance

spam detection

risk triage

---

# 90. LAUNCH SCOPE

Do not let future capability delay Nigeria.

V1 financial priorities:

```text
NGN
USD where operationally/provider-supported
```

Architecture:

```text
USDC-ready
crypto-ready
multi-country-ready
multi-provider-ready
```

Implementation:

```text
NO smart contract yet
NO unnecessary blockchain complexity
```

---

# 91. FINAL SYSTEM PHILOSOPHY

VAD consists of several different kinds of truth.

## SOCIAL TRUTH

What people believe.

## MARKET TRUTH

What price participants currently assign to that belief.

## ORACLE TRUTH

What officially happened.

## FINANCIAL TRUTH

What the ledger says is owned, owed, collateralized and settled.

## POLICY TRUTH

What the business currently permits.

Never collapse these layers.

The creator feed does not determine financial truth.

AI does not determine financial truth.

Market price does not determine factual truth.

An administrator should not arbitrarily determine financial truth.

The Oracle Resolution system establishes the event result.

The Settlement system applies that result.

The Ledger records the money.

---

# 92. THE VAD LOOP

The experience ultimately becomes:

```text
DISCOVER
↓
WATCH
↓
ANALYSE
↓
PREDICT
↓
TAKE POSITION
↓
DISCUSS
↓
CHALLENGE
↓
FOLLOW
↓
TRADE
↓
EVENT OCCURS
↓
ORACLE RESOLVES
↓
SETTLEMENT
↓
REPUTATION UPDATES
↓
RETURN
```

That is the product.

Not:

```text
choose football match
↓
place bet
↓
wait
```

---

# 93. FINAL DIRECTIVE TO CHIEF DEV

Do not implement VAD as a collection of screens connected directly to Supabase tables.

Build it as a financial domain platform.

The frontend is replaceable.

Providers are replaceable.

AI providers are replaceable.

Payment providers are replaceable.

KYC providers are replaceable.

Currencies are configurable.

Markets are data-driven.

Policies are versioned.

Algorithms are explicit.

Oracle policies are predetermined.

Liquidity is segregated by asset.

Money is protected by ledger invariants.

Settlement is deterministic.

Creators drive attention.

Markets price conviction.

Oracles establish outcome truth.

The ledger establishes financial truth.

And management operates the business through a human-readable live control plane rather than asking engineers to redeploy applications every time a fee, provider, currency, threshold or operational policy changes.

That is the architecture VAD must be built upon.
