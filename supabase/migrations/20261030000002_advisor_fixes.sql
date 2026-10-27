-- =====================================================================
-- Correcciones del analizador de Supabase (db advisors) sobre el proyecto real.
-- =====================================================================

-- Seguridad: search_path fijo en funciones (evita resolución de objetos manipulable).
alter function app.today() set search_path = '';
alter function app.touch_updated_at() set search_path = '';
alter function app.is_staff(uuid) set search_path = '';
alter function app.payment_method_code_immutable() set search_path = '';
alter function app.normalize_document(text) set search_path = '';
alter function app.students_normalize() set search_path = '';
alter function app.trainers_normalize() set search_path = '';

-- Seguridad: extensiones fuera del esquema expuesto por la API.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Rendimiento: auth.uid() evaluado una vez por consulta, no por fila.
drop policy gyms_select_members on public.gyms;
create policy gyms_select_members on public.gyms
  for select to authenticated
  using (exists (
    select 1 from public.user_gym_roles r
    where r.user_id = (select auth.uid()) and r.gym_id = gyms.id
  ));

drop policy profiles_select_own on public.user_profiles;
create policy profiles_select_own on public.user_profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy profiles_update_own on public.user_profiles;
create policy profiles_update_own on public.user_profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy roles_select_own on public.user_gym_roles;
create policy roles_select_own on public.user_gym_roles
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy trainers_select_own on public.trainers;
create policy trainers_select_own on public.trainers
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy students_select_own on public.students;
create policy students_select_own on public.students
  for select to authenticated
  using (user_id = (select auth.uid()) and app.has_role(gym_id, 'student'));
