-- Run against a migrated database. All fixtures and writes are rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

insert into auth.users(id, email, raw_user_meta_data, email_confirmed_at) values
('10000000-0000-4000-8000-000000000001', 'loyalty-owner@example.invalid', '{"full_name":"Loyalty test owner"}', now()),
('10000000-0000-4000-8000-000000000002', 'loyalty-referrer@example.invalid', '{"full_name":"Loyalty test referrer"}', now()),
('10000000-0000-4000-8000-000000000003', 'loyalty-invited@example.invalid', '{"full_name":"Loyalty test invited"}', now()),
('10000000-0000-4000-8000-000000000004', 'loyalty-other@example.invalid', '{"full_name":"Loyalty test other"}', now());
insert into public.staff_roles(user_id, role) values('10000000-0000-4000-8000-000000000001', 'owner');
insert into auth.sessions(id,user_id,created_at,updated_at) values('10000000-0000-4000-8000-000000009001','10000000-0000-4000-8000-000000000001',now(),now());
select set_config('request.jwt.claims','{"session_id":"10000000-0000-4000-8000-000000009001"}',true);
insert into public.branches(id, slug, name) values('20000000-0000-4000-8000-000000000001', 'loyalty-test-fixture', 'Loyalty test branch');
insert into public.barbers(id, display_name) values('30000000-0000-4000-8000-000000000001', 'Loyalty test barber');
insert into public.barber_branches(barber_id, branch_id) values('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
insert into public.services(id, name, duration_minutes, points, price) values('40000000-0000-4000-8000-000000000001', 'Loyalty test service', 30, 100, 5000);
-- Isolate the unique active referral campaign inside this rolled-back transaction.
update public.promotions set active = false where kind = 'referral' and active;
insert into public.promotions(id, title, benefit_text, kind, visits_every, referral_benefit_text, starts_at, ends_at, reward_valid_days, discount_type, discount_value, referral_discount_type, referral_discount_value) values
('50000000-0000-4000-8000-000000000001', 'Test welcome', 'Welcome reward', 'welcome', null, null, now() - interval '1 day', now() + interval '90 days', 30, 'percentage', 10, 'none', 0),
('50000000-0000-4000-8000-000000000002', 'Test frequency', 'Frequency reward', 'frequency', 2, null, now() - interval '1 day', now() + interval '90 days', 30, 'percentage', 10, 'none', 0),
('50000000-0000-4000-8000-000000000003', 'Test referral', 'Invited reward', 'referral', null, 'Referrer reward', now() - interval '1 day', now() + interval '90 days', 30, 'fixed', 1000, 'percentage', 20);

select pg_temp.assert_true(to_regclass('public.ranks') is null, 'Ranks removed');
select pg_temp.assert_true((select count(*) = 4 from public.loyalty_accounts where client_id::text like '10000000-%' and referral_code ~ '^INV-[A-F0-9]{12}$'), 'Signup creates invitation codes without ranks');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin
    perform public.register_referral((select referral_code from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000003'));
    raise exception 'FAIL: Self referral accepted';
  exception when raise_exception then if sqlerrm <> 'El código de invitación no es válido' then raise; end if; end;
end $$;
select set_config('test.referral_code', (select referral_code from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000002'), true);
set local role authenticated;
select public.register_referral(current_setting('test.referral_code'));
reset role;
select public.register_referral((select referral_code from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000002'));
do $$ begin
  begin
    perform public.register_referral((select referral_code from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000004'));
    raise exception 'FAIL: Invitation overwritten';
  exception when raise_exception then if sqlerrm <> 'Ya registraste otra invitación' then raise; end if; end;
end $$;
select pg_temp.assert_true((select count(*) = 0 from public.coupons where promotion_id::text like '50000000-%'), 'Registration does not issue rewards');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.appointment_requests(id, client_id, branch_id, barber_id, service_id, requested_at, customer_name, customer_whatsapp)
values('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', now() - interval '4 days', 'Test invited', '88888888');
update public.appointment_requests set status = 'confirmed' where id = '60000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 0 from public.coupons where promotion_id::text like '50000000-%'), 'Confirmation does not issue rewards');
update public.appointment_requests set status = 'completed' where id = '60000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select visits = 1 and points_total = 100 from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000003'), 'Completed appointment credits one visit');
select pg_temp.assert_true((select count(*) = 3 from public.coupons where promotion_id::text like '50000000-%'), 'First completed visit issues welcome and both referral coupons');
select pg_temp.assert_true((select count(*) = 1 from public.coupons where client_id = '10000000-0000-4000-8000-000000000002' and benefit_text = 'Referrer reward'), 'Referrer receives the correct reward');
select pg_temp.assert_true((select rewarded_at is not null from public.referrals where invited_id = '10000000-0000-4000-8000-000000000003'), 'Referral marked rewarded');
select pg_temp.assert_true((select bool_and(expires_at = now() + interval '30 days') from public.coupons where promotion_id::text like '50000000-%'), 'Personal coupon expiry');

-- Receipt after completion must not double credit the appointment.
insert into public.service_receipts(branch_id, client_id, barber_id, issued_by, appointment_id, items)
values('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '[{"serviceId":"40000000-0000-4000-8000-000000000001","quantity":1,"unitPrice":5000}]');
select pg_temp.assert_true((select visits = 1 from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000003'), 'Receipt after completed appointment is idempotent');

-- Three walk-in receipts reach visits 2 and 4: repeatable frequency rewards.
insert into public.service_receipts(branch_id, client_id, barber_id, issued_by, items)
select '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '[{"serviceId":"40000000-0000-4000-8000-000000000001","quantity":1,"unitPrice":5000}]'::jsonb from generate_series(1, 3);
select pg_temp.assert_true((select visits = 4 and points_total = 400 from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000003'), 'Walk-in receipts credit visits and points');
select pg_temp.assert_true((select count(*) = 2 from public.coupons where promotion_id = '50000000-0000-4000-8000-000000000002' and client_id = '10000000-0000-4000-8000-000000000003'), 'Frequency coupons repeat for each completed cycle');
select pg_temp.assert_true((select count(*) = 1 from public.coupons where promotion_id = '50000000-0000-4000-8000-000000000001' and client_id = '10000000-0000-4000-8000-000000000003'), 'Welcome only once');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
do $$ begin
  begin
    perform public.register_referral((select referral_code from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000002'));
    raise exception 'FAIL: Late invitation accepted';
  exception when raise_exception then if sqlerrm <> 'La invitación debe registrarse antes de tu primera visita' then raise; end if; end;
end $$;

-- A second invited person gives the referrer a second distinct coupon.
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select public.register_referral((select referral_code from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000002'));
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
insert into public.appointment_requests(id, client_id, branch_id, barber_id, service_id, requested_at, customer_name, customer_whatsapp)
values('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', now() - interval '2 days', 'Test other', '88888888');
update public.appointment_requests set status = 'confirmed' where id = '60000000-0000-4000-8000-000000000002';
insert into public.service_receipts(branch_id, client_id, barber_id, issued_by, appointment_id, items)
values('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', '[{"serviceId":"40000000-0000-4000-8000-000000000001","quantity":1,"unitPrice":5000}]');
update public.appointment_requests set status = 'completed' where id = '60000000-0000-4000-8000-000000000002';
select pg_temp.assert_true((select visits = 1 from public.loyalty_accounts where client_id = '10000000-0000-4000-8000-000000000004'), 'Receipt-linked completion only credits once');
select pg_temp.assert_true((select count(*) = 2 from public.coupons where promotion_id = '50000000-0000-4000-8000-000000000003' and client_id = '10000000-0000-4000-8000-000000000002'), 'Each referred first visit rewards referrer again');

-- Owner redemption, expired rewards, and concurrent-retry guard.
update public.coupons set status = 'redeemed' where promotion_id = '50000000-0000-4000-8000-000000000001' and client_id = '10000000-0000-4000-8000-000000000003';
do $$ begin
  begin
    update public.coupons set status = 'redeemed' where promotion_id = '50000000-0000-4000-8000-000000000001' and client_id = '10000000-0000-4000-8000-000000000003';
    raise exception 'FAIL: Double redemption accepted';
  exception when raise_exception then if sqlerrm <> 'Este cupón ya fue canjeado' then raise; end if; end;
end $$;
update public.coupons set expires_at = now() - interval '1 day' where promotion_id = '50000000-0000-4000-8000-000000000002' and reward_key = 'visit:2';
do $$ begin
  begin
    update public.coupons set status = 'redeemed' where promotion_id = '50000000-0000-4000-8000-000000000002' and reward_key = 'visit:2';
    raise exception 'FAIL: Expired reward redeemed';
  exception when raise_exception then if sqlerrm <> 'El cupón venció o la campaña no está activa' then raise; end if; end;
end $$;

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
set local role authenticated;
select pg_temp.assert_true((select count(*) = 0 from public.coupons where client_id <> '10000000-0000-4000-8000-000000000003'), 'Coupon RLS isolates clients');
select pg_temp.assert_true((select count(*) = 0 from public.referrals where invited_id <> '10000000-0000-4000-8000-000000000003' and referrer_id <> '10000000-0000-4000-8000-000000000003'), 'Referral RLS isolates participants');
do $$ begin
  begin
    insert into public.coupons(promotion_id, client_id) values('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003');
    raise exception 'FAIL: Client manufactured a reward';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true((select bool_and(discount_type='percentage' and discount_value=10) from public.coupons where promotion_id='50000000-0000-4000-8000-000000000001'), 'Welcome issuance snapshots percentage');
select pg_temp.assert_true((select bool_and(discount_type='fixed' and discount_value=1000) from public.coupons where promotion_id='50000000-0000-4000-8000-000000000003' and reward_key like 'invited:%'), 'Invited coupons snapshot primary fixed discount');
select pg_temp.assert_true((select bool_and(discount_type='percentage' and discount_value=20) from public.coupons where promotion_id='50000000-0000-4000-8000-000000000003' and reward_key like 'referrer:%'), 'Referrers receive their separate discount');
select 'PASS: welcome, repeat frequency, both referral rewards, receipts, expiry, redemption and RLS' as result;
rollback;
