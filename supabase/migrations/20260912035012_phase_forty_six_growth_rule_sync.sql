create or replace function growth.sync_primary_reward_rule()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_required text[];
  v_trigger text;
  v_amount numeric;
  v_hold_days integer;
  v_beneficiary text;
  v_reward_kind text;
begin
  update growth.reward_rules
     set active=false
   where campaign_id=new.id
     and rule_code='PRIMARY_REWARD';

  v_required:=coalesce(
    array(
      select upper(btrim(value))
      from jsonb_array_elements_text(coalesce(new.qualification_rule->'requiredEvents','[]'::jsonb)) value
      where btrim(value)<>''
    ),
    array[]::text[]
  );

  if coalesce(array_length(v_required,1),0)>0 then
    v_trigger:=v_required[array_length(v_required,1)];
  end if;

  v_amount:=nullif(new.reward_config->>'amount','')::numeric;
  v_hold_days:=greatest(coalesce(nullif(new.reward_config->>'holdDays','')::integer,0),0);

  if new.campaign_type='REFERRAL' then
    v_beneficiary:='REFERRER';
    v_reward_kind:='REFERRAL_REWARD';
  elsif new.campaign_type in('AFFILIATE','CREATOR') then
    v_beneficiary:='PARTNER';
    v_reward_kind:='AFFILIATE_COMMISSION';
  else
    v_beneficiary:='PARTICIPANT';
    v_reward_kind:=case
      when new.reward_mode='PROMOTIONAL_CREDIT' then 'PROMOTIONAL_CREDIT'
      when new.reward_mode='FEE_CREDIT' then 'FEE_CREDIT'
      else 'CAMPAIGN_REWARD'
    end;
  end if;

  if new.reward_mode in('FIXED_CPA','HYBRID','PROMOTIONAL_CREDIT','FEE_CREDIT')
     and coalesce(v_amount,0)>0
     and v_trigger is not null then
    insert into growth.reward_rules(
      campaign_id,rule_code,beneficiary_type,reward_kind,trigger_event,model,
      configuration,priority,active,created_by
    ) values(
      new.id,'PRIMARY_REWARD',v_beneficiary,v_reward_kind,v_trigger,'FIXED',
      jsonb_build_object(
        'amount',v_amount,
        'holdDays',v_hold_days,
        'requiredEvents',to_jsonb(v_required)
      ),100,true,coalesce(new.updated_by,new.created_by)
    )
    on conflict(campaign_id,rule_code) do update set
      beneficiary_type=excluded.beneficiary_type,
      reward_kind=excluded.reward_kind,
      trigger_event=excluded.trigger_event,
      model=excluded.model,
      configuration=excluded.configuration,
      priority=excluded.priority,
      active=true;
  end if;

  return new;
end;
$$;

revoke all on function growth.sync_primary_reward_rule() from public,anon,authenticated;

drop trigger if exists growth_campaign_primary_reward_sync on growth.campaigns;
create trigger growth_campaign_primary_reward_sync
after insert or update of campaign_type,reward_mode,reward_config,qualification_rule,updated_by
on growth.campaigns
for each row execute function growth.sync_primary_reward_rule();