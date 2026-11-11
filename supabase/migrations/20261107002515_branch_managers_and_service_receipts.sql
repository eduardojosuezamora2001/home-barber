-- An encargado belongs to exactly one branch. Only owner can manage staff_roles.
alter table public.staff_roles add column branch_id uuid references public.branches(id);
alter table public.staff_roles drop constraint staff_roles_role_check;
alter table public.staff_roles add constraint staff_roles_role_check check (role in ('owner', 'barber', 'manager'));
alter table public.staff_roles add constraint staff_roles_branch_check check (
  (role = 'manager' and branch_id is not null) or
  (role in ('owner', 'barber') and branch_id is null)
);
create index staff_roles_manager_branch_idx on public.staff_roles(branch_id) where role = 'manager';

create function private.manager_branch() returns uuid
language sql stable security definer set search_path = ''
as $$ select branch_id from public.staff_roles
  where user_id = (select auth.uid()) and role = 'manager' $$;

create function private.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.staff_roles
  where user_id = (select auth.uid()) and role = 'manager') $$;

create function private.is_manager_for_branch(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.staff_roles
  where user_id = (select auth.uid()) and role = 'manager' and branch_id = p_branch_id) $$;

revoke all on function private.manager_branch(), private.is_manager(), private.is_manager_for_branch(uuid) from public;
grant execute on function private.manager_branch(), private.is_manager(), private.is_manager_for_branch(uuid) to authenticated;

-- A manager's authenticated queries only see professionals assigned to their branch.
drop policy "barbers active read" on public.barbers;
create policy "barbers public active read" on public.barbers for select to anon using (active);
create policy "barbers scoped authenticated read" on public.barbers for select to authenticated using (
  (select private.is_owner()) or
  ((select private.is_manager()) and exists (
    select 1 from public.barber_branches bb
    where bb.barber_id = id and bb.branch_id = (select private.manager_branch())
  )) or
  (not (select private.is_manager()) and active)
);

drop policy "branches active read" on public.branches;
create policy "branches anon active read" on public.branches for select to anon using (active);
create policy "branches scoped authenticated read" on public.branches for select to authenticated
using ((select private.is_owner()) or id = (select private.manager_branch())
  or (not (select private.is_manager()) and active));

drop policy "barber branches public read" on public.barber_branches;
create policy "barber branches anon read" on public.barber_branches for select to anon using (true);
create policy "barber branches scoped read" on public.barber_branches for select to authenticated using (
  not (select private.is_manager()) or branch_id = (select private.manager_branch())
);

drop policy "barber hours public read" on public.barber_hours;
create policy "barber hours anon read" on public.barber_hours for select to anon using (true);
create policy "barber hours scoped read" on public.barber_hours for select to authenticated using (
  not (select private.is_manager()) or branch_id = (select private.manager_branch())
);

drop policy "barber blocks public read" on public.barber_blocks;
create policy "barber blocks anon read" on public.barber_blocks for select to anon using (true);
create policy "barber blocks scoped read" on public.barber_blocks for select to authenticated using (
  not (select private.is_manager()) or branch_id = (select private.manager_branch())
);

create policy "appointments manager branch read" on public.appointment_requests for select to authenticated
using (branch_id = (select private.manager_branch()));

-- Internal receipt: prices and names are immutable snapshots, not a fiscal e-invoice.
create table public.service_receipts (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  branch_id uuid not null references public.branches(id),
  client_id uuid not null references public.profiles(id),
  barber_id uuid not null,
  issued_by uuid not null references public.profiles(id),
  appointment_id uuid unique references public.appointment_requests(id),
  issued_at timestamptz not null default now(),
  client_name text not null default '',
  client_email text,
  barber_name text not null default '',
  branch_name text not null default '',
  items jsonb not null,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  total numeric(12,2) not null default 0 check (total >= 0),
  currency text not null default 'CRC' check (currency = 'CRC'),
  note text not null default '' check (char_length(note) <= 500),
  foreign key (barber_id, branch_id) references public.barber_branches(barber_id, branch_id),
  check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 12)
);
create index service_receipts_branch_issued_idx on public.service_receipts(branch_id, issued_at desc);
create index service_receipts_client_issued_idx on public.service_receipts(client_id, issued_at desc);
create index service_receipts_barber_issued_idx on public.service_receipts(barber_id, issued_at desc);
alter table public.service_receipts enable row level security;
revoke all on public.service_receipts from anon, authenticated;
grant select on public.service_receipts to authenticated;
grant insert (branch_id, client_id, barber_id, issued_by, appointment_id, items, note)
  on public.service_receipts to authenticated;

create policy "receipts owner manager or client read" on public.service_receipts for select to authenticated
using ((select private.is_owner()) or branch_id = (select private.manager_branch()) or client_id = (select auth.uid()));
create policy "receipts owner or manager insert" on public.service_receipts for insert to authenticated
with check (issued_by = (select auth.uid()) and ((select private.is_owner()) or branch_id = (select private.manager_branch())));

create function private.prepare_service_receipt() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_item jsonb;
  v_service record;
  v_quantity integer;
  v_price numeric(12,2);
  v_items jsonb := '[]'::jsonb;
  v_total numeric(12,2) := 0;
  v_status text;
