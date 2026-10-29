-- VAD Play: server-resolved free practice games.
-- These engines return display-only results; they do not accept money, award points,
-- or create cash/physical prizes. Paid prize campaigns remain on the separate
-- reviewed PRIZE_DRAW workflow.

begin;

insert into public.play_engine_registry
  (engine_key, engine_family, display_name, description, rollout_status, requires_legal_review, runtime_ready)
values
  ('QUICK_DRAW', 'INSTANT_GAME', 'Quick Draw', 'Free practice number draw. No entry fee or cash prizes.', 'ENABLED', true, true)
on conflict (engine_key) do update
set engine_family = excluded.engine_family,
    display_name = excluded.display_name,
    description = excluded.description,
    rollout_status = 'ENABLED',
    runtime_ready = true,
    updated_at = statement_timestamp();

update public.play_engine_registry
set rollout_status = 'ENABLED',
    runtime_ready = true,
    description = case engine_key
      when 'SPIN_AND_WIN' then 'Free practice wheel. Results have no monetary value.'
      when 'SCRATCH_AND_REVEAL' then 'Free practice scratch card. Results have no monetary value.'
      else description
    end,
    updated_at = statement_timestamp()
where engine_key in ('SPIN_AND_WIN', 'SCRATCH_AND_REVEAL');

insert into public.play_engine_releases
  (engine_key, version, rollout_status, config_schema, release_notes, enabled_at)
values
  ('QUICK_DRAW', 1, 'ENABLED', '{"mode":"FREE_PRACTICE"}'::jsonb, 'Server-resolved free practice only; no paid entry or rewards.', statement_timestamp()),
  ('SPIN_AND_WIN', 1, 'ENABLED', '{"mode":"FREE_PRACTICE"}'::jsonb, 'Server-resolved free practice only; no paid entry or rewards.', statement_timestamp()),
  ('SCRATCH_AND_REVEAL', 1, 'ENABLED', '{"mode":"FREE_PRACTICE"}'::jsonb, 'Server-resolved free practice only; no paid entry or rewards.', statement_timestamp())
on conflict (engine_key, version) do update
set rollout_status = 'ENABLED',
    config_schema = excluded.config_schema,
    release_notes = excluded.release_notes,
    enabled_at = coalesce(public.play_engine_releases.enabled_at, excluded.enabled_at);

insert into public.play_experiences
  (slug, title, subtitle, description, experience_type, engine_key, status, display_order, public_config, engine_config, published_at)
values
  ('lucky-number-draw', 'Lucky Number Draw', 'Draw a number. See your result.', 'Try a free number draw. This practice game has no entry fee, cash prize or redeemable reward.', 'INSTANT_GAME', 'QUICK_DRAW', 'PUBLISHED', 10,
   '{"practice_mode":true,"practice_label":"Free practice · no cash prizes"}'::jsonb,
   '{"runtime_mode":"FREE_PRACTICE","outcome_set":"QUICK_DRAW"}'::jsonb, statement_timestamp()),
  ('vad-lucky-wheel', 'Lucky Wheel', 'Give it a spin.', 'Spin the wheel for a server-selected practice result. No entry fee or cash prizes.', 'INSTANT_GAME', 'SPIN_AND_WIN', 'PUBLISHED', 20,
   '{"practice_mode":true,"practice_label":"Free practice · no cash prizes"}'::jsonb,
   '{"runtime_mode":"FREE_PRACTICE","outcome_set":"SPIN_AND_WIN"}'::jsonb, statement_timestamp()),
  ('scratch-and-reveal', 'Scratch & Reveal', 'Uncover your result.', 'Reveal a result with a tap. This practice game has no entry fee or cash prizes.', 'REVEAL_GAME', 'SCRATCH_AND_REVEAL', 'PUBLISHED', 30,
   '{"practice_mode":true,"practice_label":"Free practice · no cash prizes"}'::jsonb,
   '{"runtime_mode":"FREE_PRACTICE","outcome_set":"SCRATCH_AND_REVEAL"}'::jsonb, statement_timestamp())
