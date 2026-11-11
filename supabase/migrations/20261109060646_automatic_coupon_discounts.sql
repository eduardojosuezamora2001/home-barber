-- Existing text-only courtesies stay nonmonetary until the campaign is configured.
alter table public.promotions
  add column discount_type text not null default 'none',
  add column discount_value numeric(12,2) not null default 0,
  add column referral_discount_type text not null default 'none',
  add column referral_discount_value numeric(12,2) not null default 0,
  add constraint promotion_discount_valid check (
    (discount_type='none' and discount_value=0) or
    (discount_type='fixed' and discount_value>0 and discount_value<=120000000) or
    (discount_type='percentage' and discount_value>0 and discount_value<=100)),
  add constraint promotion_referral_discount_valid check (
    (referral_discount_type='none' and referral_discount_value=0) or
    (referral_discount_type='fixed' and referral_discount_value>0 and referral_discount_value<=120000000) or
    (referral_discount_type='percentage' and referral_discount_value>0 and referral_discount_value<=100));
alter table public.coupons
  add column discount_type text not null default 'none',
  add column discount_value numeric(12,2) not null default 0,
  add constraint coupon_discount_valid check (
    (discount_type='none' and discount_value=0) or
    (discount_type='fixed' and discount_value>0 and discount_value<=120000000) or
    (discount_type='percentage' and discount_value>0 and discount_value<=100));
alter table public.service_receipts
  add column discount_type text not null default 'none',
  add column discount_value numeric(12,2) not null default 0;

-- This known demo benefit explicitly promises CRC 1,000; do not infer values from text.
update public.promotions set discount_type='fixed',discount_value=1000
where id='d3e10000-0000-4000-8000-000000000001'
  and title='[DEMO] Beneficio de bienvenida' and benefit_text like '%1.000%';
update public.coupons c set discount_type=p.discount_type,discount_value=p.discount_value
from public.promotions p where c.promotion_id=p.id and p.discount_type<>'none'
  and c.benefit_text=p.benefit_text;
-- Preserve the actual amount and all existing receipt totals.
update public.coupons c set discount_type='fixed',discount_value=r.discount_amount
from public.service_receipts r where r.coupon_id=c.id and r.discount_amount>0;
update public.service_receipts set discount_type='fixed',discount_value=discount_amount where discount_amount>0;

create function private.snapshot_coupon_discount() returns trigger
language plpgsql security invoker set search_path=''
as $$
begin
  select case when p.kind='referral' and new.reward_key like 'referrer:%' then p.referral_discount_type else p.discount_type end,
    case when p.kind='referral' and new.reward_key like 'referrer:%' then p.referral_discount_value else p.discount_value end
  into new.discount_type,new.discount_value from public.promotions p where p.id=new.promotion_id;
  if not found then raise exception 'Campaña no encontrada'; end if;
  return new;
end $$;
revoke all on function private.snapshot_coupon_discount() from public,anon,authenticated;
create trigger snapshot_coupon_discount before insert on public.coupons
for each row execute function private.snapshot_coupon_discount();

create or replace function private.apply_receipt_coupon() returns trigger
language plpgsql security invoker set search_path=''
as $$
declare v_coupon record;
begin
  new.coupon_code:=null;
  new.discount_description:=null;
  new.discount_amount:=0;
  new.discount_type:='none';
  new.discount_value:=0;
  new.total:=new.subtotal;
  if new.coupon_id is null then return new; end if;
  if not (select private.is_owner()) then raise exception 'No tienes permiso para aplicar cupones'; end if;
  select c.client_id,c.code,c.status,c.benefit_text,c.expires_at,c.discount_type,c.discount_value,
    p.active,p.starts_at,p.ends_at,p.branch_id into v_coupon
    from public.coupons c join public.promotions p on p.id=c.promotion_id
    where c.id=new.coupon_id for update of c for share of p;
  if not found or v_coupon.client_id is distinct from new.client_id then raise exception 'El cupón no pertenece a este cliente'; end if;
  if v_coupon.status<>'available' or v_coupon.expires_at<=now() or not v_coupon.active
    or now()<v_coupon.starts_at or now()>v_coupon.ends_at then
    raise exception 'El cupón ya fue canjeado, venció o su campaña no está activa';
  end if;
  if v_coupon.branch_id is not null and v_coupon.branch_id<>new.branch_id then raise exception 'El cupón no aplica en esta sucursal'; end if;
  new.coupon_code:=v_coupon.code;
  new.discount_description:=v_coupon.benefit_text;
  new.discount_type:=v_coupon.discount_type;
  new.discount_value:=v_coupon.discount_value;
  new.discount_amount:=round(least(new.subtotal,case v_coupon.discount_type
    when 'percentage' then new.subtotal*v_coupon.discount_value/100
    when 'fixed' then v_coupon.discount_value else 0 end),2);
  new.total:=new.subtotal-new.discount_amount;
  update public.coupons set status='redeemed' where id=new.coupon_id;
  return new;
end $$;
