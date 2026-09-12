create or replace function public.internal_growth_record_qualification_event(p_user_id uuid,p_event_type text,p_source_event_id uuid,p_subject_type text,p_subject_id text,p_occurred_at timestamptz,p_metadata jsonb,p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event_type text:=upper(btrim(coalesce(p_event_type,'')));
  v_campaign_id bigint;
  v_event_id bigint;
  v_created boolean:=false;
  v_attribution growth.attributions;
  v_rule growth.reward_rules;
  v_campaign growth.campaigns;
  v_required text[];
  v_required_count integer;
  v_matched_count integer;
  v_beneficiary_user uuid;
  v_beneficiary_partner bigint;
  v_amount numeric;
  v_hold_days integer;
  v_reward_public_id uuid;
  v_available numeric;
  v_created_rewards jsonb:='[]'::jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  if p_user_id is null or not exists(select 1 from public.user_accounts where user_id=p_user_id) then raise exception 'User not found' using errcode='P0002'; end if;
  if v_event_type !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'Invalid qualification event type' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_idempotency_key,'')))<8 then raise exception 'A stable idempotency key is required' using errcode='22023'; end if;

  select * into v_attribution from growth.attributions where attributed_user_id=p_user_id;
  v_campaign_id:=v_attribution.campaign_id;

  insert into growth.qualification_events(user_id,campaign_id,event_type,source_event_id,subject_type,subject_id,occurred_at,metadata,idempotency_key)
  values(p_user_id,v_campaign_id,v_event_type,p_source_event_id,nullif(btrim(coalesce(p_subject_type,'')),''),nullif(btrim(coalesce(p_subject_id,'')),''),coalesce(p_occurred_at,statement_timestamp()),coalesce(p_metadata,'{}'::jsonb),btrim(p_idempotency_key))
  on conflict(idempotency_key) do nothing
  returning id into v_event_id;
  v_created:=v_event_id is not null;
  if not v_created then select id into v_event_id from growth.qualification_events where idempotency_key=btrim(p_idempotency_key); end if;

  if v_created and v_campaign_id is not null then
    select * into v_campaign from growth.campaigns where id=v_campaign_id;
    if v_campaign.status='ACTIVE' and (v_campaign.starts_at is null or v_campaign.starts_at<=statement_timestamp()) and (v_campaign.ends_at is null or v_campaign.ends_at>statement_timestamp()) then
      for v_rule in select * from growth.reward_rules where campaign_id=v_campaign_id and active and trigger_event=v_event_type order by priority,id loop
        v_required:=coalesce(array(select jsonb_array_elements_text(coalesce(v_rule.configuration->'requiredEvents','[]'::jsonb))),array[]::text[]);
        v_required_count:=coalesce(array_length(v_required,1),0);
        if v_required_count>0 then
          select count(distinct event_type) into v_matched_count from growth.qualification_events where user_id=p_user_id and campaign_id=v_campaign_id and event_type=any(v_required);
          if v_matched_count<v_required_count then continue; end if;
        end if;

        v_beneficiary_user:=null;v_beneficiary_partner:=null;
        if v_rule.beneficiary_type='REFERRER' then v_beneficiary_user:=v_attribution.inviter_user_id;
        elsif v_rule.beneficiary_type='PARTNER' then v_beneficiary_partner:=v_attribution.partner_id;
        elsif v_rule.beneficiary_type='PARTICIPANT' then v_beneficiary_user:=p_user_id;
        else continue;
        end if;
        if v_beneficiary_user is null and v_beneficiary_partner is null then continue; end if;

        if v_rule.model='FIXED' then v_amount:=nullif(v_rule.configuration->>'amount','')::numeric; else continue; end if;
        if v_amount is null or v_amount<=0 or v_campaign.reward_asset_id is null then continue; end if;

        select available_amount into v_available from growth.campaign_budget_state where campaign_id=v_campaign_id;
        if v_available<v_amount then continue; end if;
        if v_campaign.per_user_reward_cap is not null and v_beneficiary_user is not null and
          coalesce((select sum(amount) from growth.reward_entitlements where campaign_id=v_campaign_id and beneficiary_user_id=v_beneficiary_user and status not in('REVERSED','DISQUALIFIED')),0)+v_amount>v_campaign.per_user_reward_cap then continue; end if;
        if v_campaign.per_user_qualification_cap is not null and v_beneficiary_user is not null and
          (select count(*) from growth.reward_entitlements where campaign_id=v_campaign_id and beneficiary_user_id=v_beneficiary_user and status not in('REVERSED','DISQUALIFIED'))>=v_campaign.per_user_qualification_cap then continue; end if;

        v_hold_days:=greatest(coalesce(nullif(v_rule.configuration->>'holdDays','')::integer,0),0);
        insert into growth.reward_entitlements(campaign_id,rule_id,attribution_id,beneficiary_user_id,beneficiary_partner_id,reward_kind,asset_id,amount,status,source_reference,hold_until,idempotency_key,metadata)
        values(v_campaign_id,v_rule.id,v_attribution.id,v_beneficiary_user,v_beneficiary_partner,v_rule.reward_kind,v_campaign.reward_asset_id,v_amount,case when v_hold_days>0 then 'HELD' else 'EARNED' end,'qualification_event:'||v_event_id,case when v_hold_days>0 then statement_timestamp()+make_interval(days=>v_hold_days) else null end,'growth:'||v_rule.id||':'||p_user_id||':'||v_event_type,jsonb_build_object('qualifiedUserId',p_user_id,'qualificationEventId',v_event_id,'ruleCode',v_rule.rule_code))
        on conflict(idempotency_key) do nothing returning public_id into v_reward_public_id;
        if v_reward_public_id is not null then v_created_rewards:=v_created_rewards||jsonb_build_array(v_reward_public_id); end if;
      end loop;
    end if;
  end if;

  return jsonb_build_object('eventId',v_event_id,'created',v_created,'campaignId',v_campaign_id,'rewardPublicIds',v_created_rewards);
