-- =====================================================================
-- MyN Fitness — Rol Cajero y datos de contacto obligatorios del alumno
-- Cajero = mostrador: abre/cierra caja, cobra cuotas, venta rápida, control de
-- ingreso, recibos y registro de facturas. No ve listados ni reportes, no
-- registra egresos ni movimientos manuales de caja y no anula nada.
-- =====================================================================

-- Quienes atienden el mostrador.
create or replace function app.is_front_desk(p_gym_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.has_any_role(p_gym_id, array['admin', 'treasurer', 'cashier']::public.app_role[]);
$$;

grant execute on function app.is_front_desk(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Operaciones de mostrador: se suma 'cashier' a las RPC que ya permitían
-- admin y tesorero. Se reescribe sólo la lista de roles de cada función.
-- ---------------------------------------------------------------------
do $$
declare
  f text;
  v_def text;
  v_new text;
begin
  foreach f in array array[
    'public.register_payment(uuid, uuid, bigint, jsonb, text, text, uuid)',
    'public.open_cash_session(uuid, bigint)',
    'public.close_cash_session(uuid, bigint, text)',
    'public.check_access(uuid)',
    'public.register_check_in(uuid, text)',
    'public.register_invoice(uuid, text, boolean)'
  ] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_new := replace(v_def, $r$array['admin', 'treasurer']::public.app_role[]$r$,
                            $r$array['admin', 'treasurer', 'cashier']::public.app_role[]$r$);
    if v_new = v_def then
      raise exception 'No se encontró la lista de roles en %', f;
    end if;
    execute v_new;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Lectura para el cajero (además de las políticas existentes)
-- ---------------------------------------------------------------------
create policy students_select_cashier on public.students
  for select to authenticated using (app.has_role(gym_id, 'cashier'));
create policy payment_methods_select_cashier on public.payment_methods
  for select to authenticated using (app.has_role(gym_id, 'cashier'));
create policy charges_select_cashier on public.charges
  for select to authenticated using (app.has_role(gym_id, 'cashier'));
create policy subscriptions_select_cashier on public.subscriptions
  for select to authenticated using (app.has_role(gym_id, 'cashier'));
-- Sólo lo del día: el cajero no consulta historiales.
create policy check_ins_select_cashier on public.check_ins
  for select to authenticated using (app.has_role(gym_id, 'cashier') and business_date = app.today());
create policy payments_select_cashier on public.payments
  for select to authenticated
  using (app.has_role(gym_id, 'cashier') and (paid_at at time zone 'America/Asuncion')::date = app.today());
-- La caja abierta y las que abrió o cerró él.
create policy cash_sessions_select_cashier on public.cash_sessions
  for select to authenticated
  using (app.has_role(gym_id, 'cashier')
         and (status = 'open' or opened_by = (select auth.uid()) or closed_by = (select auth.uid())));
create policy cash_movements_select_cashier on public.cash_movements
  for select to authenticated
  using (app.has_role(gym_id, 'cashier')
         and exists (select 1 from public.cash_sessions s where s.id = cash_session_id));

-- Nombres del personal (quién abrió / cerró la caja). Sólo usuarios con rol de personal.
create or replace function public.staff_names(p_gym_id uuid, p_user_ids uuid[])
returns table (user_id uuid, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.is_staff(p_gym_id) or app.has_role(p_gym_id, 'cashier')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
  select distinct p.id, p.full_name
  from public.user_profiles p
  join public.user_gym_roles r on r.user_id = p.id and r.gym_id = p_gym_id
  where p.id = any (p_user_ids)
    and r.role in ('admin', 'accountant', 'treasurer', 'cashier');
end;
$$;

revoke execute on function public.staff_names(uuid, uuid[]) from public, anon;
grant execute on function public.staff_names(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- Contacto del alumno: celular (recibo por WhatsApp) y email (factura).
-- Obligatorios en altas nuevas; no se pueden borrar una vez cargados.
-- Los alumnos anteriores sin estos datos se completan al editar su ficha.
-- ---------------------------------------------------------------------
create or replace function app.students_require_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.phone := nullif(trim(coalesce(new.phone, '')), '');
  if tg_op = 'INSERT' then
    if new.phone is null or new.email is null then
      raise exception 'El celular y el email del alumno son obligatorios' using errcode = 'P0001';
    end if;
  else
    if (old.phone is not null and new.phone is null) or (old.email is not null and new.email is null) then
      raise exception 'El celular y el email del alumno no pueden quedar vacíos' using errcode = 'P0001';
    end if;
  end if;
  if new.phone is not null and length(regexp_replace(new.phone, '\D', '', 'g')) < 8 then
    raise exception 'Celular inválido' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Corre después de students_normalize (orden alfabético de triggers BEFORE).
create trigger students_require_contact before insert or update on public.students
  for each row execute function app.students_require_contact();

-- ---------------------------------------------------------------------
-- Venta rápida: suma email; el alta nueva exige celular y email, y a un
-- alumno existente se le completan si le faltaban.
-- ---------------------------------------------------------------------
drop function public.quick_sale(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, boolean);

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
  p_check_in boolean default true,
  p_email text default null
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
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not app.is_front_desk(p_gym_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Falta la clave de operación' using errcode = 'P0001';
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

  -- Alumno: existente por id, existente por documento, o alta mínima.
  if p_student_id is not null then
    select * into v_student from public.students where id = p_student_id and gym_id = p_gym_id for update;
    if v_student.id is null then
      raise exception 'Alumno inexistente' using errcode = 'P0001';
    end if;
  else
    if app.normalize_document(p_document) is null then
      raise exception 'Ingrese el número de documento' using errcode = 'P0001';
    end if;
    select * into v_student from public.students
    where gym_id = p_gym_id and document_number = app.normalize_document(p_document)
    for update;
    if v_student.id is null then
      if length(trim(coalesce(p_first_name, ''))) < 1 or length(trim(coalesce(p_last_name, ''))) < 1 then
        raise exception 'Ingrese nombre y apellido' using errcode = 'P0001';
      end if;
      insert into public.students (gym_id, first_name, last_name, document_number, phone, email)
      values (p_gym_id, p_first_name, p_last_name, p_document, v_phone, v_email)
      returning * into v_student;
      v_created := true;
    end if;
  end if;
  if v_student.status <> 'active' then
    raise exception 'El alumno está dado de baja; un administrador debe reactivarlo desde su ficha' using errcode = 'P0001';
  end if;

  -- Completa el contacto que le faltaba a un alumno existente.
  if not v_created and ((v_student.phone is null and v_phone is not null) or (v_student.email is null and v_email is not null)) then
    update public.students
    set phone = coalesce(phone, v_phone), email = coalesce(email, v_email)
    where id = v_student.id
    returning * into v_student;
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

  -- Se cobra exactamente la cuota recién creada (no deudas anteriores).
  if v_charge.total > 0 then
    v_payment := app.post_payment(
      v_student.id, p_method_id, v_charge.total,
      jsonb_build_array(jsonb_build_object('charge_id', v_charge.id, 'amount', v_charge.total)),
      p_reference, 'Venta rápida en recepción', p_idempotency_key
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

revoke execute on function public.quick_sale(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, boolean, text) from public, anon;
grant execute on function public.quick_sale(uuid, uuid, text, text, text, text, uuid, uuid, text, uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------
-- Facturación: el receptor incluye email (envío de la factura) y celular;
-- el cajero también arma los datos a facturar.
-- ---------------------------------------------------------------------
create or replace function app.invoice_data(p_payment_id uuid, p_anonymous boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_st public.students;
  v_gym public.gyms;
  v_kind public.invoice_receiver;
  v_doc text;
  v_name text;
  v_items jsonb;
  v_iva bigint;
  v_missing text[] := '{}';
  v_anon boolean := coalesce(p_anonymous, false);
begin
  select * into v_pay from public.payments where id = p_payment_id;
  select * into v_st from public.students where id = v_pay.student_id;
  select * into v_gym from public.gyms where id = v_pay.gym_id;

  if v_anon then
    v_kind := 'anonymous'; v_doc := null; v_name := 'Sin nombre';
  elsif v_st.billing_ruc is not null then
    v_kind := 'ruc'; v_doc := v_st.billing_ruc; v_name := v_st.billing_name;
  elsif v_st.document_number ~ '^\d+$' then
    v_kind := 'ci'; v_doc := v_st.document_number; v_name := v_st.first_name || ' ' || v_st.last_name;
  else
    v_kind := 'foreign'; v_doc := v_st.document_number; v_name := v_st.first_name || ' ' || v_st.last_name;
  end if;

  -- IVA incluido en el precio: tasa 10% => impuesto = importe / 11.
  select coalesce(jsonb_agg(jsonb_build_object(
           'description', c.concept,
           'amount', a.amount,
           'iva10', round(a.amount / 11.0)::bigint) order by c.due_on, c.created_at), '[]'::jsonb),
         coalesce(sum(round(a.amount / 11.0)::bigint), 0)
    into v_items, v_iva
  from public.payment_allocations a
  join public.charges c on c.id = a.charge_id
  where a.payment_id = v_pay.id;

  if v_gym.legal_name is null then v_missing := array_append(v_missing, 'razón social'); end if;
  if v_gym.ruc is null then v_missing := array_append(v_missing, 'RUC'); end if;
  if v_gym.fiscal_timbrado is null then v_missing := array_append(v_missing, 'timbrado'); end if;

  return jsonb_build_object(
    'payment', jsonb_build_object(
      'id', v_pay.id, 'receipt_number', v_pay.receipt_number, 'paid_at', v_pay.paid_at,
      'amount', v_pay.amount, 'status', v_pay.status),
    'emitter', jsonb_build_object(
      'legal_name', v_gym.legal_name, 'ruc', v_gym.ruc, 'timbrado', v_gym.fiscal_timbrado,
      'establishment', v_gym.fiscal_establishment, 'point', v_gym.fiscal_point,
      'transaction_type', v_gym.fiscal_transaction_type),
    'receiver', jsonb_build_object(
      'kind', v_kind, 'document', v_doc, 'name', v_name,
      'email', case when v_anon then null else v_st.email end,
      'phone', case when v_anon then null else v_st.phone end),
    'has_ci', v_st.document_number ~ '^\d+$' or v_st.billing_ruc is not null,
    'items', v_items,
    'total', v_pay.amount,
    'iva10', v_iva,
    'missing', to_jsonb(v_missing)
  );
end;
$$;

create or replace function public.invoice_draft(p_payment_id uuid, p_anonymous boolean default false)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  select gym_id into v_gym from public.payments where id = p_payment_id;
  if v_gym is null or not (app.is_staff(v_gym) or app.has_role(v_gym, 'cashier')) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return app.invoice_data(p_payment_id, p_anonymous);
end;
$$;
