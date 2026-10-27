-- =====================================================================
-- MyN Fitness — Incremento 2: servicios, planes, medios de pago y prospectos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Auditoría genérica de cambios en tablas de configuración
-- ---------------------------------------------------------------------
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) - 'updated_at' end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) - 'updated_at' end;
begin
  if tg_op = 'UPDATE' and v_old = v_new then
    return new;
  end if;
  perform app.audit(
    coalesce(v_new ->> 'gym_id', v_old ->> 'gym_id')::uuid,
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_new ->> 'id', v_old ->> 'id'),
    v_old,
    v_new
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------
-- Servicios (entrenamientos y sesiones reservables)
-- ---------------------------------------------------------------------
create table public.services (
  id                       uuid primary key default gen_random_uuid(),
  gym_id                   uuid not null references public.gyms (id),
  name                     text not null check (length(trim(name)) between 2 and 120),
  description              text check (length(description) <= 2000),
  duration_minutes         int not null check (duration_minutes between 5 and 600),
  price                    bigint not null check (price >= 0),
  -- Etapa 1: sólo reservas individuales. Las clases grupales (capacidad > 1) llegan en la Etapa 3.
  capacity                 int not null default 1 check (capacity = 1),
  is_bookable              boolean not null default true,
  is_commissionable        boolean not null default true,
  cancellation_hours       int not null default 12 check (cancellation_hours between 0 and 168),
  no_show_consumes_credit  boolean not null default true,
  is_public                boolean not null default true,
  is_active                boolean not null default true,
  sort_order               int not null default 0,
  created_by               uuid references auth.users (id) default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (gym_id, name)
);

create index services_gym_active_idx on public.services (gym_id, is_active, sort_order);

create trigger services_touch before update on public.services
  for each row execute function app.touch_updated_at();
create trigger services_audit after insert or update on public.services
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Planes de membresía
-- ---------------------------------------------------------------------
create type public.plan_type as enum ('monthly', 'quarterly', 'annual', 'sessions', 'custom');

