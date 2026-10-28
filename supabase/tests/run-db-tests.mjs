// Pruebas de migraciones y permisos (RLS/RPC) contra PostgreSQL real en memoria (PGlite).
// No requiere Docker. Simula lo mínimo de Supabase: roles anon/authenticated, auth.users y auth.uid().
// Uso: npm run test:db
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const db = new PGlite({ extensions: { pgcrypto, btree_gist } })

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb,
    last_sign_in_at timestamptz,
    created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (
    id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid
  );
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated;
  grant all on storage.objects to authenticated;
  grant execute on function storage.foldername(text) to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`

let passed = 0
let failed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (e) {
    failed++
    console.log(`  FAIL ${name}\n       ${e.message}`)
  } finally {
    await db.exec('reset role; reset request.jwt.claim.sub;')
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}
async function as(userId) {
  await db.exec(`set role ${userId ? 'authenticated' : 'anon'}`)
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId ?? ''])
}
async function expectError(promise, code) {
  try {
    await promise
  } catch (e) {
    if (code && e.code !== code) throw new Error(`se esperaba código ${code}, llegó ${e.code}: ${e.message}`)
    return
  }
  throw new Error('se esperaba un error y la operación fue aceptada')
}

const GYM = '00000000-0000-0000-0000-000000000001'

console.log('Aplicando migraciones…')
await db.exec(SUPABASE_STUB)
const migDir = join(root, 'migrations')
for (const f of readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(migDir, f), 'utf8'))
  console.log(`  ${f}`)
}
await db.exec(readFileSync(join(root, 'seed.sql'), 'utf8'))

const mkUser = async (email, name) =>
  (
    await db.query(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [
      email,
      { full_name: name },
    ])
  ).rows[0].id

const admin = await mkUser('admin@myn.test', 'Admin Uno')
const plain = await mkUser('nuevo@myn.test', 'Usuario Nuevo')
const other = await mkUser('otro@myn.test', 'Otro Usuario')
await db.query(`insert into public.user_gym_roles (user_id, gym_id, role) values ($1, $2, 'admin')`, [admin, GYM])

console.log('\nPruebas')

await test('el registro crea el perfil con el nombre', async () => {
  const r = await db.query(`select full_name from public.user_profiles where id = $1`, [plain])
  assert(r.rows[0]?.full_name === 'Usuario Nuevo', 'perfil no creado')
})

await test('app.today() devuelve fecha', async () => {
  const r = await db.query(`select app.today() as d`)
  assert(r.rows[0].d instanceof Date, 'no es fecha')
})

await test('anónimo no ve gimnasios ni perfiles', async () => {
  await as(null)
  await expectError(db.query(`select * from public.gyms`), '42501')
  await expectError(db.query(`select * from public.user_profiles`), '42501')
})

await test('usuario sin rol no ve el gimnasio ni otros perfiles', async () => {
  await as(plain)
  assert((await db.query(`select * from public.gyms`)).rows.length === 0, 've gyms')
  const p = await db.query(`select id from public.user_profiles`)
  assert(p.rows.length === 1 && p.rows[0].id === plain, 've perfiles ajenos')
})

await test('usuario sin rol no puede listar usuarios', async () => {
  await as(plain)
  await expectError(db.query(`select * from public.admin_list_users($1)`, [GYM]), '42501')
})

await test('usuario sin rol no puede autoasignarse admin por RPC', async () => {
  await as(plain)
  await expectError(db.query(`select public.admin_set_user_role($1, $2, 'admin', true)`, [GYM, plain]), '42501')
})

await test('usuario sin rol no puede insertar roles directamente', async () => {
  await as(plain)
  await expectError(
    db.query(`insert into public.user_gym_roles (user_id, gym_id, role) values ($1, $2, 'admin')`, [plain, GYM]),
  )
})

await test('usuario no puede editar el perfil de otro', async () => {
  await as(plain)
  const r = await db.query(`update public.user_profiles set full_name = 'X' where id = $1`, [other])
  assert(r.affectedRows === 0, 'modificó perfil ajeno')
})

await test('admin lista usuarios con email', async () => {
  await as(admin)
  const r = await db.query(`select * from public.admin_list_users($1)`, [GYM])
  assert(r.rows.length === 3, `esperaba 3, llegaron ${r.rows.length}`)
  assert(r.rows.some((u) => u.email === 'nuevo@myn.test'), 'falta email')
})

await test('admin asigna tesorero y queda auditado', async () => {
  await as(admin)
  await db.query(`select public.admin_set_user_role($1, $2, 'treasurer', true)`, [GYM, plain])
  await db.query(`select public.admin_set_user_role($1, $2, 'treasurer', true)`, [GYM, plain]) // idempotente
  await db.exec('reset role')
  const a = await db.query(`select count(*)::int as n from public.audit_logs where action = 'role.grant' and entity_id = $1`, [plain])
  assert(a.rows[0].n === 1, `auditoría esperada 1, hay ${a.rows[0].n}`)
})

await test('tesorero ahora ve el gimnasio pero no la auditoría', async () => {
  await as(plain)
  assert((await db.query(`select * from public.gyms`)).rows.length === 1, 'no ve gym')
  assert((await db.query(`select * from public.audit_logs`)).rows.length === 0, 've auditoría')
})

await test('tesorero no puede modificar la configuración del gimnasio', async () => {
  await as(plain)
  const r = await db.query(`update public.gyms set name = 'Hack' where id = $1`, [GYM])
  assert(r.affectedRows === 0, 'modificó gym')
})

await test('admin modifica el gimnasio y queda auditado', async () => {
  await as(admin)
  const r = await db.query(`update public.gyms set phone = '0981000000' where id = $1`, [GYM])
  assert(r.affectedRows === 1, 'no actualizó')
  await db.exec('reset role')
  const a = await db.query(`select count(*)::int as n from public.audit_logs where action = 'gym.update'`)
  assert(a.rows[0].n === 1, 'sin auditoría')
})

await test('nadie puede borrar ni editar la auditoría', async () => {
  await as(admin)
  await expectError(db.query(`delete from public.audit_logs`), '42501')
  await expectError(db.query(`update public.audit_logs set reason = 'x'`), '42501')
})

await test('no se puede quitar el último administrador', async () => {
  await as(admin)
  await expectError(db.query(`select public.admin_set_user_role($1, $2, 'admin', false)`, [GYM, admin]), 'P0001')
})

await test('con dos admins, uno puede quitarse el rol', async () => {
  await as(admin)
  await db.query(`select public.admin_set_user_role($1, $2, 'admin', true)`, [GYM, other])
  await db.query(`select public.admin_set_user_role($1, $2, 'admin', false)`, [GYM, admin])
  await db.exec('reset role')
  const r = await db.query(`select count(*)::int as n from public.user_gym_roles where role = 'admin'`)
  assert(r.rows[0].n === 1, 'conteo de admins incorrecto')
})

// ---------------------------------------------------------------------
// Incremento 2: catálogo y prospectos
// ---------------------------------------------------------------------
console.log('\nIncremento 2')
const admin2 = other // tras la prueba anterior, "other" es el único admin
const treasurer = plain

let serviceId
let publicPlanId
let hiddenPlanId

await test('admin crea un servicio y queda auditado', async () => {
  await as(admin2)
  const r = await db.query(
    `insert into public.services (gym_id, name, duration_minutes, price) values ($1, 'Entrenamiento personalizado', 60, 80000) returning id`,
    [GYM],
  )
  serviceId = r.rows[0].id
  await db.exec('reset role')
  const a = await db.query(`select count(*)::int as n from public.audit_logs where action = 'services.insert'`)
  assert(a.rows[0].n === 1, 'sin auditoría')
})

await test('servicio grupal (capacidad > 1) rechazado en Etapa 1', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.services (gym_id, name, duration_minutes, price, capacity) values ($1, 'Funcional', 45, 0, 10)`, [GYM]),
    '23514',
  )
})

