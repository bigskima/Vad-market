# VAD — VALUE ASSET DEPOT

## MASTER PRODUCT + SYSTEM + TECHNICAL ARCHITECTURE DIRECTIVE

**Product:** VAD — Value Asset Depot
**Operating Company:** SKIMA Group LTD
**Initial Market:** Nigeria
**Launch Settlement Asset:** NGN
**Future Asset Support:** USDC and other assets through generic asset/provider architecture
**Primary Client Stack:** Expo + React Native + TypeScript
**Backend:** Supabase + PostgreSQL + Edge Functions
**Architecture Style:** API-first, backend-authoritative, modular monolith, policy-driven, provider-agnostic, event-driven

---

# 1. PURPOSE OF THIS DOCUMENT

This document defines the foundation of VAD.

The development team must not treat VAD as a simple betting application.

VAD is intended to become a:

**social conviction network + creator platform + prediction marketplace + financial market infrastructure + reputation network + market intelligence system.**

The closest conceptual combination is:

**X/Twitter + TikTok/Reels + prediction markets + financial trading + creator reputation + oracle-governed settlement.**

But VAD must develop its own identity.

The product philosophy is:

# OPEN CONVICTION

# CONTROLLED TRUTH

# SEGREGATED MONEY

# CONFIGURABLE POLICY

# AUDITABLE FINANCE

# CREATOR-DRIVEN DISCOVERY

Users generate opinions.

Users generate content.

Users generate market ideas.

Users generate demand.

But users do not determine financial truth.

Financial truth comes from:

**predetermined resolution rules + oracle policies + deterministic settlement + ledger accounting.**

---

# 2. THE MOST IMPORTANT ARCHITECTURAL PRINCIPLE

The application must never be the system of truth.

The complete system should behave conceptually as:

```text
DATABASE
   ↓
DOMAIN SERVICES
   ↓
POLICY ENGINE
   ↓
ALGORITHMS
   ↓
PROVIDER / ORACLE ADAPTERS
   ↓
EDGE / API
   ↓
CLIENT APPLICATIONS
```

NOT:

```text
CLIENT
   ↓
contains rules
   ↓
writes directly into tables
```

The client should never determine:

* wallet balances
* trading eligibility
* fee amount
* settlement amount
* market outcome
* oracle selection
* provider selection
* withdrawal limits
* market activation
* risk decisions
* KYC requirements
* market closing
* refund rules
* supported financial assets
* business policy

The client asks the backend:

> What can this user do right now?

The backend decides.

---

# 3. PRODUCT POSITIONING

Do not build:

> Pick event → place bet → wait → win/lose.

VAD's primary product loop should be:

```text
DISCOVER
   ↓
WATCH / READ
   ↓
UNDERSTAND
   ↓
FORM CONVICTION
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
EVENT EVOLVES
   ↓
ORACLE RESOLUTION
   ↓
SETTLEMENT
   ↓
REPUTATION UPDATE
   ↓
RETURN
```

This is much more engaging than a normal betting product.

---

# 4. INITIAL FINANCIAL SCOPE

VAD launches:

## Nigeria

Production asset:

**NGN**

Do not build USD.

Do not build smart-contract settlement initially.

Do not build on-chain market contracts.

Do not allow crypto implementation to delay launch.

However:

The financial architecture must remain asset-neutral.

Example:

```text
assets

NGN
type = FIAT
status = ACTIVE

USDC
type = STABLECOIN
status = DISABLED

USD
type = FIAT
status = DISABLED
```

Future activation should not require rewriting:

* ledger
* positions
* markets
* fees
* settlements
* wallets
* portfolios

Only new payment/asset rails should need integration.

---

# 5. LOW-COST BUT PRODUCTION-GRADE PRINCIPLE

VAD does not have enterprise startup capital.

Therefore do not over-engineer infrastructure.

But do not build throwaway systems.

The engineering principle is:

# START CHEAP.

# START CORRECT.

# SCALE WHEN NECESSARY.

Use:

* Supabase
* PostgreSQL
* Edge Functions
* Expo
* React Native
* open-source packages
* free-tier providers
* free/cheap observability
* provider adapters

Avoid initially:

* Kubernetes
* dozens of microservices
* expensive data warehouses
* custom blockchain
* custom queue clusters
* enterprise streaming platforms
* dedicated infrastructure that can be replaced by Postgres/Supabase initially

---

# 6. OVERALL PLATFORM DOMAINS

VAD should be a modular monolith initially.

Major bounded contexts:

```text
Identity
Authentication
Profiles
KYC
Devices
Sessions

Social
Creators
Posts
Media
Comments
Reactions
Follows

Market Proposals
Canonical Events
Market Governance
Market Templates
Market Instruments

Trading
Orders
Order Book
Trades
Positions
Liquidity
Collateral

Oracle
Resolution
Disputes

Wallet
Ledger
Payments
Withdrawals
Refunds
Reconciliation
Fees
Revenue

Policies
Configuration
Feature Flags
Capabilities

AI Runtime
Algorithms

Risk
Fraud
Compliance

Notifications

Admin
Audit
Observability
Analytics
```

These are logical modules.

They do not need separate servers at launch.

---

# 7. REPOSITORY / WORKSPACE ARCHITECTURE

Recommended monorepo:

```text
/apps

  /mobile
      VAD Android/iOS

  /web
      VAD consumer/creator web

  /admin
      VAD operational control plane

/packages

  /ui
  /design-system
  /api-client
  /types
  /schemas
  /auth-client
  /analytics
  /feature-runtime
  /localization

/backend

  /domains
      identity
      kyc
      social
      canonical-events
      markets
      trading
      oracle
      settlement
      ledger
      payments
      fees
      policies
      risk
      ai
      notifications

  /edge-functions

  /migrations

  /seed

  /tests

/docs

  architecture
  domain-specs
  api
  security
  runbooks
  market-rules
```

Shared packages must not become a place to hide business rules.

---

# 8. FRONTEND STACK

Use:

**Expo + React Native + TypeScript**

Use:

**Expo Router**

Targets:

* Android
* iOS
* Web
* Admin Web where practical

For admin:

React Native Web may be reused where sensible.

But desktop admin interfaces may use web-specialized components.

Do not force complex:

* data grids
* audit tables
* dashboards
* charts
* multi-column workflows

into mobile UI patterns.

---

# 9. BACKEND STACK

Use:

**Supabase PostgreSQL**

Use:

* Supabase Auth
* PostgreSQL
* Row Level Security
* Storage
* Realtime
* Edge Functions
* database transactions
* Postgres functions
* scheduled jobs
* pgvector where useful
* database constraints
* immutable audit records

Sensitive financial writes must not rely on direct client table writes.

---

# 10. AUTHENTICATION

Support:

* email
* phone
* OTP
* social login later where desired
* MFA for admins
* stronger authentication for high-risk actions

Authentication is not authorization.

Authorization must be server enforced.

---

# 11. USER DOMAIN

Conceptual records:

```text
users
profiles
user_settings
user_preferences
user_status
devices
sessions
login_events
user_roles
user_permissions
```

User status may include:

```text
ACTIVE
RESTRICTED
SUSPENDED
BANNED
DEACTIVATED
UNDER_REVIEW
```

---

# 12. KYC

Initial preferred provider:

Didit or another low-cost provider.

But provider must be abstracted.

Create:

```text
IdentityVerificationProvider
```

Capabilities:

```text
startVerification()
getVerification()
verifyWebhook()
getSupportedChecks()
healthCheck()
```

Database:

```text
identity_verification_sessions
identity_verification_checks
identity_verification_results
identity_provider_events
manual_reviews
```

Never make core logic dependent on Didit-specific names.

---

