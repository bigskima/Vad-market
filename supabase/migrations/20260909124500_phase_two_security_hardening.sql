-- VAD Phase 2 security hardening.
-- Public discovery remains on the public market_catalog read model. Detailed
-- oracle-bearing market RPCs require an authenticated session.

revoke execute on function public.market_detail(uuid) from anon;
grant execute on function public.market_detail(uuid) to authenticated;

comment on function public.submit_market_proposal(text,text,text,numeric) is
  'Authenticated RPC. SECURITY DEFINER is intentional; function validates auth, account status and runtime capability before touching private market/event schemas.';
comment on function public.place_order(bigint,bigint,text,numeric,numeric,text) is
  'Authenticated financial RPC. SECURITY DEFINER is intentional; function validates auth/capability and delegates to private transactional reservation logic.';
comment on function public.cancel_order(uuid) is
  'Authenticated owner-scoped financial RPC. SECURITY DEFINER is intentional; order ownership is checked before reservation release.';
comment on function public.my_wallet_summary() is
  'Authenticated owner-scoped read RPC. SECURITY DEFINER is intentional so clients do not receive direct finance schema access.';
comment on function public.my_open_orders() is
  'Authenticated owner-scoped read RPC. SECURITY DEFINER is intentional so clients do not receive direct trading schema access.';
comment on function public.admin_create_oracle_policy_draft(text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,integer,timestamptz) is
  'Admin RPC protected by oracle.review permission and maker-checker policy controls.';
comment on function public.admin_approve_oracle_policy(uuid) is
  'Admin RPC protected by oracle.review permission and second-reviewer enforcement.';
comment on function public.admin_approve_market_proposal(uuid,text,text,text,text,jsonb,jsonb,timestamptz,timestamptz,timestamptz,uuid,text,text,numeric,smallint) is
  'Admin RPC protected by markets.manage permission; canonicalization, jurisdiction/asset eligibility and oracle binding are enforced server-side.';
