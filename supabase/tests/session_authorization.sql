begin;
create function pg_temp.check_access(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', message; end if; end $$;

insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('71000000-0000-4000-8000-000000000001','session-a@example.invalid',now(),'{"full_name":"Session test A","role":"owner"}'),
('71000000-0000-4000-8000-000000000002','session-b@example.invalid',now(),'{"full_name":"Session test B"}');
insert into auth.sessions(id,user_id,created_at,updated_at) values
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001',now(),now()),
('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002',now(),now());
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","session_id":"72000000-0000-4000-8000-000000000001","user_metadata":{"role":"owner"}}',true);
set local role authenticated;
select pg_temp.check_access((select role='client' and user_id='71000000-0000-4000-8000-000000000001' from public.current_session_context()),'Editable metadata must not grant owner access');
reset role;

insert into public.staff_roles(user_id,role) values('71000000-0000-4000-8000-000000000001','owner');
set local role authenticated;
select pg_temp.check_access((select role='owner' from public.current_session_context()),'Live role must reflect staff_roles');
reset role;
delete from public.staff_roles where user_id='71000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_access((select role='client' from public.current_session_context()),'Removing an owner must take effect without refreshing the JWT');
reset role;

select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","session_id":"72000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
select pg_temp.check_access((select count(*)=0 from public.current_session_context()),'A session cannot be used by a different user');
reset role;
select set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","session_id":"72000000-0000-4000-8000-000000000001"}',true);

insert into public.staff_roles(user_id,role) values('71000000-0000-4000-8000-000000000001','owner');
set local role authenticated;
select pg_temp.check_access(private.is_owner(),'A current owner session must pass privileged RLS');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id='71000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_access((select count(*)=0 from public.current_session_context()),'Banned users cannot access API routes');
select pg_temp.check_access(not private.is_owner(),'Banned owners cannot pass privileged RLS');
reset role;
update auth.users set banned_until=null where id='71000000-0000-4000-8000-000000000001';
update auth.sessions set not_after=now()-interval '1 second' where id='72000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_access((select count(*)=0 from public.current_session_context()),'Expired sessions cannot access API routes');
select pg_temp.check_access(not private.is_owner(),'Expired owner sessions cannot pass privileged RLS');
reset role;
delete from auth.sessions where id='72000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.check_access((select count(*)=0 from public.current_session_context()),'Revoked sessions cannot access API routes');
select pg_temp.check_access(not private.is_owner(),'Revoked owners cannot pass privileged RLS');
do $$ begin
  begin
    insert into public.services(name,duration_minutes) values('Revoked session must not create this service',30);
    raise exception 'FAIL: Revoked owner wrote directly to services';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.check_access(not has_function_privilege('anon','public.current_session_context()','EXECUTE'),'Anonymous users cannot call session context');
select pg_temp.check_access(not (select prosecdef from pg_proc where oid='public.current_session_context()'::regprocedure),'The public RPC must not run as security definer');
select 'PASS: current session, live roles, metadata forgery, isolation, bans, expiration and revocation' as result;
rollback;
