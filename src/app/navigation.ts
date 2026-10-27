import type { LucideIcon } from 'lucide-react'
import { Building2, History, UserRound, Users } from 'lucide-react'
import type { AppRole } from '@/types/domain'

export interface NavItem {
  label: string
  to: string
  icon: LucideIcon
  roles: AppRole[] | 'any'
}

export interface NavSection {
  title: string
  items: NavItem[]
}

// Sólo se listan módulos IMPLEMENTADOS. Cada incremento agrega sus entradas aquí.
export const NAV_SECTIONS: NavSection[] = [
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
    items: [{ label: 'Mi perfil', to: '/cuenta', icon: UserRound, roles: 'any' }],
  },
]

export function visibleSections(hasRole: (...r: AppRole[]) => boolean): NavSection[] {
  return NAV_SECTIONS.map((s) => ({
    ...s,
    items: s.items.filter((i) => i.roles === 'any' || hasRole(...i.roles)),
  })).filter((s) => s.items.length > 0)
}

/** Primera pantalla útil según los roles del usuario. */
export function homePathFor(hasRole: (...r: AppRole[]) => boolean): string {
  if (hasRole('admin')) return '/admin/usuarios'
  if (hasRole('accountant')) return '/admin/auditoria'
  return '/cuenta'
}
