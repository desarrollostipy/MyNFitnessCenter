# Despliegue — GitHub, Supabase y Netlify

## 1. GitHub
```bash
gh repo create myn-fitness --private --source . --push
```
(o crear el repositorio privado `myn-fitness` en github.com y `git remote add origin … && git push -u origin main`).

## 2. Supabase
1. Crear proyecto en supabase.com (región recomendada: `sa-east-1` São Paulo, la más cercana a Paraguay).
2. Vincular y aplicar migraciones:
   ```bash
   npx supabase login
   npx supabase link --project-ref <REF>
   npx supabase db push
   ```
3. SQL Editor → ejecutar `supabase/seed.sql`.
4. **Authentication → Sign In / Providers**: desactivar "Allow new users to sign up"; contraseña mínima 8 con letras y dígitos.
5. **Authentication → URL Configuration**: Site URL = URL de Netlify; Redirect URLs = `https://<sitio>/restablecer` y `http://localhost:5173/restablecer`.
6. Crear el primer usuario (Authentication → Users → Add user) y ejecutar `supabase/bootstrap_first_admin.sql` con su email.
7. Edge Function de invitaciones:
   ```bash
   npx supabase secrets set SITE_URL=https://<sitio>
   npx supabase functions deploy admin-invite-user
   ```
   (`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` ya existen en el entorno de funciones.)
8. Configurar SMTP propio (Authentication → Emails) antes de producción: el SMTP por defecto de Supabase tiene límites muy bajos.

## 3. Netlify
1. Add new site → Import from GitHub → `myn-fitness`. Build y publish salen de `netlify.toml`.
2. Variables de entorno (Site configuration → Environment variables):
   - `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Project Settings → API), `VITE_GYM_ID=00000000-0000-0000-0000-000000000001`.
   - **Nunca** cargar la service role key en Netlify.
3. Deploy. Verificar: abrir `/admin/usuarios`, recargar → debe cargar (redirección SPA).
4. Dominio propio: Domain management → Add domain (cuando se proporcione).

## 4. Respaldo y recuperación
- Plan Pro de Supabase: backups diarios automáticos; recomendado activar PITR cuando haya operación financiera real.
- Respaldo manual adicional:
  ```bash
  npx supabase db dump --linked -f backups/esquema.sql
  npx supabase db dump --linked --data-only -f backups/datos.sql
  ```
- Restauración: proyecto nuevo → `supabase db push` → `psql < backups/datos.sql`.