await test('admin crea planes válidos', async () => {
  await as(admin2)
  publicPlanId = (
    await db.query(
      `insert into public.membership_plans (gym_id, name, plan_type, price, duration_months, benefits)
       values ($1, 'Mensual libre', 'monthly', 250000, 1, '{"Acceso a sala"}') returning id`,
      [GYM],
    )
  ).rows[0].id
  hiddenPlanId = (
    await db.query(
      `insert into public.membership_plans (gym_id, name, plan_type, price, duration_days, included_sessions, included_service_id, is_public)
       values ($1, 'Pack 8 sesiones', 'sessions', 560000, 30, 8, $2, false) returning id`,
      [GYM, serviceId],
    )
  ).rows[0].id
})

await test('plan mensual con duración incorrecta rechazado', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_months) values ($1, 'Malo', 'monthly', 1, 2)`, [GYM]),
    '23514',
  )
})

await test('plan con dos duraciones o sin servicio para sesiones rechazado', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_months, duration_days) values ($1, 'Doble', 'custom', 1, 1, 30)`, [GYM]),
    '23514',
  )
  await expectError(
    db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_days, included_sessions) values ($1, 'SinServ', 'sessions', 1, 30, 4)`, [GYM]),
    '23514',
  )
})

await test('precio negativo rechazado', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_months) values ($1, 'Neg', 'custom', -1, 1)`, [GYM]),
    '23514',
  )
})

