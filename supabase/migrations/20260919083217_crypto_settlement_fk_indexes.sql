begin;

create index if not exists blockchain_asset_representations_asset_idx
  on blockchain.asset_representations(asset_id);

create index if not exists market_instrument_venues_asset_representation_idx
  on market.instrument_venues(asset_representation_id)
  where asset_representation_id is not null;

create index if not exists market_instrument_venues_chain_idx
  on market.instrument_venues(chain_id)
  where chain_id is not null;

create index if not exists market_instrument_venues_contract_deployment_idx
  on market.instrument_venues(contract_deployment_id)
  where contract_deployment_id is not null;

commit;
