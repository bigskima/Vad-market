begin;

-- Campaign artwork is always an object in Supabase Storage, never a user-entered URL.
alter table public.play_campaigns
  add column if not exists image_path text
  check (image_path is null or (image_path !~ '^/' and position('..' in image_path) = 0));

grant select (image_path) on public.play_campaigns to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vad-play-media',
  'vad-play-media',
  true,
  8388608,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = 8388608,
    allowed_mime_types = array['image/png','image/jpeg','image/webp']::text[];

drop policy if exists vad_play_media_admin_insert on storage.objects;
create policy vad_play_media_admin_insert
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'vad-play-media'
  and (private.is_super_admin() or private.has_permission('play.manage'))
  and name like 'drafts/' || auth.uid()::text || '/%'
  and name ~ '^drafts/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(png|jpe?g|webp)$'
);

drop policy if exists vad_play_media_admin_delete_draft on storage.objects;
create policy vad_play_media_admin_delete_draft
on storage.objects
for delete to authenticated
using (
  bucket_id = 'vad-play-media'
  and (private.is_super_admin() or private.has_permission('play.manage'))
  and name like 'drafts/' || auth.uid()::text || '/%'
);

create or replace function public.admin_play_upsert_campaign(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_experience_id uuid;
  v_slug text;
  v_title text;
  v_prize_title text;
  v_currency text;
  v_profit_mode text;
  v_prize_cost numeric;
  v_profit_value numeric;
  v_cost_budget numeric;
  v_entry_price numeric;
  v_max_entries integer;
  v_max_tickets_per_purchase integer;
  v_entry_limit_per_user integer;
  v_rules_public jsonb;
  v_image_path text;
begin
  if auth.uid() is null
     or not (private.is_super_admin() or private.has_permission('play.manage')) then
    raise exception 'VAD Play management permission required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Campaign payload must be a JSON object' using errcode = '22023';
  end if;

  v_id := nullif(p_payload->>'id','')::uuid;
  v_experience_id := nullif(p_payload->>'experience_id','')::uuid;
  v_slug := lower(trim(coalesce(p_payload->>'slug','')));
  v_title := trim(coalesce(p_payload->>'title',''));
  v_prize_title := trim(coalesce(p_payload->>'prize_title',''));
  v_currency := upper(trim(coalesce(p_payload->>'currency_code','')));
  v_profit_mode := upper(trim(coalesce(p_payload->>'profit_target_mode','')));
  v_prize_cost := nullif(p_payload->>'prize_cost_amount','')::numeric;
  v_profit_value := nullif(p_payload->>'profit_target_value','')::numeric;
  v_cost_budget := nullif(p_payload->>'campaign_cost_budget_amount','')::numeric;
  v_entry_price := nullif(p_payload->>'entry_price_amount','')::numeric;
  v_max_entries := nullif(p_payload->>'max_entries','')::integer;
  v_max_tickets_per_purchase := nullif(p_payload->>'max_tickets_per_purchase','')::integer;
  v_entry_limit_per_user := nullif(p_payload->>'entry_limit_per_user','')::integer;
  v_rules_public := coalesce(p_payload->'rules_public','{}'::jsonb);
  v_image_path := nullif(trim(coalesce(p_payload->>'image_path','')),'');
  if v_image_path is not null and v_image_path !~ '^(campaigns/generated|drafts/[0-9a-f-]{36})/[A-Za-z0-9_-]+\.(png|jpe?g|webp)

  if v_experience_id is null or v_slug = '' or v_title = '' or v_prize_title = '' or v_currency = '' then
    raise exception 'Experience, slug, campaign title, prize title and currency are required' using errcode = '22023';
  end if;
  if v_profit_mode not in ('PERCENT_OF_PRIZE','FIXED_AMOUNT')
     or v_prize_cost is null or v_profit_value is null
     or v_cost_budget is null or v_entry_price is null then
    raise exception 'Prize cost, profit mode/value, campaign cost budget, and entry price must all be explicitly configured' using errcode = '22023';
  end if;
  if jsonb_typeof(v_rules_public) <> 'object'
     or jsonb_typeof(coalesce(p_payload->'engine_config','{}'::jsonb)) <> 'object' then
    raise exception 'Campaign rules and engine configuration must be JSON objects' using errcode = '22023';
  end if;
  if v_max_entries is null or v_max_entries <= 0
     or v_max_tickets_per_purchase is null or v_max_tickets_per_purchase <= 0
     or v_max_tickets_per_purchase > v_max_entries
     or (v_entry_limit_per_user is not null and (v_entry_limit_per_user <= 0 or v_entry_limit_per_user > v_max_entries)) then
    raise exception 'Configure valid finite campaign, per-purchase and optional per-user entry caps' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(v_rules_public->>'terms',''))) < 20
     or char_length(btrim(coalesce(v_rules_public->>'refund_policy',''))) < 10 then
    raise exception 'Campaign terms and refund/shortfall policy are required before saving this campaign' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.play_campaigns (
      experience_id, slug, title, prize_title, currency_code,
      prize_cost_amount, profit_target_mode, profit_target_value,
      campaign_cost_budget_amount, entry_price_amount,
      max_entries, max_tickets_per_purchase, entry_limit_per_user, image_path, rules_public, engine_config, created_by
    ) values (
      v_experience_id, v_slug, v_title, v_prize_title, v_currency,
      v_prize_cost, v_profit_mode, v_profit_value,
      v_cost_budget, v_entry_price,
      v_max_entries, v_max_tickets_per_purchase, v_entry_limit_per_user, v_image_path,
      v_rules_public,
      coalesce(p_payload->'engine_config','{}'::jsonb), auth.uid()
    ) returning id into v_id;
  else
    update public.play_campaigns
    set experience_id = v_experience_id, slug = v_slug, title = v_title,
        prize_title = v_prize_title, currency_code = v_currency,
        prize_cost_amount = v_prize_cost, profit_target_mode = v_profit_mode,
        profit_target_value = v_profit_value, campaign_cost_budget_amount = v_cost_budget,
        entry_price_amount = v_entry_price,
        max_entries = v_max_entries,
        max_tickets_per_purchase = v_max_tickets_per_purchase,
        entry_limit_per_user = v_entry_limit_per_user,
        image_path = coalesce(v_image_path, image_path),
        rules_public = v_rules_public,
        engine_config = coalesce(p_payload->'engine_config','{}'::jsonb),
        updated_at = now()
    where id = v_id and status in ('DRAFT','COMPLIANCE_REVIEW')
    returning id into v_id;

    if not found then
      raise exception 'Only existing draft or compliance-review campaigns can be edited' using errcode = '55000';
    end if;
  end if;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_DRAFT_SAVED',
    jsonb_build_object('campaign_id', v_id, 'slug', v_slug, 'profit_target_mode', v_profit_mode)
  );
  return v_id;
