-- =====================================================================
-- MyN Fitness â€” RecepciÃ³n: control de ingreso y venta rÃ¡pida.
--   * check_ins: un ingreso por alumno y dÃ­a. Si no estÃ¡ habilitado, se
--     registra sÃ³lo con motivo (queda a la vista quiÃ©n lo dejÃ³ pasar).
--   * quick_sale: alta mÃ­nima del alumno + plan + cobro (+ ingreso) en una
--     sola transacciÃ³n. Precio del plan tomado del servidor, sin descuentos.
--     La puede hacer el cajero (treasurer): es la operaciÃ³n de mostrador.
-- La columna source deja preparado el ingreso desde el molinete.
-- =====================================================================

create table public.check_ins (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  student_id       uuid not null references public.students (id),
  business_date    date not null default app.today(),
  checked_in_at    timestamptz not null default now(),
  source           text not null default 'reception' check (source in ('reception', 'device')),
  access_ok        boolean not null,
  -- Motivos por los que no estaba habilitado: inactive, no_membership, paused, overdue.
  issues           text[] not null default '{}',
  override_reason  text check (length(override_reason) <= 300),
  created_by       uuid references auth.users (id) default auth.uid(),
  constraint check_in_override check (access_ok or length(trim(coalesce(override_reason, ''))) >= 3)
);

create unique index check_ins_one_per_day on public.check_ins (student_id, business_date);
create index check_ins_gym_day_idx on public.check_ins (gym_id, business_date, checked_in_at desc);

alter table public.check_ins enable row level security;
revoke insert, update, delete, truncate on public.check_ins from anon, authenticated;
revoke all on public.check_ins from anon;
grant select on public.check_ins to authenticated;

create policy check_ins_select on public.check_ins
  for select to authenticated
  using (app.is_staff(gym_id) or student_id = (select app.current_student_id(gym_id)));

