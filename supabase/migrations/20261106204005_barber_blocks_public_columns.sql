-- Availability needs only the time and assigned barber. Keep internal labels
-- and appointment identifiers out of the public and client API roles.
revoke select on public.barber_blocks from anon, authenticated;
grant select (id, barber_id, branch_id, starts_at, ends_at)
  on public.barber_blocks to anon, authenticated;