on conflict (slug) do nothing;

insert into public.play_game_outcome_rules
  (experience_id, engine_key, engine_version, outcome_code, display_label, weight_units, reward_kind, reward_config, active)
select e.id, v.engine_key, 1, v.outcome_code, v.display_label, v.weight_units, 'NONE', '{}'::jsonb, true
from (values
  ('lucky-number-draw', 'QUICK_DRAW', 'NUMBER_07', 'Your number is 07', 1::bigint),
  ('lucky-number-draw', 'QUICK_DRAW', 'NUMBER_18', 'Your number is 18', 1::bigint),
  ('lucky-number-draw', 'QUICK_DRAW', 'NUMBER_24', 'Your number is 24', 1::bigint),
  ('lucky-number-draw', 'QUICK_DRAW', 'NUMBER_42', 'Your number is 42', 1::bigint),
  ('vad-lucky-wheel', 'SPIN_AND_WIN', 'TRY_AGAIN', 'Try another spin', 4::bigint),
  ('vad-lucky-wheel', 'SPIN_AND_WIN', 'NICE_SPIN', 'Nice spin!', 3::bigint),
  ('vad-lucky-wheel', 'SPIN_AND_WIN', 'LUCKY_MOMENT', 'A lucky moment!', 2::bigint),
  ('vad-lucky-wheel', 'SPIN_AND_WIN', 'GREAT_VIBES', 'Great vibes — keep playing', 1::bigint),
  ('scratch-and-reveal', 'SCRATCH_AND_REVEAL', 'TRY_AGAIN', 'Not this time — try again', 4::bigint),
  ('scratch-and-reveal', 'SCRATCH_AND_REVEAL', 'NICE_FIND', 'Nice find!', 2::bigint),
  ('scratch-and-reveal', 'SCRATCH_AND_REVEAL', 'LUCKY_REVEAL', 'Lucky reveal!', 1::bigint)
) as v(slug, engine_key, outcome_code, display_label, weight_units)
join public.play_experiences e on e.slug = v.slug
on conflict (experience_id, engine_key, engine_version, outcome_code) do update
set display_label = excluded.display_label,
    weight_units = excluded.weight_units,
    reward_kind = 'NONE',
    reward_config = '{}'::jsonb,
    active = true;

