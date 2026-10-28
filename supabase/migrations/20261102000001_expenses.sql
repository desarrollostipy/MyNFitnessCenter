-- =====================================================================
-- MyN Fitness — Incremento 6: egresos
-- Los egresos en efectivo salen de la caja abierta; los demás quedan registrados
-- con su medio. Nada se borra: se anulan con motivo y contramovimiento.
-- =====================================================================

create type public.expense_status as enum ('posted', 'voided');

create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  gym_id      uuid not null references public.gyms (id),
  name        text not null check (length(trim(name)) between 2 and 60),
  is_active   boolean not null default true,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (gym_id, name)
);

create trigger expense_categories_audit after insert or update on public.expense_categories
  for each row execute function app.audit_row();

insert into public.expense_categories (gym_id, name, sort_order)
select g.id, c.name, c.ord
from public.gyms g
cross join (values
  ('Profesores', 1), ('Alquiler', 2), ('Servicios (luz, agua, internet)', 3), ('Proveedores', 4),
  ('Mantenimiento', 5), ('Mercaderías', 6), ('Sueldos y cargas', 7), ('Impuestos y tasas', 8), ('Otros gastos', 9)
) as c(name, ord)
on conflict (gym_id, name) do nothing;

create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  category_id      uuid not null references public.expense_categories (id),
  description      text not null check (length(trim(description)) between 3 and 200),
  amount           bigint not null check (amount > 0),
  method_id        uuid not null references public.payment_methods (id),
  paid_on          date not null,
  supplier         text check (length(supplier) <= 120),
  document_ref     text check (length(document_ref) <= 60),
  cash_session_id  uuid references public.cash_sessions (id),
  status           public.expense_status not null default 'posted',
  voided_at        timestamptz,
  voided_by        uuid references auth.users (id),
  void_reason      text,
  idempotency_key  uuid not null unique,
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint expense_void check ((status = 'voided') = (voided_at is not null))
);

create index expenses_gym_date_idx on public.expenses (gym_id, paid_on desc);

create trigger expenses_audit after insert or update on public.expenses
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------
create or replace function public.register_expense(
  p_gym_id uuid,
  p_category_id uuid,
  p_description text,
  p_amount bigint,
  p_method_id uuid,
  p_paid_on date,
  p_supplier text default null,
  p_document_ref text default null,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
  v_method public.payment_methods;
  v_session uuid;
  v_id uuid;
begin
  if not app.has_any_role(p_gym_id, array['admin', 'treasurer']::public.app_role[]) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if p_idempotency_key is null then
    raise exception 'Falta la clave de operación' using errcode = 'P0001';
  end if;
  select id into v_existing from public.expenses where idempotency_key = p_idempotency_key;
  if v_existing is not null then
    return v_existing;
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El importe debe ser mayor a cero' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_description, ''))) < 3 then
    raise exception 'Describa el egreso' using errcode = 'P0001';
  end if;
  if p_paid_on is null or p_paid_on > app.today() or p_paid_on < app.today() - 60 then
    raise exception 'La fecha debe estar entre los últimos 60 días y hoy' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.expense_categories where id = p_category_id and gym_id = p_gym_id and is_active) then
    raise exception 'Categoría inválida' using errcode = 'P0001';
  end if;
  select * into v_method from public.payment_methods where id = p_method_id and gym_id = p_gym_id;
  if v_method.id is null or not v_method.is_active then
    raise exception 'Medio de pago inválido o inactivo' using errcode = 'P0001';
  end if;

  if v_method.affects_cash then
    select id into v_session from public.cash_sessions where gym_id = p_gym_id and status = 'open' for update;
    if v_session is null then
      raise exception 'Para pagar en efectivo debe haber una caja abierta' using errcode = 'P0001';
    end if;
    if p_amount > app.cash_expected(v_session) then
      raise exception 'No hay suficiente efectivo en caja (%)', app.cash_expected(v_session) using errcode = 'P0001';
    end if;
  end if;

  insert into public.expenses (gym_id, category_id, description, amount, method_id, paid_on, supplier, document_ref, cash_session_id, idempotency_key)
  values (p_gym_id, p_category_id, trim(p_description), p_amount, p_method_id, p_paid_on,
          nullif(trim(coalesce(p_supplier, '')), ''), nullif(trim(coalesce(p_document_ref, '')), ''), v_session, p_idempotency_key)
  returning id into v_id;

  if v_session is not null then
    insert into public.cash_movements (gym_id, cash_session_id, direction, amount, source, source_id, note)
    values (p_gym_id, v_session, 'out', p_amount, 'expense', v_id, 'Egreso: ' || trim(p_description));
  end if;
  return v_id;
end;
$$;

create or replace function public.void_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.expenses;
  v_session uuid;
begin
  select * into v_e from public.expenses where id = p_expense_id for update;
  if v_e.id is null or not app.has_role(v_e.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_e.status = 'voided' then
    raise exception 'El egreso ya está anulado' using errcode = 'P0001';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indique el motivo de la anulación' using errcode = 'P0001';
  end if;
  if v_e.cash_session_id is not null then
    -- El efectivo vuelve a la caja abierta.
    select id into v_session from public.cash_sessions where gym_id = v_e.gym_id and status = 'open' for update;
    if v_session is null then
      raise exception 'Para anular un egreso en efectivo debe haber una caja abierta' using errcode = 'P0001';
    end if;
    insert into public.cash_movements (gym_id, cash_session_id, direction, amount, source, source_id, note)
    values (v_e.gym_id, v_session, 'in', v_e.amount, 'expense', v_e.id, 'Anulación de egreso: ' || trim(p_reason));
  end if;
  update public.expenses set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = v_e.id;
end;
$$;

-- ---------------------------------------------------------------------
-- RLS y privilegios
-- ---------------------------------------------------------------------
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;

revoke all on public.expense_categories, public.expenses from anon;
revoke insert, update, delete, truncate on public.expenses from authenticated;
revoke delete, truncate on public.expense_categories from authenticated;
grant select on public.expenses to authenticated;
grant select, insert, update on public.expense_categories to authenticated;

create policy expense_categories_select on public.expense_categories
  for select to authenticated using (app.is_staff(gym_id));
create policy expense_categories_insert on public.expense_categories
  for insert to authenticated with check (app.has_role(gym_id, 'admin'));
create policy expense_categories_update on public.expense_categories
  for update to authenticated using (app.has_role(gym_id, 'admin')) with check (app.has_role(gym_id, 'admin'));
create policy expenses_select on public.expenses
  for select to authenticated using (app.is_staff(gym_id));

revoke execute on function public.register_expense(uuid, uuid, text, bigint, uuid, date, text, text, uuid) from public, anon;
revoke execute on function public.void_expense(uuid, text) from public, anon;
grant execute on function public.register_expense(uuid, uuid, text, bigint, uuid, date, text, text, uuid) to authenticated;
grant execute on function public.void_expense(uuid, text) to authenticated;