await test('tesorero no puede crear ni modificar planes', async () => {
  await as(treasurer)
  await expectError(
    db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_months) values ($1, 'T', 'monthly', 1, 1)`, [GYM]),
  )
  const u = await db.query(`update public.membership_plans set price = 1 where id = $1`, [publicPlanId])
  assert(u.affectedRows === 0, 'modificó el precio')
})

await test('anónimo ve sólo planes públicos y activos', async () => {
  await as(null)
  const r = await db.query(`select id from public.membership_plans`)
  assert(r.rows.length === 1 && r.rows[0].id === publicPlanId, `vio ${r.rows.length} planes`)
})

await test('plan desactivado deja de ser visible al público', async () => {
  await as(admin2)
  await db.query(`update public.membership_plans set is_active = false where id = $1`, [publicPlanId])
  await as(null)
  assert((await db.query(`select id from public.membership_plans`)).rows.length === 0, 'sigue visible')
  await as(admin2)
  await db.query(`update public.membership_plans set is_active = true where id = $1`, [publicPlanId])
})

await test('staff ve planes no públicos', async () => {
  await as(treasurer)
  assert((await db.query(`select id from public.membership_plans`)).rows.length === 2, 'no ve el plan oculto')
})

await test('medios de pago: tesorero lee, anónimo no; código inmutable', async () => {
  await as(treasurer)
  assert((await db.query(`select * from public.payment_methods`)).rows.length === 3, 'tesorero no ve medios')
  await as(null)
  await expectError(db.query(`select * from public.payment_methods`), '42501')
  await as(admin2)
  await expectError(db.query(`update public.payment_methods set code = 'efectivo' where code = 'cash'`), 'P0001')
})

await test('anónimo envía consulta con submit_lead', async () => {
  await as(null)
  await db.query(`select public.submit_lead($1, 'Ana Gómez', '0981 123-456', null, 'trial_class', null, $2, null, 'Quiero probar')`, [
    GYM,
    serviceId,
  ])
  await db.exec('reset role')
  const r = await db.query(`select phone, status from public.leads`)
  assert(r.rows.length === 1 && r.rows[0].phone === '0981123456' && r.rows[0].status === 'new', 'lead mal guardado')
})

await test('anónimo no puede leer ni insertar leads directamente', async () => {
  await as(null)
  await expectError(db.query(`select * from public.leads`), '42501')
  await expectError(
    db.query(`insert into public.leads (gym_id, full_name, phone) values ($1, 'X', '0981000000')`, [GYM]),
    '42501',
  )
})

await test('submit_lead valida contacto y plan no publicado', async () => {
  await as(null)
  await expectError(db.query(`select public.submit_lead($1, 'Sin Contacto', null, null, 'info')`, [GYM]), 'P0001')
  await expectError(db.query(`select public.submit_lead($1, 'Mail Malo', null, 'no-es-mail', 'info')`, [GYM]), 'P0001')
  await expectError(
    db.query(`select public.submit_lead($1, 'Oculto', '0981999999', null, 'enrollment', $2)`, [GYM, hiddenPlanId]),
    'P0001',
  )
})

await test('submit_lead limita a 3 solicitudes por contacto en 24 h', async () => {
  await as(null)
  for (let i = 0; i < 3; i++) {
    await db.query(`select public.submit_lead($1, 'Spam', null, 'spam@x.com', 'info')`, [GYM])
  }
  await expectError(db.query(`select public.submit_lead($1, 'Spam', null, 'SPAM@x.com', 'info')`, [GYM]), 'P0001')
})

await test('tesorero ve y gestiona prospectos; usuario sin rol no', async () => {
  await as(treasurer)
  const r = await db.query(`update public.leads set status = 'contacted', contacted_at = now() where full_name = 'Ana Gómez'`)
  assert(r.affectedRows === 1, 'no actualizó')
  const noRole = await mkUserRaw('sinrol@myn.test')
  await as(noRole)
  assert((await db.query(`select * from public.leads`)).rows.length === 0, 'usuario sin rol ve leads')
})

// ---------------------------------------------------------------------
// Incremento 3: alumnos, entrenadores y asignaciones
// ---------------------------------------------------------------------
console.log('\nIncremento 3')
const trainerUser = await mkUserRaw('profe@myn.test')
const trainerUser2 = await mkUserRaw('profe2@myn.test')
const studentUser = await mkUserRaw('alumno@myn.test')
await db.query(
  `insert into public.user_gym_roles (user_id, gym_id, role) values ($1, $4, 'trainer'), ($2, $4, 'trainer'), ($3, $4, 'student')`,
  [trainerUser, trainerUser2, studentUser, GYM],
)
let trainerId, trainer2Id, studentA, studentB

await test('admin crea entrenadores', async () => {
  await as(admin2)
  trainerId = (
    await db.query(`insert into public.trainers (gym_id, user_id, first_name, last_name) values ($1, $2, 'Pedro', 'Benítez') returning id`, [GYM, trainerUser])
  ).rows[0].id
  trainer2Id = (
    await db.query(`insert into public.trainers (gym_id, user_id, first_name, last_name) values ($1, $2, 'Laura', 'Sosa') returning id`, [GYM, trainerUser2])
  ).rows[0].id
})

await test('admin crea alumnos; el documento se normaliza', async () => {
  await as(admin2)
  const a = await db.query(
    `insert into public.students (gym_id, first_name, last_name, document_number, email, user_id)
     values ($1, ' María ', 'López', '4.512.333', 'MARIA@Mail.com', $2) returning id, document_number, email, first_name`,
    [GYM, studentUser],
  )
  studentA = a.rows[0].id
  assert(a.rows[0].document_number === '4512333', `doc: ${a.rows[0].document_number}`)
  assert(a.rows[0].email === 'maria@mail.com' && a.rows[0].first_name === 'María', 'no normalizó')
  studentB = (
    await db.query(`insert into public.students (gym_id, first_name, last_name, document_number) values ($1, 'Juan', 'Pérez', '3200111') returning id`, [GYM])
  ).rows[0].id
})

await test('documento duplicado (con otro formato) rechazado', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.students (gym_id, first_name, last_name, document_number) values ($1, 'Otra', 'Persona', '4512 333')`, [GYM]),
    '23505',
  )
})

await test('tesorero ve alumnos pero no los crea ni modifica', async () => {
  await as(treasurer)
  assert((await db.query(`select id from public.students`)).rows.length === 2, 'no ve alumnos')
  await expectError(
    db.query(`insert into public.students (gym_id, first_name, last_name, document_number) values ($1, 'X', 'Y', '999999')`, [GYM]),
  )
  const u = await db.query(`update public.students set phone = '1' where id = $1`, [studentB])
  assert(u.affectedRows === 0, 'modificó')
})

await test('entrenador sin asignaciones no ve alumnos', async () => {
  await as(trainerUser)
  assert((await db.query(`select id from public.students`)).rows.length === 0, 've alumnos sin asignación')
})

await test('admin asigna alumno; el entrenador ve sólo ese alumno', async () => {
  await as(admin2)
  await db.query(`insert into public.trainer_student_assignments (gym_id, trainer_id, student_id) values ($1, $2, $3)`, [GYM, trainerId, studentA])
  await as(trainerUser)
  const r = await db.query(`select id from public.students`)
  assert(r.rows.length === 1 && r.rows[0].id === studentA, `vio ${r.rows.length}`)
  await as(trainerUser2)
  assert((await db.query(`select id from public.students`)).rows.length === 0, 'otro entrenador ve el alumno')
})

