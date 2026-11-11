create function private.reject_future_receipt_appointment() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_requested_at timestamptz;
begin
  select requested_at into v_requested_at from public.appointment_requests where id = new.appointment_id;
  if v_requested_at > now() then
    raise exception 'No se puede emitir un comprobante para una cita futura';
  end if;
  return new;
end $$;

create trigger reject_future_receipt_appointment before insert on public.service_receipts
for each row when (new.appointment_id is not null)
execute function private.reject_future_receipt_appointment();
