create or replace function public.internal_growth_record_qualification_event(
  p_user_id uuid,
  p_event_type text,
  p_source_event_id uuid,
  p_subject_type text,
  p_subject_id text,
  p_occurred_at timestamptz,
  p_metadata jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event_type text:=upper(btrim(coalesce(p_event_type,'')));
  v_event_id bigint;
  v_created boolean:=false;
  v_candidate record;
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
  v_account_created timestamptz;
  v_country text;
begin
  if auth.role()<>'service_role' and pg_trigger_depth()=0 then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select created_at,country_code into v_account_created,v_country from public.user_accounts where user_id=p_user_id;
  if v_account_created is null then raise exception 'User not found' using errcode='P0002'; end if;
  if v_event_type !~ '^[A-Z][A-Z0-9_]*$' then raise exception 'Invalid qualification event type' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_idempotency_key,'')))<8 then raise exception 'A stable idempotency key is required' using errcode='22023'; end if;

  insert into growth.qualification_events(
    user_id,campaign_id,event_type,source_event_id,subject_type,subject_id,occurred_at,metadata,idempotency_key
  ) values(
    p_user_id,null,v_event_type,p_source_event_id,nullif(btrim(coalesce(p_subject_type,'')),''),
    nullif(btrim(coalesce(p_subject_id,'')),''),coalesce(p_occurred_at,statement_timestamp()),
    coalesce(p_metadata,'{}'::jsonb),btrim(p_idempotency_key)
  )
  on conflict(idempotency_key) do nothing
  returning id into v_event_id;
  v_created:=v_event_id is not null;
  if not v_created then
    select id into v_event_id from growth.qualification_events where idempotency_key=btrim(p_idempotency_key);
  end if;

  if v_created then
    for v_candidate in
      with attributed as (
        select a.campaign_id,greatest(c.created_at,coalesce(c.starts_at,c.created_at),a.claimed_at) eligible_from
        from growth.attributions a
        join growth.campaigns c on c.id=a.campaign_id
        where a.attributed_user_id=p_user_id and a.campaign_id is not null
      ), joined as (
        select cp.campaign_id,greatest(c.created_at,coalesce(c.starts_at,c.created_at),cp.joined_at) eligible_from
        from growth.campaign_participants cp
        join growth.campaigns c on c.id=cp.campaign_id
        where cp.user_id=p_user_id and cp.status='ACTIVE'
      )
      select campaign_id,min(eligible_from) eligible_from
      from (
        select * from attributed
        union all
        select * from joined
      ) candidates
      group by campaign_id
    loop
      select * into v_campaign from growth.campaigns where id=v_candidate.campaign_id;
      if v_campaign.id is null
         or v_campaign.status<>'ACTIVE'
         or (v_campaign.starts_at is not null and v_campaign.starts_at>statement_timestamp())
         or (v_campaign.ends_at is not null and v_campaign.ends_at<=statement_timestamp())
         or not (coalesce(v_country,'NG')=any(v_campaign.country_codes)) then
        continue;
      end if;
      if coalesce((v_campaign.eligibility_rule->>'newUsersOnly')::boolean,false)
         and v_account_created<coalesce(v_campaign.starts_at,v_campaign.created_at) then
        continue;
      end if;

      select * into v_attribution from growth.attributions
      where attributed_user_id=p_user_id and campaign_id=v_campaign.id;

      for v_rule in
        select * from growth.reward_rules
        where campaign_id=v_campaign.id and active and trigger_event=v_event_type
        order by priority,id
      loop
        v_required:=coalesce(
          array(select upper(jsonb_array_elements_text(coalesce(v_rule.configuration->'requiredEvents','[]'::jsonb)))),
          array[]::text[]
        );
        v_required_count:=coalesce(array_length(v_required,1),0);
        if v_required_count>0 then
          select count(distinct event_type) into v_matched_count
          from growth.qualification_events
          where user_id=p_user_id
            and event_type=any(v_required)
            and occurred_at>=v_candidate.eligible_from
            and (v_campaign.ends_at is null or occurred_at<=v_campaign.ends_at);
          if v_matched_count<v_required_count then continue; end if;
        end if;

        v_beneficiary_user:=null;
        v_beneficiary_partner:=null;
        if v_rule.beneficiary_type='REFERRER' then
          v_beneficiary_user:=v_attribution.inviter_user_id;
        elsif v_rule.beneficiary_type='PARTNER' then
          v_beneficiary_partner:=v_attribution.partner_id;
        elsif v_rule.beneficiary_type='PARTICIPANT' then
          v_beneficiary_user:=p_user_id;
        else
          continue;
        end if;
        if v_beneficiary_user is null and v_beneficiary_partner is null then continue; end if;

        if v_rule.model='FIXED' then
          v_amount:=nullif(v_rule.configuration->>'amount','')::numeric;
        else
          continue;
        end if;
        if v_amount is null or v_amount<=0 or v_campaign.reward_asset_id is null then continue; end if;

        select available_amount into v_available from growth.campaign_budget_state where campaign_id=v_campaign.id;
        if coalesce(v_available,0)<v_amount then continue; end if;

        if v_campaign.per_user_reward_cap is not null and v_beneficiary_user is not null and
          coalesce((select sum(amount) from growth.reward_entitlements where campaign_id=v_campaign.id and beneficiary_user_id=v_beneficiary_user and status not in('REVERSED','DISQUALIFIED')),0)+v_amount>v_campaign.per_user_reward_cap then
          continue;
        end if;
        if v_campaign.per_user_qualification_cap is not null and v_beneficiary_user is not null and
          (select count(*) from growth.reward_entitlements where campaign_id=v_campaign.id and beneficiary_user_id=v_beneficiary_user and status not in('REVERSED','DISQUALIFIED'))>=v_campaign.per_user_qualification_cap then
          continue;
        end if;

        v_hold_days:=greatest(coalesce(nullif(v_rule.configuration->>'holdDays','')::integer,0),0);
        v_reward_public_id:=null;
        insert into growth.reward_entitlements(
          campaign_id,rule_id,attribution_id,beneficiary_user_id,beneficiary_partner_id,reward_kind,
          asset_id,amount,status,source_reference,hold_until,idempotency_key,metadata
        ) values(
          v_campaign.id,v_rule.id,v_attribution.id,v_beneficiary_user,v_beneficiary_partner,v_rule.reward_kind,
          v_campaign.reward_asset_id,v_amount,case when v_hold_days>0 then 'HELD' else 'EARNED' end,
          'qualification_event:'||v_event_id,
          case when v_hold_days>0 then statement_timestamp()+make_interval(days=>v_hold_days) else null end,
          'growth:'||v_rule.id||':'||p_user_id||':'||v_event_type,
          jsonb_build_object('qualifiedUserId',p_user_id,'qualificationEventId',v_event_id,'ruleCode',v_rule.rule_code)
        )
        on conflict(idempotency_key) do nothing
        returning public_id into v_reward_public_id;
        if v_reward_public_id is not null then
          v_created_rewards:=v_created_rewards||jsonb_build_array(v_reward_public_id);
        end if;
      end loop;
    end loop;
  end if;

  return jsonb_build_object('eventId',v_event_id,'created',v_created,'rewardPublicIds',v_created_rewards);
