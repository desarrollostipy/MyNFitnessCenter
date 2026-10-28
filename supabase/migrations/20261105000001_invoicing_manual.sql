-- =====================================================================
-- MyN Fitness — Facturación electrónica, Etapa A (registro manual)
-- La factura legal se emite en el facturador gratuito de la DNIT (e-Kuatia).
-- El sistema arma los datos a facturar y registra el CDC devuelto por la DNIT,
-- validando su estructura y dígito verificador. No emite ni firma documentos.
-- Nada se borra: una factura se marca cancelada o acreditada (nota de crédito).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Dígito verificador módulo 11 (mismo algoritmo para RUC y CDC).
-- ---------------------------------------------------------------------
create or replace function app.py_check_digit(p_digits text)
returns int
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_total int := 0;
  v_k int := 2;
  v_r int;
  i int;
begin
  for i in reverse length(p_digits) .. 1 loop
    v_total := v_total + substr(p_digits, i, 1)::int * v_k;
    v_k := case when v_k = 11 then 2 else v_k + 1 end;
  end loop;
  v_r := v_total % 11;
  return case when v_r > 1 then 11 - v_r else 0 end;
end;
$$;

create or replace function app.ruc_is_valid(p_ruc text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case when p_ruc ~ '^\d{1,8}-\d$'
              then app.py_check_digit(split_part(p_ruc, '-', 1)) = split_part(p_ruc, '-', 2)::int
              else false end;
$$;

-- Desarma un CDC de 44 dígitos. Lanza error si la estructura o el verificador no son válidos.
create or replace function app.parse_cdc(p_cdc text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_date date;
begin
  if p_cdc is null or p_cdc !~ '^\d{44}$' then
    raise exception 'El CDC debe tener 44 dígitos' using errcode = 'P0001';
  end if;
  if app.py_check_digit(left(p_cdc, 43)) <> right(p_cdc, 1)::int then
    raise exception 'El CDC no es válido: revise que esté copiado completo' using errcode = 'P0001';
  end if;
  begin
    v_date := to_date(substr(p_cdc, 26, 8), 'YYYYMMDD');
  exception when others then
    raise exception 'El CDC no es válido: fecha de emisión ilegible' using errcode = 'P0001';
  end;
  return jsonb_build_object(
    'doc_type', substr(p_cdc, 1, 2),
    'ruc', ltrim(substr(p_cdc, 3, 8), '0'),
    'ruc_dv', substr(p_cdc, 11, 1),
    'establishment', substr(p_cdc, 12, 3),
    'point', substr(p_cdc, 15, 3),
    'number', substr(p_cdc, 18, 7),
    'issued_on', v_date
  );
end;
$$;

revoke execute on function app.py_check_digit(text) from public, anon;
revoke execute on function app.parse_cdc(text) from public, anon, authenticated;
grant execute on function app.py_check_digit(text) to authenticated;
grant execute on function app.ruc_is_valid(text) to authenticated;

-- ---------------------------------------------------------------------
-- Datos fiscales del gimnasio y de facturación del alumno
-- ---------------------------------------------------------------------
alter table public.gyms
  add column fiscal_timbrado          text check (fiscal_timbrado ~ '^\d{8}$'),
  add column fiscal_timbrado_from     date,
  add column fiscal_establishment     text check (fiscal_establishment ~ '^\d{3}$'),
  add column fiscal_point             text check (fiscal_point ~ '^\d{3}$'),
  add column fiscal_activity          text check (length(fiscal_activity) <= 160),
  add column fiscal_transaction_type  text not null default 'Prestación de servicios'
                                       check (length(trim(fiscal_transaction_type)) between 3 and 80);

alter table public.students
  add column billing_ruc   text check (billing_ruc is null or app.ruc_is_valid(billing_ruc)),
  add column billing_name  text check (length(trim(billing_name)) between 2 and 160),
  add constraint students_billing_pair check ((billing_ruc is null) = (billing_name is null));

-- ---------------------------------------------------------------------
-- Facturas registradas
-- ---------------------------------------------------------------------
create type public.invoice_status as enum ('issued', 'cancelled', 'credited');
create type public.invoice_receiver as enum ('ruc', 'ci', 'foreign', 'anonymous');

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  gym_id             uuid not null references public.gyms (id),
  payment_id         uuid not null references public.payments (id),
  source             text not null default 'manual' check (source in ('manual', 'provider')),
  cdc                text not null check (cdc ~ '^\d{44}$'),
  invoice_number     text not null check (invoice_number ~ '^\d{3}-\d{3}-\d{7}$'),
  issued_on          date not null,
  receiver_kind      public.invoice_receiver not null,
  receiver_document  text,
  receiver_name      text not null,
  total              bigint not null check (total > 0),
  iva10              bigint not null check (iva10 >= 0),
  items              jsonb not null,
  status             public.invoice_status not null default 'issued',
  cancelled_at       timestamptz,
  cancelled_by       uuid references auth.users (id),
  cancel_reason      text check (length(cancel_reason) <= 500),
  credit_note_cdc    text check (credit_note_cdc ~ '^\d{44}$'),
  created_by         uuid references auth.users (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (gym_id, cdc),
  unique (gym_id, credit_note_cdc),
  constraint invoice_cancel_fields check ((status = 'issued') = (cancelled_at is null)),
  constraint invoice_credit_note check ((status = 'credited') = (credit_note_cdc is not null))
);

-- Un cobro tiene a lo sumo una factura vigente.
create unique index invoices_one_issued_per_payment on public.invoices (payment_id) where status = 'issued';
create index invoices_gym_issued_idx on public.invoices (gym_id, issued_on desc);

create trigger invoices_audit after insert or update on public.invoices
  for each row execute function app.audit_row();

alter table public.invoices enable row level security;
revoke all on public.invoices from anon;
revoke insert, update, delete, truncate on public.invoices from authenticated;
grant select on public.invoices to authenticated;

-- Staff ve todo; el alumno sólo las facturas de sus propios cobros (RLS de payments).
create policy invoices_select on public.invoices
  for select to authenticated
  using (app.is_staff(gym_id) or exists (select 1 from public.payments p where p.id = payment_id));

-- ---------------------------------------------------------------------
-- Datos a facturar de un cobro (fuente única para la pantalla y el registro)
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
begin
  select * into v_pay from public.payments where id = p_payment_id;
  select * into v_st from public.students where id = v_pay.student_id;
  select * into v_gym from public.gyms where id = v_pay.gym_id;

  if coalesce(p_anonymous, false) then
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
    'receiver', jsonb_build_object('kind', v_kind, 'document', v_doc, 'name', v_name),
    'has_ci', v_st.document_number ~ '^\d+$' or v_st.billing_ruc is not null,
    'items', v_items,
    'total', v_pay.amount,
    'iva10', v_iva,
    'missing', to_jsonb(v_missing)
  );
end;
$$;

revoke execute on function app.invoice_data(uuid, boolean) from public, anon, authenticated;

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
  if v_gym is null or not app.is_staff(v_gym) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return app.invoice_data(p_payment_id, p_anonymous);
end;
$$;

-- Registra la factura emitida en e-Kuatia a partir de su CDC. Idempotente por CDC.
create or replace function public.register_invoice(p_payment_id uuid, p_cdc text, p_anonymous boolean default false)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_gym public.gyms;
  v_cdc text := regexp_replace(coalesce(p_cdc, ''), '\D', '', 'g');
  v_parsed jsonb;
  v_issued date;
  v_data jsonb;
  v_existing public.invoices;
  v_id uuid;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.id is null or not app.has_any_role(v_pay.gym_id, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  v_parsed := app.parse_cdc(v_cdc);

  select * into v_existing from public.invoices where gym_id = v_pay.gym_id and cdc = v_cdc;
  if v_existing.id is not null then
    if v_existing.payment_id = v_pay.id and v_existing.status = 'issued' then
      return v_existing.id;   -- reintento / doble clic
    end if;
    raise exception 'Ese CDC ya está registrado en otro cobro' using errcode = 'P0001';
  end if;

  if v_pay.status <> 'posted' then
    raise exception 'El cobro está anulado' using errcode = 'P0001';
  end if;

  select * into v_existing from public.invoices where payment_id = v_pay.id and status = 'issued';
  if v_existing.id is not null then
    raise exception 'Este cobro ya tiene la factura %', v_existing.invoice_number using errcode = 'P0001';
  end if;

  if v_parsed ->> 'doc_type' <> '01' then
    raise exception 'El CDC no corresponde a una factura electrónica' using errcode = 'P0001';
  end if;

  select * into v_gym from public.gyms where id = v_pay.gym_id;
  if v_gym.ruc is null then
    raise exception 'Cargue el RUC del gimnasio en Configuración antes de registrar facturas' using errcode = 'P0001';
  end if;
  if ltrim(split_part(v_gym.ruc, '-', 1), '0') <> v_parsed ->> 'ruc'
     or split_part(v_gym.ruc, '-', 2) <> v_parsed ->> 'ruc_dv' then
    raise exception 'El CDC pertenece a otro RUC (%-%)', v_parsed ->> 'ruc', v_parsed ->> 'ruc_dv' using errcode = 'P0001';
  end if;

  v_issued := (v_parsed ->> 'issued_on')::date;
  if v_issued > app.today() then
    raise exception 'La fecha de emisión del CDC es futura' using errcode = 'P0001';
  end if;
  if v_gym.fiscal_timbrado_from is not null and v_issued < v_gym.fiscal_timbrado_from then
    raise exception 'La fecha de emisión es anterior al inicio del timbrado' using errcode = 'P0001';
  end if;

  v_data := app.invoice_data(v_pay.id, p_anonymous);

  insert into public.invoices (gym_id, payment_id, cdc, invoice_number, issued_on,
                               receiver_kind, receiver_document, receiver_name, total, iva10, items)
  values (v_pay.gym_id, v_pay.id, v_cdc,
          (v_parsed ->> 'establishment') || '-' || (v_parsed ->> 'point') || '-' || (v_parsed ->> 'number'),
          v_issued,
          (v_data -> 'receiver' ->> 'kind')::public.invoice_receiver,
          v_data -> 'receiver' ->> 'document',
          v_data -> 'receiver' ->> 'name',
          (v_data ->> 'total')::bigint, (v_data ->> 'iva10')::bigint, v_data -> 'items')
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Este cobro ya tiene una factura vigente' using errcode = 'P0001';
end;
$$;

-- Marca una factura como cancelada en e-Kuatia (dentro del plazo) o acreditada con nota de crédito.
create or replace function public.cancel_invoice(p_invoice_id uuid, p_reason text, p_credit_note_cdc text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_nc text := nullif(regexp_replace(coalesce(p_credit_note_cdc, ''), '\D', '', 'g'), '');
  v_parsed jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if v_inv.id is null or not app.has_role(v_inv.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_inv.status <> 'issued' then
    raise exception 'La factura ya no está vigente' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique el motivo' using errcode = 'P0001';
  end if;

  if v_nc is not null then
    v_parsed := app.parse_cdc(v_nc);
    if v_parsed ->> 'doc_type' <> '05' then
      raise exception 'El CDC indicado no corresponde a una nota de crédito electrónica' using errcode = 'P0001';
    end if;
    if substr(v_nc, 3, 9) <> substr(v_inv.cdc, 3, 9) then
      raise exception 'La nota de crédito pertenece a otro RUC' using errcode = 'P0001';
    end if;
  end if;

  update public.invoices
  set status = case when v_nc is null then 'cancelled' else 'credited' end::public.invoice_status,
      cancelled_at = now(), cancelled_by = auth.uid(), cancel_reason = trim(p_reason), credit_note_cdc = v_nc
  where id = v_inv.id;
exception when unique_violation then
  raise exception 'Esa nota de crédito ya está registrada' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------
-- Anular un cobro exige que su factura ya no esté vigente.
-- ---------------------------------------------------------------------
create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments;
  v_cash boolean;
  v_session uuid;
  v_invoice text;
  a record;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if v_pay.id is null or not app.has_role(v_pay.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_pay.status = 'voided' then
    raise exception 'El pago ya está anulado' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique el motivo de la anulación' using errcode = 'P0001';
  end if;

  select invoice_number into v_invoice from public.invoices where payment_id = v_pay.id and status = 'issued';
  if v_invoice is not null then
    raise exception 'El cobro tiene la factura % vigente: cancélela en e-Kuatia o emita una nota de crédito y regístrelo antes de anular el cobro', v_invoice
      using errcode = 'P0001';
  end if;

  select affects_cash into v_cash from public.payment_methods where id = v_pay.method_id;
  if v_cash then
    -- La devolución del efectivo sale de la caja abierta (puede no ser la del cobro original).
    select id into v_session from public.cash_sessions where gym_id = v_pay.gym_id and status = 'open' for update;
    if v_session is null then
      raise exception 'Para anular un cobro en efectivo debe haber una caja abierta' using errcode = 'P0001';
    end if;
  end if;

  for a in select * from public.payment_allocations where payment_id = v_pay.id loop
    update public.charges
    set paid_amount = paid_amount - a.amount,
        status = app.charge_status_for(total, paid_amount - a.amount, due_on)
    where id = a.charge_id and status <> 'voided';
  end loop;

  update public.payments
  set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = v_pay.id;

  if v_session is not null then
    insert into public.cash_movements (gym_id, cash_session_id, direction, amount, source, source_id, note)
    values (v_pay.gym_id, v_session, 'out', v_pay.amount, 'payment_void', v_pay.id,
            'Anulación ' || v_pay.receipt_number || ': ' || trim(p_reason));
  end if;
end;
$$;

revoke execute on function public.invoice_draft(uuid, boolean) from public, anon;
revoke execute on function public.register_invoice(uuid, text, boolean) from public, anon;
revoke execute on function public.cancel_invoice(uuid, text, text) from public, anon;
grant execute on function public.invoice_draft(uuid, boolean) to authenticated;
grant execute on function public.register_invoice(uuid, text, boolean) to authenticated;
grant execute on function public.cancel_invoice(uuid, text, text) to authenticated;