-- ---------------------------------------------------------------------
-- Estado de acceso de un alumno hoy (sin control de rol: uso interno).
-- ---------------------------------------------------------------------
create or replace function app.access_status(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_today date := app.today();
  v_issues text[] := '{}';
  v_until date;
  v_plans text[];
  v_overdue bigint;
  v_open bigint;
  v_check public.check_ins;
begin
  select * into v_student from public.students where id = p_student_id;
  if v_student.id is null then
    raise exception 'Alumno inexistente' using errcode = 'P0001';
  end if;

  select max(ends_on), array_agg(plan_name order by ends_on desc) into v_until, v_plans
  from public.subscriptions
  where student_id = p_student_id and status = 'active' and starts_on <= v_today and ends_on >= v_today;

  -- Vencida por fecha aunque el proceso nocturno todavÃ­a no la haya marcado.
  select coalesce(sum(total - paid_amount) filter (where due_on < v_today), 0),
         coalesce(sum(total - paid_amount), 0)
  into v_overdue, v_open
  from public.charges
  where student_id = p_student_id and status in ('pending', 'partial', 'overdue');

  if v_student.status <> 'active' then
    v_issues := array_append(v_issues, 'inactive');
  end if;
  if v_until is null then
    v_issues := array_append(v_issues, 'no_membership');
  elsif exists (
    select 1 from public.subscription_pauses pz join public.subscriptions sub on sub.id = pz.subscription_id
    where sub.student_id = p_student_id and sub.status = 'active' and v_today between pz.from_date and pz.to_date
  ) then
    v_issues := array_append(v_issues, 'paused');
  end if;
  if v_overdue > 0 then
    v_issues := array_append(v_issues, 'overdue');
  end if;

  select * into v_check from public.check_ins where student_id = p_student_id and business_date = v_today;

  return jsonb_build_object(
    'student_id', v_student.id,
    'gym_id', v_student.gym_id,
    'ok', cardinality(v_issues) = 0,
    'issues', to_jsonb(v_issues),
    'active_until', v_until,
    'plans', to_jsonb(coalesce(v_plans, '{}')),
    'overdue_amount', v_overdue,
    'open_amount', v_open,
    'checked_in_at', v_check.checked_in_at
  );
end;
$$;

revoke execute on function app.access_status(uuid) from public, anon, authenticated;

create or replace function public.check_access(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  select gym_id into v_gym from public.students where id = p_student_id;
  if v_gym is null or not app.has_any_role(v_gym, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return app.access_status(p_student_id);
end;
$$;

-- NÃºcleo del registro de ingreso. Idempotente por dÃ­a: si ya ingresÃ³, devuelve ese registro.
create or replace function app.record_check_in(p_student_id uuid, p_override_reason text, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status jsonb := app.access_status(p_student_id);
  v_ok boolean := (v_status ->> 'ok')::boolean;
  v_reason text := nullif(trim(coalesce(p_override_reason, '')), '');
  v_row public.check_ins;
begin
  select * into v_row from public.check_ins where student_id = p_student_id and business_date = app.today();
  if v_row.id is not null then
    return jsonb_build_object('id', v_row.id, 'already', true, 'checked_in_at', v_row.checked_in_at, 'access_ok', v_row.access_ok);
  end if;

  if not v_ok and length(coalesce(v_reason, '')) < 3 then
    raise exception 'El alumno no estÃ¡ habilitado: indique el motivo para registrar el ingreso igual' using errcode = 'P0001';
  end if;

  insert into public.check_ins (gym_id, student_id, source, access_ok, issues, override_reason)
  select (v_status ->> 'gym_id')::uuid, p_student_id, p_source, v_ok,
         array(select jsonb_array_elements_text(v_status -> 'issues')),
         case when v_ok then null else v_reason end
  on conflict (student_id, business_date) do nothing
  returning * into v_row;

  if v_row.id is null then -- otro puesto lo registrÃ³ en el mismo instante
    select * into v_row from public.check_ins where student_id = p_student_id and business_date = app.today();
    return jsonb_build_object('id', v_row.id, 'already', true, 'checked_in_at', v_row.checked_in_at, 'access_ok', v_row.access_ok);
  end if;

  if not v_ok then
    perform app.audit(v_row.gym_id, 'check_in_override', 'check_ins', v_row.id::text, null, to_jsonb(v_row), v_reason);
  end if;
  return jsonb_build_object('id', v_row.id, 'already', false, 'checked_in_at', v_row.checked_in_at, 'access_ok', v_ok);
end;
$$;

revoke execute on function app.record_check_in(uuid, text, text) from public, anon, authenticated;

create or replace function public.register_check_in(p_student_id uuid, p_override_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  select gym_id into v_gym from public.students where id = p_student_id;
  if v_gym is null or not app.has_any_role(v_gym, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return app.record_check_in(p_student_id, p_override_reason, 'reception');
end;
$$;

-- ---------------------------------------------------------------------
-- Venta rÃ¡pida en recepciÃ³n
-- ---------------------------------------------------------------------
create or replace function public.quick_sale(
  p_gym_id uuid,
  p_student_id uuid,
  p_first_name text,
  p_last_name text,
  p_document text,
  p_phone text,
  p_plan_id uuid,
  p_method_id uuid,
  p_reference text,
  p_idempotency_key uuid,
  p_check_in boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_student public.students;
  v_plan public.membership_plans;
  v_created boolean := false;
  v_period uuid;
  v_charge public.charges;
  v_payment uuid;
  v_check jsonb;
  v_today date := app.today();
begin
  if not app.has_any_role(p_gym_id, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Falta la clave de operaciÃ³n' using errcode = 'P0001';
  end if;

  -- Reintento / doble toque: devuelve la venta ya hecha.
  select * into v_sub from public.subscriptions where idempotency_key = p_idempotency_key;
  if v_sub.id is not null then
    return jsonb_build_object(
      'student_id', v_sub.student_id, 'subscription_id', v_sub.id, 'student_created', false,
      'payment_id', (select id from public.payments where idempotency_key = p_idempotency_key),
      'check_in', null
    );
  end if;

  -- Alumno: existente por id, existente por documento, o alta mÃ­nima.
  if p_student_id is not null then
    select * into v_student from public.students where id = p_student_id and gym_id = p_gym_id for update;
    if v_student.id is null then
      raise exception 'Alumno inexistente' using errcode = 'P0001';
    end if;
  else
    if app.normalize_document(p_document) is null then
      raise exception 'Ingrese el nÃºmero de documento' using errcode = 'P0001';
    end if;
    select * into v_student from public.students
    where gym_id = p_gym_id and document_number = app.normalize_document(p_document)
    for update;
    if v_student.id is null then
      if length(trim(coalesce(p_first_name, ''))) < 1 or length(trim(coalesce(p_last_name, ''))) < 1 then
        raise exception 'Ingrese nombre y apellido' using errcode = 'P0001';
      end if;
      insert into public.students (gym_id, first_name, last_name, document_number, phone)
      values (p_gym_id, p_first_name, p_last_name, p_document, nullif(trim(coalesce(p_phone, '')), ''))
      returning * into v_student;
      v_created := true;
    end if;
  end if;
  if v_student.status <> 'active' then
    raise exception 'El alumno estÃ¡ dado de baja; un administrador debe reactivarlo desde su ficha' using errcode = 'P0001';
  end if;

  select * into v_plan from public.membership_plans where id = p_plan_id and gym_id = p_gym_id;
  if v_plan.id is null or not v_plan.is_active then
    raise exception 'Plan inexistente o inactivo' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.subscriptions
    where student_id = v_student.id and plan_id = p_plan_id and status = 'active' and ends_on >= v_today
  ) then
    raise exception 'El alumno ya tiene este plan vigente hoy' using errcode = 'P0001';
  end if;

  insert into public.subscriptions (
    gym_id, student_id, plan_id, plan_name, duration_months, duration_days, included_sessions,
    included_service_id, price_agreed, starts_on, ends_on, idempotency_key
  ) values (
    p_gym_id, v_student.id, v_plan.id, v_plan.name, v_plan.duration_months, v_plan.duration_days,
    v_plan.included_sessions, v_plan.included_service_id, v_plan.price, v_today, v_today, p_idempotency_key
  )
  returning * into v_sub;

  v_period := app.create_period(v_sub, v_today);
  select * into v_charge from public.charges where subscription_period_id = v_period and status <> 'voided';

  -- Se cobra exactamente la cuota reciÃ©n creada (no deudas anteriores).
  if v_charge.total > 0 then
    v_payment := app.post_payment(
      v_student.id, p_method_id, v_charge.total,
      jsonb_build_array(jsonb_build_object('charge_id', v_charge.id, 'amount', v_charge.total)),
      p_reference, 'Venta rÃ¡pida en recepciÃ³n', p_idempotency_key
    );
  end if;

  if coalesce(p_check_in, false) then
    -- Si tiene deuda anterior no queda habilitado: el ingreso se registra aparte, con motivo.
    if (app.access_status(v_student.id) ->> 'ok')::boolean then
      v_check := app.record_check_in(v_student.id, null, 'reception');
    end if;
  end if;

  return jsonb_build_object(
    'student_id', v_student.id, 'subscription_id', v_sub.id, 'student_created', v_created,
    'payment_id', v_payment, 'check_in', v_check
  );
end;
$$;

revoke execute on function public.check_access(uuid) from public, anon;
revoke execute on function public.register_check_in(uuid, text) from public, anon;
revoke execute on function public.quick_sale(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, boolean) from public, anon;
grant execute on function public.check_access(uuid) to authenticated;
grant execute on function public.register_check_in(uuid, text) to authenticated;
grant execute on function public.quick_sale(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, boolean) to authenticated;
