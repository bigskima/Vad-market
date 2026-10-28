-- Add VAD Play to the versioned Getting Started tour without replacing existing steps.
-- Bump the tour version so returning users can be prompted to discover the new hub.
begin;

do $$
declare
  v_tour_id bigint;
  v_source_version_id bigint;
  v_new_version_id bigint;
  v_next_version_number integer;
  v_next_sequence integer;
begin
  select id, current_version_id
    into v_tour_id, v_source_version_id
  from experience.product_tours
  where code = 'GETTING_STARTED'
    and status = 'ACTIVE'
  for update;

  if v_tour_id is null or v_source_version_id is null then
    raise exception 'The active GETTING_STARTED tour must exist before adding VAD Play';
  end if;

  select id
    into v_new_version_id
  from experience.product_tour_versions
  where tour_id = v_tour_id
    and version_label = '2026.10-vad-play';

  if v_new_version_id is null then
    select coalesce(max(version_number), 0) + 1
      into v_next_version_number
    from experience.product_tour_versions
    where tour_id = v_tour_id;

    insert into experience.product_tour_versions (
      tour_id,
      version_number,
      version_label,
      effective_at,
      auto_prompt_existing
    ) values (
      v_tour_id,
      v_next_version_number,
      '2026.10-vad-play',
      statement_timestamp(),
      true
    )
    returning id into v_new_version_id;

    insert into experience.product_tour_steps (
      tour_version_id,
      step_key,
      sequence,
      route,
      target_id,
      title,
      body,
      enabled,
      metadata
    )
    select
      v_new_version_id,
      s.step_key,
      s.sequence,
      s.route,
      s.target_id,
      s.title,
      s.body,
      s.enabled,
      s.metadata
    from experience.product_tour_steps s
    where s.tour_version_id = v_source_version_id
    on conflict (tour_version_id, step_key) do nothing;
  end if;

  if not exists (
    select 1
    from experience.product_tour_steps
    where tour_version_id = v_new_version_id
      and step_key = 'play-hub-overview'
  ) then
    select coalesce(max(sequence), 0) + 1
      into v_next_sequence
    from experience.product_tour_steps
    where tour_version_id = v_new_version_id;

    insert into experience.product_tour_steps (
      tour_version_id,
      step_key,
      sequence,
      route,
      target_id,
      title,
      body,
      enabled,
      metadata
    ) values (
      v_new_version_id,
      'play-hub-overview',
      v_next_sequence,
      '/play',
      'play-hub-overview',
      'Discover VAD Play',
      'VAD Play brings published experiences, game discovery and your Play activity together in one place. Only experiences actually published by VAD appear here; game engines stay unavailable until their server runtime and required reviews are enabled.',
      true,
      jsonb_build_object('area', 'VAD_PLAY', 'requiresPublishedExperience', true)
    );
  end if;

  update experience.product_tours
  set current_version_id = v_new_version_id,
      updated_at = statement_timestamp()
  where id = v_tour_id;
end;
$$;

commit;
