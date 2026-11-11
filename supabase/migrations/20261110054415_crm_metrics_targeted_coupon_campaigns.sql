
alter table public.promotions drop constraint promotions_kind_check;
alter table public.promotions add constraint promotions_kind_check
  check (kind in ('legacy','welcome','frequency','referral','targeted'));

alter table public.crm_campaigns
  add column promotion_id uuid references public.promotions(id) on delete set null,
  add column discount_type text not null default 'none'
    check (discount_type in ('none','fixed','percentage')),
  add column discount_value numeric(12,2) not null default 0
    check ((discount_type='none' and discount_value=0)
      or (discount_type='fixed' and discount_value>0 and discount_value<=120000000)
      or (discount_type='percentage' and discount_value>0 and discount_value<=100)),
  add column coupon_valid_days integer not null default 30 check (coupon_valid_days between 1 and 365);

create or replace function public.crm_contact_metrics(
  p_page integer, p_page_size integer, p_branch_id uuid, p_q text,
  p_min_spent numeric, p_max_spent numeric, p_spent_from date, p_spent_to date,
  p_min_attendances integer, p_max_attendances integer,
  p_attendance_from date, p_attendance_to date,
  p_include_demo boolean, p_marketing_eligible boolean
) returns jsonb
language sql stable security invoker set search_path = ''
as $$
  with base as (
    select c.id, c.full_name, c.email, c.phone, c.source, c.profile_id,
      c.is_demo, c.created_at, c.updated_at
    from public.crm_contacts c
    where (p_include_demo or not c.is_demo)
      and (p_branch_id is null or exists (
        select 1 from public.crm_contact_branches cb
        where cb.contact_id = c.id and cb.branch_id = p_branch_id
      ))
      and (p_marketing_eligible is false or (
        not c.is_demo and c.phone is not null and c.phone <> '00000000'
        and exists (select 1 from public.crm_contact_consents cc
          where cc.contact_id = c.id and cc.channel='whatsapp' and cc.status='granted')
      ))
      and (nullif(trim(p_q), '') is null or c.full_name ilike '%' || trim(p_q) || '%'
        or coalesce(c.email,'') ilike '%' || trim(p_q) || '%'
        or coalesce(c.phone,'') ilike '%' || trim(p_q) || '%')
  ), measured as (
    select b.*,
      spend.amount as spent,
      attendance.total as attendances
    from base b
    cross join lateral (
      select coalesce(sum(r.total),0)::numeric(12,2) as amount
      from public.service_receipts r
      where b.profile_id is not null and r.client_id=b.profile_id
        and (p_branch_id is null or r.branch_id=p_branch_id)
        and (p_spent_from is null or r.issued_at >= p_spent_from::timestamptz)
        and (p_spent_to is null or r.issued_at < (p_spent_to + 1)::timestamptz)
    ) spend
    cross join lateral (
      select count(*)::integer as total from (
        select a.id
        from public.appointment_requests a
        where b.profile_id is not null and a.client_id=b.profile_id and a.status='completed'
          and (p_branch_id is null or a.branch_id=p_branch_id)
          and (p_attendance_from is null or a.requested_at >= p_attendance_from::timestamptz)
          and (p_attendance_to is null or a.requested_at < (p_attendance_to + 1)::timestamptz)
        union all
        select r.id
        from public.service_receipts r
        where b.profile_id is not null and r.client_id=b.profile_id and r.appointment_id is null
          and (p_branch_id is null or r.branch_id=p_branch_id)
          and (p_attendance_from is null or r.issued_at >= p_attendance_from::timestamptz)
          and (p_attendance_to is null or r.issued_at < (p_attendance_to + 1)::timestamptz)
      ) visits
    ) attendance
  ), filtered as (
    select * from measured
    where (p_min_spent is null or spent >= p_min_spent)
      and (p_max_spent is null or spent <= p_max_spent)
      and (p_min_attendances is null or attendances >= p_min_attendances)
      and (p_max_attendances is null or attendances <= p_max_attendances)
  ), page_rows as (
    select * from filtered order by created_at desc, id
      offset greatest(p_page-1,0) * least(greatest(p_page_size,1),100)
      limit least(greatest(p_page_size,1),100)
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'contacts', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb)
  )
$$;
revoke all on function public.crm_contact_metrics(integer,integer,uuid,text,numeric,numeric,date,date,integer,integer,date,date,boolean,boolean) from public, anon;
grant execute on function public.crm_contact_metrics(integer,integer,uuid,text,numeric,numeric,date,date,integer,integer,date,date,boolean,boolean) to authenticated;

