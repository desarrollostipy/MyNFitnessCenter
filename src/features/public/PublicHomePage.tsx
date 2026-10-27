import { Link } from 'react-router-dom'
import { Brand } from '@/components/Brand'
import { Button } from '@/components/ui/button'

// Planes, servicios y formulario de contacto se agregan en el Incremento 2.
export function PublicHomePage() {
  return (
    <div className="flex min-h-full flex-col bg-graphite text-smoke">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Brand dark className="text-lg" />
        <Button asChild variant="accent" size="sm">
          <Link to="/login">Ingresar</Link>
        </Button>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 pb-24 sm:px-6">
        <p className="mb-4 text-sm font-medium uppercase tracking-widest text-lime">Asunción · Paraguay</p>
        <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Entrená con método. Medí tu progreso.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-smoke/70">
          Membresías, entrenamiento personalizado y seguimiento profesional en MyN Fitness.
        </p>
        <div className="mt-10">
          <Button asChild variant="accent" size="lg">
            <Link to="/login">Acceder a mi cuenta</Link>
          </Button>
        </div>
      </main>
    </div>
  )
}