begin
  if new.issued_by is distinct from (select auth.uid()) or not (
    (select private.is_owner()) or (select private.is_manager_for_branch(new.branch_id))
  ) then raise exception 'No tienes permiso para emitir este comprobante'; end if;
  if not exists (select 1 from public.barber_branches bb where bb.barber_id = new.barber_id and bb.branch_id = new.branch_id) then
    raise exception 'El empleado no pertenece a esta sucursal';
  end if;
  select full_name, email into new.client_name, new.client_email from public.profiles where id = new.client_id;
  if not found then raise exception 'Cliente no encontrado'; end if;
  select display_name into new.barber_name from public.barbers where id = new.barber_id;
  select name into new.branch_name from public.branches where id = new.branch_id;
  if jsonb_typeof(new.items) is distinct from 'array' or jsonb_array_length(new.items) not between 1 and 12 then
    raise exception 'Selecciona entre uno y doce servicios';
  end if;
  for v_item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Servicio inválido'; end if;
    select id, name, points into v_service from public.services where id = (v_item->>'serviceId')::uuid and active;
    if not found then raise exception 'Servicio no disponible'; end if;
    v_quantity := (v_item->>'quantity')::integer;
    v_price := (v_item->>'unitPrice')::numeric;
    if v_quantity is null or v_quantity not between 1 and 10 or v_price is null
      or v_price < 0 or v_price > 1000000 or v_price::text = 'NaN' then
      raise exception 'Cantidad o precio inválido';
    end if;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'serviceId', v_service.id, 'name', v_service.name, 'quantity', v_quantity,
      'unitPrice', v_price, 'lineTotal', v_quantity * v_price, 'points', v_service.points * v_quantity
    ));
    v_total := v_total + v_quantity * v_price;
  end loop;
  if new.appointment_id is not null then
    select status into v_status from public.appointment_requests
    where id = new.appointment_id and branch_id = new.branch_id
      and client_id = new.client_id and barber_id = new.barber_id;
    if v_status is null or v_status not in ('confirmed', 'completed') then
      raise exception 'La cita no corresponde al cliente, empleado y sucursal';
    end if;
  end if;
  new.items := v_items;
  new.subtotal := v_total;
  new.total := v_total;
  return new;
end $$;

create trigger prepare_service_receipt before insert on public.service_receipts
for each row execute function private.prepare_service_receipt();

-- A booked visit is credited once. If the receipt is issued first, it owns the credit.
create or replace function private.on_appointment_status_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_points integer;
begin
  if new.status = 'confirmed' and old.status <> 'confirmed' then
    insert into public.barber_blocks (barber_id, branch_id, appointment_id, starts_at, ends_at, label)
    values (new.barber_id, new.branch_id, new.id, new.requested_at, new.ends_at, 'reserva');
  elsif old.status = 'confirmed' and new.status <> 'confirmed' then
    delete from public.barber_blocks where appointment_id = new.id;
  end if;
  if new.status = 'completed' and old.status <> 'completed'
    and not exists (select 1 from public.service_receipts where appointment_id = new.id) then
    select points into v_points from public.services where id = new.service_id;
    update public.loyalty_accounts l set
      visits = l.visits + 1, points_total = l.points_total + coalesce(v_points, 0),
      last_visit_at = new.requested_at, updated_at = now(),
      rank_id = (select r.id from public.ranks r where r.min_visits <= l.visits + 1 order by r.min_visits desc limit 1)
    where l.client_id = new.client_id;
  end if;
  return new;
end $$;

create function private.credit_service_receipt() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text;
  v_points integer;
begin
  if new.appointment_id is not null then
    select status into v_status from public.appointment_requests where id = new.appointment_id;
    if v_status = 'confirmed' then
      update public.appointment_requests set status = 'completed' where id = new.appointment_id;
    end if;
  end if;
  if v_status is distinct from 'completed' then
    select coalesce(sum((item->>'points')::integer), 0) into v_points
    from jsonb_array_elements(new.items) item;
    update public.loyalty_accounts l set
      visits = l.visits + 1, points_total = l.points_total + v_points,
      last_visit_at = new.issued_at, updated_at = now(),
      rank_id = (select r.id from public.ranks r where r.min_visits <= l.visits + 1 order by r.min_visits desc limit 1)
    where l.client_id = new.client_id;
  end if;
  return new;
end $$;

create trigger credit_service_receipt after insert on public.service_receipts
for each row execute function private.credit_service_receipt();

-- Exact email lookup avoids granting managers a cross-branch client directory.
create function public.lookup_receipt_client(p_email text)
returns table (id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not ((select private.is_owner()) or (select private.is_manager())) then
    raise exception 'No tienes permiso para buscar clientes';
  end if;
  return query select p.id, p.full_name, p.email from public.profiles p
    where lower(p.email) = lower(trim(p_email)) and not exists (
      select 1 from public.staff_roles r where r.user_id = p.id
    ) limit 1;
end $$;
revoke all on function public.lookup_receipt_client(text) from public, anon;
grant execute on function public.lookup_receipt_client(text) to authenticated;
