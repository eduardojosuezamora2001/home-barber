-- Optional extension: 18 receipts, including four with a redeemed discount coupon.
-- Requires the demo clients, their active welcome campaign and receipt_coupon_discounts.
-- Re-running preserves existing receipts, coupons and visit credits.
begin;
create temporary table demo_discount_session(id uuid primary key) on commit drop;
insert into demo_discount_session values(gen_random_uuid());
insert into auth.sessions(id,user_id,created_at,updated_at)
select id,(select user_id from public.staff_roles where role='owner' order by user_id limit 1),now(),now() from demo_discount_session;
select set_config('request.jwt.claims',jsonb_build_object('session_id',(select id from demo_discount_session))::text,true);

do $$
declare
  v_owner uuid; v_client uuid; v_receipt uuid; v_coupon uuid; v_promotion record;
  v_assignment record; v_service record; v_extra record; v_items jsonb;
  v_assignment_count integer; v_subtotal numeric; v_issued timestamptz; i integer;
begin
  select user_id into v_owner from public.staff_roles where role='owner' order by user_id limit 1;
  if v_owner is null then raise exception 'Se necesita una cuenta de propietario'; end if;
  if (select count(*) from auth.users u where u.id in (
    'd3e00000-0000-4000-8000-000000000003','d3e00000-0000-4000-8000-000000000004','d3e00000-0000-4000-8000-000000000006'
  ) and u.raw_app_meta_data->>'demo_account'='true' and not exists(select 1 from public.staff_roles s where s.user_id=u.id)) <> 3 then
    raise exception 'Carga primero las cuentas DEMO; esta carga solo modifica clientes de ejemplo';
  end if;
  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  select * into v_promotion from public.promotions where id='d3e10000-0000-4000-8000-000000000001'
    and active and kind='welcome' and discount_type='fixed' and discount_value=1000 and now() between starts_at and ends_at;
  if not found then raise exception 'La campaña DEMO de bienvenida debe estar activa, vigente y configurada como descuento fijo de 1000 colones'; end if;
  select count(*) into v_assignment_count from public.barber_branches bb
    join public.branches b on b.id=bb.branch_id join public.barbers br on br.id=bb.barber_id
    where b.active and br.active and (v_promotion.branch_id is null or b.id=v_promotion.branch_id);
  if v_assignment_count=0 then raise exception 'Se necesita una sucursal con barberos activos'; end if;
  if not exists(select 1 from public.services where active) then raise exception 'Se necesitan servicios activos'; end if;

  for i in 1..18 loop
    v_receipt:=('d3e30000-0000-4000-8000-'||lpad((910000+i)::text,12,'0'))::uuid;
    if exists(select 1 from public.service_receipts where id=v_receipt) then continue; end if;
    v_client:=case i%3 when 1 then 'd3e00000-0000-4000-8000-000000000003'::uuid
      when 2 then 'd3e00000-0000-4000-8000-000000000004'::uuid else 'd3e00000-0000-4000-8000-000000000006'::uuid end;
    select bb.branch_id,bb.barber_id into v_assignment from public.barber_branches bb
      join public.branches b on b.id=bb.branch_id join public.barbers br on br.id=bb.barber_id
      where b.active and br.active and (v_promotion.branch_id is null or b.id=v_promotion.branch_id)
      order by b.name,br.display_name,bb.barber_id offset ((i-1)%v_assignment_count) limit 1;
    select id,price into v_service from public.services where active order by sort_order,id offset ((i-1)%(select count(*) from public.services where active)) limit 1;
    if not found then raise exception 'Se necesitan servicios activos'; end if;
    v_subtotal:=greatest(coalesce(v_service.price,8500),2000);
    v_items:=jsonb_build_array(jsonb_build_object('serviceId',v_service.id,'quantity',1,'unitPrice',v_subtotal));
    if i%2=0 then
      select id,price into v_extra from public.services where active and id<>v_service.id order by sort_order,id limit 1;
      if found then
        v_items:=v_items||jsonb_build_array(jsonb_build_object('serviceId',v_extra.id,'quantity',1,'unitPrice',coalesce(v_extra.price,4500)));
        v_subtotal:=v_subtotal+coalesce(v_extra.price,4500);
      end if;
    end if;
    v_coupon:=null;
    v_issued:=now()-make_interval(days=>18-i,hours=>i%5);
    if i%4=0 then
      v_coupon:=('d3e40000-0000-4000-8000-'||lpad((910000+i)::text,12,'0'))::uuid;
      v_issued:=greatest(now()-make_interval(hours=>18-i),v_promotion.starts_at);
      insert into public.coupons(id,promotion_id,client_id,reward_key,benefit_text,claimed_at,expires_at)
      values(v_coupon,v_promotion.id,v_client,'demo-receipt-'||i,v_promotion.benefit_text,
        greatest(v_promotion.starts_at,v_issued-interval '1 minute'),least(now()+interval '30 days',v_promotion.ends_at));
    end if;
    insert into public.service_receipts(id,branch_id,client_id,barber_id,issued_by,issued_at,items,note,coupon_id)
    values(v_receipt,v_assignment.branch_id,v_client,v_assignment.barber_id,v_owner,v_issued,v_items,
      '[DEMO] Ejemplo adicional '||i||case when v_coupon is null then ': cobro completo.' else ': descuento de bienvenida aplicado al cobrar.' end||' Datos ficticios para pruebas.',v_coupon);
  end loop;
  if (select count(*) from public.service_receipts where id::text between 'd3e30000-0000-4000-8000-000000910001' and 'd3e30000-0000-4000-8000-000000910018')<>18 then
    raise exception 'La carga no generó los 18 comprobantes esperados';
  end if;
end $$;
delete from auth.sessions where id in(select id from demo_discount_session);
commit;
select count(*) as additional_receipts,count(*) filter(where discount_amount>0) as discounted_receipts,
  sum(subtotal) as subtotal,sum(discount_amount) as discounts,sum(total) as total
from public.service_receipts where id::text between 'd3e30000-0000-4000-8000-000000910001' and 'd3e30000-0000-4000-8000-000000910018';
