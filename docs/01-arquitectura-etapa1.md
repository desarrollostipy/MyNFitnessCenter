# MyN Fitness — Arquitectura y diseño de la Etapa 1

> Documento vivo. Versión 1.0 — 27/10/2026.
> Alcance autorizado: **Etapa 1 (Administración y operación)**. Las Etapas 2 y 3 se mencionan sólo para justificar decisiones de diseño; no se construyen.

---

## 1. Arquitectura final recomendada

```
┌──────────────────────────┐        HTTPS (anon key + JWT del usuario)
│  Navegador (React SPA)   │ ─────────────────────────────────────────┐
│  Vite · TS · Tailwind    │                                          │
│  TanStack Query · RHF+Zod│                                          ▼
└───────────┬──────────────┘                         ┌──────────────────────────────┐
            │ archivos estáticos                     │           Supabase           │
            ▼                                        │  Auth (email+contraseña)     │
┌──────────────────────────┐                         │  PostgREST  ──► tablas + RLS │
│  Netlify (CDN + SPA)     │                         │  RPC (funciones PL/pgSQL)    │
│  build: npm run build    │                         │    = operaciones críticas    │
│  _redirects /* → index   │                         │  Storage (fotos, imágenes)   │
└───────────▲──────────────┘                         │  Cron (pg_cron) — vencimientos│
            │ deploy automático en push a main       └──────────────▲───────────────┘
┌───────────┴──────────────┐                                        │
│  GitHub (privado)        │ ── supabase db push (migraciones) ─────┘
│  myn-fitness             │
└──────────────────────────┘
```

**Principios de interacción**

| Tipo de operación | Cómo se ejecuta | Por qué |
|---|---|---|
| Lecturas (listas, fichas, KPIs) | `select` vía PostgREST, filtrado por **RLS** | Simple, paginable, seguro en el servidor |
| Altas/ediciones de catálogos (planes, productos, servicios) | `insert/update` directo con RLS por rol | No hay dinero ni stock involucrado |
| **Dinero, stock, reservas, liquidaciones, caja** | **Sólo RPC** (`security definer`) en una transacción | Atomicidad, bloqueo de filas, idempotencia, importes calculados en el servidor |
| Formulario público (futuro alumno) | RPC `submit_lead` con rol `anon` | El anónimo nunca puede leer la tabla `leads` |
| Procesos programados | `pg_cron` llamando funciones idempotentes | Sin servidor extra |
| Edge Functions | Sólo cuando se necesite un secreto del servidor (p. ej. invitar usuarios con service role) | Los secretos nunca van al frontend |

**Decisiones técnicas clave**

1. **Dinero en guaraníes enteros** (`bigint`). El PYG no usa decimales: se elimina por completo el error de coma flotante. Formato visible `G. 1.250.000`.
2. **Fechas**: instantes en `timestamptz` (UTC en disco). Fechas de negocio (vencimiento, día de caja, período) en `date` calculadas con `America/Asuncion`. La función `app.today()` devuelve la fecha local de Asunción.
3. **`gym_id` en todas las tablas operativas** desde el inicio; hoy existe un solo gimnasio. RLS siempre filtra por gimnasio + rol.
4. **Roles en base de datos** (`user_gym_roles`), no en el JWT editable por el usuario. Funciones `app.has_role()` usadas por RLS.
5. **Idempotencia**: cada operación financiera recibe un `idempotency_key uuid` generado al abrir el formulario. Índice único → el doble clic o reintento devuelve el mismo resultado sin duplicar.
6. **Nada se borra físicamente** en finanzas: se anula (`status = 'voided'`, motivo, usuario, fecha) y queda en auditoría.
7. **Recibos internos no fiscales**: numeración propia `RI-000001`, con la leyenda *"Comprobante interno — no válido como factura"*. Se guardan concepto, fechas e importes para la integración SIFEN de la Etapa 3.

---

## 2. Estructura de carpetas

