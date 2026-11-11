-- CRM contacts are business identities; an Auth profile is optional.
-- Public inquiry writes use a service-role-only RPC, never anonymous table grants.

create table public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or char_length(phone) <= 20),
  source text not null default 'manual' check (source in ('profile','web','manual','csv','whatsapp','referral')),
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_contacts_email_idx on public.crm_contacts (lower(email)) where email is not null;
create index crm_contacts_phone_idx on public.crm_contacts (phone) where phone is not null;
create index crm_contacts_created_idx on public.crm_contacts (created_at desc, id);

create table public.crm_contact_branches (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  branch_id uuid not null references public.branches(id),
  source text not null default 'manual' check (source in ('appointment','receipt','inquiry','manual','csv')),
  created_at timestamptz not null default now(),
  primary key (contact_id, branch_id)
);
create index crm_contact_branches_branch_idx on public.crm_contact_branches (branch_id, contact_id);

create table public.crm_contact_consents (
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel text not null check (channel = 'whatsapp'),
  status text not null check (status in ('unknown','granted','revoked')),
  source text not null check (char_length(trim(source)) between 2 and 80),
  evidence text not null default '' check (char_length(evidence) <= 500),
  recorded_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (contact_id, channel),
  check (status <> 'granted' or char_length(trim(evidence)) >= 8)
);
create table public.crm_consent_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  channel text not null check (channel = 'whatsapp'),
  status text not null check (status in ('unknown','granted','revoked')),
  source text not null,
  evidence text not null default '',
  recorded_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create index crm_consent_events_contact_idx on public.crm_consent_events (contact_id, occurred_at desc, id);

create table public.crm_inquiries (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null,
  service_id uuid references public.services(id),
  barber_id uuid,
  preferred_at timestamptz,
  message text not null default '' check (char_length(message) <= 1000),
  status text not null default 'new' check (status in ('new','contacted','booked','lost')),
  source text not null default 'web' check (source in ('web','whatsapp','manual','csv')),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, branch_id) references public.crm_contact_branches(contact_id, branch_id),
  foreign key (barber_id, branch_id) references public.barber_branches(barber_id, branch_id)
);
create index crm_inquiries_branch_status_idx on public.crm_inquiries (branch_id, status, created_at desc, id);
create index crm_inquiries_contact_idx on public.crm_inquiries (contact_id, created_at desc);

create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  description text not null default '' check (char_length(description) <= 1000),
  due_at timestamptz not null,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  assigned_to uuid not null references public.profiles(id) default auth.uid(),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (contact_id, branch_id) references public.crm_contact_branches(contact_id, branch_id)
);
create index crm_tasks_due_idx on public.crm_tasks (branch_id, status, due_at, id);
create index crm_tasks_assigned_idx on public.crm_tasks (assigned_to, status, due_at);
create index crm_tasks_contact_idx on public.crm_tasks (contact_id, created_at desc);

create table public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id),
  name text not null check (char_length(trim(name)) between 3 and 120),
  goal text not null default '' check (char_length(goal) <= 300),
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  message_template text not null check (char_length(trim(message_template)) between 10 and 1500),
  status text not null default 'draft' check (status in ('draft','active','completed')),
  created_by uuid not null references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, branch_id)
);
create index crm_campaigns_branch_idx on public.crm_campaigns (branch_id, created_at desc, id);

create table public.crm_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  contact_id uuid not null,
  branch_id uuid not null,
  status text not null default 'pending' check (status in ('pending','contacted','responded','booked','converted','skipped')),
  contacted_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, contact_id),
  foreign key (campaign_id, branch_id) references public.crm_campaigns(id, branch_id) on delete cascade,
  foreign key (contact_id, branch_id) references public.crm_contact_branches(contact_id, branch_id)
);
create index crm_campaign_recipients_branch_idx on public.crm_campaign_recipients (branch_id, status, created_at desc);
create index crm_campaign_recipients_contact_idx on public.crm_campaign_recipients (contact_id, contacted_at desc);

create table public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null,
  branch_id uuid not null,
  kind text not null check (kind in ('note','call','whatsapp_opened','whatsapp_sent_confirmed','whatsapp_replied')),
  is_marketing boolean not null default false,
  body text not null default '' check (char_length(body) <= 1000),
  campaign_recipient_id uuid unique references public.crm_campaign_recipients(id) on delete set null,
  created_by uuid not null references public.profiles(id) default auth.uid(),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  foreign key (contact_id, branch_id) references public.crm_contact_branches(contact_id, branch_id),
  check (not is_marketing or kind = 'whatsapp_sent_confirmed')
);
create index crm_activities_contact_idx on public.crm_activities (contact_id, occurred_at desc, id);
create index crm_activities_marketing_idx on public.crm_activities (contact_id, occurred_at desc)
  where kind = 'whatsapp_sent_confirmed' and is_marketing;