await test('asignación activa duplicada rechazada', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.trainer_student_assignments (gym_id, trainer_id, student_id) values ($1, $2, $3)`, [GYM, trainerId, studentA]),
    '23505',
  )
})

await test('entrenador no puede autoasignarse alumnos', async () => {
  await as(trainerUser)
  await expectError(
    db.query(`insert into public.trainer_student_assignments (gym_id, trainer_id, student_id) values ($1, $2, $3)`, [GYM, trainerId, studentB]),
  )
})

await test('al cerrar la asignación el entrenador deja de ver al alumno', async () => {
  await as(admin2)
  await db.query(`update public.trainer_student_assignments set ends_on = app.today() where student_id = $1`, [studentA])
  await as(trainerUser)
  assert((await db.query(`select id from public.students`)).rows.length === 0, 'sigue viendo')
  await as(admin2)
  await db.query(`insert into public.trainer_student_assignments (gym_id, trainer_id, student_id) values ($1, $2, $3)`, [GYM, trainerId, studentA])
})

await test('entrenador desactivado deja de ver a sus alumnos', async () => {
  await as(admin2)
  await db.query(`update public.trainers set is_active = false where id = $1`, [trainerId])
  await as(trainerUser)
  assert((await db.query(`select id from public.students`)).rows.length === 0, 'sigue viendo')
  await as(admin2)
  await db.query(`update public.trainers set is_active = true where id = $1`, [trainerId])
})

await test('alumno ve sólo su propia ficha', async () => {
  await as(studentUser)
  const r = await db.query(`select id from public.students`)
  assert(r.rows.length === 1 && r.rows[0].id === studentA, `vio ${r.rows.length}`)
  const u = await db.query(`update public.students set notes = 'x' where id = $1`, [studentA])
  assert(u.affectedRows === 0, 'el alumno editó su ficha')
})

await test('baja lógica registra fecha y auditoría', async () => {
  await as(admin2)
  await db.query(`update public.students set status = 'inactive', status_reason = 'Mudanza' where id = $1`, [studentB])
  await db.exec('reset role')
  const r = await db.query(`select status_changed_at from public.students where id = $1`, [studentB])
  assert(r.rows[0].status_changed_at, 'sin fecha de cambio')
  const a = await db.query(`select count(*)::int as n from public.audit_logs where entity = 'students' and entity_id = $1`, [studentB])
  assert(a.rows[0].n === 2, `auditoría: ${a.rows[0].n}`)
})

await test('fotos: admin sube; entrenador asignado lee; otro entrenador no', async () => {
  const path = `${GYM}/${studentA}/foto.jpg`
  await as(admin2)
  await db.query(`insert into storage.objects (bucket_id, name) values ('student-photos', $1)`, [path])
  await as(trainerUser)
  assert((await db.query(`select id from storage.objects`)).rows.length === 1, 'entrenador asignado no ve la foto')
  await expectError(db.query(`insert into storage.objects (bucket_id, name) values ('student-photos', $1)`, [`${GYM}/${studentA}/otra.jpg`]))
  await as(trainerUser2)
  assert((await db.query(`select id from storage.objects`)).rows.length === 0, 'otro entrenador ve la foto')
  await as(null)
  await expectError(db.query(`select id from storage.objects`))
})

await test('foto en carpeta de otro gimnasio rechazada', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into storage.objects (bucket_id, name) values ('student-photos', $1)`, [`00000000-0000-0000-0000-00000000dead/${studentA}/x.jpg`]),
  )
})