create or replace function public.crm_create_campaign(
  p_branch_id uuid, p_name text, p_goal text, p_message_template text,
  p_discount_type text, p_discount_value numeric, p_coupon_valid_days integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign public.crm_campaigns;
  v_promotion_id uuid;
  v_benefit text;
begin
  if auth.uid() is null then raise exception 'Inicia sesión para crear una campaña'; end if;
  if not private.crm_can_access_branch(p_branch_id) then raise exception 'No tienes acceso a esta sucursal'; end if;
  if p_discount_type not in ('none','fixed','percentage')
    or (p_discount_type='none' and p_discount_value<>0)
    or (p_discount_type='fixed' and (p_discount_value<=0 or p_discount_value>120000000))
    or (p_discount_type='percentage' and (p_discount_value<=0 or p_discount_value>100))
    or p_coupon_valid_days not between 1 and 365 then
    raise exception 'El descuento de la campaña no es válido';
  end if;
  if p_discount_type <> 'none' then
    v_benefit := case when p_discount_type='percentage'
      then trim(to_char(p_discount_value,'FM999999990.##')) || '% de descuento'
      else '₡' || trim(to_char(p_discount_value,'FM999999990.00')) || ' de descuento' end;
    insert into public.promotions(
      title,description,benefit_text,branch_id,kind,reward_valid_days,
      discount_type,discount_value,starts_at,ends_at,active,created_by
    ) values (
      p_name,p_goal,v_benefit,p_branch_id,'targeted',p_coupon_valid_days,
      p_discount_type,p_discount_value,now(),now()+make_interval(days=>p_coupon_valid_days),true,auth.uid()
    ) returning id into v_promotion_id;
  end if;
  insert into public.crm_campaigns(
    branch_id,name,goal,channel,message_template,status,created_by,
    promotion_id,discount_type,discount_value,coupon_valid_days
  ) values (
    p_branch_id,p_name,p_goal,'whatsapp',p_message_template,'draft',auth.uid(),
    v_promotion_id,p_discount_type,p_discount_value,p_coupon_valid_days
  ) returning * into v_campaign;
  return to_jsonb(v_campaign);
end
$$;
revoke all on function public.crm_create_campaign(uuid,text,text,text,text,numeric,integer) from public, anon;
grant execute on function public.crm_create_campaign(uuid,text,text,text,text,numeric,integer) to authenticated;

create or replace function private.crm_issue_campaign_coupon() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_campaign public.crm_campaigns;
  v_profile_id uuid;
  v_benefit text;
begin
  select c.* into v_campaign from public.crm_campaigns c where c.id=new.campaign_id;
  if v_campaign.promotion_id is null then return new; end if;
  select profile_id into v_profile_id from public.crm_contacts where id=new.contact_id;
  if v_profile_id is null then return new; end if;
  v_benefit := case when v_campaign.discount_type='percentage'
    then trim(to_char(v_campaign.discount_value,'FM999999990.##')) || '% de descuento'
    else '₡' || trim(to_char(v_campaign.discount_value,'FM999999990.00')) || ' de descuento' end;
  perform private.issue_loyalty_reward(
    v_campaign.promotion_id,v_profile_id,'campaign:'||v_campaign.id,v_benefit
  );
  update public.coupons set discount_type=v_campaign.discount_type,
    discount_value=v_campaign.discount_value
  where promotion_id=v_campaign.promotion_id and client_id=v_profile_id
    and reward_key='campaign:'||v_campaign.id;
  return new;
end
$$;
revoke all on function private.crm_issue_campaign_coupon() from public, anon, authenticated;
create trigger crm_issue_campaign_coupon
  after insert on public.crm_campaign_recipients
  for each row execute function private.crm_issue_campaign_coupon();

drop policy "promotions eligible read" on public.promotions;
create policy "promotions eligible read" on public.promotions for select to authenticated
using ((select private.is_owner())
  or (kind='targeted' and private.crm_can_access_branch(branch_id))
  or private.promotion_eligible(id));

drop policy "coupons own or owner read" on public.coupons;
create policy "coupons own or authorized staff read" on public.coupons for select to authenticated
using (client_id=(select auth.uid()) or (select private.is_owner())
  or exists (select 1 from public.promotions p where p.id=promotion_id
    and p.kind='targeted' and private.crm_can_access_branch(p.branch_id)));

