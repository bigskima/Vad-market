begin;

revoke execute on function public.my_wallet_connections() from authenticated;
grant execute on function public.my_wallet_connections() to service_role;

revoke execute on function public.revoke_my_wallet_connection(uuid) from authenticated;
grant execute on function public.revoke_my_wallet_connection(uuid) to service_role;

commit;