async function mkUserRaw(email) {
  await db.exec('reset role')
  return (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id
}

// ---------------------------------------------------------------------
// Incremento 4: membresías y cuotas
// ---------------------------------------------------------------------
console.log('\nIncremento 4')
let monthlyPlan, packPlan, subId
const today = (await db.query(`select app.today()::text as d`)).rows[0].d

await test('período mensual termina el día anterior al mismo día del mes siguiente', async () => {
  const r = await db.query(`select app.period_end('2026-01-31', 1, null)::text as a, app.period_end('2026-03-10', 1, null)::text as b, app.period_end('2026-03-10', null, 30)::text as c`)
  assert(r.rows[0].a === '2026-02-27' && r.rows[0].b === '2026-04-09' && r.rows[0].c === '2026-04-08', JSON.stringify(r.rows[0]))
})

await test('admin da de alta una membresía: período, cuota y créditos en una operación', async () => {
  await as(admin2)
  monthlyPlan = publicPlanId
  packPlan = hiddenPlanId
  subId = (await db.query(`select public.enroll_membership($1, $2, $3::date, 50000, 'Promo apertura', true, '11111111-1111-1111-1111-111111111111') as id`, [studentA, monthlyPlan, today])).rows[0].id
  await db.exec('reset role')
  const c = await db.query(`select amount, discount, total, status from public.charges where student_id = $1`, [studentA])
  assert(c.rows.length === 1 && Number(c.rows[0].total) === 200000 && c.rows[0].status === 'pending', JSON.stringify(c.rows))
  const p = await db.query(`select count(*)::int as n from public.subscription_periods where subscription_id = $1`, [subId])
  assert(p.rows[0].n === 1, 'períodos')
})

await test('doble envío con la misma clave no duplica la membresía', async () => {
  await as(admin2)
  const again = (await db.query(`select public.enroll_membership($1, $2, $3::date, 50000, 'Promo apertura', true, '11111111-1111-1111-1111-111111111111') as id`, [studentA, monthlyPlan, today])).rows[0].id
  assert(again === subId, 'devolvió otra membresía')
  await db.exec('reset role')
  assert((await db.query(`select count(*)::int as n from public.charges`)).rows[0].n === 1, 'duplicó cuota')
})

await test('mismo plan vigente en fechas superpuestas rechazado', async () => {
  await as(admin2)
  await expectError(db.query(`select public.enroll_membership($1, $2, $3::date)`, [studentA, monthlyPlan, today]), 'P0001')
})

await test('descuento sin motivo o mayor al precio rechazado', async () => {
  await as(admin2)
  await expectError(db.query(`select public.enroll_membership($1, $2, $3::date, 1000, null)`, [studentA, packPlan, today]), 'P0001')
  await expectError(db.query(`select public.enroll_membership($1, $2, $3::date, 99999999, 'x x x')`, [studentA, packPlan, today]), 'P0001')
})

await test('plan con sesiones genera créditos', async () => {
  await as(admin2)
  await db.query(`update public.membership_plans set is_active = true where id = $1`, [packPlan])
  await db.query(`select public.enroll_membership($1, $2, $3::date)`, [studentA, packPlan, today])
  await db.exec('reset role')
  const e = await db.query(`select granted, used from public.session_entitlements`)
  assert(e.rows.length === 1 && e.rows[0].granted === 8 && e.rows[0].used === 0, JSON.stringify(e.rows))
})

await test('alumno dado de baja no puede recibir membresía', async () => {
  await as(admin2)
  await expectError(db.query(`select public.enroll_membership($1, $2, $3::date)`, [studentB, monthlyPlan, today]), 'P0001')
})

await test('tesorero no puede dar de alta ni escribir cuotas directamente', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.enroll_membership($1, $2, $3::date)`, [studentA, monthlyPlan, today]), '42501')
  await expectError(db.query(`update public.charges set paid_amount = 200000`), '42501')
  await expectError(db.query(`insert into public.charges (gym_id, student_id, source, concept, amount, due_on) values ($1, $2, 'other', 'x', 1, $3::date)`, [GYM, studentA, today]), '42501')
  assert((await db.query(`select id from public.charges`)).rows.length === 2, 'tesorero no ve cuotas')
})

await test('renovación manual genera el período siguiente; repetir no duplica', async () => {
  await as(admin2)
  await db.query(`select public.renew_subscription($1)`, [subId])
  await db.exec('reset role')
  const p = await db.query(`select sequence, period_start::text, period_end::text from public.subscription_periods where subscription_id = $1 order by sequence`, [subId])
  assert(p.rows.length === 2, `períodos: ${p.rows.length}`)
  const exp = (await db.query(`select ($1::date + 1)::text as d`, [p.rows[0].period_end])).rows[0].d
  assert(p.rows[1].period_start === exp, 'el segundo período no empieza al día siguiente')
  const c = await db.query(`select count(*)::int as n from public.charges where subscription_period_id is not null and status <> 'voided' and student_id = $1`, [studentA])
  assert(c.rows[0].n === 3, `cuotas: ${c.rows[0].n}`)
})

await test('proceso diario dos veces seguidas no duplica cuotas', async () => {
  // Membresía que vence pronto con renovación automática.
  await as(admin2)
  const plan15 = (
    await db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_days) values ($1, 'Quincenal', 'custom', 100000, 15) returning id`, [GYM])
  ).rows[0].id
  const sid = (await db.query(`select public.enroll_membership($1, $2, ($3::date - 25), 0, null, true) as id`, [studentA, plan15, today])).rows[0].id
  await db.exec('reset role')
  const r1 = (await db.query(`select app.run_daily_membership_jobs() as r`)).rows[0].r
  const n1 = (await db.query(`select count(*)::int as n from public.subscription_periods where subscription_id = $1`, [sid])).rows[0].n
  const r2 = (await db.query(`select app.run_daily_membership_jobs() as r`)).rows[0].r
  const n2 = (await db.query(`select count(*)::int as n from public.subscription_periods where subscription_id = $1`, [sid])).rows[0].n
  const ends = (await db.query(`select (ends_on - app.today()) as d from public.subscriptions where id = $1`, [sid])).rows[0].d
  // Desde hace 25 días, con períodos de 15: hacen falta 3 períodos para cubrir hoy + 7.
  assert(n1 === 3 && n2 === 3, `períodos ${n1} → ${n2}`)
  assert(ends > 7, `cobertura insuficiente: vence en ${ends} días`)
  assert(r1.renewed === 2 && r2.renewed === 0, JSON.stringify({ r1, r2 }))
})

await test('pase diario y semanal: vigencia fija y sin renovación automática', async () => {
  await as(admin2)
  await expectError(
    db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_days) values ($1, 'Diario mal', 'daily', 20000, 2)`, [GYM]),
    '23514',
  )
  const day = (
    await db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_days) values ($1, 'Pase diario', 'daily', 20000, 1) returning id`, [GYM])
  ).rows[0].id
  const week = (
    await db.query(`insert into public.membership_plans (gym_id, name, plan_type, price, duration_days) values ($1, 'Pase semanal', 'weekly', 80000, 7) returning id`, [GYM])
  ).rows[0].id
  const d = (await db.query(`select public.enroll_membership($1, $2, $3::date, 0, null, true) as id`, [studentA, day, today])).rows[0].id
  const w = (await db.query(`select public.enroll_membership($1, $2, $3::date, 0, null, true) as id`, [studentA, week, today])).rows[0].id
  await db.exec('reset role')
  const r = await db.query(
    `select id, auto_renew, (ends_on - starts_on) as span from public.subscriptions where id in ($1, $2) order by span`,
    [d, w],
  )
  assert(r.rows.every((x) => x.auto_renew === false), 'quedó con renovación automática')
  assert(r.rows[0].span === 0 && r.rows[1].span === 6, JSON.stringify(r.rows))
})

await test('cuotas vencidas pasan a morosas', async () => {
  await db.exec('reset role')
  const r = await db.query(`select count(*)::int as n from public.charges where status = 'overdue'`)
  assert(r.rows[0].n >= 1, 'no marcó vencidas')
  await as(treasurer)
  const v = await db.query(`select overdue_amount from public.v_student_membership_status where student_id = $1`, [studentA])
  assert(Number(v.rows[0].overdue_amount) > 0, 'vista sin deuda vencida')
})

await test('pausa corre el vencimiento', async () => {
  await as(admin2)
  await db.exec('reset role')
  const before = (await db.query(`select ends_on::text from public.subscriptions where id = $1`, [subId])).rows[0].ends_on
  await as(admin2)
  await db.query(`select public.pause_subscription($1, $2::date, ($2::date + 9), 'Viaje')`, [subId, today])
  await db.exec('reset role')
  const after = (await db.query(`select (ends_on - $2::date) as diff from public.subscriptions where id = $1`, [subId, before])).rows[0].diff
  assert(after === 10, `diferencia ${after}`)
  await as(admin2)
  await expectError(db.query(`select public.pause_subscription($1, $2::date, ($2::date + 2), 'Otra')`, [subId, today]), 'P0001')
})

