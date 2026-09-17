-- Idempotent repository reconciliation for the live realtime/lifecycle repair.

alter table public.market_catalog
  add column if not exists opens_at timestamptz,
  add column if not exists resolution_status text,
  add column if not exists resolution_outcome text,
  add column if not exists resolution_finalized_at timestamptz;

create or replace function command.refresh_market_catalog(p_instrument_id bigint)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  instrument market.instruments;
  event market.canonical_events;
  asset public.assets;
  v_resolution oracle.resolutions;
  yes_outcome_id bigint;
  no_outcome_id bigint;
  yes_last numeric(38,18);
  no_last numeric(38,18);
  latest_fill timestamptz;
  v_liquidity_mode text;
  v_reference_price numeric(38,18);
begin
  select * into instrument from market.instruments where id=p_instrument_id;
  if instrument.id is null then return; end if;
  select * into event from market.canonical_events where id=instrument.canonical_event_id;
  select * into asset from public.assets where id=instrument.asset_id;
  select * into v_resolution
  from oracle.resolutions
  where event_id=event.id
  order by coalesce(finalized_at,created_at) desc,id desc
  limit 1;

  select id into yes_outcome_id from market.outcomes where instrument_id=instrument.id and code='YES';
  select id into no_outcome_id from market.outcomes where instrument_id=instrument.id and code='NO';

  select x.price into yes_last
  from (
    select f.price,f.created_at from trading.fills f where f.outcome_id=yes_outcome_id
    union all
    select se.price,se.created_at from trading.sandbox_executions se where se.outcome_id=yes_outcome_id
  ) x order by x.created_at desc limit 1;

  select x.price into no_last
  from (
    select f.price,f.created_at from trading.fills f where f.outcome_id=no_outcome_id
    union all
    select se.price,se.created_at from trading.sandbox_executions se where se.outcome_id=no_outcome_id
  ) x order by x.created_at desc limit 1;

  if yes_last is null and no_last is not null then yes_last:=round(instrument.settlement_unit-no_last,18); end if;
  if no_last is null and yes_last is not null then no_last:=round(instrument.settlement_unit-yes_last,18); end if;

  select max(x.created_at) into latest_fill
  from (
    select f.created_at from trading.fills f join trading.orders o on o.id=f.order_id where o.instrument_id=instrument.id
    union all
    select se.created_at from trading.sandbox_executions se where se.instrument_id=instrument.id
  ) x;

  if coalesce((asset.metadata->>'sandbox_only')::boolean,false)
     and coalesce((asset.metadata->>'sandbox_instant_liquidity')::boolean,false) then
    v_liquidity_mode:='SANDBOX_INSTANT';
    v_reference_price:=nullif(asset.metadata->>'sandbox_reference_price','')::numeric;
    if yes_last is null and v_reference_price is not null then
      yes_last:=v_reference_price;
      no_last:=round(instrument.settlement_unit-v_reference_price,18);
    end if;
  else
    v_liquidity_mode:=instrument.liquidity_model;
    v_reference_price:=null;
  end if;

  insert into public.market_catalog(
    instrument_public_id,event_public_id,title,category,asset_code,market_type,status,
    opens_at,closes_at,resolves_after,media_path,yes_price,no_price,last_trade_at,
    liquidity_mode,reference_price,resolution_status,resolution_outcome,resolution_finalized_at,updated_at
  ) values(
    instrument.public_id,event.public_id,event.title,event.category,asset.code,instrument.market_type,instrument.status,
    event.opens_at,event.closes_at,event.resolves_after,event.media_path,yes_last,no_last,latest_fill,
    v_liquidity_mode,v_reference_price,v_resolution.status,
    case when v_resolution.status in ('FINAL','VOID') then v_resolution.outcome_code else null end,
    v_resolution.finalized_at,statement_timestamp()
  )
  on conflict(instrument_public_id) do update set
    event_public_id=excluded.event_public_id,
    title=excluded.title,
    category=excluded.category,
    asset_code=excluded.asset_code,
    market_type=excluded.market_type,
    status=excluded.status,
    opens_at=excluded.opens_at,
    closes_at=excluded.closes_at,
    resolves_after=excluded.resolves_after,
    media_path=excluded.media_path,
    yes_price=excluded.yes_price,
    no_price=excluded.no_price,
    last_trade_at=excluded.last_trade_at,
    liquidity_mode=excluded.liquidity_mode,
    reference_price=excluded.reference_price,
    resolution_status=excluded.resolution_status,
    resolution_outcome=excluded.resolution_outcome,
    resolution_finalized_at=excluded.resolution_finalized_at,
    updated_at=statement_timestamp();
