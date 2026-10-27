import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { LogOut, Menu, X } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { visibleSections } from '@/app/navigation'
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
                        isActive ? 'bg-white/10 text-lime' : 'text-smoke/80 hover:bg-white/5 hover:text-smoke',
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
      <aside className="hidden w-64 shrink-0 lg:block">
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
        <header className="flex h-14 items-center gap-3 border-b border-border bg-card px-4 lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-2 hover:bg-muted" aria-label="Abrir menú">
            <Menu className="size-5" />
          </button>
          <Brand />
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
