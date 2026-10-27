# Registro de avance — Etapa 1

| # | Incremento | Estado | Fecha |
|---|---|---|---|
| 1 | Base: organización, auth, roles, auditoría, layout, usuarios | **Construido y probado localmente** — pendiente de verificar contra un proyecto Supabase real y Netlify | 27/10/2026 |
| 2 | Configuración (planes, servicios, medios de pago) + página pública + leads | **Construido y probado localmente** — pendiente de verificar contra Supabase real | 28/10/2026 |
| 3 | Alumnos: alta, ficha, búsqueda, foto, baja lógica, asignación de entrenador | **Construido y probado localmente** — pendiente de verificar contra Supabase real | 29/10/2026 |
| 4–13 | Ver plan en `01-arquitectura-etapa1.md` §7 | Pendiente | — |

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

### Problemas conocidos / decisiones (Incremento 1)
- Las pruebas de BD usan PGlite con un *stub* mínimo de `auth` (no hay Docker en el equipo). Con Docker se puede usar además `supabase start` + `supabase db reset`.
- El registro público de cuentas está deshabilitado (sólo por invitación). Los futuros alumnos usarán el formulario público sin cuenta (Incremento 2).
- Bundle JS de ~660 kB: se dividirá por rutas (lazy) en un incremento posterior.
- Los tipos TS de la base se generarán con `supabase gen types` cuando el proyecto esté enlazado.

---

## Incremento 2 — Catálogo, sitio público y prospectos

### Entregado
**Base de datos** — `supabase/migrations/20261028000001_catalog_and_leads.sql`
- `services`: duración, precio, política de cancelación (horas), si la ausencia consume crédito, si genera comisión, visible en web. `capacity = 1` forzado (clases grupales → Etapa 3).
- `membership_plans`: tipos mensual/trimestral/anual/por sesiones/personalizado; restricciones en la base: una sola unidad de vigencia, meses fijos por tipo (1/3/12), planes por sesiones con ≥ 1 sesión, sesiones incluidas exigen servicio, precio ≥ 0, máximo 20 beneficios.
- `payment_methods`: `affects_cash` distingue efectivo físico; código inmutable (se usará en conciliación). Seed: Efectivo, Transferencia, Tarjeta.
- `leads` + RPC `submit_lead` (anónimo): normaliza teléfono/email, exige al menos un contacto, sólo acepta planes/servicios publicados, fecha preferida ≤ 90 días, antispam de 3 solicitudes por contacto cada 24 h. El anónimo no tiene ningún permiso sobre la tabla.
- Auditoría automática (`app.audit_row`) de altas y cambios en planes, servicios y medios de pago (incluye precio anterior y nuevo).
- Sin borrado físico: planes, servicios y medios se desactivan.

**Frontend**
- Admin → Catálogo: Planes, Servicios, Medios de pago (alta/edición con validación, importe con separador de miles, activar/desactivar con confirmación).
- Admin/Tesorero → Comercial: Prospectos (filtro por estado, búsqueda, paginación, ficha con WhatsApp/email, estado y notas internas; registra primer contacto).
- Sitio público con menú responsive: Inicio (planes destacados), Planes, Servicios, Clase de prueba, Inscripción, Contacto. Formulario con consentimiento de contacto y campo trampa antibots.

### Pruebas ejecutadas (28/10/2026)
- `npm run test:db` → 32/32 (16 nuevas): restricciones de planes y servicios, tesorero sin escritura en catálogo, anónimo ve sólo planes públicos y activos, staff ve los ocultos, medios de pago invisibles al anónimo y código inmutable, `submit_lead` (alta, validaciones, plan no publicado, antispam), anónimo sin lectura ni inserción directa en leads, tesorero gestiona leads y usuario sin rol no los ve, auditoría de servicios.
- `npm test`, `npm run lint`, `npm run build` sin errores.
- Revisión visual en navegador (sin backend): sitio público en escritorio y 375 px sin desbordamiento horizontal; validaciones del formulario de contacto.

