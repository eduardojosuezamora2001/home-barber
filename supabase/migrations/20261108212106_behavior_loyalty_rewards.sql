-- Replace rank-based loyalty with rewards earned by completed visits.
alter table public.promotions
  add column kind text not null default 'legacy' check (kind in ('legacy', 'welcome', 'frequency', 'referral')),
  add column visits_every integer check (visits_every between 2 and 100),
  add column reward_valid_days integer not null default 30 check (reward_valid_days between 1 and 365),
  add column referral_benefit_text text,
  add constraint promotion_frequency_required check (kind <> 'frequency' or visits_every is not null),
  add constraint promotion_referral_benefit_required check (kind <> 'referral' or (referral_benefit_text is not null and length(trim(referral_benefit_text)) between 3 and 200));
create unique index one_active_referral_campaign on public.promotions(kind) where kind = 'referral' and active;

alter table public.loyalty_accounts
  add column referral_code text not null default ('INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))) unique;

alter table public.coupons
  drop constraint coupons_promotion_id_client_id_key,
  add column reward_key text not null default 'legacy',
  add column benefit_text text,
  add column expires_at timestamptz;
update public.coupons c set benefit_text = p.benefit_text, expires_at = p.ends_at
from public.promotions p where p.id = c.promotion_id;
alter table public.coupons alter column benefit_text set not null, alter column expires_at set not null;
alter table public.coupons add constraint coupons_reward_unique unique (promotion_id, client_id, reward_key);

create table public.referrals (
  invited_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  promotion_id uuid not null references public.promotions(id),
  joined_at timestamptz not null default now(),
  rewarded_at timestamptz,
  check (invited_id <> referrer_id)
);
create index referrals_referrer_idx on public.referrals(referrer_id, joined_at desc);
create index referrals_promotion_idx on public.referrals(promotion_id);
alter table public.referrals enable row level security;
revoke all on public.referrals from public, anon, authenticated;
grant select on public.referrals to authenticated;
create policy "referral participants or owner read" on public.referrals for select to authenticated
using (invited_id = (select auth.uid()) or referrer_id = (select auth.uid()) or (select private.is_owner()));

-- The new campaigns are visible before earning a coupon, so clients know the next step.
create or replace function private.promotion_eligible(p_promotion_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1 from public.promotions p
    join public.loyalty_accounts l on l.client_id = (select auth.uid())
    where p.id = p_promotion_id and (
      exists (select 1 from public.coupons c where c.promotion_id = p.id and c.client_id = (select auth.uid()))
      or (p.active and now() between p.starts_at and p.ends_at and (
        p.kind in ('frequency', 'referral') or (p.kind = 'welcome' and l.visits = 0)
        or (p.kind = 'legacy' and l.visits >= p.min_visits
          and (p.max_visits is null or l.visits <= p.max_visits) and l.points_total >= p.min_points
          and (p.inactive_days is null or l.last_visit_at <= now() - make_interval(days => p.inactive_days)))
      ))
    )
  )
$$;

-- Internal writer: never exposed as a client-callable reward endpoint.
create function private.issue_loyalty_reward(p_promotion uuid, p_client uuid, p_key text, p_benefit text)
returns void language sql security definer set search_path = ''
as $$
  insert into public.coupons(promotion_id, client_id, reward_key, benefit_text, expires_at)
  select p.id, p_client, p_key, p_benefit, least(p.ends_at, now() + make_interval(days => p.reward_valid_days))
  from public.promotions p where p.id = p_promotion and p.active and now() between p.starts_at and p.ends_at
  on conflict (promotion_id, client_id, reward_key) do nothing
$$;
revoke all on function private.issue_loyalty_reward(uuid, uuid, text, text) from public, anon, authenticated;

create function public.register_referral(p_code text) returns void
language plpgsql security definer set search_path = ''
as $$
declare v_client uuid := auth.uid(); v_referrer uuid; v_promotion uuid;
begin
  if v_client is null then raise exception 'Inicia sesión para usar una invitación'; end if;
  -- Serializes registration with visit credits, including receipts.
  perform 1 from public.loyalty_accounts where client_id = v_client and visits = 0 for update;
  if not found then raise exception 'La invitación debe registrarse antes de tu primera visita'; end if;
  if exists (select 1 from public.staff_roles where user_id = v_client) then
    raise exception 'Las invitaciones están disponibles para clientes';
  end if;
  select l.client_id into v_referrer from public.loyalty_accounts l
  where l.referral_code = upper(trim(p_code)) and not exists (select 1 from public.staff_roles s where s.user_id = l.client_id);
  if v_referrer is null or v_referrer = v_client then raise exception 'El código de invitación no es válido'; end if;
  if exists (select 1 from public.referrals where invited_id = v_client and referrer_id = v_referrer) then return; end if;
  if exists (select 1 from public.referrals where invited_id = v_client) then raise exception 'Ya registraste otra invitación'; end if;
  select p.id into v_promotion from public.promotions p where p.kind = 'referral' and p.active
    and now() between p.starts_at and p.ends_at order by p.created_at desc, p.id limit 1;
  if v_promotion is null then raise exception 'No hay una campaña de referidos vigente'; end if;
  insert into public.referrals(invited_id, referrer_id, promotion_id) values(v_client, v_referrer, v_promotion);
end $$;
revoke all on function public.register_referral(text) from public, anon;
grant execute on function public.register_referral(text) to authenticated;

create function private.reward_completed_visit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare p record; r record; v_branch uuid;
begin
  if new.visits <= old.visits then return new; end if;
  if exists (select 1 from public.staff_roles where user_id = new.client_id) then return new; end if;
  -- Credit routines provide the actual service branch for this transaction.
  v_branch := nullif(current_setting('app.loyalty_branch', true), '')::uuid;
  for p in select * from public.promotions where active and now() between starts_at and ends_at
    and (branch_id is null or branch_id = v_branch) and kind in ('welcome', 'frequency') loop
    if p.kind = 'welcome' and old.visits = 0 and new.visits = 1 then
      perform private.issue_loyalty_reward(p.id, new.client_id, 'welcome', p.benefit_text);
    elsif p.kind = 'frequency' and new.visits % p.visits_every = 0 then
      perform private.issue_loyalty_reward(p.id, new.client_id, 'visit:' || new.visits, p.benefit_text);
    end if;
  end loop;
  if old.visits = 0 and new.visits = 1 then
    select f.*, c.benefit_text, c.referral_benefit_text into r from public.referrals f
    join public.promotions c on c.id = f.promotion_id
    where f.invited_id = new.client_id and f.rewarded_at is null and c.active
      and now() between c.starts_at and c.ends_at and (c.branch_id is null or c.branch_id = v_branch)
    for update of f;
    if found and not exists (select 1 from public.staff_roles where user_id = r.referrer_id) then
      perform private.issue_loyalty_reward(r.promotion_id, r.invited_id, 'invited:' || r.invited_id, r.benefit_text);
      perform private.issue_loyalty_reward(r.promotion_id, r.referrer_id, 'referrer:' || r.invited_id, r.referral_benefit_text);
      update public.referrals set rewarded_at = now() where invited_id = r.invited_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.reward_completed_visit() from public, anon, authenticated;
create trigger reward_completed_visit after update of visits on public.loyalty_accounts
for each row execute function private.reward_completed_visit();

-- Keep appointment/receipt visit credit idempotent and remove all rank calculations.
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
    perform set_config('app.loyalty_branch', new.branch_id::text, true);
    select points into v_points from public.services where id = new.service_id;
    update public.loyalty_accounts set visits = visits + 1, points_total = points_total + coalesce(v_points, 0),
      last_visit_at = greatest(last_visit_at, new.requested_at), updated_at = now() where client_id = new.client_id;
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
    if v_status = 'confirmed' then update public.appointment_requests set status = 'completed' where id = new.appointment_id; end if;
  end if;
  if v_status is distinct from 'completed' then
    perform set_config('app.loyalty_branch', new.branch_id::text, true);
    select coalesce(sum((item->>'points')::integer), 0) into v_points from jsonb_array_elements(new.items) item;
    update public.loyalty_accounts set visits = visits + 1, points_total = points_total + v_points,
      last_visit_at = greatest(last_visit_at, new.issued_at), updated_at = now() where client_id = new.client_id;
  end if;
  return new;
end $$;

create or replace function private.on_auth_user_created() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles(id, email, full_name) values(new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  insert into public.loyalty_accounts(client_id) values(new.id);
  if lower(coalesce(new.email, '')) = 'pachadcacique@gmail.com' and new.email_confirmed_at is not null then
    insert into public.staff_roles(user_id, role) values(new.id, 'owner') on conflict(user_id) do update set role = 'owner';
  end if;
  return new;
end $$;

-- Clients cannot manufacture rewards; existing manual coupons remain claimable.
drop policy "coupons eligible claim" on public.coupons;
revoke insert on public.coupons from authenticated;
revoke insert (promotion_id, client_id) on public.coupons from authenticated;
create function public.claim_legacy_coupon(p_promotion_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.promotion_eligible(p_promotion_id) then raise exception 'No puedes reclamar este beneficio'; end if;
  insert into public.coupons(promotion_id, client_id, reward_key, benefit_text, expires_at)
  select id, auth.uid(), 'legacy', benefit_text, ends_at from public.promotions
  where id = p_promotion_id and kind = 'legacy' and active and now() between starts_at and ends_at
  on conflict (promotion_id, client_id, reward_key) do nothing;
  if not found then raise exception 'El beneficio ya fue reclamado o no está disponible'; end if;
end $$;
revoke all on function public.claim_legacy_coupon(uuid) from public, anon;
grant execute on function public.claim_legacy_coupon(uuid) to authenticated;

-- Enforce redemption conditions in the database, including concurrent requests.
create or replace function private.on_coupon_status_changed() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'redeemed' then raise exception 'Este cupón ya fue canjeado'; end if;
  if new.status = 'redeemed' then
    if not private.is_owner() then raise exception 'No tienes permiso para canjear cupones'; end if;
    if old.expires_at <= now() or not exists (select 1 from public.promotions p where p.id = old.promotion_id
      and p.active and now() between p.starts_at and p.ends_at) then raise exception 'El cupón venció o la campaña no está activa'; end if;
    new.redeemed_at := now();
  end if;
  return new;
end $$;

alter table public.promotions drop column min_rank_id;
alter table public.loyalty_accounts drop column rank_id;
drop table public.ranks;
