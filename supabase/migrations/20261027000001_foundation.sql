-- =====================================================================
-- MyN Fitness — Incremento 1: organización, perfiles, roles y auditoría
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create schema if not exists app;
grant usage on schema app to authenticated, anon;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.app_role as enum (
  'admin', 'accountant', 'treasurer', 'trainer', 'student', 'prospect'
);

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------

-- Fecha de negocio en Paraguay (las fechas de vencimiento, caja, etc. usan esta).
create or replace function app.today()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Asuncion')::date;
$$;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Gimnasios (una sede hoy; gym_id en todo lo operativo desde el inicio)
-- ---------------------------------------------------------------------
create table public.gyms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  legal_name  text,
  ruc         text,
  phone       text,
  email       text,
  address     text,
  timezone    text not null default 'America/Asuncion',
  currency    char(3) not null default 'PYG',
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger gyms_touch before update on public.gyms
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------
-- Perfiles de usuario (1:1 con auth.users)
-- ---------------------------------------------------------------------
create table public.user_profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  phone       text,
  avatar_path text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger user_profiles_touch before update on public.user_profiles
  for each row execute function app.touch_updated_at();

-- Crea el perfil al registrarse. No asigna ningún rol: los roles los da un admin.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------
-- Roles por gimnasio
-- ---------------------------------------------------------------------
create table public.user_gym_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  gym_id      uuid not null references public.gyms (id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  unique (user_id, gym_id, role)
);

create index user_gym_roles_user_idx on public.user_gym_roles (user_id);
create index user_gym_roles_gym_role_idx on public.user_gym_roles (gym_id, role);

-- ---------------------------------------------------------------------
-- Auditoría (sólo inserción, nunca edición ni borrado)
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  gym_id      uuid references public.gyms (id),
  actor_id    uuid references auth.users (id),
  action      text not null,
  entity      text not null,
  entity_id   text,
  before      jsonb,
  after       jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);

