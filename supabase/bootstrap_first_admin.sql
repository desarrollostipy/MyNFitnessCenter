-- Asigna el PRIMER administrador. Ejecutar UNA vez desde el SQL Editor de Supabase
-- (corre como postgres, por eso puede saltear la RPC). Los siguientes roles se asignan
-- desde la pantalla Usuarios.
--
-- 1. El usuario debe existir: créelo en Authentication > Users > Add user (o regístrese).
-- 2. Reemplace el email y ejecute.

insert into public.user_gym_roles (user_id, gym_id, role)
select u.id, g.id, 'admin'
from auth.users u
cross join public.gyms g
where u.email = 'REEMPLAZAR@correo.com'
  and g.id = '00000000-0000-0000-0000-000000000001'
on conflict (user_id, gym_id, role) do nothing;

insert into public.audit_logs (gym_id, action, entity, entity_id, reason)
select '00000000-0000-0000-0000-000000000001', 'role.bootstrap_admin', 'user_gym_roles', u.id::text,
       'Alta inicial del primer administrador'
from auth.users u where u.email = 'REEMPLAZAR@correo.com';
