alter table public.service_receipts
  add column coupon_id uuid references public.coupons(id),
  add column coupon_code text,
  add column discount_amount numeric(12,2) not null default 0,
  add column discount_description text,
  add constraint service_receipts_coupon_unique unique (coupon_id),
  add constraint service_receipts_discount_valid check (discount_amount >= 0 and discount_amount <= subtotal and total = subtotal - discount_amount),
  add constraint service_receipts_discount_coupon check (coupon_id is not null or discount_amount = 0);

grant insert (coupon_id, discount_amount) on public.service_receipts to authenticated;

-- Runs after prepare_service_receipt has calculated the authoritative subtotal.
-- The coupon row lock and redemption belong to the same transaction as the receipt.
create function private.apply_receipt_coupon() returns trigger
language plpgsql security invoker set search_path = ''
as $$
declare
  v_coupon record;
begin
  new.coupon_code := null;
  new.discount_description := null;
  if new.discount_amount is null or new.discount_amount < 0 or new.discount_amount > new.subtotal then
    raise exception 'El descuento debe estar entre cero y el subtotal';
  end if;
  if new.coupon_id is null then
    if new.discount_amount <> 0 then raise exception 'Selecciona un cupón para aplicar un descuento'; end if;
    return new;
  end if;
  if not (select private.is_owner()) then raise exception 'No tienes permiso para aplicar cupones'; end if;
  select c.client_id, c.code, c.status, c.benefit_text, c.expires_at,
    p.active, p.starts_at, p.ends_at, p.branch_id
    into v_coupon
    from public.coupons c join public.promotions p on p.id = c.promotion_id
    where c.id = new.coupon_id for update of c for share of p;
  if not found or v_coupon.client_id is distinct from new.client_id then
    raise exception 'El cupón no pertenece a este cliente';
  end if;
  if v_coupon.status <> 'available' or v_coupon.expires_at <= now() or not v_coupon.active
    or now() < v_coupon.starts_at or now() > v_coupon.ends_at then
    raise exception 'El cupón ya fue canjeado, venció o su campaña no está activa';
  end if;
  if v_coupon.branch_id is not null and v_coupon.branch_id <> new.branch_id then
    raise exception 'El cupón no aplica en esta sucursal';
  end if;
  new.coupon_code := v_coupon.code;
  new.discount_description := v_coupon.benefit_text;
  new.total := new.subtotal - new.discount_amount;
  update public.coupons set status = 'redeemed' where id = new.coupon_id;
  return new;
end $$;
revoke all on function private.apply_receipt_coupon() from public, anon, authenticated;
create trigger zz_apply_receipt_coupon before insert on public.service_receipts
for each row execute function private.apply_receipt_coupon();