# 13. KYC POLICY

KYC requirements must be configurable.

Example:

```text
Basic account
→ social only

Verified user
→ NGN deposit

Higher verification
→ withdrawal

Enhanced review
→ larger financial limits
```

These thresholds must come from policies.

---

# 14. ASSET REGISTRY

Create a generic asset system.

```text
assets

id
code
name
symbol
asset_type
minor_units
network
contract_address
status
display_precision
metadata
created_at
```

Asset types:

```text
FIAT
STABLECOIN
CRYPTO
```

Initial:

```text
NGN = ACTIVE

USDC = DISABLED
```

Never create:

```text
ngn_balance
usdc_balance
```

columns.

---

# 15. WALLET ARCHITECTURE

A wallet is not one mutable balance field.

Conceptually:

```text
wallets
wallet_accounts
ledger_accounts
ledger_journals
ledger_entries
```

A user may have accounts such as:

```text
NGN_AVAILABLE
NGN_RESERVED
NGN_WITHDRAWAL_PENDING
```

Future:

```text
USDC_AVAILABLE
USDC_RESERVED
```

generated from generic asset logic.

---

# 16. DOUBLE-ENTRY LEDGER

The ledger is the financial source of truth.

Every value movement must produce debit/credit entries.

Never:

```text
balance = balance + amount
```

without corresponding journal entries.

Example deposit:

```text
Debit:
PROVIDER_CLEARING

Credit:
USER_AVAILABLE
```

depending on accounting orientation.

Every journal must balance:

```text
SUM(DEBITS) = SUM(CREDITS)
```

at transaction level.

---

# 17. LEDGER ACCOUNT CLASSES

Examples:

```text
USER_AVAILABLE

USER_RESERVED

MARKET_COLLATERAL

WITHDRAWAL_PENDING

PROVIDER_CLEARING

PLATFORM_TRADING_FEE_REVENUE

PLATFORM_SETTLEMENT_FEE_REVENUE

PLATFORM_WITHDRAWAL_REVENUE

REFUND_PAYABLE

CREATOR_REWARD_PAYABLE

TREASURY

SUSPENSE

CHARGEBACK_RECEIVABLE
```

Every account:

```text
asset_id
account_type
owner_type
owner_id
status
```

---

# 18. MONEY PRECISION

Never use floating point for money.

Use:

* integer minor units
  or
* PostgreSQL NUMERIC with strict precision rules

NGN may display ₦1.

But internal financial precision should support market share pricing.

Example:

```text
₦0.473821
```

may require higher precision internally.

Define separate:

```text
accounting_precision
display_precision
pricing_precision
```

---

# 19. PAYMENT ARCHITECTURE

Do not hardcode Paystack, Monnify, or Interswitch.

Create:

```text
PaymentProviderAdapter
```

Methods:

```text
getCapabilities()

createDeposit()

verifyDeposit()

createWithdrawal()

verifyWithdrawal()

getTransaction()

refund()

resolveAccount()

createVirtualAccount()

verifyWebhook()

healthCheck()
```

---

# 20. PAYMENT ORCHESTRATOR

Create:

```text
PaymentOrchestrator
```

Inputs:

```text
country
asset
operation
amount
user
provider health
provider policy
```

Returns:

```text
selected provider
fallback provider
payment instructions
```

Admin controls provider priority.

---

# 21. DEPOSIT FLOW

```text
User requests deposit
↓
Backend validates user
↓
KYC policy
↓
Deposit policy
↓
PaymentOrchestrator
↓
Provider
↓
Payment initiated
↓
Provider webhook
↓
Signature verification
↓
Transaction verification
↓
Idempotency
↓
Ledger journal
↓
USER_AVAILABLE credited
↓
Notification
```

Never trust client success callback.

---

# 22. WITHDRAWAL FLOW

```text
Withdrawal request
↓
Authentication
↓
KYC
↓
Balance
↓
Risk
↓
Limits
↓
Fee quote
↓
USER_AVAILABLE → WITHDRAWAL_PENDING
↓
Provider payout
↓
Provider result
↓
Ledger finalize
↓
Notification
```

If provider fails:

release reservation safely.

---

# 23. RECONCILIATION

VAD must periodically compare:

```text
internal ledger
VS
payment provider records
```

Detect:

* missing deposits
* duplicate callbacks
* withdrawal mismatch
* chargeback
* provider settlement mismatch

Never silently edit ledger.

Create:

```text
reconciliation_runs
reconciliation_items
reconciliation_exceptions
```

---

# 24. CANONICAL EVENT SYSTEM

This is one of VAD's most important systems.

A canonical event represents:

**one unique real-world proposition.**

Example:

```text
Will Chelsea win the 2026/27 Premier League?
```

This is not the same as:

```text
Will Chelsea finish Top 4?
```

nor:

```text
Will Chelsea finish above Arsenal?
```

---

# 25. CANONICAL EVENT STRUCTURE

Conceptual:

```text
canonical_events

id
template_id
title
description
subject_entities
competition_id
season_id
time_scope
resolution_scope
outcome_schema
canonical_fingerprint
status
oracle_policy_version_id
created_at
```

---

# 26. CANONICAL FINGERPRINT

For structured templates:

```text
fingerprint =
HASH(
 template_type
 entity_ids
 competition
 season
 threshold
 operator
 timeframe
 resolution_scope
)
```

Example:

```text
LEAGUE_CHAMPION
CHELSEA_ID
EPL_ID
2026_27
```

Same fingerprint:

same canonical event.

---

# 27. CANONICALIZATION ALGORITHM

Process:

```text
Market proposal
↓
Normalize text
↓
Extract entities
↓
Identify event template
↓
Resolve known entity IDs
↓
Generate fingerprint
↓
Exact fingerprint search
↓
Semantic candidate search
↓
Structural comparison
↓
AI-assisted duplicate analysis
↓
Decision
```

Possible decisions:

```text
EXACT_DUPLICATE

SEMANTIC_DUPLICATE

RELATED_EVENT

DISTINCT_EVENT

UNCERTAIN
```

---

# 28. AI MUST NOT CONTROL CANONICALIZATION ALONE

AI assists.

Deterministic checks validate.

For example:

AI might incorrectly see:

```text
Chelsea wins league
```

and:

```text
Chelsea finishes top four
```

as very similar.

But event templates make them different.

Final canonicalization must compare:

* template
* subject
* season
* competition
* threshold
* operator
* deadline
* resolution scope

---

# 29. CANONICAL EVENT GRAPH

Related markets should form an event graph.

Example:

```text
CHELSEA 2026/27

├── EPL Champion
├── Top 4
├── Above Arsenal
├── 80+ goals
└── Player X 15+ goals
```

Create:

```text
event_relationships
```

relationship types:

```text
RELATED
PARENT
CHILD
CORRELATED
SAME_ENTITY
SAME_COMPETITION
```

This powers:

* discovery
* thesis
* recommendations
* analytics
* market shocks

---

# 30. MARKET PROPOSALS

Anyone permitted may propose.

But:

# PROPOSAL ≠ FINANCIAL MARKET

A proposal may become:

```text
REJECTED

SOCIAL_ONLY

NEEDS_CLARIFICATION

UNDER_REVIEW

APPROVED
```

---

# 31. PROPOSAL PIPELINE

```text
SUBMITTED
↓
MODERATION
↓
NORMALIZATION
↓
ENTITY EXTRACTION
↓
TEMPLATE CLASSIFICATION
↓
CANONICALIZATION
↓
DUPLICATE ANALYSIS
↓
AMBIGUITY ANALYSIS
↓
ORACLE AVAILABILITY
↓
MANIPULATION RISK
↓
MARKET QUALITY
↓
GOVERNANCE
↓
APPROVED
```

