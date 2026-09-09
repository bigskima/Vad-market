-- VAD Phase 10: deterministic creator reputation, calibration and market attribution.
-- Reputation is descriptive evidence only; it never participates in oracle resolution or settlement.

create or replace function public.creator_reputation(p_creator_user_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  with base as (
    select
      p_creator_user_id as user_id,
      (select count(*) from social.follows f where f.followed_user_id=p_creator_user_id) as followers,
      (select count(*) from social.follows f where f.follower_user_id=p_creator_user_id) as following,
      (select count(*) from social.posts p where p.author_user_id=p_creator_user_id and p.status='PUBLISHED') as posts,
      (select count(*) from social.posts p where p.author_user_id=p_creator_user_id and p.status='PUBLISHED' and p.post_type='PREDICTION') as predictions,
      (select count(*) from market.canonical_events e where e.originator_user_id=p_creator_user_id) as originated_markets
  ), resolved as (
    select
      count(*)::bigint as resolved_predictions,
      count(*) filter (where upper(p.stance_outcome_code)=upper(r.outcome_code))::bigint as correct_predictions,
      avg(case when p.confidence is not null then power(p.confidence - case when upper(p.stance_outcome_code)=upper(r.outcome_code) then 1 else 0 end,2) end) as brier_score,
      count(*) filter (where p.confidence is not null)::bigint as calibrated_predictions
    from social.posts p
    join oracle.resolutions r on r.event_id=p.canonical_event_id and r.status='FINAL'
    where p.author_user_id=p_creator_user_id and p.status='PUBLISHED' and p.post_type='PREDICTION'
  )
  select jsonb_build_object(
    'userId', b.user_id,
    'followers', b.followers,
    'following', b.following,
    'posts', b.posts,
    'predictions', b.predictions,
    'originatedMarkets', b.originated_markets,
    'resolvedPredictions', r.resolved_predictions,
    'correctPredictions', r.correct_predictions,
    'accuracy', case when r.resolved_predictions>0 then round(r.correct_predictions::numeric/r.resolved_predictions,6) else null end,
    'calibratedPredictions', r.calibrated_predictions,
    'brierScore', case when r.brier_score is not null then round(r.brier_score,6) else null end,
    'calibrationScore', case when r.brier_score is not null then round(greatest(0,1-r.brier_score),6) else null end,
    'evidenceWeightedReputation', round(((r.correct_predictions+5)::numeric/(r.resolved_predictions+10))*100,2),
    'method', 'BAYESIAN_ACCURACY_PRIOR_10_AT_50_PERCENT',
    'generatedAt', statement_timestamp()
  )
  from base b cross join resolved r;
$$;
revoke all on function public.creator_reputation(uuid) from public,anon;
grant execute on function public.creator_reputation(uuid) to authenticated;

create or replace function public.creator_prediction_history(p_creator_user_id uuid,p_limit integer default 30,p_offset integer default 0)
returns table(
  post_public_id uuid,
  body text,
  confidence numeric,
  stance_outcome_code text,
  event_public_id uuid,
  market_title text,
  resolution_status text,
  resolved_outcome_code text,
  correct boolean,
  created_at timestamptz,
  finalized_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select p.public_id,p.body,p.confidence,p.stance_outcome_code,e.public_id,e.title,r.status,r.outcome_code,
    case when r.status='FINAL' then upper(p.stance_outcome_code)=upper(r.outcome_code) else null end,
    p.created_at,r.finalized_at
  from social.posts p
  join market.canonical_events e on e.id=p.canonical_event_id
  left join oracle.resolutions r on r.event_id=e.id and r.status in ('FINAL','VOID')
  where p.author_user_id=p_creator_user_id and p.status='PUBLISHED' and p.post_type='PREDICTION'
  order by p.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.creator_prediction_history(uuid,integer,integer) from public,anon;
grant execute on function public.creator_prediction_history(uuid,integer,integer) to authenticated;

create or replace function public.creator_originated_markets(p_creator_user_id uuid,p_limit integer default 30,p_offset integer default 0)
returns table(
  event_public_id uuid,
  title text,
  category text,
  event_status text,
  instrument_public_id uuid,
  asset_code text,
  instrument_status text,
  created_at timestamptz
)
language sql
security definer
set search_path=''
as $$
  select e.public_id,e.title,e.category,e.status,i.public_id,a.code,i.status,e.created_at
  from market.canonical_events e
  left join market.instruments i on i.canonical_event_id=e.id
  left join public.assets a on a.id=i.asset_id
  where e.originator_user_id=p_creator_user_id
  order by e.created_at desc,i.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100)) offset greatest(coalesce(p_offset,0),0);
$$;
revoke all on function public.creator_originated_markets(uuid,integer,integer) from public,anon;
grant execute on function public.creator_originated_markets(uuid,integer,integer) to authenticated;

create or replace function public.market_creator_attribution(p_instrument_public_id uuid)
returns jsonb
language sql
security definer
set search_path=''
as $$
  select case when e.originator_user_id is null then null else jsonb_build_object(
    'userId',e.originator_user_id,
    'handle',p.handle,
    'displayName',p.display_name,
    'avatarPath',p.avatar_path,
    'eventPublicId',e.public_id,
    'eventTitle',e.title
  ) end
  from market.instruments i
  join market.canonical_events e on e.id=i.canonical_event_id
  left join public.profiles p on p.user_id=e.originator_user_id
  where i.public_id=p_instrument_public_id;
$$;
revoke all on function public.market_creator_attribution(uuid) from public,anon;
grant execute on function public.market_creator_attribution(uuid) to authenticated;
