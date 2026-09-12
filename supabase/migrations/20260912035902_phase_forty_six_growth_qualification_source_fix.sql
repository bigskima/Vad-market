create or replace function growth.capture_kyc_qualification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='VERIFIED' and (tg_op='INSERT' or old.status is distinct from 'VERIFIED') then
    perform public.internal_growth_record_qualification_event(
      new.user_id,'KYC_VERIFIED',null,'KYC_CASE',new.public_id::text,
      coalesce(new.completed_at,statement_timestamp()),coalesce(new.decision_metadata,'{}'::jsonb),
      'growth-kyc:'||new.public_id::text
    );
  end if;
  return new;
end;$$;
revoke all on function growth.capture_kyc_qualification() from public,anon,authenticated;

create or replace function growth.capture_wallet_funding_qualification()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.operation='DEPOSIT' and new.status='SETTLED' and (tg_op='INSERT' or old.status is distinct from 'SETTLED') then
    perform public.internal_growth_record_qualification_event(
      new.user_id,'WALLET_FUNDED',null,'PAYMENT',new.public_id::text,
      coalesce(new.updated_at,statement_timestamp()),jsonb_build_object('amount',new.amount,'assetId',new.asset_id),
      'growth-wallet-funded:'||new.public_id::text
    );
  end if;
  return new;
end;$$;
revoke all on function growth.capture_wallet_funding_qualification() from public,anon,authenticated;