await test('cancelación anula cuotas futuras impagas y conserva historial', async () => {
  await as(admin2)
  await db.query(`select public.cancel_subscription($1, 'Se muda de ciudad', true)`, [subId])
  await db.exec('reset role')
  const s = (await db.query(`select status, auto_renew from public.subscriptions where id = $1`, [subId])).rows[0]
  assert(s.status === 'cancelled' && !s.auto_renew, 'no canceló')
  const voided = (await db.query(`select count(*)::int as n from public.charges c join public.subscription_periods p on p.id = c.subscription_period_id where p.subscription_id = $1 and c.status = 'voided'`, [subId])).rows[0].n
  const kept = (await db.query(`select count(*)::int as n from public.charges c join public.subscription_periods p on p.id = c.subscription_period_id where p.subscription_id = $1 and c.status <> 'voided'`, [subId])).rows[0].n
  assert(voided === 1 && kept === 1, `anuladas ${voided}, vigentes ${kept}`)
  await as(admin2)
  await expectError(db.query(`select public.renew_subscription($1)`, [subId]), 'P0001')
})

await test('anular cuota exige motivo; entrenador no ve cuotas; alumno ve las suyas', async () => {
  await as(admin2)
  const cid = (await db.query(`select id from public.charges where status <> 'voided' limit 1`)).rows[0].id
  await expectError(db.query(`select public.void_charge($1, '')`, [cid]), 'P0001')
  await as(trainerUser)
  assert((await db.query(`select id from public.charges`)).rows.length === 0, 'entrenador ve cuotas')
  assert((await db.query(`select id from public.subscriptions`)).rows.length > 0, 'entrenador no ve membresías de su alumno')
  await as(studentUser)
  const mine = await db.query(`select distinct student_id from public.charges`)
  assert(mine.rows.length === 1 && mine.rows[0].student_id === studentA, 'alumno ve cuotas ajenas o ninguna')
})

// ---------------------------------------------------------------------
// Incremento 5: caja y cobros
// ---------------------------------------------------------------------
console.log('\nIncremento 5')
const cashId = (await db.query(`select id from public.payment_methods where code = 'cash'`)).rows[0].id
const transferId = (await db.query(`select id from public.payment_methods where code = 'transfer'`)).rows[0].id
const openBalance = async (sid) =>
  Number((await db.query(`select coalesce(sum(total - paid_amount), 0) as b from public.charges where student_id = $1 and status in ('pending','partial','overdue')`, [sid])).rows[0].b)
let sessionId, payId
const key = (n) => `22222222-2222-4222-8222-${String(n).padStart(12, '0')}`

await test('cobro en efectivo sin caja abierta rechazado', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.register_payment($1, $2, 1000, null, null, null, $3)`, [studentA, cashId, key(1)]), 'P0001')
})

await test('tesorero abre caja; no puede haber dos abiertas', async () => {
  await as(treasurer)
  sessionId = (await db.query(`select public.open_cash_session($1, 100000) as id`, [GYM])).rows[0].id
  await expectError(db.query(`select public.open_cash_session($1, 0)`, [GYM]), 'P0001')
})

await test('cobro parcial en efectivo: asigna a la cuota más antigua, recibo y movimiento de caja', async () => {
  await as(treasurer)
  const before = await openBalance(studentA)
  payId = (await db.query(`select public.register_payment($1, $2, 150000, null, null, null, $3) as id`, [studentA, cashId, key(2)])).rows[0].id
  await db.exec('reset role')
  const p = (await db.query(`select receipt_number, cash_session_id from public.payments where id = $1`, [payId])).rows[0]
  assert(/^RI-\d{6}$/.test(p.receipt_number) && p.cash_session_id === sessionId, JSON.stringify(p))
  assert((await openBalance(studentA)) === before - 150000, 'saldo no bajó')
  const m = (await db.query(`select direction, amount from public.cash_movements where source_id = $1`, [payId])).rows
  assert(m.length === 1 && m[0].direction === 'in' && Number(m[0].amount) === 150000, 'movimiento de caja')
  const oldest = (await db.query(`select c.due_on from public.payment_allocations a join public.charges c on c.id = a.charge_id where a.payment_id = $1 order by c.due_on limit 1`, [payId])).rows[0].due_on
  const minDue = (await db.query(`select min(c.due_on) as d from public.charges c where c.student_id = $1 and c.status <> 'voided'`, [studentA])).rows[0].d
  assert(+oldest === +minDue, 'no asignó a la más antigua')
})

await test('doble envío con la misma clave = un solo pago', async () => {
  await as(treasurer)
  const again = (await db.query(`select public.register_payment($1, $2, 150000, null, null, null, $3) as id`, [studentA, cashId, key(2)])).rows[0].id
  assert(again === payId, 'devolvió otro pago')
  await db.exec('reset role')
  assert((await db.query(`select count(*)::int as n from public.payments`)).rows[0].n === 1, 'duplicó')
  assert((await db.query(`select count(*)::int as n from public.cash_movements`)).rows[0].n === 1, 'duplicó movimiento')
})

await test('no se puede cobrar más que el saldo pendiente', async () => {
  await as(treasurer)
  const b = await openBalance(studentA)
  await expectError(db.query(`select public.register_payment($1, $2, $3, null, null, null, $4)`, [studentA, transferId, b + 1, key(3)]), 'P0001')
})

await test('asignación manual: no puede superar el saldo de la cuota ni descuadrar', async () => {
  await as(treasurer)
  const c = (await db.query(`select id, total - paid_amount as bal from public.charges where student_id = $1 and status in ('pending','partial','overdue') order by due_on desc limit 1`, [studentA])).rows[0]
  await expectError(db.query(`select public.register_payment($1, $2, $3, $4::jsonb, null, null, $5)`, [studentA, transferId, Number(c.bal) + 1, JSON.stringify([{ charge_id: c.id, amount: Number(c.bal) + 1 }]), key(4)]), 'P0001')
  await expectError(db.query(`select public.register_payment($1, $2, 1000, $3::jsonb, null, null, $4)`, [studentA, transferId, JSON.stringify([{ charge_id: c.id, amount: 500 }]), key(5)]), 'P0001')
  const id = (await db.query(`select public.register_payment($1, $2, $3, $4::jsonb, 'TRF 123', null, $5) as id`, [studentA, transferId, Number(c.bal), JSON.stringify([{ charge_id: c.id, amount: Number(c.bal) }]), key(6)])).rows[0].id
  await db.exec('reset role')
  assert((await db.query(`select status from public.charges where id = $1`, [c.id])).rows[0].status === 'paid', 'no quedó pagada')
  assert((await db.query(`select count(*)::int as n from public.cash_movements where source_id = $1`, [id])).rows[0].n === 0, 'transferencia movió la caja')
})

await test('cuota con pagos no se puede anular', async () => {
  await as(admin2)
  const c = (await db.query(`select charge_id from public.payment_allocations where payment_id = $1 limit 1`, [payId])).rows[0].charge_id
  await expectError(db.query(`select public.void_charge($1, 'Prueba de anulación')`, [c]), 'P0001')
})

await test('tesorero no puede anular pagos; admin sí y se revierte saldo y caja', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.void_payment($1, 'Error de carga')`, [payId]), '42501')
  const before = await openBalance(studentA)
  await as(admin2)
  await db.query(`select public.void_payment($1, 'Error de carga')`, [payId])
  await expectError(db.query(`select public.void_payment($1, 'Otra vez')`, [payId]), 'P0001')
  assert((await openBalance(studentA)) === before + 150000, 'no devolvió el saldo')
  await db.exec('reset role')
  const out = (await db.query(`select count(*)::int as n from public.cash_movements where source = 'payment_void' and direction = 'out'`)).rows[0].n
  assert(out === 1, 'sin contramovimiento')
})

