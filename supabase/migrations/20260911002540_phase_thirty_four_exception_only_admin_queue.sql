create or replace function public.admin_market_queue()
returns table(
  proposal_public_id uuid,
  question text,
  context text,
  category text,
  proposal_status text,
  proposer_user_id uuid,
  created_at timestamptz
)
language plpgsql security definer set search_path=''
as $$
begin
  if not private.has_permission('markets.manage') then raise exception 'Permission required' using errcode='42501'; end if;
  return query
  select p.public_id,p.raw_question,p.raw_context,p.normalized_payload->>'submitted_category',p.status,p.proposer_user_id,p.created_at
  from market.proposals p
  where p.status in ('UNDER_REVIEW','SUBMITTED')
  order by case p.status when 'UNDER_REVIEW' then 0 else 1 end,
           coalesce(p.manipulation_risk_score,0) desc,
           coalesce(p.duplicate_probability,0) desc,
           p.created_at asc
  limit 100;
end; $$;
revoke all on function public.admin_market_queue() from public,anon;
grant execute on function public.admin_market_queue() to authenticated;