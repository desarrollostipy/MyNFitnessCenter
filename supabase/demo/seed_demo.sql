-- =====================================================================
-- DATOS DE DEMOSTRACIÓN para presentar el sistema. NO son datos reales.
-- Identificación: ids que empiezan con 'de', documentos 'DEMO-…', emails @demo.mynfitness.
-- Se eliminan por completo con supabase/demo/remove_demo.sql.
-- Ejecutar:  npx supabase db query --linked -f supabase/demo/seed_demo.sql
-- =====================================================================

begin;

-- Servicios ------------------------------------------------------------
insert into public.services (id, gym_id, name, description, duration_minutes, price, is_bookable, is_commissionable, cancellation_hours, sort_order) values
  ('de000000-0000-4000-8000-000000000201', '00000000-0000-0000-0000-000000000001', 'Entrenamiento personalizado', 'Sesión individual con profesor: técnica, cargas y progresión. Precio de ejemplo.', 60, 80000, true, true, 12, 1),
  ('de000000-0000-4000-8000-000000000202', '00000000-0000-0000-0000-000000000001', 'Evaluación física', 'Medidas, test de fuerza y movilidad, definición de objetivos. Precio de ejemplo.', 45, 50000, true, true, 24, 2),
  ('de000000-0000-4000-8000-000000000203', '00000000-0000-0000-0000-000000000001', 'Clase de prueba', 'Primera clase sin costo para conocer el gimnasio.', 60, 0, true, false, 6, 3)
on conflict do nothing;

-- Planes ---------------------------------------------------------------
insert into public.membership_plans (id, gym_id, name, description, plan_type, price, duration_months, duration_days, included_sessions, included_service_id, benefits, conditions, sort_order) values
  ('de000000-0000-4000-8000-000000000301', '00000000-0000-0000-0000-000000000001', 'Mensual libre', 'Acceso libre a la sala. Precio de ejemplo.', 'monthly', 250000, 1, null, 0, null,
    array['Acceso libre a sala de musculación', 'Horario completo', 'Rutina inicial con profesor'], 'Pago por adelantado. Sin matrícula.', 1),
  ('de000000-0000-4000-8000-000000000302', '00000000-0000-0000-0000-000000000001', 'Trimestral', 'Tres meses con ahorro. Precio de ejemplo.', 'quarterly', 690000, 3, null, 0, null,
    array['Acceso libre a sala', 'Ahorrás G. 60.000', 'Evaluación física al inicio'], null, 2),
  ('de000000-0000-4000-8000-000000000303', '00000000-0000-0000-0000-000000000001', 'Anual', 'El mejor precio por mes. Precio de ejemplo.', 'annual', 2400000, 12, null, 0, null,
    array['Acceso libre a sala', 'Ahorrás G. 600.000', 'Evaluación trimestral'], null, 3),
  ('de000000-0000-4000-8000-000000000304', '00000000-0000-0000-0000-000000000001', 'Pack 8 personalizadas', 'Ocho sesiones individuales para usar en 30 días. Precio de ejemplo.', 'sessions', 560000, null, 30, 8, 'de000000-0000-4000-8000-000000000201',
    array['8 sesiones con profesor', 'Plan de entrenamiento a medida'], 'Válido 30 días desde el inicio.', 4),
  ('de000000-0000-4000-8000-000000000305', '00000000-0000-0000-0000-000000000001', 'Mensual + 4 personalizadas', 'Sala libre más una sesión personalizada por semana. Precio de ejemplo.', 'custom', 450000, 1, null, 4, 'de000000-0000-4000-8000-000000000201',
    array['Acceso libre a sala', '4 sesiones con profesor', 'Seguimiento mensual'], null, 5)
on conflict do nothing;

