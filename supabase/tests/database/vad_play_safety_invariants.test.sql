begin;
select plan(22);

select has_table('public', 'play_experiences', 'VAD Play experience catalogue exists');
select has_table('public', 'play_campaigns', 'Campaign economics are persisted per campaign');
select has_table('public', 'play_participations', 'My Play activity has a database record source');
select has_table('public', 'play_campaign_entry_orders', 'Ticket orders use the backend order table');
select has_table('public', 'play_tickets', 'Tickets are issued from the database');
select has_table('public', 'play_campaign_reviews', 'Campaign reviews are persisted');
select has_table('public', 'play_campaign_draws', 'Draw authorization and results are audited');
select has_table('public', 'play_campaign_settlements', 'Settlements reference the existing ledger');
select has_table('public', 'play_ad_providers', 'Ad providers are database configured');
select has_table('public', 'play_ad_placements', 'Ad placements are database configured');

select ok(
  exists (
    select 1 from public.play_engine_registry
    where engine_key = 'PRIZE_DRAW'
      and rollout_status = 'REVIEW_REQUIRED'
      and runtime_ready = false
  ),
  'Prize Draw runtime remains disabled until reviewed and explicitly enabled'
);
select ok(
  exists (
    select 1 from public.play_engine_registry
    where engine_key = 'SPIN_AND_WIN'
      and rollout_status = 'REVIEW_REQUIRED'
      and runtime_ready = false
  ),
  'Spin & Win remains disabled until its server runtime is reviewed'
);
select ok(
  exists (
    select 1 from public.play_engine_registry
    where engine_key = 'SCRATCH_AND_REVEAL'
      and rollout_status = 'REVIEW_REQUIRED'
      and runtime_ready = false
  ),
  'Scratch & Reveal remains disabled until its server runtime is reviewed'
);
select is(
  (select status from public.play_ad_providers where provider_key = 'direct-sponsor'),
  'DISABLED',
  'Direct sponsorship stays disabled until an authorized admin enables it'
);

select ok(
  not has_function_privilege('anon', 'public.play_buy_tickets(uuid,integer,text)', 'EXECUTE'),
  'Anonymous users cannot purchase paid entries'
);
select ok(
  has_function_privilege('authenticated', 'public.play_buy_tickets(uuid,integer,text)', 'EXECUTE'),
  'Authenticated users may call the gated ticket RPC'
);
select ok(
  not has_function_privilege('anon', 'public.admin_play_execute_draw(uuid)', 'EXECUTE'),
  'Anonymous users cannot execute a draw'
);
select ok(
  not has_function_privilege('anon', 'public.admin_play_list_operations(uuid)', 'EXECUTE'),
  'Anonymous users cannot read privileged Play operations'
);
select ok(
  has_function_privilege('anon', 'public.play_draw_audit(uuid)', 'EXECUTE'),
  'Public draw-audit evidence remains readable without a privileged role'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.play_tickets'::regclass),
  'Ticket records have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.play_campaign_entry_orders'::regclass),
  'Entry orders have row-level security enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.play_participations'::regclass),
  'Participation history has row-level security enabled'
);

select * from finish();
rollback;
