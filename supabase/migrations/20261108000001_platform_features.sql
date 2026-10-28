-- =====================================================================
-- MyN Fitness — Super admin (proveedor de la plataforma) y control de funciones.
--   * app.platform_admins: quién es super admin. Sin acceso por API: se carga
--     sólo por SQL. El admin del gimnasio no puede tocarlo.
--   * app.features: catálogo de funciones, con los roles que normalmente la usan.
--   * feature_settings: por gimnasio, función prendida/apagada y roles a los que
--     se les quita. Sin fila = como siempre (todo habilitado).
--   * check_request(): se ejecuta antes de cada pedido a la API (PostgREST
--     db_pre_request). Si la RPC o la escritura corresponde a una función que el
--     usuario tiene deshabilitada, la rechaza. Las lecturas siguen por RLS.
-- =====================================================================

create table app.platform_admins (
  user_id     uuid primary key references auth.users (id),
  created_at  timestamptz not null default now()
);
revoke all on app.platform_admins from public, anon, authenticated;

create table app.features (
  key    text primary key,
  area   text not null,
  label  text not null,
  roles  public.app_role[] not null,
  sort   int not null
);
revoke all on app.features from public, anon, authenticated;

insert into app.features (key, area, label, roles, sort) values
  ('dashboard',           'Resumen',       'Dashboard',                               '{admin,accountant}', 10),
  ('checkin',             'Recepción',     'Control de ingreso',                      '{admin,treasurer,cashier}', 20),
  ('quick_sale',          'Recepción',     'Venta rápida',                            '{admin,treasurer,cashier}', 21),
  ('turnstile',           'Recepción',     'Molinete',                                '{admin}', 22),
  ('collect',             'Caja',          'Cobrar cuota',                            '{admin,treasurer,cashier}', 30),
  ('cash',                'Caja',          'Caja: apertura, cierre y movimientos',    '{admin,treasurer,cashier}', 31),
  ('payments',            'Caja',          'Cobranzas y anulación de cobros',         '{admin,accountant,treasurer}', 32),
  ('expenses',            'Caja',          'Egresos',                                 '{admin,accountant,treasurer}', 33),
  ('invoicing',           'Facturación',   'Facturación electrónica',                 '{admin,accountant,treasurer,cashier}', 40),
  ('students',            'Gestión',       'Alumnos',                                 '{admin,accountant,treasurer}', 50),
  ('memberships',         'Gestión',       'Cuotas y membresías',                     '{admin,accountant,treasurer}', 51),
  ('trainers',            'Gestión',       'Entrenadores',                            '{admin}', 52),
  ('leads',               'Comercial',     'Prospectos',                              '{admin,treasurer}', 60),
  ('catalog',             'Catálogo',      'Planes, servicios y medios de pago',      '{admin}', 70),
  ('users',               'Administración','Usuarios',                                '{admin}', 80),
  ('audit',               'Administración','Auditoría',                               '{admin,accountant}', 81),
  ('settings',            'Administración','Configuración',                           '{admin}', 82),
  ('trainer_students',    'Entrenador',    'Mis alumnos',                             '{trainer}', 90),
  ('portal_membership',   'Portal del alumno', 'Mi membresía',                        '{student}', 100),
  ('portal_receipts',     'Portal del alumno', 'Mis recibos',                         '{student}', 101),
  ('portal_training',     'Portal del alumno', 'Mis entrenamientos',                  '{student}', 102),
  ('portal_achievements', 'Portal del alumno', 'Logros y compartir',                  '{student}', 103),
  ('portal_ranking',      'Portal del alumno', 'Ranking del mes',                     '{student}', 104);

-- Endpoints de la API que pertenecen a cada función. 'rpc/x' = siempre;
-- una tabla = sólo escrituras (POST, PATCH, PUT, DELETE).
create table app.feature_endpoints (
  endpoint  text primary key,
  feature   text not null references app.features (key)
);
revoke all on app.feature_endpoints from public, anon, authenticated;

