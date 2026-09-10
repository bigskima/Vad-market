revoke execute on function public.admin_assign_role(uuid,text,text,timestamptz) from anon;
revoke execute on function public.admin_decide_market_proposal(uuid,text,text) from anon;
revoke execute on function public.admin_market_approval_options() from anon;
revoke execute on function public.admin_revoke_role(bigint,text) from anon;
revoke execute on function public.admin_role_assignments(text) from anon;
revoke execute on function public.admin_role_catalog() from anon;

grant execute on function public.admin_assign_role(uuid,text,text,timestamptz) to authenticated;
grant execute on function public.admin_decide_market_proposal(uuid,text,text) to authenticated;
grant execute on function public.admin_market_approval_options() to authenticated;
grant execute on function public.admin_revoke_role(bigint,text) to authenticated;
grant execute on function public.admin_role_assignments(text) to authenticated;
grant execute on function public.admin_role_catalog() to authenticated;