---

# 32. MARKET QUALITY ALGORITHM

Internal signals:

```text
objectivity_score

oracle_availability_score

ambiguity_score

duplicate_probability

market_integrity_score

creator_reputation_score

expected_interest

manipulation_risk
```

These are workflow signals.

They do not independently determine financial truth.

---

# 33. MARKET TEMPLATES

Build reusable templates.

Sports examples:

```text
MATCH_WINNER

LEAGUE_CHAMPION

TOP_X_FINISH

HEAD_TO_HEAD_FINAL_POSITION

PLAYER_GOALS_OVER_X

TEAM_GOALS_OVER_X

QUALIFIES

RELEGATED
```

Finance/economics later:

```text
ASSET_ABOVE_PRICE_AT_TIME

FX_RATE_ABOVE_X

POLICY_RATE_CHANGE

INFLATION_ABOVE_X
```

Creators provide parameters.

They do not write settlement code.

---

# 34. FINANCIAL MARKET INSTRUMENT

Canonical event = truth object.

Market instrument = financially tradable object.

Example:

```text
canonical_event:
Chelsea EPL Champion

instrument:
asset = NGN
market_type = BINARY
liquidity_model = ORDER_BOOK
```

Future:

same event can have:

```text
USDC instrument
```

without changing the canonical truth.

---

# 35. MARKET STATES

Use explicit state machine:

```text
DRAFT

PROPOSED

UNDER_REVIEW

APPROVED

SCHEDULED

OPEN

SUSPENDED

CLOSED

AWAITING_ORACLE

PROVISIONALLY_RESOLVED

DISPUTED

FINALIZED

SETTLEMENT_PENDING

SETTLED

VOIDED

CANCELLED
```

State transitions must be controlled.

---

# 36. ORDER BOOK MODEL

Initial recommended liquidity engine:

# CENTRAL LIMIT ORDER BOOK

Use:

# PRICE-TIME PRIORITY

This is preferable at startup because VAD does not need to bankroll every market.

---

# 37. BINARY MARKET ECONOMICS

For binary markets:

```text
YES
NO
```

One complete outcome set:

```text
1 YES
+
1 NO
=
₦1 settlement value
```

If YES resolves:

```text
YES = ₦1
NO = ₦0
```

If NO:

```text
YES = ₦0
NO = ₦1
```

---

# 38. COMPLEMENTARY ORDER CREATION

Example:

Trader A wants YES at:

```text
₦0.40
```

Trader B wants NO at:

```text
₦0.60
```

Together:

```text
₦1.00
```

System may create:

```text
1 YES
1 NO
```

and lock:

```text
₦1
```

as market collateral.

---

# 39. WHY VAD DOES NOT NEED A GIANT HOUSE BANKROLL

VAD should initially match market participants.

VAD is not automatically counterparty.

When compatible interest forms a complete collateralized pair:

positions are created.

Therefore:

```text
maximum settlement liability
<=
market collateral
```

must always hold.

---

# 40. EMPTY MARKET

When no counterparty exists:

do not fake liquidity.

Order remains:

```text
OPEN
```

Possible user-facing message:

> Waiting for matching liquidity.

Future liquidity engines may include:

```text
AMM
HYBRID
APPROVED MARKET MAKERS
```

but do not start with unnecessary treasury exposure.

---

# 41. LIQUIDITY ENGINE INTERFACE

Build generic interface:

```text
LiquidityEngine

quote()

placeOrder()

cancelOrder()

match()

getDepth()

getBestBidAsk()
```

Implementation:

```text
OrderBookLiquidityEngine
```

Future:

```text
AMMLiquidityEngine

HybridLiquidityEngine
```

---

# 42. ORDER MODEL

```text
orders

id
user_id
market_id
outcome_id
side
order_type
price
quantity
filled_quantity
remaining_quantity
status
sequence_number
created_at
expires_at
```

Statuses:

```text
OPEN

PARTIALLY_FILLED

FILLED

CANCELLED

EXPIRED

REJECTED
```

---

# 43. ORDER MATCHING ALGORITHM

Priority:

# PRICE FIRST

# TIME SECOND

Use server-generated sequence number.

Never trust client timestamp.

Conceptually:

```text
incoming order
↓
find compatible resting order
↓
best price
↓
earliest sequence
↓
validate funds
↓
reserve/collateralize
↓
create trade
↓
update orders
↓
update positions
↓
ledger
↓
publish event
```

All financial changes must happen transactionally.

---

# 44. ORDER RESERVATION

When placing an order:

```text
USER_AVAILABLE
→
USER_RESERVED
```

Only matched amount becomes collateral.

Unfilled remainder remains reserved.

On cancel:

```text
USER_RESERVED
→
USER_AVAILABLE
```

---

# 45. TRADES

Create:

```text
trades

id
market_id
maker_order_id
taker_order_id
price
quantity
asset_id
executed_at
sequence_number
```

Trades are immutable.

Corrections happen through explicit reversals/administrative workflows.

---

# 46. POSITIONS

```text
positions

user_id
market_id
outcome_id
quantity
average_price
realized_pnl
unrealized_pnl
fees_paid
status
```

Also preserve individual fills.

Average price is derived analytics.

Do not throw away fill history.

---

# 47. ENTRY TIMING

Timing matters through market price.

Example:

Early:

```text
YES = ₦0.20
```

Later:

```text
YES = ₦0.80
```

Two users spending same amount receive different share quantities.

Earlier correct conviction earns more because it purchased more shares.

Do not create arbitrary:

```text
early_bettor_multiplier
```

---

# 48. SETTLEMENT EXAMPLE

Suppose final YES holders:

Alice:

```text
20,000 YES shares
```

Bob:

```text
8,000 YES shares
```

Carol:

```text
3,500 YES shares
```

YES wins.

Settlement:

```text
Alice → 20,000 × ₦1

Bob → 8,000 × ₦1

Carol → 3,500 × ₦1
```

subject to configured fee policy.

Settlement depends on:

**final share ownership.**

---

# 49. IMPORTANT: TOTAL POOL IS NOT DIVIDED BY STAKE RATIO

Do not implement:

```text
winner payout =
stake / winning stakes × pool
```

That is sportsbook/parimutuel logic.

VAD uses tradable shares.

The number of winning shares determines payout.

This allows:

* early entry
* later entry
* partial selling
* market exits
* transfers through trades
* dynamic probabilities

---

# 50. ORACLE ARCHITECTURE

The oracle is one of the most sensitive components.

AI is not oracle.

Creators are not oracle.

Public voting is not oracle.

Market price is not oracle.

Oracle sources must be predetermined.

---

# 51. ORACLE REGISTRY

```text
oracle_providers
oracle_capabilities
oracle_sources
oracle_policies
oracle_policy_versions
oracle_observations
oracle_consensus_runs
oracle_resolutions
oracle_evidence
oracle_disputes
```

---

# 52. ORACLE CAPABILITIES

Examples:

```text
SPORT_MATCH_RESULT

SPORT_TABLE

SPORT_PLAYER_STAT

CRYPTO_PRICE

FX_RATE

ECONOMIC_INDICATOR

ELECTION_RESULT

COMPANY_EVENT
```

---

# 53. SOURCE HIERARCHY

Possible hierarchy:

```text
AUTHORITATIVE SOURCE

LICENSED/STRUCTURED PROVIDER

SECONDARY CORROBORATING SOURCE

CONTROLLED HUMAN REVIEW
```

Market policy decides priority.

---

# 54. ORACLE POLICY MUST EXIST BEFORE TRADING

Before a market opens, define:

```text
primary source

secondary source

consensus requirement

resolution condition

market close condition

postponement handling

cancellation handling

void rule

dispute window

finality condition
```

