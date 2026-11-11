-- Synthetic operating data for HOME. Safe to rerun: seeded rows use stable keys,
-- and owner-edited values are preserved where possible.
begin;

-- Replace only the untouched starter labels. Preserve the branch created in the admin panel.
update public.branches set location_label = 'Paseo Colón, San José'
where slug = 'centro' and location_label = 'Dirección por confirmar · sede de muestra';
update public.branches set location_label = 'San Rafael, Escazú'
where slug = 'oeste' and location_label = 'Dirección por confirmar · sede de muestra';
update public.branches set slug = 'esparza', name = 'HOME Esparza', location_label = 'Esparza, Puntarenas'
where slug = 'home-test' and name = 'Home Test' and location_label = 'Esparza';
insert into public.branches (slug, name, location_label, whatsapp, active)
values ('esparza', 'HOME Esparza', 'Esparza, Puntarenas', '50660524368', false)
on conflict (slug) do nothing;

insert into public.branch_hours (branch_id, weekday, opens_at, closes_at, closed)
select b.id, d.weekday, d.opens_at, d.closes_at, d.closed
from public.branches b
cross join (values
  (0, time '10:00', time '15:00', false),
  (1, null::time, null::time, true),
  (2, time '09:00', time '18:00', false),
  (3, time '09:00', time '18:00', false),
  (4, time '09:00', time '18:00', false),
  (5, time '09:00', time '18:00', false),
  (6, time '09:00', time '17:00', false)
) as d(weekday, opens_at, closes_at, closed)
where b.slug = 'esparza'
on conflict (branch_id, weekday) do nothing;

update public.services set price = 8500.00 where name = 'Corte de cabello' and price is null;
update public.services set price = 5000.00 where name = 'Perfilado de barba' and price is null;
update public.services set price = 12500.00 where name = 'Corte + barba' and price is null;
insert into public.services (name, description, duration_minutes, price, points, sort_order) values
  ('Afeitado tradicional', 'Toalla caliente, afeitado a navaja y loción de cierre.', 45, 7000.00, 90, 4),
  ('Corte ejecutivo', 'Corte a tijera, contornos y peinado de acabado natural.', 50, 9500.00, 120, 5),
  ('Lavado y peinado', 'Lavado, secado y peinado según el estilo del cliente.', 30, 4500.00, 50, 6),
  ('Corte infantil', 'Corte para niños con atención pausada y acabado cómodo.', 40, 7000.00, 85, 7),
  ('Ritual completo', 'Corte, arreglo de barba, lavado y acabado final.', 90, 16000.00, 210, 8)
on conflict (name) do nothing;

update public.barbers set
  display_name = 'Guillermo Méndez', specialty = 'Corte clásico',
  bio = 'Cortes a tijera, líneas limpias y acabados naturales.', is_demo = false
where display_name = 'Profesional 1' and is_demo = true;
update public.barbers set
  display_name = 'Andrés Vargas', specialty = 'Barba clásica y afeitado',
  bio = 'Perfilado de barba, afeitado tradicional y acabados precisos.', is_demo = false
where display_name = 'Profesional 2' and is_demo = true;
update public.barbers set
  display_name = 'Santiago Mora', specialty = 'Cortes modernos y textura',
  bio = 'Degradados, textura y cortes actuales adaptados a cada cliente.', is_demo = false
where display_name = 'Profesional 3' and is_demo = true;
update public.barbers set bio = 'Cortes clásicos, trabajo a tijera y acabados naturales.'
where display_name = 'memo' and bio = 'Perfil de muestra; el propietario puede editarlo.';

insert into public.barbers (id, display_name, specialty, bio, is_demo) values
  ('6df7d7b6-4d4d-40bb-a33c-8f9a1bfef9b3', 'Diego Salazar', 'Cortes clásicos y tijera', 'Cortes de línea limpia, trabajo a tijera y acabado natural.', false),
  ('025f997d-4aef-40cb-8c01-ecbedf209c2d', 'Valeria Jiménez', 'Degradados y diseño', 'Degradados suaves, contornos definidos y asesoría de estilo.', false),
  ('697f00f2-fdf6-4f70-aaa2-10dbeb671b32', 'Gabriel Quesada', 'Barba y afeitado', 'Arreglo de barba y afeitado tradicional con atención al detalle.', false),
  ('e0546944-8b3e-4179-92df-8203cdc649b3', 'Nicolás Brenes', 'Cortes ejecutivos', 'Cortes sobrios, peinado y mantenimiento del estilo diario.', false),
  ('a05f7b20-1487-404c-a425-15893e352c63', 'Sebastián Chacón', 'Degradados y textura', 'Cortes actuales, textura y acabados de fácil mantenimiento.', false),
  ('4a2f1b69-3a6c-4e91-af3f-386c9617502e', 'Emilio Araya', 'Afeitado tradicional', 'Perfilado de barba y afeitado con toalla caliente.', false),
  ('29b89726-5e2b-46fd-8cda-167b15aab372', 'Lucía Porras', 'Corte personalizado y peinado', 'Consulta de estilo, corte personalizado y peinado final.', false)
