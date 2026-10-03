create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  owner_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id),
  unique (user_id)
);

create table if not exists public.family_invites (
  token text primary key default
    replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  family_id uuid not null references public.families(id) on delete cascade,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create unique index if not exists family_invites_one_active_per_family
  on public.family_invites(family_id)
  where active;

create table if not exists public.despesas (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  nome text not null,
  valor numeric(14, 2) not null check (valor >= 0),
  tipo text not null,
  data_vencimento date not null,
  pago boolean not null default false,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  categoria text not null,
  group_id text,
  created_at timestamptz not null default now()
);

create index if not exists despesas_family_month_idx
  on public.despesas(family_id, mes);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  nome text not null,
  cor text not null check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (family_id, nome)
);

create table if not exists public.rendas (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  mes text not null check (mes ~ '^[0-9]{4}-[0-9]{2}$'),
  renda1 numeric(14, 2) not null default 0 check (renda1 >= 0),
  renda2 numeric(14, 2) not null default 0 check (renda2 >= 0),
  unique (family_id, mes)
);

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function private.is_family_owner(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_members
    where family_id = target_family_id
      and user_id = (select auth.uid())
      and role = 'owner'
  );
$$;

revoke all on function private.is_family_member(uuid) from public, anon;
revoke all on function private.is_family_owner(uuid) from public, anon;
grant execute on function private.is_family_member(uuid) to authenticated;
grant execute on function private.is_family_owner(uuid) to authenticated;

create or replace function private.create_family(p_name text)
returns table(family_id uuid, family_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_family_id uuid;
  clean_name text := trim(p_name);
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 80 then
    raise exception 'Family name must contain between 1 and 80 characters';
  end if;
  if exists (
    select 1 from public.family_members where user_id = current_user_id
  ) then
    raise exception 'This account already belongs to a family';
  end if;

  insert into public.families(name, owner_id)
  values (clean_name, current_user_id)
  returning id into new_family_id;

  insert into public.family_members(family_id, user_id, role)
  values (new_family_id, current_user_id, 'owner');

  return query select new_family_id, clean_name;
end;
$$;

create or replace function private.create_family_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_family_id uuid;
  new_token text;
  current_user_id uuid := auth.uid();
begin
  select family_id into current_family_id
  from public.family_members
  where user_id = current_user_id and role = 'owner';
  if current_family_id is null then
    raise exception 'Only the family owner can create invitations';
  end if;

  update public.family_invites
  set active = false
  where family_id = current_family_id and active;

  insert into public.family_invites(family_id, created_by)
  values (current_family_id, current_user_id)
  returning token into new_token;

  return new_token;
end;
$$;

create or replace function private.accept_family_invite(p_token text)
returns table(family_id uuid, family_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invite_record public.family_invites%rowtype;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;
  if exists (
    select 1 from public.family_members where user_id = current_user_id
  ) then
    raise exception 'This account already belongs to a family';
  end if;

  select * into invite_record
  from public.family_invites
  where token = p_token and active
  for update;
  if not found then
    raise exception 'Invitation is invalid or expired';
  end if;

  insert into public.family_members(family_id, user_id, role)
  values (invite_record.family_id, current_user_id, 'member');

  return query
  select family.id, family.name
  from public.families as family
  where family.id = invite_record.family_id;
end;
$$;

revoke all on function private.create_family(text) from public, anon;
revoke all on function private.create_family_invite() from public, anon;
revoke all on function private.accept_family_invite(text) from public, anon;
grant execute on function private.create_family(text) to authenticated;
grant execute on function private.create_family_invite() to authenticated;
grant execute on function private.accept_family_invite(text) to authenticated;

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

revoke all on function public.create_family(text) from public, anon;
revoke all on function public.create_family_invite() from public, anon;
revoke all on function public.accept_family_invite(text) from public, anon;
grant execute on function public.create_family(text) to authenticated;
grant execute on function public.create_family_invite() to authenticated;
grant execute on function public.accept_family_invite(text) to authenticated;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.despesas enable row level security;
alter table public.categorias enable row level security;
alter table public.rendas enable row level security;

drop policy if exists "Members can view their family" on public.families;
create policy "Members can view their family"
  on public.families for select to authenticated
  using (private.is_family_member(id));

drop policy if exists "Members can view family members" on public.family_members;
create policy "Members can view family members"
  on public.family_members for select to authenticated
  using (private.is_family_member(family_id));

drop policy if exists "Owners can view family invitations" on public.family_invites;
create policy "Owners can view family invitations"
  on public.family_invites for select to authenticated
  using (private.is_family_owner(family_id));

drop policy if exists "Family members can read expenses" on public.despesas;
create policy "Family members can read expenses"
  on public.despesas for select to authenticated
  using (private.is_family_member(family_id));
drop policy if exists "Family members can add expenses" on public.despesas;
create policy "Family members can add expenses"
  on public.despesas for insert to authenticated
  with check (private.is_family_member(family_id) and user_id = (select auth.uid()));
drop policy if exists "Family members can edit expenses" on public.despesas;
create policy "Family members can edit expenses"
  on public.despesas for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
drop policy if exists "Family members can delete expenses" on public.despesas;
create policy "Family members can delete expenses"
  on public.despesas for delete to authenticated
  using (private.is_family_member(family_id));

drop policy if exists "Family members can read categories" on public.categorias;
create policy "Family members can read categories"
  on public.categorias for select to authenticated
  using (private.is_family_member(family_id));
drop policy if exists "Family members can add categories" on public.categorias;
create policy "Family members can add categories"
  on public.categorias for insert to authenticated
  with check (private.is_family_member(family_id) and user_id = (select auth.uid()));
drop policy if exists "Family members can edit categories" on public.categorias;
create policy "Family members can edit categories"
  on public.categorias for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
drop policy if exists "Family members can delete categories" on public.categorias;
create policy "Family members can delete categories"
  on public.categorias for delete to authenticated
  using (private.is_family_member(family_id));

drop policy if exists "Family members can read income" on public.rendas;
create policy "Family members can read income"
  on public.rendas for select to authenticated
  using (private.is_family_member(family_id));
drop policy if exists "Family members can add income" on public.rendas;
create policy "Family members can add income"
  on public.rendas for insert to authenticated
  with check (private.is_family_member(family_id) and user_id = (select auth.uid()));
drop policy if exists "Family members can edit income" on public.rendas;
create policy "Family members can edit income"
  on public.rendas for update to authenticated
  using (private.is_family_member(family_id))
  with check (private.is_family_member(family_id));
drop policy if exists "Family members can delete income" on public.rendas;
create policy "Family members can delete income"
  on public.rendas for delete to authenticated
  using (private.is_family_member(family_id));

revoke all on table
  public.families,
  public.family_members,
  public.family_invites,
  public.despesas,
  public.categorias,
  public.rendas
from public, anon;

grant select on public.families to authenticated;
grant select on public.family_members, public.family_invites to authenticated;
grant select, insert, update, delete on public.despesas, public.categorias, public.rendas to authenticated;

do $$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach table_name in array array['despesas', 'categorias', 'rendas'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format('alter publication supabase_realtime add table public.%I', table_name);
      end if;
    end loop;
  end if;
end;
$$;