Once financial trading begins:

applicable policy version becomes immutable.

---

# 55. ORACLE OBSERVATIONS

Never overwrite.

Store:

```text
provider
source
observed outcome
raw payload reference
timestamp
confidence
verification status
```

Oracle history must remain auditable.

---

# 56. ORACLE CONSENSUS ALGORITHM

Example:

```text
Source A = YES

Source B = YES

Source C = UNKNOWN
```

Policy:

```text
2 matching trusted sources required
```

Result:

```text
PROVISIONAL YES
```

If sources conflict:

```text
ORACLE_CONFLICT
```

Do not guess.

---

# 57. RESOLUTION FLOW

```text
Market closes
↓
Oracle observations collected
↓
Resolution policy evaluated
↓
Provisional result
↓
Dispute window
↓
No valid dispute / dispute resolved
↓
Final result
```

Only then does settlement execute.

---

# 58. DISPUTE ENGINE

```text
market_disputes

id
market_id
opened_by
reason
evidence
status
assigned_reviewer
resolution
created_at
resolved_at
```

Dispute workflow:

```text
OPEN

UNDER_REVIEW

UPHELD

REJECTED

ESCALATED

RESOLVED
```

---

# 59. SETTLEMENT ENGINE

Resolution:

> what happened?

Settlement:

> what financial entries follow?

They are different services.

---

# 60. SETTLEMENT FLOW

```text
FINAL RESULT
↓
Settlement Engine
↓
Load outstanding positions
↓
Calculate gross entitlement
↓
Load applicable fee policy
↓
Calculate fees
↓
Check solvency
↓
Create settlement journal
↓
Credit winning users
↓
Book platform fees
↓
Close positions
↓
Mark market settled
```

Must be idempotent.

---

# 61. SOLVENCY INVARIANT

Mandatory:

```text
MARKET COLLATERAL
>=
MAXIMUM POSSIBLE SETTLEMENT LIABILITY
```

If this invariant fails:

halt settlement and create critical incident.

Never allow administrator to casually bypass.

---

# 62. FEES

Build:

# FeePolicyEngine

Do not calculate fees inside UI.

Do not scatter percentages across code.

---

# 63. POSSIBLE FEE TYPES

Architecture may support:

```text
MAKER_FEE

TAKER_FEE

SETTLEMENT_FEE

PROFIT_FEE

WITHDRAWAL_FEE

DEPOSIT_PROCESSING_FEE

CREATOR_REVENUE_SHARE

PREMIUM_CREATOR_SUBSCRIPTION

PREMIUM_ANALYTICS
```

Launch does not need all of them active.

---

# 64. INITIAL REVENUE MODEL

Keep initial monetization simple.

A reasonable starting system is:

**executed trading fees**

Potentially:

```text
maker = configurable

taker = configurable
```

Do not hardcode rate.

---

# 65. FEE POLICY STRUCTURE

```text
fee_policies

id
name
fee_type
scope
asset_id
market_category
maker_rate
taker_rate
minimum_fee
maximum_fee
effective_at
expires_at
status
version
```

---

# 66. HUMAN-READABLE ADMIN FEE POLICY

Admin interface:

```text
Policy Name
Standard NGN Trading Fee

Applies To
All NGN Markets

Maker Fee
0.00%

Taker Fee
1.00%

Minimum Fee
₦0

Maximum Fee
None

Effective From
01/09/2026

Status
Active
```

Admins do not edit JSON.

---

# 67. POLICY VERSIONING

Never overwrite historical policy.

Example:

```text
Trading Fee V1
1%

Trading Fee V2
0.75%
```

Trades store:

```text
fee_policy_version_id
```

Therefore historical calculations remain explainable.

---

# 68. FEE QUOTES

Before transaction:

```text
trade amount
fee
total debit
```

returned by server.

Client displays.

Client never calculates authoritative fee.

---

# 69. REFUNDS

Refund is not one concept.

Separate:

```text
PAYMENT_REFUND

ORDER_RESERVATION_RELEASE

MARKET_VOID_SETTLEMENT

PLATFORM_COMPENSATION

CHARGEBACK
```

---

# 70. PAYMENT REFUND

Linked to original provider transaction.

Track:

```text
original_payment_id
provider_refund_id
amount
reason
status
ledger_journal_id
```

---

# 71. ORDER RELEASE

Example:

User reserves:

```text
₦50,000
```

Only:

```text
₦30,000
```

fills.

Remaining:

```text
₦20,000
```

returns:

```text
USER_RESERVED
→
USER_AVAILABLE
```

This is not provider refund.

---

# 72. MARKET VOID

After trading has happened, never try to return money to "original bettors."

Shares may have changed owners.

Use predetermined void settlement.

Example:

```text
YES = ₦0.50

NO = ₦0.50
```

for binary complete sets.

Exact void policy must be predefined and visible.

---

# 73. PLATFORM COMPENSATION

Platform error should create:

```text
compensation_case
```

Separate from market settlement.

Financial correction uses explicit audited ledger entries.

---

# 74. CHARGEBACK

Chargeback is financial risk.

May trigger:

```text
withdrawal hold

account review

receivable

risk score

account restriction
```

Never silently alter unrelated market collateral.

---

# 75. SOCIAL PLATFORM

VAD should not look like admin software.

Its consumer interface is central to the product.

Core social entities:

```text
posts
media
comments
reactions
bookmarks
shares
follows
hashtags
topics
creator_profiles
```

---

# 76. CONTENT TYPES

Support:

```text
TEXT

IMAGE

SHORT_VIDEO

LONG_VIDEO

MARKET_ANALYSIS

PREDICTION_POST

THESIS

LIVE_EVENT_POST
```

---

# 77. MARKET-ATTACHED CONTENT

Creators should be able to attach a canonical market.

Example:

```text
[VIDEO]

"Why Chelsea is still underpriced"

Market:
Chelsea EPL Champion

YES
NO

Current Price

Take Position
Challenge
Add to Thesis
Open Market
```

---

# 78. CREATOR SYSTEM

Creator profile:

```text
followers

markets originated

approved proposals

prediction accuracy

calibration

category performance

volume influenced

current streak

resolved predictions

public theses
```

---

# 79. MARKET ORIGINATOR

When a creator proposes a unique valid market:

record:

```text
originator_user_id
```

But originator must never control:

* oracle
* resolution
* settlement

---

# 80. SOCIAL PREDICTIONS

Not every prediction must become financial.

Create:

```text
SOCIAL_ONLY
```

Social prediction may have:

* confidence
* explanation
* deadline
* reputation effect

but no money.

This allows creativity while protecting financial integrity.

---

# 81. PREDICTION BATTLES

Users can challenge each other.

Battle:

```text
Creator A:
Chelsea finishes above Arsenal

Creator B:
No
```

Prefer linking financial side to canonical market rather than building a separate uncontrolled escrow system initially.

---

# 82. THESIS SYSTEM

Users can create:

```text
MY 2026/27 FOOTBALL THESIS

Chelsea Top 4

Arsenal Trophyless

Player X 15+ Goals
```

Thesis contains:

* predictions
* positions
* creator commentary
* performance

Do not create leveraged composite financial instruments initially.

---

# 83. AI SYSTEM

AI is a first-class system.

But:

# AI IS NOT ORACLE.

---

# 84. AI CAPABILITIES

Use AI for:

```text
MARKET_PROPOSAL_STRUCTURING

ENTITY_EXTRACTION

DUPLICATE_ASSISTANCE

AMBIGUITY_ANALYSIS

CONTENT_MODERATION

MARKET_SUMMARY

CREATOR_WRITING_ASSISTANCE

RELATED_MARKET_DISCOVERY

SEARCH

NEWS_SUMMARIZATION

FEED_ENRICHMENT

RISK_TRIAGE

SUPPORT_ASSISTANCE
```