end;
$$; then
    raise exception 'Campaign artwork must be a path in the VAD Play media bucket' using errcode = '22023';
  end if;

  if v_experience_id is null or v_slug = '' or v_title = '' or v_prize_title = '' or v_currency = '' then
    raise exception 'Experience, slug, campaign title, prize title and currency are required' using errcode = '22023';
  end if;
  if v_profit_mode not in ('PERCENT_OF_PRIZE','FIXED_AMOUNT')
     or v_prize_cost is null or v_profit_value is null
     or v_cost_budget is null or v_entry_price is null then
    raise exception 'Prize cost, profit mode/value, campaign cost budget, and entry price must all be explicitly configured' using errcode = '22023';
  end if;
  if jsonb_typeof(v_rules_public) <> 'object'
     or jsonb_typeof(coalesce(p_payload->'engine_config','{}'::jsonb)) <> 'object' then
    raise exception 'Campaign rules and engine configuration must be JSON objects' using errcode = '22023';
  end if;
  if v_max_entries is null or v_max_entries <= 0
     or v_max_tickets_per_purchase is null or v_max_tickets_per_purchase <= 0
     or v_max_tickets_per_purchase > v_max_entries
     or (v_entry_limit_per_user is not null and (v_entry_limit_per_user <= 0 or v_entry_limit_per_user > v_max_entries)) then
    raise exception 'Configure valid finite campaign, per-purchase and optional per-user entry caps' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(v_rules_public->>'terms',''))) < 20
     or char_length(btrim(coalesce(v_rules_public->>'refund_policy',''))) < 10 then
    raise exception 'Campaign terms and refund/shortfall policy are required before saving this campaign' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.play_campaigns (
      experience_id, slug, title, prize_title, currency_code,
      prize_cost_amount, profit_target_mode, profit_target_value,
      campaign_cost_budget_amount, entry_price_amount,
      max_entries, max_tickets_per_purchase, entry_limit_per_user, rules_public, engine_config, created_by
    ) values (
      v_experience_id, v_slug, v_title, v_prize_title, v_currency,
      v_prize_cost, v_profit_mode, v_profit_value,
      v_cost_budget, v_entry_price,
      v_max_entries, v_max_tickets_per_purchase, v_entry_limit_per_user,
      v_rules_public,
      coalesce(p_payload->'engine_config','{}'::jsonb), auth.uid()
    ) returning id into v_id;
  else
    update public.play_campaigns
    set experience_id = v_experience_id, slug = v_slug, title = v_title,
        prize_title = v_prize_title, currency_code = v_currency,
        prize_cost_amount = v_prize_cost, profit_target_mode = v_profit_mode,
        profit_target_value = v_profit_value, campaign_cost_budget_amount = v_cost_budget,
        entry_price_amount = v_entry_price,
        max_entries = v_max_entries,
        max_tickets_per_purchase = v_max_tickets_per_purchase,
        entry_limit_per_user = v_entry_limit_per_user,
        rules_public = v_rules_public,
        engine_config = coalesce(p_payload->'engine_config','{}'::jsonb),
        updated_at = now()
    where id = v_id and status in ('DRAFT','COMPLIANCE_REVIEW')
    returning id into v_id;

    if not found then
      raise exception 'Only existing draft or compliance-review campaigns can be edited' using errcode = '55000';
    end if;
  end if;

  insert into public.play_game_audit_events(
    experience_id, actor_user_id, actor_type, event_type, event_data
  ) values (
    v_experience_id, auth.uid(), 'ADMIN', 'CAMPAIGN_DRAFT_SAVED',
    jsonb_build_object('campaign_id', v_id, 'slug', v_slug, 'profit_target_mode', v_profit_mode)
  );
  return v_id;
end;
$$;

commit;