end;
$function$;

create table if not exists public.user_notifications (
  id bigint generated always as identity primary key,
  public_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  severity text not null default 'INFO' check (severity in ('INFO','SUCCESS','WARNING','DANGER')),
  market_public_id uuid,
  order_public_id uuid,
  data jsonb not null default '{}'::jsonb,
  idempotency_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default statement_timestamp()
);

create index if not exists user_notifications_user_time_idx
  on public.user_notifications(user_id,created_at desc);
create index if not exists user_notifications_unread_idx
  on public.user_notifications(user_id,created_at desc)
  where read_at is null;

alter table public.user_notifications enable row level security;

drop policy if exists user_notifications_select_own on public.user_notifications;
create policy user_notifications_select_own
on public.user_notifications for select
to authenticated
using ((select auth.uid())=user_id);

drop policy if exists user_notifications_update_own on public.user_notifications;
create policy user_notifications_update_own
on public.user_notifications for update
to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

revoke all on public.user_notifications from public,anon,authenticated;
grant select on public.user_notifications to authenticated;
grant update(read_at) on public.user_notifications to authenticated;
grant all on public.user_notifications to service_role;

create or replace function public.my_notifications(p_limit integer default 60)
returns table(
  public_id uuid,
  notification_type text,
  title text,
  body text,
  severity text,
  market_public_id uuid,
  order_public_id uuid,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path=''
as $function$
  select n.public_id,n.notification_type,n.title,n.body,n.severity,
         n.market_public_id,n.order_public_id,n.data,n.read_at,n.created_at
  from public.user_notifications n
  where n.user_id=auth.uid()
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,60),200));
$function$;

revoke all on function public.my_notifications(integer) from public,anon;
grant execute on function public.my_notifications(integer) to authenticated,service_role;

create or replace function public.mark_notification_read(p_notification_public_id uuid)
returns boolean
language plpgsql
security invoker
set search_path=''
as $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.user_notifications
  set read_at=coalesce(read_at,statement_timestamp())
  where public_id=p_notification_public_id and user_id=auth.uid();
  return found;
end;
$function$;

revoke all on function public.mark_notification_read(uuid) from public,anon;
grant execute on function public.mark_notification_read(uuid) to authenticated,service_role;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security invoker
set search_path=''
as $function$
declare v_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.user_notifications
  set read_at=statement_timestamp()
  where user_id=auth.uid() and read_at is null;
  get diagnostics v_count=row_count;
  return v_count;
end;
$function$;

revoke all on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated,service_role;

create or replace function private.enqueue_user_notification(
  p_user_id uuid,
  p_notification_type text,
  p_title text,
  p_body text,
  p_idempotency_key text,
  p_market_public_id uuid,
  p_order_public_id uuid,
  p_severity text,
  p_data jsonb
) returns uuid
language plpgsql
security definer
set search_path=''
as $function$
declare v_public_id uuid;
begin
  if p_user_id is null or not exists(select 1 from auth.users u where u.id=p_user_id) then return null; end if;
  insert into public.user_notifications(
    user_id,notification_type,title,body,idempotency_key,market_public_id,order_public_id,severity,data
  ) values(
    p_user_id,upper(btrim(p_notification_type)),btrim(p_title),btrim(p_body),p_idempotency_key,
    p_market_public_id,p_order_public_id,upper(coalesce(nullif(btrim(p_severity),''),'INFO')),coalesce(p_data,'{}'::jsonb)
  )
  on conflict(idempotency_key) do nothing
  returning public_id into v_public_id;
  if v_public_id is null then
    select public_id into v_public_id from public.user_notifications where idempotency_key=p_idempotency_key;
  end if;
  return v_public_id;
