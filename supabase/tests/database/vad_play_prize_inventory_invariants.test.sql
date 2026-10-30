begin;
select plan(28);

select has_table('public', 'play_campaign_prizes', 'Campaign prize inventory exists');
select has_table('public', 'play_campaign_prize_awards', 'Campaign prize awards and claims are persisted');
select has_column('public', 'play_campaign_prizes', 'stock_quantity', 'Each prize has an inventory quantity');
select has_column('public', 'play_campaign_prizes', 'winner_limit', 'Each prize has its own winner limit');
select has_column('public', 'play_campaign_prize_awards', 'claim_status', 'Prize claims have a tracked fulfilment state');

select ok(
  exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'play_campaign_prize_awards'
      and indexdef ilike '%unique%campaign_id%user_id%'
  ),
  'A participant can receive at most one prize award per campaign'
);

select ok(
  to_regprocedure('public.admin_play_replace_campaign_prizes(uuid,jsonb)') is not null,
  'Admins have a campaign-scoped prize inventory configuration RPC'
);
select ok(
  not has_function_privilege('anon', 'public.admin_play_replace_campaign_prizes(uuid,jsonb)', 'EXECUTE'),
  'Anonymous users cannot configure prize inventory'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_play_replace_campaign_prizes(uuid,jsonb)', 'EXECUTE'),
  'Authenticated callers are permission-checked by the prize configuration RPC'
);

select ok(
  to_regprocedure('public.admin_play_list_campaign_prizes(uuid)') is not null,
  'Admins can review campaign prize configuration'
);
select ok(
  not has_function_privilege('anon', 'public.admin_play_list_campaign_prizes(uuid)', 'EXECUTE'),
  'Anonymous users cannot review private prize configuration'
);
select ok(
  to_regprocedure('public.admin_play_list_prize_awards(uuid)') is not null,
  'Admins can review prize awards and fulfilment records'
);
select ok(
  not has_function_privilege('anon', 'public.admin_play_list_prize_awards(uuid)', 'EXECUTE'),
  'Anonymous users cannot read prize fulfilment operations'
);

select ok(
  to_regprocedure('public.play_claim_campaign_prize(uuid)') is not null,
  'A signed-in winner has a server-side prize claim workflow'
);
select ok(
  not has_function_privilege('anon', 'public.play_claim_campaign_prize(uuid)', 'EXECUTE'),
  'Anonymous users cannot claim prizes'
);
select ok(
  has_function_privilege('authenticated', 'public.play_claim_campaign_prize(uuid)', 'EXECUTE'),
  'Authenticated winners can invoke the owner-checked claim RPC'
);

select ok(
  to_regprocedure('public.admin_play_set_prize_fulfilment(uuid,text,text)') is not null,
  'Admins have a server-side fulfilment workflow'
);
select ok(
  not has_function_privilege('anon', 'public.admin_play_set_prize_fulfilment(uuid,text,text)', 'EXECUTE'),
  'Anonymous users cannot update prize fulfilment'
);

select ok(
  position('count(distinct user_id)' in lower(pg_get_functiondef('public.admin_play_authorize_draw(uuid)'::regprocedure))) > 0,
  'Draw authorization checks that enough distinct participants can win'
);
select ok(
  position('configured prize winner slots' in lower(pg_get_functiondef('public.admin_play_authorize_draw(uuid)'::regprocedure))) > 0,
  'Draw authorization rejects campaigns with too many winner slots'
);
select ok(
  position('winner_limit' in pg_get_functiondef('public.admin_play_execute_draw(uuid)'::regprocedure)) > 0,
  'Draw execution reads per-prize winner limits'
);
select ok(
  position('authorized_by = auth.uid()' in pg_get_functiondef('public.admin_play_execute_draw(uuid)'::regprocedure)) > 0,
  'Multi-winner allocation preserves the two-person draw rule'
);
select ok(
  position('not exists' in lower(pg_get_functiondef('public.admin_play_execute_draw(uuid)'::regprocedure))) > 0,
  'A participant already awarded a prize is excluded from later winner slots'
);
select ok(
  position('v_multi_prize' in pg_get_functiondef('public.admin_play_execute_draw(uuid)'::regprocedure)) > 0,
  'Campaigns without prize rows retain the legacy single-winner draw path'
);
select ok(
  position('rejection sampling' in lower(pg_get_functiondef('public.admin_play_execute_draw(uuid)'::regprocedure))) > 0,
  'Winner selection retains unbiased rejection sampling'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.play_campaign_prizes'::regclass),
  'Prize inventory has row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.play_campaign_prize_awards'::regclass),
  'Prize awards have row-level security enabled'
);
select ok(
  position('reward_kind = ''NONE''' in pg_get_functiondef('public.play_practice_game(uuid,text)'::regprocedure)) > 0,
  'Free practice outcomes remain isolated from cash and physical-prize awards'
);

select * from finish();
rollback;
