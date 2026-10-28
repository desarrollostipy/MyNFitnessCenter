# Registro de avance — Etapa 1

| # | Incremento | Estado | Fecha |
|---|---|---|---|
| 1 | Base: organización, auth, roles, auditoría, layout, usuarios | **Construido y probado localmente** — pendiente de verificar contra un proyecto Supabase real y Netlify | 27/10/2026 |
| 2 | Configuración (planes, servicios, medios de pago) + página pública + leads | **Construido y probado localmente** — pendiente de verificar contra Supabase real | 28/10/2026 |
| 3 | Alumnos: alta, ficha, búsqueda, foto, baja lógica, asignación de entrenador | **Construido y probado localmente** — pendiente de verificar contra Supabase real | 29/10/2026 |
| 4 | Membresías y cuotas + navegación móvil + identidad M&N | **Construido, probado y desplegado en Supabase** | 27/10/2026 |
| 5 | Caja diaria, cobros y recibos internos | **Construido, probado y desplegado en Supabase** | 27/10/2026 |
| 6 | Egresos | **Desplegado** | 27/10/2026 |
| 11 | Portal del alumno Mi M&N (membresía, cuotas, recibos, entrenador) | **Desplegado** (reservas desde el portal llegan con el Incremento 8) | 27/10/2026 |
| 12 | Dashboard gerencial | **Desplegado** (se ampliará con reservas, ventas y honorarios) | 27/10/2026 |
| 7, 8, 9, 10, 13 | Remuneración, reservas, liquidaciones, inventario, cierre | Pendiente | — |

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

---

## Despliegue (27/10/2026)
- Supabase `okrlprsuanenpvtygqpp` (us-east-2): migraciones 1–4 + correcciones del analizador aplicadas; seed aplicado; Edge Function `admin-invite-user` activa; cron `myn-membership-daily` activo (03:05 UTC = 00:05 Asunción).
- Primer administrador: desarrollostipy@gmail.com (auditado como `role.bootstrap_admin`).
- Verificado con la clave anónima: sólo se leen planes publicados; gimnasio, prospectos, alumnos y RPC de usuarios → 401.
- Advertencias restantes del analizador: funciones `security definer` ejecutables por usuarios autenticados (intencional: validan el rol adentro) y "protección de contraseñas filtradas" desactivada (se activa en Authentication → Settings).

## Incremento 4 — Membresías y cuotas, navegación móvil e identidad M&N

### Entregado
**Base de datos** — `supabase/migrations/20261031000001_memberships_charges.sql`
- `subscriptions` (copia de las condiciones del plan al contratar), `subscription_periods`, `subscription_pauses`, `session_entitlements`, `charges`.
- Estados separados: vigencia (`subscriptions.status`), pago (`charges.status`), acceso (vista `v_student_membership_status`, con `security_invoker`).
- RPC: `enroll_membership` (idempotente por clave), `renew_subscription`, `pause_subscription`, `cancel_subscription`, `void_charge`, `run_membership_jobs`.
- Proceso diario `app.run_daily_membership_jobs()`: renovación automática continua hasta cubrir 7 días, membresías sin renovación pasan a vencidas, cuotas impagas a "Vencido". Idempotente.
- Una sola cuota vigente por período (índice único parcial). Nadie escribe membresías ni cuotas directamente: sólo funciones.
- RLS: staff ve todo; alumno lo suyo; entrenador ve las membresías de sus alumnos pero no sus cuotas.
- Período mensual: del día de inicio al día anterior del mes siguiente. Inicios 29–31 se ajustan al fin de mes una vez y luego quedan estables.

