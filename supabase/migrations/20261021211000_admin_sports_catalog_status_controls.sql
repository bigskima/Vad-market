begin;

create or replace function public.get_sports_market_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $function$
declare v_result jsonb;
begin
  if auth.uid() is null or not private.has_permission('markets.manage') then
    raise exception 'Market management permission required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'sports',coalesce((
      select jsonb_agg(jsonb_build_object(
        'code',s.sport_code,'name',s.sport_name,'status',s.sport_status
      ) order by s.sport_code,s.sport_name)
      from (
        select sport_code,sport_name,
          case when bool_or(status='ACTIVE') then 'ACTIVE' else 'DISABLED' end as sport_status
        from market.sports_competitions
        group by sport_code,sport_name
      ) s
    ),'[]'::jsonb),
    'competitions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'sportCode',s.sport_code,'code',s.competition_code,'name',s.competition_name,
        'region',s.region,'resultMode',s.result_mode,'providerCode',s.provider_code,
        'providerCompetitionCode',s.provider_competition_code,'aliases',s.aliases,
        'status',s.status
      ) order by s.sport_code,s.display_order,s.competition_name)
      from market.sports_competitions s
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$function$;
revoke all on function public.get_sports_market_catalog() from public,anon;
grant execute on function public.get_sports_market_catalog() to authenticated;

commit;