end;
$$;
revoke all on function public.internal_growth_record_qualification_event(uuid,text,uuid,text,text,timestamptz,jsonb,text) from public,anon,authenticated;
grant execute on function public.internal_growth_record_qualification_event(uuid,text,uuid,text,text,timestamptz,jsonb,text) to service_role;

create or replace function growth.capture_kyc_qualification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='VERIFIED' and (tg_op='INSERT' or old.status is distinct from 'VERIFIED') then
    perform public.internal_growth_record_qualification_event(new.user_id,'KYC_VERIFIED',new.public_id,'KYC_CASE',new.public_id::text,coalesce(new.completed_at,statement_timestamp()),coalesce(new.decision_metadata,'{}'::jsonb),'growth-kyc:'||new.public_id::text);
  end if;
  return new;
end;$$;
revoke all on function growth.capture_kyc_qualification() from public,anon,authenticated;
drop trigger if exists growth_capture_kyc_qualification on compliance.kyc_cases;
create trigger growth_capture_kyc_qualification after insert or update of status on compliance.kyc_cases for each row execute function growth.capture_kyc_qualification();

create or replace function growth.capture_wallet_funding_qualification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.operation='DEPOSIT' and new.status='SETTLED' and (tg_op='INSERT' or old.status is distinct from 'SETTLED') then
    perform public.internal_growth_record_qualification_event(new.user_id,'WALLET_FUNDED',new.public_id,'PAYMENT',new.public_id::text,coalesce(new.updated_at,statement_timestamp()),jsonb_build_object('amount',new.amount,'assetId',new.asset_id),'growth-wallet-funded:'||new.public_id::text);
  end if;
  return new;
end;$$;
revoke all on function growth.capture_wallet_funding_qualification() from public,anon,authenticated;
drop trigger if exists growth_capture_wallet_funding_qualification on payments.intents;
create trigger growth_capture_wallet_funding_qualification after insert or update of status on payments.intents for each row execute function growth.capture_wallet_funding_qualification();

create or replace function growth.capture_position_qualification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.quantity>0 and (tg_op='INSERT' or coalesce(old.quantity,0)<=0) then
    perform public.internal_growth_record_qualification_event(new.user_id,'POSITION_OPENED',null,'POSITION',new.instrument_id::text||':'||new.outcome_id::text,coalesce(new.updated_at,statement_timestamp()),jsonb_build_object('instrumentId',new.instrument_id,'outcomeId',new.outcome_id),'growth-position:'||new.user_id::text||':'||new.instrument_id::text||':'||new.outcome_id::text);
  end if;
  return new;
end;$$;
revoke all on function growth.capture_position_qualification() from public,anon,authenticated;
drop trigger if exists growth_capture_position_qualification on trading.positions;
create trigger growth_capture_position_qualification after insert or update of quantity on trading.positions for each row execute function growth.capture_position_qualification();

create or replace function growth.capture_settlement_qualification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform public.internal_growth_record_qualification_event(new.user_id,'MARKET_SETTLED',null,'SETTLEMENT',new.id::text,coalesce(new.created_at,statement_timestamp()),jsonb_build_object('entitlementId',new.id),'growth-settlement:'||new.id::text);
  return new;
end;$$;
revoke all on function growth.capture_settlement_qualification() from public,anon,authenticated;
drop trigger if exists growth_capture_settlement_qualification on settlement.entitlements;
create trigger growth_capture_settlement_qualification after insert on settlement.entitlements for each row execute function growth.capture_settlement_qualification();