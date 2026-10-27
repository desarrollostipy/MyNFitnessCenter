-- =====================================================================
-- MyN Fitness — Incremento 3: alumnos, entrenadores (ficha básica) y asignaciones
-- La remuneración y disponibilidad de entrenadores se agregan en el Incremento 7.
-- =====================================================================

-- Documento: mayúsculas, sin puntos ni espacios (CI paraguaya o documento extranjero).
create or replace function app.normalize_document(p text)
returns text
language sql
immutable
as $$
  select nullif(upper(regexp_replace(coalesce(p, ''), '[\s.]', '', 'g')), '');
$$;

-- ---------------------------------------------------------------------
-- Entrenadores (ficha básica)
-- ---------------------------------------------------------------------
create table public.trainers (
  id               uuid primary key default gen_random_uuid(),
  gym_id           uuid not null references public.gyms (id),
  user_id          uuid references auth.users (id),
  first_name       text not null check (length(trim(first_name)) between 1 and 80),
  last_name        text not null check (length(trim(last_name)) between 1 and 80),
  document_number  text check (document_number ~ '^[0-9A-Z-]{3,20}$'),
  phone            text check (length(phone) <= 30),
  email            text check (length(email) <= 254),
  specialties      text check (length(specialties) <= 500),
  is_active        boolean not null default true,
  created_by       uuid references auth.users (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (gym_id, document_number),
  unique (gym_id, user_id)
);

create trigger trainers_touch before update on public.trainers
  for each row execute function app.touch_updated_at();
create trigger trainers_audit after insert or update on public.trainers
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Alumnos
-- ---------------------------------------------------------------------
create type public.student_status as enum ('active', 'inactive');

create table public.students (
  id                       uuid primary key default gen_random_uuid(),
  gym_id                   uuid not null references public.gyms (id),
  user_id                  uuid references auth.users (id),
  first_name               text not null check (length(trim(first_name)) between 1 and 80),
  last_name                text not null check (length(trim(last_name)) between 1 and 80),
  document_number          text not null check (document_number ~ '^[0-9A-Z-]{3,20}$'),
  -- El límite superior (no futura) se valida en el formulario: un CHECK debe ser inmutable.
  birth_date               date check (birth_date >= date '1900-01-01'),
  phone                    text check (length(phone) <= 30),
  email                    text check (length(email) <= 254),
  address                  text check (length(address) <= 250),
  enrolled_on              date not null default app.today(),
  status                   public.student_status not null default 'active',
  status_reason            text check (length(status_reason) <= 500),
  status_changed_at        timestamptz,
  photo_path               text,
  emergency_contact_name   text check (length(emergency_contact_name) <= 120),
  emergency_contact_phone  text check (length(emergency_contact_phone) <= 30),
  notes                    text check (length(notes) <= 2000),
  lead_id                  uuid references public.leads (id),
  created_by               uuid references auth.users (id) default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (gym_id, document_number),
  unique (gym_id, user_id)
);

create index students_gym_status_idx on public.students (gym_id, status, last_name, first_name);
create index students_search_idx on public.students
  using gin (to_tsvector('simple', first_name || ' ' || last_name || ' ' || document_number));

-- Normaliza el documento antes de guardar (la unicidad compara documentos normalizados).
create or replace function app.students_normalize()
returns trigger
language plpgsql
as $$
begin
  new.document_number := app.normalize_document(new.document_number);
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  new.first_name := trim(new.first_name);
  new.last_name := trim(new.last_name);
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  return new;
end;
$$;

create trigger students_normalize before insert or update on public.students
  for each row execute function app.students_normalize();
create trigger students_touch before update on public.students
  for each row execute function app.touch_updated_at();
create trigger students_audit after insert or update on public.students
  for each row execute function app.audit_row();

create or replace function app.trainers_normalize()
returns trigger
language plpgsql
as $$
begin
  new.document_number := app.normalize_document(new.document_number);
  new.email := nullif(lower(trim(coalesce(new.email, ''))), '');
  return new;
end;
$$;

create trigger trainers_normalize before insert or update on public.trainers
  for each row execute function app.trainers_normalize();

-- Prospecto convertido en alumno.
alter table public.leads add column student_id uuid references public.students (id);

-- ---------------------------------------------------------------------
-- Asignaciones entrenador ↔ alumno (historial: se cierran, no se borran)
-- ---------------------------------------------------------------------
create table public.trainer_student_assignments (
  id           uuid primary key default gen_random_uuid(),
  gym_id       uuid not null references public.gyms (id),
  trainer_id   uuid not null references public.trainers (id),
  student_id   uuid not null references public.students (id),
  starts_on    date not null default app.today(),
  ends_on      date,
  assigned_by  uuid references auth.users (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  constraint assignment_dates check (ends_on is null or ends_on >= starts_on)
);

create unique index trainer_student_active_uniq
  on public.trainer_student_assignments (trainer_id, student_id)
  where ends_on is null;
create index trainer_student_by_student_idx on public.trainer_student_assignments (student_id);

create trigger trainer_student_assignments_audit after insert or update on public.trainer_student_assignments
  for each row execute function app.audit_row();

-- ---------------------------------------------------------------------
-- Funciones de autorización
-- ---------------------------------------------------------------------
create or replace function app.current_trainer_id(p_gym_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id from public.trainers t
  where t.gym_id = p_gym_id and t.user_id = auth.uid() and t.is_active
    and app.has_role(p_gym_id, 'trainer');
$$;

create or replace function app.current_student_id(p_gym_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select s.id from public.students s
  where s.gym_id = p_gym_id and s.user_id = auth.uid()
    and app.has_role(p_gym_id, 'student');
$$;

-- Asignación vigente. ends_on es el día en que deja de regir (exclusivo):
-- cerrar con ends_on = hoy corta el acceso de inmediato.
create or replace function app.trainer_can_see_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.trainer_student_assignments a
    join public.trainers t on t.id = a.trainer_id
    where a.student_id = p_student_id
      and t.user_id = auth.uid()
      and t.is_active
      and app.has_role(a.gym_id, 'trainer')
      and a.starts_on <= app.today()
      and (a.ends_on is null or a.ends_on > app.today())
  );
$$;

grant execute on function app.current_trainer_id(uuid) to authenticated;
grant execute on function app.current_student_id(uuid) to authenticated;
grant execute on function app.trainer_can_see_student(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.trainers enable row level security;
alter table public.students enable row level security;
alter table public.trainer_student_assignments enable row level security;

-- Entrenadores: staff ve todos; cada entrenador su ficha; admin administra.
create policy trainers_select_staff on public.trainers
  for select to authenticated using (app.is_staff(gym_id));
create policy trainers_select_own on public.trainers
  for select to authenticated using (user_id = auth.uid());
create policy trainers_insert_admin on public.trainers
  for insert to authenticated with check (app.has_role(gym_id, 'admin'));
create policy trainers_update_admin on public.trainers
  for update to authenticated
  using (app.has_role(gym_id, 'admin')) with check (app.has_role(gym_id, 'admin'));

-- Alumnos: staff ve todos; entrenador sólo asignados vigentes; alumno sólo su ficha; admin administra.
create policy students_select_staff on public.students
  for select to authenticated using (app.is_staff(gym_id));
create policy students_select_trainer on public.students
  for select to authenticated using (app.trainer_can_see_student(id));
create policy students_select_own on public.students
  for select to authenticated using (user_id = auth.uid() and app.has_role(gym_id, 'student'));
create policy students_insert_admin on public.students
  for insert to authenticated with check (app.has_role(gym_id, 'admin'));
create policy students_update_admin on public.students
  for update to authenticated
  using (app.has_role(gym_id, 'admin')) with check (app.has_role(gym_id, 'admin'));

-- Asignaciones: staff y el propio entrenador leen; admin crea y cierra.
create policy assignments_select_staff on public.trainer_student_assignments
  for select to authenticated using (app.is_staff(gym_id));
create policy assignments_select_trainer on public.trainer_student_assignments
  for select to authenticated using (trainer_id = app.current_trainer_id(gym_id));
create policy assignments_insert_admin on public.trainer_student_assignments
  for insert to authenticated with check (app.has_role(gym_id, 'admin'));
create policy assignments_update_admin on public.trainer_student_assignments
  for update to authenticated
  using (app.has_role(gym_id, 'admin')) with check (app.has_role(gym_id, 'admin'));

-- ---------------------------------------------------------------------
-- Storage: fotos de alumnos (bucket privado). Ruta: {gym_id}/{student_id}/{archivo}
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function app.can_read_student_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.gym_id::text = (storage.foldername(p_name))[1]
      and s.id::text = (storage.foldername(p_name))[2]
      and (
        app.is_staff(s.gym_id)
        or app.trainer_can_see_student(s.id)
        or (s.user_id = auth.uid() and app.has_role(s.gym_id, 'student'))
      )
  );
$$;

create or replace function app.can_write_student_photo(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.students s
    where s.gym_id::text = (storage.foldername(p_name))[1]
      and s.id::text = (storage.foldername(p_name))[2]
      and app.has_role(s.gym_id, 'admin')
  );
$$;

grant execute on function app.can_read_student_photo(text) to authenticated;
grant execute on function app.can_write_student_photo(text) to authenticated;

create policy student_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'student-photos' and app.can_read_student_photo(name));
create policy student_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'student-photos' and app.can_write_student_photo(name));
create policy student_photos_update on storage.objects
  for update to authenticated
  using (bucket_id = 'student-photos' and app.can_write_student_photo(name))
  with check (bucket_id = 'student-photos' and app.can_write_student_photo(name));
create policy student_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'student-photos' and app.can_write_student_photo(name));
