-- Phase 25: turn the VAD operations workspace into an auditable control plane.
-- Destructive-looking content actions are soft moderation actions so evidence,
-- disputes and audit history remain intact. Financial refunds are created as
-- provider-facing refund requests; ledger/provider settlement remains explicit.

insert into admin.permissions(code, description)
values
  ('users.manage', 'Restrict, suspend, ban, reactivate and deactivate user accounts.'),
  ('payments.refund', 'Create auditable refund requests for eligible settled deposits.')
on conflict (code) do update set description = excluded.description;

insert into admin.role_permissions(role_id, permission_id)
select r.id, p.id
from admin.roles r
join admin.permissions p on (
  (r.code = 'RISK_ADMIN' and p.code = 'users.manage')
  or (r.code = 'FINANCE_ADMIN' and p.code = 'payments.refund')
  or (r.code = 'SUPER_ADMIN' and p.code in ('users.manage', 'payments.refund'))
)
on conflict do nothing;

create or replace function public.admin_my_access()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  with active_roles as (
    select distinct r.code, r.name
    from admin.user_roles ur
    join admin.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid()
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
  ), active_permissions as (
    select distinct p.code
    from admin.user_roles ur
    join admin.role_permissions rp on rp.role_id = ur.role_id
    join admin.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
  )
  select jsonb_build_object(
    'roles', coalesce((select jsonb_agg(jsonb_build_object('code', code, 'name', name) order by code) from active_roles), '[]'::jsonb),
    'permissions', coalesce((select jsonb_agg(code order by code) from active_permissions), '[]'::jsonb),
    'isSuperAdmin', exists(select 1 from active_roles where code = 'SUPER_ADMIN')
  );
$$;

revoke all on function public.admin_my_access() from public, anon;
grant execute on function public.admin_my_access() to authenticated, service_role;

