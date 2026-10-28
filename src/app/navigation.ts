import type { LucideIcon } from 'lucide-react'
import {
  CalendarClock,
  Home,
  LayoutDashboard,
  Receipt,
  BadgeDollarSign,
  Landmark,
  Wallet,
  Building2,
  CreditCard,
  DoorOpen,
  Dumbbell,
  Flame,
  ShoppingBag,
  GraduationCap,
  History,
  IdCard,
  Inbox,
  ReceiptText,
  Router,
  ShieldCheck,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react'
import { FRONT_DESK_ROLES, type AppRole, type FeatureKey } from '@/types/domain'
import type { MyFeatures } from '@/features/platform/api'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  /** 'superadmin': sólo el proveedor de la plataforma. */
  roles: AppRole[] | 'any' | 'superadmin'
  /** Prioridad en la barra inferior del celular (menor = antes). Sin valor: sólo en "Más". */
  mobile?: number
  /** Etiqueta corta para la barra inferior. */
  short?: string
  /** Función que el super admin puede apagar (si está apagada para el usuario, no se muestra). */
  feature?: FeatureKey
}

export interface NavSection {
  title: string
  items: NavItem[]
}

// Sólo se listan módulos IMPLEMENTADOS. Cada incremento agrega sus entradas aquí.
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Resumen',
    items: [{ label: 'Dashboard', to: '/admin/dashboard', icon: LayoutDashboard, roles: ['admin', 'accountant'], mobile: 0.5, short: 'Inicio', feature: 'dashboard' }],
  },
  {
    title: 'Recepción',
    items: [
      { label: 'Control de ingreso', to: '/ingreso', icon: DoorOpen, roles: FRONT_DESK_ROLES, mobile: 0, short: 'Ingreso', feature: 'checkin' },
      { label: 'Venta rápida', to: '/caja/venta-rapida', icon: ShoppingBag, roles: FRONT_DESK_ROLES, mobile: 0.2, short: 'Vender', feature: 'quick_sale' },
      // Vista previa (próxima etapa): la pantalla lo indica y no tiene controles activos.
      { label: 'Molinete (vista previa)', to: '/admin/molinete', icon: Router, roles: ['admin'], feature: 'turnstile' },
    ],
  },
  {
    title: 'Caja',
    items: [
      { label: 'Cobrar cuota', to: '/caja/cobrar', icon: Wallet, roles: FRONT_DESK_ROLES, mobile: 0.4, short: 'Cobrar', feature: 'collect' },
      { label: 'Caja', to: '/caja', icon: Landmark, roles: FRONT_DESK_ROLES, mobile: 4, feature: 'cash' },
      { label: 'Cobranzas', to: '/admin/cobros', icon: BadgeDollarSign, roles: ['admin', 'accountant', 'treasurer'], feature: 'payments' },
      { label: 'Egresos', to: '/admin/egresos', icon: Receipt, roles: ['admin', 'accountant', 'treasurer'], feature: 'expenses' },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { label: 'Alumnos', to: '/admin/alumnos', icon: UsersRound, roles: ['admin', 'accountant', 'treasurer'], mobile: 1, feature: 'students' },
      { label: 'Cuotas', to: '/admin/cuotas', icon: ReceiptText, roles: ['admin', 'accountant', 'treasurer'], mobile: 2, feature: 'memberships' },
      { label: 'Entrenadores', to: '/admin/entrenadores', icon: GraduationCap, roles: ['admin'], feature: 'trainers' },
    ],
  },
  {
    title: 'Mi M&N',
    items: [
      { label: 'Inicio', to: '/mi', icon: Home, roles: ['student'], mobile: 1 },
      { label: 'Mis entrenamientos', to: '/mi/entrenamientos', icon: Flame, roles: ['student'], mobile: 1.5, short: 'Entrenos', feature: 'portal_training' },
      { label: 'Mi membresía', to: '/mi/membresia', icon: CalendarClock, roles: ['student'], mobile: 2, short: 'Membresía', feature: 'portal_membership' },
      { label: 'Mis recibos', to: '/mi/pagos', icon: ReceiptText, roles: ['student'], mobile: 3, short: 'Recibos', feature: 'portal_receipts' },
    ],
  },
  {
    title: 'Entrenador',
    items: [{ label: 'Mis alumnos', to: '/entrenador/alumnos', icon: UsersRound, roles: ['trainer'], mobile: 1, short: 'Alumnos', feature: 'trainer_students' }],
  },
  {
    title: 'Comercial',
    items: [{ label: 'Prospectos', to: '/admin/prospectos', icon: Inbox, roles: ['admin', 'treasurer'], mobile: 3, feature: 'leads' }],
  },
  {
    title: 'Catálogo',
    items: [
      { label: 'Planes', to: '/admin/planes', icon: IdCard, roles: ['admin'], feature: 'catalog' },
      { label: 'Servicios', to: '/admin/servicios', icon: Dumbbell, roles: ['admin'], feature: 'catalog' },
      { label: 'Medios de pago', to: '/admin/medios-de-pago', icon: CreditCard, roles: ['admin'], feature: 'catalog' },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Usuarios', to: '/admin/usuarios', icon: Users, roles: ['admin'], feature: 'users' },
      { label: 'Auditoría', to: '/admin/auditoria', icon: History, roles: ['admin', 'accountant'], feature: 'audit' },
      { label: 'Configuración', to: '/admin/configuracion', icon: Building2, roles: ['admin'], feature: 'settings' },
    ],
  },
  {
    title: 'Plataforma',
    items: [{ label: 'Control de funciones', to: '/plataforma/funciones', icon: ShieldCheck, roles: 'superadmin' }],
  },
  {
    title: 'Mi cuenta',
    items: [{ label: 'Mi perfil', to: '/cuenta', icon: UserRound, roles: 'any', mobile: 9, short: 'Perfil' }],
  },
]

type HasRole = (...r: AppRole[]) => boolean

function canSee(i: NavItem, hasRole: HasRole, features: MyFeatures) {
  if (i.roles === 'superadmin') return features.superadmin
  if (i.roles !== 'any' && !hasRole(...i.roles)) return false
  return !i.feature || features.has(i.feature)
}

export function visibleSections(hasRole: HasRole, features: MyFeatures): NavSection[] {
  return NAV_SECTIONS.map((s) => ({ ...s, items: s.items.filter((i) => canSee(i, hasRole, features)) })).filter((s) => s.items.length > 0)
}

/** Accesos de la barra inferior en el celular (máximo 4; el resto va en "Más"). */
export function mobileItems(hasRole: HasRole, features: MyFeatures): NavItem[] {
  return visibleSections(hasRole, features)
    .flatMap((s) => s.items)
    .filter((i) => i.mobile !== undefined)
    .sort((a, b) => a.mobile! - b.mobile!)
    .slice(0, 4)
}

/** Primera pantalla útil según los roles del usuario. */
export function homePathFor(hasRole: HasRole): string {
  if (hasRole('admin', 'accountant')) return '/admin/dashboard'
  if (hasRole('treasurer', 'cashier')) return '/ingreso'
  if (hasRole('trainer')) return '/entrenador/alumnos'
  if (hasRole('student')) return '/mi'
  return '/cuenta'
}
