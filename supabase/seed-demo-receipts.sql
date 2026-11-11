-- Optional demo receipts. Requires seed-demo-clients.sql and an active catalog.
-- Uses the usual receipt triggers and preserves already completed visit credits.
-- Run again without duplicating receipts or crediting the same fixtures twice.
begin;
create temporary table demo_receipt_session(id uuid primary key) on commit drop;
insert into demo_receipt_session values(gen_random_uuid());
insert into auth.sessions(id,user_id,created_at,updated_at)
select id,(select user_id from public.staff_roles where role='owner' order by user_id limit 1),now(),now() from demo_receipt_session;
select set_config('request.jwt.claims',jsonb_build_object('session_id',(select id from demo_receipt_session))::text,true);
create temporary table demo_receipt_expected on commit drop as
select l.client_id, l.visits, l.points_total from public.loyalty_accounts l
join auth.users u on u.id = l.client_id
where u.raw_app_meta_data->>'demo_account' = 'true' and l.client_id::text like 'd3e00000-%';

do $$
declare
  v_owner uuid; a record; v_receipt uuid; v_primary record; v_extra record;
  v_items jsonb; v_index integer := 0;
begin
  select user_id into v_owner from public.staff_roles where role = 'owner' order by user_id limit 1;
  if v_owner is null then raise exception 'Se necesita una cuenta de propietario'; end if;
  if (select count(*) from demo_receipt_expected) <> 6 then raise exception 'Carga primero las seis cuentas DEMO'; end if;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);

  -- Eleven receipts for demo appointments that have already been attended.
  for a in select ar.* from public.appointment_requests ar
    join demo_receipt_expected d on d.client_id = ar.client_id
    where ar.id::text like 'd3e20000-%' and ar.status = 'completed'
    order by ar.requested_at, ar.id loop
    v_index := v_index + 1;
    v_receipt := ('d3e30000-0000-4000-8000-' || right(a.id::text, 12))::uuid;
    if exists (select 1 from public.service_receipts where id = v_receipt or appointment_id = a.id) then continue; end if;
    select id, price into v_primary from public.services where id = a.service_id and active;
    if not found then raise exception 'El servicio de una cita DEMO ya no está activo'; end if;
    v_items := jsonb_build_array(jsonb_build_object('serviceId', v_primary.id, 'quantity', 1, 'unitPrice', coalesce(v_primary.price, 8500)));
    if v_index % 3 = 0 then
      select id, price into v_extra from public.services where active and id <> v_primary.id order by sort_order, id limit 1;
      if found then v_items := v_items || jsonb_build_array(jsonb_build_object('serviceId', v_extra.id, 'quantity', 1, 'unitPrice', coalesce(v_extra.price, 4500))); end if;
    end if;
    insert into public.service_receipts(id, branch_id, client_id, barber_id, issued_by, appointment_id, issued_at, items, note)
    values(v_receipt, a.branch_id, a.client_id, a.barber_id, v_owner, a.id,
      a.ends_at, v_items, '[DEMO] Comprobante de ejemplo vinculado a una cita ya atendida. Datos ficticios para pruebas.');
  end loop;

  if exists (select 1 from demo_receipt_expected d join public.loyalty_accounts l on l.client_id = d.client_id
    where l.visits <> d.visits or l.points_total <> d.points_total) then
    raise exception 'Un comprobante vinculado duplicó visitas o puntos';
  end if;
end $$;

do $$
declare
  v_owner uuid; v_client uuid; v_receipt uuid; v_assignment record; v_service record; v_extra record;
  v_items jsonb; v_services uuid[]; v_assignment_count integer; v_quantity integer; i integer;
begin
  select user_id into v_owner from public.staff_roles where role = 'owner' order by user_id limit 1;
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  select array_agg(id order by sort_order, name) into v_services from public.services where active;
  select count(*) into v_assignment_count from public.barber_branches bb
    join public.branches b on b.id = bb.branch_id join public.barbers br on br.id = bb.barber_id where b.active and br.active;
  if v_services is null or v_assignment_count = 0 then raise exception 'Se necesita un catálogo activo para crear los comprobantes DEMO'; end if;

  -- Seven walk-in receipts spread across branches, professionals and services.
  -- New/invited clients stay at zero visits; the frequent client stays at four.
  for i in 1..7 loop
    v_receipt := ('d3e30000-0000-4000-8000-' || lpad((900000 + i)::text, 12, '0'))::uuid;
    if exists (select 1 from public.service_receipts where id = v_receipt) then continue; end if;
    v_client := case when i <= 5 then 'd3e00000-0000-4000-8000-000000000003'::uuid else 'd3e00000-0000-4000-8000-000000000004'::uuid end;
    select * into v_assignment from (
      select bb.branch_id, bb.barber_id, b.name as branch_name,
        row_number() over(partition by bb.branch_id order by br.display_name, br.id) as barber_position
      from public.barber_branches bb join public.branches b on b.id = bb.branch_id
      join public.barbers br on br.id = bb.barber_id where b.active and br.active
    ) candidates order by barber_position, branch_name offset ((i - 1) % v_assignment_count) limit 1;
    select id, price into v_service from public.services where id = v_services[(i - 1) % array_length(v_services, 1) + 1];
    v_quantity := case when i % 4 = 0 then 2 else 1 end;
    v_items := jsonb_build_array(jsonb_build_object('serviceId', v_service.id, 'quantity', v_quantity, 'unitPrice', coalesce(v_service.price, 8500)));
    if i % 2 = 0 and array_length(v_services, 1) > 1 then
      select id, price into v_extra from public.services where id = v_services[i % array_length(v_services, 1) + 1];
      v_items := v_items || jsonb_build_array(jsonb_build_object('serviceId', v_extra.id, 'quantity', 1, 'unitPrice', coalesce(v_extra.price, 4500)));
    end if;
    insert into public.service_receipts(id, branch_id, client_id, barber_id, issued_by, issued_at, items, note)
    values(v_receipt, v_assignment.branch_id, v_client, v_assignment.barber_id, v_owner,
      now() - make_interval(days => 7 - i), v_items,
      '[DEMO] Atención sin cita de ejemplo ' || i || '. Servicios, cantidades y cobros ficticios para probar filtros, vistas y paginación.');
    update demo_receipt_expected set visits = visits + 1 where client_id = v_client;
  end loop;
end $$;

do $$ begin
  if exists (select 1 from demo_receipt_expected d join public.loyalty_accounts l on l.client_id = d.client_id where l.visits <> d.visits) then
    raise exception 'Las visitas de los comprobantes DEMO no coinciden';
  end if;
  if exists (select 1 from public.service_receipts r where r.id::text like 'd3e30000-%'
    and (r.total <> r.subtotal - r.discount_amount or r.subtotal <> (select sum((item->>'lineTotal')::numeric) from jsonb_array_elements(r.items) item))) then
    raise exception 'El total de un comprobante DEMO no coincide con sus servicios';
  end if;
end $$;
delete from auth.sessions where id in (select id from demo_receipt_session);
commit;