await test('nadie escribe pagos, caja ni recibos directamente', async () => {
  await as(admin2)
  await expectError(db.query(`update public.payments set amount = 1`), '42501')
  await expectError(db.query(`insert into public.cash_movements (gym_id, cash_session_id, direction, amount, source) values ($1, $2, 'in', 1, 'adjustment')`, [GYM, sessionId]), '42501')
  await expectError(db.query(`update public.receipt_sequences set last_number = 0`), '42501')
})

await test('salida manual mayor al efectivo disponible rechazada; con concepto se registra', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.register_cash_adjustment($1, 'out', 999999999, 'Depósito banco')`, [sessionId]), 'P0001')
  await db.query(`select public.register_cash_adjustment($1, 'out', 50000, 'Depósito en banco')`, [sessionId])
})

await test('cierre: calcula esperado y exige motivo si hay diferencia', async () => {
  await as(treasurer)
  // apertura 100.000 + cobro 150.000 − anulación 150.000 − depósito 50.000 = 50.000
  await expectError(db.query(`select public.close_cash_session($1, 40000, null)`, [sessionId]), 'P0001')
  const r = (await db.query(`select public.close_cash_session($1, 40000, 'Faltante a revisar') as r`, [sessionId])).rows[0].r
  assert(r.expected === 50000 && r.difference === -10000, JSON.stringify(r))
  await expectError(db.query(`select public.register_cash_adjustment($1, 'in', 1000, 'Tarde')`, [sessionId]), 'P0001')
})

await test('recibos correlativos sin duplicados', async () => {
  await db.exec('reset role')
  const r = (await db.query(`select receipt_number from public.payments order by receipt_number`)).rows.map((x) => x.receipt_number)
  assert(r.length === 2 && r[0] === 'RI-000001' && r[1] === 'RI-000002', JSON.stringify(r))
})

await test('alumno ve sus pagos; entrenador no ve pagos ni caja', async () => {
  await as(studentUser)
  assert((await db.query(`select id from public.payments`)).rows.length === 2, 'alumno no ve sus pagos')
  assert((await db.query(`select id from public.cash_sessions`)).rows.length === 0, 'alumno ve caja')
  await as(trainerUser)
  assert((await db.query(`select id from public.payments`)).rows.length === 0, 'entrenador ve pagos')
})

// ---------------------------------------------------------------------
// Incremento 6: egresos · Dashboard
// ---------------------------------------------------------------------
console.log('\nIncremento 6 y dashboard')
const catId = (await db.query(`select id from public.expense_categories where name = 'Alquiler'`)).rows[0].id
const ekey = (n) => `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`
let session2, expId

await test('categorías de egreso creadas para el gimnasio', async () => {
  assert((await db.query(`select count(*)::int as n from public.expense_categories`)).rows[0].n === 9, 'faltan categorías')
})

await test('egreso por transferencia no toca la caja; idempotente', async () => {
  await as(treasurer)
  const id1 = (await db.query(`select public.register_expense($1, $2, 'Alquiler de octubre', 3000000, $3, app.today(), 'Inmobiliaria X', 'FAC 001-001-123', $4) as id`, [GYM, catId, transferId, ekey(1)])).rows[0].id
  const id2 = (await db.query(`select public.register_expense($1, $2, 'Alquiler de octubre', 3000000, $3, app.today(), null, null, $4) as id`, [GYM, catId, transferId, ekey(1)])).rows[0].id
  assert(id1 === id2, 'duplicó')
  await db.exec('reset role')
  assert((await db.query(`select count(*)::int as n from public.cash_movements where source = 'expense'`)).rows[0].n === 0, 'movió la caja')
})

await test('egreso en efectivo exige caja abierta y efectivo suficiente', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.register_expense($1, $2, 'Limpieza', 50000, $3, app.today(), null, null, $4)`, [GYM, catId, cashId, ekey(2)]), 'P0001')
  session2 = (await db.query(`select public.open_cash_session($1, 100000) as id`, [GYM])).rows[0].id
  await expectError(db.query(`select public.register_expense($1, $2, 'Muy caro', 500000, $3, app.today(), null, null, $4)`, [GYM, catId, cashId, ekey(3)]), 'P0001')
  expId = (await db.query(`select public.register_expense($1, $2, 'Artículos de limpieza', 60000, $3, app.today(), null, null, $4) as id`, [GYM, catId, cashId, ekey(4)])).rows[0].id
  await db.exec('reset role')
  assert(Number((await db.query(`select app.cash_expected($1) as e`, [session2])).rows[0].e) === 40000, 'saldo de caja')
})