end;
$function$;

revoke all on function private.enqueue_user_notification(uuid,text,text,text,text,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function private.enqueue_user_notification(uuid,text,text,text,text,uuid,uuid,text,jsonb) to service_role;

create or replace function private.project_domain_event_notification(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id text,
  p_payload jsonb,
  p_event_key text
) returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_user_id uuid;
  v_instrument_id bigint;
  v_market_public_id uuid;
  v_event_id bigint;
  v_title text;
  v_asset_code text;
  v_outcome_code text;
  v_side text;
  v_order_public_id uuid;
  v_quantity numeric(38,18);
  v_price numeric(38,18);
  v_sandbox_instant boolean:=false;
  v_run_id bigint;
  v_resolution_outcome text;
  v_net numeric(38,18);
  v_participant record;
  v_market record;
begin
  if p_event_type='ORDER_PLACED' then
    select o.user_id,i.id,i.public_id,ce.title,a.code,mo.code,o.side,o.public_id,
           coalesce((a.metadata->>'sandbox_only')::boolean,false)
           and coalesce((a.metadata->>'sandbox_instant_liquidity')::boolean,false)
    into v_user_id,v_instrument_id,v_market_public_id,v_title,v_asset_code,v_outcome_code,
         v_side,v_order_public_id,v_sandbox_instant
    from trading.orders o
    join market.instruments i on i.id=o.instrument_id
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    join market.outcomes mo on mo.id=o.outcome_id
    where o.public_id::text=coalesce(nullif(p_payload->>'order_id',''),p_aggregate_id)
    limit 1;
    if v_user_id is null or (v_sandbox_instant and v_side='BUY') then return; end if;
    perform private.enqueue_user_notification(
      v_user_id,'ORDER_PLACED','Order placed',
      'Your '||v_outcome_code||' '||v_side||' order is live in '||v_title||'.',
      'notify:'||p_event_key||':'||v_user_id::text,v_market_public_id,v_order_public_id,'INFO',
      jsonb_build_object('assetCode',v_asset_code,'outcome',v_outcome_code,'side',v_side)
    );
    return;
  end if;

  if p_event_type='SANDBOX_ORDER_EXECUTED' then
    select se.user_id,i.id,i.public_id,ce.title,a.code,mo.code,o.public_id,se.quantity,se.price
    into v_user_id,v_instrument_id,v_market_public_id,v_title,v_asset_code,v_outcome_code,
         v_order_public_id,v_quantity,v_price
    from trading.sandbox_executions se
    join trading.orders o on o.id=se.order_id
    join market.instruments i on i.id=se.instrument_id
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    join market.outcomes mo on mo.id=se.outcome_id
    where se.public_id::text=p_aggregate_id
    limit 1;
    if v_user_id is null then return; end if;
    perform private.enqueue_user_notification(
      v_user_id,'TRADE_FILLED','Position opened',
      'Your '||v_outcome_code||' sandbox order filled and your position is now active.',
      'notify:'||p_event_key||':'||v_user_id::text,v_market_public_id,v_order_public_id,'SUCCESS',
      jsonb_build_object('assetCode',v_asset_code,'outcome',v_outcome_code,'quantity',v_quantity,'price',v_price)
    );
    return;
  end if;

  if p_event_type='MARKET_PUBLISHED' then
    select i.id,i.public_id,ce.id,ce.title,ce.originator_user_id,a.code
    into v_instrument_id,v_market_public_id,v_event_id,v_title,v_user_id,v_asset_code
    from market.instruments i
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    where i.public_id::text=coalesce(nullif(p_payload->>'instrument_public_id',''),p_aggregate_id)
    limit 1;
    if v_user_id is not null then
      perform private.enqueue_user_notification(
        v_user_id,'MARKET_OPENED','Market is live',
        'Trading has started for '||v_title||'.',
        'notify:'||p_event_key||':'||v_user_id::text,v_market_public_id,null,'INFO',
        jsonb_build_object('assetCode',v_asset_code)
      );
    end if;
    return;
  end if;

  if p_event_type='MARKET_CLOSED' then
    select i.id,i.public_id,ce.title,a.code
    into v_instrument_id,v_market_public_id,v_title,v_asset_code
    from market.instruments i
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    where i.public_id::text=p_aggregate_id
    limit 1;
    if v_instrument_id is null then return; end if;
    for v_participant in
      select distinct q.user_id from (
        select p.user_id from trading.positions p where p.instrument_id=v_instrument_id
        union
        select o.user_id from trading.orders o where o.instrument_id=v_instrument_id
      ) q
    loop
      perform private.enqueue_user_notification(
        v_participant.user_id,'MARKET_CLOSED','Trading closed',
        'Trading has closed for '||v_title||'. Result verification is next.',
        'notify:'||p_event_key||':'||v_participant.user_id::text,v_market_public_id,null,'INFO',
        jsonb_build_object('assetCode',v_asset_code)
      );
    end loop;
    return;
  end if;

  if p_event_type='MARKET_FINALIZED' then
    select ce.id,ce.title into v_event_id,v_title
    from market.canonical_events ce where ce.public_id::text=p_aggregate_id limit 1;
    if v_event_id is null then return; end if;
    v_resolution_outcome:=upper(coalesce(p_payload->>'outcome_code',''));
    for v_market in
      select i.id,i.public_id,a.code
      from market.instruments i join public.assets a on a.id=i.asset_id
      where i.canonical_event_id=v_event_id
    loop
      for v_participant in
        select distinct q.user_id from (
          select p.user_id from trading.positions p where p.instrument_id=v_market.id
          union
          select o.user_id from trading.orders o where o.instrument_id=v_market.id
        ) q
      loop
        perform private.enqueue_user_notification(
          v_participant.user_id,'MARKET_RESOLVED','Result confirmed: '||coalesce(nullif(v_resolution_outcome,''),'Final'),
          v_title||' has a final result. Eligible payouts are now being processed.',
          'notify:'||p_event_key||':'||v_market.public_id::text||':'||v_participant.user_id::text,
          v_market.public_id,null,'SUCCESS',
          jsonb_build_object('assetCode',v_market.code,'outcome',v_resolution_outcome)
        );
      end loop;
    end loop;
    return;
  end if;

  if p_event_type='SETTLEMENT_COMPLETED' then
    select sr.id,i.id,i.public_id,ce.title,a.code,r.outcome_code
    into v_run_id,v_instrument_id,v_market_public_id,v_title,v_asset_code,v_resolution_outcome
    from settlement.runs sr
    join market.instruments i on i.id=sr.instrument_id
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    join oracle.resolutions r on r.id=sr.resolution_id
    where sr.public_id::text=p_aggregate_id
    limit 1;
    if v_run_id is null then return; end if;
    for v_participant in
      select distinct p.user_id from trading.positions p where p.instrument_id=v_instrument_id
    loop
      select coalesce(sum(e.net_amount),0) into v_net
      from settlement.entitlements e
      where e.run_id=v_run_id and e.user_id=v_participant.user_id;
      if v_net>0 then
        perform private.enqueue_user_notification(
          v_participant.user_id,'PAYOUT_CREDITED','You won — payout credited',
          'Result: '||coalesce(v_resolution_outcome,'FINAL')||'. Your '||v_asset_code||' payout has been credited to your VAD wallet.',
          'notify:'||p_event_key||':'||v_participant.user_id::text||':payout',
          v_market_public_id,null,'SUCCESS',
          jsonb_build_object('assetCode',v_asset_code,'outcome',v_resolution_outcome,'netAmount',v_net)
        );
      else
        perform private.enqueue_user_notification(
          v_participant.user_id,'SETTLEMENT_LOST','Market settled',
          'Result: '||coalesce(v_resolution_outcome,'FINAL')||'. Your position did not win this market.',
          'notify:'||p_event_key||':'||v_participant.user_id::text||':loss',
          v_market_public_id,null,'INFO',
          jsonb_build_object('assetCode',v_asset_code,'outcome',v_resolution_outcome)
        );
      end if;
    end loop;
  end if;
end;
$function$;

revoke all on function private.project_domain_event_notification(text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.project_domain_event_notification(text,text,text,jsonb,text) to service_role;

create or replace function private.project_domain_event_notification_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  perform private.project_domain_event_notification(
    new.event_type,new.aggregate_type,new.aggregate_id,new.payload,new.idempotency_key
  );
  return new;
end;
$function$;

revoke all on function private.project_domain_event_notification_trigger() from public,anon,authenticated;
drop trigger if exists domain_event_user_notification_projection on eventing.domain_events;
create trigger domain_event_user_notification_projection
after insert on eventing.domain_events
for each row execute function private.project_domain_event_notification_trigger();

create or replace function command.sync_instrument_runtime_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.status is distinct from old.status then
    perform command.refresh_market_catalog(new.id);
    if new.status='CLOSED' and old.status in ('OPEN','SUSPENDED') then
      insert into eventing.domain_events(event_type,aggregate_type,aggregate_id,payload,idempotency_key)
      values(
        'MARKET_CLOSED','MARKET',new.public_id::text,
        jsonb_build_object('instrument_id',new.public_id,'closed_at',new.closed_at),
        'market-closed:'||new.public_id::text
      ) on conflict(idempotency_key) do nothing;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function command.sync_instrument_runtime_state() from public,anon,authenticated;
drop trigger if exists instrument_runtime_state_sync on market.instruments;
create trigger instrument_runtime_state_sync
after update of status on market.instruments
for each row
when (old.status is distinct from new.status)
execute function command.sync_instrument_runtime_state();

create or replace function private.enqueue_market_closing_soon_notifications()
returns integer
language plpgsql
security definer
set search_path=''
as $function$
declare
  rec record;
  participant record;
  v_count integer:=0;
  v_created uuid;
begin
  for rec in
    select i.id,i.public_id,ce.title,ce.closes_at,a.code as asset_code
    from market.instruments i
    join market.canonical_events ce on ce.id=i.canonical_event_id
    join public.assets a on a.id=i.asset_id
    where i.status='OPEN'
      and ce.closes_at>statement_timestamp()
      and ce.closes_at<=statement_timestamp()+interval '5 minutes'
  loop
    for participant in
      select distinct q.user_id from (
        select p.user_id from trading.positions p where p.instrument_id=rec.id
        union
        select o.user_id from trading.orders o where o.instrument_id=rec.id and o.status in ('OPEN','PARTIALLY_FILLED','FILLED')
      ) q
    loop
      v_created:=private.enqueue_user_notification(
        participant.user_id,'MARKET_CLOSING_SOON','Market closes soon',
        rec.title||' closes in less than 5 minutes.',
        'market-closing-soon:'||rec.public_id::text||':'||participant.user_id::text,
        rec.public_id,null,'WARNING',jsonb_build_object('assetCode',rec.asset_code,'closesAt',rec.closes_at)
      );
      if v_created is not null then v_count:=v_count+1; end if;
    end loop;
  end loop;
  return v_count;
end;
$function$;

revoke all on function private.enqueue_market_closing_soon_notifications() from public,anon,authenticated;
grant execute on function private.enqueue_market_closing_soon_notifications() to service_role;

do $block$
declare r record;
begin
  for r in select jobid from cron.job where jobname='vad-market-closing-notifications' loop
    perform cron.unschedule(r.jobid);
  end loop;
  perform cron.schedule('vad-market-closing-notifications','* * * * *','select private.enqueue_market_closing_soon_notifications();');
end;
$block$;

do $block$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') then
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='market_catalog'
    ) then
      alter publication supabase_realtime add table public.market_catalog;
    end if;
    if not exists(
      select 1 from pg_publication_tables
      where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications'
    ) then
      alter publication supabase_realtime add table public.user_notifications;
    end if;
  end if;
end;
$block$;

do $block$
declare v_id bigint;
begin
  for v_id in select id from market.instruments loop
    perform command.refresh_market_catalog(v_id);
  end loop;
end;
$block$;
