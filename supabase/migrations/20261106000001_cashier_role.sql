-- Rol Cajero (mostrador). Va en su propia migración: un valor nuevo de enum
-- no puede usarse en la misma transacción en que se crea.
alter type public.app_role add value if not exists 'cashier' after 'treasurer';
