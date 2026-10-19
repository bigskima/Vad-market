-- Enable isolated TNGN demo trading for all users that already exist.
-- This is synthetic practice credit only; it does not enable real NGN deposits,
-- withdrawals, or real-money settlement.

UPDATE public.platform_feature_flags
SET enabled = true,
    updated_at = statement_timestamp()
WHERE flag_key = 'TNGN_DEMO_MODE';

INSERT INTO public.user_demo_preferences (user_id, tngn_demo_enabled, updated_at)
SELECT id, true, statement_timestamp()
FROM auth.users
ON CONFLICT (user_id) DO UPDATE
SET tngn_demo_enabled = true,
    updated_at = statement_timestamp();

-- Create demo accounts only when missing. Preserve any existing practice balance.
INSERT INTO public.demo_accounts (user_id, asset_code, available_balance, created_at, updated_at)
SELECT id, 'TNGN', 100000, statement_timestamp(), statement_timestamp()
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;