```
myn-fitness/
├── docs/                     # arquitectura, decisiones (ADR), avance, despliegue
├── supabase/
│   ├── config.toml
│   ├── migrations/           # SQL versionado (YYYYMMDDHHMMSS_nombre.sql)
│   ├── seed.sql              # datos iniciales NO ficticios (gym, medios de pago, categorías)
│   └── tests/                # pruebas de RLS/permisos (pgTAP)
├── src/
│   ├── app/                  # router, providers, layouts, guards
│   ├── components/ui/        # componentes base estilo shadcn/ui
│   ├── components/           # componentes compartidos (DataTable, Money, EmptyState…)
│   ├── features/<módulo>/    # auth, students, plans, memberships, payments, cash,
│   │                         # bookings, trainers, settlements, inventory, sales,
│   │                         # reports, users, public
│   │     ├── api.ts          # consultas/mutaciones (TanStack Query)
│   │     ├── schemas.ts      # Zod
│   │     └── pages/…
│   ├── lib/                  # supabase client, formato PYG/fecha, utilidades
│   └── types/database.ts     # tipos generados con `supabase gen types`
├── netlify.toml
└── .env.example              # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (públicas)
```

---

## 3. Modelo de datos (Etapa 1)

Convenciones: PK `id uuid default gen_random_uuid()`, `gym_id` FK, `created_at/updated_at timestamptz`, `created_by uuid`, soft delete con `archived_at` en maestros. Importes `bigint` con `check (>= 0)`.

### 3.1 Organización y seguridad
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `gyms` | name, legal_name, ruc, timezone, currency, settings jsonb | — |
| `user_profiles` | id = auth.users.id, full_name, phone, avatar_path | 1:1 con auth.users |
| `user_gym_roles` | user_id, gym_id, role (`admin`,`accountant`,`treasurer`,`trainer`,`student`,`prospect`) | `unique(user_id, gym_id, role)`; sólo admin asigna (RPC) |
| `audit_logs` | gym_id, actor_id, action, entity, entity_id, before jsonb, after jsonb, reason | sólo inserción (trigger/RPC); nadie edita ni borra |
| `receipt_sequences` | gym_id, prefix, last_number | bloqueo `for update` para numerar |

### 3.2 Alumnos y captación
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `students` | user_id (nullable, vínculo al portal), first_name, last_name, document_number, birth_date, phone, email, address, enrolled_on, status (`active`,`inactive`,`archived`), photo_path, emergency_contact, notes | `unique(gym_id, document_number)` |
| `leads` | full_name, phone, email, interest (`info`,`enrollment`,`trial_class`), plan_id, message, status (`new`,`contacted`,`converted`,`lost`), student_id | insert anónimo sólo vía RPC |
| `trainer_student_assignments` | trainer_id, student_id, starts_on, ends_on | `unique` activo por par |

### 3.3 Planes y membresías
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `membership_plans` | name, description, plan_type (`monthly`,`quarterly`,`annual`,`sessions`,`custom`), price, duration_months / duration_days, included_sessions, included_service_id, benefits text[], conditions, is_active, is_public | precio ≥ 0 |
| `subscriptions` | student_id, plan_id, status (`active`,`paused`,`cancelled`,`expired`), starts_on, ends_on, price_agreed, discount_amount, discount_reason, discount_approved_by, auto_renew | un alumno no puede tener 2 suscripciones activas del mismo plan solapadas |
| `subscription_periods` | subscription_id, period_start, period_end, sequence | `unique(subscription_id, period_start)` → evita doble generación |
| `subscription_pauses` | subscription_id, from_date, to_date, reason | — |
| `session_entitlements` | subscription_period_id, service_id, granted, used | `used <= granted` |

**Estados separados** (requisito): *pago* vive en `charges.status`; *vigencia contractual* en `subscriptions.status` + fechas; *derecho de acceso* se calcula en la vista `v_student_access` (vigente ∧ sin deuda vencida > tolerancia configurable).

