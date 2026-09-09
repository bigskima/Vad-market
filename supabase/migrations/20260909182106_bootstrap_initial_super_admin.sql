create table if not exists admin.role_bootstrap_emails (
  email text primary key,
  role_id bigint not null references admin.roles (id),
  reason text not null check (char_length(reason) between 3 and 500),
  active boolean not null default true,
  claimed_by uuid references auth.users (id),
  claimed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint role_bootstrap_email_normalized check (email = lower(trim(email))),
  constraint role_bootstrap_claim_state check (
    (claimed_by is null and claimed_at is null)
    or (claimed_by is not null and claimed_at is not null)
  )
);

alter table admin.role_bootstrap_emails enable row level security;

revoke all on table admin.role_bootstrap_emails from public, anon, authenticated;
grant all on table admin.role_bootstrap_emails to service_role;

insert into admin.role_bootstrap_emails (email, role_id, reason, active)
select lower('skipprotocol@gmail.com'), r.id,
  'Initial VAD platform Super Admin bootstrap', true
from admin.roles r
where r.code = 'SUPER_ADMIN'
on conflict (email) do update
set
  role_id = excluded.role_id,
  reason = excluded.reason,
  active = case
    when admin.role_bootstrap_emails.claimed_by is null then true
    else admin.role_bootstrap_emails.active
  end;

create or replace function private.handle_bootstrap_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(new.email, '')));
  bootstrap_role_id bigint;
  bootstrap_reason text;
begin
  if normalized_email = '' then
    return new;
  end if;

  select b.role_id, b.reason
  into bootstrap_role_id, bootstrap_reason
  from admin.role_bootstrap_emails b
  where b.email = normalized_email
    and b.active
    and b.claimed_by is null
  for update;

  if bootstrap_role_id is null then
    return new;
  end if;

  insert into admin.user_roles (
    user_id, role_id, assigned_by, approved_by, reason, effective_at
  )
  values (
    new.id, bootstrap_role_id, null, null, bootstrap_reason, statement_timestamp()
  )
  on conflict (user_id, role_id)
    where revoked_at is null
  do nothing;

  update admin.role_bootstrap_emails
  set
    active = false,
    claimed_by = new.id,
    claimed_at = statement_timestamp()
  where email = normalized_email
    and claimed_by is null;

  return new;
end;
$$;

revoke all on function private.handle_bootstrap_admin()
from public, anon, authenticated, service_role;

drop trigger if exists on_auth_user_bootstrap_admin on auth.users;

create trigger on_auth_user_bootstrap_admin
after insert on auth.users
for each row execute function private.handle_bootstrap_admin();

with existing_target as (
  select u.id as user_id, b.email, b.role_id, b.reason
  from auth.users u
  join admin.role_bootstrap_emails b on lower(trim(u.email)) = b.email
  where b.active and b.claimed_by is null
)
insert into admin.user_roles (
  user_id, role_id, assigned_by, approved_by, reason, effective_at
)
select
  t.user_id, t.role_id, null, null, t.reason, statement_timestamp()
from existing_target t
on conflict (user_id, role_id)
  where revoked_at is null
do nothing;

update admin.role_bootstrap_emails b
set
  active = false,
  claimed_by = u.id,
  claimed_at = statement_timestamp()
from auth.users u
where b.active
  and b.claimed_by is null
  and lower(trim(u.email)) = b.email
  and exists (
    select 1
    from admin.user_roles ur
    where ur.user_id = u.id
      and ur.role_id = b.role_id
      and ur.revoked_at is null
  );