on conflict (id) do nothing;

insert into public.barber_branches (barber_id, branch_id)
select a.barber_id, b.id
from (values
  ('6df7d7b6-4d4d-40bb-a33c-8f9a1bfef9b3'::uuid, 'centro'),
  ('025f997d-4aef-40cb-8c01-ecbedf209c2d'::uuid, 'centro'),
  ('697f00f2-fdf6-4f70-aaa2-10dbeb671b32'::uuid, 'oeste'),
  ('e0546944-8b3e-4179-92df-8203cdc649b3'::uuid, 'oeste'),
  ('a05f7b20-1487-404c-a425-15893e352c63'::uuid, 'esparza'),
  ('4a2f1b69-3a6c-4e91-af3f-386c9617502e'::uuid, 'esparza'),
  ('29b89726-5e2b-46fd-8cda-167b15aab372'::uuid, 'centro'),
  ('29b89726-5e2b-46fd-8cda-167b15aab372'::uuid, 'oeste')
) as a(barber_id, branch_slug)
join public.branches b on b.slug = a.branch_slug
on conflict (barber_id, branch_id) do nothing;

with shifts as (
  select barber_id, branch_slug, unnest(weekdays) as weekday, opens_at, closes_at
  from (values
    ('6df7d7b6-4d4d-40bb-a33c-8f9a1bfef9b3'::uuid, 'centro', array[2,3,4,5,6], time '10:00', time '18:00'),
    ('025f997d-4aef-40cb-8c01-ecbedf209c2d'::uuid, 'centro', array[1,2,3,4,5], time '09:00', time '17:00'),
    ('697f00f2-fdf6-4f70-aaa2-10dbeb671b32'::uuid, 'oeste', array[2,3,4,5,6], time '11:00', time '19:00'),
    ('e0546944-8b3e-4179-92df-8203cdc649b3'::uuid, 'oeste', array[1,2,3,4,5], time '10:00', time '18:00'),
    ('a05f7b20-1487-404c-a425-15893e352c63'::uuid, 'esparza', array[2,3,4,5,6], time '09:00', time '17:00'),
    ('4a2f1b69-3a6c-4e91-af3f-386c9617502e'::uuid, 'esparza', array[3,4,5], time '10:00', time '18:00'),
    ('4a2f1b69-3a6c-4e91-af3f-386c9617502e'::uuid, 'esparza', array[6], time '10:00', time '17:00'),
    ('4a2f1b69-3a6c-4e91-af3f-386c9617502e'::uuid, 'esparza', array[0], time '10:00', time '15:00'),
    ('29b89726-5e2b-46fd-8cda-167b15aab372'::uuid, 'centro', array[4,5,6], time '11:00', time '19:00'),
    ('29b89726-5e2b-46fd-8cda-167b15aab372'::uuid, 'oeste', array[1,2,3], time '11:00', time '19:00')
  ) as s(barber_id, branch_slug, weekdays, opens_at, closes_at)
)
insert into public.barber_hours (barber_id, branch_id, weekday, opens_at, closes_at)
select s.barber_id, b.id, s.weekday, s.opens_at, s.closes_at
from shifts s join public.branches b on b.slug = s.branch_slug
on conflict (barber_id, branch_id, weekday) do nothing;

-- Illustrative campaigns remain paused until their benefits are approved by the owner.
with campaigns(title, description, benefit_text, kind, visits_every, referral_benefit_text) as (
  values
    ('Bienvenido a HOME', 'Después de tu primera visita atendida, usa el beneficio en tu próxima visita.', '₡1.000 de descuento en tu próximo corte', 'welcome', null::integer, null::text),
    ('Cada cinco visitas tiene premio', 'Cada cinco visitas atendidas recibes un nuevo cupón.', 'Lavado de cortesía con tu próximo corte', 'frequency', 5, null::text),
    ('Inviten y ganen en HOME', 'Registra la invitación antes de tu primera visita. Al completarla, ambos reciben su recompensa.', '₡1.000 de descuento en tu próxima visita', 'referral', null::integer, 'Lavado de cortesía con tu próximo corte')
)
insert into public.promotions (title, description, benefit_text, kind, visits_every, referral_benefit_text, reward_valid_days, starts_at, ends_at, active, created_by)
select c.title, c.description, c.benefit_text, c.kind, c.visits_every, c.referral_benefit_text, 30,
  now(), now() + interval '90 days', false,
  (select user_id from public.staff_roles where role = 'owner' limit 1)
from campaigns c
where not exists (select 1 from public.promotions p where p.title = c.title);

commit;
