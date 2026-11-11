-- Require a live session for privileged RLS and RPC checks, even when someone
-- calls PostgREST directly with a JWT issued before logout or account banning.
create function private.has_active_session() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from private.current_session_context()) $$;
revoke all on function private.has_active_session() from public, anon;
grant execute on function private.has_active_session() to authenticated;

create or replace function private.is_owner() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_active_session() and exists (
  select 1 from public.staff_roles where user_id = (select auth.uid()) and role = 'owner'
) $$;

create or replace function private.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_active_session() and exists (
  select 1 from public.staff_roles where user_id = (select auth.uid()) and role = 'manager'
) $$;

create or replace function private.manager_branch() returns uuid
language sql stable security definer set search_path = ''
as $$ select branch_id from public.staff_roles
  where private.has_active_session() and user_id = (select auth.uid()) and role = 'manager'
$$;

create or replace function private.is_manager_for_branch(p_branch_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_active_session() and exists (
  select 1 from public.staff_roles where user_id = (select auth.uid()) and role = 'manager' and branch_id = p_branch_id
) $$;

create or replace function private.is_barber_for(p_barber_id uuid) returns boolean
language sql stable security definer set search_path = ''
as $$ select private.has_active_session() and exists (
  select 1 from public.barbers b join public.staff_roles r on r.user_id = b.user_id and r.role = 'barber'
  where b.id = p_barber_id and b.user_id = (select auth.uid())
) $$;
