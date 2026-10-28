// Tipos de dominio. Cuando el proyecto Supabase esté enlazado, complementar con
// `npx supabase gen types typescript --linked > src/types/database.ts`.

export type AppRole = 'admin' | 'accountant' | 'treasurer' | 'cashier' | 'trainer' | 'student' | 'prospect'

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  accountant: 'Contador',
  treasurer: 'Tesorero',
  cashier: 'Cajero',
  trainer: 'Entrenador',
  student: 'Alumno',
  prospect: 'Futuro alumno',
}

export const ALL_ROLES: AppRole[] = ['admin', 'accountant', 'treasurer', 'cashier', 'trainer', 'student', 'prospect']

/** Atienden el mostrador: caja, cobros, venta rápida e ingreso. */
export const FRONT_DESK_ROLES: AppRole[] = ['admin', 'treasurer', 'cashier']

export interface UserProfile {
  id: string
  full_name: string
  phone: string | null
  avatar_path: string | null
}

export interface Gym {
  id: string
  name: string
  legal_name: string | null
  ruc: string | null
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  currency: string
  fiscal_timbrado: string | null
  fiscal_timbrado_from: string | null
  fiscal_establishment: string | null
  fiscal_point: string | null
  fiscal_activity: string | null
  fiscal_transaction_type: string
  module_training: boolean
  module_achievements: boolean
  module_ranking: boolean
}

/** Módulos opcionales del portal del alumno (los activa el administrador). */
export type GymModule = 'training' | 'achievements' | 'ranking'

export interface AdminUserRow {
  user_id: string
  email: string
  full_name: string
  phone: string | null
  roles: AppRole[]
  last_sign_in_at: string | null
  created_at: string
}

export interface Service {
  id: string
  gym_id: string
  name: string
  description: string | null
  duration_minutes: number
  price: number
  capacity: number
  is_bookable: boolean
  is_commissionable: boolean
  cancellation_hours: number
  no_show_consumes_credit: boolean
  is_public: boolean
  is_active: boolean
  sort_order: number
}

export type PlanType = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual' | 'sessions' | 'custom'

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  daily: 'Pase diario',
  weekly: 'Pase semanal',
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
  sessions: 'Por sesiones',
  custom: 'Personalizado',
}

/** Duración fija en meses para los tipos estándar. */
export const FIXED_PLAN_MONTHS: Partial<Record<PlanType, number>> = { monthly: 1, quarterly: 3, annual: 12 }

/** Duración fija en días de los pases cortos; no se renuevan automáticamente. */
export const FIXED_PLAN_DAYS: Partial<Record<PlanType, number>> = { daily: 1, weekly: 7 }

export interface MembershipPlan {
  id: string
  gym_id: string
  name: string
  description: string | null
  plan_type: PlanType
  price: number
  duration_months: number | null
  duration_days: number | null
  included_sessions: number
  included_service_id: string | null
  benefits: string[]
  conditions: string | null
  is_public: boolean
  is_active: boolean
  sort_order: number
}

export interface PaymentMethod {
  id: string
  gym_id: string
  code: string
  name: string
  affects_cash: boolean
  is_active: boolean
  sort_order: number
}

export type LeadInterest = 'info' | 'enrollment' | 'trial_class'
export type LeadStatus = 'new' | 'contacted' | 'converted' | 'lost'

export const LEAD_INTEREST_LABELS: Record<LeadInterest, string> = {
  info: 'Consulta',
  enrollment: 'Inscripción',
  trial_class: 'Clase de prueba',
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  converted: 'Convertido',
  lost: 'Perdido',
}

export interface Lead {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  interest: LeadInterest
  plan_id: string | null
  service_id: string | null
  preferred_date: string | null
  message: string | null
  status: LeadStatus
  internal_notes: string | null
  contacted_at: string | null
  student_id: string | null
  created_at: string
  membership_plans: { name: string } | null
  services: { name: string } | null
}

export type StudentStatus = 'active' | 'inactive'

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: 'Activo',
  inactive: 'Inactivo',
}

