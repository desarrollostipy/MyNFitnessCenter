import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { usePublicPlans } from './api'
import { PlanCard } from './PlanCard'

export function PublicHomePage() {
  const plans = usePublicPlans()
  const featured = (plans.data ?? []).slice(0, 3)

  return (
    <>
      <section className="text-smoke">
        <div className="mx-auto max-w-6xl px-4 pb-24 pt-16 sm:px-6 sm:pt-24">
          <p className="mb-4 text-sm font-medium uppercase tracking-widest text-brand">Itauguá · Paraguay</p>
          <h1 className="max-w-2xl text-4xl font-black uppercase leading-none tracking-tight sm:text-7xl">
            <span className="text-brand">Entrenar es</span> invertir <span className="text-brand">en tu salud</span>
          </h1>
          <div className="mt-6 h-1 w-24 rounded-full bg-brand" aria-hidden />
          <p className="mt-6 max-w-xl text-lg text-smoke/70">
            Movimiento, constancia y hábitos que marcan la diferencia. Membresías y entrenamiento personalizado en M&amp;N
            Fitness.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild variant="accent" size="lg">
              <Link to="/contacto?tipo=clase_prueba">Reservar clase de prueba</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="text-smoke">
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
