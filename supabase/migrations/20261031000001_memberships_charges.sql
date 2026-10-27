-- =====================================================================
-- MyN Fitness — Incremento 4: membresías, períodos, cuotas (cargos) y vencimientos
-- Separación de estados:
--   * vigencia contractual  -> subscriptions.status + fechas
--   * estado de pago        -> charges.status
--   * derecho de acceso     -> vista v_student_membership_status (calculado)
-- Toda escritura pasa por funciones transaccionales; la API no inserta ni modifica directo.
-- =====================================================================

create type public.subscription_status as enum ('active', 'cancelled', 'expired');
create type public.charge_status as enum ('pending', 'partial', 'paid', 'overdue', 'voided');
create type public.charge_source as enum ('membership', 'booking', 'sale', 'other');

-- ---------------------------------------------------------------------
-- Suscripciones (membresía contratada). Guarda copia de las condiciones del plan:
-- cambiar el plan después no altera lo pactado.
-- ---------------------------------------------------------------------
create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  gym_id               uuid not null references public.gyms (id),
  student_id           uuid not null references public.students (id),
  plan_id              uuid not null references public.membership_plans (id),
  plan_name            text not null,
  duration_months      int,
  duration_days        int,
  included_sessions    int not null default 0,
  included_service_id  uuid references public.services (id),
  price_agreed         bigint not null check (price_agreed >= 0),
  discount_amount      bigint not null default 0 check (discount_amount >= 0),
  discount_reason      text,
  status               public.subscription_status not null default 'active',
  auto_renew           boolean not null default true,
  starts_on            date not null,
  ends_on              date not null,
  cancelled_at         timestamptz,
  cancel_reason        text,
  idempotency_key      uuid unique,
  created_by           uuid references auth.users (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint subscription_dates check (ends_on >= starts_on),
  constraint subscription_discount check (discount_amount <= price_agreed),
  constraint subscription_discount_reason check (discount_amount = 0 or length(trim(discount_reason)) >= 3),
  constraint subscription_one_duration check ((duration_months is null) <> (duration_days is null))
);

create index subscriptions_student_idx on public.subscriptions (student_id, status);
create index subscriptions_renewal_idx on public.subscriptions (gym_id, status, auto_renew, ends_on);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function app.touch_updated_at();
create trigger subscriptions_audit after insert or update on public.subscriptions
  for each row execute function app.audit_row();

create table public.subscription_periods (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  subscription_id  uuid not null references public.subscriptions (id),
  sequence         int not null check (sequence >= 1),
  period_start     date not null,
  period_end       date not null,
  created_at       timestamptz not null default now(),
  constraint period_dates check (period_end >= period_start),
  -- Impide generar dos veces el mismo período (renovación manual + cron, reintentos).
  unique (subscription_id, period_start),
  unique (subscription_id, sequence)
);

create table public.subscription_pauses (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  subscription_id  uuid not null references public.subscriptions (id),
  from_date        date not null,
  to_date          date not null,
  reason           text not null check (length(trim(reason)) >= 3),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint pause_dates check (to_date >= from_date and to_date - from_date < 90)
);

create table public.session_entitlements (
  id                      uuid primary key default gen_random_uuid(),
  gym_id                  uuid not null references public.gyms (id),
  subscription_period_id  uuid not null unique references public.subscription_periods (id),
  service_id              uuid not null references public.services (id),
  granted                 int not null check (granted > 0),
  used                    int not null default 0,
  constraint entitlement_usage check (used between 0 and granted)
);

-- ---------------------------------------------------------------------
-- Cargos (obligaciones / cuentas por cobrar). paid_amount lo mantienen las
-- funciones de cobro (Incremento 5). No son comprobantes fiscales.
-- ---------------------------------------------------------------------
create table public.charges (
  id                      uuid primary key default gen_random_uuid(),
  gym_id                  uuid not null references public.gyms (id),
  student_id              uuid not null references public.students (id),
  source                  public.charge_source not null,
  subscription_period_id  uuid references public.subscription_periods (id),
  concept                 text not null check (length(trim(concept)) between 2 and 200),
  amount                  bigint not null check (amount >= 0),
  discount                bigint not null default 0 check (discount >= 0),
  total                   bigint generated always as (amount - discount) stored,
  paid_amount             bigint not null default 0 check (paid_amount >= 0),
  due_on                  date not null,
  status                  public.charge_status not null default 'pending',
  voided_at               timestamptz,
  voided_by               uuid references auth.users (id),
  void_reason             text,
  created_by              uuid references auth.users (id) default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint charge_discount check (discount <= amount),
  constraint charge_paid check (paid_amount <= amount - discount),
  constraint charge_membership_period check (source <> 'membership' or subscription_period_id is not null),
  constraint charge_void check ((status = 'voided') = (voided_at is not null))
);