export interface Student {
  id: string
  gym_id: string
  user_id: string | null
  first_name: string
  last_name: string
  document_number: string
  birth_date: string | null
  phone: string | null
  email: string | null
  address: string | null
  enrolled_on: string
  status: StudentStatus
  status_reason: string | null
  status_changed_at: string | null
  photo_path: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  billing_ruc: string | null
  billing_name: string | null
  lead_id: string | null
  ranking_opt_out: boolean
  created_at: string
}

export interface Trainer {
  id: string
  gym_id: string
  user_id: string | null
  first_name: string
  last_name: string
  document_number: string | null
  phone: string | null
  email: string | null
  specialties: string | null
  is_active: boolean
}

export interface TrainerAssignment {
  id: string
  trainer_id: string
  student_id: string
  starts_on: string
  ends_on: string | null
  trainers: Pick<Trainer, 'first_name' | 'last_name' | 'is_active'> | null
}

export type SubscriptionStatus = 'active' | 'cancelled' | 'expired'
export type ChargeStatus = 'pending' | 'partial' | 'paid' | 'overdue' | 'voided'

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Vigente',
  cancelled: 'Cancelada',
  expired: 'Vencida',
}

export const CHARGE_STATUS_LABELS: Record<ChargeStatus, string> = {
  pending: 'Pendiente',
  partial: 'Parcial',
  paid: 'Pagado',
  overdue: 'Vencido',
  voided: 'Anulado',
}

export interface Subscription {
  id: string
  student_id: string
  plan_id: string
  plan_name: string
  duration_months: number | null
  duration_days: number | null
  included_sessions: number
  price_agreed: number
  discount_amount: number
  discount_reason: string | null
  status: SubscriptionStatus
  auto_renew: boolean
  starts_on: string
  ends_on: string
  cancelled_at: string | null
  cancel_reason: string | null
  subscription_pauses: { from_date: string; to_date: string; reason: string }[]
}

export interface Charge {
  id: string
  student_id: string
  source: 'membership' | 'booking' | 'sale' | 'other'
  concept: string
  amount: number
  discount: number
  total: number
  paid_amount: number
  due_on: string
  status: ChargeStatus
  void_reason: string | null
  students?: { first_name: string; last_name: string; document_number: string } | null
}

export interface MembershipStatusRow {
  student_id: string
  active_until: string | null
  active_subscriptions: number
  paused_today: boolean
  overdue_amount: number
  open_amount: number
  oldest_overdue_on: string | null
}

export interface CashSession {
  id: string
  business_date: string
  status: 'open' | 'closed'
  opened_by: string
  opened_at: string
  opening_amount: number
  closed_by: string | null
  closed_at: string | null
  expected_amount: number | null
  counted_amount: number | null
  difference: number | null
  close_notes: string | null
}

export type CashSource = 'payment' | 'payment_void' | 'expense' | 'payout' | 'adjustment'

export const CASH_SOURCE_LABELS: Record<CashSource, string> = {
  payment: 'Cobro',
  payment_void: 'Anulación de cobro',
  expense: 'Egreso',
  payout: 'Pago a profesor',
  adjustment: 'Movimiento manual',
}

export interface CashMovement {
  id: string
  direction: 'in' | 'out'
  amount: number
  source: CashSource
  source_id: string | null
  note: string | null
  created_at: string
}

export interface Payment {
  id: string
  student_id: string
  method_id: string
  amount: number
  paid_at: string
  reference: string | null
  notes: string | null
  receipt_number: string
  status: 'posted' | 'voided'
  void_reason: string | null
  voided_at: string | null
  students?: { first_name: string; last_name: string; document_number: string; phone: string | null; email: string | null } | null
  payment_methods?: { name: string; affects_cash: boolean } | null
  invoices?: Pick<Invoice, 'id' | 'invoice_number' | 'status' | 'cdc'>[]
}

// ---------------------------------------------------------------------
// Facturación electrónica (Etapa A: se emite en e-Kuatia y se registra el CDC)
// ---------------------------------------------------------------------
export type InvoiceStatus = 'issued' | 'cancelled' | 'credited'
export type InvoiceReceiver = 'ruc' | 'ci' | 'foreign' | 'anonymous'

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  issued: 'Vigente',
  cancelled: 'Cancelada',
  credited: 'Con nota de crédito',
}

