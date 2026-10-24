# VAD Market Oracle Provider Map

**Status:** Candidate provider inventory, not proof of production-ready adapters. Each API endpoint, current access policy, commercial-use terms, response schema, rate limits, timestamp semantics, and category-specific resolution logic must be tested before the source is approved.

**Resolution policy:** Prefer an authoritative primary source and retain evidence URL, fetch time, normalized value, and evidence hash. Kalshi/Polymarket data may corroborate a result but is not automatically authoritative truth for an unrelated real-world event. Do not finalize when the evidence is missing, contradictory, stale, or fails the published market criteria. Keep the market pending for review/dispute, then follow the pre-published void/refund rules. Record every privileged review action in the audit trail.

Provider inventory reviewed: October 24, 2026; live endpoint validation remains pending.

---

## Cross-reference layer (all categories)

These sources can be queried as secondary evidence when a genuinely comparable contract/event exists. They will not have a matching market for every event, and their status must not override the named authoritative source or the market's published resolution rules.

| Source | Access | What it provides |
|--------|--------|-----------------|
| **Kalshi public API** | No key — `https://external-api.kalshi.com/trade-api/v2` | Resolved market outcomes, settlement sources (CFTC-filed), resolution rules text. Markets: economics, politics, climate, tech, health, finance. |
| **Polymarket Gamma API** | No key — `https://gamma-api.polymarket.com` | Resolved market outcomes, resolution criteria text, category tags. Markets: politics, crypto, sports, tech, health, geopolitics. |

---

## Category-by-category provider map

### 1. Sports & Esports

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **API-Football** | Free, 100 req/day | `https://v3.football.api-sports.io/fixtures?id={id}` |
| Primary (US/broad) | **ESPN public feeds** | No key | `http://site.api.espn.com/apis/site/v2/sports/{sport}/{league}/scoreboard` |
| Cross-ref | Kalshi / Polymarket | No key | See above |

**Resolution trigger:** `fixture.status.short === "FT"` and `fixture.goals` present.
No manual fallback. If APIs unavailable at close, market enters a 48-hour retry
window, then auto-voids with full refund.

---

### 2. Politics & Elections

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (worldwide) | **civicAPI** | No key | `https://civicapi.org/api/v2/race/{raceId}` |
| Primary (US federal) | **Open America** | No key | `https://openamerica.io/elections/results.json?year={year}&office={office}` |
| Primary (US civic) | **CIV.IQ** | No key, 60 req/min | `https://civdotiq.org/api/v1/bills` (legislation passage) |
| Primary (certified) | **Election.org** | No key (public beta) | `https://election-org-public-record.vercel.app/data/api` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

**Resolution trigger:** `winner` field set, or `called === true`, plus certified-stage label.
Open America explicitly states: "It does not call races" — so civicAPI race-call is the
primary trigger; Open America provides the official vote-count evidence hash.

---

### 3. Economics (GDP, CPI, inflation, FOMC rate, unemployment, trade balance)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **FRED API** | Free, requires key (free registration) | `https://api.stlouisfed.org/fred/series/observations?series_id={id}&api_key={key}` |
| Primary (global) | **Statistics of the World** | No key, 1,000 req/day | `https://statisticsoftheworld.com/api/v1/economic-data?series={id}&latest=1` |
| Primary (global) | **World Bank API** | No key | `https://api.worldbank.org/v2/country/{iso}/indicator/{code}?format=json` |
| Primary (high-freq) | **BLS public API** | No key for basic | `https://api.bls.gov/publicAPI/v2/timeseries/data/` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

**Series IDs used:**
- CPI (US): `CUUR0000SA0` (BLS) or `FP.CPI.TOTL.ZG` (World Bank)
- GDP: `NY.GDP.MKTP.CD` (World Bank) or `NYGDP` (FRED)
- Unemployment: `LNS14000000` (BLS)
- Fed Funds Rate: `FEDFUNDS` (FRED)

---

### 4. Financial Markets (indices, commodities, forex)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (equities/FX/commodities) | **Alpha Vantage** | Free key (registration) | `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={sym}&apikey={key}` |
| Primary (real-time) | **Finnhub** | Free key (registration) | `https://finnhub.io/api/v1/quote?symbol={sym}&token={key}` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

**Notes:** Alpha Vantage is NASDAQ-officially-licensed. Finnhub free tier: 60 req/min,
no daily cap. Both return closing price, which is the settlement reference for
"above/below X at close" markets.

---

### 5. Crypto Prices & Markets

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **CoinGecko Demo API** | Free, 10k calls/mo, 30 req/min | `https://api.coingecko.com/api/v3/simple/price?ids={id}&vs_currencies=usd` |
| Primary (fallback) | **CoinCap** | No key | `https://api.coincap.io/v2/assets/{id}` |
| Cross-ref | Polymarket (crypto tag) | No key | See above |