create index crm_activities_branch_idx on public.crm_activities (branch_id, occurred_at desc);

create table public.crm_marketing_settings (
  id boolean primary key default true check (id),
  max_contacts_7_days integer not null default 1 check (max_contacts_7_days between 0 and 30),
  max_contacts_30_days integer not null default 2 check (max_contacts_30_days between 0 and 100),
  is_demo boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.crm_marketing_settings (id) values (true);

create table public.crm_service_return_intervals (
  service_id uuid primary key references public.services(id) on delete cascade,
  return_days integer not null default 28 check (return_days between 7 and 180),
  is_demo boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.crm_service_return_intervals (service_id, return_days)
select id, case name
  when 'Perfilado de barba' then 14
  when 'Afeitado tradicional' then 14
  when 'Lavado y peinado' then 14
  when 'Corte infantil' then 35
  when 'Ritual completo' then 35
  else 28
end from public.services;

alter table public.crm_contacts enable row level security;
alter table public.crm_contact_branches enable row level security;
alter table public.crm_contact_consents enable row level security;
alter table public.crm_consent_events enable row level security;
alter table public.crm_inquiries enable row level security;
alter table public.crm_tasks enable row level security;
alter table public.crm_campaigns enable row level security;
alter table public.crm_campaign_recipients enable row level security;
alter table public.crm_activities enable row level security;
alter table public.crm_marketing_settings enable row level security;
alter table public.crm_service_return_intervals enable row level security;

revoke all on public.crm_contacts, public.crm_contact_branches, public.crm_contact_consents,
  public.crm_consent_events, public.crm_inquiries, public.crm_tasks, public.crm_campaigns,
  public.crm_campaign_recipients, public.crm_activities, public.crm_marketing_settings,
  public.crm_service_return_intervals from public, anon, authenticated;
grant select on public.crm_contacts, public.crm_contact_branches, public.crm_contact_consents,
  public.crm_consent_events, public.crm_inquiries, public.crm_tasks, public.crm_campaigns,
  public.crm_campaign_recipients, public.crm_activities, public.crm_marketing_settings,
  public.crm_service_return_intervals to authenticated;
grant update (full_name, email, phone, source) on public.crm_contacts to authenticated;
grant insert (contact_id, branch_id, source) on public.crm_contact_branches to authenticated;
grant delete on public.crm_contact_branches to authenticated;
grant insert (contact_id, channel, status, source, evidence) on public.crm_contact_consents to authenticated;
grant update (status, source, evidence) on public.crm_contact_consents to authenticated;
grant insert (contact_id, branch_id, service_id, barber_id, preferred_at, message, source)
  on public.crm_inquiries to authenticated;
grant update (status, message) on public.crm_inquiries to authenticated;
grant insert (contact_id, branch_id, title, description, due_at, assigned_to) on public.crm_tasks to authenticated;
grant update (title, description, due_at, status, assigned_to) on public.crm_tasks to authenticated;
grant insert (branch_id, name, goal, channel, message_template) on public.crm_campaigns to authenticated;
grant update (name, goal, message_template, status) on public.crm_campaigns to authenticated;
grant insert (campaign_id, contact_id, branch_id, notes) on public.crm_campaign_recipients to authenticated;
grant update (status, notes) on public.crm_campaign_recipients to authenticated;
grant insert (contact_id, branch_id, kind, is_marketing, body, occurred_at) on public.crm_activities to authenticated;
grant update (max_contacts_7_days, max_contacts_30_days, is_demo) on public.crm_marketing_settings to authenticated;
grant update (return_days, is_demo) on public.crm_service_return_intervals to authenticated;

-- The public inquiry RPC runs as service_role but does not bypass application validation.
grant select, insert, update on public.crm_contacts, public.crm_contact_branches,
  public.crm_contact_consents, public.crm_inquiries to service_role;

create function private.crm_can_access_branch(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_owner() or private.is_manager_for_branch(p_branch_id) $$;
create function private.crm_can_access_contact(p_contact_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_owner() or (
    private.is_manager() and exists (
      select 1 from public.crm_contact_branches cb
      where cb.contact_id = p_contact_id and cb.branch_id = private.manager_branch()
    )
  )
$$;
create function private.crm_can_attach_contact(p_contact_id uuid, p_branch_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_owner() or (
    private.is_manager_for_branch(p_branch_id) and exists (
      select 1 from public.crm_contacts c where c.id = p_contact_id
        and c.created_by = (select auth.uid()) and c.profile_id is null
    ) and not exists (
      select 1 from public.crm_contact_branches cb where cb.contact_id = p_contact_id
    )
  )
$$;
revoke all on function private.crm_can_access_branch(uuid), private.crm_can_access_contact(uuid),
  private.crm_can_attach_contact(uuid, uuid) from public, anon;
grant execute on function private.crm_can_access_branch(uuid), private.crm_can_access_contact(uuid),
  private.crm_can_attach_contact(uuid, uuid) to authenticated;

create policy "crm contacts branch read" on public.crm_contacts for select to authenticated
using (private.crm_can_access_contact(id));
create policy "crm contacts branch update" on public.crm_contacts for update to authenticated
using (private.crm_can_access_contact(id)) with check (private.crm_can_access_contact(id));

create policy "crm contact branches staff read" on public.crm_contact_branches for select to authenticated
using (private.crm_can_access_branch(branch_id));
create policy "crm contact branches controlled insert" on public.crm_contact_branches for insert to authenticated
with check (private.crm_can_attach_contact(contact_id, branch_id));
create policy "crm contact branches owner delete" on public.crm_contact_branches for delete to authenticated
using (private.is_owner());

create policy "crm consents linked staff read" on public.crm_contact_consents for select to authenticated
using (private.crm_can_access_contact(contact_id));
create policy "crm consents linked staff insert" on public.crm_contact_consents for insert to authenticated
with check (private.crm_can_access_contact(contact_id));
create policy "crm consents linked staff update" on public.crm_contact_consents for update to authenticated
using (private.crm_can_access_contact(contact_id)) with check (private.crm_can_access_contact(contact_id));
create policy "crm consent events linked staff read" on public.crm_consent_events for select to authenticated
using (private.crm_can_access_contact(contact_id));

create policy "crm inquiries branch read" on public.crm_inquiries for select to authenticated
using (private.crm_can_access_branch(branch_id));
create policy "crm inquiries branch insert" on public.crm_inquiries for insert to authenticated
with check (private.crm_can_access_branch(branch_id));
create policy "crm inquiries branch update" on public.crm_inquiries for update to authenticated
using (private.crm_can_access_branch(branch_id)) with check (private.crm_can_access_branch(branch_id));

create policy "crm tasks branch read" on public.crm_tasks for select to authenticated
using (private.crm_can_access_branch(branch_id));
create policy "crm tasks branch insert" on public.crm_tasks for insert to authenticated
with check (private.is_owner() or (private.is_manager_for_branch(branch_id) and assigned_to = (select auth.uid())));
create policy "crm tasks assignee update" on public.crm_tasks for update to authenticated
using (private.is_owner() or (private.is_manager_for_branch(branch_id) and assigned_to = (select auth.uid())))
with check (private.is_owner() or (private.is_manager_for_branch(branch_id) and assigned_to = (select auth.uid())));

create policy "crm campaigns branch read" on public.crm_campaigns for select to authenticated
using (private.crm_can_access_branch(branch_id));
create policy "crm campaigns branch insert" on public.crm_campaigns for insert to authenticated
with check (private.crm_can_access_branch(branch_id) and created_by = (select auth.uid()));
create policy "crm campaigns branch update" on public.crm_campaigns for update to authenticated
using (private.crm_can_access_branch(branch_id)) with check (private.crm_can_access_branch(branch_id));
create policy "crm campaign recipients branch read" on public.crm_campaign_recipients for select to authenticated
using (private.crm_can_access_branch(branch_id));
create policy "crm campaign recipients branch insert" on public.crm_campaign_recipients for insert to authenticated
with check (private.crm_can_access_branch(branch_id));
create policy "crm campaign recipients branch update" on public.crm_campaign_recipients for update to authenticated
using (private.crm_can_access_branch(branch_id)) with check (private.crm_can_access_branch(branch_id));

create policy "crm activities branch read" on public.crm_activities for select to authenticated
using (private.crm_can_access_branch(branch_id));
create policy "crm activities branch insert" on public.crm_activities for insert to authenticated
with check (private.crm_can_access_branch(branch_id) and created_by = (select auth.uid()));

create policy "crm marketing settings staff read" on public.crm_marketing_settings for select to authenticated
using (private.is_owner() or private.is_manager());
create policy "crm marketing settings owner update" on public.crm_marketing_settings for update to authenticated
using (private.is_owner()) with check (private.is_owner());
create policy "crm return intervals staff read" on public.crm_service_return_intervals for select to authenticated
using (private.is_owner() or private.is_manager());
create policy "crm return intervals owner update" on public.crm_service_return_intervals for update to authenticated
using (private.is_owner()) with check (private.is_owner());

create function private.crm_normalize_contact() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  new.full_name := trim(new.full_name);
  new.email := nullif(lower(trim(new.email)), '');
  new.phone := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]', '', 'g'), '');
  new.updated_at := now();
  return new;
end $$;
create trigger crm_normalize_contact before insert or update on public.crm_contacts
for each row execute function private.crm_normalize_contact();

create function private.crm_touch_row() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); return new; end $$;
create trigger crm_touch_inquiry before update on public.crm_inquiries
for each row execute function private.crm_touch_row();
create trigger crm_touch_campaign before update on public.crm_campaigns
for each row execute function private.crm_touch_row();
create trigger crm_touch_recipient before update on public.crm_campaign_recipients
for each row execute function private.crm_touch_row();

create function private.crm_prepare_consent() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); new.recorded_by := auth.uid(); return new; end $$;
create trigger crm_prepare_consent before insert or update on public.crm_contact_consents
for each row execute function private.crm_prepare_consent();
create function private.crm_record_consent_event() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_consent_events(contact_id, channel, status, source, evidence, recorded_by)
    values(new.contact_id, new.channel, new.status, new.source, new.evidence, new.recorded_by);
  elsif (old.status, old.source, old.evidence) is distinct from (new.status, new.source, new.evidence) then
    insert into public.crm_consent_events(contact_id, channel, status, source, evidence, recorded_by)
    values(new.contact_id, new.channel, new.status, new.source, new.evidence, new.recorded_by);
  end if;
  return new;
end $$;
create trigger crm_record_consent_event after insert or update on public.crm_contact_consents
for each row execute function private.crm_record_consent_event();

create function private.crm_prepare_task() returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.status = 'done' then new.completed_at := now(); end if;
  elsif new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger crm_prepare_task before insert or update on public.crm_tasks
for each row execute function private.crm_prepare_task();

create function private.crm_touch_marketing_settings() returns trigger
language plpgsql security invoker set search_path = ''
as $$ begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger crm_touch_marketing_settings before update on public.crm_marketing_settings
for each row execute function private.crm_touch_marketing_settings();
create trigger crm_touch_return_interval before update on public.crm_service_return_intervals
for each row execute function private.crm_touch_marketing_settings();
create function private.crm_default_return_interval() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.crm_service_return_intervals(service_id) values(new.id) on conflict (service_id) do nothing;
  return new;
end $$;
create trigger crm_default_return_interval after insert on public.services
for each row execute function private.crm_default_return_interval();

revoke all on function private.crm_normalize_contact(), private.crm_touch_row(),
  private.crm_prepare_consent(), private.crm_record_consent_event(), private.crm_prepare_task(),
  private.crm_touch_marketing_settings(), private.crm_default_return_interval() from public, anon, authenticated;

-- This privileged read checks another branch's confirmed outreach without exposing its rows.
-- The frequency values are editable DEMO warnings; consent and demo exclusion are hard gates.
create function private.crm_market_eligibility(p_contact_id uuid)
returns table (allowed boolean, reason text, warning text)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_contact record;
  v_consent text;
  v_settings record;
  v_count_7 integer;
  v_count_30 integer;
begin
  allowed := false;
  reason := null;
  warning := null;
  if not private.crm_can_access_contact(p_contact_id) then
    reason := 'Sin acceso a este contacto'; return next; return;
  end if;
  select c.phone, c.is_demo, c.profile_id into v_contact
    from public.crm_contacts c where c.id = p_contact_id;
  if not found then reason := 'Contacto no encontrado'; return next; return; end if;
  if v_contact.is_demo then reason := 'Los contactos DEMO no reciben campañas'; return next; return; end if;
  if v_contact.profile_id is not null and exists (
    select 1 from public.staff_roles sr where sr.user_id = v_contact.profile_id
  ) then reason := 'El personal no recibe campañas'; return next; return; end if;
  if v_contact.phone is null or v_contact.phone !~ '^[0-9]{8,15}$' then
    reason := 'Se necesita un WhatsApp válido'; return next; return;
  end if;
  select cc.status into v_consent from public.crm_contact_consents cc
    where cc.contact_id = p_contact_id and cc.channel = 'whatsapp';
  if v_consent is distinct from 'granted' then
    reason := 'Falta consentimiento de WhatsApp'; return next; return;
  end if;
  allowed := true;
  select s.max_contacts_7_days, s.max_contacts_30_days, s.is_demo into v_settings
    from public.crm_marketing_settings s where s.id = true;
  select count(*) filter (where a.occurred_at >= now() - interval '7 days'),
    count(*) filter (where a.occurred_at >= now() - interval '30 days')
    into v_count_7, v_count_30
    from public.crm_activities a
    where a.contact_id = p_contact_id and a.kind = 'whatsapp_sent_confirmed'
      and a.is_marketing and a.occurred_at >= now() - interval '30 days';
  if (v_settings.max_contacts_7_days > 0 and v_count_7 >= v_settings.max_contacts_7_days)
    or (v_settings.max_contacts_30_days > 0 and v_count_30 >= v_settings.max_contacts_30_days) then
    warning := case when v_settings.is_demo
      then 'Se alcanzó la frecuencia DEMO de contacto; revisa antes de enviar'
      else 'Se alcanzó la frecuencia de contacto; revisa antes de enviar' end;
  end if;
  return next;
end $$;
revoke all on function private.crm_market_eligibility(uuid) from public, anon;
grant execute on function private.crm_market_eligibility(uuid) to authenticated;

create function public.crm_market_eligibility(p_contact_id uuid)
returns table (allowed boolean, reason text, warning text)
language sql stable security invoker set search_path = ''
as $$ select * from private.crm_market_eligibility(p_contact_id) $$;
revoke all on function public.crm_market_eligibility(uuid) from public, anon;
grant execute on function public.crm_market_eligibility(uuid) to authenticated;

create function private.crm_guard_marketing_activity() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_eligibility record;
begin
  if new.kind = 'whatsapp_sent_confirmed' and new.is_marketing then
    select * into v_eligibility from private.crm_market_eligibility(new.contact_id);
    if not coalesce(v_eligibility.allowed, false) then
      raise exception 'No se puede registrar este contacto comercial: %', coalesce(v_eligibility.reason, 'sin permiso');
    end if;
  end if;
  return new;
end $$;
create trigger crm_guard_marketing_activity before insert on public.crm_activities
for each row execute function private.crm_guard_marketing_activity();

create function private.crm_prepare_campaign_recipient() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_eligibility record; v_campaign_status text;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' then raise exception 'Un destinatario inicia como pendiente'; end if;
    select * into v_eligibility from private.crm_market_eligibility(new.contact_id);
    if not coalesce(v_eligibility.allowed, false) then
      raise exception 'El contacto no está disponible para campañas: %', coalesce(v_eligibility.reason, 'sin permiso');
    end if;
  elsif new.status is distinct from old.status then
    if not (
      (old.status = 'pending' and new.status in ('contacted','skipped')) or
      (old.status = 'contacted' and new.status in ('responded','booked','converted','skipped')) or
      (old.status = 'responded' and new.status in ('booked','converted','skipped')) or
      (old.status = 'booked' and new.status in ('converted','skipped'))
    ) then raise exception 'Transición de destinatario no permitida'; end if;
    if new.status = 'contacted' then
      select status into v_campaign_status from public.crm_campaigns where id = new.campaign_id;
      if v_campaign_status <> 'active' then raise exception 'Activa la campaña antes de contactar'; end if;
      select * into v_eligibility from private.crm_market_eligibility(new.contact_id);
      if not coalesce(v_eligibility.allowed, false) then
        raise exception 'El contacto ya no está disponible para campañas: %', coalesce(v_eligibility.reason, 'sin permiso');
      end if;
      new.contacted_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger crm_prepare_campaign_recipient before insert or update on public.crm_campaign_recipients
for each row execute function private.crm_prepare_campaign_recipient();

create function private.crm_record_campaign_contact() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'contacted' and old.status is distinct from 'contacted' then
    insert into public.crm_activities(contact_id, branch_id, kind, is_marketing, body,
      campaign_recipient_id, created_by, occurred_at)
    select new.contact_id, new.branch_id, 'whatsapp_sent_confirmed', true,
      'Envío manual confirmado: ' || c.name, new.id, auth.uid(), new.contacted_at
    from public.crm_campaigns c where c.id = new.campaign_id;
  end if;
  return new;
end $$;
create trigger crm_record_campaign_contact after update of status on public.crm_campaign_recipients
for each row execute function private.crm_record_campaign_contact();

revoke all on function private.crm_guard_marketing_activity(),
  private.crm_prepare_campaign_recipient(), private.crm_record_campaign_contact()
  from public, anon, authenticated;

-- The private writer performs a checked, atomic insert. The public RPC wrapper
-- stays SECURITY INVOKER; direct INSERT on contacts is not granted.
create function private.crm_create_contact(
  p_branch_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_source text default 'manual',
  p_consent_status text default null,
  p_consent_source text default null,
  p_consent_evidence text default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_contact_id uuid; v_phone text;
begin
  if not private.crm_can_access_branch(p_branch_id) then raise exception 'Sucursal no autorizada'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then
    raise exception 'Nombre de contacto inválido';
  end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  if nullif(trim(coalesce(p_email, '')), '') is null and v_phone is null then
    raise exception 'Indica correo o teléfono';
  end if;
  if p_consent_status is not null and p_consent_status not in ('unknown','granted','revoked') then
    raise exception 'Estado de consentimiento inválido';
  end if;
  if p_consent_status = 'granted' and (v_phone is null or v_phone !~ '^[0-9]{8,15}$') then
    raise exception 'Se necesita WhatsApp válido para registrar consentimiento';
  end if;
  insert into public.crm_contacts(full_name, email, phone, source)
  values(trim(p_full_name), p_email, v_phone, p_source) returning id into v_contact_id;
  insert into public.crm_contact_branches(contact_id, branch_id, source)
  values(v_contact_id, p_branch_id, case when p_source = 'csv' then 'csv' else 'manual' end);
  if p_consent_status is not null then
    insert into public.crm_contact_consents(contact_id, channel, status, source, evidence)
    values(v_contact_id, 'whatsapp', p_consent_status,
      coalesce(nullif(trim(p_consent_source), ''), p_source), coalesce(p_consent_evidence, ''));
  end if;
  return v_contact_id;
end $$;
revoke all on function private.crm_create_contact(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function private.crm_create_contact(uuid,text,text,text,text,text,text,text) to authenticated;

create function public.crm_create_contact(
  p_branch_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_source text default 'manual',
  p_consent_status text default null,
  p_consent_source text default null,
  p_consent_evidence text default null
) returns uuid
language sql security invoker set search_path = ''
as $$
  select private.crm_create_contact(p_branch_id, p_full_name, p_email, p_phone,
    p_source, p_consent_status, p_consent_source, p_consent_evidence)
$$;
revoke all on function public.crm_create_contact(uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.crm_create_contact(uuid,text,text,text,text,text,text,text) to authenticated;

-- Only the server's secret-key client may call this transaction.
-- A repeated form submission reuses a recent open inquiry and only returns its ID.
create function public.crm_submit_public_inquiry(
  p_branch_id uuid,
  p_full_name text,
  p_phone text,
  p_service_id uuid default null,
  p_barber_id uuid default null,
  p_preferred_at timestamptz default null,
  p_message text default '',
  p_marketing_opt_in boolean default false
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare v_contact_id uuid; v_inquiry_id uuid; v_phone text;
begin
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g'), '');
  if v_phone is null or v_phone !~ '^[0-9]{8,15}$' then raise exception 'WhatsApp inválido'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120 then raise exception 'Nombre inválido'; end if;
  if char_length(coalesce(p_message, '')) > 1000 then raise exception 'Mensaje demasiado largo'; end if;
  if not exists(select 1 from public.branches where id = p_branch_id and active) then
    raise exception 'Sucursal no disponible';
  end if;
  if p_service_id is not null and not exists(select 1 from public.services where id = p_service_id and active) then
    raise exception 'Servicio no disponible';
  end if;
  if p_barber_id is not null and not exists(
    select 1 from public.barbers b join public.barber_branches bb on bb.barber_id = b.id
    where b.id = p_barber_id and b.active and bb.branch_id = p_branch_id
  ) then raise exception 'Profesional no disponible'; end if;
  if p_preferred_at is not null and p_preferred_at <= now() then raise exception 'Fecha solicitada inválida'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_phone, 0));
  select c.id into v_contact_id from public.crm_contacts c
    where c.phone = v_phone order by c.created_at, c.id limit 1 for update;
  if v_contact_id is null then
    insert into public.crm_contacts(full_name, phone, source, created_by)
    values(trim(p_full_name), v_phone, 'web', null) returning id into v_contact_id;
  end if;
  insert into public.crm_contact_branches(contact_id, branch_id, source)
    values(v_contact_id, p_branch_id, 'inquiry') on conflict (contact_id, branch_id) do nothing;
  if coalesce(p_marketing_opt_in, false) then
    insert into public.crm_contact_consents(contact_id, channel, status, source, evidence, recorded_by)
    values(v_contact_id, 'whatsapp', 'granted', 'public_form', 'public_inquiry_opt_in_v1', null)
    on conflict (contact_id, channel) do update
      set status = 'granted', source = 'public_form', evidence = 'public_inquiry_opt_in_v1'
      where public.crm_contact_consents.status = 'unknown';
  end if;
  select q.id into v_inquiry_id from public.crm_inquiries q
    where q.contact_id = v_contact_id and q.branch_id = p_branch_id
      and q.service_id is not distinct from p_service_id
      and q.status = 'new' and q.created_at > now() - interval '10 minutes'
    order by q.created_at desc limit 1;
  if v_inquiry_id is not null then return v_inquiry_id; end if;
  insert into public.crm_inquiries(contact_id, branch_id, service_id, barber_id,
    preferred_at, message, source, created_by)
  values(v_contact_id, p_branch_id, p_service_id, p_barber_id,
    p_preferred_at, coalesce(p_message, ''), 'web', null)
  returning id into v_inquiry_id;
  return v_inquiry_id;
end $$;
revoke all on function public.crm_submit_public_inquiry(uuid,text,text,uuid,uuid,timestamptz,text,boolean)
  from public, anon, authenticated;
grant execute on function public.crm_submit_public_inquiry(uuid,text,text,uuid,uuid,timestamptz,text,boolean)
  to service_role;

-- Preserve existing business history, and let future walk-ins have no Auth user.
insert into public.crm_contacts(profile_id, full_name, email, phone, source, is_demo, created_by, created_at)
select p.id, left(p.full_name, 120), p.email, p.phone, 'profile',
  coalesce(p.email ~* '@example[.]com$', false), null, p.created_at
from public.profiles p
where not exists (select 1 from public.staff_roles sr where sr.user_id = p.id)
  or exists (select 1 from public.appointment_requests a where a.client_id = p.id)
  or exists (select 1 from public.service_receipts r where r.client_id = p.id)
on conflict (profile_id) do nothing;

create function private.crm_sync_profile_contact() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.crm_contacts(profile_id, full_name, email, phone, source, is_demo, created_by)
  values(new.id, left(new.full_name, 120), new.email, new.phone, 'profile',
    coalesce(new.email ~* '@example[.]com$', false), null)
  on conflict (profile_id) do update set
    full_name = excluded.full_name, email = excluded.email, phone = excluded.phone,
    is_demo = public.crm_contacts.is_demo or excluded.is_demo;
  return new;
end $$;
create trigger crm_sync_profile_contact after insert or update of full_name, email, phone
on public.profiles for each row execute function private.crm_sync_profile_contact();
revoke all on function private.crm_sync_profile_contact() from public, anon, authenticated;

insert into public.crm_contact_branches(contact_id, branch_id, source)
select distinct c.id, a.branch_id, 'appointment'
from public.appointment_requests a join public.crm_contacts c on c.profile_id = a.client_id
on conflict (contact_id, branch_id) do nothing;
insert into public.crm_contact_branches(contact_id, branch_id, source)
select distinct c.id, r.branch_id, 'receipt'
from public.service_receipts r join public.crm_contacts c on c.profile_id = r.client_id
on conflict (contact_id, branch_id) do nothing;

alter table public.appointment_requests add column contact_id uuid references public.crm_contacts(id);
alter table public.service_receipts add column contact_id uuid references public.crm_contacts(id);
update public.appointment_requests a set contact_id = c.id
from public.crm_contacts c where c.profile_id = a.client_id;
update public.service_receipts r set contact_id = c.id
from public.crm_contacts c where c.profile_id = r.client_id;
alter table public.appointment_requests alter column client_id drop not null;
alter table public.service_receipts alter column client_id drop not null;
alter table public.appointment_requests add constraint appointment_contact_required check (contact_id is not null);
alter table public.service_receipts add constraint service_receipt_contact_required check (contact_id is not null);
create index appointment_requests_contact_idx on public.appointment_requests(contact_id, requested_at desc);
create index service_receipts_contact_idx on public.service_receipts(contact_id, issued_at desc);
grant insert (contact_id) on public.appointment_requests, public.service_receipts to authenticated;

create function private.crm_link_appointment_contact() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_contact_id uuid; v_profile_id uuid;
begin
  if new.client_id is not null then
    insert into public.crm_contacts(profile_id, full_name, email, phone, source, is_demo, created_by)
    select p.id, left(p.full_name, 120), p.email, p.phone, 'profile',
      coalesce(p.email ~* '@example[.]com$', false), null
      from public.profiles p where p.id = new.client_id
    on conflict (profile_id) do nothing;
    select id into v_contact_id from public.crm_contacts where profile_id = new.client_id;
    if v_contact_id is null then raise exception 'Cliente no encontrado'; end if;
    if new.contact_id is not null and new.contact_id <> v_contact_id then
      raise exception 'El contacto no corresponde al cliente';
    end if;
    new.contact_id := v_contact_id;
  else
    if new.contact_id is null then raise exception 'Selecciona un contacto'; end if;
    if not private.is_owner() and not exists (
      select 1 from public.crm_contact_branches cb
      where cb.contact_id = new.contact_id and cb.branch_id = new.branch_id
    ) then raise exception 'Contacto fuera de la sucursal'; end if;
    select profile_id into v_profile_id from public.crm_contacts where id = new.contact_id;
    if not found then raise exception 'Contacto no encontrado'; end if;
    new.client_id := v_profile_id;
  end if;
  insert into public.crm_contact_branches(contact_id, branch_id, source)
    values(new.contact_id, new.branch_id, 'appointment')
    on conflict (contact_id, branch_id) do nothing;
  return new;
end $$;
create trigger crm_link_appointment_contact before insert on public.appointment_requests
for each row execute function private.crm_link_appointment_contact();

create function private.crm_link_receipt_contact() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_contact_id uuid; v_profile_id uuid;
begin
  if new.client_id is not null then
    insert into public.crm_contacts(profile_id, full_name, email, phone, source, is_demo, created_by)
    select p.id, left(p.full_name, 120), p.email, p.phone, 'profile',
      coalesce(p.email ~* '@example[.]com$', false), null
      from public.profiles p where p.id = new.client_id
    on conflict (profile_id) do nothing;
    select id into v_contact_id from public.crm_contacts where profile_id = new.client_id;
    if v_contact_id is null then raise exception 'Cliente no encontrado'; end if;
    if new.contact_id is not null and new.contact_id <> v_contact_id then
      raise exception 'El contacto no corresponde al cliente';
    end if;
    new.contact_id := v_contact_id;
  else
    if new.contact_id is null then raise exception 'Selecciona un contacto'; end if;
    if not private.is_owner() and not exists (
      select 1 from public.crm_contact_branches cb
      where cb.contact_id = new.contact_id and cb.branch_id = new.branch_id
    ) then raise exception 'Contacto fuera de la sucursal'; end if;
    select profile_id into v_profile_id from public.crm_contacts where id = new.contact_id;
    if not found then raise exception 'Contacto no encontrado'; end if;
    new.client_id := v_profile_id;
  end if;
  insert into public.crm_contact_branches(contact_id, branch_id, source)
    values(new.contact_id, new.branch_id, 'receipt')
    on conflict (contact_id, branch_id) do nothing;
  return new;
end $$;
create trigger crm_link_receipt_contact before insert on public.service_receipts
for each row execute function private.crm_link_receipt_contact();
revoke all on function private.crm_link_appointment_contact(), private.crm_link_receipt_contact()
  from public, anon, authenticated;

create policy "crm guest appointment staff insert" on public.appointment_requests for insert to authenticated
with check (client_id is null and contact_id is not null and status = 'pending'
  and requested_at > now() and private.crm_can_access_branch(branch_id));

create or replace function private.prepare_service_receipt() returns trigger
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
  if not exists (select 1 from public.barber_branches bb
    where bb.barber_id = new.barber_id and bb.branch_id = new.branch_id) then
    raise exception 'El empleado no pertenece a esta sucursal';
  end if;
  if new.client_id is not null then
    select full_name, email into new.client_name, new.client_email
      from public.profiles where id = new.client_id;
  else
    select full_name, email into new.client_name, new.client_email
      from public.crm_contacts where id = new.contact_id;
  end if;
  if not found then raise exception 'Cliente no encontrado'; end if;
  select display_name into new.barber_name from public.barbers where id = new.barber_id;
  select name into new.branch_name from public.branches where id = new.branch_id;
  if jsonb_typeof(new.items) is distinct from 'array' or jsonb_array_length(new.items) not between 1 and 12 then
    raise exception 'Selecciona entre uno y doce servicios';
  end if;
  for v_item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Servicio inválido'; end if;
    select id, name, points into v_service from public.services
      where id = (v_item->>'serviceId')::uuid and active;
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
        and contact_id = new.contact_id and barber_id = new.barber_id;
    if v_status is null or v_status not in ('confirmed', 'completed') then
      raise exception 'La cita no corresponde al contacto, empleado y sucursal';
    end if;
  end if;
  new.items := v_items;
  new.subtotal := v_total;
  new.total := v_total;
  return new;
end $$;

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
  if new.client_id is not null and new.status = 'completed' and old.status <> 'completed'
    and not exists (select 1 from public.service_receipts where appointment_id = new.id) then
    perform set_config('app.loyalty_branch', new.branch_id::text, true);
    select points into v_points from public.services where id = new.service_id;
    update public.loyalty_accounts set visits = visits + 1,
      points_total = points_total + coalesce(v_points, 0),
      last_visit_at = greatest(last_visit_at, new.requested_at), updated_at = now()
      where client_id = new.client_id;
  end if;
  return new;
end $$;

create or replace function private.credit_service_receipt() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_status text; v_points integer;
begin
  if new.appointment_id is not null then
    select status into v_status from public.appointment_requests where id = new.appointment_id for update;
    if v_status = 'confirmed' then
      update public.appointment_requests set status = 'completed' where id = new.appointment_id;
    end if;
  end if;
  if new.client_id is null then return new; end if;
  if v_status is distinct from 'completed' then
    perform set_config('app.loyalty_branch', new.branch_id::text, true);
    select coalesce(sum((item->>'points')::integer), 0) into v_points
      from jsonb_array_elements(new.items) item;
    update public.loyalty_accounts set visits = visits + 1,
      points_total = points_total + v_points,
      last_visit_at = greatest(last_visit_at, new.issued_at), updated_at = now()
      where client_id = new.client_id;
  end if;
  return new;
end $$;