create or replace function command.release_open_orders_for_user(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  ord trading.orders;
  cash_res trading.order_reservations;
  share_res trading.share_reservations;
  instrument market.instruments;
  available_account bigint;
  releasable numeric(38,18);
  shares_releasable numeric(38,18);
  released_count integer := 0;
begin
  for ord in
    select *
    from trading.orders
    where user_id = p_user_id
      and status in ('OPEN', 'PARTIALLY_FILLED')
    for update
  loop
    select * into instrument
    from market.instruments
    where id = ord.instrument_id;

    if ord.side = 'BUY' then
      select * into cash_res
      from trading.order_reservations
      where order_id = ord.id
      for update;

      releasable := coalesce(
        cash_res.initial_reserved - cash_res.consumed_notional - cash_res.released_notional,
        0
      );

      if cash_res.order_id is not null and releasable > 0 then
        available_account := finance.ensure_user_account(
          p_user_id,
          instrument.asset_id,
          'USER_AVAILABLE'
        );

        perform finance.transfer(
          instrument.asset_id,
          cash_res.reserved_account_id,
          available_account,
          releasable,
          'ADMIN_ACCOUNT_RESTRICTION_RELEASE',
          'admin-account-release:' || ord.public_id::text,
          'ORDER',
          ord.public_id::text,
          'Release unused order cash after account restriction',
          auth.uid()
        );

        update trading.order_reservations
        set released_notional = released_notional + releasable
        where order_id = ord.id;
      end if;
    else
      select * into share_res
      from trading.share_reservations
      where order_id = ord.id
      for update;

      shares_releasable := coalesce(
        share_res.initial_quantity - share_res.consumed_quantity - share_res.released_quantity,
        0
      );

      if share_res.order_id is not null and shares_releasable > 0 then
        update trading.share_reservations
        set released_quantity = released_quantity + shares_releasable
        where order_id = ord.id;
      end if;
    end if;

    update trading.orders
    set status = 'CANCELLED', updated_at = statement_timestamp()
    where id = ord.id;

    insert into eventing.domain_events(
      event_type,
      aggregate_type,
      aggregate_id,
      payload,
      idempotency_key
    ) values (
      'ORDER_CANCELLED_BY_ACCOUNT_ACTION',
      'ORDER',
      ord.public_id::text,
      jsonb_build_object(
        'order_id', ord.public_id,
        'user_id', p_user_id,
        'released_cash', coalesce(releasable, 0),
        'released_shares', coalesce(shares_releasable, 0),
        'admin_user_id', auth.uid()
      ),
      'admin-account-order-cancelled:' || ord.public_id::text
    ) on conflict(idempotency_key) do nothing;

    released_count := released_count + 1;
    releasable := 0;
    shares_releasable := 0;
  end loop;

  return released_count;
end;
$$;

revoke all on function command.release_open_orders_for_user(uuid) from public, anon, authenticated;
grant execute on function command.release_open_orders_for_user(uuid) to service_role;

create or replace function public.admin_user_queue(
  p_limit integer default 100,
  p_search text default null
)
returns table(
  user_id uuid,
  email text,
  display_name text,
  handle text,
  status text,
  country_code text,
  created_at timestamptz,
  latest_action_reason text,
  latest_action_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('users.manage')
     and not private.has_permission('support.read')
     and not private.has_permission('admin.roles.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  return query
  select
    ua.user_id,
    u.email::text,
    p.display_name,
    p.handle,
    ua.status,
    ua.country_code,
    ua.created_at,
    last_action.reason,
    last_action.occurred_at
  from public.user_accounts ua
  join auth.users u on u.id = ua.user_id
  left join public.profiles p on p.user_id = ua.user_id
  left join lateral (
    select ar.reason, ar.occurred_at
    from audit.records ar
    where ar.resource_type = 'USER_ACCOUNT'
      and ar.resource_id = ua.user_id::text
      and ar.action = 'USER_STATUS_CHANGE'
    order by ar.occurred_at desc
    limit 1
  ) last_action on true
  where p_search is null
     or trim(p_search) = ''
     or lower(coalesce(u.email, '')) like '%' || lower(trim(p_search)) || '%'
     or lower(coalesce(p.display_name, '')) like '%' || lower(trim(p_search)) || '%'
     or lower(coalesce(p.handle, '')) like '%' || lower(trim(p_search)) || '%'
     or ua.user_id::text = trim(p_search)
  order by
    case ua.status
      when 'UNDER_REVIEW' then 0
      when 'RESTRICTED' then 1
      when 'SUSPENDED' then 2
      when 'BANNED' then 3
      else 4
    end,
    ua.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.admin_user_queue(integer,text) from public, anon;
grant execute on function public.admin_user_queue(integer,text) to authenticated, service_role;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.user_accounts;
  next_status text := upper(trim(coalesce(p_status, '')));
  actor_is_super boolean;
  target_is_super boolean;
  remaining_active_supers integer;
  cancelled_orders integer := 0;
begin
  if not private.has_permission('users.manage') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if p_user_id is null then
    raise exception 'User is required' using errcode = '22023';
  end if;

  if p_user_id = actor_id then
    raise exception 'You cannot change your own account status from Operations' using errcode = '42501';
  end if;

  if next_status not in ('ACTIVE','RESTRICTED','SUSPENDED','BANNED','DEACTIVATED','UNDER_REVIEW') then
    raise exception 'Invalid account status' using errcode = '22023';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(trim(p_reason)) > 500 then
    raise exception 'A reason between 3 and 500 characters is required' using errcode = '22023';
  end if;

  select * into target
  from public.user_accounts
  where user_id = p_user_id
  for update;

  if target.user_id is null then
    raise exception 'User account not found' using errcode = 'P0002';
  end if;

  select exists(
    select 1
    from admin.user_roles ur
    join admin.roles r on r.id = ur.role_id
    where ur.user_id = actor_id
      and r.code = 'SUPER_ADMIN'
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
  ) into actor_is_super;

  select exists(
    select 1
    from admin.user_roles ur
    join admin.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id
      and r.code = 'SUPER_ADMIN'
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
  ) into target_is_super;

  if target_is_super and not actor_is_super then
    raise exception 'Only a Super Admin can change another Super Admin account' using errcode = '42501';
  end if;

  if target_is_super and next_status <> 'ACTIVE' then
    select count(*)::integer into remaining_active_supers
    from admin.user_roles ur
    join admin.roles r on r.id = ur.role_id
    join public.user_accounts ua on ua.user_id = ur.user_id
    where r.code = 'SUPER_ADMIN'
      and ur.user_id <> p_user_id
      and ur.effective_at <= statement_timestamp()
      and (ur.expires_at is null or ur.expires_at > statement_timestamp())
      and ur.revoked_at is null
      and ua.status = 'ACTIVE';

    if remaining_active_supers < 1 then
      raise exception 'At least one active Super Admin must remain' using errcode = 'P0001';
    end if;
  end if;

  if target.status = next_status then
    return true;
  end if;

  if next_status in ('SUSPENDED','BANNED','DEACTIVATED') then
    cancelled_orders := command.release_open_orders_for_user(p_user_id);
  end if;

  update public.user_accounts
  set status = next_status, updated_at = statement_timestamp()
  where user_id = p_user_id;

  insert into audit.records(
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    before_state,
    after_state,
    reason,
    metadata
  ) values (
    actor_id,
    'USER',
    'USER_STATUS_CHANGE',
    'USER_ACCOUNT',
    p_user_id::text,
    jsonb_build_object('status', target.status),
    jsonb_build_object('status', next_status),
    trim(p_reason),
    jsonb_build_object('cancelled_open_orders', cancelled_orders)
  );

  insert into eventing.domain_events(
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    idempotency_key
  ) values (
    'USER_ACCOUNT_STATUS_CHANGED',
    'USER_ACCOUNT',
    p_user_id::text,
    jsonb_build_object(
      'from', target.status,
      'to', next_status,
      'reason', trim(p_reason),
      'actor_user_id', actor_id,
      'cancelled_open_orders', cancelled_orders
    ),
    'user-status:' || p_user_id::text || ':' || extract(epoch from statement_timestamp())::bigint::text
  );

  return true;
end;
$$;

revoke all on function public.admin_set_user_status(uuid,text,text) from public, anon;
grant execute on function public.admin_set_user_status(uuid,text,text) to authenticated, service_role;

create or replace function public.admin_content_queue(
  p_limit integer default 100,
  p_status text default null
)
returns table(
  content_type text,
  content_public_id uuid,
  post_public_id uuid,
  author_user_id uuid,
  author_name text,
  author_handle text,
  body text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_filter text := nullif(upper(trim(coalesce(p_status, ''))), '');
begin
  if not private.has_permission('content.moderate') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if status_filter is not null and status_filter not in ('PUBLISHED','REMOVED') then
    raise exception 'Invalid moderation status filter' using errcode = '22023';
  end if;

  return query
  with content as (
    select
      'POST'::text as content_type,
      sp.public_id as content_public_id,
      sp.public_id as post_public_id,
      sp.author_user_id,
      coalesce(pr.display_name, pr.handle, 'VAD member')::text as author_name,
      pr.handle as author_handle,
      sp.body,
      sp.status,
      sp.created_at
    from social.posts sp
    left join public.profiles pr on pr.user_id = sp.author_user_id
    where sp.status in ('PUBLISHED','REMOVED')

    union all

    select
      'COMMENT'::text,
      sc.public_id,
      sp.public_id,
      sc.author_user_id,
      coalesce(pr.display_name, pr.handle, 'VAD member')::text,
      pr.handle,
      sc.body,
      sc.status,
      sc.created_at
    from social.comments sc
    join social.posts sp on sp.id = sc.post_id
    left join public.profiles pr on pr.user_id = sc.author_user_id
    where sc.status in ('PUBLISHED','REMOVED')
  )
  select
    c.content_type,
    c.content_public_id,
    c.post_public_id,
    c.author_user_id,
    c.author_name,
    c.author_handle,
    c.body,
    c.status,
    c.created_at
  from content c
  where status_filter is null or c.status = status_filter
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.admin_content_queue(integer,text) from public, anon;
grant execute on function public.admin_content_queue(integer,text) to authenticated, service_role;

create or replace function public.admin_set_content_status(
  p_content_type text,
  p_content_public_id uuid,
  p_status text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := upper(trim(coalesce(p_content_type, '')));
  next_status text := upper(trim(coalesce(p_status, '')));
  previous_status text;
  author_id uuid;
  content_body text;
begin
  if not private.has_permission('content.moderate') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if kind not in ('POST','COMMENT') then
    raise exception 'Invalid content type' using errcode = '22023';
  end if;

  if next_status not in ('PUBLISHED','REMOVED') then
    raise exception 'Invalid content status' using errcode = '22023';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(trim(p_reason)) > 500 then
    raise exception 'A moderation reason between 3 and 500 characters is required' using errcode = '22023';
  end if;

  if kind = 'POST' then
    select status, author_user_id, body
      into previous_status, author_id, content_body
    from social.posts
    where public_id = p_content_public_id
    for update;

    if previous_status is null then
      raise exception 'Post not found' using errcode = 'P0002';
    end if;
    if previous_status = 'DRAFT' then
      raise exception 'User drafts cannot be moderated from Operations' using errcode = 'P0001';
    end if;

    update social.posts
    set status = next_status, updated_at = statement_timestamp()
    where public_id = p_content_public_id;
  else
    select status, author_user_id, body
      into previous_status, author_id, content_body
    from social.comments
    where public_id = p_content_public_id
    for update;

    if previous_status is null then
      raise exception 'Comment not found' using errcode = 'P0002';
    end if;

    update social.comments
    set status = next_status, updated_at = statement_timestamp()
    where public_id = p_content_public_id;
  end if;

  if previous_status = next_status then
    return true;
  end if;

  insert into audit.records(
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    before_state,
    after_state,
    reason,
    metadata
  ) values (
    auth.uid(),
    'USER',
    case when next_status = 'REMOVED' then 'CONTENT_REMOVED' else 'CONTENT_RESTORED' end,
    'SOCIAL_' || kind,
    p_content_public_id::text,
    jsonb_build_object('status', previous_status),
    jsonb_build_object('status', next_status),
    trim(p_reason),
    jsonb_build_object(
      'author_user_id', author_id,
      'body_preview', left(content_body, 240)
    )
  );

  insert into eventing.domain_events(
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    idempotency_key
  ) values (
    case when next_status = 'REMOVED' then 'SOCIAL_CONTENT_REMOVED' else 'SOCIAL_CONTENT_RESTORED' end,
    'SOCIAL_' || kind,
    p_content_public_id::text,
    jsonb_build_object(
      'content_type', kind,
      'author_user_id', author_id,
      'status', next_status,
      'actor_user_id', auth.uid()
    ),
    'content-status:' || p_content_public_id::text || ':' || next_status || ':' || extract(epoch from statement_timestamp())::bigint::text
  );

  return true;
end;
$$;

revoke all on function public.admin_set_content_status(text,uuid,text,text) from public, anon;
grant execute on function public.admin_set_content_status(text,uuid,text,text) to authenticated, service_role;

create or replace function public.admin_request_refund(
  p_intent_public_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  original payments.intents;
  existing payments.intents;
  refund payments.intents;
begin
  if not private.has_permission('payments.refund') then
    raise exception 'Permission required' using errcode = '42501';
  end if;

  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(trim(p_reason)) > 500 then
    raise exception 'A refund reason between 3 and 500 characters is required' using errcode = '22023';
  end if;

  select * into original
  from payments.intents
  where public_id = p_intent_public_id
  for update;

  if original.id is null then
    raise exception 'Payment intent not found' using errcode = 'P0002';
  end if;

  if original.operation <> 'DEPOSIT' or original.status <> 'SETTLED' then
    raise exception 'Only settled deposits can enter the refund workflow' using errcode = 'P0001';
  end if;

  if original.provider_id is null then
    raise exception 'The original payment has no provider route to refund' using errcode = 'P0001';
  end if;

  select * into existing
  from payments.intents
  where operation = 'REFUND'
    and provider_payload->>'originalIntentPublicId' = original.public_id::text
  order by created_at desc
  limit 1;

  if existing.id is not null then
    return existing.public_id;
  end if;

  insert into payments.intents(
    user_id,
    asset_id,
    operation,
    amount,
    fee_amount,
    net_amount,
    provider_id,
    provider_payload,
    status,
    idempotency_key
  ) values (
    original.user_id,
    original.asset_id,
    'REFUND',
    original.amount,
    0,
    original.amount,
    original.provider_id,
    jsonb_build_object(
      'originalIntentPublicId', original.public_id,
      'originalAmount', original.amount,
      'originalFeeAmount', original.fee_amount,
      'originalNetAmount', original.net_amount,
      'requestedBy', auth.uid(),
      'reason', trim(p_reason)
    ),
    'CREATED',
    'admin-refund:' || original.public_id::text
  ) returning * into refund;

  insert into audit.records(
    actor_user_id,
    actor_type,
    action,
    resource_type,
    resource_id,
    before_state,
    after_state,
    reason,
    metadata
  ) values (
    auth.uid(),
    'USER',
    'PAYMENT_REFUND_REQUESTED',
    'PAYMENT_INTENT',
    original.public_id::text,
    jsonb_build_object('status', original.status, 'operation', original.operation),
    jsonb_build_object('refund_intent_public_id', refund.public_id, 'refund_status', refund.status),
    trim(p_reason),
    jsonb_build_object('user_id', original.user_id, 'amount', original.amount)
  );

  insert into eventing.domain_events(
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    idempotency_key
  ) values (
    'PAYMENT_REFUND_REQUESTED',
    'PAYMENT_INTENT',
    refund.public_id::text,
    jsonb_build_object(
      'refund_intent_public_id', refund.public_id,
      'original_intent_public_id', original.public_id,
      'user_id', original.user_id,
      'asset_id', original.asset_id,
      'amount', original.amount,
      'provider_id', original.provider_id,
      'requested_by', auth.uid()
    ),
    'payment-refund-requested:' || original.public_id::text
  ) on conflict(idempotency_key) do nothing;

  return refund.public_id;
end;
$$;

revoke all on function public.admin_request_refund(uuid,text) from public, anon;
grant execute on function public.admin_request_refund(uuid,text) to authenticated, service_role;
