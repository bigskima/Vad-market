-- VAD Play: campaign prize catalogue, deterministic multi-winner draws and fulfilment.
-- Existing campaigns without configured prize items keep the original single-winner path.
-- Free practice engines remain no-reward and are intentionally not changed here.

begin;

create table if not exists public.play_campaign_prizes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.play_campaigns(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 2 and 140),
  description text check (description is null or char_length(description) <= 700),
  asset_path text check (
    asset_path is null or (
      asset_path !~ '^https?://'
      and asset_path !~ '(^|/)\.\.(/|$)'
      and asset_path ~ '^[A-Za-z0-9_./-]+$'
    )
  ),
  -- Reserved for the follow-on GLB/GLTF production pipeline. Image artwork is
  -- still used as the cross-platform fallback until the model viewer is released.
  model_asset_path text check (
    model_asset_path is null or (
      model_asset_path !~ '^https?://'
      and model_asset_path !~ '(^|/)\.\.(/|$)'
      and model_asset_path ~ '^[A-Za-z0-9_./-]+\.(glb|gltf)$'
    )
  ),
  image_alt text check (image_alt is null or char_length(image_alt) <= 240),
  stock_quantity integer not null check (stock_quantity between 1 and 1000000),
  winner_limit integer not null check (winner_limit between 1 and stock_quantity),
  awards_count integer not null default 0
    check (awards_count >= 0 and awards_count <= winner_limit),
  fulfilled_count integer not null default 0
    check (fulfilled_count >= 0 and fulfilled_count <= awards_count),
  display_order integer not null default 100 check (display_order >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, display_order),
  unique (campaign_id, id)
);

create index if not exists play_campaign_prizes_public_order_idx
  on public.play_campaign_prizes(campaign_id, status, display_order, created_at);

