-- Datos iniciales reales (no ficticios). Se ejecuta con `supabase db reset` en local.
-- En producción, ejecutar una sola vez desde el SQL Editor.

insert into public.gyms (id, name, timezone, currency)
values ('00000000-0000-0000-0000-000000000001', 'MyN Fitness', 'America/Asuncion', 'PYG')
on conflict (id) do nothing;
