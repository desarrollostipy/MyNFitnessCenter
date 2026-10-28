-- =====================================================================
-- MyN Fitness — Incremento 11 (parcial): portal del alumno "Mi M&N"
-- El alumno ve a sus entrenadores asignados (sólo los propios).
-- =====================================================================

create policy assignments_select_student on public.trainer_student_assignments
  for select to authenticated
  using (student_id = app.current_student_id(gym_id));

create or replace function app.student_can_see_trainer(p_trainer_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trainer_student_assignments a
    join public.students s on s.id = a.student_id
    where a.trainer_id = p_trainer_id
      and s.user_id = auth.uid()
      and app.has_role(a.gym_id, 'student')
      and a.starts_on <= app.today()
      and (a.ends_on is null or a.ends_on > app.today())
  );
$$;

grant execute on function app.student_can_see_trainer(uuid) to authenticated;

create policy trainers_select_student on public.trainers
  for select to authenticated
  using (app.student_can_see_trainer(id));

-- Vincula una cuenta existente a la ficha del alumno (lo usa la invitación; sólo admin).
create or replace function public.link_student_user(p_student_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.students;
begin
  select * into v_s from public.students where id = p_student_id for update;
  if v_s.id is null or not app.has_role(v_s.gym_id, 'admin') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if v_s.user_id is not null and v_s.user_id <> p_user_id then
    raise exception 'El alumno ya tiene otra cuenta vinculada' using errcode = 'P0001';
  end if;
  update public.students set user_id = p_user_id where id = p_student_id;
  insert into public.user_gym_roles (user_id, gym_id, role, granted_by)
  values (p_user_id, v_s.gym_id, 'student', auth.uid())
  on conflict (user_id, gym_id, role) do nothing;
end;
$$;

revoke execute on function public.link_student_user(uuid, uuid) from public, anon;
grant execute on function public.link_student_user(uuid, uuid) to authenticated;