create table if not exists public.play_campaign_prize_awards (
  id uuid primary key default gen_random_uuid(),
  public_id uuid not null default gen_random_uuid() unique,
  campaign_id uuid not null references public.play_campaigns(id) on delete restrict,
  draw_id uuid not null references public.play_campaign_draws(id) on delete restrict,
  prize_id uuid not null,
  ticket_id bigint not null references public.play_tickets(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  award_number integer not null check (award_number > 0),
  claim_status text not null default 'AWARDED'
    check (claim_status in ('AWARDED','CLAIMED','FULFILLMENT_PENDING','FULFILLED','EXPIRED','CANCELLED')),
  claimed_at timestamptz,
  fulfilled_at timestamptz,
  fulfillment_reference text check (
    fulfillment_reference is null
    or char_length(btrim(fulfillment_reference)) between 3 and 500
  ),
  fulfilled_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (campaign_id, prize_id)
    references public.play_campaign_prizes(campaign_id, id) on delete restrict,
  unique (campaign_id, ticket_id),
  unique (prize_id, award_number),
  check (
    (claim_status in ('CLAIMED','FULFILLMENT_PENDING','FULFILLED')) = (claimed_at is not null)
  ),
  check ((claim_status = 'FULFILLED') = (fulfilled_at is not null)),
  check (
    (claim_status = 'FULFILLED')
    = (fulfillment_reference is not null and fulfilled_by is not null)
  )
);

create index if not exists play_campaign_prize_awards_user_recent_idx
  on public.play_campaign_prize_awards(user_id, created_at desc);
create index if not exists play_campaign_prize_awards_campaign_prize_idx
  on public.play_campaign_prize_awards(campaign_id, prize_id, award_number);

alter table public.play_campaign_prizes enable row level security;
alter table public.play_campaign_prize_awards enable row level security;

drop policy if exists play_campaign_prizes_published_read on public.play_campaign_prizes;
create policy play_campaign_prizes_published_read
  on public.play_campaign_prizes for select to authenticated
  using (
    status = 'ACTIVE'
    and exists (
      select 1
      from public.play_campaigns c
      join public.play_experiences e on e.id = c.experience_id
      where c.id = play_campaign_prizes.campaign_id
        and c.status in (
          'OPEN','FUNDING_TARGET_MET','FUNDING_SHORTFALL','ENTRY_CLOSED',
          'DRAW_ELIGIBLE','DRAW_AUTHORIZED','DRAWN','SETTLED'
        )
        and e.status = 'PUBLISHED'
        and (e.published_at is null or e.published_at <= statement_timestamp())
    )
  );

drop policy if exists play_campaign_prize_awards_read_own on public.play_campaign_prize_awards;
create policy play_campaign_prize_awards_read_own
  on public.play_campaign_prize_awards for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.play_campaign_prizes, public.play_campaign_prize_awards from anon, authenticated;
grant all on public.play_campaign_prizes, public.play_campaign_prize_awards to service_role;

grant select (
  id, campaign_id, title, description, asset_path, model_asset_path, image_alt,
  stock_quantity, winner_limit, awards_count, fulfilled_count,
  display_order, status, created_at
) on public.play_campaign_prizes to authenticated;

grant select (
  id, public_id, campaign_id, draw_id, prize_id, ticket_id, user_id,
  award_number, claim_status, claimed_at, fulfilled_at, created_at
) on public.play_campaign_prize_awards to authenticated;

create or replace function public.admin_play_replace_campaign_prizes(
  p_campaign_id uuid,
  p_prizes jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_campaign public.play_campaigns;
  v_item jsonb;
  v_title text;
  v_description text;
  v_asset_path text;
  v_model_asset_path text;
  v_image_alt text;
  v_stock integer;
  v_winner_limit integer;
  v_display_order integer := 0;
  v_total_winners integer := 0;
  v_count integer := 0;
begin
  if v_actor is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_campaign_id is null or p_prizes is null
     or jsonb_typeof(p_prizes) <> 'array'
     or jsonb_array_length(p_prizes) < 1
     or jsonb_array_length(p_prizes) > 25 then
    raise exception 'Add between 1 and 25 prize items' using errcode = '22023';
  end if;

  select * into v_campaign
  from public.play_campaigns
  where id = p_campaign_id
  for update;

  if v_campaign.id is null then
    raise exception 'Campaign not found' using errcode = 'P0002';
  end if;
  if v_campaign.status not in ('DRAFT','COMPLIANCE_REVIEW') then
    raise exception 'Prize inventory can only be changed while a campaign is a draft or in compliance review' using errcode = '55000';
  end if;
  if exists (select 1 from public.play_campaign_entry_orders where campaign_id = p_campaign_id)
     or exists (select 1 from public.play_campaign_draws where campaign_id = p_campaign_id)
     or exists (select 1 from public.play_campaign_prize_awards where campaign_id = p_campaign_id) then
    raise exception 'Prize inventory cannot be replaced after entries or draw records exist' using errcode = '55000';
  end if;

  for v_item in select value from jsonb_array_elements(p_prizes)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Each prize must be an object' using errcode = '22023';
    end if;

    v_title := trim(coalesce(v_item->>'title',''));
    v_description := nullif(trim(coalesce(v_item->>'description','')),'');
    v_asset_path := nullif(trim(coalesce(v_item->>'asset_path','')),'');
    v_model_asset_path := nullif(trim(coalesce(v_item->>'model_asset_path','')),'');
    v_image_alt := nullif(trim(coalesce(v_item->>'image_alt','')),'');
    if coalesce(v_item->>'stock_quantity','') !~ '^[1-9][0-9]{0,6}$'
       or coalesce(v_item->>'winner_limit','') !~ '^[1-9][0-9]{0,6}$' then
      raise exception 'Prize stock and winner limits must be positive whole numbers' using errcode = '22023';
    end if;
    v_stock := (v_item->>'stock_quantity')::integer;
    v_winner_limit := (v_item->>'winner_limit')::integer;

    if char_length(v_title) < 2 or char_length(v_title) > 140
       or char_length(coalesce(v_description,'')) > 700
       or char_length(coalesce(v_image_alt,'')) > 240 then
      raise exception 'Check the title, description and image description for each prize' using errcode = '22023';
    end if;
    if v_winner_limit > v_stock then
      raise exception 'A prize cannot have more winners than available stock' using errcode = '23514';
    end if;
    if v_asset_path is not null and (
      v_asset_path ~ '^https?://'
      or v_asset_path ~ '(^|/)\.\.(/|$)'
      or v_asset_path !~ '^[A-Za-z0-9_./-]+$'
    ) then
      raise exception 'Prize artwork must be a VAD Play storage path' using errcode = '22023';
    end if;
    if v_model_asset_path is not null and (
      v_model_asset_path ~ '^https?://'
      or v_model_asset_path ~ '(^|/)\.\.(/|$)'
      or v_model_asset_path !~ '^[A-Za-z0-9_./-]+\.(glb|gltf)$'
    ) then
      raise exception '3D prize models must use a GLB or GLTF storage path' using errcode = '22023';
    end if;

    v_total_winners := v_total_winners + v_winner_limit;
    if v_total_winners > coalesce(v_campaign.max_entries, 0) then
      raise exception 'Total prize winners cannot exceed the campaign entry cap' using errcode = '23514';
    end if;
    v_display_order := v_display_order + 10;
  end loop;

  delete from public.play_campaign_prizes
  where campaign_id = p_campaign_id;

  v_display_order := 0;
  for v_item in select value from jsonb_array_elements(p_prizes)
  loop
    v_display_order := v_display_order + 10;
    insert into public.play_campaign_prizes (
      campaign_id, title, description, asset_path, model_asset_path,
      image_alt, stock_quantity, winner_limit, display_order, status
    ) values (
      p_campaign_id,
      trim(v_item->>'title'),
      nullif(trim(coalesce(v_item->>'description','')),''),
      nullif(trim(coalesce(v_item->>'asset_path','')),''),
      nullif(trim(coalesce(v_item->>'model_asset_path','')),''),
      nullif(trim(coalesce(v_item->>'image_alt','')),''),
      (v_item->>'stock_quantity')::integer,
      (v_item->>'winner_limit')::integer,
      v_display_order,
      'ACTIVE'
    );
    v_count := v_count + 1;
  end loop;

  insert into public.play_game_audit_events (
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, v_actor, 'ADMIN', 'CAMPAIGN_PRIZE_INVENTORY_CONFIGURED',
    jsonb_build_object(
      'campaign_id', p_campaign_id,
      'prize_count', v_count,
      'winner_slots', v_total_winners,
      'stock_units', (select coalesce(sum(stock_quantity),0) from public.play_campaign_prizes where campaign_id=p_campaign_id)
    )
  );

  return v_count;
end;
$$;

revoke all on function public.admin_play_replace_campaign_prizes(uuid,jsonb) from public, anon;
grant execute on function public.admin_play_replace_campaign_prizes(uuid,jsonb) to authenticated;

create or replace function public.admin_play_list_campaign_prizes(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_campaign_id is null then
    raise exception 'Campaign is required' using errcode = '22023';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'campaign_id', p.campaign_id,
      'title', p.title,
      'description', p.description,
      'asset_path', p.asset_path,
      'model_asset_path', p.model_asset_path,
      'stock_quantity', p.stock_quantity,
      'winner_limit', p.winner_limit,
      'awards_count', p.awards_count,
      'fulfilled_count', p.fulfilled_count,
      'display_order', p.display_order,
      'status', p.status
    ) order by p.display_order, p.id)
    from public.play_campaign_prizes p
    where p.campaign_id = p_campaign_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_play_list_campaign_prizes(uuid) from public, anon;
grant execute on function public.admin_play_list_campaign_prizes(uuid) to authenticated;

create or replace function public.play_claim_campaign_prize(p_award_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_award public.play_campaign_prize_awards;
  v_prize public.play_campaign_prizes;
begin
  if v_user_id is null then
    raise exception 'Sign in to claim your prize' using errcode = '28000';
  end if;

  select * into v_award
  from public.play_campaign_prize_awards
  where id = p_award_id and user_id = v_user_id
  for update;

  if v_award.id is null then
    raise exception 'Prize award not found' using errcode = 'P0002';
  end if;
  if v_award.claim_status <> 'AWARDED' then
    raise exception 'This prize is not awaiting a claim' using errcode = '55000';
  end if;

  update public.play_campaign_prize_awards
  set claim_status = 'CLAIMED',
      claimed_at = statement_timestamp()
  where id = v_award.id
  returning * into v_award;

  select * into v_prize
  from public.play_campaign_prizes
  where id = v_award.prize_id;

  insert into public.play_game_audit_events (
    experience_id, actor_user_id, actor_type, event_type, event_data
  )
  select c.experience_id, v_user_id, 'USER', 'CAMPAIGN_PRIZE_CLAIMED',
    jsonb_build_object('campaign_id', v_award.campaign_id, 'award_id', v_award.id, 'prize_id', v_award.prize_id)
  from public.play_campaigns c
  where c.id = v_award.campaign_id;

  return jsonb_build_object(
    'awardId', v_award.public_id,
    'prizeTitle', v_prize.title,
    'claimStatus', v_award.claim_status,
    'claimedAt', v_award.claimed_at
  );
end;
$$;

revoke all on function public.play_claim_campaign_prize(uuid) from public, anon;
grant execute on function public.play_claim_campaign_prize(uuid) to authenticated;

create or replace function public.admin_play_set_prize_fulfilment(
  p_award_id uuid,
  p_next_status text,
  p_fulfillment_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award public.play_campaign_prize_awards;
  v_prize public.play_campaign_prizes;
  v_reference text := nullif(trim(coalesce(p_fulfillment_reference,'')),'');
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_award_id is null or p_next_status not in ('FULFILLMENT_PENDING','FULFILLED') then
    raise exception 'Choose a valid fulfilment update' using errcode = '22023';
  end if;
  if p_next_status = 'FULFILLED'
     and (v_reference is null or char_length(v_reference) < 3 or char_length(v_reference) > 500) then
    raise exception 'A delivery or fulfilment evidence reference is required' using errcode = '22023';
  end if;

  select * into v_award
  from public.play_campaign_prize_awards
  where id = p_award_id
  for update;
  if v_award.id is null then
    raise exception 'Prize award not found' using errcode = 'P0002';
  end if;
  if (p_next_status = 'FULFILLMENT_PENDING' and v_award.claim_status <> 'CLAIMED')
     or (p_next_status = 'FULFILLED' and v_award.claim_status <> 'FULFILLMENT_PENDING') then
    raise exception 'Prize fulfilment must follow the claim workflow in order' using errcode = '55000';
  end if;

  if p_next_status = 'FULFILLMENT_PENDING' then
    update public.play_campaign_prize_awards
    set claim_status = 'FULFILLMENT_PENDING'
    where id = v_award.id
    returning * into v_award;
  else
    update public.play_campaign_prize_awards
    set claim_status = 'FULFILLED',
        fulfilled_at = statement_timestamp(),
        fulfillment_reference = v_reference,
        fulfilled_by = auth.uid()
    where id = v_award.id
    returning * into v_award;

    update public.play_campaign_prizes
    set fulfilled_count = fulfilled_count + 1,
        updated_at = statement_timestamp()
    where id = v_award.prize_id
      and fulfilled_count < awards_count
    returning * into v_prize;
    if v_prize.id is null then
      raise exception 'Prize fulfilment inventory could not be reconciled' using errcode = '23514';
    end if;
  end if;

  insert into public.play_game_audit_events (
    experience_id, actor_user_id, actor_type, event_type, event_data
  )
  select c.experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_PRIZE_FULFILMENT_UPDATED',
    jsonb_build_object(
      'campaign_id', v_award.campaign_id,
      'award_id', v_award.id,
      'prize_id', v_award.prize_id,
      'claim_status', v_award.claim_status,
      'fulfillment_reference', case when p_next_status = 'FULFILLED' then v_reference else null end
    )
  from public.play_campaigns c
  where c.id = v_award.campaign_id;

  return jsonb_build_object(
    'awardId', v_award.public_id,
    'claimStatus', v_award.claim_status,
    'fulfilledAt', v_award.fulfilled_at
  );
end;
$$;

revoke all on function public.admin_play_set_prize_fulfilment(uuid,text,text) from public, anon;
grant execute on function public.admin_play_set_prize_fulfilment(uuid,text,text) to authenticated;

-- Extend the existing two-person audited campaign draw. The commitment, ticket
-- snapshot, digest validation and legacy single-winner result remain compatible.
-- Campaigns with active prize rows now allocate distinct tickets across each
-- prize's configured winner_limit, in display order, using rejection sampling.
create or replace function public.admin_play_execute_draw(p_draw_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draw public.play_campaign_draws;
  v_campaign public.play_campaigns;
  v_ticket record;
  v_prize public.play_campaign_prizes;
  v_count bigint := 0;
  v_remaining_count bigint;
  v_digest text := repeat('0',64);
  v_random_bytes bytea;
  v_random_value numeric;
  v_random_limit numeric;
  v_selection_attempt bigint;
  v_attempt_total bigint := 0;
  v_winner_sequence bigint := 0;
  v_slot bigint;
  v_winner public.play_tickets;
  v_first_winner public.play_tickets;
  v_result_digest text;
  v_total_winner_slots bigint := 0;
  v_award_number integer;
  v_winners jsonb := '[]'::jsonb;
  v_award_id uuid;
  v_multi_prize boolean := false;
begin
  if auth.uid() is null or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;

  select * into v_draw from public.play_campaign_draws where id=p_draw_id for update;
  if v_draw.id is null then
    raise exception 'Authorized draw not found' using errcode = 'P0002';
  end if;
  if v_draw.status <> 'AUTHORIZED' then
    raise exception 'This draw is not awaiting execution' using errcode = '55000';
  end if;
  if v_draw.authorized_by = auth.uid() then
    raise exception 'Draw authorization and execution require two different administrators' using errcode = '42501';
  end if;

  select * into v_campaign from public.play_campaigns where id=v_draw.campaign_id for update;
  if v_campaign.status <> 'DRAW_AUTHORIZED' then
    raise exception 'Campaign is not in authorized-draw state' using errcode = '55000';
  end if;

  for v_ticket in
    select public_id,ticket_code
    from public.play_tickets
    where campaign_id=v_draw.campaign_id and status='ACTIVE'
    order by id
  loop
    v_digest := encode(extensions.digest(v_digest || ':' || v_ticket.public_id::text || ':' || v_ticket.ticket_code,'sha256'),'hex');
    v_count := v_count + 1;
  end loop;
  if v_count <> v_draw.ticket_count_snapshot or v_digest <> v_draw.entries_digest then
    raise exception 'The eligible ticket set changed after draw authorization' using errcode = '23514';
  end if;

  select coalesce(sum(winner_limit),0)
  into v_total_winner_slots
  from public.play_campaign_prizes
  where campaign_id = v_draw.campaign_id
    and status = 'ACTIVE';

  v_multi_prize := v_total_winner_slots > 0;
  if v_multi_prize and v_total_winner_slots > v_count then
    raise exception 'There are fewer eligible tickets than configured prize winners' using errcode = '23514';
  end if;

  v_result_digest := encode(extensions.digest(
    v_draw.seed_secret || ':' || v_draw.entries_digest,
    'sha256'
  ),'hex');

  if v_multi_prize then
    for v_prize in
      select *
      from public.play_campaign_prizes
      where campaign_id = v_draw.campaign_id
        and status = 'ACTIVE'
      order by display_order, id
      for update
    loop
      if v_prize.awards_count <> 0 or v_prize.fulfilled_count <> 0 then
        raise exception 'Prize inventory already contains awards; this draw cannot be repeated' using errcode = '23505';
      end if;
      if v_prize.winner_limit > v_prize.stock_quantity then
        raise exception 'A prize winner limit exceeds its stock quantity' using errcode = '23514';
      end if;

      for v_award_number in 1..v_prize.winner_limit loop
        select count(*) into v_remaining_count
        from public.play_tickets
        where campaign_id = v_draw.campaign_id
          and status = 'ACTIVE';
        if v_remaining_count <= 0 then
          raise exception 'No eligible tickets remain for the configured prize allocation' using errcode = '23514';
        end if;

        v_selection_attempt := 0;
        loop
          v_random_bytes := extensions.digest(
            decode(v_draw.seed_secret,'hex')
              || decode(v_draw.entries_digest,'hex')
              || convert_to(':' || v_winner_sequence::text || ':' || v_selection_attempt::text,'UTF8'),
            'sha256'
          );
          v_random_value :=
              get_byte(v_random_bytes,0)::numeric * 72057594037927936
            + get_byte(v_random_bytes,1)::numeric * 281474976710656
            + get_byte(v_random_bytes,2)::numeric * 1099511627776
            + get_byte(v_random_bytes,3)::numeric * 4294967296
            + get_byte(v_random_bytes,4)::numeric * 16777216
            + get_byte(v_random_bytes,5)::numeric * 65536
            + get_byte(v_random_bytes,6)::numeric * 256
            + get_byte(v_random_bytes,7)::numeric;
          v_random_limit := floor(18446744073709551616::numeric / v_remaining_count) * v_remaining_count;
          exit when v_random_value < v_random_limit;
          v_selection_attempt := v_selection_attempt + 1;
          v_attempt_total := v_attempt_total + 1;
          if v_selection_attempt > 1000 then
            raise exception 'Deterministic winner selection could not produce an unbiased index' using errcode = '55000';
          end if;
        end loop;
        v_attempt_total := v_attempt_total + 1;
        v_slot := mod(v_random_value, v_remaining_count)::bigint + 1;

        select * into v_winner
        from public.play_tickets
        where campaign_id = v_draw.campaign_id
          and status = 'ACTIVE'
        order by id
        offset (v_slot - 1)
        limit 1
        for update;
        if v_winner.id is null then
          raise exception 'Winner selection failed; no prize award was recorded' using errcode = '55000';
        end if;

        update public.play_tickets
        set status = 'WINNER'
        where id = v_winner.id;

        insert into public.play_campaign_prize_awards (
          campaign_id, draw_id, prize_id, ticket_id, user_id, award_number
        ) values (
          v_draw.campaign_id, v_draw.id, v_prize.id, v_winner.id, v_winner.user_id, v_award_number
        ) returning id into v_award_id;

        update public.play_campaign_prizes
        set awards_count = awards_count + 1,
            updated_at = statement_timestamp()
        where id = v_prize.id
          and awards_count < winner_limit
          and awards_count < stock_quantity;
        if not found then
          raise exception 'Prize winner limit or stock was reached during allocation' using errcode = '23514';
        end if;

        insert into public.play_participations (
          user_id, experience_id, campaign_id, activity_type, status,
          reference, currency_code, public_summary, private_metadata
        ) values (
          v_winner.user_id, v_campaign.experience_id, v_campaign.id, 'PRIZE_DRAW_WIN', 'COMPLETED',
          v_winner.public_id::text, v_campaign.currency_code,
          jsonb_build_object(
            'campaignTitle', v_campaign.title,
            'prizeTitle', v_prize.title,
            'ticketCode', v_winner.ticket_code
          ),
          jsonb_build_object(
            'drawId', v_draw.id,
            'awardId', v_award_id,
            'prizeId', v_prize.id
          )
        );

        v_winners := v_winners || jsonb_build_array(jsonb_build_object(
          'awardId', v_award_id,
          'prizeId', v_prize.id,
          'prizeTitle', v_prize.title,
          'awardNumber', v_award_number,
          'ticketId', v_winner.public_id,
          'ticketCode', v_winner.ticket_code
        ));
        v_result_digest := encode(extensions.digest(
          v_result_digest || ':' || v_prize.id::text || ':' ||
          v_winner.public_id::text || ':' || v_award_number::text || ':' || v_slot::text,
          'sha256'
        ),'hex');
        if v_first_winner.id is null then
          v_first_winner := v_winner;
        end if;
        v_winner_sequence := v_winner_sequence + 1;
      end loop;
    end loop;
  else
    -- Backwards-compatible one-winner draw for campaigns created before prize
    -- inventory was configured.
    v_remaining_count := v_count;
    v_selection_attempt := 0;
    loop
      v_random_bytes := extensions.digest(
        decode(v_draw.seed_secret,'hex')
          || decode(v_draw.entries_digest,'hex')
          || convert_to(':' || v_selection_attempt::text,'UTF8'),
        'sha256'
      );
      v_random_value :=
          get_byte(v_random_bytes,0)::numeric * 72057594037927936
        + get_byte(v_random_bytes,1)::numeric * 281474976710656
        + get_byte(v_random_bytes,2)::numeric * 1099511627776
        + get_byte(v_random_bytes,3)::numeric * 4294967296
        + get_byte(v_random_bytes,4)::numeric * 16777216
        + get_byte(v_random_bytes,5)::numeric * 65536
        + get_byte(v_random_bytes,6)::numeric * 256
        + get_byte(v_random_bytes,7)::numeric;
      v_random_limit := floor(18446744073709551616::numeric / v_count) * v_count;
      exit when v_random_value < v_random_limit;
      v_selection_attempt := v_selection_attempt + 1;
      v_attempt_total := v_attempt_total + 1;
      if v_selection_attempt > 1000 then
        raise exception 'Deterministic winner selection could not produce an unbiased index' using errcode = '55000';
      end if;
    end loop;
    v_attempt_total := v_attempt_total + 1;
    v_slot := mod(v_random_value, v_count)::bigint + 1;

    select * into v_winner
    from public.play_tickets
    where campaign_id = v_draw.campaign_id and status = 'ACTIVE'
    order by id
    offset (v_slot - 1)
    limit 1
    for update;
    if v_winner.id is null then
      raise exception 'Winner selection failed; no draw result was recorded' using errcode = '55000';
    end if;

    update public.play_tickets set status = 'WINNER' where id = v_winner.id;
    v_first_winner := v_winner;
    v_result_digest := encode(extensions.digest(
      v_draw.seed_secret || ':' || v_draw.entries_digest || ':' ||
      v_winner.public_id::text || ':' || v_slot::text || ':' || v_selection_attempt::text,
      'sha256'
    ),'hex');
    v_winners := jsonb_build_array(jsonb_build_object(
      'prizeTitle', v_campaign.prize_title,
      'ticketId', v_winner.public_id,
      'ticketCode', v_winner.ticket_code
    ));

    insert into public.play_participations (
      user_id, experience_id, campaign_id, activity_type, status,
      reference, currency_code, public_summary, private_metadata
    ) values (
      v_winner.user_id, v_campaign.experience_id, v_campaign.id, 'PRIZE_DRAW_WIN', 'COMPLETED',
      v_winner.public_id::text, v_campaign.currency_code,
      jsonb_build_object('campaignTitle',v_campaign.title,'prizeTitle',v_campaign.prize_title,'ticketCode',v_winner.ticket_code),
      jsonb_build_object('drawId',v_draw.id,'resultDigest',v_result_digest)
    );
  end if;

  if v_first_winner.id is null then
    raise exception 'Winner allocation returned no result' using errcode = '55000';
  end if;

  update public.play_campaign_draws
  set status = 'DRAWN',
      seed_reveal = seed_secret,
      winning_ticket_id = v_first_winner.id,
      executed_by = auth.uid(),
      executed_at = statement_timestamp(),
      selection_counter = v_attempt_total,
      result_digest = v_result_digest
  where id = v_draw.id;

  update public.play_campaigns
  set status = 'DRAWN', drawn_at = statement_timestamp(), updated_at = statement_timestamp()
  where id = v_campaign.id;

  insert into public.play_game_audit_events (
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_campaign.experience_id, auth.uid(), 'ADMIN', 'DRAW_EXECUTED',
    jsonb_build_object(
      'campaign_id', v_campaign.id,
      'draw_id', v_draw.id,
      'winner_count', jsonb_array_length(v_winners),
      'multi_prize', v_multi_prize,
      'winners', v_winners,
      'ticket_count', v_count,
      'entries_digest', v_digest,
      'seed_commitment', v_draw.seed_commitment,
      'seed_reveal', v_draw.seed_secret,
      'result_digest', v_result_digest,
      'selection_counter', v_attempt_total
    )
  );

  return jsonb_build_object(
    'campaignId', v_campaign.id,
    'drawId', v_draw.id,
    'status', 'DRAWN',
    'winningTicketId', v_first_winner.public_id,
    'winningTicketCode', v_first_winner.ticket_code,
    'winnerCount', jsonb_array_length(v_winners),
    'winners', v_winners,
    'ticketCount', v_count,
    'seedCommitment', v_draw.seed_commitment,
    'seedReveal', v_draw.seed_secret,
    'entriesDigest', v_digest,
    'resultDigest', v_result_digest,
    'selectionCounter', v_attempt_total,
    'algorithm', case when v_multi_prize
      then 'SHA-256 seed commitment + ordered ticket-chain digest + rejection-sampled sequential unique ticket allocation'
      else 'SHA-256 seed commitment + ordered ticket-chain digest + rejection-sampled SHA-256 index'
    end,
    'executedAt', statement_timestamp()
  );
end;
$$;

revoke all on function public.admin_play_execute_draw(uuid) from public, anon;
grant execute on function public.admin_play_execute_draw(uuid) to authenticated;

create or replace function public.admin_play_list_prize_awards(p_campaign_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id,
      'public_id', a.public_id,
      'campaign_id', a.campaign_id,
      'prize_id', a.prize_id,
      'prize_title', p.title,
      'user_id', a.user_id,
      'ticket_code', t.ticket_code,
      'award_number', a.award_number,
      'claim_status', a.claim_status,
      'claimed_at', a.claimed_at,
      'fulfilled_at', a.fulfilled_at,
      'fulfillment_reference', a.fulfillment_reference,
      'created_at', a.created_at
    ) order by a.created_at desc)
    from public.play_campaign_prize_awards a
    join public.play_campaign_prizes p on p.id = a.prize_id
    join public.play_tickets t on t.id = a.ticket_id
    where p_campaign_id is null or a.campaign_id = p_campaign_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_play_list_prize_awards(uuid) from public, anon;
grant execute on function public.admin_play_list_prize_awards(uuid) to authenticated;

comment on table public.play_campaign_prizes is
  'Campaign-specific physical prize inventory. winner_limit is the maximum number of distinct tickets that can win this item; stock_quantity is the secured inventory ceiling.';
comment on table public.play_campaign_prize_awards is
  'Auditable physical-prize allocations created only by the authorized server-side campaign draw. Users can read and claim only their own awards.';
comment on function public.admin_play_execute_draw(uuid) is
  'Two-person audited draw execution. Allocates unique tickets across each configured prize winner limit; retains legacy single-winner behavior when no prize inventory exists.';

commit;