---

### 6. Weather & Climate

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (global) | **Open-Meteo** | No key, free for non-commercial | `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&daily=temperature_2m_max` |
| Primary (historical) | **Open-Meteo Historical** | No key | `https://archive-api.open-meteo.com/v1/archive?start_date={}&end_date={}` |
| Primary (US official) | **NOAA / NWS Climate** | No key | `https://www.weather.gov/` (hourly obs feed) |
| Cross-ref | Kalshi (climate category) | No key | See above |

**Notes:** Open-Meteo is CC BY 4.0, sources data from ECMWF, NOAA, DWD, and 10+
national weather services. ERA5 reanalysis available from 1940.

---

### 7. Entertainment (awards, box office, music charts)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (movies/TV/awards) | **TMDB API** | Free key (registration) | `https://api.themoviedb.org/3/movie/{id}` — revenue, release dates, award data |
| Primary (box office) | **TMDB** | Free key | `/3/movie/now_playing` + `revenue` field |
| Primary (music) | **iTunes Search API** | No key | `https://itunes.apple.com/search?term={}&entity=album` |
| Cross-ref | Polymarket (entertainment tag) | No key | See above |

**Notes:** TMDB requires a free API key. As of Oct 2026, TMDB is free only until the
app earns revenue; amodb (`api.amodb.dev`) is a paid TMDB-compatible alternative
($5.19/mo) with commercial-use terms. Use TMDB for testnet; evaluate amodb for mainnet.

---

### 8. Science & Technology (AI milestones, research breakthroughs, product launches)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (space launches) | **SpaceNexus Open API** | No key, 60 req/min | `https://spacenexus.us/api/open/launches` — outcomes (success/partial/failure) |
| Primary (SpaceX) | **SpaceX Community API** | No key | `https://api.spacexdata.com/v5/launches/past` — `success` boolean |
| Cross-ref | Polymarket (tech/science tags) | No key | See above |
| Cross-ref | Kalshi (tech category) | No key | See above |

**Notes:** SpaceNexus returns launch `outcome` field with values: `success`,
`partial_failure`, `failure`. SpaceX community API returns `success: true/false`.
AI milestone markets (e.g. "GPT-5 released by X date") use Polymarket/Kalshi
cross-reference as primary — no single authoritative API exists for AI milestones,
so the market resolution criteria must name a specific, verifiable public announcement
(e.g. official blog post URL), and the Polymarket/Kalshi cross-reference acts as
independent confirmation.

---

### 9. Geopolitics (conflicts, coups, sanctions, treaties)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **ACLED API** | Free key (registration, non-commercial free) | `https://acleddata.com/api/acled/read?country={}&event_type={}&year={}` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

**Notes:** ACLED requires a free account + API key. It provides event-level
conflict data: event type (coup, battle, protest, riot), date, location, actors,
fatalities. Key for "will X country experience a coup by Y date" markets.

---

### 10. Health & Medical (outbreaks, disease thresholds, WHO declarations)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (WHO) | **WHO GHO OData API** | No key | `https://ghoapi.azureedge.net/api/{indicatorCode}?$filter=...` |
| Primary (US) | **CDC Open Data (Socrata)** | No key | `https://data.cdc.gov/resource/{datasetId}.json` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

**Notes:** WHO GHO provides 1,000+ indicators (life expectancy, disease burden,
outbreak declarations, vaccination rates). CDC Socrata covers US disease surveillance,
NNDSS (notifiable diseases), flu tracking.

---

### 11. Law & Regulation (legislation, court rulings, regulatory decisions)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (US bills) | **CIV.IQ** | No key, 60 req/min | `https://civdotiq.org/api/v1/bills?limit=50` |
| Primary (US votes) | **CIV.IQ** | No key | `https://civdotiq.org/api/v1/votes?chamber={house|senate}` |
| Primary (Federal Register) | **Federal Register API** | No key | `https://www.federalregister.gov/api/v1/documents.json?conditions[type]=RULE` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

**Notes:** CIV.IQ pulls from Congress.gov, House Clerk, Senate.gov, Federal Register.
Bill passage status and roll-call vote results are available in structured JSON, no key.
For non-US legislation, Polymarket/Kalshi cross-reference is the primary source, as
authoritative non-US parliamentary APIs are fragmented.

---

### 12. Business & Companies (earnings, M&A, IPOs, leadership changes)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **Alpha Vantage** | Free key | `?function=EARNINGS&symbol={ticker}` |
| Primary | **Finnhub** | Free key | `/api/v1/stock/earnings?symbol={}&token={}` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