### Criterios de aceptación
- [x] Un anónimo ve planes públicos y envía una consulta; no puede leer prospectos (probado en BD).
- [x] Sólo el admin crea/modifica planes, servicios y medios de pago (probado en BD).
- [ ] Flujo completo en navegador contra Supabase real (requiere el proyecto creado).

### Pendiente / decisiones
- "Consultar el estado de su solicitud" para futuros alumnos con cuenta se difiere: en Etapa 1 las cuentas son sólo por invitación. Se resolverá junto con el CRM (Etapa 3) o cuando se habilite el registro.
- Si el formulario tiene varios errores, el aviso "teléfono o email" aparece después de corregir los demás campos (limitación de validación encadenada; no afecta la seguridad: el servidor también lo exige).

---

## Incremento 3 — Alumnos y asignación de entrenadores

### Entregado
**Base de datos** — `supabase/migrations/20261029000001_students_trainers.sql`
- `students`: ficha completa (datos básicos, contacto de emergencia, observaciones, foto, vínculo opcional con usuario del portal y con el prospecto de origen). Documento normalizado (sin puntos/espacios, mayúsculas) y único por gimnasio. Email en minúsculas.
- Baja lógica: `status` activo/inactivo con motivo y fecha del cambio; nada se elimina.
- `trainers` (ficha básica): se adelantó del Incremento 7 porque la asignación la necesita. Remuneración y disponibilidad siguen en el Incremento 7.
- `trainer_student_assignments`: historial de asignaciones; una sola asignación abierta por par entrenador–alumno. `ends_on` es exclusivo: finalizar con fecha de hoy corta el acceso al instante.
- `leads.student_id`: conversión de prospecto a alumno.
- RLS: staff ve todos los alumnos; **entrenador sólo los asignados vigentes y sólo si está activo**; alumno sólo su ficha (lectura); únicamente admin crea/edita.
- Storage: bucket privado `student-photos` (2 MB, JPEG/PNG/WebP), ruta `{gym}/{alumno}/…`; lectura con las mismas reglas que la ficha, escritura sólo admin.
- Auditoría de altas y cambios en alumnos, entrenadores y asignaciones.

**Frontend**
- Alumnos: lista con filtro Activos/Inactivos/Todos, búsqueda por varias palabras (nombre, apellido, documento, teléfono), paginación, avatar.
- Alta/edición con validaciones; documento duplicado con mensaje claro.
- Ficha: datos, edad, contacto de emergencia, observaciones, foto (se reduce a 512 px JPEG en el navegador antes de subir), baja con motivo obligatorio / reactivación, entrenadores asignados con historial, asignar y finalizar con confirmación.
- Prospectos: botón "Convertir en alumno" que precarga nombre y contacto y marca el prospecto como convertido.
- Entrenadores (admin): alta/edición y vínculo con un usuario de perfil Entrenador.
- Portal del entrenador: "Mis alumnos" (sólo asignados).

### Pruebas ejecutadas (29/10/2026)
- `npm run test:db` → 46/46 (14 nuevas): normalización y unicidad de documento, tesorero lee pero no escribe, entrenador sin asignación no ve alumnos, entrenador ve sólo sus asignados y otro entrenador no, no puede autoasignarse, cierre de asignación y entrenador inactivo cortan el acceso, alumno sólo ve su ficha y no la edita, baja lógica auditada, permisos de fotos por rol y por carpeta de gimnasio.
- `npm test`, `npm run lint`, `npx tsc -b` sin errores.
- Pantallas administrativas **no** revisadas en navegador: requieren sesión contra un Supabase real.

### Pendiente / decisiones
- La conversión de prospecto actualiza el prospecto en una segunda operación; si falla, el alumno queda creado y el prospecto sin marcar (se puede marcar a mano).
- El alumno puede ver su ficha pero no editarla todavía (portal del alumno, Incremento 11).
- Membresías, cuotas, pagos y reservas aparecerán como pestañas de la ficha en los incrementos 4, 5 y 8.
