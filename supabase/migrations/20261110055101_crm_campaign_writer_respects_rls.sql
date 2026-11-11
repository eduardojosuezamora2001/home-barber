
drop policy if exists "targeted promotions staff insert" on public.promotions;
create policy "targeted promotions staff insert" on public.promotions
for insert to authenticated
with check (kind='targeted' and private.crm_can_access_branch(branch_id)
  and created_by=(select auth.uid()));

create or replace function public.crm_create_campaign(
  p_branch_id uuid, p_name text, p_goal text, p_message_template text,
  p_discount_type text, p_discount_value numeric, p_coupon_valid_days integer
) returns jsonb
language plpgsql security invoker set search_path = ''
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
create index if not exists crm_campaigns_promotion_idx
  on public.crm_campaigns(promotion_id) where promotion_id is not null;

