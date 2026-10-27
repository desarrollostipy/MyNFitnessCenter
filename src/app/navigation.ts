import type { LucideIcon } from 'lucide-react'
import {
  BadgeDollarSign,
  Landmark,
  Wallet,
  Building2,
  CreditCard,
  Dumbbell,
  GraduationCap,
  History,
  IdCard,
  Inbox,
  ReceiptText,
  UserRound,
  Users,
  UsersRound,
} from 'lucide-react'
import type { AppRole } from '@/types/domain'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles: AppRole[] | 'any'
  /** Prioridad en la barra inferior del celular (menor = antes). Sin valor: sólo en "Más". */
  mobile?: number
  /** Etiqueta corta para la barra inferior. */
  short?: string
}

export interface NavSection {
  title: string
  items: NavItem[]
}

// Sólo se listan módulos IMPLEMENTADOS. Cada incremento agrega sus entradas aquí.
export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Caja',
    items: [
      { label: 'Cobrar cuota', to: '/caja/cobrar', icon: Wallet, roles: ['admin', 'treasurer'], mobile: 0, short: 'Cobrar' },
      { label: 'Caja', to: '/caja', icon: Landmark, roles: ['admin', 'treasurer'], mobile: 4 },
      { label: 'Cobranzas', to: '/admin/cobros', icon: BadgeDollarSign, roles: ['admin', 'accountant', 'treasurer'] },
    ],
  },
  {
    title: 'Gestión',
    items: [
      { label: 'Alumnos', to: '/admin/alumnos', icon: UsersRound, roles: ['admin', 'accountant', 'treasurer'], mobile: 1 },
      { label: 'Cuotas', to: '/admin/cuotas', icon: ReceiptText, roles: ['admin', 'accountant', 'treasurer'], mobile: 2 },
      { label: 'Entrenadores', to: '/admin/entrenadores', icon: GraduationCap, roles: ['admin'] },
    ],
  },
  {
    title: 'Entrenador',
    items: [{ label: 'Mis alumnos', to: '/entrenador/alumnos', icon: UsersRound, roles: ['trainer'], mobile: 1, short: 'Alumnos' }],
  },
  {
    title: 'Comercial',
    items: [{ label: 'Prospectos', to: '/admin/prospectos', icon: Inbox, roles: ['admin', 'treasurer'], mobile: 3 }],
  },
  {
    title: 'Catálogo',
    items: [
      { label: 'Planes', to: '/admin/planes', icon: IdCard, roles: ['admin'] },
      { label: 'Servicios', to: '/admin/servicios', icon: Dumbbell, roles: ['admin'] },
      { label: 'Medios de pago', to: '/admin/medios-de-pago', icon: CreditCard, roles: ['admin'] },
    ],
  },
  {
    title: 'Administración',
    items: [
      { label: 'Usuarios', to: '/admin/usuarios', icon: Users, roles: ['admin'] },
      { label: 'Auditoría', to: '/admin/auditoria', icon: History, roles: ['admin', 'accountant'] },
      { label: 'Configuración', to: '/admin/configuracion', icon: Building2, roles: ['admin'] },
    ],
  },
  {
    title: 'Mi cuenta',
    items: [{ label: 'Mi perfil', to: '/cuenta', icon: UserRound, roles: 'any', mobile: 9, short: 'Perfil' }],
  },
]

export function visibleSections(hasRole: (...r: AppRole[]) => boolean): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles === 'any' || hasRole(...i.roles)),
  })).filter((s) => s.items.length > 0)
}

/** Accesos de la barra inferior en el celular (máximo 4; el resto va en "Más"). */
export function mobileItems(hasRole: (...r: AppRole[]) => boolean): NavItem[] {
  return visibleSections(hasRole)
    .flatMap((s) => s.items)
    .filter((i) => i.mobile !== undefined)
    .sort((a, b) => a.mobile! - b.mobile!)
    .slice(0, 4)
}

/** Primera pantalla útil según los roles del usuario. */
export function homePathFor(hasRole: (...r: AppRole[]) => boolean): string {
  if (hasRole('admin', 'treasurer', 'accountant')) return '/admin/alumnos'
  if (hasRole('trainer')) return '/entrenador/alumnos'
  return '/cuenta'
}
