-- Optional demo data. Run after migrations and the catalog seed.
-- Accounts use reserved example.com addresses and the password Cliente123!
-- Re-running does not reset passwords, redeemed coupons, or completed visits.
begin;

create temporary table demo_clients (
  id uuid primary key, email text, full_name text, visits integer, slot integer
) on commit drop;
insert into demo_clients values
('d3e00000-0000-4000-8000-000000000001', 'cliente.nuevo@example.com', '[DEMO] Cliente nuevo', 0, 1),
('d3e00000-0000-4000-8000-000000000002', 'cliente.frecuente@example.com', '[DEMO] Cliente frecuente', 4, 2),
('d3e00000-0000-4000-8000-000000000003', 'cliente.cupones@example.com', '[DEMO] Cliente con cupones', 5, 3),
('d3e00000-0000-4000-8000-000000000004', 'cliente.referidor@example.com', '[DEMO] Cliente que invita', 1, 4),
('d3e00000-0000-4000-8000-000000000005', 'cliente.invitado@example.com', '[DEMO] Invitado sin visitas', 0, 5),
('d3e00000-0000-4000-8000-000000000006', 'cliente.referido@example.com', '[DEMO] Referido con primera visita', 1, 6);

do $$ begin
  if exists (select 1 from auth.users u join demo_clients d on lower(u.email) = d.email where u.id <> d.id)
    or exists (select 1 from auth.users u join demo_clients d on u.id = d.id
      where u.email is distinct from d.email or u.raw_app_meta_data->>'demo_account' is distinct from 'true') then
    raise exception 'Las cuentas de ejemplo coinciden con cuentas existentes; no se modificaron';
  end if;
  if exists (select 1 from public.staff_roles s join demo_clients d on d.id = s.user_id) then
    raise exception 'Una cuenta de ejemplo pertenece al equipo; no se modificó';
  end if;
end $$;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  email_change_token_current, reauthentication_token, is_super_admin, is_sso_user, is_anonymous
)
select '00000000-0000-0000-0000-000000000000', d.id, 'authenticated', 'authenticated', d.email,
  extensions.crypt('Cliente123!', extensions.gen_salt('bf', 10)), now(), '', '', '', '',
  '{"provider":"email","providers":["email"],"demo_account":true}'::jsonb,
  jsonb_build_object('full_name', d.full_name), now(), now(), '', '', false, false, false
from demo_clients d
on conflict (id) do nothing;

insert into auth.identities(provider_id, user_id, identity_data, provider, created_at, updated_at)
select d.id::text, d.id,
  jsonb_build_object('sub', d.id::text, 'email', d.email, 'email_verified', true, 'phone_verified', false),
  'email', now(), now()
from demo_clients d
on conflict (provider_id, provider) do nothing;

update public.loyalty_accounts l
set referral_code = 'INV-DE' || lpad(d.slot::text, 10, '0')
from demo_clients d where l.client_id = d.id;

insert into public.promotions (
  id, title, description, benefit_text, kind, visits_every, referral_benefit_text,
  starts_at, ends_at, active, reward_valid_days, created_by
) values
('d3e10000-0000-4000-8000-000000000001', '[DEMO] Beneficio de bienvenida',
 'Campaña ficticia para pruebas. Se entrega después de la primera visita para usar en la siguiente.',
 '₡1.000 de descuento en tu próxima visita', 'welcome', null, null,
 now() - interval '30 days', now() + interval '90 days', true, 30,
 (select user_id from public.staff_roles where role = 'owner' limit 1)),
('d3e10000-0000-4000-8000-000000000002', '[DEMO] Premio cada cinco visitas',
 'Campaña ficticia para pruebas. Recibe un nuevo cupón cada cinco visitas atendidas.',
 'Lavado de cortesía con tu próximo corte', 'frequency', 5, null,
 now() - interval '30 days', now() + interval '90 days', true, 30,
 (select user_id from public.staff_roles where role = 'owner' limit 1)),
