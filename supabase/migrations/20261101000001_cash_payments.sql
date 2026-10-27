-- =====================================================================
-- MyN Fitness — Incremento 5: caja diaria, cobros y recibos internos (no fiscales)
-- Reglas:
--   * Sólo el efectivo físico mueve la caja; transferencias/tarjetas quedan en pagos.
--   * Todo cobro es idempotente (clave única) y se asigna a cuotas con bloqueo de filas.
--   * Nada se borra: los pagos se anulan con contramovimiento y motivo.
-- =====================================================================

create type public.cash_session_status as enum ('open', 'closed');
create type public.cash_direction as enum ('in', 'out');
create type public.cash_source as enum ('payment', 'payment_void', 'expense', 'payout', 'adjustment');
create type public.payment_status as enum ('posted', 'voided');

-- ---------------------------------------------------------------------
-- Caja diaria
-- ---------------------------------------------------------------------
create table public.cash_sessions (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  business_date    date not null default app.today(),
  status           public.cash_session_status not null default 'open',
  opened_by        uuid not null references auth.users (id) default auth.uid(),
  opened_at        timestamptz not null default now(),
  opening_amount   bigint not null check (opening_amount >= 0),
  closed_by        uuid references auth.users (id),
  closed_at        timestamptz,
  expected_amount  bigint,
  counted_amount   bigint check (counted_amount >= 0),
  difference       bigint,
  close_notes      text check (length(close_notes) <= 1000),
  constraint cash_closed_fields check (
    (status = 'open' and closed_at is null) or
    (status = 'closed' and closed_at is not null and counted_amount is not null and expected_amount is not null)
  )
);

-- Una sola caja abierta por gimnasio.
create unique index cash_sessions_one_open on public.cash_sessions (gym_id) where status = 'open';
create index cash_sessions_gym_date_idx on public.cash_sessions (gym_id, opened_at desc);

create table public.cash_movements (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  cash_session_id  uuid not null references public.cash_sessions (id),
  direction        public.cash_direction not null,
  amount           bigint not null check (amount > 0),
  source           public.cash_source not null,
  source_id        uuid,
  note             text check (length(note) <= 500),
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now()
);

create index cash_movements_session_idx on public.cash_movements (cash_session_id, created_at);

-- ---------------------------------------------------------------------
-- Numeración de recibos internos
-- ---------------------------------------------------------------------
create table public.receipt_sequences (
  gym_id       uuid primary key references public.gyms (id),
  prefix       text not null default 'RI',
  last_number  bigint not null default 0
);

create or replace function app.next_receipt_number(p_gym_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_n bigint;
begin
  insert into public.receipt_sequences (gym_id) values (p_gym_id) on conflict (gym_id) do nothing;
  update public.receipt_sequences set last_number = last_number + 1
  where gym_id = p_gym_id
  returning prefix, last_number into v_prefix, v_n;   -- la fila queda bloqueada hasta el fin de la transacción
  return v_prefix || '-' || lpad(v_n::text, 6, '0');
end;
$$;

revoke execute on function app.next_receipt_number(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Pagos y asignación a cuotas
-- ---------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  student_id       uuid not null references public.students (id),
  method_id        uuid not null references public.payment_methods (id),
  amount           bigint not null check (amount > 0),
  paid_at          timestamptz not null default now(),
  reference        text check (length(reference) <= 120),
  notes            text check (length(notes) <= 500),
  cash_session_id  uuid references public.cash_sessions (id),
  receipt_number   text not null,
  status           public.payment_status not null default 'posted',
  voided_at        timestamptz,
  voided_by        uuid references auth.users (id),
  void_reason      text,
  idempotency_key  uuid not null unique,
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (gym_id, receipt_number),
  constraint payment_void check ((status = 'voided') = (voided_at is not null))
);

create index payments_gym_paid_idx on public.payments (gym_id, paid_at desc);
create index payments_student_idx on public.payments (student_id, paid_at desc);

create trigger payments_audit after insert or update on public.payments
  for each row execute function app.audit_row();

create table public.payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id),
  payment_id  uuid not null references public.payments (id),
  charge_id   uuid not null references public.charges (id),
  amount      bigint not null check (amount > 0),
  unique (payment_id, charge_id)
);