-- Entrenadores (sin usuario vinculado) ----------------------------------
insert into public.trainers (id, gym_id, first_name, last_name, document_number, phone, specialties) values
  ('de000000-0000-4000-8000-000000000101', '00000000-0000-0000-0000-000000000001', 'Carlos', 'Benítez', 'DEMO-T01', '0981 400 101', 'Fuerza, hipertrofia'),
  ('de000000-0000-4000-8000-000000000102', '00000000-0000-0000-0000-000000000001', 'Lorena', 'Giménez', 'DEMO-T02', '0982 400 102', 'Funcional, pérdida de peso'),
  ('de000000-0000-4000-8000-000000000103', '00000000-0000-0000-0000-000000000001', 'Matías', 'Ortiz', 'DEMO-T03', '0971 400 103', 'Movilidad, readaptación')
on conflict do nothing;

-- Alumnos ----------------------------------------------------------------
insert into public.students (id, gym_id, first_name, last_name, document_number, birth_date, phone, email, enrolled_on, emergency_contact_name, emergency_contact_phone, notes)
select ('de000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000001',
       fn, ln, 'DEMO-' || (1000 + n), bd::date, ph, lower(fn) || '.' || n || '@demo.mynfitness', app.today() - enr, ecn, ecp,
       'Alumno de demostración.' || coalesce(' ' || obs, '')
from (values
  (1,  'María',     'González',  '1995-04-12', '0981 555 101', 80,  'Rosa González (madre)', '0981 555 901', 'Objetivo: tonificación.'),
  (2,  'Juan',      'Benítez',   '1990-09-03', '0982 555 102', 120, null, null, null),
  (3,  'Ana',       'Martínez',  '1998-01-25', '0971 555 103', 45,  null, null, 'Prefiere turno mañana.'),
  (4,  'Diego',     'Fernández', '1987-06-30', '0983 555 104', 200, 'Laura Ruiz (esposa)', '0983 555 904', null),
  (5,  'Sofía',     'Giménez',   '2001-11-08', '0984 555 105', 30,  null, null, null),
  (6,  'Lucas',     'Ramírez',   '1993-02-17', '0985 555 106', 95,  null, null, 'Preparación para carrera 10K.'),
  (7,  'Camila',    'Duarte',    '1999-07-21', '0986 555 107', 60,  null, null, null),
  (8,  'Matías',    'Villalba',  '1996-05-02', '0981 555 108', 150, null, null, null),
  (9,  'Valentina', 'Rojas',     '2000-12-14', '0982 555 109', 70,  'Pedro Rojas (padre)', '0982 555 909', null),
  (10, 'Federico',  'Acosta',    '1985-03-09', '0971 555 110', 400, null, null, 'Alumno desde la apertura.'),
  (11, 'Lucía',     'Ortiz',     '1997-08-28', '0983 555 111', 20,  null, null, null),
  (12, 'Rodrigo',   'Cáceres',   '1992-10-05', '0984 555 112', 110, null, null, null),
  (13, 'Florencia', 'Sosa',      '2003-04-19', '0985 555 113', 10,  null, null, 'Recién inscripta.'),
  (14, 'Hugo',      'Insfrán',   '1989-01-11', '0986 555 114', 300, null, null, null)
) as t(n, fn, ln, bd, ph, enr, ecn, ecp, obs)
on conflict do nothing;

-- Un alumno dado de baja (baja lógica con motivo).
update public.students set status = 'inactive', status_reason = 'Se mudó a Encarnación (demo)'
where id = 'de000000-0000-4000-8000-000000000414' and status = 'active';

-- Asignación de entrenadores
insert into public.trainer_student_assignments (id, gym_id, trainer_id, student_id, starts_on)
select ('de000000-0000-4000-8000-0000000006' || lpad(n::text, 2, '0'))::uuid, '00000000-0000-0000-0000-000000000001',
       ('de000000-0000-4000-8000-00000000010' || tr)::uuid,
       ('de000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid,
       app.today() - 30
from (values (1,1),(2,1),(3,1),(4,1),(5,1),(6,2),(7,2),(8,2),(9,2),(10,2),(11,3),(12,3),(13,3)) as a(n, tr)
on conflict do nothing;

-- Membresías: se crean con la misma lógica del sistema (períodos, cuotas y créditos).
do $$
declare
  r record;
  v_plan public.membership_plans;
  v_sub public.subscriptions;
begin
  for r in
    select * from (values
      (1,  301, 80,  0,      null,                      true),
      (2,  302, 120, 0,      null,                      true),
      (3,  305, 45,  0,      null,                      true),
      (4,  301, 70,  0,      null,                      true),
      (5,  304, 12,  0,      null,                      false),
      (6,  301, 95,  25000,  'Convenio empresa (demo)', true),
      (7,  305, 60,  0,      null,                      true),
      (8,  302, 150, 0,      null,                      true),
      (9,  301, 70,  0,      null,                      true),
      (10, 303, 200, 0,      null,                      true),
      (11, 301, 20,  0,      null,                      true),
      (12, 301, 100, 0,      null,                      true),
      (13, 301, 3,   0,      null,                      true)
    ) as t(n, plan, start_days_ago, discount, reason, auto_renew)
  loop
    if exists (select 1 from public.subscriptions where idempotency_key = ('de000000-0000-4000-8000-0000000007' || lpad(r.n::text, 2, '0'))::uuid) then
      continue;
    end if;
    select * into v_plan from public.membership_plans where id = ('de000000-0000-4000-8000-000000000' || r.plan)::uuid;
    insert into public.subscriptions (
      gym_id, student_id, plan_id, plan_name, duration_months, duration_days, included_sessions, included_service_id,
      price_agreed, discount_amount, discount_reason, auto_renew, starts_on, ends_on, idempotency_key
    ) values (
      v_plan.gym_id, ('de000000-0000-4000-8000-0000000004' || lpad(r.n::text, 2, '0'))::uuid, v_plan.id, v_plan.name,
      v_plan.duration_months, v_plan.duration_days, v_plan.included_sessions, v_plan.included_service_id,
      v_plan.price, r.discount, r.reason, r.auto_renew, app.today() - r.start_days_ago, app.today() - r.start_days_ago,
      ('de000000-0000-4000-8000-0000000007' || lpad(r.n::text, 2, '0'))::uuid
    ) returning * into v_sub;
    perform app.create_period(v_sub, v_sub.starts_on);
  end loop;
end $$;

-- Ponerlas al día como lo haría el proceso diario (renovaciones y vencimientos).
select app.run_daily_membership_jobs();

-- Cobros de ejemplo con la misma lógica del sistema (recibo interno, asignación a cuotas).
-- Todos al día salvo tres alumnos morosos (4, 9 y 12) y las cuotas del período actual.
-- Se usan transferencias / tarjeta para no alterar la caja de efectivo real.
do $$
declare
  c record;
  v_method uuid;
  i int := 0;
begin
  for c in
    select ch.* from public.charges ch
    where ch.student_id::text like 'de%'
      and ch.status in ('pending', 'overdue', 'partial')
      and ch.due_on < app.today() - 2
      and ch.student_id not in (
        'de000000-0000-4000-8000-000000000404',
        'de000000-0000-4000-8000-000000000409',
        'de000000-0000-4000-8000-000000000412'
      )
    order by ch.due_on, ch.created_at
  loop
    i := i + 1;
    select id into v_method from public.payment_methods
    where gym_id = c.gym_id and code = case when i % 3 = 0 then 'card' else 'transfer' end;
    perform app.post_payment(
      c.student_id, v_method, c.total - c.paid_amount,
      jsonb_build_array(jsonb_build_object('charge_id', c.id, 'amount', c.total - c.paid_amount)),
      'DEMO-' || lpad(i::text, 4, '0'), 'Cobro de demostración',
      ('de000000-0000-4000-8000-' || lpad(to_hex(900000 + i), 12, '0'))::uuid,
      (c.due_on + 1)::timestamp at time zone 'America/Asuncion' + interval '10 hours'
    );
  end loop;

  -- Pago parcial de ejemplo (alumna 9: mitad de la cuota vencida más reciente).
  select * into c from public.charges
  where student_id = 'de000000-0000-4000-8000-000000000409' and status = 'overdue' and paid_amount = 0
  order by due_on desc limit 1;
  if c.id is not null then
    select id into v_method from public.payment_methods where gym_id = c.gym_id and code = 'transfer';
    perform app.post_payment(
      c.student_id, v_method, c.total / 2,
      jsonb_build_array(jsonb_build_object('charge_id', c.id, 'amount', c.total / 2)),
      'DEMO-PARCIAL', 'Pago parcial de demostración',
      'de000000-0000-4000-8000-0000009fffff'::uuid,
      (c.due_on + 3)::timestamp at time zone 'America/Asuncion' + interval '18 hours'
    );
  end if;
end $$;

-- Créditos usados de ejemplo (pack de sesiones).
update public.session_entitlements e set used = 3
from public.subscription_periods p, public.subscriptions s
where e.subscription_period_id = p.id and p.subscription_id = s.id
  and s.student_id = 'de000000-0000-4000-8000-000000000405';

-- Prospectos ------------------------------------------------------------
insert into public.leads (id, gym_id, full_name, phone, email, interest, plan_id, service_id, preferred_date, message, status, internal_notes, contacted_at, created_at) values
  ('de000000-0000-4000-8000-000000000501', '00000000-0000-0000-0000-000000000001', 'Andrea Galeano', '0981777201', null, 'trial_class', null, 'de000000-0000-4000-8000-000000000203', app.today() + 2, 'Quiero probar antes de inscribirme.', 'new', null, null, now() - interval '3 hours'),
  ('de000000-0000-4000-8000-000000000502', '00000000-0000-0000-0000-000000000001', 'Martín Aquino', null, 'martin@demo.mynfitness', 'enrollment', 'de000000-0000-4000-8000-000000000302', null, null, '¿Tienen estacionamiento?', 'new', null, null, now() - interval '1 day'),
  ('de000000-0000-4000-8000-000000000503', '00000000-0000-0000-0000-000000000001', 'Paola Núñez', '0982777203', 'paola@demo.mynfitness', 'info', null, null, null, 'Horarios del sábado.', 'contacted', 'Se envió horario por WhatsApp.', now() - interval '20 hours', now() - interval '2 days'),
  ('de000000-0000-4000-8000-000000000504', '00000000-0000-0000-0000-000000000001', 'Gustavo Medina', '0971777204', null, 'enrollment', 'de000000-0000-4000-8000-000000000301', null, null, null, 'contacted', 'Viene el lunes a inscribirse.', now() - interval '2 days', now() - interval '4 days'),
  ('de000000-0000-4000-8000-000000000505', '00000000-0000-0000-0000-000000000001', 'Natalia Brítez', '0983777205', null, 'trial_class', null, 'de000000-0000-4000-8000-000000000201', null, null, 'lost', 'Eligió otro gimnasio por cercanía.', now() - interval '6 days', now() - interval '9 days'),
  ('de000000-0000-4000-8000-000000000506', '00000000-0000-0000-0000-000000000001', 'Florencia Sosa', '0985 555 113', null, 'enrollment', 'de000000-0000-4000-8000-000000000301', null, null, 'Quiero empezar esta semana.', 'converted', 'Inscripta.', now() - interval '10 days', now() - interval '12 days')
on conflict do nothing;

update public.leads set student_id = 'de000000-0000-4000-8000-000000000413'
where id = 'de000000-0000-4000-8000-000000000506' and student_id is null;

commit;

-- Resumen
select
  (select count(*) from public.students where id::text like 'de%') as alumnos,
  (select count(*) from public.subscriptions where student_id::text like 'de%') as membresias,
  (select count(*) from public.charges where student_id::text like 'de%') as cuotas,
  (select count(*) from public.charges where student_id::text like 'de%' and status = 'overdue') as cuotas_vencidas,
  (select count(*) from public.payments where student_id::text like 'de%') as cobros,
  (select count(*) from public.leads where id::text like 'de%') as prospectos;
