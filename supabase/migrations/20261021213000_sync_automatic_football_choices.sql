begin;

create or replace function public.admin_market_approval_options_v2()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v jsonb;
  v_tavily boolean;
  v_public boolean;
  v_football_competitions jsonb;
begin
  v:=public.admin_market_approval_options();

  select coalesce(jsonb_agg(s.competition_name order by s.display_order,s.competition_name),'[]'::jsonb)
  into v_football_competitions
  from market.sports_competitions s
  where s.sport_code='FOOTBALL'
    and s.status='ACTIVE'
    and s.result_mode='AUTOMATIC'
    and coalesce((s.metadata->>'free_tier')::boolean,false);

  v:=jsonb_set(v,'{guided,football,competitions}',coalesce(v_football_competitions,'[]'::jsonb),true);

  select exists(select 1 from integration.providers where code='TAVILY' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_tavily;
  select exists(select 1 from integration.providers where code='PUBLIC_RECORD' and environment='PRODUCTION' and status in('ACTIVE','DEGRADED')) into v_public;

  return jsonb_set(v,'{guided,evidence}',jsonb_build_object(
    'automaticAvailable',v_tavily or v_public,
    'broadSearchAvailable',v_tavily,
    'directPublicRecordAvailable',v_public,
    'automaticSourceName','VAD Evidence Gateway',
    'secretName','TAVILY_API_KEY'
  ),true);
end;
$function$;
revoke all on function public.admin_market_approval_options_v2() from public,anon;
grant execute on function public.admin_market_approval_options_v2() to authenticated;

commit;