-- Una sola cuota vigente por período: la renovación repetida no duplica cargos.
create unique index charges_period_active_uniq on public.charges (subscription_period_id)
  where subscription_period_id is not null and status <> 'voided';
create index charges_student_idx on public.charges (student_id, status, due_on);
create index charges_gym_status_idx on public.charges (gym_id, status, due_on);

create trigger charges_touch before update on public.charges
  for each row execute function app.touch_updated_at();
create trigger charges_audit after insert or update on public.charges
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function app.period_end(p_start date, p_months int, p_days int)
returns date
language sql
immutable
set search_path = ''
as $$
  select case
    when p_months is not null then (p_start + make_interval(months => p_months))::date - 1
    else p_start + p_days - 1
  end;
$$;

-- Estado de pago a partir de lo pagado y la fecha.
create or replace function app.charge_status_for(p_total bigint, p_paid bigint, p_due date)
returns public.charge_status
language sql
stable
set search_path = ''
as $$
  select case
    when p_paid >= p_total then 'paid'::public.charge_status
    when p_due < app.today() then 'overdue'::public.charge_status
    when p_paid > 0 then 'partial'::public.charge_status
    else 'pending'::public.charge_status
  end;
$$;

-- Crea período + cuota (+ créditos de sesiones) para una suscripción. Idempotente por fecha de inicio.
create or replace function app.create_period(p_sub public.subscriptions, p_start date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period_id uuid;
  v_seq int;
  v_end date := app.period_end(p_start, p_sub.duration_months, p_sub.duration_days);
begin
  select coalesce(max(sequence), 0) + 1 into v_seq
  from public.subscription_periods where subscription_id = p_sub.id;

  insert into public.subscription_periods (gym_id, subscription_id, sequence, period_start, period_end)
  values (p_sub.gym_id, p_sub.id, v_seq, p_start, v_end)
  on conflict (subscription_id, period_start) do nothing
  returning id into v_period_id;

  if v_period_id is null then
    return null; -- ya existía: no se duplica nada
  end if;

  insert into public.charges (gym_id, student_id, source, subscription_period_id, concept, amount, discount, due_on, status)
  values (
    p_sub.gym_id, p_sub.student_id, 'membership', v_period_id,
    p_sub.plan_name || ' — ' || to_char(p_start, 'DD/MM/YYYY') || ' al ' || to_char(v_end, 'DD/MM/YYYY'),
    p_sub.price_agreed, p_sub.discount_amount, p_start,
    app.charge_status_for(p_sub.price_agreed - p_sub.discount_amount, 0, p_start)
  );

  if p_sub.included_sessions > 0 then
    insert into public.session_entitlements (gym_id, subscription_period_id, service_id, granted)
    values (p_sub.gym_id, v_period_id, p_sub.included_service_id, p_sub.included_sessions);
  end if;

  update public.subscriptions set ends_on = greatest(ends_on, v_end) where id = p_sub.id;
  return v_period_id;
end;
$$;

revoke execute on function app.create_period(public.subscriptions, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC: alta de membresía
-- ---------------------------------------------------------------------
create or replace function public.enroll_membership(
  p_student_id uuid,
  p_plan_id uuid,
  p_starts_on date,
  p_discount_amount bigint default 0,
  p_discount_reason text default null,
  p_auto_renew boolean default true,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_plan public.membership_plans;
  v_sub public.subscriptions;
  v_existing uuid;
begin
  if p_idempotency_key is not null then
    select id into v_existing from public.subscriptions where idempotency_key = p_idempotency_key;
    if v_existing is not null then
      return v_existing; -- reintento o doble clic: misma respuesta, sin duplicar
    end if;
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if v_student.id is null then
    raise exception 'Alumno inexistente' using errcode = 'P0001';
  end if;
  if not app.has_role(v_student.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_student.status <> 'active' then
    raise exception 'El alumno está dado de baja; reactívelo antes de asignar una membresía' using errcode = 'P0001';
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id and gym_id = v_student.gym_id;
  if v_plan.id is null or not v_plan.is_active then
    raise exception 'Plan inexistente o inactivo' using errcode = 'P0001';
  end if;
  if p_starts_on is null or p_starts_on < app.today() - 60 or p_starts_on > app.today() + 90 then
    raise exception 'La fecha de inicio debe estar entre 60 días atrás y 90 días adelante' using errcode = 'P0001';
  end if;
  if coalesce(p_discount_amount, 0) < 0 or coalesce(p_discount_amount, 0) > v_plan.price then
    raise exception 'El descuento no puede superar el precio del plan' using errcode = 'P0001';
  end if;
  if coalesce(p_discount_amount, 0) > 0 and length(trim(coalesce(p_discount_reason, ''))) < 3 then
    raise exception 'Indique el motivo del descuento' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.subscriptions
    where student_id = p_student_id and plan_id = p_plan_id and status = 'active' and ends_on >= p_starts_on
  ) then
    raise exception 'El alumno ya tiene este plan vigente en esas fechas' using errcode = 'P0001';
  end if;

  insert into public.subscriptions (
    gym_id, student_id, plan_id, plan_name, duration_months, duration_days, included_sessions,
    included_service_id, price_agreed, discount_amount, discount_reason, auto_renew, starts_on, ends_on,
    idempotency_key
  ) values (
    v_student.gym_id, p_student_id, p_plan_id, v_plan.name, v_plan.duration_months, v_plan.duration_days,
    v_plan.included_sessions, v_plan.included_service_id, v_plan.price, coalesce(p_discount_amount, 0),
    nullif(trim(coalesce(p_discount_reason, '')), ''), p_auto_renew, p_starts_on, p_starts_on, p_idempotency_key
  )
  returning * into v_sub;

  perform app.create_period(v_sub, p_starts_on);
  return v_sub.id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: renovación (genera el período siguiente). La usan el admin y el proceso diario.
-- ---------------------------------------------------------------------
create or replace function app.renew_subscription_internal(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_next date;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if v_sub.id is null or v_sub.status = 'cancelled' then
    return null;
  end if;
  select max(period_end) + 1 into v_next from public.subscription_periods where subscription_id = v_sub.id;
  -- Una membresía ya vencida (sin renovación automática) que se renueva a mano arranca hoy.
  -- Las vigentes con renovación automática son continuas: no quedan días sin cuota.
  if v_sub.status = 'expired' and v_next < app.today() then
    v_next := app.today();
  end if;
  update public.subscriptions set status = 'active' where id = v_sub.id and status = 'expired';
  return app.create_period(v_sub, v_next);
end;
$$;

revoke execute on function app.renew_subscription_internal(uuid) from public, anon, authenticated;

create or replace function public.renew_subscription(p_subscription_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym uuid;
  v_period uuid;
begin
  select gym_id into v_gym from public.subscriptions where id = p_subscription_id;
  if v_gym is null or not app.has_role(v_gym, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if exists (select 1 from public.subscriptions where id = p_subscription_id and status = 'cancelled') then
    raise exception 'La membresía está cancelada' using errcode = 'P0001';
  end if;
  v_period := app.renew_subscription_internal(p_subscription_id);
  if v_period is null then
    raise exception 'El próximo período ya estaba generado' using errcode = 'P0001';
  end if;
  return v_period;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: pausa (corre el vencimiento; no toca cuotas ya emitidas)
-- ---------------------------------------------------------------------
create or replace function public.pause_subscription(p_subscription_id uuid, p_from date, p_to date, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_days int;
  v_last uuid;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if v_sub.id is null or not app.has_role(v_sub.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_sub.status <> 'active' then
    raise exception 'Sólo se pueden pausar membresías vigentes' using errcode = 'P0001';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_from < app.today() then
    raise exception 'Fechas de pausa inválidas (desde hoy en adelante)' using errcode = 'P0001';
  end if;
  if p_from > v_sub.ends_on then
    raise exception 'La pausa debe comenzar antes del vencimiento' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.subscription_pauses
    where subscription_id = v_sub.id and daterange(from_date, to_date, '[]') && daterange(p_from, p_to, '[]')
  ) then
    raise exception 'Ya existe una pausa en esas fechas' using errcode = 'P0001';
  end if;

  v_days := p_to - p_from + 1;
  insert into public.subscription_pauses (gym_id, subscription_id, from_date, to_date, reason)
  values (v_sub.gym_id, v_sub.id, p_from, p_to, trim(p_reason));

  -- Se extiende el último período generado y el vencimiento de la membresía.
  select id into v_last from public.subscription_periods
  where subscription_id = v_sub.id order by period_start desc limit 1;
  update public.subscription_periods set period_end = period_end + v_days where id = v_last;
  update public.subscriptions set ends_on = ends_on + v_days where id = v_sub.id;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: cancelación (no borra historial; opcionalmente anula cuotas futuras sin pagos)
-- ---------------------------------------------------------------------
create or replace function public.cancel_subscription(p_subscription_id uuid, p_reason text, p_void_future_charges boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if v_sub.id is null or not app.has_role(v_sub.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_sub.status = 'cancelled' then
    raise exception 'La membresía ya está cancelada' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique el motivo de la cancelación' using errcode = 'P0001';
  end if;

  update public.subscriptions
  set status = 'cancelled', auto_renew = false, cancelled_at = now(), cancel_reason = trim(p_reason)
  where id = v_sub.id;

  if p_void_future_charges then
    update public.charges c
    set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = 'Cancelación de membresía: ' || trim(p_reason)
    from public.subscription_periods p
    where c.subscription_period_id = p.id
      and p.subscription_id = v_sub.id
      and p.period_start > app.today()
      and c.paid_amount = 0
      and c.status <> 'voided';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- RPC: anulación de una cuota sin pagos (autorización de admin, con motivo)
-- ---------------------------------------------------------------------
create or replace function public.void_charge(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.charges;
begin
  select * into v_charge from public.charges where id = p_charge_id for update;
  if v_charge.id is null or not app.has_role(v_charge.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_charge.status = 'voided' then
    raise exception 'La cuota ya está anulada' using errcode = 'P0001';
  end if;
  if v_charge.paid_amount > 0 then
    raise exception 'La cuota tiene pagos registrados; anule primero los pagos' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique el motivo de la anulación' using errcode = 'P0001';
  end if;
  update public.charges
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_charge_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Proceso diario (idempotente): renovaciones, vencimientos y morosidad
-- ---------------------------------------------------------------------
create or replace function app.run_daily_membership_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_renewed int := 0;
  v_overdue int;
  v_expired int;
  r record;
  v_guard int;
begin
  -- 1) Renovación automática: genera períodos hasta cubrir los próximos 7 días.
  for r in
    select id from public.subscriptions
    where status = 'active' and auto_renew and ends_on <= app.today() + 7
  loop
    v_guard := 0;
    while v_guard < 24 and exists (
      select 1 from public.subscriptions where id = r.id and status = 'active' and ends_on <= app.today() + 7
    ) loop
      if app.renew_subscription_internal(r.id) is null then
        exit;
      end if;
      v_renewed := v_renewed + 1;
      v_guard := v_guard + 1;
    end loop;
  end loop;

  -- 2) Membresías sin renovación automática que ya terminaron.
  update public.subscriptions set status = 'expired'
  where status = 'active' and not auto_renew and ends_on < app.today();
  get diagnostics v_expired = row_count;

  -- 3) Cuotas impagas vencidas.
  update public.charges set status = 'overdue'
  where status in ('pending', 'partial') and due_on < app.today();
  get diagnostics v_overdue = row_count;

  return jsonb_build_object('renewed', v_renewed, 'expired', v_expired, 'overdue', v_overdue, 'run_on', app.today());
end;
$$;

revoke execute on function app.run_daily_membership_jobs() from public, anon, authenticated;

-- Ejecución manual por el admin (botón "Actualizar vencimientos").
create or replace function public.run_membership_jobs(p_gym_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.has_role(p_gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return app.run_daily_membership_jobs();
end;
$$;

-- ---------------------------------------------------------------------
-- Vista: estado de membresía y acceso por alumno (respeta RLS del que consulta)
-- ---------------------------------------------------------------------
create view public.v_student_membership_status
with (security_invoker = true)
as
select
  s.id as student_id,
  s.gym_id,
  s.status as student_status,
  (select max(sub.ends_on) from public.subscriptions sub
    where sub.student_id = s.id and sub.status = 'active') as active_until,
  (select count(*) from public.subscriptions sub
    where sub.student_id = s.id and sub.status = 'active' and sub.starts_on <= app.today() and sub.ends_on >= app.today()) as active_subscriptions,
  exists (
    select 1 from public.subscription_pauses pz join public.subscriptions sub on sub.id = pz.subscription_id
    where sub.student_id = s.id and app.today() between pz.from_date and pz.to_date
  ) as paused_today,
  coalesce((select sum(c.total - c.paid_amount) from public.charges c
    where c.student_id = s.id and c.status = 'overdue'), 0) as overdue_amount,
  coalesce((select sum(c.total - c.paid_amount) from public.charges c
    where c.student_id = s.id and c.status in ('pending', 'partial', 'overdue')), 0) as open_amount,
  (select min(c.due_on) from public.charges c
    where c.student_id = s.id and c.status = 'overdue') as oldest_overdue_on
from public.students s;

-- ---------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------
alter table public.subscriptions enable row level security;
alter table public.subscription_periods enable row level security;
alter table public.subscription_pauses enable row level security;
alter table public.session_entitlements enable row level security;
alter table public.charges enable row level security;

-- Escrituras sólo por funciones.
revoke insert, update, delete, truncate on public.subscriptions, public.subscription_periods,
  public.subscription_pauses, public.session_entitlements, public.charges from anon, authenticated;
revoke all on public.subscriptions, public.subscription_periods, public.subscription_pauses,
  public.session_entitlements, public.charges, public.v_student_membership_status from anon;
grant select on public.subscriptions, public.subscription_periods, public.subscription_pauses,
  public.session_entitlements, public.charges, public.v_student_membership_status to authenticated;

-- Staff ve todo; el alumno lo suyo; el entrenador ve membresías (no cuotas) de sus alumnos.
create policy subscriptions_select on public.subscriptions
  for select to authenticated
  using (
    app.is_staff(gym_id)
    or student_id = app.current_student_id(gym_id)
    or app.trainer_can_see_student(student_id)
  );

create policy periods_select on public.subscription_periods
  for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id));

create policy pauses_select on public.subscription_pauses
  for select to authenticated
  using (exists (select 1 from public.subscriptions s where s.id = subscription_id));

create policy entitlements_select on public.session_entitlements
  for select to authenticated
  using (exists (select 1 from public.subscription_periods p where p.id = subscription_period_id));

create policy charges_select on public.charges
  for select to authenticated
  using (app.is_staff(gym_id) or student_id = app.current_student_id(gym_id));

revoke execute on function public.enroll_membership(uuid, uuid, date, bigint, text, boolean, uuid) from public, anon;
revoke execute on function public.renew_subscription(uuid) from public, anon;
revoke execute on function public.pause_subscription(uuid, date, date, text) from public, anon;
revoke execute on function public.cancel_subscription(uuid, text, boolean) from public, anon;
revoke execute on function public.void_charge(uuid, text) from public, anon;
revoke execute on function public.run_membership_jobs(uuid) from public, anon;
grant execute on function public.enroll_membership(uuid, uuid, date, bigint, text, boolean, uuid) to authenticated;
grant execute on function public.renew_subscription(uuid) to authenticated;
grant execute on function public.pause_subscription(uuid, date, date, text) to authenticated;
grant execute on function public.cancel_subscription(uuid, text, boolean) to authenticated;
grant execute on function public.void_charge(uuid, text) to authenticated;
grant execute on function public.run_membership_jobs(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Programación diaria (00:05 en Asunción = 03:05 UTC). Sólo si pg_cron está disponible.
-- ---------------------------------------------------------------------
do $do$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('myn-membership-daily', '5 3 * * *', 'select app.run_daily_membership_jobs()');
  end if;
end
$do$;