**Frontend**
- Ficha del alumno: resumen (vigencia, vencimiento, saldo, vencido), membresías (nueva, renovar, pausar, cancelar con motivo) y cuotas (anular con motivo).
- Pantalla Cuotas: Por cobrar, Vencidas, Morosos (deuda por alumno con llamada directa), Pagadas, Anuladas; botón "Actualizar ahora".
- Celular: barra inferior con accesos principales + "Más", diálogos como hoja inferior, campos de 16 px (sin zoom en iPhone), listas en lugar de tablas anchas.
- Identidad M&N: negro, rojo de marca (#E3131B) y blanco; marca tipográfica provisoria hasta recibir el archivo del logotipo.

### Pruebas (27/10/2026)
- `npm run test:db` → 61/61 (14 nuevas): cálculo de períodos, alta con cuota y créditos, idempotencia, superposición, descuentos, alumno inactivo, tesorero sin escritura, renovación sin duplicar, proceso diario ×2 sin duplicar, morosidad, pausa, cancelación con anulación de cuotas futuras, visibilidad por rol.
- `tsc`, `lint`, `build` sin errores. Sitio público revisado a 375 px.
- Pantallas internas no revisadas en navegador por mí (requieren tu sesión).

---

## Incremento 5 — Caja diaria, cobros y recibos internos

### Entregado
**Base de datos** — `supabase/migrations/20261101000001_cash_payments.sql`
- `cash_sessions` (una sola abierta por gimnasio), `cash_movements` (sólo efectivo físico), `payments`, `payment_allocations`, `receipt_sequences`.
- `register_payment`: idempotente (clave única por formulario), bloquea las cuotas del alumno, no permite cobrar más que el saldo, asigna a las cuotas indicadas o a las más antiguas, numera el recibo `RI-000001` correlativo, y si es efectivo exige caja abierta y registra el ingreso.
- `void_payment` (sólo admin, con motivo): devuelve saldo a las cuotas y, si era efectivo, registra la salida en la caja abierta.
- `open_cash_session`, `register_cash_adjustment` (ingresos/salidas manuales con concepto; no deja salir más efectivo del disponible), `close_cash_session` (esperado vs contado; diferencia exige explicación; caja cerrada no admite movimientos).
- Escritura sólo por funciones; tesorero y admin cobran; contador consulta; alumno ve sus pagos; entrenador no ve dinero.

**Frontend**
- Caja: apertura con saldo inicial, tarjetas de saldo/ingresos/salidas/esperado, movimientos, ingreso/salida manual, cierre con arqueo (cuadra / sobrante / faltante) e historial de cierres.
- Cobrar cuota (pensado para celular): buscar alumno → elegir cuotas → importe (admite parcial) → medio de pago → recibo.
- Recibo interno imprimible y para compartir por WhatsApp, con leyenda "no válido como factura" y sello ANULADO si corresponde.
- Cobranzas: hoy / este mes / rango, total y desglose por medio de pago.
- Ficha del alumno: tarjeta de pagos con recibos, botón Cobrar y anulación (admin).

**Demo**: los pagos de ejemplo ahora son cobros reales (20, por transferencia/tarjeta) con recibo; `remove_demo.sql` también los borra y reinicia la numeración.

### Pruebas (27/10/2026)
- `npm run test:db` → 74/74 (13 nuevas): efectivo sin caja, una caja abierta, cobro parcial con asignación a la más antigua + recibo + movimiento, idempotencia, tope de saldo, asignación manual inválida, cuota con pagos no anulable, anulación sólo admin con reversión de saldo y caja, sin escritura directa, salida mayor al efectivo, cierre con diferencia, recibos correlativos, visibilidad por rol.
- `check-demo.mjs`: demo idempotente y borrado sin rastros.

---

## Incrementos 6, 12 y 11 — Egresos, Dashboard y portal "Mi M&N"

### Base de datos
- `20261102000001_expenses.sql`: `expense_categories` (9 categorías base, gestionables por admin) y `expenses`. `register_expense` idempotente; en efectivo exige caja abierta y efectivo suficiente y registra la salida. `void_expense` sólo admin; el efectivo vuelve a la caja abierta.
- `20261102000002_dashboard.sql`: `dashboard_summary(gym, desde, hasta)` (admin y contador): cobrado (hoy/período/anterior/por medio), egresos (período/anterior/por categoría), resultado, saldo pendiente, vencido, morosos, alumnos (activos, con membresía vigente, sin membresía, nuevos), membresías por vencer/canceladas, prospectos, entrenadores, serie diaria. Comparación con el período anterior de igual duración.
- `20261102000003_student_portal.sql`: el alumno ve a sus entrenadores asignados; `link_student_user` (admin) vincula la cuenta a la ficha y asigna el perfil Alumno.
- Edge Function `admin-invite-user`: acepta `student_id`; si el email ya tiene cuenta, la vincula en lugar de fallar.

### Frontend
- Egresos: período, total, desglose por categoría, alta (con proveedor y Nº de factura del proveedor), anulación, categorías.
- Dashboard (inicio de admin y contador): tarjetas con variación vs. período anterior (sólo si hay datos comparables), gráfico de cobros por día con detalle al tocar, desgloses por medio de pago y categoría. Todo enlaza a la pantalla de detalle.
- Mi M&N (alumno, pensado para celular): inicio con estado de membresía, vencimiento, saldo, próximo vencimiento y entrenador (WhatsApp); mi membresía (planes y cuotas); mis recibos.
- Ficha del alumno: botón "Dar acceso al portal" (invita por email y vincula).

### Pruebas (27/10/2026)
- `npm run test:db` → 84/84 (10 nuevas). `check-demo.mjs` OK. `tsc`, `lint`, `build` sin errores.
- `dashboard_summary` ejecutado en producción con la identidad del admin: cifras coherentes con los datos de demo.
- Pendiente de verificar en el sitio publicado: invitación real de un alumno (requiere configurar la URL del sitio en Supabase).

---

## Pase diario/semanal, Itauguá e íconos (28/10/2026)
- `20261103000001/2`: tipos de plan `daily` (1 día) y `weekly` (7 días); un trigger les quita la renovación automática.
- Web pública: Itauguá, Paraguay. Íconos PNG (pestaña, iPhone, Android) y `manifest.webmanifest`.

## Recepción — Venta rápida y control de ingreso

### Base de datos (`20261104000001_reception.sql`)
- `check_ins`: un ingreso por alumno y día (`source` = `reception` o `device`, preparado para el molinete). Si no está habilitado se registra sólo con motivo, y queda auditado (`check_in_override`).
- `check_access(alumno)`: habilitado si está activo, tiene membresía o pase vigente hoy, no está en pausa y no tiene cuotas vencidas (por fecha, aunque el proceso nocturno no las haya marcado).
- `register_check_in(alumno, motivo)`: idempotente por día.
- `quick_sale(...)`: alumno existente o alta mínima (nombre, apellido, CI, teléfono; si el CI ya existe usa esa ficha) + plan desde hoy al precio del servidor, sin descuento + cobro exacto de esa cuota con recibo + ingreso opcional. Todo en una transacción: si falla el cobro no queda el alumno ni la membresía. Idempotente.
- Decisión: la venta rápida la puede hacer el cajero (treasurer); la inscripción con descuento sigue siendo sólo del admin.

### Frontend
- **Control de ingreso** (`/ingreso`, inicio del cajero): búsqueda por CI o nombre, cartel verde/rojo con motivos y deuda vencida, registrar ingreso, dejar pasar con motivo, atajos a Cobrar y Vender pase; lista de ingresos de hoy.
- **Venta rápida** (`/caja/venta-rapida`): pases primero, medio de pago, referencia, "registrar el ingreso ahora"; termina en el recibo.
- Menú: nueva sección Recepción; barra inferior del celular con Ingreso, Vender y Cobrar.

### Pruebas (28/10/2026)
- `npm run test:db` → 91/91 (7 nuevas). `tsc`, `lint`, `build` sin errores.
- `check_access` ejecutado en producción con la identidad del admin sobre alumnos de demo: resultados coherentes (con y sin cuotas vencidas).
- Pendiente: probar las pantallas con usuario real en el sitio publicado.

### Molinete
- Pendiente de datos del equipo (marca y modelo exactos, forma de identificación, conexión a red/internet, software actual) para definir la integración.

## Molinete — vista previa (28/10/2026)
- Integración con el molinete ZKTeco TS2000 pasa a la **Etapa 2** (pedido del gimnasio).
- Datos relevados: lector por huella (se evalúa sumar tags con la marca M&N), conectado por cable o wifi, hoy se habilita por CI desde una app (nombre a confirmar). Falta: modelo exacto del lector y regla de días de gracia.
- Excepción acordada con el gimnasio a la regla "no mostrar módulos no implementados": `/admin/molinete` (sólo admin) es una **vista previa** rotulada como tal, con controles deshabilitados y filas marcadas "Ejemplo". No consulta ni escribe datos.
- Preparado en la base: `check_ins.source = 'device'` para los ingresos que lleguen del equipo.

## Rediseño visual — tema oscuro "glass" (28/10/2026)
- Elegido por el gimnasio a partir de la maqueta `docs/diseno/propuesta-glass.html` (versión oscura).
- Tokens en `src/index.css`: fondo negro con luces rojas de marca, paneles translúcidos (`glass`: desenfoque + borde sutil), bordes muy redondeados, botones tipo cápsula, opción elegida en cápsula clara (`bg-selected`).
- Menú lateral flotante de vidrio; en el celular, barra inferior flotante tipo cápsula.
- Sin desenfoque (equipos sin soporte o "reducir transparencia"): paneles sólidos.
- Recibos: clase `paper` (siempre blanco en pantalla e impresión).

## Usuarios por CI con PIN (28/10/2026)
- Pedido del gimnasio: crear las cuentas desde Usuarios con el número de CI (sin email) y entregar un PIN.
- Edge Function `admin-invite-user` (sólo admin):
  - `create_ci`: crea la cuenta con un email técnico `<ci>@ci.example.com` (dominio reservado RFC 2606, nunca recibe correo, así nadie puede pedir un enlace de recuperación hacia esa dirección) y un PIN temporal de 8 caracteres con letras y números, sin caracteres ambiguos. Marca `must_change_password`. Si falla la asignación de perfil, borra la cuenta recién creada.
  - `reset_pin`: PIN nuevo para un usuario del gimnasio (no para la propia cuenta). Auditado (`user.pin_reset`).
  - `invite`: la invitación por email sigue disponible como opción secundaria.
- Ingreso: campo "CI o email". Con PIN temporal, el sistema obliga a crear una clave propia (`/crear-clave`) antes de entrar.
- Ficha del alumno: "Dar acceso al portal" crea la cuenta con su CI y muestra el PIN.
- Listas desplegables: fondo oscuro sólido (en el tema glass se veían en blanco).
- Pendiente de verificar con un alta real en producción: no se crearon cuentas de prueba en la base real.

## Facturación electrónica — Etapa A, registro manual (28/10/2026)
- El gimnasio ya es facturador electrónico (MYN FITNEES CENTER E.A.S., RUC 80165579-0, timbrado 18537244) y emite con el facturador gratuito de la DNIT, que no tiene conexión para sistemas. Por eso:
  - **Etapa A (hecha):** la app arma los datos a facturar, la factura se emite a mano en e-Kuatia y se registra su CDC.
  - **Etapa B (pendiente):** conectar un proveedor de facturación electrónica para emitir automáticamente. Se sugiere un punto de expedición propio (p. ej. 001-002) para no cruzar la numeración con el facturador gratuito. A confirmar con el contador.
- La app **no genera ningún documento con formato de factura**: muestra una ficha interna con botones de copiar. El recibo interno sigue diciendo "no válido como factura".
- Migración `20261105000001_invoicing_manual.sql`:
  - **Datos fiscales del gimnasio** (`gyms.fiscal_*`): timbrado, vigencia, establecimiento, punto de expedición, actividad, tipo de transacción (por defecto "Prestación de servicios").
  - **Alumno, opcional:** `billing_ruc` y `billing_name`. El RUC se valida con el dígito verificador módulo 11 de la DNIT.
  - **`invoices`:** una factura vigente por cobro, CDC único por gimnasio, foto de receptor, ítems, total e IVA. Sin escritura directa. El staff ve todas; el alumno ve las de sus cobros.
  - **`invoice_draft(pago, sin_nombre)`:** el servidor arma el receptor de la factura:
    - RUC si el alumno lo tiene cargado;
    - si no, su cédula;
    - si el documento no es numérico, documento extranjero;
    - o "Sin nombre" (innominado) si se elige consumidor final.
    - Los ítems salen de las cuotas cobradas, con IVA 10% incluido (importe / 11).
  - **`register_invoice(pago, cdc)`** (admin o recepción):
    - Valida 44 dígitos, dígito verificador, tipo 01 (factura electrónica), RUC del gimnasio y fecha no futura ni anterior al timbrado.
    - Toma el número y la fecha de emisión del propio CDC.
    - Es idempotente.
  - **`cancel_invoice(factura, motivo, cdc_nc)`** (sólo admin):
    - Registra la cancelación hecha en e-Kuatia (plazo de 72 h, según el pie del KuDE).
    - Pasado ese plazo, registra la nota de crédito (CDC tipo 05).
    - No borra nada.
  - **`void_payment`:** no anula un cobro con factura vigente.
- Pantallas:
  - Configuración: sección "Facturación electrónica".
  - Ficha del alumno: "Facturar a RUC (opcional)".
  - Recibo: panel "Factura electrónica" con 1) datos para copiar en e-Kuatia y 2) campo para el CDC, que muestra el número y la fecha antes de guardar. Con factura: número, CDC, consulta en e-Kuatia, cancelar o nota de crédito.
  - Cobranzas: tarjeta y filtro "Sin facturar", y etiqueta de factura en cada cobro.
  - Portal del alumno: número de factura y CDC en sus recibos.