end;$$;
revoke all on function public.internal_growth_record_qualification_event(uuid,text,uuid,text,text,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_growth_record_qualification_event(uuid,text,uuid,text,text,timestamptz,jsonb,text) to service_role;

create or replace function public.internal_growth_add_score(p_campaign_public_id uuid,p_user_id uuid,p_event_type text,p_points numeric,p_reference_type text,p_reference_id text,p_metadata jsonb,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_campaign growth.campaigns;v_score_id bigint;
begin
 if auth.role()<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
 select * into v_campaign from growth.campaigns where public_id=p_campaign_public_id and status in('ACTIVE','CALCULATING');
 if v_campaign.id is null then raise exception 'Campaign is not accepting scores' using errcode='22023'; end if;
 if not exists(select 1 from growth.campaign_participants where campaign_id=v_campaign.id and user_id=p_user_id and status in('ACTIVE','ELIGIBLE')) then raise exception 'User is not an active campaign participant' using errcode='22023'; end if;
 insert into growth.score_events(campaign_id,user_id,event_type,points,reference_type,reference_id,idempotency_key,metadata)
 values(v_campaign.id,p_user_id,upper(btrim(p_event_type)),p_points,nullif(btrim(coalesce(p_reference_type,'')),''),nullif(btrim(coalesce(p_reference_id,'')),''),btrim(p_idempotency_key),coalesce(p_metadata,'{}'::jsonb))
 on conflict(idempotency_key) do nothing returning id into v_score_id;
 return jsonb_build_object('recorded',v_score_id is not null,'scoreEventId',v_score_id);
end;$$;
revoke all on function public.internal_growth_add_score(uuid,uuid,text,numeric,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_growth_add_score(uuid,uuid,text,numeric,text,text,jsonb,text) to service_role;