create table public.membership_plans (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               uuid not null references public.gyms (id),
  name                 text not null check (length(trim(name)) between 2 and 120),
  description          text check (length(description) <= 2000),
  plan_type            public.plan_type not null,
  price                bigint not null check (price >= 0),
  -- Vigencia: exactamente una de las dos unidades.
  duration_months      int check (duration_months between 1 and 36),
  duration_days        int check (duration_days between 1 and 1095),
  included_sessions    int not null default 0 check (included_sessions between 0 and 500),
  included_service_id  uuid references public.services (id),
  benefits             text[] not null default '{}',
  conditions           text check (length(conditions) <= 4000),
  is_public            boolean not null default true,
  is_active            boolean not null default true,
  sort_order           int not null default 0,
  created_by           uuid references auth.users (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (gym_id, name),
  constraint plan_one_duration check ((duration_months is null) <> (duration_days is null)),
  constraint plan_type_duration check (
    case plan_type
      when 'monthly'   then duration_months = 1
      when 'quarterly' then duration_months = 3
      when 'annual'    then duration_months = 12
      else true
    end
  ),
  constraint plan_sessions_required check (plan_type <> 'sessions' or included_sessions > 0),
  constraint plan_sessions_service check (included_sessions = 0 or included_service_id is not null),
  constraint plan_benefits_limit check (cardinality(benefits) <= 20)
);

create index membership_plans_gym_active_idx on public.membership_plans (gym_id, is_active, sort_order);

create trigger membership_plans_touch before update on public.membership_plans
  for each row execute function app.touch_updated_at();
create trigger membership_plans_audit after insert or update on public.membership_plans
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Medios de pago
-- ---------------------------------------------------------------------
create table public.payment_methods (
  id            uuid primary key default gen_random_uuid(),
  gym_id        uuid not null references public.gyms (id),
  code          text not null check (code ~ '^[a-z][a-z0-9_]{1,29}$'),
  name          text not null check (length(trim(name)) between 2 and 60),
  -- true sólo para efectivo físico: genera movimientos de caja.
  affects_cash  boolean not null default false,
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (gym_id, code),
  unique (gym_id, name)
);

create trigger payment_methods_touch before update on public.payment_methods
  for each row execute function app.touch_updated_at();
create trigger payment_methods_audit after insert or update on public.payment_methods
  for each row execute function app.audit_row();

-- El código de un medio es estable (se usará en pagos y conciliación).
create or replace function app.payment_method_code_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.code <> old.code then
    raise exception 'El código de un medio de pago no puede cambiarse' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger payment_methods_code_immutable before update on public.payment_methods
  for each row execute function app.payment_method_code_immutable();

-- ---------------------------------------------------------------------
-- Prospectos (futuros alumnos)
-- ---------------------------------------------------------------------
create type public.lead_interest as enum ('info', 'enrollment', 'trial_class');
create type public.lead_status as enum ('new', 'contacted', 'converted', 'lost');

create table public.leads (
  id              uuid primary key default gen_random_uuid(),
  gym_id          uuid not null references public.gyms (id),
  full_name       text not null check (length(trim(full_name)) between 2 and 120),
  phone           text check (length(phone) <= 30),
  email           text check (length(email) <= 254),
  interest        public.lead_interest not null default 'info',
  plan_id         uuid references public.membership_plans (id),
  service_id      uuid references public.services (id),
  preferred_date  date,
  message         text check (length(message) <= 2000),
  status          public.lead_status not null default 'new',
  internal_notes  text check (length(internal_notes) <= 4000),
  contacted_at    timestamptz,
  handled_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint lead_contact_required check (phone is not null or email is not null)
);

create index leads_gym_status_idx on public.leads (gym_id, status, created_at desc);
create index leads_email_recent_idx on public.leads (lower(email), created_at);
create index leads_phone_recent_idx on public.leads (phone, created_at);

create trigger leads_touch before update on public.leads
  for each row execute function app.touch_updated_at();

-- Formulario público: única vía de alta para anónimos. No devuelve datos de otros prospectos.
create or replace function public.submit_lead(
  p_gym_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_interest public.lead_interest,
  p_plan_id uuid default null,
  p_service_id uuid default null,
  p_preferred_date date default null,
  p_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text := nullif(trim(p_full_name), '');
  v_phone   text := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g'), '');
  v_email   text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_recent  int;
begin
  if not exists (select 1 from public.gyms where id = p_gym_id) then
    raise exception 'Gimnasio inválido' using errcode = 'P0001';
  end if;
  if v_name is null or length(v_name) < 2 or length(v_name) > 120 then
    raise exception 'Ingrese su nombre' using errcode = 'P0001';
  end if;
  if v_phone is null and v_email is null then
    raise exception 'Ingrese un teléfono o un email para poder contactarlo' using errcode = 'P0001';
  end if;
  if v_phone is not null and (length(v_phone) < 6 or length(v_phone) > 20) then
    raise exception 'Teléfono inválido' using errcode = 'P0001';
  end if;
  if v_email is not null and v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'Email inválido' using errcode = 'P0001';
  end if;
  if v_message is not null and length(v_message) > 2000 then
    raise exception 'El mensaje es demasiado largo' using errcode = 'P0001';
  end if;
  if p_preferred_date is not null and (p_preferred_date < app.today() or p_preferred_date > app.today() + 90) then
    raise exception 'La fecha preferida debe estar dentro de los próximos 90 días' using errcode = 'P0001';
  end if;
  -- Sólo se aceptan planes/servicios publicados.
  if p_plan_id is not null and not exists (
    select 1 from public.membership_plans
    where id = p_plan_id and gym_id = p_gym_id and is_public and is_active
  ) then
    raise exception 'Plan no disponible' using errcode = 'P0001';
  end if;
  if p_service_id is not null and not exists (
    select 1 from public.services
    where id = p_service_id and gym_id = p_gym_id and is_public and is_active
  ) then
    raise exception 'Servicio no disponible' using errcode = 'P0001';
  end if;

  -- Antispam: máximo 3 solicitudes por contacto en 24 h.
  select count(*) into v_recent
  from public.leads
  where gym_id = p_gym_id
    and created_at > now() - interval '24 hours'
    and ((v_email is not null and lower(email) = v_email) or (v_phone is not null and phone = v_phone));
  if v_recent >= 3 then
    raise exception 'Ya recibimos sus solicitudes. Lo contactaremos a la brevedad.' using errcode = 'P0001';
  end if;

  insert into public.leads (gym_id, full_name, phone, email, interest, plan_id, service_id, preferred_date, message)
  values (p_gym_id, v_name, v_phone, v_email, p_interest, p_plan_id, p_service_id, p_preferred_date, v_message);
end;
$$;

revoke execute on function public.submit_lead(uuid, text, text, text, public.lead_interest, uuid, uuid, date, text) from public;
grant execute on function public.submit_lead(uuid, text, text, text, public.lead_interest, uuid, uuid, date, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.membership_plans enable row level security;
alter table public.payment_methods enable row level security;
alter table public.leads enable row level security;

-- Servicios y planes: el público ve sólo lo publicado y activo; los miembros del gimnasio ven todo.
create policy services_select_public on public.services
  for select to anon, authenticated
  using (is_public and is_active);

create policy services_select_members on public.services
  for select to authenticated
  using (app.has_any_role(gym_id, array['admin', 'accountant', 'treasurer', 'trainer', 'student']::public.app_role[]));

create policy services_insert_admin on public.services
  for insert to authenticated
  with check (app.has_role(gym_id, 'admin'));

create policy services_update_admin on public.services
  for update to authenticated
  using (app.has_role(gym_id, 'admin'))
  with check (app.has_role(gym_id, 'admin'));

create policy plans_select_public on public.membership_plans
  for select to anon, authenticated
  using (is_public and is_active);

create policy plans_select_members on public.membership_plans
  for select to authenticated
  using (app.has_any_role(gym_id, array['admin', 'accountant', 'treasurer', 'trainer', 'student']::public.app_role[]));

create policy plans_insert_admin on public.membership_plans
  for insert to authenticated
  with check (app.has_role(gym_id, 'admin'));

create policy plans_update_admin on public.membership_plans
  for update to authenticated
  using (app.has_role(gym_id, 'admin'))
  with check (app.has_role(gym_id, 'admin'));

-- Medios de pago: staff lee; admin administra. Sin borrado (se desactivan).
create policy payment_methods_select_staff on public.payment_methods
  for select to authenticated
  using (app.is_staff(gym_id));

create policy payment_methods_insert_admin on public.payment_methods
  for insert to authenticated
  with check (app.has_role(gym_id, 'admin'));

create policy payment_methods_update_admin on public.payment_methods
  for update to authenticated
  using (app.has_role(gym_id, 'admin'))
  with check (app.has_role(gym_id, 'admin'));

-- Prospectos: admin y tesorero gestionan. Anónimos sin acceso (sólo submit_lead).
create policy leads_select_staff on public.leads
  for select to authenticated
  using (app.has_any_role(gym_id, array['admin', 'treasurer']::public.app_role[]));

create policy leads_update_staff on public.leads
  for update to authenticated
  using (app.has_any_role(gym_id, array['admin', 'treasurer']::public.app_role[]))
  with check (app.has_any_role(gym_id, array['admin', 'treasurer']::public.app_role[]));

-- Defensa en profundidad: aunque existan privilegios por defecto, anon no toca leads directamente.
revoke all on public.leads from anon;
