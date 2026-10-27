// Tipos de dominio. Cuando el proyecto Supabase esté enlazado, complementar con
// `npx supabase gen types typescript --linked > src/types/database.ts`.

export type AppRole = 'admin' | 'accountant' | 'treasurer' | 'trainer' | 'student' | 'prospect'

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  accountant: 'Contador',
  treasurer: 'Tesorero',
  trainer: 'Entrenador',
  student: 'Alumno',
  prospect: 'Futuro alumno',
}

export const ALL_ROLES: AppRole[] = ['admin', 'accountant', 'treasurer', 'trainer', 'student', 'prospect']

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
}

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

export type PlanType = 'monthly' | 'quarterly' | 'annual' | 'sessions' | 'custom'

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  monthly: 'Mensual',
  quarterly: 'Trimestral',
  annual: 'Anual',
  sessions: 'Por sesiones',
  custom: 'Personalizado',
}

/** Duración fija en meses para los tipos estándar. */
export const FIXED_PLAN_MONTHS: Partial<Record<PlanType, number>> = { monthly: 1, quarterly: 3, annual: 12 }

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
  lead_id: string | null
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
