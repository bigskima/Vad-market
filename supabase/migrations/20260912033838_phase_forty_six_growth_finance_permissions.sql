insert into admin.permissions(code,description) values
('growth.funding.request','Request reservation of campaign reward budgets'),
('growth.payout.approve','Approve campaign reward payouts'),
('growth.payout.reverse','Reverse a paid campaign reward when a correction is required')
on conflict(code) do update set description=excluded.description;

insert into admin.roles(code,name,description,is_system) values
('GROWTH_FINANCE_REVIEWER','Growth Finance Reviewer','Independently review campaign budgets and reward payments.',true)
on conflict(code) do update set name=excluded.name,description=excluded.description;

insert into admin.role_permissions(role_id,permission_id)
select r.id,p.id from admin.roles r join admin.permissions p on
(r.code='GROWTH_MANAGER' and p.code='growth.funding.request') or
(r.code='GROWTH_FINANCE_REVIEWER' and p.code in ('growth.read','growth.finance','growth.payout.approve','growth.payout.reverse','finance.read','finance.journals.post')) or
(r.code='SUPER_ADMIN' and p.code in ('growth.funding.request','growth.payout.approve','growth.payout.reverse'))
where r.code in ('GROWTH_MANAGER','GROWTH_FINANCE_REVIEWER','SUPER_ADMIN')
on conflict do nothing;

insert into control.services(service_key,name,description,category,default_enabled,user_scopable,inherits_app_pause,status)
values('growth_payouts','Campaign reward payouts','Campaign budget reservations and reward payments.','Money',true,false,true,'ACTIVE')
on conflict(service_key) do update set name=excluded.name,description=excluded.description,category=excluded.category,status='ACTIVE';