await test('egreso con fecha futura o sin descripción rechazado', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.register_expense($1, $2, 'Futuro', 1000, $3, app.today() + 1, null, null, $4)`, [GYM, catId, transferId, ekey(5)]), 'P0001')
  await expectError(db.query(`select public.register_expense($1, $2, '', 1000, $3, app.today(), null, null, $4)`, [GYM, catId, transferId, ekey(6)]), 'P0001')
})

await test('anular egreso: sólo admin; el efectivo vuelve a la caja', async () => {
  await as(treasurer)
  await expectError(db.query(`select public.void_expense($1, 'Error')`, [expId]), '42501')
  await as(admin2)
  await db.query(`select public.void_expense($1, 'Cargado dos veces')`, [expId])
  await db.exec('reset role')
  assert(Number((await db.query(`select app.cash_expected($1) as e`, [session2])).rows[0].e) === 100000, 'no volvió el efectivo')
})

await test('nadie escribe egresos directamente; entrenador no los ve', async () => {
  await as(admin2)
  await expectError(db.query(`update public.expenses set amount = 1`), '42501')
  await as(trainerUser)
  assert((await db.query(`select id from public.expenses`)).rows.length === 0, 'entrenador ve egresos')
})

await test('dashboard: admin obtiene indicadores coherentes; tesorero y entrenador no', async () => {
  await as(admin2)
  const r = (await db.query(`select public.dashboard_summary($1, app.today() - 29, app.today()) as r`, [GYM])).rows[0].r
  await db.exec('reset role')
  const realPaid = Number((await db.query(`select coalesce(sum(amount),0) as s from public.payments where status = 'posted' and (paid_at at time zone 'America/Asuncion')::date between app.today() - 29 and app.today()`)).rows[0].s)
  assert(Number(r.collections.period) === realPaid, `cobros ${r.collections.period} vs ${realPaid}`)
  assert(Number(r.expenses.period) === 3000000, `egresos ${r.expenses.period}`)
  assert(r.daily.length === 30, 'serie diaria')
  assert(r.students.total === 2 && r.students.active === 1, JSON.stringify(r.students))
  const overdue = Number((await db.query(`select coalesce(sum(total - paid_amount),0) as s from public.charges where status = 'overdue'`)).rows[0].s)
  assert(Number(r.receivables.overdue) === overdue, 'vencido')
  await as(treasurer)
  await expectError(db.query(`select public.dashboard_summary($1, app.today() - 6, app.today())`, [GYM]), '42501')
  await as(admin2)
  await expectError(db.query(`select public.dashboard_summary($1, app.today(), app.today() - 1)`, [GYM]), 'P0001')
})

console.log('\nPortal del alumno')

await test('alumno ve a su entrenador asignado y no a otros', async () => {
  await as(studentUser)
  const t = (await db.query(`select id from public.trainers`)).rows
  assert(t.length === 1 && t[0].id === trainerId, `vio ${t.length}`)
  assert((await db.query(`select id from public.trainer_student_assignments`)).rows.length >= 1, 'no ve su asignación')
})

await test('alumno ve su estado de membresía y sus recibos, no los de otros', async () => {
  await as(studentUser)
  const v = (await db.query(`select student_id from public.v_student_membership_status`)).rows
  assert(v.length === 1 && v[0].student_id === studentA, 'vista ajena')
  const alloc = (await db.query(`select count(*)::int as n from public.payment_allocations`)).rows[0].n
  assert(alloc > 0, 'no ve el detalle de sus recibos')
  assert((await db.query(`select id from public.gyms`)).rows.length === 1, 'no ve datos del gimnasio para el recibo')
})

await test('vincular cuenta del alumno: sólo admin', async () => {
  const nu = await mkUserRaw('nuevo.alumno@myn.test')
  await as(treasurer)
  await expectError(db.query(`select public.link_student_user($1, $2)`, [studentB, nu]), '42501')
  await as(admin2)
  await db.query(`select public.link_student_user($1, $2)`, [studentB, nu])
  await expectError(db.query(`select public.link_student_user($1, $2)`, [studentB, studentUser]), 'P0001')
  await db.exec('reset role')
  const r = (await db.query(`select role from public.user_gym_roles where user_id = $1`, [nu])).rows
  assert(r.length === 1 && r[0].role === 'student', 'no asignó el perfil Alumno')
})

console.log('\nPrivilegios')

await test('nadie borra físicamente alumnos, planes ni asignaciones', async () => {
  await as(admin2)
  await expectError(db.query(`delete from public.students`), '42501')
  await expectError(db.query(`delete from public.membership_plans`), '42501')
  await expectError(db.query(`delete from public.trainer_student_assignments`), '42501')
})

console.log(`\n${passed} ok, ${failed} fallidas`)
process.exit(failed ? 1 : 0)
