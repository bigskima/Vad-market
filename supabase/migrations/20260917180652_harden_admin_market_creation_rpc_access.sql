-- Keep legacy/manual admin market creation available to signed-in admins,
-- but remove unnecessary anonymous execution grants on SECURITY DEFINER RPCs.

revoke execute on function public.admin_create_market_draft(text,text,text,timestamptz,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.admin_create_market_draft(text,text,text,timestamptz,timestamptz,timestamptz,text,text) to authenticated;

revoke execute on function public.admin_approve_market_proposal_auto(uuid,text,text,text,timestamptz,timestamptz,timestamptz,text,text) from public,anon;
grant execute on function public.admin_approve_market_proposal_auto(uuid,text,text,text,timestamptz,timestamptz,timestamptz,text,text) to authenticated;
