import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePublicPlans } from './api'
import { PlanCard } from './PlanCard'

export function PublicHomePage() {
  const plans = usePublicPlans()
  const featured = (plans.data ?? []).slice(0, 3)

  return (
    <>
      <section className="bg-graphite text-smoke">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-lime">Asunción · Paraguay</p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-tight tracking-tight sm:text-6xl">
            Entrená con método. Medí tu progreso.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-smoke/70">
            Membresías, entrenamiento personalizado y seguimiento profesional en MyN Fitness.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link to="/contacto?tipo=clase_prueba">Reservar clase de prueba</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/20 bg-transparent text-smoke hover:bg-white/10">
              <Link to="/planes">Ver planes</Link>
            </Button>
          </div>
        </div>
      </section>

      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="mb-8 flex items-end justify-between gap-4">
            <h2 className="text-2xl font-semibold tracking-tight">Planes</h2>
            <Link to="/planes" className="text-sm text-muted-foreground hover:text-foreground hover:underline">
              Ver todos
            </Link>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {featured.map((p) => (
              <PlanCard key={p.id} plan={p} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}
