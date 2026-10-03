begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_family_member(uuid) set schema private;
alter function public.is_family_owner(uuid) set schema private;
alter function public.create_family(text) set schema private;
alter function public.create_family_invite() set schema private;
alter function public.accept_family_invite(text) set schema private;

alter function private.is_family_member(uuid) set search_path = '';
alter function private.is_family_owner(uuid) set search_path = '';
alter function private.create_family(text) set search_path = '';
alter function private.create_family_invite() set search_path = '';
alter function private.accept_family_invite(text) set search_path = '';

revoke all on function private.is_family_member(uuid) from public, anon, authenticated;
revoke all on function private.is_family_owner(uuid) from public, anon, authenticated;
revoke all on function private.create_family(text) from public, anon, authenticated;
revoke all on function private.create_family_invite() from public, anon, authenticated;
revoke all on function private.accept_family_invite(text) from public, anon, authenticated;

grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_owner(uuid) to authenticated;
grant execute on function private.create_family(text) to authenticated;
grant execute on function private.create_family_invite() to authenticated;
grant execute on function private.accept_family_invite(text) to authenticated;

create or replace function public.is_family_member(p_target_family_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.is_family_member(p_target_family_id);
$$;

create or replace function public.is_family_owner(p_target_family_id uuid)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select private.is_family_owner(p_target_family_id);
$$;

create or replace function public.create_family(p_name text)
returns table(family_id uuid, family_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_family(p_name);
$$;

create or replace function public.create_family_invite()
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.create_family_invite();
$$;

create or replace function public.accept_family_invite(p_token text)
returns table(family_id uuid, family_name text)
language sql
security invoker
set search_path = ''
as $$
  select * from private.accept_family_invite(p_token);
$$;

revoke all on function public.is_family_member(uuid) from public, anon;
revoke all on function public.is_family_owner(uuid) from public, anon;
revoke all on function public.create_family(text) from public, anon;
revoke all on function public.create_family_invite() from public, anon;
revoke all on function public.accept_family_invite(text) from public, anon;

grant execute on function public.is_family_member(uuid) to authenticated;
grant execute on function public.is_family_owner(uuid) to authenticated;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.create_family_invite() to authenticated;
grant execute on function public.accept_family_invite(text) to authenticated;

commit;
