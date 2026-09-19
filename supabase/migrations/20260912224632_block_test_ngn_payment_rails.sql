create or replace function public.payment_quote(p_operation text, p_asset_code text, p_amount numeric)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare acct public.user_accounts; asset public.assets; op text:=upper(trim(coalesce(p_operation,''))); provider_id bigint; provider_code text; provider_environment text; access_policy jsonb; fee_policy jsonb; limit_policy jsonb; required_level text; min_amount numeric; max_amount numeric; rate_bps numeric; minimum_fee numeric; fee numeric; cap_key text;
begin
  acct:=private.require_active_account();
  if op not in ('DEPOSIT','WITHDRAWAL') then raise exception 'Unsupported payment operation' using errcode='22023'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'Amount must be positive' using errcode='22023'; end if;
  select * into asset from public.assets where code=upper(p_asset_code) and status='ACTIVE' limit 1;
  if asset.id is null then raise exception 'Asset not available' using errcode='P0002'; end if;
  if coalesce((asset.metadata->>'sandbox_only')::boolean,false) or coalesce((asset.metadata->>'non_withdrawable')::boolean,false) then
    return jsonb_build_object('enabled',false,'reason','SANDBOX_ASSET','operation',op,'assetCode',asset.code,'amount',p_amount,'message','Test NGN is synthetic sandbox currency and cannot be deposited or withdrawn.');
  end if;
  if not exists(select 1 from public.jurisdictions j join public.jurisdiction_assets ja on ja.jurisdiction_id=j.id where j.country_code=acct.country_code and j.status='ACTIVE' and ja.asset_id=asset.id and ja.status='ACTIVE') then return jsonb_build_object('enabled',false,'reason','ASSET_NOT_AVAILABLE','operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  cap_key:=case op when 'DEPOSIT' then 'deposit' else 'withdraw' end;
  if not private.capability_enabled(cap_key,acct.country_code) then return jsonb_build_object('enabled',false,'reason','CAPABILITY_DISABLED','operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  access_policy:=coalesce(private.active_policy_configuration('KYC','payment_access'),'{}'::jsonb); fee_policy:=coalesce(private.active_policy_configuration('FEES','payment_fees'),'{}'::jsonb); limit_policy:=coalesce(private.active_policy_configuration('LIMITS','payment_limits'),'{}'::jsonb);
  required_level:=coalesce(access_policy->>(case op when 'DEPOSIT' then 'deposit_min_level' else 'withdrawal_min_level' end),'NONE');
  min_amount:=coalesce((limit_policy->>(case op when 'DEPOSIT' then 'deposit_min' else 'withdrawal_min' end))::numeric,0); max_amount:=(limit_policy->>(case op when 'DEPOSIT' then 'deposit_max' else 'withdrawal_max' end))::numeric;
  if p_amount<min_amount then return jsonb_build_object('enabled',false,'reason','BELOW_MINIMUM','minimum',min_amount,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  if max_amount is not null and p_amount>max_amount then return jsonb_build_object('enabled',false,'reason','ABOVE_MAXIMUM','maximum',max_amount,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  provider_id:=command.select_provider(op,acct.country_code,asset.id,p_amount);
  if provider_id is null then return jsonb_build_object('enabled',false,'reason','NO_PAYMENT_PROVIDER','operation',op,'assetCode',asset.code,'amount',p_amount,'requiredKycLevel',required_level); end if;
  select code,environment into provider_code,provider_environment from integration.providers where id=provider_id;
  if not private.kyc_access_satisfies(auth.uid(),required_level,provider_environment) then return jsonb_build_object('enabled',false,'reason','KYC_REQUIRED','requiredKycLevel',required_level,'operation',op,'assetCode',asset.code,'amount',p_amount); end if;
  rate_bps:=coalesce((fee_policy->>(case op when 'DEPOSIT' then 'deposit_rate_bps' else 'withdrawal_rate_bps' end))::numeric,0); minimum_fee:=coalesce((fee_policy->>(case op when 'DEPOSIT' then 'deposit_minimum_fee' else 'withdrawal_minimum_fee' end))::numeric,0); fee:=greatest(round((p_amount*rate_bps/10000)::numeric,18),minimum_fee);
  if fee>p_amount then raise exception 'Fee exceeds amount' using errcode='22023'; end if;
  return jsonb_build_object('enabled',true,'reason',null,'operation',op,'assetCode',asset.code,'amount',p_amount,'feeAmount',fee,'netAmount',p_amount-fee,'providerCode',provider_code,'providerEnvironment',provider_environment,'requiredKycLevel',required_level);
end;
$$;