---

# 85. AI PROVIDER ABSTRACTION

Create:

```text
AIProviderAdapter
```

Provider implementations may include:

```text
OpenAI

Gemini

Claude

Open-source/local

Future provider
```

---

# 86. AI RUNTIME TABLES

```text
ai_providers
ai_models
ai_capabilities
ai_routes
ai_prompt_versions
ai_runs
ai_outputs
ai_cost_usage
ai_failures
```

---

# 87. AI ROUTING

Request:

```text
capability = MARKET_STRUCTURING
```

Runtime:

```text
policy
↓
provider health
↓
cost
↓
configured priority
↓
model
↓
execute
↓
schema validation
↓
domain validation
```

---

# 88. AI FAILURE MODE

If AI fails completely:

financial core must continue.

Users must still:

* access wallets
* withdraw
* trade existing structured markets
* receive oracle resolution
* settle

AI convenience can degrade.

Finance cannot.

---

# 89. ALGORITHM FRAMEWORK

Algorithms are broader than AI.

Create versioned algorithm definitions:

```text
algorithms
algorithm_versions
algorithm_parameters
algorithm_deployments
algorithm_runs
```

---

# 90. ALGORITHM TYPES

Financial:

```text
order matching

pricing

collateral

settlement

fees
```

Market:

```text
canonicalization

quality scoring

related-event detection
```

Social:

```text
feed ranking

trending

recommendations
```

Trust:

```text
spam

reputation

calibration

manipulation
```

Oracle:

```text
consensus

conflict
```

Risk:

```text
fraud

withdrawal risk

concentration
```

---

# 91. FEED ALGORITHM

Possible signals:

```text
follow relationship

creator quality

topic relevance

market relevance

recent engagement

market movement

volume velocity

content freshness

user interest

diversity
```

Weights should be configurable.

Do not hardcode into frontend.

---

# 92. TRENDING ALGORITHM

Possible inputs:

```text
trade volume velocity

unique traders

unique creators

post velocity

comment velocity

price movement

time decay
```

---

# 93. REPUTATION ALGORITHM

Do not use only win rate.

Eventually use:

```text
accuracy

Brier score

calibration

category performance

prediction difficulty

confidence quality
```

Version scoring algorithm.

---

# 94. RISK ENGINE

Inputs:

```text
account signals

device signals

payments

trades

withdrawals

positions

market activity

creator relationships

chargebacks
```

---

# 95. RISK SIGNALS

Examples:

```text
wash trading

self trading

linked-account trading

suspicious device overlap

rapid deposit-trade-withdraw

position concentration

coordinated creator activity

suspicious pre-announcement activity

chargeback pattern

account farming
```

---

# 96. RISK ACTIONS

```text
ALLOW

REVIEW

LIMIT

HOLD

SUSPEND

FREEZE_WITHDRAWAL

HALT_MARKET

FREEZE_SETTLEMENT

ESCALATE
```

Policies determine thresholds.

---

# 97. POLICY ENGINE

VAD must operate like a live system.

Build a general policy framework.

Policies include:

```text
fees

assets

providers

KYC

market templates

market approval

oracle

risk

withdrawal limits

deposit limits

order limits

disputes

AI routing

algorithm parameters

creator capabilities

feature flags
```

---

# 98. POLICY RECORD

Concept:

```text
policies

id
domain
name
status
version
effective_at
expires_at
created_by
approved_by
reason
```

---

# 99. HUMAN-READABLE ADMIN POLICY

Do not expose:

```json
{
  "threshold": 0.73
}
```

Expose:

```text
Market Proposal Auto-Review Threshold

Minimum Quality Score
73%

Action Below Threshold
Send to manual review
```

---

# 100. NO-HARDCODING RULE

Business policy must not be scattered through code.

Examples that should not require app redeployment:

* trading fee
* withdrawal fee
* deposit limits
* withdrawal limits
* market categories
* provider priority
* active payment provider
* active KYC provider
* oracle priority
* dispute window
* creator eligibility
* proposal limits
* feed weights where safe
* risk thresholds
* feature flags
* asset activation

---

# 101. IMPORTANT LIMIT

"No redeployment" does not mean VAD can magically implement completely new software from admin.

A new provider protocol may require code.

A new algorithm may require code.

A new market type may require code.

But after integration:

configuration should control activation.

---

# 102. FEATURE FLAGS

Create:

```text
feature_flags
feature_flag_rules
feature_flag_versions
```

Examples:

```text
USDC

CRYPTO_WALLET

POLITICAL_MARKETS

PREDICTION_BATTLES

THESIS

AMM

CREATOR_REVENUE_SHARE

AI_CREATOR_ASSISTANT
```

---

# 103. CAPABILITY ENGINE

Client should call:

```text
GET /runtime/capabilities
```

Result based on:

```text
user
KYC
country
role
risk
feature flags
asset policy
provider availability
market policy
```

Client renders returned capabilities.

---

# 104. EVENT BUS

Use domain events.

Examples:

```text
USER_REGISTERED

KYC_COMPLETED

DEPOSIT_CONFIRMED

WITHDRAWAL_REQUESTED

MARKET_PROPOSED

MARKET_APPROVED

MARKET_OPENED

ORDER_PLACED

ORDER_MATCHED

TRADE_EXECUTED

POSITION_CHANGED

MARKET_CLOSED

ORACLE_OBSERVATION_RECEIVED

MARKET_PROVISIONALLY_RESOLVED

MARKET_FINALIZED

SETTLEMENT_COMPLETED

DISPUTE_OPENED

REFUND_CREATED

RISK_ALERT_CREATED
```

---

# 105. EVENT STORAGE

Create:

```text
domain_events

id
event_type
aggregate_type
aggregate_id
payload
created_at
processed_at
```

Use outbox pattern where appropriate.

---

# 106. EDGE FUNCTIONS

Potential Edge Functions:

```text
auth-runtime

runtime-capabilities

start-kyc

kyc-webhook

create-deposit

payment-webhook

request-withdrawal

provider-webhook

submit-market-proposal

process-market-proposal

place-order

cancel-order

oracle-ingest

oracle-resolve

open-dispute

finalize-market

settle-market

fee-quote

admin-update-policy

admin-market-action

ai-run

notification-dispatch
```

---

# 107. DIRECT DATABASE ACCESS

Safe:

* public content reads
* approved market reads
* user-owned simple profile reads
* realtime subscriptions

Sensitive writes:

* order execution
* withdrawal
* settlement
* ledger
* oracle
* fee changes
* admin actions

must go through server-authoritative paths.

---

# 108. ROW LEVEL SECURITY

Use RLS.

Users should only access:

* their private wallet data
* their orders
* their positions
* permitted market information
* public social content

Admins access based on RBAC.

Service-role access only inside trusted server runtime.

---

# 109. ADMIN RBAC

Roles:

```text
SUPER_ADMIN

FINANCE_ADMIN

MARKET_ADMIN

ORACLE_REVIEWER

RISK_ADMIN

COMPLIANCE_ADMIN

CONTENT_MODERATOR

SUPPORT_AGENT

READ_ONLY_AUDITOR
```

Permissions should be granular.

---

# 110. SEPARATION OF DUTIES

High-risk actions should support dual control.

Examples:

```text
large compensation

manual ledger correction

oracle override

major policy change

provider switch

treasury movement
```

Maker-checker model:

```text
REQUEST
↓
SECOND APPROVAL
↓
EXECUTE
```

---

# 111. ADMIN CONTROL PLANE

