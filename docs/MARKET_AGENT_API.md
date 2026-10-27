# VAD Market Agent API

This API lets an authorized AI agent create a market draft or publish a market without driving the admin UI. It uses the existing VAD category catalogue, market creation RPCs, currency eligibility, resolver routing, trade-limit policy, publication gates and audit trail. It is not a second market database.

## Security setup

1. Sign in with an admin account that has `markets.manage` permission.
2. Open **Account → Admin operations → Market agent access**.
3. Create a key with only the permissions required:
   - `market:read`: read the configured market categories, market types and trade-limit defaults.
   - `market:create`: create markets using the database-backed creation pipeline.
   - `market:publish`: publish immediately when all market rules and time gates pass.
4. Store the displayed key in the AI tool's **secret/credential configuration**. It is displayed only once; VAD stores a SHA-256 digest, not the raw key. Never put the key in a GitHub commit, public prompt, client-side source file, or screenshot. Revoke the key from the same page when access is no longer needed.

New keys expire after 90 days by default. Every call checks that the key is active, unexpired, has the required scopes, and was issued by an admin who still has `markets.manage` permission. Operations are recorded in VAD audit records.

## Endpoint

`POST https://<SUPABASE_PROJECT_URL>/functions/v1/market-agent-api`

Headers:

```http
Content-Type: application/json
x-vad-agent-key: <SECRET_AGENT_KEY>
```

Do not use the Supabase service-role key as the agent credential. The agent key is separate and limited to the scopes above.

## 1. Read the current catalogue

Request:

```json
{
  "action": "catalog"
}
```

The response contains the active database-backed `catalog.categories` (including each category's configured market types and parameter fields) and `options` (eligible jurisdictions and currencies, trading methods, and supported setup capabilities). Use the returned codes and field keys; do not invent a category or market type.

To get the default limits for a given trading method and currency:

```json
{
  "action": "trade_limits",
  "assetCode": "NGN",
  "liquidityModel": "ORDER_BOOK"
}
```

## 2. Create a market directly

The standard request uses a configured binary market type. Required fields depend on the chosen type and come from its DB schema.

```json
{
  "action": "create_and_publish",
  "categoryCode": "POLITICS",
  "marketTypeCode": "POLITICS_POLICY_ANNOUNCEMENT",
  "marketFormat": "BINARY",
  "title": "Will Nigeria's State House publish a new presidential policy announcement before 8:30 PM WAT?",
  "description": "An objectively verifiable question about a new official announcement.",
  "details": {
    "institution": "Nigeria State House",
    "announcement": "A new presidential policy announcement meeting the market rules",
    "deadline": "2026-10-28T20:30:00+01:00"
  },
  "condition": "Resolve YES only when the designated official source contains an eligible new announcement first published after the market opens and no later than the deadline. Record its canonical URL and source publication timestamp. Absence of evidence from an unavailable feed is inconclusive, not NO.",
  "sourceName": "Official State House newsroom",
  "sourceUrl": "https://statehouse.gov.ng/",
  "regionScope": "NIGERIA",
  "countryCode": "NG",
  "assetCode": "NGN",
  "liquidityModel": "ORDER_BOOK",
  "minTradeAmount": 100,
  "maxTradeAmount": 100000,
  "opensAt": "2026-10-28T17:00:00+01:00",
  "closesAt": "2026-10-28T20:30:00+01:00",
  "resolvesAfter": "2026-10-28T20:45:00+01:00",
  "publishNow": false,
  "aiAssist": true
}
```

This sample creates a **draft** because `publishNow` is `false`. Set it to `true` (or use action `create_and_publish` with `publishNow: true`) only when the opening time has started, closing time is still in the future, the source and resolver are appropriate, and the market is ready to trade. Replace dates and times with the actual schedule; the example is illustrative.

The AI helper can suggest a question and description. It cannot create a missing DB category/type, change the selected resolver, invent a source, bypass crypto-oracle policy, publish a future market, or override market trading limits. Generic `VERIFIED_EVENT` and multi-outcome markets also require a verified HTTPS `sourceUrl`: VAD fetches direct evidence and restricts corroborating search to that configured domain. A source name alone is not sufficient for automatic resolution. VAD's configured server-side market handler remains authoritative.

## 3. Multi-outcome market

```json
{
  "action": "create_and_publish",
  "marketFormat": "MULTI_OUTCOME",
  "categoryCode": "POLITICS",
  "title": "Which candidate will win the stated election?",
  "description": "One result must match one configured outcome.",
  "outcomes": ["Candidate A", "Candidate B", "Candidate C"],
  "resolutionInstructions": "Resolve against the official election authority's published final result. Record the source URL. If the result is not conclusive, leave the market unresolved.",
  "sourceName": "Official election authority",
  "sourceUrl": "https://example.gov/",
  "regionScope": "NIGERIA",
  "countryCode": "NG",
  "assetCode": "NGN",
  "minTradeAmount": 100,
  "maxTradeAmount": 50000,
  "opensAt": "2026-11-01T09:00:00+01:00",
  "closesAt": "2026-11-01T17:00:00+01:00",
  "resolvesAfter": "2026-11-02T09:00:00+01:00",
  "publishNow": false
}
```

The multi-outcome path requires explicit, unique outcomes from the caller; VAD does not let AI invent candidate names or options. Set `aiAssist: true` (or use `draft_and_publish`) to draft the question, description and resolution wording from the selected database market type, then review it before publication. The agent still has to supply the outcomes and authoritative source explicitly.

## Amounts and trading methods

- `NGN` and `USDC` are the only supported assets for creation. TNGN is retired.
- `POOL` enforces the per-market minimum/maximum on each stake and continues to enforce aggregate pool/user risk limits.
- `ORDER_BOOK` enforces the per-market minimum/maximum on each order's notional value (limit price × share quantity), in addition to separate user-market exposure controls.
- Amounts are applied server-side before publication. Quote and commit paths also check the limits; changing the client request cannot bypass them.
- When `minTradeAmount` / `maxTradeAmount` are omitted, VAD uses the admin-configured defaults for that currency and trading method.

## Automatic create-and-publish safety

The endpoint fails closed when any of these are invalid: agent scope, current issuer permission, category/type, required parameters, allowed currency/jurisdiction, authoritative source, schedule, active resolver-specific creation prerequisites, or min/max amount. Publication still uses `admin_publish_market` through the existing creation wrapper and records an audit event; it does not directly insert a published market row.

A successful response includes `operation` (`PUBLISHED` or `DRAFT_CREATED`), the created market payload, the applied limits, currency, trading method, and optional AI draft metadata. A failed response includes an `error` code and message; fix the input or configuration and retry rather than treating a failed response as a published market.
