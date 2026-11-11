-- All fixture accounts, receipts, rewards and redemptions are rolled back.
begin;
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;
insert into auth.users(id,email,raw_user_meta_data,email_confirmed_at) values
('61000000-0000-4000-8000-000000000001','discount-owner@example.invalid','{"full_name":"Discount owner"}',now()),
('61000000-0000-4000-8000-000000000002','discount-client@example.invalid','{"full_name":"Discount client"}',now()),
('61000000-0000-4000-8000-000000000003','discount-other@example.invalid','{"full_name":"Discount other"}',now());
insert into public.staff_roles(user_id,role) values('61000000-0000-4000-8000-000000000001','owner');
insert into auth.sessions(id,user_id,created_at,updated_at) values('61000000-0000-4000-8000-000000009001','61000000-0000-4000-8000-000000000001',now(),now());
select set_config('request.jwt.claims','{"session_id":"61000000-0000-4000-8000-000000009001"}',true);
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
insert into public.branches(id,slug,name) values
('62000000-0000-4000-8000-000000000001','discount-test-one','Discount test one'),
('62000000-0000-4000-8000-000000000002','discount-test-two','Discount test two');
insert into public.barbers(id,display_name) values('63000000-0000-4000-8000-000000000001','Discount barber');
insert into public.barber_branches(barber_id,branch_id) values
('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001'),
('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002');
insert into public.services(id,name,duration_minutes,points,price) values('64000000-0000-4000-8000-000000000001','Discount service',30,10,5000);
insert into public.promotions(id,title,benefit_text,kind,branch_id,starts_at,ends_at,discount_type,discount_value) values
('65000000-0000-4000-8000-000000000001','Discount test','Test discount','legacy','62000000-0000-4000-8000-000000000001',now()-interval '1 day',now()+interval '10 days','fixed',1000);
insert into public.coupons(id,promotion_id,client_id,reward_key,benefit_text,expires_at) values
('66000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','test-1','Test discount',now()+interval '5 days'),
('66000000-0000-4000-8000-000000000002','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','test-2','Test discount',now()+interval '5 days'),
('66000000-0000-4000-8000-000000000003','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','test-3','Test discount',now()-interval '1 day'),
('66000000-0000-4000-8000-000000000004','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','test-4','Test discount',now()+interval '5 days');
create function pg_temp.emit(p_coupon uuid, p_discount numeric, p_branch uuid default '62000000-0000-4000-8000-000000000001', p_note text default '', p_price numeric default 5000) returns uuid
language plpgsql security invoker as $$ declare v_id uuid; begin
  insert into public.service_receipts(branch_id,client_id,barber_id,issued_by,items,coupon_id,discount_amount,note)
  values(p_branch,'61000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001',
  jsonb_build_array(jsonb_build_object('serviceId','64000000-0000-4000-8000-000000000001','quantity',1,'unitPrice',p_price)),p_coupon,p_discount,p_note) returning id into v_id;
  return v_id;
end $$;
set local role authenticated;
select pg_temp.emit(null,0);
select pg_temp.emit('66000000-0000-4000-8000-000000000001',1000);
select pg_temp.assert_true((select subtotal=5000 and total=4000 and discount_amount=1000 and coupon_code is not null and discount_description='Test discount' from public.service_receipts where coupon_id='66000000-0000-4000-8000-000000000001'),'Discount and snapshots persisted');
select pg_temp.assert_true((select status='redeemed' and redeemed_at is not null from public.coupons where id='66000000-0000-4000-8000-000000000001'),'Coupon redeemed');
update public.promotions set title='Edited campaign',benefit_text='New benefit',reward_valid_days=15,discount_type='percentage',discount_value=10
where id='65000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select title='Edited campaign' and reward_valid_days=15 from public.promotions where id='65000000-0000-4000-8000-000000000001'),'Owner can edit campaign fields');
select pg_temp.assert_true((select benefit_text='Test discount' and expires_at=now()+interval '5 days' and discount_type='fixed' and discount_value=1000 from public.coupons where id='66000000-0000-4000-8000-000000000002'),'Campaign edit preserves issued coupon benefit and expiry');
select pg_temp.assert_true((select discount_description='Test discount' and total=4000 from public.service_receipts where coupon_id='66000000-0000-4000-8000-000000000001'),'Campaign edit preserves receipt snapshot');
do $$ begin
  begin perform pg_temp.emit('66000000-0000-4000-8000-000000000001',1000); raise exception 'FAIL: Coupon reused';
  exception when raise_exception then if sqlerrm not like 'El cupón ya fue canjeado%' then raise; end if; end;
  begin perform pg_temp.emit('66000000-0000-4000-8000-000000000003',1000); raise exception 'FAIL: Expired coupon accepted';
  exception when raise_exception then if sqlerrm not like 'El cupón ya fue canjeado%' then raise; end if; end;
  begin perform pg_temp.emit('66000000-0000-4000-8000-000000000004',1000); raise exception 'FAIL: Other client coupon accepted';
  exception when raise_exception then if sqlerrm <> 'El cupón no pertenece a este cliente' then raise; end if; end;
  begin perform pg_temp.emit('66000000-0000-4000-8000-000000000002',1000,'62000000-0000-4000-8000-000000000002'); raise exception 'FAIL: Other branch coupon accepted';
  exception when raise_exception then if sqlerrm <> 'El cupón no aplica en esta sucursal' then raise; end if; end;
  begin perform pg_temp.emit('66000000-0000-4000-8000-000000000002',1000,'62000000-0000-4000-8000-000000000001',repeat('x',501)); raise exception 'FAIL: Invalid receipt accepted';
  exception when check_violation then null; end;
