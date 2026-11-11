-- PostgREST requires a table-level INSERT privilege for this insert route.
-- Row-level security still restricts campaigns to accessible branches and
-- requires created_by to match auth.uid().
grant insert on public.crm_campaigns to authenticated;