create index audit_logs_gym_created_idx on public.audit_logs (gym_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create or replace function app.audit(
  p_gym_id uuid,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (gym_id, actor_id, action, entity, entity_id, before, after, reason)
  values (p_gym_id, auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after, p_reason);
$$;

create or replace function app.audit_gym_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform app.audit(new.id, 'gym.update', 'gyms', new.id::text,
                    to_jsonb(old) - 'updated_at', to_jsonb(new) - 'updated_at');
  return new;
end;
$$;

create trigger gyms_audit after update on public.gyms
  for each row execute function app.audit_gym_update();

-- ---------------------------------------------------------------------
-- Funciones de autorización usadas por RLS
-- (security definer para evitar recursión de RLS sobre user_gym_roles)
-- ---------------------------------------------------------------------
create or replace function app.has_role(p_gym_id uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_gym_roles
    where user_id = auth.uid() and gym_id = p_gym_id and role = p_role
  );
$$;

create or replace function app.has_any_role(p_gym_id uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_gym_roles
    where user_id = auth.uid() and gym_id = p_gym_id and role = any (p_roles)
  );
$$;

create or replace function app.is_staff(p_gym_id uuid)
returns boolean
language sql
stable
as $$
  select app.has_any_role(p_gym_id, array['admin', 'accountant', 'treasurer']::public.app_role[]);
$$;

grant execute on function app.today() to anon, authenticated;
grant execute on function app.has_role(uuid, public.app_role) to authenticated;
grant execute on function app.has_any_role(uuid, public.app_role[]) to authenticated;
grant execute on function app.is_staff(uuid) to authenticated;
revoke execute on function app.audit(uuid, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.gyms enable row level security;
alter table public.user_profiles enable row level security;
alter table public.user_gym_roles enable row level security;
alter table public.audit_logs enable row level security;

-- gyms: cualquier miembro lo ve; sólo admin lo modifica.
create policy gyms_select_members on public.gyms
  for select to authenticated
  using (exists (select 1 from public.user_gym_roles r where r.user_id = auth.uid() and r.gym_id = gyms.id));

create policy gyms_update_admin on public.gyms
  for update to authenticated
  using (app.has_role(id, 'admin'))
  with check (app.has_role(id, 'admin'));

-- user_profiles: cada uno el suyo; el staff ve los perfiles de su gimnasio.
create policy profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_staff on public.user_profiles
  for select to authenticated
  using (exists (
    select 1 from public.user_gym_roles r
    where r.user_id = user_profiles.id and app.is_staff(r.gym_id)
  ));

create policy profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- user_gym_roles: cada uno ve sus roles; el admin ve los del gimnasio.
-- Nadie escribe directamente: sólo vía public.admin_set_user_role().
create policy roles_select_own on public.user_gym_roles
  for select to authenticated
  using (user_id = auth.uid());

create policy roles_select_admin on public.user_gym_roles
  for select to authenticated
  using (app.has_role(gym_id, 'admin'));

-- audit_logs: lectura para admin y contador.
create policy audit_select on public.audit_logs
  for select to authenticated
  using (app.has_any_role(gym_id, array['admin', 'accountant']::public.app_role[]));

-- ---------------------------------------------------------------------
-- RPC: gestión de usuarios (sólo admin)
-- ---------------------------------------------------------------------

-- Lista usuarios con email (auth.users no es accesible desde el cliente).
create or replace function public.admin_list_users(p_gym_id uuid, p_search text default null)
returns table (
  user_id uuid,
  email text,
  full_name text,
  phone text,
  roles public.app_role[],
  last_sign_in_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not app.has_role(p_gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select
    u.id,
    u.email::text,
    p.full_name,
    p.phone,
    coalesce(
      array_agg(r.role order by r.role) filter (where r.role is not null),
      '{}'::public.app_role[]
    ),
    u.last_sign_in_at,
    u.created_at
  from auth.users u
  join public.user_profiles p on p.id = u.id
  left join public.user_gym_roles r on r.user_id = u.id and r.gym_id = p_gym_id
  where p_search is null
     or p_search = ''
     or u.email ilike '%' || p_search || '%'
     or p.full_name ilike '%' || p_search || '%'
  group by u.id, u.email, p.full_name, p.phone, u.last_sign_in_at, u.created_at
  order by p.full_name, u.email;
end;
$$;

create or replace function public.admin_set_user_role(
  p_gym_id uuid,
  p_user_id uuid,
  p_role public.app_role,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admins int;
begin
  if not app.has_role(p_gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  if p_enabled then
    insert into public.user_gym_roles (user_id, gym_id, role, granted_by)
    values (p_user_id, p_gym_id, p_role, auth.uid())
    on conflict (user_id, gym_id, role) do nothing;

    if found then
      perform app.audit(p_gym_id, 'role.grant', 'user_gym_roles', p_user_id::text,
                        null, jsonb_build_object('role', p_role));
    end if;
  else
    if p_role = 'admin' then
      -- Serializa la comprobación del último admin.
      perform 1 from public.gyms where id = p_gym_id for update;
      select count(*) into v_admins
      from public.user_gym_roles where gym_id = p_gym_id and role = 'admin';
      if v_admins <= 1 and exists (
        select 1 from public.user_gym_roles
        where gym_id = p_gym_id and user_id = p_user_id and role = 'admin'
      ) then
        raise exception 'No se puede quitar el último administrador del gimnasio'
          using errcode = 'P0001';
      end if;
    end if;

    delete from public.user_gym_roles
    where user_id = p_user_id and gym_id = p_gym_id and role = p_role;

    if found then
      perform app.audit(p_gym_id, 'role.revoke', 'user_gym_roles', p_user_id::text,
                        jsonb_build_object('role', p_role), null);
    end if;
  end if;
end;
$$;

revoke execute on function public.admin_list_users(uuid, text) from public, anon;
revoke execute on function public.admin_set_user_role(uuid, uuid, public.app_role, boolean) from public, anon;
grant execute on function public.admin_list_users(uuid, text) to authenticated;
grant execute on function public.admin_set_user_role(uuid, uuid, public.app_role, boolean) to authenticated;