Admin dashboard is not CMS.

It is the operational brain.

Major sections:

```text
Overview

Users

KYC

Creators

Content

Market Proposals

Canonical Events

Markets

Orders

Trades

Positions

Oracle

Disputes

Risk

Wallets

Payments

Withdrawals

Refunds

Ledger

Reconciliation

Revenue

Fees

Assets

Providers

Policies

Algorithms

AI

Feature Flags

Notifications

Audit

System Health
```

---

# 112. ADMIN OVERVIEW

Dashboard should show:

```text
active users

verified users

active markets

open orders

24h trading volume

market collateral

pending withdrawals

failed payments

oracle conflicts

unresolved disputes

risk alerts

reconciliation exceptions

platform revenue

provider health
```

---

# 113. ORACLE ADMIN

Oracle reviewers need:

```text
market

resolution rule

primary source

secondary source

observations

conflict state

evidence

provisional result

dispute status

final result
```

No hidden resolution.

---

# 114. FINANCE ADMIN

Finance sees:

```text
ledger

account balances

provider clearing

user liabilities

market collateral

fees

revenue

withdrawals

refunds

chargebacks

reconciliation
```

---

# 115. SYSTEM HEALTH ADMIN

Monitor:

```text
Supabase

Edge Functions

payment providers

KYC

AI providers

oracle providers

queue backlog

webhook backlog

settlement backlog

reconciliation failures
```

---

# 116. NOTIFICATION SYSTEM

Channels:

```text
in-app

push

email

SMS where required
```

Events:

```text
deposit confirmed

withdrawal completed

order filled

market closed

market resolved

settlement completed

dispute update

KYC update

risk/account alert
```

Provider abstraction required.

---

# 117. REALTIME

Use Supabase Realtime for:

```text
market prices

order status

recent trades

comments

notifications

market status

position updates
```

Realtime is presentation.

Database remains authority.

---

# 118. SEARCH

Search across:

```text
markets

canonical events

creators

posts

topics

teams

competitions
```

Use Postgres full text initially.

Use pgvector for semantic discovery where helpful.

---

# 119. MEDIA

Storage:

Supabase Storage initially.

Media pipeline:

```text
upload

validate

scan

transcode/compress where required

thumbnail

publish
```

Video optimization is important.

Do not store giant uncompressed creator media.

---

# 120. ANALYTICS

Initial analytics can be lightweight.

Track:

```text
signup

KYC completion

deposit initiation

deposit success

market view

order placement

trade completion

creator follow

post engagement

withdrawal

settlement

retention
```

Do not expose personally sensitive financial data unnecessarily to external analytics providers.

---

# 121. OBSERVABILITY

Must have structured logs.

Monitor:

```text
failed webhooks

payment mismatch

withdrawal failure

ledger imbalance

market solvency

oracle conflict

settlement failure

AI errors

provider errors

risk spikes

database errors
```

---

# 122. CRITICAL ALERTS

Immediate alerts for:

```text
ledger imbalance

collateral deficit

duplicate settlement attempt

payment signature failure surge

oracle conflict on high-volume market

admin privilege escalation

provider outage

reconciliation discrepancy

suspicious withdrawal spike
```

---

# 123. AUDIT SYSTEM

Immutable audit records for:

```text
admin action

market approval

market rejection

policy change

provider switch

oracle decision

dispute decision

refund

compensation

KYC override

risk override

role change

financial correction
```

Record:

```text
actor
action
resource
before
after
reason
timestamp
request id
```

---

# 124. SECURITY

Use:

* RLS
* least privilege
* service-role isolation
* secure secret storage
* webhook signatures
* idempotency
* rate limits
* MFA for admin
* session monitoring
* device/risk signals
* permission checks
* audit
* CSRF protection on web where relevant
* secure headers
* input validation
* schema validation

---

# 125. RATE LIMITS

Different limits for:

```text
login

OTP

market proposal

comments

orders

withdrawals

AI actions

search

admin actions
```

Limits should be policy-driven where possible.

---

# 126. IDEMPOTENCY

Required for:

```text
deposit webhook

withdrawal request

withdrawal provider callback

order placement

trade execution

refund

oracle ingestion

settlement

compensation
```

---

# 127. DATABASE TRANSACTIONS

Critical financial flow must be atomic.

Example order match:

```text
reserve
+
trade
+
position
+
collateral
+
fee
+
order update
```

either all succeed or all rollback.

---

# 128. BACKGROUND JOBS

Use workers/jobs for:

```text
oracle polling

settlement

notifications

market expiry

order expiry

reconciliation

AI processing

media processing

risk scans

analytics aggregation
```

---

# 129. MARKET CLOSING

Market close rules are predetermined.

Examples:

```text
match kickoff

specific timestamp

official announcement

event completion
```

Do not allow trading after cutoff.

Server time is authoritative.

---

# 130. MARKET SUSPENSION

Support emergency:

```text
SUSPENDED
```

Reasons:

```text
oracle issue

provider issue

market integrity concern

event uncertainty

admin safety intervention
```

Suspension should not silently cancel existing positions.

---

# 131. MARKET CANCELLATION

Different from suspension.

Cancellation policy determines:

* open orders
* reserved funds
* existing positions
* void settlement

Everything must be predefined.

---

# 132. MARKET MANIPULATION PROTECTION

Monitor:

```text
wash trades

self matching

cross-account coordination

spoofing-like behavior

position concentration

creator coordination

rapid price manipulation

abnormal order cancellation patterns
```

Do not expose sensitive risk detection logic publicly.

---

# 133. SELF-TRADING

User should not be allowed to intentionally match against own order.

Matching engine should detect same beneficial account/user where possible.

---

# 134. CREATOR INCENTIVES

Creators may eventually earn through:

```text
subscriptions

premium content

platform revenue share

market origination rewards

engagement programs
```

But creator rewards must never depend on manipulating the outcome.

---

# 135. CREATOR REVENUE SHARE

If later enabled:

calculate from:

```text
eligible platform revenue
```

not settlement collateral.

Never take winner collateral to pay creator rewards.

---

# 136. PLATFORM REVENUE

Platform revenue belongs in separate ledger accounts.

Never confuse:

```text
user funds

market collateral

provider clearing

platform revenue
```

---

# 137. FINANCIAL REPORTING

Finance should view revenue by:

```text
day

market

market category

fee type

provider

user cohort

asset
```

Initial asset:

NGN.

---

# 138. FUTURE USDC

Foundation only.

Do not build smart contracts now.

Future integration should plug into:

```text
Asset Registry

WalletProvider

CryptoDepositProvider

CryptoWithdrawalProvider

BlockchainOracleProvider
```

Then create:

```text
USDC market instrument
```

with independent liquidity.

---

# 139. NO CROSS-ASSET LIQUIDITY

Future rule:

```text
NGN market
≠
USDC market
```

Same canonical event.

Different order books.

Different collateral.

Different settlement.

Never automatically use NGN collateral to satisfy USDC liability.

---

# 140. CONFIGURATION CACHING

Policies may be cached.

But implement:

```text
versioning

cache invalidation

effective timestamps

rollback

audit
```

---

# 141. CONFIGURATION SAFETY

Not all configuration should be editable by everyone.

Financial policies:

Finance/Super Admin.

Oracle policies:

Oracle Admin/Super Admin.

Risk policies:

Risk Admin.

Feature flags:

authorized product/admin roles.

---

# 142. FRONTEND INFORMATION ARCHITECTURE

Consumer application major areas:

```text
Home

Discover

Markets

Creator Feed

Watch/Reels

Search

Notifications

Portfolio

Wallet

Profile
```

---

# 143. HOME

Home should combine:

