-- Datos iniciales reales (no ficticios). Se ejecuta con `supabase db reset` en local.
-- En producción, ejecutar una sola vez desde el SQL Editor.

insert into public.gyms (id, name, timezone, currency)
values ('00000000-0000-0000-0000-000000000001', 'MyN Fitness', 'America/Asuncion', 'PYG')
on conflict (id) do nothing;

-- Medios de pago base (Incremento 2). Sólo el efectivo afecta la caja física.
insert into public.payment_methods (gym_id, code, name, affects_cash, sort_order)
values
  ('00000000-0000-0000-0000-000000000001', 'cash', 'Efectivo', true, 1),
  ('00000000-0000-0000-0000-000000000001', 'transfer', 'Transferencia', false, 2),
  ('00000000-0000-0000-0000-000000000001', 'card', 'Tarjeta', false, 3)
on conflict (gym_id, code) do nothing;