('d3e10000-0000-4000-8000-000000000003', '[DEMO] Referidos para ambos',
 'Campaña ficticia para pruebas. Registra la invitación antes de tu primera visita.',
 '₡1.000 de descuento en tu próxima visita', 'referral', null, 'Lavado de cortesía con tu próximo corte',
 now() - interval '30 days', now() + interval '90 days', true, 30,
 (select user_id from public.staff_roles where role = 'owner' limit 1))
on conflict (id) do nothing;

-- Link the already-served referral before generating its first attended visit.
do $$ begin
  if exists (select 1 from public.loyalty_accounts where client_id = 'd3e00000-0000-4000-8000-000000000006' and visits = 0)
    and not exists (select 1 from public.referrals where invited_id = 'd3e00000-0000-4000-8000-000000000006') then
    perform set_config('request.jwt.claim.sub', 'd3e00000-0000-4000-8000-000000000006', true);
    perform public.register_referral('INV-DE0000000004');
  end if;
end $$;

-- Generate real appointment history so the normal credit and reward triggers run.
do $$
declare
  d record; visit integer; appointment uuid; v_branch uuid; v_barber uuid; v_service uuid;
begin
  select bb.branch_id, bb.barber_id into v_branch, v_barber
  from public.barber_branches bb join public.branches b on b.id = bb.branch_id
  join public.barbers bbr on bbr.id = bb.barber_id
  where b.active and bbr.active order by b.name, bbr.display_name limit 1;
  select id into v_service from public.services where active order by sort_order, name limit 1;
  if v_branch is null or v_service is null then raise exception 'Se necesita una sucursal, un barbero y un servicio activos'; end if;
  for d in select * from demo_clients order by slot loop
    for visit in 1..d.visits loop
      appointment := ('d3e20000-0000-4000-8000-' || lpad((d.slot * 100 + visit)::text, 12, '0'))::uuid;
      if not exists (select 1 from public.appointment_requests where id = appointment) then
        insert into public.appointment_requests(id, client_id, branch_id, barber_id, service_id,
          requested_at, customer_name, customer_whatsapp, notes)
        values(appointment, d.id, v_branch, v_barber, v_service,
          now() - make_interval(days => 11 - visit) + make_interval(hours => d.slot),
          d.full_name, '00000000', 'Visita ficticia generada para probar promociones y cupones.');
        update public.appointment_requests set status = 'confirmed' where id = appointment;
        update public.appointment_requests set status = 'completed' where id = appointment;
      end if;
    end loop;
  end loop;
end $$;

-- The coupon account demonstrates available, redeemed and expired states.
create temporary table demo_seed_session(id uuid primary key) on commit drop;
insert into demo_seed_session values(gen_random_uuid());
insert into auth.sessions(id,user_id,created_at,updated_at)
select id,(select user_id from public.staff_roles where role='owner' limit 1),now(),now() from demo_seed_session;
select set_config('request.jwt.claims',jsonb_build_object('session_id',(select id from demo_seed_session))::text,true);
select set_config('request.jwt.claim.sub', (select user_id::text from public.staff_roles where role = 'owner' limit 1), true);
update public.coupons set status = 'redeemed'
where client_id = 'd3e00000-0000-4000-8000-000000000003'
  and promotion_id = 'd3e10000-0000-4000-8000-000000000001' and status = 'available';
insert into public.coupons(promotion_id, client_id, reward_key, benefit_text, claimed_at, expires_at)
values('d3e10000-0000-4000-8000-000000000002', 'd3e00000-0000-4000-8000-000000000003',
  'demo:expired', 'Recompensa vencida de ejemplo', now() - interval '40 days', now() - interval '1 day')
on conflict (promotion_id, client_id, reward_key) do nothing;

delete from auth.sessions where id in (select id from demo_seed_session);
commit;