insert into app.feature_endpoints (endpoint, feature) values
  ('rpc/dashboard_summary', 'dashboard'),
  ('rpc/check_access', 'checkin'),
  ('rpc/register_check_in', 'checkin'),
  ('rpc/quick_sale', 'quick_sale'),
  ('rpc/register_payment', 'collect'),
  ('rpc/open_cash_session', 'cash'),
  ('rpc/close_cash_session', 'cash'),
  ('rpc/register_cash_adjustment', 'cash'),
  ('rpc/void_payment', 'payments'),
  ('rpc/register_expense', 'expenses'),
  ('rpc/void_expense', 'expenses'),
  ('rpc/invoice_draft', 'invoicing'),
  ('rpc/register_invoice', 'invoicing'),
  ('rpc/cancel_invoice', 'invoicing'),
  ('students', 'students'),
  ('rpc/link_student_user', 'students'),
  ('rpc/enroll_membership', 'memberships'),
  ('rpc/renew_subscription', 'memberships'),
  ('rpc/pause_subscription', 'memberships'),
  ('rpc/cancel_subscription', 'memberships'),
  ('rpc/void_charge', 'memberships'),
  ('rpc/run_membership_jobs', 'memberships'),
  ('trainers', 'trainers'),
  ('trainer_student_assignments', 'trainers'),
  ('leads', 'leads'),
  ('membership_plans', 'catalog'),
  ('services', 'catalog'),
  ('payment_methods', 'catalog'),
  ('rpc/admin_list_users', 'users'),
  ('rpc/admin_set_user_role', 'users'),
  ('gyms', 'settings'),
  ('rpc/attendance_ranking', 'portal_ranking'),
  ('rpc/set_ranking_opt_out', 'portal_ranking');

create table public.feature_settings (
  id              uuid not null default gen_random_uuid() unique,
  gym_id         uuid not null references public.gyms (id),
  feature         text not null references app.features (key),
  enabled         boolean not null default true,
  disabled_roles  public.app_role[] not null default '{}',
  updated_by      uuid references auth.users (id) default auth.uid(),
  updated_at      timestamptz not null default now(),
  primary key (gym_id, feature)
);

create trigger feature_settings_audit after insert or update on public.feature_settings
  for each row execute function app.audit_row();

alter table public.feature_settings enable row level security;
revoke insert, update, delete, truncate on public.feature_settings from anon, authenticated;
revoke all on public.feature_settings from anon;
grant select on public.feature_settings to authenticated;
create policy feature_settings_select on public.feature_settings
  for select to authenticated
  using (exists (select 1 from public.user_gym_roles r where r.user_id = auth.uid() and r.gym_id = feature_settings.gym_id));

-- Los interruptores del portal pasan de gyms.module_* a feature_settings.
insert into public.feature_settings (gym_id, feature, enabled, updated_by)
select g.id, f.feature, false, null
from public.gyms g
cross join lateral (values
  ('portal_training', g.module_training),
  ('portal_achievements', g.module_achievements),
  ('portal_ranking', g.module_ranking)
) as f (feature, on_)
where not f.on_;

comment on column public.gyms.module_training is 'Obsoleto: reemplazado por feature_settings (portal_training).';
comment on column public.gyms.module_achievements is 'Obsoleto: reemplazado por feature_settings (portal_achievements).';
comment on column public.gyms.module_ranking is 'Obsoleto: reemplazado por feature_settings (portal_ranking).';

-- ---------------------------------------------------------------------
-- Reglas
-- ---------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.platform_admins where user_id = auth.uid());
$$;

