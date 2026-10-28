begin;
select plan(5);

select has_table('experience', 'product_tours', 'Versioned product tours are available');
select has_table('experience', 'product_tour_steps', 'Product tour steps are persisted');

select ok(
  exists (
    select 1
    from experience.product_tours t
    join experience.product_tour_versions v on v.id = t.current_version_id
    where t.code = 'GETTING_STARTED'
      and v.version_label = '2026.10-vad-play'
      and v.auto_prompt_existing = true
  ),
  'Existing users can be prompted to see the VAD Play tour update'
);

select is(
  (
    select s.route
    from experience.product_tours t
    join experience.product_tour_steps s on s.tour_version_id = t.current_version_id
    where t.code = 'GETTING_STARTED'
      and s.step_key = 'play-hub-overview'
      and s.enabled
  ),
  '/play',
  'Guided tour links to the VAD Play hub route'
);

select is(
  (
    select s.target_id
    from experience.product_tours t
    join experience.product_tour_steps s on s.tour_version_id = t.current_version_id
    where t.code = 'GETTING_STARTED'
      and s.step_key = 'play-hub-overview'
      and s.enabled
  ),
  'play-hub-overview',
  'Guided tour step targets the Play hub header'
);

select * from finish();
rollback;