### 3.4 Finanzas
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `payment_methods` | code (`cash`,`transfer`,`card`,…), name, affects_cash bool, is_active | — |
| `charges` (obligaciones/cuentas por cobrar) | student_id, source (`membership`,`booking`,`sale`,`other`), subscription_period_id, booking_id, sale_id, concept, amount, discount, due_on, status (`pending`,`partial`,`paid`,`overdue`,`voided`) | `unique(subscription_period_id)` donde no anulado → sin cuota duplicada |
| `payments` | student_id, method_id, amount, paid_at, reference, cash_session_id, receipt_number, idempotency_key, status (`posted`,`voided`) | `unique(idempotency_key)`, `unique(gym_id, receipt_number)` |
| `payment_allocations` | payment_id, charge_id, amount | Σ asignaciones ≤ importe del pago y ≤ saldo del cargo (validado en RPC con bloqueo) |
| `refunds` | payment_id, amount, reason, approved_by | ≤ monto pagado |
| `expense_categories` | name (Profesores, Alquiler, Servicios, Proveedores, Mantenimiento, Mercaderías, Otros) | — |
| `expenses` | category_id, description, amount, method_id, paid_at, supplier, cash_session_id, trainer_payout_id, idempotency_key, status | `unique(idempotency_key)` |
| `cash_sessions` (caja diaria) | opened_by, opened_at, opening_amount, closed_by, closed_at, expected_amount, counted_amount, difference, status (`open`,`closed`) | una sola caja abierta por gimnasio (índice único parcial) |
| `cash_movements` | cash_session_id, direction (`in`,`out`), amount, source (`payment`,`sale`,`expense`,`payout`,`adjustment`), source_id, note | sólo efectivo físico |

### 3.5 Profesores y honorarios
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `trainers` | user_id, first_name, last_name, document_number, phone, email, specialties, is_active | `unique(gym_id, document_number)` |
| `trainer_compensation_rules` | trainer_id, scheme (`fixed`,`variable`,`mixed`), fixed_monthly_amount, per_session_amount, commission_pct (0–100, numeric(5,2)), commission_base (`collected_eligible`), valid_from, valid_to | sin solapamiento de vigencias por profesor (exclusion constraint) |
| `trainer_settlements` | trainer_id, period_start, period_end, rule snapshot jsonb, fixed_amount, sessions_count, sessions_amount, commission_amount, adjustments_amount, gross_amount, status (`draft`,`pending_approval`,`approved`,`paid`,`voided`), approved_by/at, voided_reason | único no anulado por (trainer, período) |
| `trainer_settlement_items` | settlement_id, kind (`fixed`,`session`,`commission`,`adjustment`), booking_id, payment_allocation_id, amount, description | índice único parcial `booking_id` / `payment_allocation_id` donde la liquidación no está anulada → **ninguna sesión se liquida dos veces** |
| `trainer_payouts` | settlement_id, amount, method_id, paid_at, cash_session_id, idempotency_key | Σ payouts ≤ gross |

### 3.6 Servicios y reservas
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `services` | name, description, duration_minutes, price, capacity (=1 en Etapa 1), is_bookable, is_commissionable, cancellation_hours, no_show_consumes_credit | — |
| `trainer_services` | trainer_id, service_id | qué servicios dicta cada profesor |
| `trainer_availability` | trainer_id, weekday, start_time, end_time | sin solapamiento por profesor/día |
| `trainer_time_off` | trainer_id, starts_at, ends_at, reason | — |
| `bookings` | student_id, trainer_id, service_id, starts_at, ends_at, status (`confirmed`,`cancelled`,`completed`,`no_show`), coverage (`entitlement`,`charge`), entitlement_id, charge_id, idempotency_key | **exclusion constraint** `(trainer_id =, tstzrange &&)` y `(student_id =, tstzrange &&)` para estados activos → imposible reservar dos veces el mismo horario aun con peticiones simultáneas |
| `booking_status_history` | booking_id, from_status, to_status, changed_by, reason | — |

En Etapa 1 la asistencia es el estado `completed`/`no_show` de la reserva + historial; la tabla `attendance_records` (check-in general) se difiere a Etapa 2/3 para no duplicar datos.