```text
personalized content

trending markets

followed creators

live market movement

major event stories

open positions

recommended debates
```

It should not look like a table of betting odds.

---

# 144. DISCOVER

Discover:

```text
Sports

Economy

Crypto later

Entertainment

Politics later if enabled

Technology

Culture

Trending

New
```

Categories are policy/configuration.

---

# 145. MARKET DETAIL SCREEN

Must show:

```text
question

current price

YES/NO

order book

recent trades

volume

liquidity

close time

oracle rules

resolution rules

creator discussions

related markets

market history

user position

Take Position
```

---

# 146. ORACLE TRANSPARENCY

Every financial market must expose:

```text
How this market resolves

Primary source

Fallback source

Resolution condition

What happens if postponed

What happens if cancelled

Dispute window
```

Human-readable.

---

# 147. TRADE TICKET

User chooses:

```text
YES/NO

amount or shares

limit price

estimated shares

fee

total debit

potential settlement value
```

Server returns quote.

---

# 148. PORTFOLIO

Show:

```text
open positions

closed positions

realized P/L

unrealized P/L

fees

settled markets

creator theses
```

---

# 149. WALLET

Show:

```text
available balance

reserved balance

pending withdrawal

deposit

withdraw

transaction history
```

Do not expose accounting complexity to normal user.

---

# 150. NOTIFICATIONS

Examples:

```text
order filled

market moving

creator replied

creator posted

market closed

market resolved

settlement received

withdrawal completed
```

---

# 151. ADMIN UI PRINCIPLE

Admin must be professional operational software.

Not another long form.

Use:

* tables
* filters
* charts
* panels
* timelines
* drawers
* diff views
* approval workflows
* live status
* bulk operations where safe

---

# 152. DATABASE NAMING

Use consistent domain prefixes/schemas where useful.

Potential Postgres schemas:

```text
identity

social

markets

trading

oracle

finance

policy

risk

ai

admin

audit
```

---

# 153. DATABASE CONSTRAINTS

Do not rely solely on application code.

Examples:

```text
quantity > 0

price > 0

price < 1 settlement unit

ledger journal balances

unique canonical fingerprint

unique active market per canonical event + asset

unique idempotency key

valid status transition enforcement where practical
```

---

# 154. MIGRATION PRINCIPLE

Every schema change:

* version controlled
* reversible where reasonable
* tested
* never manually edited in production without migration record

---

# 155. TESTING STRATEGY

Build:

```text
unit tests

integration tests

property-based tests

database tests

RLS tests

API tests

provider contract tests

end-to-end tests
```

---

# 156. FINANCIAL PROPERTY TESTS

Generate random trades and verify:

```text
ledger balances

collateral invariant

no overspend

no duplicate settlement

position quantity consistency

order fill consistency
```

---

# 157. CANONICALIZATION TESTS

Test:

```text
same wording

synonyms

different wording same event

related but different events

different seasons

different thresholds

different teams

different deadlines
```

---

# 158. ORACLE TESTS

Test:

```text
primary success

secondary fallback

2-of-3 agreement

full disagreement

provider unavailable

event postponed

event cancelled

dispute

late correction
```

---

# 159. SETTLEMENT TESTS

Test:

```text
YES win

NO win

void

zero fees

fees

sold position

partial position

multiple fills

large market

duplicate settlement attempt
```

---

# 160. REFUND TESTS

Test:

```text
provider refund

partial refund

cancelled order

partially filled order

market void

platform compensation

chargeback
```

---

# 161. FAILURE DESIGN

Every external provider may fail.

Design for:

```text
payment provider down

KYC provider down

AI provider down

oracle source unavailable

notification provider down
```

Financial core should degrade safely.

---

# 162. PROVIDER HEALTH

Track:

```text
status

latency

success rate

error rate

last success

last failure

supported capabilities
```

Provider orchestration uses health where appropriate.

---

# 163. PROVIDER ABSTRACTION PRINCIPLE

Provider must never leak across entire codebase.

Domain code should say:

```text
paymentProvider.createDeposit()
```

not:

```text
monnify.createInvoice()
```

everywhere.

---

# 164. SECRETS

Store provider credentials securely.

Never:

* commit keys
* expose keys in Expo bundle
* expose service-role key
* store secrets in public configuration tables

---

# 165. PRIVACY

Keep:

```text
public profile data

private identity data

KYC documents

financial data

risk data

admin notes
```

strictly separated.

---

# 166. DATA RETENTION

Create policies for:

```text
KYC records

provider payloads

financial audit

logs

AI prompts

media

deleted accounts
```

Do not indefinitely retain unnecessary sensitive data.

---

# 167. AI PRIVACY

Do not blindly send:

```text
full KYC data

bank details

private wallet history
```

to AI providers.

AI requests should use minimum required context.

---

# 168. MODERATION

Content moderation applies to:

```text
posts

comments

market proposals

creator videos

usernames

media
```

Use combination of:

* automated moderation
* AI assistance
* reports
* human moderators

---

# 169. MARKET GOVERNANCE

Market Admin sees:

```text
proposal

normalized structure

canonical candidate

AI analysis

oracle availability

risk score

duplicate score

market quality

recommended action
```

Human remains able to review uncertain cases.

---

# 170. AUDITABLE AI

For important AI-assisted market decisions, store:

```text
provider

model

prompt version

structured output

validation result

final human/system action
```

AI output must not silently become financial decision.

---

# 171. SEARCHABLE MARKET KNOWLEDGE GRAPH

Canonical events + entities + relationships should eventually form a knowledge graph.

Entities:

```text
people

teams

companies

countries

competitions

assets

organizations
```

Relationships improve:

* discovery
* canonicalization
* feeds
* analytics
* thesis

---

# 172. MARKET SHOCK SYSTEM — FUTURE

Related markets may respond to major events.

Example:

Chelsea star player injured.

This may influence:

```text
Chelsea title

Chelsea top 4

player goals

opponent position
```

Initially this affects discovery/analytics.

Do not automatically alter prices algorithmically unless liquidity engine explicitly supports it.

Market participants determine price.

---

# 173. LIVE EVENT SYSTEM

For live sports/events:

```text
event status

live score

clock

important events
```

may come from data provider.

Market suspension/close rules must be predetermined.

---

# 174. NO SINGLE SOURCE DEPENDENCY

Where feasible:

Oracle uses multiple sources.

Payment uses provider abstraction.

AI uses provider abstraction.

KYC uses provider abstraction.

Notification uses provider abstraction.

---

# 175. STARTUP IMPLEMENTATION PRIORITY

Phase 1:

```text
Supabase project

monorepo

Expo

Auth

Profiles

Admin RBAC

Policy Engine

Audit

Asset Registry

Ledger skeleton

Provider Registry
```

Phase 2:

```text
KYC

Payments

Wallet

Deposit

Withdrawal

Reconciliation

Fee Engine
```

Phase 3:

```text
Canonical Events

Market Proposals

Templates

Canonicalization

Governance
```

Phase 4:

```text
Orders

Matching

Trades

Positions

Collateral

Market prices
```

Phase 5:

```text
Oracle

Resolution

Disputes

Settlement

Void/refund
```

Phase 6:

```text
Creator/social

Feed

Reels

Comments

Follows

Market-attached content
```

Phase 7:

```text
AI runtime

Algorithms

Recommendations

Risk

Creator reputation
```

Phase 8:

```text
hardening

security

observability

load testing

production launch
```

---

# 176. IMPORTANT IMPLEMENTATION RULE

Do not build all UI first and then invent backend behavior.

Backend contracts first.

Then frontend consumes contracts.

---

# 177. API VERSIONING

Use versioned APIs where appropriate.

Example:

```text
/api/v1/markets

/api/v1/orders

/api/v1/wallet
```

