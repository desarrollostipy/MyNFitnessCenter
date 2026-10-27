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
  assert((await db.query(`select * from public.gyms`)).rows.length === 0, 've gyms')
  assert((await db.query(`select * from public.user_profiles`)).rows.length === 0, 've perfiles')
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
  const d = await db.query(`delete from public.audit_logs`)
  const u = await db.query(`update public.audit_logs set reason = 'x'`)
  assert(d.affectedRows === 0 && u.affectedRows === 0, 'auditoría alterada')
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
  assert((await db.query(`select * from public.payment_methods`)).rows.length === 0, 'anónimo ve medios')
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

async function mkUserRaw(email) {
  await db.exec('reset role')
  return (await db.query(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id
}

console.log(`\n${passed} ok, ${failed} fallidas`)
process.exit(failed ? 1 : 0)