-- ¿El usuario actual puede usar la función en el gimnasio? Necesita algún rol
-- de los que usan la función que no esté deshabilitado. El super admin, siempre.
create or replace function app.feature_allowed(p_gym_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin()
      or not exists (select 1 from app.features f where f.key = p_feature)
      or exists (
        select 1
        from app.features f
        join public.user_gym_roles r on r.user_id = auth.uid() and r.gym_id = p_gym_id and r.role = any (f.roles)
        left join public.feature_settings s on s.gym_id = p_gym_id and s.feature = f.key
        where f.key = p_feature
          and coalesce(s.enabled, true)
          and not (r.role = any (coalesce(s.disabled_roles, '{}')))
      );
$$;

-- Funciones habilitadas para el usuario actual (menú y pantallas).
create or replace function public.my_features(p_gym_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'superadmin', app.is_platform_admin(),
    'features', coalesce((select jsonb_agg(f.key order by f.sort) from app.features f where app.feature_allowed(p_gym_id, f.key)), '[]'::jsonb)
  );
$$;

create or replace function public.feature_allowed(p_gym_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.feature_allowed(p_gym_id, p_feature);
$$;

-- Tabla de control para el super admin.
create or replace function public.feature_matrix(p_gym_id uuid)
returns table (key text, area text, label text, roles public.app_role[], enabled boolean, disabled_roles public.app_role[])
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
  select f.key, f.area, f.label, f.roles, coalesce(s.enabled, true), coalesce(s.disabled_roles, '{}')
  from app.features f
  left join public.feature_settings s on s.gym_id = p_gym_id and s.feature = f.key
  order by f.sort;
end;
$$;

create or replace function public.set_feature(p_gym_id uuid, p_feature text, p_enabled boolean, p_disabled_roles public.app_role[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles public.app_role[];
begin
  if not app.is_platform_admin() then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  select roles into v_roles from app.features where key = p_feature;
  if v_roles is null then
    raise exception 'Función inexistente' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.gyms where id = p_gym_id) then
    raise exception 'Gimnasio inexistente' using errcode = 'P0001';
  end if;

  insert into public.feature_settings (gym_id, feature, enabled, disabled_roles, updated_by, updated_at)
  values (
    p_gym_id, p_feature, coalesce(p_enabled, true),
    -- Sólo roles que usan la función, sin repetir.
    array(select distinct x from unnest(coalesce(p_disabled_roles, '{}')) x where x = any (v_roles) order by 1),
    auth.uid(), now()
  )
  on conflict (gym_id, feature) do update
    set enabled = excluded.enabled, disabled_roles = excluded.disabled_roles,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;

-- ¿El usuario es super admin? (para que el admin del gimnasio no pueda tocar su cuenta)
create or replace function public.is_platform_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app.platform_admins where user_id = p_user_id);
$$;

-- ---------------------------------------------------------------------
-- Control antes de cada pedido a la API (PostgREST db_pre_request).
-- ---------------------------------------------------------------------
create or replace function public.check_request()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_path text := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  v_method text := upper(coalesce(current_setting('request.method', true), 'GET'));
  v_feature text;
begin
  if auth.uid() is null or v_path = '' then
    return;
  end if;
  if v_path not like 'rpc/%' and v_method in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;
  select feature into v_feature from app.feature_endpoints where endpoint = v_path;
  if v_feature is null or app.is_platform_admin() then
    return;
  end if;
  if not exists (
    select 1 from (select distinct gym_id from public.user_gym_roles where user_id = auth.uid()) g
    where app.feature_allowed(g.gym_id, v_feature)
  ) then
    raise exception 'Esta función está deshabilitada para su perfil' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- El admin del gimnasio no puede cambiar los perfiles del super admin.
-- ---------------------------------------------------------------------
create or replace function app.protect_platform_admin_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if auth.uid() is not null
     and exists (select 1 from app.platform_admins where user_id = v_target)
     and not app.is_platform_admin() then
    raise exception 'Los perfiles del super admin sólo los puede cambiar el super admin' using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger user_gym_roles_protect_platform before insert or update or delete on public.user_gym_roles
  for each row execute function app.protect_platform_admin_roles();

-- ---------------------------------------------------------------------
-- El ranking usa el control de funciones.
-- ---------------------------------------------------------------------
create or replace function public.attendance_ranking(p_gym_id uuid, p_month date default null, p_limit int default 10)
returns table (rank_position int, student_label text, visits int, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, app.today()))::date;
  v_to date := (date_trunc('month', coalesce(p_month, app.today())) + interval '1 month')::date;
  v_me uuid := app.current_student_id(p_gym_id);
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if not exists (select 1 from public.user_gym_roles r where r.user_id = auth.uid() and r.gym_id = p_gym_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.feature_settings where gym_id = p_gym_id and feature = 'portal_ranking' and not enabled) then
    raise exception 'El ranking no está habilitado' using errcode = 'P0001';
  end if;

  return query
  with counts as (
    select c.student_id, count(*)::int as n
    from public.check_ins c
    where c.gym_id = p_gym_id and c.business_date >= v_from and c.business_date < v_to
    group by c.student_id
  ), ranked as (
    select (rank() over (order by k.n desc))::int as pos,
           split_part(trim(s.first_name), ' ', 1) || ' ' || upper(left(trim(s.last_name), 1)) || '.' as label,
           k.n,
           s.id = v_me as mine
    from counts k
    join public.students s on s.id = k.student_id
    where s.status = 'active' and not s.ranking_opt_out
  )
  select r.pos, r.label, r.n, r.mine
  from ranked r
  where r.pos <= v_limit or r.mine
  order by r.pos, r.label;
end;
$$;

revoke execute on function app.is_platform_admin() from public, anon;
revoke execute on function app.feature_allowed(uuid, text) from public, anon;
grant execute on function app.is_platform_admin() to authenticated;
grant execute on function app.feature_allowed(uuid, text) to authenticated;

revoke execute on function public.my_features(uuid) from public, anon;
revoke execute on function public.feature_allowed(uuid, text) from public, anon;
revoke execute on function public.feature_matrix(uuid) from public, anon;
revoke execute on function public.set_feature(uuid, text, boolean, public.app_role[]) from public, anon;
revoke execute on function public.is_platform_user(uuid) from public, anon;
grant execute on function public.my_features(uuid) to authenticated;
grant execute on function public.feature_allowed(uuid, text) to authenticated;
grant execute on function public.feature_matrix(uuid) to authenticated;
grant execute on function public.set_feature(uuid, text, boolean, public.app_role[]) to authenticated;
grant execute on function public.is_platform_user(uuid) to authenticated;
-- check_request corre con el rol del pedido (también anónimo).
grant execute on function public.check_request() to anon, authenticated;

-- Activa el control en PostgREST (en Supabase existe el rol authenticator).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request to ''public.check_request''';
    notify pgrst, 'reload config';
  end if;
end;
$$;
