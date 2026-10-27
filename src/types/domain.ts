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