- Para confirmar con el contador:
  - el tipo de transacción (la factura de ejemplo dice "Venta de mercadería");
  - si hay un monto máximo para facturar a "Sin nombre";
  - el trámite y la numeración para pasar a un proveedor en la Etapa B.

## Rol Cajero, registro de cajas y contacto del alumno (28/10/2026)
- **Rol Cajero** (`cashier`, migraciones `20261106000001` y `20261106000002`). Lo eligió el gimnasio como "solo mostrador":
  - **Puede:** abrir y cerrar caja, cobrar cuotas, venta rápida, control de ingreso, ver e imprimir recibos y registrar facturas.
  - **No puede:** anular, hacer ingresos o salidas manuales de efectivo, registrar egresos, ni ver cobranzas, egresos, prospectos o reportes.
  - **Qué ve en la base (RLS):** alumnos y cuotas (para cobrar); cobros e ingresos del día; la caja abierta y las que abrió o cerró él.
  - Las RPC de mostrador suman `cashier`; la venta rápida usa `app.is_front_desk`.
  - Es el perfil por defecto al crear usuarios por CI.
- **Cierre de caja:** cualquiera del mostrador puede cerrar (cambio de turno), como eligió el gimnasio.
  - La pantalla Caja muestra quién abrió la caja actual.
  - Cada cierre muestra quién abrió, quién cerró, el inicial, lo esperado, lo contado y la diferencia.
  - Los nombres salen de `staff_names()`, que sólo devuelve personal del gimnasio. La auditoría sigue registrando `cash.open` y `cash.close`.
- **Contacto del alumno:**
  - El celular (recibo por WhatsApp) y el email (factura electrónica) son obligatorios en las altas: lo exige el formulario y el trigger `students_require_contact`.
  - Una vez cargados no se pueden borrar. La CI ya era obligatoria y el RUC sigue siendo opcional.
  - En producción, los 14 alumnos ya tenían ambos datos.
- **Venta rápida:**
  - Exige celular y email para una persona nueva.
  - Si un alumno existente no los tiene, se piden y se completan en su ficha.
- **Recibo:**
  - "Enviar por WhatsApp" abre el chat con el celular del alumno (formato 595…).
  - Si el cobro ya tiene factura, el mensaje incluye su número y su CDC.
  - El panel de factura muestra el email del receptor para cargarlo en e-Kuatia.