### 3.7 Inventario y ventas
| Tabla | Columnas clave | Restricciones |
|---|---|---|
| `product_categories` | name | — |
| `products` | sku, name, category_id, description, sale_price, reference_cost, stock (cache), min_stock, is_active, image_path | `unique(gym_id, sku)`, `check(stock >= 0)` |
| `inventory_movements` | product_id, kind (`initial`,`purchase`,`sale`,`internal_use`,`return`,`adjustment`), quantity (±), unit_cost, sale_id, reason, created_by | `products.stock` sólo cambia vía RPC que inserta el movimiento en la misma transacción |
| `product_sales` | student_id (opcional), customer_name, total, payment_id, status, idempotency_key | `unique(idempotency_key)` |
| `product_sale_items` | sale_id, product_id, quantity, unit_price (tomado del servidor), line_total | quantity > 0 |

### 3.8 Notificaciones (mínimo Etapa 1)
`notifications` (user_id, title, body, link, read_at) — sólo avisos internos en la app. Preferencias y envíos externos → Etapa 3.

### 3.9 Funciones RPC transaccionales (Etapa 1)
| RPC | Qué garantiza |
|---|---|
| `submit_lead` | inserción anónima validada, sin lectura |
| `admin_set_user_role` | sólo admin; auditada; no permite quitarse el último admin |
| `enroll_student` | crea alumno + suscripción + primer período + cargo en una transacción |
| `generate_due_periods()` | (cron diario) genera período y cargo siguiente de suscripciones vigentes; idempotente por `unique(subscription_id, period_start)` |
| `mark_overdue_charges()` | (cron diario) `pending/partial → overdue` si `due_on < hoy` |
| `register_payment` | bloquea cargos, valida saldos, asigna, numera recibo, mueve caja si es efectivo, idempotente |
| `void_payment` | sólo admin, con motivo; revierte asignaciones y caja con contramovimiento |
| `open_cash_session` / `close_cash_session` | una caja abierta; cierre calcula esperado vs contado |
| `register_expense` | idempotente; mueve caja si efectivo |
| `create_booking` / `cancel_booking` / `mark_attendance` | disponibilidad, crédito vs cobro, políticas de cancelación/ausencia |
| `build_trainer_settlement` / `submit` / `approve` / `void` | cálculo en servidor, sin duplicar sesiones |
| `pay_trainer_settlement` | idempotente; egreso + caja |
| `register_inventory_movement` | stock nunca negativo (`for update`) |
| `register_sale` | precios del servidor, descuenta stock, cobra, recibo |

### 3.10 Políticas RLS (resumen)
Funciones auxiliares (`security definer`, `stable`): `app.has_role(gym, role)`, `app.has_any_role(gym, roles[])`, `app.current_trainer_id()`, `app.current_student_id()`, `app.trainer_can_see_student(student)`.

- **Staff** (admin, accountant, treasurer): lectura por gimnasio según la matriz §4.
- **Entrenador**: `students` sólo si existe asignación activa; `bookings` sólo propias; `trainer_settlements` sólo propias; sin acceso a `payments`, `expenses`, `cash_*`.
- **Alumno**: sólo filas donde `student_id = app.current_student_id()`.
- **Anónimo**: `membership_plans`/`services` con `is_public` (lectura); `leads` sin ningún permiso (sólo RPC).
- **Escrituras financieras directas**: denegadas para todos; sólo las RPC.

---

## 4. Matriz de permisos (Etapa 1)

C = crear · L = leer · M = modificar · A = aprobar/anular · — = sin acceso · *propio* = sólo sus datos

