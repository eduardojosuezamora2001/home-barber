-- Only the caller's current, confirmed, non-revoked session can obtain a role.
-- Roles come from staff_roles, never from editable user metadata.
create function private.current_session_context()
returns table (user_id uuid, email text, role text, branch_id uuid)
language sql stable security definer set search_path = ''
as $$
  select u.id, u.email::text, coalesce(r.role, 'client'), r.branch_id
  from auth.sessions s
  join auth.users u on u.id = s.user_id
  left join public.staff_roles r on r.user_id = u.id
  where (select auth.uid()) is not null
    and s.user_id = (select auth.uid())
    and s.id = nullif((select auth.jwt())->>'session_id', '')::uuid
    and (s.not_after is null or s.not_after > now())
    and u.deleted_at is null and u.email_confirmed_at is not null
    and (u.banned_until is null or u.banned_until <= now())
$$;
revoke all on function private.current_session_context() from public, anon;
grant execute on function private.current_session_context() to authenticated;

create function public.current_session_context()
returns table (user_id uuid, email text, role text, branch_id uuid)
language sql stable security invoker set search_path = ''
as $$ select * from private.current_session_context() $$;
revoke all on function public.current_session_context() from public, anon;
grant execute on function public.current_session_context() to authenticated;
