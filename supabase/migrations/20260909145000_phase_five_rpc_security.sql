-- VAD Phase 5C: SECURITY DEFINER RPCs must never inherit execution through PUBLIC.

revoke all on function public.admin_close_market(uuid,text) from public,anon;
revoke all on function public.admin_create_provisional_resolution(uuid,text,jsonb) from public,anon;
revoke all on function public.admin_finalize_resolution(bigint,jsonb) from public,anon;
revoke all on function public.admin_finalize_void(bigint,jsonb) from public,anon;
revoke all on function public.admin_settle_market(uuid) from public,anon;
revoke all on function public.my_settlement_receipts() from public,anon;

grant execute on function public.admin_close_market(uuid,text) to authenticated;
grant execute on function public.admin_create_provisional_resolution(uuid,text,jsonb) to authenticated;
grant execute on function public.admin_finalize_resolution(bigint,jsonb) to authenticated;
grant execute on function public.admin_finalize_void(bigint,jsonb) to authenticated;
grant execute on function public.admin_settle_market(uuid) to authenticated;
grant execute on function public.my_settlement_receipts() to authenticated;
