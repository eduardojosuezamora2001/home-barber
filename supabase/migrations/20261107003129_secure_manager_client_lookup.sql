drop function public.lookup_receipt_client(text);

create function private.lookup_receipt_client_exact(p_email text)
returns table (id uuid, full_name text, email text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not ((select private.is_owner()) or (select private.is_manager())) then
    raise exception 'No tienes permiso para buscar clientes';
  end if;
  return query select p.id, p.full_name, p.email from public.profiles p
    where lower(p.email) = lower(trim(p_email)) and not exists (
      select 1 from public.staff_roles r where r.user_id = p.id
    ) limit 1;
end $$;
revoke all on function private.lookup_receipt_client_exact(text) from public, anon;
grant execute on function private.lookup_receipt_client_exact(text) to authenticated;

create function public.lookup_receipt_client(p_email text)
returns table (id uuid, full_name text, email text)
language sql stable security invoker set search_path = ''
as $$ select * from private.lookup_receipt_client_exact(p_email) $$;
revoke all on function public.lookup_receipt_client(text) from public, anon;
grant execute on function public.lookup_receipt_client(text) to authenticated;

create index service_receipts_barber_branch_idx on public.service_receipts(barber_id, branch_id);
create index service_receipts_issued_by_idx on public.service_receipts(issued_by);
