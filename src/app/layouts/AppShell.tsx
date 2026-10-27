import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { mobileItems, visibleSections } from '@/app/navigation'
import { Brand } from '@/components/Brand'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/types/domain'

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { hasRole, profile, session, roles, signOut } = useAuth()
  const sections = visibleSections(hasRole)

  return (
    <div className="flex h-full flex-col bg-graphite text-smoke">
      <div className="px-5 py-5">
        <Brand dark />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Menú principal">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors',
                        isActive ? 'bg-white/10 text-brand' : 'text-smoke/80 hover:bg-white/5 hover:text-smoke',
                      )
                    }
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-4">
        <p className="truncate text-sm font-medium">{profile?.full_name || session?.user.email}</p>
        <p className="truncate text-xs text-neutral">
          {roles.length ? roles.map((r) => ROLE_LABELS[r]).join(' · ') : 'Sin perfil asignado'}
        </p>
        <button
          onClick={signOut}
          className="mt-3 flex items-center gap-2 text-sm text-smoke/70 hover:text-smoke"
        >
          <LogOut className="size-4" /> Cerrar sesión
        </button>
      </div>
    </div>
  )
}

export function AppShell() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 lg:block print:hidden">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-graphite/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 shadow-xl">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
          <button
            className="absolute right-4 top-4 rounded-md bg-card p-2"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 pt-[env(safe-area-inset-top)] lg:hidden print:hidden">
          <Brand />
        </header>
        <main className="flex-1 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0 print:overflow-visible print:pb-0">
          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav onMore={() => setOpen(true)} />
    </div>
  )
}

/** Barra inferior en el celular: accesos principales del perfil + "Más" abre el menú completo. */
function BottomNav({ onMore }: { onMore: () => void }) {
  const { hasRole } = useAuth()
  const items = mobileItems(hasRole)
  const tab = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium'

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden"
      aria-label="Accesos rápidos"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => cn(tab, isActive ? 'text-graphite' : 'text-muted-foreground')}
        >
          {({ isActive }) => (
            <>
              <span className={cn('rounded-full px-4 py-1', isActive && 'bg-accent text-accent-foreground')}>
                <item.icon className="size-5" />
              </span>
              <span className="truncate">{item.short ?? item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onMore} className={cn(tab, 'text-muted-foreground')} aria-label="Más opciones">
        <span className="px-4 py-1">
          <Menu className="size-5" />
        </span>
        Más
      </button>
    </nav>
  )
}
