import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const LINKS = [
  { to: '/planes', label: 'Planes' },
  { to: '/servicios', label: 'Servicios' },
  { to: '/contacto?tipo=clase_prueba', label: 'Clase de prueba' },
  { to: '/contacto?tipo=inscripcion', label: 'Inscripción' },
  { to: '/contacto', label: 'Contacto' },
]

export function PublicLayout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="sticky top-0 z-30 bg-graphite text-smoke">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="Inicio">
            <Brand dark className="text-lg" />
          </Link>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Sitio">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end
                className={({ isActive }) => cn('text-sm', isActive ? 'text-brand' : 'text-smoke/75 hover:text-smoke')}
              >
                {l.label}
              </NavLink>
            ))}
            <Button asChild variant="accent" size="sm">
              <Link to="/login">Ingresar</Link>
            </Button>
          </nav>
          <button className="rounded-md p-2 md:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menú" aria-expanded={open}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
        {open && (
          <nav className="border-t border-white/10 px-4 pb-4 md:hidden" aria-label="Sitio móvil">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block py-3 text-smoke/85">
                {l.label}
              </Link>
            ))}
            <Button asChild variant="accent" className="mt-2 w-full">
              <Link to="/login" onClick={() => setOpen(false)}>
                Ingresar
              </Link>
            </Button>
          </nav>
        )}
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <Brand />
          <span>Itauguá, Paraguay</span>
        </div>
      </footer>
    </div>
  )
}
