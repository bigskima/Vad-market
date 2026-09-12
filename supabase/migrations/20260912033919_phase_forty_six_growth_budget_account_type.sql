alter table finance.ledger_accounts drop constraint if exists ledger_accounts_account_type_check;

alter table finance.ledger_accounts add constraint ledger_accounts_account_type_check check(account_type=any(array[
  'USER_AVAILABLE'::text,
  'USER_RESERVED'::text,
  'MARKET_COLLATERAL'::text,
  'WITHDRAWAL_PENDING'::text,
  'PROVIDER_CLEARING'::text,
  'PLATFORM_TRADING_FEE_REVENUE'::text,
  'PLATFORM_SETTLEMENT_FEE_REVENUE'::text,
  'PLATFORM_WITHDRAWAL_REVENUE'::text,
  'REFUND_PAYABLE'::text,
  'CREATOR_REWARD_PAYABLE'::text,
  'GROWTH_REWARD_BUDGET'::text,
  'TREASURY'::text,
  'SUSPENSE'::text,
  'CHARGEBACK_RECEIVABLE'::text
]));