| Recurso | Admin | Contador | Tesorero | Entrenador | Alumno | Futuro alumno |
|---|---|---|---|---|---|---|
| Configuración del gimnasio | L M | L | L | — | — | — |
| Usuarios y roles | C L M | — | — | — | — | — |
| Auditoría | L | L | — | — | — | — |
| Alumnos (ficha) | C L M, baja lógica | L | L (búsqueda para cobrar) | L *asignados* | L M *propio* (contacto) | — |
| Planes | C L M | L | L | L | L | L *públicos* |
| Servicios | C L M | L | L | L | L | L *públicos* |
| Membresías | C L M, A descuentos/pausas/cancelación | L | C L (renovación sin descuento) | L *asignados* | L *propio* | — |
| Cuotas/cargos | L, A anulación | L | L | — | L *propio* | — |
| Cobros/pagos | L, A anulación | L | C L | — | L *propio* | — |
| Recibos internos | L | L | C L | — | L *propio* | — |
| Caja diaria | L, A reapertura | L (revisión de cierres) | C L (abrir, cerrar, arqueo) | — | — | — |
| Egresos | C L, A anulación | L | C L | — | — | — |
| Profesores | C L M | L | L | L M *propio* (contacto) | L *su entrenador* (nombre) | — |
| Reglas de remuneración | C L M | L | — | L *propio* | — | — |
| Liquidaciones | C L, A aprobar/anular | C L (preparar, enviar a aprobación) | L *aprobadas* | L *propio* | — | — |
| Pagos a profesores | L | L | C (sólo aprobadas) | L *propio* | — | — |
| Disponibilidad profesores | C L M | — | L | C L M *propio* | L (huecos libres) | — |
| Reservas | C L M | L | C L M | L M *propias* (asistencia) | C L cancelar *propio* | — |
| Productos/categorías | C L M | L | L | — | — | — |
| Movimientos de inventario | C L, A ajustes | L | C L (compra, consumo interno) | — | — | — |
| Ventas | L, A anulación | L | C L | — | L *propio* | — |
| Reportes | L | L | L (diarios/caja) | — | — | — |
| Prospectos (leads) | L M | — | L M | — | — | C (formulario) |

Un usuario puede tener varios roles; los permisos se suman. Los roles administrativos sólo los asigna un admin mediante `admin_set_user_role` (auditada). El primer admin se crea con un script SQL documentado.

---

## 5. Pantallas de la Etapa 1

**Público** (sin login): `/` Inicio · `/planes` · `/servicios` · `/contacto` (consulta, inscripción o clase de prueba) · `/login` · `/recuperar` · `/restablecer`.

**Administrador** (`/admin`): Dashboard · Alumnos (lista, ficha con pestañas Datos/Membresías/Cuotas/Pagos/Reservas) · Membresías · Cuotas · Cobranzas · Reservas (agenda semanal por profesor) · Profesores (ficha, remuneración, disponibilidad) · Honorarios (liquidaciones) · Productos · Inventario · Ventas · Egresos · Reportes · Prospectos · Usuarios · Configuración (gimnasio, planes, servicios, medios de pago, categorías).

**Contador** (`/finanzas`): Resumen financiero · Ingresos · Egresos · Cuentas pendientes · Liquidaciones · Conciliación (pagos por medio vs caja) · Reportes.

**Tesorero** (`/caja`): Caja (estado, apertura) · Cobrar cuota · Ventas · Reservas · Registrar egreso · Pagos a profesores · Movimientos · Cierre de caja.

**Entrenador** (`/entrenador`, móvil primero): Mi dashboard · Mis alumnos · Mi agenda (confirmar asistencia) · Mi disponibilidad · Mis honorarios.
*(Rutinas, Planificación y Seguimiento NO se muestran: son Etapa 2.)*

**Alumno** (`/mi`, "MI MYN FITNESS", móvil primero): Inicio · Mis reservas · Mi membresía (plan, vencimiento, cuotas, pagos) · Mi perfil.
*(Mi semana deportiva, Mis rutinas y Mi progreso NO se muestran: son Etapa 2.)*

Si un usuario tiene varios roles, un selector de "espacio" permite cambiar entre ellos.

---

## 6. Procesos críticos

### 6.1 Inscripción de alumno
1. Admin abre "Nuevo alumno" → valida documento único.
2. Elige plan (precio y duración vienen del servidor), fecha de inicio, descuento opcional (requiere motivo; sólo admin).
3. `enroll_student` (1 transacción): `students` → `subscriptions` → `subscription_periods` #1 → `charges` (vence en la fecha de inicio) → `session_entitlements` si el plan incluye sesiones → `audit_logs`.
4. Opcional: "Cobrar ahora" abre el cobro con el cargo preseleccionado.
5. Opcional: "Crear acceso al portal" invita al alumno por email (Edge Function) y vincula `students.user_id`.

