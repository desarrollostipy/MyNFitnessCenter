-- =====================================================================
-- Elimina TODOS los datos de demostración cargados con seed_demo.sql
-- (ids que empiezan con 'de'). No toca datos reales.
-- Ejecutar:  npx supabase db query --linked -f supabase/demo/remove_demo.sql
-- Si algún plan o servicio de demo ya fue usado por un alumno REAL, el borrado
-- se detiene (clave foránea) y no elimina nada: en ese caso desactive el plan.
-- =====================================================================

begin;

create temp table demo_subs on commit drop as
  select id from public.subscriptions where student_id::text like 'de%';
create temp table demo_periods on commit drop as
  select id from public.subscription_periods where subscription_id in (select id from demo_subs);

create temp table demo_payments on commit drop as
  select id from public.payments where student_id::text like 'de%';

delete from public.check_ins where student_id::text like 'de%';
delete from public.cash_movements where source_id in (select id from demo_payments) or source_id::text like 'de%';
delete from public.expenses where id::text like 'de%';
delete from public.payment_allocations where payment_id in (select id from demo_payments);
delete from public.payments where id in (select id from demo_payments);
-- La numeración de recibos sigue desde el último recibo real.
update public.receipt_sequences rs
set last_number = coalesce((
  select max(substring(p.receipt_number from '\d+$')::bigint) from public.payments p where p.gym_id = rs.gym_id
), 0);

delete from public.session_entitlements where subscription_period_id in (select id from demo_periods);
delete from public.charges where student_id::text like 'de%';
delete from public.subscription_pauses where subscription_id in (select id from demo_subs);
delete from public.subscription_periods where id in (select id from demo_periods);
delete from public.subscriptions where id in (select id from demo_subs);
delete from public.trainer_student_assignments where id::text like 'de%' or student_id::text like 'de%' or trainer_id::text like 'de%';
update public.leads set student_id = null where student_id::text like 'de%';
update public.students set lead_id = null where lead_id::text like 'de%';
delete from public.leads where id::text like 'de%';
delete from public.students where id::text like 'de%';
delete from public.trainers where id::text like 'de%';
delete from public.membership_plans where id::text like 'de%';
delete from public.services where id::text like 'de%';

-- Registros de auditoría generados por la carga de demostración.
delete from public.audit_logs
where entity_id like 'de%'
   or (entity in ('charges', 'subscriptions', 'subscription_periods', 'payments', 'expenses') and (after ->> 'student_id' like 'de%' or before ->> 'student_id' like 'de%'));

commit;

select
  (select count(*) from public.students where id::text like 'de%') as alumnos_demo_restantes,
  (select count(*) from public.membership_plans where id::text like 'de%') as planes_demo_restantes;
