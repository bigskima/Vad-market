begin;
-- Keep the reference-price experience responsive while still caching across clients.
update market.market_data_sources
set cache_seconds=30,updated_at=statement_timestamp()
where code='COINGECKO' and status='ACTIVE' and cache_seconds>30;
commit;
