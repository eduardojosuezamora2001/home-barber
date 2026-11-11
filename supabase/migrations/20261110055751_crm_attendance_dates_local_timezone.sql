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
        and (p_spent_from is null or r.issued_at >= (p_spent_from::timestamp at time zone 'America/Costa_Rica'))
        and (p_spent_to is null or r.issued_at < ((p_spent_to + 1)::timestamp at time zone 'America/Costa_Rica'))
    ) spend
    cross join lateral (
      select count(*)::integer as total from (
        select a.id
        from public.appointment_requests a
        where b.profile_id is not null and a.client_id=b.profile_id and a.status='completed'
          and (p_branch_id is null or a.branch_id=p_branch_id)
          and (p_attendance_from is null or a.requested_at >= (p_attendance_from::timestamp at time zone 'America/Costa_Rica'))
          and (p_attendance_to is null or a.requested_at < ((p_attendance_to + 1)::timestamp at time zone 'America/Costa_Rica'))
          and not exists (select 1 from public.service_receipts linked where linked.appointment_id=a.id)
        union all
        select r.id
        from public.service_receipts r
        where b.profile_id is not null and r.client_id=b.profile_id
          and (p_branch_id is null or r.branch_id=p_branch_id)
          and (p_attendance_from is null or r.issued_at >= (p_attendance_from::timestamp at time zone 'America/Costa_Rica'))
          and (p_attendance_to is null or r.issued_at < ((p_attendance_to + 1)::timestamp at time zone 'America/Costa_Rica'))
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