create index payment_allocations_charge_idx on public.payment_allocations (charge_id);

-- ---------------------------------------------------------------------
-- Núcleo de cobro (sin control de rol: lo usan la RPC pública y procesos internos)
-- p_allocations: [{"charge_id": "...", "amount": 123}] o null = cuotas más antiguas primero.
-- ---------------------------------------------------------------------
create or replace function app.post_payment(
  p_student_id uuid,
  p_method_id uuid,
  p_amount bigint,
  p_allocations jsonb,
  p_reference text,
  p_notes text,
  p_idempotency_key uuid,
  p_paid_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_student public.students;
  v_method public.payment_methods;
  v_session uuid;
  v_payment_id uuid;
  v_remaining bigint := p_amount;
  v_alloc bigint;
  v_balance bigint;
  v_total_open bigint;
  c public.charges;
  a record;
begin
  if p_idempotency_key is null then
    raise exception 'Falta la clave de operación' using errcode = 'P0001';
  end if;
  -- Reintento / doble clic: devuelve el pago ya registrado.
  select id into v_existing from public.payments where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor a cero' using errcode = 'P0001';
  end if;

  select * into v_student from public.students where id = p_student_id;
  if v_student.id is null then
    raise exception 'Alumno inexistente' using errcode = 'P0001';
  end if;

  select * into v_method from public.payment_methods where id = p_method_id and gym_id = v_student.gym_id;
  if v_method.id is null or not v_method.is_active then
    raise exception 'Medio de pago inválido o inactivo' using errcode = 'P0001';
  end if;

  if v_method.affects_cash then
    select id into v_session from public.cash_sessions
    where gym_id = v_student.gym_id and status = 'open'
    for update;
    if v_session is null then
      raise exception 'Para cobrar en efectivo debe haber una caja abierta' using errcode = 'P0001';
    end if;
  end if;

  -- Bloquea las cuotas abiertas del alumno (evita cobros simultáneos sobre el mismo saldo).
  perform 1 from public.charges
  where student_id = p_student_id and status in ('pending', 'partial', 'overdue')
  for update;

  select coalesce(sum(total - paid_amount), 0) into v_total_open
  from public.charges where student_id = p_student_id and status in ('pending', 'partial', 'overdue');
  if p_amount > v_total_open then
    raise exception 'El importe (%) supera el saldo pendiente del alumno (%)', p_amount, v_total_open using errcode = 'P0001';
  end if;

  insert into public.payments (gym_id, student_id, method_id, amount, paid_at, reference, notes, cash_session_id, receipt_number, idempotency_key)
  values (v_student.gym_id, p_student_id, p_method_id, p_amount, coalesce(p_paid_at, now()),
          nullif(trim(coalesce(p_reference, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
          v_session, app.next_receipt_number(v_student.gym_id), p_idempotency_key)
  returning id into v_payment_id;

  if p_allocations is not null and jsonb_array_length(p_allocations) > 0 then
    -- Asignación indicada por el usuario.
    for a in select (x ->> 'charge_id')::uuid as charge_id, (x ->> 'amount')::bigint as amount
             from jsonb_array_elements(p_allocations) x
    loop
      select * into c from public.charges where id = a.charge_id;
      if c.id is null or c.student_id <> p_student_id or c.status not in ('pending', 'partial', 'overdue') then
        raise exception 'Cuota inválida para este alumno' using errcode = 'P0001';
      end if;
      v_balance := c.total - c.paid_amount;
      if a.amount is null or a.amount <= 0 or a.amount > v_balance then
        raise exception 'El importe asignado a "%" supera su saldo (%)', c.concept, v_balance using errcode = 'P0001';
      end if;
      insert into public.payment_allocations (gym_id, payment_id, charge_id, amount)
      values (c.gym_id, v_payment_id, c.id, a.amount);
      update public.charges
      set paid_amount = paid_amount + a.amount,
          status = app.charge_status_for(total, paid_amount + a.amount, due_on)
      where id = c.id;
      v_remaining := v_remaining - a.amount;
    end loop;
    if v_remaining <> 0 then
      raise exception 'La suma asignada a las cuotas no coincide con el importe cobrado' using errcode = 'P0001';
    end if;
  else
    -- Automática: primero las cuotas más antiguas.
    for c in
      select * from public.charges
      where student_id = p_student_id and status in ('pending', 'partial', 'overdue')
      order by due_on, created_at
    loop
      exit when v_remaining = 0;
      v_alloc := least(v_remaining, c.total - c.paid_amount);
      continue when v_alloc <= 0;
      insert into public.payment_allocations (gym_id, payment_id, charge_id, amount)
      values (c.gym_id, v_payment_id, c.id, v_alloc);
      update public.charges
      set paid_amount = paid_amount + v_alloc,
          status = app.charge_status_for(total, paid_amount + v_alloc, due_on)
      where id = c.id;
      v_remaining := v_remaining - v_alloc;
    end loop;
  end if;

  if v_session is not null then
    insert into public.cash_movements (gym_id, cash_session_id, direction, amount, source, source_id, note)
    values (v_student.gym_id, v_session, 'in', p_amount, 'payment', v_payment_id,
            'Cobro ' || (select receipt_number from public.payments where id = v_payment_id));
  end if;

  return v_payment_id;
end;
$$;

revoke execute on function app.post_payment(uuid, uuid, bigint, jsonb, text, text, uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RPC públicas
-- ---------------------------------------------------------------------
create or replace function public.register_payment(
  p_student_id uuid,
  p_method_id uuid,
  p_amount bigint,
  p_allocations jsonb default null,
  p_reference text default null,
  p_notes text default null,
  p_idempotency_key uuid default null
)
returns uuid
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
  return app.post_payment(p_student_id, p_method_id, p_amount, p_allocations, p_reference, p_notes, p_idempotency_key);
end;
$$;

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

create or replace function public.open_cash_session(p_gym_id uuid, p_opening_amount bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.has_any_role(p_gym_id, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_opening_amount is null or p_opening_amount < 0 then
    raise exception 'Saldo inicial inválido' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cash_sessions where gym_id = p_gym_id and status = 'open') then
    raise exception 'Ya hay una caja abierta' using errcode = 'P0001';
  end if;
  insert into public.cash_sessions (gym_id, opening_amount) values (p_gym_id, p_opening_amount)
  returning id into v_id;
  perform app.audit(p_gym_id, 'cash.open', 'cash_sessions', v_id::text, null, jsonb_build_object('opening_amount', p_opening_amount));
  return v_id;
exception when unique_violation then
  raise exception 'Ya hay una caja abierta' using errcode = 'P0001';
end;
$$;

-- Saldo esperado de efectivo en una caja.
create or replace function app.cash_expected(p_session_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select s.opening_amount
       + coalesce(sum(m.amount) filter (where m.direction = 'in'), 0)
       - coalesce(sum(m.amount) filter (where m.direction = 'out'), 0)
  from public.cash_sessions s
  left join public.cash_movements m on m.cash_session_id = s.id
  where s.id = p_session_id
  group by s.opening_amount;
$$;

create or replace function public.register_cash_adjustment(
  p_session_id uuid,
  p_direction public.cash_direction,
  p_amount bigint,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.cash_sessions;
  v_id uuid;
begin
  select * into v_s from public.cash_sessions where id = p_session_id for update;
  if v_s.id is null or not app.has_any_role(v_s.gym_id, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La caja está cerrada' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor a cero' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_note, ''))) < 3 then
    raise exception 'Indique el concepto del movimiento' using errcode = 'P0001';
  end if;
  if p_direction = 'out' and p_amount > app.cash_expected(p_session_id) then
    raise exception 'No hay suficiente efectivo en caja para esa salida' using errcode = 'P0001';
  end if;
  insert into public.cash_movements (gym_id, cash_session_id, direction, amount, source, note)
  values (v_s.gym_id, v_s.id, p_direction, p_amount, 'adjustment', trim(p_note))
  returning id into v_id;
  perform app.audit(v_s.gym_id, 'cash.adjustment', 'cash_movements', v_id::text, null,
                    jsonb_build_object('direction', p_direction, 'amount', p_amount, 'note', trim(p_note)));
  return v_id;
end;
$$;

create or replace function public.close_cash_session(p_session_id uuid, p_counted_amount bigint, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.cash_sessions;
  v_expected bigint;
  v_diff bigint;
begin
  select * into v_s from public.cash_sessions where id = p_session_id for update;
  if v_s.id is null or not app.has_any_role(v_s.gym_id, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_s.status <> 'open' then
    raise exception 'La caja ya está cerrada' using errcode = 'P0001';
  end if;
  if p_counted_amount is null or p_counted_amount < 0 then
    raise exception 'Ingrese el efectivo contado' using errcode = 'P0001';
  end if;
  v_expected := app.cash_expected(p_session_id);
  v_diff := p_counted_amount - v_expected;
  if v_diff <> 0 and length(trim(coalesce(p_notes, ''))) < 3 then
    raise exception 'Hay una diferencia de %: explique el motivo para cerrar', v_diff using errcode = 'P0001';
  end if;
  update public.cash_sessions
  set status = 'closed', closed_by = auth.uid(), closed_at = now(), expected_amount = v_expected,
      counted_amount = p_counted_amount, difference = v_diff, close_notes = nullif(trim(coalesce(p_notes, '')), '')
  where id = p_session_id;
  perform app.audit(v_s.gym_id, 'cash.close', 'cash_sessions', p_session_id::text, null,
                    jsonb_build_object('expected', v_expected, 'counted', p_counted_amount, 'difference', v_diff));
  return jsonb_build_object('expected', v_expected, 'counted', p_counted_amount, 'difference', v_diff);
end;
$$;

-- ---------------------------------------------------------------------
-- RLS y privilegios: lectura según rol, escritura sólo por funciones.
-- ---------------------------------------------------------------------
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.receipt_sequences enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;

revoke all on public.cash_sessions, public.cash_movements, public.receipt_sequences,
  public.payments, public.payment_allocations from anon;
revoke insert, update, delete, truncate on public.cash_sessions, public.cash_movements, public.receipt_sequences,
  public.payments, public.payment_allocations from authenticated;
grant select on public.cash_sessions, public.cash_movements, public.payments, public.payment_allocations to authenticated;
revoke select on public.receipt_sequences from authenticated;

create policy cash_sessions_select on public.cash_sessions
  for select to authenticated using (app.is_staff(gym_id));
create policy cash_movements_select on public.cash_movements
  for select to authenticated using (app.is_staff(gym_id));
create policy payments_select on public.payments
  for select to authenticated
  using (app.is_staff(gym_id) or student_id = app.current_student_id(gym_id));
create policy payment_allocations_select on public.payment_allocations
  for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id));

revoke execute on function public.register_payment(uuid, uuid, bigint, jsonb, text, text, uuid) from public, anon;
revoke execute on function public.void_payment(uuid, text) from public, anon;
revoke execute on function public.open_cash_session(uuid, bigint) from public, anon;
revoke execute on function public.register_cash_adjustment(uuid, public.cash_direction, bigint, text) from public, anon;
revoke execute on function public.close_cash_session(uuid, bigint, text) from public, anon;
grant execute on function public.register_payment(uuid, uuid, bigint, jsonb, text, text, uuid) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.open_cash_session(uuid, bigint) to authenticated;
grant execute on function public.register_cash_adjustment(uuid, public.cash_direction, bigint, text) to authenticated;
grant execute on function public.close_cash_session(uuid, bigint, text) to authenticated;
grant execute on function app.cash_expected(uuid) to authenticated;
