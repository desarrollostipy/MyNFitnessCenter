# Registro de avance — Etapa 1

| # | Incremento | Estado | Fecha |
|---|---|---|---|
| 1 | Base: organización, auth, roles, auditoría, layout, usuarios | **Construido y probado localmente** — pendiente de verificar contra un proyecto Supabase real y Netlify | 27/10/2026 |
| 2 | Configuración (planes, servicios, medios de pago) + página pública + leads | Pendiente | — |
| 3–13 | Ver plan en `01-arquitectura-etapa1.md` §7 | Pendiente | — |

---

## Incremento 1 — Base

### Entregado
**Base de datos** — `supabase/migrations/20261027000001_foundation.sql`
- Tablas: `gyms`, `user_profiles`, `user_gym_roles`, `audit_logs`.
- Enum `app_role` con los seis perfiles.
- `app.today()` (fecha de negocio en America/Asuncion), `app.has_role`, `app.has_any_role`, `app.is_staff`, `app.audit`.
- Trigger: perfil automático al crear usuario; auditoría de cambios en `gyms`.
- RPC: `admin_list_users`, `admin_set_user_role` (sólo admin, auditada, idempotente, impide quitar el último admin con bloqueo).
- RLS en las 4 tablas. Los roles no se pueden escribir directamente: sólo por RPC.
- `seed.sql` (gimnasio MyN Fitness), `bootstrap_first_admin.sql`.

**Edge Function** — `supabase/functions/admin-invite-user`: invita por email y asigna rol; verifica admin con el JWT del solicitante; la service role key no sale del servidor.

**Frontend**
- Login, recuperación y restablecimiento de contraseña (también destino de invitaciones).
- Layout responsive (menú lateral en escritorio, cajón en móvil); el menú muestra sólo módulos implementados y permitidos.
- Guards de ruta por sesión y rol (navegación; la seguridad real está en RLS).
- Pantallas: Usuarios (búsqueda, matriz de perfiles, confirmación de cambios críticos, invitación), Auditoría (paginada), Configuración de empresa, Mi perfil (datos + cambio de contraseña).
- Utilidades: `formatPYG` → `G. 1.250.000`, fechas `DD/MM/AAAA` en hora de Asunción, mensajes de error en español.
- `netlify.toml` con redirección SPA y cabeceras de seguridad.

### Pruebas ejecutadas (27/10/2026)
- `npm run test:db` → 16/16: anónimo y usuario sin rol no ven datos; no pueden autoasignarse roles (ni por RPC ni por insert); no editan perfiles ajenos; admin lista y asigna roles con auditoría idempotente; tesorero no modifica configuración ni ve auditoría; auditoría inalterable; protección del último admin.
- `npm test` → 4/4 (formato monetario y zona horaria).
- `npm run lint` y `npm run build` sin errores.

### Criterios de aceptación
- [x] Un usuario sin rol no accede a datos (probado en RLS).
- [x] El admin asigna/quita perfiles y queda auditado (probado en RLS/RPC).
- [ ] Login real contra Supabase — requiere crear el proyecto (ver `03-despliegue.md`).
- [ ] Invitación por email — requiere desplegar la Edge Function.
- [ ] Recarga de ruta interna en Netlify — requiere desplegar.

### Problemas conocidos / decisiones
- Las pruebas de BD usan PGlite con un *stub* mínimo de `auth` (no hay Docker en el equipo). Con Docker se puede usar además `supabase start` + `supabase db reset`.
- El registro público de cuentas está deshabilitado (sólo por invitación). Los futuros alumnos usarán el formulario público sin cuenta (Incremento 2).
- Bundle JS de ~660 kB: se dividirá por rutas (lazy) en un incremento posterior.
- Los tipos TS de la base se generarán con `supabase gen types` cuando el proyecto esté enlazado.