---

### 13. Rankings & Competitions (awards, tournaments, rankings)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (films/TV) | **TMDB** | Free key | `/3/movie/top_rated` or award-ceremony data |
| Primary (space/tech) | **SpaceNexus** | No key | `/api/open/space-score` |
| Cross-ref | Polymarket | No key | See above |

---

### 14. Education & Academic (university rankings, exam results, research)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **World Bank EdStats** | No key | `https://api.worldbank.org/v2/country/all/indicator/SE.PRM.ENRR?format=json` |
| Cross-ref | Polymarket + Kalshi | No key | See above |

**Notes:** Narrow category. Markets must be scoped to verifiable, announced outcomes
(e.g. "Will [university] rank in top 10 of QS 2027?"). QS rankings are published
annually and publicly available; there is no official QS API, so resolution uses the
published ranking page URL as the named evidence source.

---

### 15. Social Trends (viral events, platform metrics, cultural milestones)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | Polymarket (social tag) | No key | `https://gamma-api.polymarket.com/markets?tag=social` |
| Cross-ref | Kalshi | No key | See above |

**Notes:** No single authoritative API covers social trends. Markets in this category
must be scoped to verifiable platform metrics (e.g. "X reaches 1B monthly users by
date" requires X's official published announcement). Polymarket/Kalshi cross-reference
is the resolution source. If no cross-reference market exists, the market auto-voids.

---

### 16. Transport, Infrastructure, Energy & Agriculture

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary (energy) | **Statistics of the World** | No key, 1,000 req/day | `https://statisticsoftheworld.com/api/v1/economic-data?series=EG.USE.ELEC.KH.PC` |
| Primary (agriculture) | **World Bank** | No key | `/v2/country/{iso}/indicator/AG.PRD.CROP.XD?format=json` |
| Cross-ref | Kalshi + Polymarket | No key | See above |

---

### 17. Environment & Climate Policy

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **Open-Meteo** | No key | Historical weather API |
| Primary (policy) | Polymarket / Kalshi | No key | Climate/environment category |
| Cross-ref | WHO GHO (environmental health) | No key | GHO OData |

---

### 18. Other Public Events (anything not covered above)

| Role | Source | Access | Endpoint |
|------|--------|--------|----------|
| Primary | **Polymarket Gamma API** | No key | `https://gamma-api.polymarket.com/markets?active=false` (resolved, matching slug) |
| Primary | **Kalshi public API** | No key | `https://external-api.kalshi.com/trade-api/v2/markets/{ticker}` |
| Auto-void | N/A | N/A | If no cross-reference market found within 72h of close, market voids with full refund |

---

## Resolution pipeline (all categories)

```
1. Market closes
2. Oracle scheduler invokes the category adapter
3. Adapter fetches primary source → outcome value + evidence (URL, timestamp, raw value)
4. Adapter queries Kalshi and Polymarket for matching resolved market → resolution value
5. If primary and at least one cross-reference agree → evidence hash computed
6. Resolver key calls resolveMarket(marketId, winningOutcomeId, voided, evidenceHash)
7. Admin confirms in admin UI (sees source name, value, timestamp, evidence hash)
8. If no agreement within 72h of close → auto-void (refund all positions)
```

**No step in this pipeline accepts a manually supplied outcome value.**
Admin can only confirm or trigger a void. Admin cannot change the resolved outcome.

---

## Sources requiring free registration (keys stored as Supabase Edge Function secrets)

| Secret name | Source | Notes |
|-------------|--------|-------|
| `VAD_ORACLE_FRED_API_KEY` | FRED (St. Louis Fed) | Free, instant registration |
| `VAD_ORACLE_ALPHA_VANTAGE_KEY` | Alpha Vantage | Free, instant registration |
| `VAD_ORACLE_FINNHUB_KEY` | Finnhub | Free, instant registration |
| `VAD_ORACLE_TMDB_KEY` | TMDB | Free, requires account |
| `VAD_ORACLE_ACLED_KEY` | ACLED | Free, non-commercial |

All other sources in this document require no key.

---

## Sources NOT used (and why)

| Source | Reason not used |
|--------|-----------------|
| Metaculus | Community prediction data locked March 2026; resolved question data requires per-question prior forecast; commercial use requires individual negotiation |
| Manual admin resolution | **Explicitly prohibited by product decision** |
| ClearMarket API | Described in prior session; not confirmed live — replaced by Kalshi public API which serves the same function (CFTC-filed settlement sources) |
| Global Election Index / pdata.world | Not confirmed live as of October 2026 research; replaced by civicAPI + openamerica.io which are confirmed live |
