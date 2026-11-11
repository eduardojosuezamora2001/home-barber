-- Configure known, unchanged DEMO campaigns with both discount types.
-- Previously issued nonmonetary courtesy coupons keep their original benefit.
begin;
update public.promotions set discount_type='fixed',discount_value=1000
where id='d3e10000-0000-4000-8000-000000000001' and title='[DEMO] Beneficio de bienvenida'
  and discount_type='none' and benefit_text='₡1.000 de descuento en tu próxima visita';
update public.promotions set discount_type='percentage',discount_value=10,
  benefit_text='10% de descuento en tu próximo comprobante'
where id='d3e10000-0000-4000-8000-000000000002' and title='[DEMO] Premio cada cinco visitas'
  and discount_type='none' and benefit_text='Lavado de cortesía con tu próximo corte';
update public.promotions set discount_type='fixed',discount_value=1000,
  referral_discount_type='percentage',referral_discount_value=10,
  referral_benefit_text='10% de descuento en tu próximo comprobante'
where id='d3e10000-0000-4000-8000-000000000003' and title='[DEMO] Referidos para ambos'
  and discount_type='none' and benefit_text='₡1.000 de descuento en tu próxima visita'
  and referral_benefit_text='Lavado de cortesía con tu próximo corte';
update public.coupons c set discount_type='fixed',discount_value=1000
from public.promotions p where c.promotion_id=p.id
  and p.id in ('d3e10000-0000-4000-8000-000000000001','d3e10000-0000-4000-8000-000000000003')
  and p.discount_type='fixed' and p.discount_value=1000
  and c.discount_type='none' and c.benefit_text='₡1.000 de descuento en tu próxima visita';
commit;
select title,discount_type,discount_value,referral_discount_type,referral_discount_value
from public.promotions where id::text like 'd3e10000-%' order by id;
