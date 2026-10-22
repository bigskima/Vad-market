begin;

-- VAD crypto settlement must not depend on a paid Pyth API subscription.
-- Use CoinGecko (free Demo API key) and Coinbase public historical candles
-- as two separately recorded providers. Keep the quorum at two: if either
-- source cannot produce eligible evidence, automatic resolution stays pending.
update oracle.policies
set source_hierarchy = jsonb_build_array(
      jsonb_build_object('role','PRIMARY','provider_code','COINGECKO','priority',10),
      jsonb_build_object('role','CORROBORATING','provider_code','COINBASE','priority',20)
    ),
    consensus_rule = coalesce(consensus_rule, '{}'::jsonb)
      || jsonb_build_object(
        'finalization_mode','AUTO_AFTER_DISPUTE_WINDOW',
        'distinct_providers',true,
        'min_agreeing_providers',2
      )
where name in ('VAD Crypto Threshold Launch Policy', 'VAD Sandbox Crypto Threshold Policy')
  and status='ACTIVE'
  and approved_by is not null;

commit;