### 6.2 Membresía y renovación
- Período n+1 = día siguiente al fin del período n. `generate_due_periods()` corre a diario y crea períodos para suscripciones con `auto_renew` cuyo fin está a ≤ 7 días; el `unique(subscription_id, period_start)` impide duplicados aunque corra dos veces.
- Pausa: corre `ends_on` y los vencimientos futuros; no toca cargos ya emitidos.
- Cancelación: `status = cancelled`, no genera más períodos; los cargos pendientes quedan (o se anulan con autorización de admin). Nada se borra.

### 6.3 Cobro de cuotas
1. Tesorero busca alumno → ve cargos abiertos con saldo.
2. Ingresa importe y medio de pago; el sistema propone asignar al cargo más antiguo.
3. `register_payment(idempotency_key, …)`: verifica caja abierta si es efectivo → `select … for update` de los cargos → valida que cada asignación ≤ saldo → inserta pago + asignaciones → recalcula estado (`partial`/`paid`) → numera recibo `RI-xxxxxx` → movimiento de caja si es efectivo → auditoría.
4. Reintento con la misma clave → devuelve el pago existente.
5. Anulación: sólo admin con motivo; contramovimiento de caja; los cargos vuelven a su saldo.

### 6.4 Reservas individuales
1. Alumno/tesorero elige servicio → profesor → día; el sistema lista huecos = disponibilidad − time-off − reservas activas.
2. `create_booking`: bloquea suscripción/entitlement → si hay crédito vigente (`used < granted`) consume 1 (`coverage = entitlement`, **sin cargo**); si no, crea un `charge` por el precio del servicio (`coverage = charge`).
3. Inserta reserva; la exclusion constraint rechaza solapamientos de profesor o alumno incluso con peticiones simultáneas → mensaje "Ese horario acaba de ocuparse".
4. Cancelación: si faltan ≥ `cancellation_hours`, devuelve el crédito o anula el cargo pendiente; si no, aplica la política del servicio.

### 6.5 Registro de asistencia
El entrenador (sólo sus reservas) o admin marca `completed` o `no_show` desde la agenda. Se registra en `booking_status_history`. Sólo `completed` es elegible para honorarios por sesión. No-show: consume o no el crédito según `services.no_show_consumes_credit`.

### 6.6 Liquidación de profesores
1. Contador/admin elige profesor y período → `build_trainer_settlement` (servidor):
   - Regla vigente en el período (snapshot guardado).
   - **Fijo**: `fixed_monthly_amount` (prorrateado si la regla empieza/termina dentro del mes).
   - **Por sesión**: reservas `completed` del profesor en el período **no incluidas en otra liquidación no anulada** × `per_session_amount`.
   - **Comisión %**: asignaciones de pagos efectivamente cobrados en el período a cargos de reservas de servicios `is_commissionable` del profesor, no liquidadas antes × `commission_pct` (redondeo a guaraní entero).
   - **Mixto**: fijo + variable.
2. Estado `draft` → ajustes manuales trazables (ítem `adjustment` con motivo) → `pending_approval` → admin `approved` → tesorero paga (`pay_trainer_settlement`, idempotente, egreso categoría Profesores + caja si efectivo) → `paid`.
3. Anulación sólo admin con motivo; libera las sesiones para una nueva liquidación.
4. El sistema calcula **remuneración operativa**; no calcula IPS, IVA ni obligaciones laborales.

### 6.7 Venta de productos
1. Tesorero arma el carrito (sólo IDs y cantidades; el precio lo toma el servidor).
2. `register_sale`: bloquea productos → valida stock → inserta venta + ítems → movimientos `sale` (−) → actualiza stock → crea cargo y pago (método elegido) → recibo → caja si efectivo. Todo o nada.
3. Devolución: movimiento `return` (+) y reembolso con autorización.

