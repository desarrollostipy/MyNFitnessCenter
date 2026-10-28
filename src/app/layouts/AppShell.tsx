import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { mobileItems, visibleSections } from '@/app/navigation'
import { useModules } from '@/features/settings/api'
import { Brand } from '@/components/Brand'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/types/domain'
import { accountLabel } from '@/lib/ciAuth'

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { hasRole, profile, session, roles, signOut } = useAuth()
  const sections = visibleSections(hasRole, useModules())

  return (
    <div className="glass flex h-full flex-col rounded-3xl text-smoke">
      <div className="px-5 py-5">
        <Brand dark />
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3" aria-label="Menú principal">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral">
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
                        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                        isActive ? 'bg-white/12 font-semibold text-smoke [&_svg]:text-brand' : 'text-smoke/65 hover:bg-white/5 hover:text-smoke',
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
        <p className="truncate text-sm font-medium">{profile?.full_name || accountLabel(session?.user.email)}</p>
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
      <aside className="hidden w-64 shrink-0 p-3 pr-0 lg:block print:hidden">
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 p-2 [&>div]:bg-popover">
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
          <button
            className="glass absolute right-4 top-4 rounded-full p-2"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X className="size-5" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/50 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden print:hidden">
          <Brand />
        </header>
        <main className="flex-1 overflow-y-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] lg:pb-0 print:overflow-visible print:pb-0">
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
  const items = mobileItems(hasRole, useModules())
  const tab = 'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-colors'

  return (
    <nav
      className="glass fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-30 flex rounded-full bg-popover/70 p-1.5 lg:hidden print:hidden"
      aria-label="Accesos rápidos"
    >
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => cn(tab, isActive ? 'bg-white/12 text-foreground' : 'text-muted-foreground')}
        >
          {({ isActive }) => (
            <>
              <span className={cn('rounded-full px-3 py-0.5', isActive && 'text-brand')}>
                <item.icon className="size-5" />
              </span>
              <span className="truncate">{item.short ?? item.label}</span>
            </>
          )}
        </NavLink>
      ))}
      <button onClick={onMore} className={cn(tab, 'text-muted-foreground')} aria-label="Más opciones">
        <span className="px-3 py-0.5">
          <Menu className="size-5" />
        </span>
        Más
      </button>
    </nav>
  )
}