/** Cómo se carga el receptor en el facturador de la DNIT. */
export const INVOICE_RECEIVER_LABELS: Record<InvoiceReceiver, string> = {
  ruc: 'Contribuyente (RUC)',
  ci: 'No contribuyente · Cédula paraguaya',
  foreign: 'No contribuyente · Documento extranjero',
  anonymous: 'Innominado (consumidor final)',
}

export interface InvoiceItem {
  description: string
  amount: number
  iva10: number
}

export interface Invoice {
  id: string
  payment_id: string
  cdc: string
  invoice_number: string
  issued_on: string
  receiver_kind: InvoiceReceiver
  receiver_document: string | null
  receiver_name: string
  total: number
  iva10: number
  items: InvoiceItem[]
  status: InvoiceStatus
  cancelled_at: string | null
  cancel_reason: string | null
  credit_note_cdc: string | null
  created_at: string
}

export interface InvoiceDraft {
  payment: { id: string; receipt_number: string; paid_at: string; amount: number; status: 'posted' | 'voided' }
  emitter: {
    legal_name: string | null
    ruc: string | null
    timbrado: string | null
    establishment: string | null
    point: string | null
    transaction_type: string
  }
  receiver: { kind: InvoiceReceiver; document: string | null; name: string; email: string | null; phone: string | null }
  has_ci: boolean
  items: InvoiceItem[]
  total: number
  iva10: number
  missing: string[]
}

export interface ExpenseCategory {
  id: string
  name: string
  is_active: boolean
  sort_order: number
}

export interface Expense {
  id: string
  category_id: string
  description: string
  amount: number
  method_id: string
  paid_on: string
  supplier: string | null
  document_ref: string | null
  status: 'posted' | 'voided'
  void_reason: string | null
  created_at: string
  expense_categories?: { name: string } | null
  payment_methods?: { name: string } | null
}

export interface DashboardSummary {
  period: { from: string; to: string; prev_from: string; prev_to: string; today: string }
  students: { total: number; active: number; inactive: number; new: number; new_prev: number; with_access: number; without_membership: number }
  memberships: { expiring_7d: number; expired_period: number; cancelled_period: number }
  receivables: { open: number; overdue: number; debtors: number }
  collections: { today: number; period: number; prev: number; count: number; by_method: { name: string; amount: number }[] }
  expenses: { period: number; prev: number; by_category: { name: string; amount: number }[] }
  daily: { date: string; collections: number; expenses: number }[]
  leads: { new: number; pending: number; converted: number }
  trainers_active: number
}

export const fullName = (p: { first_name: string; last_name: string }) => `${p.first_name} ${p.last_name}`

export interface AuditLog {
  id: number
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  before: unknown
  after: unknown
  reason: string | null
  created_at: string
}

// ---------------------------------------------------------------------
// Recepción: control de ingreso y venta rápida
// ---------------------------------------------------------------------
export type AccessIssue = 'inactive' | 'no_membership' | 'paused' | 'overdue'

export const ACCESS_ISSUE_LABELS: Record<AccessIssue, string> = {
  inactive: 'Alumno dado de baja',
  no_membership: 'Sin membresía ni pase vigente hoy',
  paused: 'Membresía en pausa',
  overdue: 'Tiene cuotas vencidas',
}

export interface AccessStatus {
  student_id: string
  ok: boolean
  issues: AccessIssue[]
  active_until: string | null
  plans: string[]
  overdue_amount: number
  open_amount: number
  checked_in_at: string | null
}

export interface CheckIn {
  id: string
  gym_id: string
  student_id: string
  business_date: string
  checked_in_at: string
  source: 'reception' | 'device'
  access_ok: boolean
  issues: AccessIssue[]
  override_reason: string | null
  students?: Pick<Student, 'first_name' | 'last_name' | 'document_number'> | null
}

export interface QuickSaleResult {
  student_id: string
  subscription_id: string
  student_created: boolean
  payment_id: string | null
  check_in: { id: string; already: boolean; checked_in_at: string; access_ok: boolean } | null
}
