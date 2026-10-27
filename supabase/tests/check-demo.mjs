// Verifica que los scripts de demostración cargan y se eliminan sin dejar rastros.
// Uso: node supabase/tests/check-demo.mjs
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const db = new PGlite({ extensions: { pgcrypto, btree_gist } })

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique,
    raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz, created_at timestamptz default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
`)
for (const f of readdirSync(join(root, 'migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(join(root, 'migrations', f), 'utf8'))
}
await db.exec(readFileSync(join(root, 'seed.sql'), 'utf8'))

const run = async (file) => {
  const res = await db.exec(readFileSync(join(root, 'demo', file), 'utf8'))
  return res.at(-1).rows[0]
}

console.log('carga 1:', await run('seed_demo.sql'))
console.log('carga 2 (debe ser igual, sin duplicar):', await run('seed_demo.sql'))
const st = await db.query(`
  select s.first_name, v.active_subscriptions, v.overdue_amount, v.open_amount
  from public.v_student_membership_status v join public.students s on s.id = v.student_id
  where v.overdue_amount > 0 order by s.first_name`)
console.log('morosos:', st.rows)
console.log('borrado:', await run('remove_demo.sql'))
const left = await db.query(`
  select (select count(*) from public.charges)::int as cuotas, (select count(*) from public.subscriptions)::int as subs,
         (select count(*) from public.payments)::int as pagos, (select coalesce(max(last_number), 0) from public.receipt_sequences)::int as ult_recibo,
         (select count(*) from public.audit_logs)::int as audit, (select count(*) from public.payment_methods)::int as medios`)
console.log('restante (cuotas/subs/audit deben ser 0; medios 3):', left.rows[0])