create or replace function public.play_practice_game(
  p_experience_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_experience record;
  v_existing public.play_game_sessions%rowtype;
  v_session_id uuid;
  v_total_weight numeric;
  v_roll numeric;
  v_cursor numeric := 0;
  v_rule record;
  v_selected record;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Sign in to play a practice game' using errcode = '28000';
  end if;

  if p_experience_id is null
     or p_idempotency_key is null
     or char_length(btrim(p_idempotency_key)) < 8
     or char_length(btrim(p_idempotency_key)) > 200 then
    raise exception 'A valid game and request key are required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.play_game_sessions
  where user_id = v_user_id
    and idempotency_key = btrim(p_idempotency_key);

  if found then
    if v_existing.experience_id <> p_experience_id then
      raise exception 'This request key belongs to a different game' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'sessionId', v_existing.id,
      'status', v_existing.status,
      'result', v_existing.public_result,
      'replayed', true
    );
  end if;

  select e.id, e.title, e.engine_key, rel.version as engine_version
    into v_experience
  from public.play_experiences e
  join public.play_engine_registry r on r.engine_key = e.engine_key
  join public.play_engine_releases rel
    on rel.engine_key = r.engine_key
   and rel.version = (
     select max(rel2.version)
     from public.play_engine_releases rel2
     where rel2.engine_key = r.engine_key
   )
  where e.id = p_experience_id
    and e.status = 'PUBLISHED'
    and (e.published_at is null or e.published_at <= statement_timestamp())
    and e.engine_key in ('QUICK_DRAW', 'SPIN_AND_WIN', 'SCRATCH_AND_REVEAL')
    and e.public_config->>'practice_mode' = 'true'
    and e.engine_config->>'runtime_mode' = 'FREE_PRACTICE'
    and r.rollout_status = 'ENABLED'
    and rel.rollout_status = 'ENABLED'
    and r.runtime_ready = true
  for update of e;

  if not found then
    raise exception 'This practice game is not available' using errcode = '55000';
  end if;

  select coalesce(sum(weight_units), 0)
    into v_total_weight
  from public.play_game_outcome_rules
  where experience_id = v_experience.id
    and engine_key = v_experience.engine_key
    and engine_version = v_experience.engine_version
    and active = true
    and reward_kind = 'NONE';

  if v_total_weight <= 0 then
    raise exception 'This game is not ready. Try again later.' using errcode = '55000';
  end if;

  -- The random selection is used only for non-monetary practice outcomes.
  v_roll := floor(random() * v_total_weight) + 1;

  for v_rule in
    select id, outcome_code, display_label, weight_units, reward_kind
    from public.play_game_outcome_rules
    where experience_id = v_experience.id
      and engine_key = v_experience.engine_key
      and engine_version = v_experience.engine_version
      and active = true
      and reward_kind = 'NONE'
    order by outcome_code
  loop
    v_cursor := v_cursor + v_rule.weight_units;
    if v_roll <= v_cursor then
      v_selected := v_rule;
      exit;
    end if;
  end loop;

  if v_selected.outcome_code is null then
    raise exception 'This game could not select a result. Try again.' using errcode = '55000';
  end if;

  v_session_id := gen_random_uuid();
  v_result := jsonb_build_object(
    'gameTitle', v_experience.title,
    'outcomeCode', v_selected.outcome_code,
    'message', v_selected.display_label,
    'practiceOnly', true,
    'rewardKind', 'NONE'
  );

  insert into public.play_game_sessions
    (id, user_id, experience_id, campaign_id, engine_key, engine_version,
     idempotency_key, status, public_result, private_outcome, completed_at)
  values
    (v_session_id, v_user_id, v_experience.id, null, v_experience.engine_key,
     v_experience.engine_version, btrim(p_idempotency_key), 'COMPLETED',
     v_result,
     jsonb_build_object('outcomeCode', v_selected.outcome_code, 'weightUnits', v_selected.weight_units, 'selectionRoll', v_roll),
     statement_timestamp())
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_session_id;

  if v_session_id is null then
    select * into v_existing
    from public.play_game_sessions
    where user_id = v_user_id
      and idempotency_key = btrim(p_idempotency_key);
    if v_existing.experience_id <> p_experience_id then
      raise exception 'This request key belongs to a different game' using errcode = '22023';
    end if;
    return jsonb_build_object(
      'sessionId', v_existing.id,
      'status', v_existing.status,
      'result', v_existing.public_result,
      'replayed', true
    );
  end if;

  insert into public.play_game_audit_events
    (session_id, experience_id, actor_user_id, actor_type, event_type, event_data)
  values
    (v_session_id, v_experience.id, v_user_id, 'USER', 'PRACTICE_GAME_COMPLETED',
     jsonb_build_object('engineKey', v_experience.engine_key, 'outcomeCode', v_selected.outcome_code, 'practiceOnly', true));

  insert into public.play_participations
    (user_id, experience_id, campaign_id, activity_type, status, reference, public_summary, private_metadata)
  values
    (v_user_id, v_experience.id, null, 'PRACTICE_GAME', 'COMPLETED', v_session_id::text,
     v_result,
     jsonb_build_object('sessionId', v_session_id, 'engineKey', v_experience.engine_key));

  return jsonb_build_object(
    'sessionId', v_session_id,
    'status', 'COMPLETED',
    'result', v_result,
    'replayed', false
  );
end;
$$;

revoke all on function public.play_practice_game(uuid, text) from public, anon;
grant execute on function public.play_practice_game(uuid, text) to authenticated;

comment on function public.play_practice_game(uuid, text) is
  'Server-resolved free practice play only. It cannot create paid entries, points, cash or physical rewards.';

commit;
