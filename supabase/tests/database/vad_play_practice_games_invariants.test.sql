begin;
select plan(9);

select ok(
  to_regprocedure('public.play_practice_game(uuid,text)') is not null,
  'Free practice games use a server-side RPC'
);
select ok(
  not has_function_privilege('anon', 'public.play_practice_game(uuid,text)', 'EXECUTE'),
  'Anonymous users cannot start a practice session'
);
select ok(
  has_function_privilege('authenticated', 'public.play_practice_game(uuid,text)', 'EXECUTE'),
  'Signed-in users can start a practice session'
);
select ok(
  (select count(*) = 3
   from public.play_engine_registry
   where engine_key in ('QUICK_DRAW', 'SPIN_AND_WIN', 'SCRATCH_AND_REVEAL')
     and rollout_status = 'ENABLED'
     and runtime_ready = true),
  'The three free practice engines are registered and ready'
);
select ok(
  (select count(*) = 3
   from public.play_experiences
   where slug in ('lucky-number-draw', 'vad-lucky-wheel', 'scratch-and-reveal')
     and status = 'PUBLISHED'
     and public_config->>'practice_mode' = 'true'
     and engine_config->>'runtime_mode' = 'FREE_PRACTICE'),
  'All three practice games are available without paid entry'
);
select ok(
  (select count(*) >= 11
   from public.play_game_outcome_rules r
   join public.play_experiences e on e.id = r.experience_id
   where e.slug in ('lucky-number-draw', 'vad-lucky-wheel', 'scratch-and-reveal')
     and r.active = true
     and r.reward_kind = 'NONE'),
  'Practice outcomes do not award points, cash or physical prizes'
);
select ok(
  not has_function_privilege('anon', 'public.play_practice_game(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.play_buy_tickets(uuid,integer,text)', 'EXECUTE'),
  'Anonymous users cannot start practice sessions or buy paid entries'
);
select ok(
  exists (
    select 1 from public.play_engine_registry
    where engine_key = 'PRIZE_DRAW'
      and rollout_status = 'REVIEW_REQUIRED'
      and runtime_ready = false
  ),
  'Paid prize draws remain disabled pending their existing review gates'
);
select has_table('public', 'play_game_sessions', 'Practice results use the existing game-session table');


select * from finish();
rollback;