Breaking changes should not silently break released apps.

---

# 178. CLIENT API SDK

Generate/shared TypeScript API client.

Do not handwrite random fetch calls throughout apps.

Centralize:

```text
auth

errors

retries

idempotency

types

validation
```

---

# 179. ERROR MODEL

Standard errors:

```text
code

message

user_message

retryable

context

request_id
```

User-facing text must not expose backend internals.

---

# 180. REQUEST IDs

Every important request should have:

```text
request_id
```

Useful for:

* debugging
* audit
* support
* provider tracing

---

# 181. SUPPORT SYSTEM

Support admin should see:

```text
user

KYC status

payments

withdrawals

orders

markets

notifications

cases
```

but not gain unnecessary financial override permissions.

---

# 182. CASE MANAGEMENT

Create internal cases:

```text
support_case

risk_case

oracle_case

payment_case

compliance_case
```

Each with:

```text
status

priority

assignee

notes

events

attachments
```

---

# 183. EMERGENCY CONTROLS

Super Admin should be able to:

```text
halt new deposits

halt withdrawals

halt trading

halt one market

halt one provider

disable one feature

disable one asset
```

without deploying code.

Use emergency actions with audit + strong permissions.

---

# 184. DISASTER RECOVERY

Have:

* database backups
* restoration procedure
* incident runbooks
* provider fallback plan
* secret rotation
* admin recovery

Production grade includes recovery planning.

---

# 185. DEPLOYMENT

Use inexpensive initial deployment:

* Expo/EAS for apps
* Supabase backend
* Vercel or suitable web hosting for web/admin if required

Use:

```text
development

staging

production
```

Separate environment secrets.

---

# 186. STAGING

Staging should support:

* fake payment provider
* fake oracle provider
* fake KYC provider
* test markets
* settlement simulation

Never test financial code directly on production users.

---

# 187. PROVIDER SANDBOXES

All providers should have:

```text
sandbox

production
```

configuration.

Provider mode must never be inferred by client.

---

# 188. MARKET SIMULATOR

Build developer/admin simulation capability.

Test:

```text
market creation

orders

price movement

oracle result

settlement

void

fees
```

without real money.

---

# 189. PERFORMANCE

Use:

* indexes
* pagination
* query plans
* caching
* materialized aggregates where needed

Do not prematurely cache financial truth.

Ledger remains primary.

---

# 190. PRICE DATA

Maintain:

```text
last trade

best bid

best ask

24h high/low

volume

open interest

price history
```

Derived from trades/order book.

---

# 191. MARKET STATISTICS

Store/derive:

```text
unique traders

volume

open interest

creator mentions

price movement

liquidity depth

time to close
```

---

# 192. SOCIAL METRICS

Track:

```text
views

watch time

likes

comments

shares

saves

follows

market opens from post

trades influenced
```

Do not confuse social metrics with financial truth.

---

# 193. CREATOR ATTRIBUTION

When a user reaches a market through creator content:

store attribution.

This helps:

```text
creator analytics

market origination analytics

future revenue sharing
```

---

# 194. EXPLAINABILITY

Financial user actions should be explainable.

Example settlement receipt:

```text
Market
Chelsea EPL Champion

Outcome
YES

Shares owned
8,000

Settlement value
₦8,000

Settlement fee
₦X

Net credit
₦Y

Oracle source
Official result

Settled
Date/time
```

---

# 195. USER TRUST

VAD must show:

```text
why market resolves

when it closes

where truth comes from

what fees apply

what happens if cancelled

how money is protected
```

Trust cannot depend on users reading legal fine print.

---

# 196. LEGAL/REGULATORY CONFIGURATION

Do not encode every possible jurisdiction today.

Nigeria-first.

But create generic structures:

```text
jurisdictions

jurisdiction_policies

jurisdiction_assets

jurisdiction_market_categories
```

Initially:

```text
Nigeria = ACTIVE
```

Others:

```text
DISABLED
```

Future activation does not require redesign.

---

# 197. CRYPTO FUTURE

When activated later:

do not assume decentralization eliminates compliance, KYC, custody, or operational obligations.

Crypto is a payment/settlement rail.

It is not a shortcut around VAD's governance architecture.

---

# 198. CORE INVARIANTS

These are sacred:

```text
Ledger always balances.

Users cannot spend unavailable money.

Settlement cannot run twice.

Market cannot open without oracle policy.

Oracle result must be final before financial settlement.

AI cannot finalize financial truth.

Creators cannot resolve their own financial markets.

Market collateral cannot be platform revenue.

Fees cannot create a collateral deficit.

NGN collateral cannot satisfy future USDC obligations.

Orders cannot fill beyond reserved amount.

Policy history cannot be silently overwritten.

Audit history cannot be silently deleted.
```

---

# 199. WHAT VAD SHOULD FEEL LIKE

The backend should feel like:

**financial infrastructure.**

The frontend should feel like:

**a living social network.**

The admin should feel like:

**a professional market operations center.**

The creator tools should feel like:

**a modern media platform.**

The trading experience should feel like:

**simple financial conviction rather than gambling complexity.**

---

# 200. FINAL PRODUCT ARCHITECTURE

```text
                         VAD USERS
                            │
              ┌─────────────┴─────────────┐
              │                           │
          MOBILE/WEB                  ADMIN WEB
              │                           │
              └─────────────┬─────────────┘
                            │
                         API / EDGE
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
       SOCIAL            MARKET             FINANCE
          │                 │                  │
      Creators        Proposals            Wallet
      Content         Canonical Events     Payments
      Follow          Governance           Ledger
      Feed            Instruments          Fees
      Reels           Trading              Revenue
          │                 │                  │
          └─────────┬───────┴──────────┬───────┘
                    │                  │
               ALGORITHMS          POLICIES
                    │                  │
            ┌───────┼───────┐          │
            │       │       │          │
           AI     RISK    ORACLE       │
            │       │       │          │
            └───────┼───────┘          │
                    │                  │
               RESOLUTION             │
                    │                  │
               SETTLEMENT             │
                    │                  │
                  LEDGER ──────────────┘
                    │
             PAYMENT ORCHESTRATOR
                    │
              NGN PROVIDERS
```

---

# 201. CHIEF DEV FINAL DIRECTIVE

Do not reduce VAD into:

```text
users
matches
bets
wallet
```

That would destroy the product vision.

VAD requires first-class systems for:

```text
canonical truth

creator content

market proposals

structured markets

algorithms

oracle resolution

financial trading

settlement

ledger

fees

policy

risk

provider abstraction

admin control

AI

social reputation
```

The system should be capable of evolving without repeatedly rebuilding its core.

NGN is the launch asset.

Nigeria is the launch country.

Supabase is the initial backend platform.

Expo is the universal frontend stack.

Didit or another provider handles KYC through abstraction.

Payment providers move NGN through generic adapters.

AI assists intelligence and automation.

Oracle infrastructure determines real-world outcome truth.

Settlement applies the outcome.

The ledger records the money.

Policy determines how the business operates.

Admin controls policy.

The client presents the system.

This separation must remain intact throughout implementation.

---

# 202. FINAL DEVELOPMENT PRINCIPLE

Build:

**production-grade foundations with startup-level infrastructure costs.**

Do not overbuild infrastructure.

Do not underbuild financial correctness.

Spend complexity where mistakes are dangerous:

* money
* settlement
* oracle
* permissions
* market identity
* audit
* policy

Keep infrastructure inexpensive where scale has not arrived.

That is the correct VAD architecture.

# VAD

**Value Asset Depot**

**A SKIMA Group LTD Company/Product**

**OPEN CONVICTION. CONTROLLED TRUTH.**