### 6.8 Movimientos de caja
- Apertura con saldo inicial (una caja abierta a la vez).
- Sólo el efectivo genera `cash_movements`; transferencias y tarjetas quedan en `payments` con su medio, para conciliación separada.
- Cierre: esperado = apertura + entradas − salidas; el tesorero ingresa el arqueo contado; diferencia registrada con observación. Caja cerrada = inmutable (reapertura sólo admin, auditada).

---

## 7. Plan de implementación de la Etapa 1

| # | Incremento | Criterio de aceptación verificable |
|---|---|---|
| **1** | Base: proyecto, migración de organización/roles/auditoría, Auth, layout por rol, recuperación de contraseña, gestión de usuarios y roles, Netlify | Un admin inicia sesión, ve su menú; un usuario sin rol no ve datos; el admin asigna/quita roles y queda auditado; recargar una ruta interna en Netlify funciona |
| 2 | Configuración: planes, servicios, medios de pago, categorías + página pública de planes + formulario de contacto (leads) | Un anónimo ve planes públicos y envía consulta; no puede leer leads; el admin ve y gestiona prospectos |
| 3 | Alumnos: ABM, búsqueda, paginación, foto (Storage), baja lógica | CRUD real; documento único; entrenador sin asignación no ve alumnos (prueba RLS) |
| 4 | Membresías y cuotas: inscripción, períodos, cargos, renovación/pausa/cancelación, cron de vencimientos y morosidad | Ejecutar el cron dos veces no duplica cuotas |
| 5 | Caja y cobros: apertura/cierre, `register_payment`, pagos parciales, recibos internos, anulación | Doble envío con la misma clave = 1 pago; efectivo sólo con caja abierta; arqueo cuadra |
| 6 | Egresos | Egreso en efectivo descuenta caja; categorías |
| 7 | Profesores: ficha, reglas fijo/variable/mixto, disponibilidad, asignación de alumnos | Vigencias sin solapamiento |
| 8 | Reservas: agenda, crédito vs cobro, cancelación, asistencia | Dos reservas simultáneas al mismo horario → sólo una se confirma |
| 9 | Liquidaciones y pagos a profesores | Una sesión no se liquida dos veces; anulación libera sesiones |
| 10 | Inventario y ventas | Stock nunca negativo; venta = stock + cobro + caja consistentes |
| 11 | Portal del alumno y del entrenador (Etapa 1) | Alumno ve sólo lo propio; reserva desde el teléfono |
| 12 | Dashboard y reportes | KPIs consultados en vivo; sin datos inventados |
| 13 | Pruebas de permisos (pgTAP), regresión, respaldo y documentación de despliegue | Suite verde; guía de restauración |

---

## 8. Riesgos técnicos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Cobros duplicados por doble clic/reintento | `idempotency_key` único + botón deshabilitado mientras envía |
| Reservas simultáneas | Exclusion constraint en PostgreSQL (no sólo validación visual) |
| Liquidar dos veces la misma sesión | Índice único parcial en ítems de liquidación no anulada |
| Stock negativo por concurrencia | `select … for update` + `check (stock >= 0)` |
| Manipulación de importes desde el navegador | Precios, descuentos y honorarios calculados en RPC; el cliente sólo envía IDs |
| Escalamiento de privilegios | Roles en tabla protegida, asignación sólo por RPC de admin, auditoría |
| Filtración de datos entre perfiles | RLS en todas las tablas + pruebas de permisos por rol |
| Errores de zona horaria (Paraguay) | `timestamptz` + `app.today()` en America/Asuncion; fechas de negocio en `date` |
| Pérdida de datos | Backups diarios de Supabase (plan Pro: PITR recomendado) + `pg_dump` documentado |
| Secretos expuestos | Sólo `anon key` en Netlify; `service_role` sólo en Edge Functions |
| Cron ejecutado dos veces | Funciones idempotentes por restricciones únicas |
| Facturación electrónica futura | Cargos/pagos/ventas conservan concepto, fecha, importe e IDs; integración SIFEN recién en Etapa 3 |