end $$;
select pg_temp.assert_true((select status='available' from public.coupons where id='66000000-0000-4000-8000-000000000002'),'Failed receipt does not consume coupon');
reset role;
update public.promotions set active=false where id='65000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  begin perform pg_temp.emit('66000000-0000-4000-8000-000000000002',1000); raise exception 'FAIL: Paused campaign accepted';
  exception when raise_exception then if sqlerrm not like 'El cupón ya fue canjeado%' then raise; end if; end;
end $$;
reset role;
update public.promotions set active=true where id='65000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.emit('66000000-0000-4000-8000-000000000002',0);
select pg_temp.assert_true((select total=4000 and discount_type='fixed' and discount_value=1000 and coupon_code is not null from public.service_receipts where coupon_id='66000000-0000-4000-8000-000000000002'),'Coupon snapshot overrides a forged zero discount');
reset role;
-- Newly issued coupons copy the edited percentage; the previous ones stayed fixed.
insert into public.coupons(id,promotion_id,client_id,reward_key,benefit_text,expires_at)
values('66000000-0000-4000-8000-000000000005','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','percent','New benefit',now()+interval '5 days');
update public.promotions set discount_type='fixed',discount_value=10000 where id='65000000-0000-4000-8000-000000000001';
insert into public.coupons(id,promotion_id,client_id,reward_key,benefit_text,expires_at)
values('66000000-0000-4000-8000-000000000006','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','capped','New benefit',now()+interval '5 days');
update public.promotions set discount_type='none',discount_value=0 where id='65000000-0000-4000-8000-000000000001';
insert into public.coupons(id,promotion_id,client_id,reward_key,benefit_text,expires_at)
values('66000000-0000-4000-8000-000000000007','65000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','courtesy','Courtesy',now()+interval '5 days');
set local role authenticated;
select pg_temp.emit('66000000-0000-4000-8000-000000000005',99999,'62000000-0000-4000-8000-000000000001','',123.45);
select pg_temp.assert_true((select discount_type='percentage' and discount_value=10 and discount_amount=12.35 and total=111.10 from public.service_receipts where coupon_id='66000000-0000-4000-8000-000000000005'),'Percentage rounds to cents and ignores supplied amount');
select pg_temp.emit('66000000-0000-4000-8000-000000000006',1);
select pg_temp.assert_true((select discount_amount=5000 and total=0 from public.service_receipts where coupon_id='66000000-0000-4000-8000-000000000006'),'Fixed discount is capped at subtotal');
select pg_temp.emit('66000000-0000-4000-8000-000000000007',9999);
select pg_temp.assert_true((select discount_amount=0 and total=5000 from public.service_receipts where coupon_id='66000000-0000-4000-8000-000000000007'),'Previous nonmonetary courtesies cannot receive a forged amount');
select pg_temp.emit(null,9999);
select pg_temp.assert_true(not exists(select 1 from public.service_receipts where coupon_id is null and discount_amount<>0),'No coupon means no monetary discount');
reset role;
rollback;
