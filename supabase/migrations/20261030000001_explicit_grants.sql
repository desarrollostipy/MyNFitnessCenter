-- =====================================================================
-- Privilegios explícitos sobre el esquema public.
-- Los proyectos Supabase nuevos pueden tener desactivada la exposición automática
-- de tablas a la API; además se retira DELETE/TRUNCATE como defensa en profundidad
-- (el sistema no borra físicamente: anula o desactiva). RLS sigue decidiendo qué filas.
-- =====================================================================

grant usage on schema public to anon, authenticated;

grant select, insert, update on all tables in schema public to authenticated;
revoke delete, truncate on all tables in schema public from anon, authenticated;

-- El anónimo sólo lee el catálogo publicado (RLS filtra is_public/is_active).
revoke all on all tables in schema public from anon;
grant select on public.membership_plans, public.services to anon;

-- Auditoría: sólo lectura desde la API (se escribe por funciones security definer).
revoke insert, update on public.audit_logs from authenticated;
-- Roles: sólo vía admin_set_user_role.
revoke insert, update on public.user_gym_roles from authenticated;
