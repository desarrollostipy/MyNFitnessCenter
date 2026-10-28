-- =====================================================================
-- MyN Fitness — Portal del alumno: entrenamientos, logros y ranking.
--   * Módulos opcionales por gimnasio (los activa el administrador).
--   * La asistencia sale de check_ins: hoy la registra recepción y, en la
--     Etapa 2, el molinete (source = 'device'); no cambia nada acá.
--   * Ranking mensual: nombre corto (María G.), el alumno puede no aparecer.
-- =====================================================================

alter table public.gyms
  add column module_training boolean not null default true,
  add column module_achievements boolean not null default true,
  add column module_ranking boolean not null default true;

alter table public.students
  add column ranking_opt_out boolean not null default false;

-- ---------------------------------------------------------------------
-- Ranking de asistencia del mes. Visible a cualquier miembro del gimnasio
-- con el módulo activo. Devuelve los primeros p_limit puestos y, si quien
-- consulta es alumno y quedó más abajo, también su propia fila.
-- ---------------------------------------------------------------------
create or replace function public.attendance_ranking(p_gym_id uuid, p_month date default null, p_limit int default 10)
returns table (rank_position int, student_label text, visits int, is_me boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from date := date_trunc('month', coalesce(p_month, app.today()))::date;
  v_to date := (date_trunc('month', coalesce(p_month, app.today())) + interval '1 month')::date;
  v_me uuid := app.current_student_id(p_gym_id);
  v_limit int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if not exists (select 1 from public.user_gym_roles r where r.user_id = auth.uid() and r.gym_id = p_gym_id) then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  if not (select module_ranking from public.gyms where id = p_gym_id) then
    raise exception 'El ranking no está habilitado' using errcode = 'P0001';
  end if;

  return query
  with counts as (
    select c.student_id, count(*)::int as n
    from public.check_ins c
    where c.gym_id = p_gym_id and c.business_date >= v_from and c.business_date < v_to
    group by c.student_id
  ), ranked as (
    select (rank() over (order by k.n desc))::int as pos,
           split_part(trim(s.first_name), ' ', 1) || ' ' || upper(left(trim(s.last_name), 1)) || '.' as label,
           k.n,
           s.id = v_me as mine
    from counts k
    join public.students s on s.id = k.student_id
    where s.status = 'active' and not s.ranking_opt_out
  )
  select r.pos, r.label, r.n, r.mine
  from ranked r
  where r.pos <= v_limit or r.mine
  order by r.pos, r.label;
end;
$$;

-- El alumno decide si aparece en el ranking.
create or replace function public.set_ranking_opt_out(p_gym_id uuid, p_opt_out boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := app.current_student_id(p_gym_id);
begin
  if v_me is null then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  update public.students set ranking_opt_out = coalesce(p_opt_out, false) where id = v_me;
end;
$$;

revoke execute on function public.attendance_ranking(uuid, date, int) from public, anon;
revoke execute on function public.set_ranking_opt_out(uuid, boolean) from public, anon;
grant execute on function public.attendance_ranking(uuid, date, int) to authenticated;
grant execute on function public.set_ranking_opt_out(uuid, boolean) to authenticated;
