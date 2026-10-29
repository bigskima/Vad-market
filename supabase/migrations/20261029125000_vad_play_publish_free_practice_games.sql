-- VAD Play: publish no-money practice games directly from the admin builder.
-- Paid Prize Draws stay on their separate legal/prize review workflow.

begin;

create or replace function public.admin_play_publish_practice_experience(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_slug text;
  v_title text;
  v_description text;
  v_engine_key text;
  v_experience_type text;
  v_image_path text;
  v_image_alt text;
  v_display_order integer;
  v_engine public.play_engine_registry;
  v_release public.play_engine_releases;
  v_experience_id uuid;
begin
  if v_actor is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Game details are required' using errcode = '22023';
  end if;

  v_slug := lower(trim(coalesce(p_payload->>'slug','')));
  v_title := trim(coalesce(p_payload->>'title',''));
  v_description := nullif(trim(coalesce(p_payload->>'description','')),'');
  v_engine_key := upper(trim(coalesce(p_payload->>'engine_key','')));
  v_experience_type := upper(trim(coalesce(p_payload->>'experience_type','')));
  v_image_path := nullif(trim(coalesce(p_payload->>'hero_asset_url','')),'');
  v_image_alt := nullif(trim(coalesce(p_payload->>'image_alt','')),'');
  v_display_order := coalesce(nullif(p_payload->>'display_order','')::integer, 100);

  if char_length(v_title) < 3 or char_length(v_title) > 120 then
    raise exception 'Game titles must be between 3 and 120 characters' using errcode = '22023';
  end if;
  if char_length(v_slug) < 3 or char_length(v_slug) > 90
     or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Use a short title with letters or numbers for the game address' using errcode = '22023';
  end if;
  if char_length(coalesce(v_description,'')) > 1000 then
    raise exception 'The game description is too long' using errcode = '22023';
  end if;
  if v_engine_key not in ('QUICK_DRAW','SPIN_AND_WIN','SCRATCH_AND_REVEAL') then
    raise exception 'Only free practice games can be published directly' using errcode = '42501';
  end if;

  select * into v_engine
  from public.play_engine_registry
  where engine_key = v_engine_key
  for update;
  select * into v_release
  from public.play_engine_releases
  where engine_key = v_engine_key
  order by version desc
  limit 1
  for update;

  if v_engine.engine_key is null or v_release.engine_key is null
     or v_engine.rollout_status is distinct from 'ENABLED'
     or v_engine.runtime_ready is distinct from true
     or v_release.rollout_status is distinct from 'ENABLED'
     or v_experience_type is distinct from v_engine.engine_family then
    raise exception 'This game type is not ready for players yet' using errcode = '42501';
  end if;

  if exists (select 1 from public.play_experiences where slug = v_slug) then
    raise exception 'A game with that title already exists. Choose a different title.' using errcode = '23505';
  end if;

  insert into public.play_experiences (
    slug, title, description, experience_type, engine_key, status,
    hero_asset_url, card_asset_url, image_alt, display_order,
    public_config, engine_config, published_at, created_by
  ) values (
    v_slug, v_title, v_description, v_experience_type, v_engine_key, 'PUBLISHED',
    v_image_path, v_image_path, v_image_alt, v_display_order,
    jsonb_build_object('practice_mode', true, 'practice_label', 'Free practice · no cash prizes'),
    jsonb_build_object('runtime_mode', 'FREE_PRACTICE', 'outcome_set', v_engine_key),
    statement_timestamp(), v_actor
  )
  returning id into v_experience_id;

  insert into public.play_game_outcome_rules (
    experience_id, engine_key, engine_version, outcome_code, display_label,
    weight_units, reward_kind, reward_config, active
  )
  select v_experience_id, v_engine_key, v_release.version, v.outcome_code, v.display_label,
         v.weight_units, 'NONE', '{}'::jsonb, true
  from (values
    ('QUICK_DRAW', 'NUMBER_07', 'Your number is 07', 1::bigint),
    ('QUICK_DRAW', 'NUMBER_18', 'Your number is 18', 1::bigint),
    ('QUICK_DRAW', 'NUMBER_24', 'Your number is 24', 1::bigint),
    ('QUICK_DRAW', 'NUMBER_42', 'Your number is 42', 1::bigint),
    ('SPIN_AND_WIN', 'TRY_AGAIN', 'Try another spin', 4::bigint),
    ('SPIN_AND_WIN', 'NICE_SPIN', 'Nice spin!', 3::bigint),
    ('SPIN_AND_WIN', 'LUCKY_MOMENT', 'A lucky moment!', 2::bigint),
    ('SPIN_AND_WIN', 'GREAT_VIBES', 'Great vibes — keep playing', 1::bigint),
    ('SCRATCH_AND_REVEAL', 'TRY_AGAIN', 'Not this time — try again', 4::bigint),
    ('SCRATCH_AND_REVEAL', 'NICE_FIND', 'Nice find!', 2::bigint),
    ('SCRATCH_AND_REVEAL', 'LUCKY_REVEAL', 'Lucky reveal!', 1::bigint)
  ) as v(engine_key, outcome_code, display_label, weight_units)
  where v.engine_key = v_engine_key;

  insert into public.play_game_audit_events (
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_experience_id, v_actor, 'ADMIN', 'PRACTICE_EXPERIENCE_PUBLISHED',
    jsonb_build_object('experience_id', v_experience_id, 'engine_key', v_engine_key,
                       'practice_only', true, 'reward_kind', 'NONE')
  );

  return v_experience_id;
end;
$$;

revoke all on function public.admin_play_publish_practice_experience(jsonb) from public, anon;
grant execute on function public.admin_play_publish_practice_experience(jsonb) to authenticated;

comment on function public.admin_play_publish_practice_experience(jsonb) is
  'Permission-checked publication for free VAD Play practice games only. Cannot publish paid Prize Draws or attach any rewards.';

commit;
