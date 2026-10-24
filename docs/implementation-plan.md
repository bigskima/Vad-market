Good. I now have a complete picture of available free/public data providers across all 18 categories. Let me update the plan. Good. Now I'll update the plan — removing manual resolution, replacing it with a full automated oracle provider map across all 18 categories using verified free/public data sources. Now add the Oracle Provider Map section to the plan: Plan updated. Here is what changed and the full oracle strategy:

---

## What changed

Manual resolution is removed entirely from the plan. Every one of the 18 categories now has an authoritative, automated data source — all free or public-tier. The plan adds 7 new oracle adapter files (files 18–25) and a full **Oracle Provider Map** section.

---

## Oracle Provider Map — All 18 Categories

| Category group | Primary source | Free? |
|---|---|---|
| **Sports + esports** | API-Football (free, 100 req/day) + ESPN public scores (no key) | Yes |
| **Crypto predictions** | CoinGecko Demo — price/market data, 10k calls/mo | Yes |
| **Economics** (inflation, CPI, GDP, jobs, FOMC) | MacroRadar (keyless, FRED-sourced) + StatisticsOfTheWorld (1k req/day, 337 indicators from World Bank/IMF/Eurostat) | Yes |
| **Politics + elections** | Global Election Index — verified official results, election stage windows, resolvable sources flag | Yes |
| **Financial markets** (indices, commodities, forex) | MacroRadar + Alpha Vantage free tier (25 req/day) + CoinGecko | Yes |
| **Weather + climate** | Open-Meteo (free, no key, global) + Weather.gov (US NWS official, no key) | Yes |
| **Entertainment** (awards, box office, charts) | TMDB (free, no hard rate limit) + iTunes Search API (no key) | Yes |
| **Science + tech** (AI milestones, space, research) | pdata.world cross-reference (Polymarket/Kalshi/Metaculus tech/science categories) | Yes |
| **Business + companies** | Alpha Vantage earnings calendar + pdata.world | Yes |
| **Law + regulation** | pdata.world + ClearMarket (named resolution sources, 1k req/day) | Yes |
| **Health + medical** | pdata.world + WHO/CDC public REST feeds | Yes |
| **Geopolitics** | pdata.world + ClearMarket resolution evidence | Yes |
| **Social trends** | pdata.world (Polymarket/Kalshi social category) | Yes |
| **Transport, infrastructure, energy, agriculture** | StatisticsOfTheWorld + pdata.world | Yes |
| **Rankings + competitions** | pdata.world + TMDB | Yes |
| **Education + academic** | pdata.world cross-reference | Yes |
| **Other public events** | pdata.world + ClearMarket (authoritative named sources where available) | Yes |

**Cross-reference layer (all categories):** pdata.world and ClearMarket serve as independent secondary evidence for any market. ClearMarket's `source_status` field names the exact resolution source Kalshi or Polymarket committed to — if VAD's primary source and ClearMarket agree, the evidence hash is multi-sourced and much harder to dispute.

**How admin fits in:** Admin sees the fetched evidence (source name, value, timestamp, evidence hash) in the admin UI and confirms or flags a dispute before the `resolver` key calls `resolveMarket` on-chain. Admin cannot invent an outcome — they can only agree with what the data returned or open a dispute window.

Switch to Build mode to begin Phase 2.
