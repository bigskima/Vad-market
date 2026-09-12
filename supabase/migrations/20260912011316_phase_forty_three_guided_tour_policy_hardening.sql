create index if not exists product_tours_current_version_idx
  on experience.product_tours (current_version_id);
create index if not exists user_tour_progress_tour_idx
  on experience.user_tour_progress (tour_id);
create index if not exists user_tour_progress_version_idx
  on experience.user_tour_progress (tour_version_id);
create index if not exists legal_document_drafts_policy_idx
  on policy.legal_document_drafts (policy_id);
create index if not exists user_policy_acceptances_policy_idx
  on policy.user_policy_acceptances (policy_id);
create index if not exists user_policy_acceptances_version_idx
  on policy.user_policy_acceptances (policy_version_id);

create or replace function public.my_product_tour(p_tour_code text default 'GETTING_STARTED')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  tour_row experience.product_tours;
  version_row experience.product_tour_versions;
  progress_row experience.user_tour_progress;
  has_progress boolean := false;
  same_version boolean := false;
  should_start boolean := false;
  steps_json jsonb;
begin
  if caller_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into tour_row
  from experience.product_tours
  where code = upper(trim(coalesce(p_tour_code,'')))
    and status = 'ACTIVE';

  if tour_row.id is null or tour_row.current_version_id is null then
    return jsonb_build_object('available', false, 'shouldStart', false, 'steps', '[]'::jsonb);
  end if;

  select * into version_row
  from experience.product_tour_versions
  where id = tour_row.current_version_id
    and effective_at <= statement_timestamp()
    and (expires_at is null or expires_at > statement_timestamp());

  if version_row.id is null then
    return jsonb_build_object('available', false, 'shouldStart', false, 'steps', '[]'::jsonb);
  end if;

  select * into progress_row
  from experience.user_tour_progress
  where user_id = caller_id and tour_id = tour_row.id;
  has_progress := progress_row.user_id is not null;
  same_version := has_progress and progress_row.tour_version_id = version_row.id;

  if not has_progress then
    should_start := tour_row.auto_start;
  elsif not same_version then
    should_start := version_row.auto_prompt_existing;
  elsif progress_row.status = 'REMIND' then
    should_start := progress_row.remind_at <= statement_timestamp();
  elsif progress_row.status = 'IN_PROGRESS' then
    should_start := true;
  else
    should_start := false;
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', s.step_key,
      'targetId', s.target_id,
      'route', s.route,
      'title', s.title,
      'body', s.body,
      'sequence', s.sequence,
      'metadata', s.metadata
    ) order by s.sequence
  ), '[]'::jsonb)
  into steps_json
  from experience.product_tour_steps s
  where s.tour_version_id = version_row.id and s.enabled;

  return jsonb_build_object(
    'available', true,
    'tourCode', tour_row.code,
    'name', tour_row.name,
    'versionId', version_row.id,
    'version', version_row.version_label,
    'shouldStart', should_start,
    'steps', steps_json,
    'progress', case
      when same_version then jsonb_build_object(
        'status', progress_row.status,
        'currentStepKey', progress_row.current_step_key,
        'remindAt', progress_row.remind_at,
        'completedAt', progress_row.completed_at,
        'lastStartedAt', progress_row.last_started_at,
        'tourVersionId', progress_row.tour_version_id
      )
      else jsonb_build_object(
        'status', 'NEW',
        'currentStepKey', null,
        'remindAt', null,
        'completedAt', null,
        'lastStartedAt', null,
        'tourVersionId', version_row.id
      )
    end
  );
end;
$$;

revoke all on function public.my_product_tour(text) from public, anon;
grant execute on function public.my_product_tour(text) to authenticated;
