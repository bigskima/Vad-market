create or replace function public.resolve_growth_code(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_code text:=upper(btrim(coalesce(p_code,'')));v_link growth.links;v_campaign growth.campaigns;v_partner growth.partners;
begin
 if v_code='' then return jsonb_build_object('valid',false); end if;
 select * into v_link from growth.links where code=v_code and status='ACTIVE' and (expires_at is null or expires_at>statement_timestamp());
 if v_link.id is null then return jsonb_build_object('valid',false); end if;
 if v_link.campaign_id is not null then select * into v_campaign from growth.campaigns where id=v_link.campaign_id; end if;
 if v_link.partner_id is not null then select * into v_partner from growth.partners where id=v_link.partner_id; end if;
 return jsonb_build_object('valid',true,'code',v_link.code,'kind',v_link.link_kind,'rewardable',v_link.rewardable,'destinationPath',v_link.destination_path,
 'campaign',case when v_campaign.id is null then null else jsonb_build_object('publicId',v_campaign.public_id,'name',v_campaign.name,'type',v_campaign.campaign_type,'status',v_campaign.status,'badgeText',v_campaign.badge_text,'heroImageUrl',v_campaign.hero_image_url,'cardImageUrl',v_campaign.card_image_url,'squareImageUrl',v_campaign.square_image_url,'shortDescription',v_campaign.short_description) end,
 'partner',case when v_partner.id is null then null else jsonb_build_object('publicId',v_partner.public_id,'displayName',v_partner.display_name,'type',v_partner.partner_type,'avatarUrl',v_partner.avatar_url) end);
end;$$;
grant execute on function public.resolve_growth_code(text) to anon,authenticated;

create or replace function public.my_growth_dashboard()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_link growth.links;v_code text;v_paused boolean:=false;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 begin v_paused:=coalesce((private.service_control_state('growth_rewards',v_user)->>'paused')::boolean,false); exception when others then v_paused:=false; end;
 select * into v_link from growth.links where owner_user_id=v_user and link_kind='INVITE' and status='ACTIVE' limit 1;
 if v_link.id is null then
   v_code:='VAD'||upper(substr(replace(v_user::text,'-',''),1,9));
   insert into growth.links(code,link_kind,owner_user_id,rewardable,status,destination_path,created_by) values(v_code,'INVITE',v_user,false,'ACTIVE','/welcome',v_user) on conflict(code) do nothing returning * into v_link;
   if v_link.id is null then select * into v_link from growth.links where owner_user_id=v_user and link_kind='INVITE' and status='ACTIVE' limit 1; end if;
 end if;
 return jsonb_build_object(
 'paused',v_paused,
 'invite',jsonb_build_object('code',v_link.code,'rewardable',false,'message','Inviting friends does not create a cash reward unless VAD runs a specific referral promotion.'),
 'activeCampaigns',coalesce((select jsonb_agg(jsonb_build_object('publicId',c.public_id,'code',c.code,'type',c.campaign_type,'name',c.name,'description',c.short_description,'rewardMode',c.reward_mode,'badgeText',c.badge_text,'heroImageUrl',c.hero_image_url,'cardImageUrl',c.card_image_url,'squareImageUrl',c.square_image_url,'sponsorName',c.sponsor_name,'startsAt',c.starts_at,'endsAt',c.ends_at,'visualConfig',c.visual_config) order by coalesce(c.starts_at,c.created_at) desc) from growth.campaigns c where c.status='ACTIVE' and (c.starts_at is null or c.starts_at<=statement_timestamp()) and (c.ends_at is null or c.ends_at>statement_timestamp()) and coalesce((select country_code from public.user_accounts where user_id=v_user),'NG')=any(c.country_codes)),'[]'::jsonb),
 'rewards',coalesce((select jsonb_agg(jsonb_build_object('publicId',r.public_id,'campaignPublicId',c.public_id,'campaignName',c.name,'kind',r.reward_kind,'assetCode',a.code,'amount',r.amount,'status',r.status,'createdAt',r.created_at) order by r.created_at desc) from growth.reward_entitlements r join growth.campaigns c on c.id=r.campaign_id join public.assets a on a.id=r.asset_id where r.beneficiary_user_id=v_user),'[]'::jsonb),
 'attribution',(select jsonb_build_object('campaignName',c.name,'partnerName',p.display_name,'code',l.code,'claimedAt',at.claimed_at) from growth.attributions at join growth.links l on l.id=at.link_id left join growth.campaigns c on c.id=at.campaign_id left join growth.partners p on p.id=at.partner_id where at.attributed_user_id=v_user),
 'partner',(select jsonb_build_object('publicId',p.public_id,'displayName',p.display_name,'status',p.status,'type',p.partner_type,'avatarUrl',p.avatar_url,'bannerUrl',p.banner_url) from growth.partners p where p.linked_user_id=v_user and p.status in('ACTIVE','PAUSED') limit 1));
end;$$;
grant execute on function public.my_growth_dashboard() to authenticated;

create or replace function public.claim_growth_code(p_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_code text:=upper(btrim(coalesce(p_code,'')));v_link growth.links;v_campaign growth.campaigns;v_existing growth.attributions;v_created timestamptz;v_id uuid;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select created_at into v_created from public.user_accounts where user_id=v_user;
 if v_created is null then raise exception 'Account not found' using errcode='P0002'; end if;
 select * into v_existing from growth.attributions where attributed_user_id=v_user;
 if v_existing.id is not null then raise exception 'An acquisition source is already attached to this account' using errcode='23505'; end if;
 select * into v_link from growth.links where code=v_code and status='ACTIVE' and (expires_at is null or expires_at>statement_timestamp());
 if v_link.id is null then raise exception 'This invite or partner code is not available' using errcode='P0002'; end if;
 if v_link.owner_user_id=v_user then raise exception 'You cannot use your own invite code' using errcode='22023'; end if;
 if v_link.campaign_id is not null then
   select * into v_campaign from growth.campaigns where id=v_link.campaign_id;
   if v_campaign.status not in('ACTIVE','SCHEDULED') then raise exception 'This promotion is not active' using errcode='22023'; end if;
   if statement_timestamp()>v_created+make_interval(days=>v_campaign.attribution_window_days) then raise exception 'This promotion can no longer be attached to this account' using errcode='22023'; end if;
 elsif statement_timestamp()>v_created+interval '30 days' then raise exception 'Invite attribution is available only for new accounts' using errcode='22023';
 end if;
 insert into growth.attributions(attributed_user_id,link_id,campaign_id,partner_id,inviter_user_id,attribution_model,source) values(v_user,v_link.id,v_link.campaign_id,v_link.partner_id,v_link.owner_user_id,coalesce(v_campaign.attribution_model,'LAST_TOUCH_BEFORE_SIGNUP'),'CODE') returning public_id into v_id;
 insert into audit.records(actor_user_id,actor_type,action,resource_type,resource_id,after_state,metadata) values(v_user,'USER','GROWTH_ATTRIBUTION_CLAIMED','GROWTH_ATTRIBUTION',v_id::text,jsonb_build_object('code',v_link.code,'kind',v_link.link_kind),jsonb_build_object('rewardable',v_link.rewardable));
 return jsonb_build_object('publicId',v_id,'code',v_link.code,'rewardable',v_link.rewardable,'message',case when v_link.rewardable then 'Promotion attached. Rewards are issued only after the campaign requirements are met.' else 'Invite source saved. This invite does not carry a cash reward.' end);
end;$$;
grant execute on function public.claim_growth_code(text) to authenticated;

create or replace function public.join_growth_campaign(p_campaign_public_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_campaign growth.campaigns;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 select * into v_campaign from growth.campaigns where public_id=p_campaign_public_id and status='ACTIVE' and (starts_at is null or starts_at<=statement_timestamp()) and (ends_at is null or ends_at>statement_timestamp());
 if v_campaign.id is null then raise exception 'This campaign is not open' using errcode='P0002'; end if;
 if v_campaign.campaign_type not in('CHALLENGE','SPONSORED','CREATOR','SEASONAL','EDUCATION') then raise exception 'This campaign does not require joining' using errcode='22023'; end if;
 insert into growth.campaign_participants(campaign_id,user_id) values(v_campaign.id,v_user) on conflict(campaign_id,user_id) do update set status=case when growth.campaign_participants.status='WITHDRAWN' then 'ACTIVE' else growth.campaign_participants.status end;
 return jsonb_build_object('joined',true,'campaignPublicId',v_campaign.public_id,'campaignName',v_campaign.name);
end;$$;
grant execute on function public.join_growth_campaign(uuid) to authenticated;
