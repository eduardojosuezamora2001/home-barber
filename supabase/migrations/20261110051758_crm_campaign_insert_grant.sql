-- Campaign creation is restricted to authenticated staff and further scoped by RLS.
-- The original column-level INSERT grant did not create a table-level INSERT
-- privilege, which PostgREST requires for inserts through the authenticated role.
grant insert (branch_id, name, goal, channel, message_template)
  on public.crm_campaigns to authenticated;
