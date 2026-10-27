import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { formatPYG } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { usePublicPlans, usePublicServices } from './api'
import { PlanCard } from './PlanCard'

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>
      <div className="mt-10">{children}</div>
    </section>
  )
}

export function PublicPlansPage() {
  const plans = usePublicPlans()
  return (
    <Section title="Planes" description="Elegí el plan que mejor se adapte a tus objetivos. Te contactamos para completar la inscripción.">
      {plans.isLoading ? (
        <LoadingState />
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : !plans.data?.length ? (
        <EmptyState
          title="Planes en preparación"
          description="Escribinos y te informamos las opciones disponibles."
          action={
            <Button asChild className="mt-2">
              <Link to="/contacto">Consultar</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {plans.data.map((p) => (
            <PlanCard key={p.id} plan={p} showConditions />
          ))}
        </div>
      )}
    </Section>
  )
}

export function PublicServicesPage() {
  const services = usePublicServices()
  return (
    <Section title="Servicios" description="Sesiones de entrenamiento con profesores. Consultá disponibilidad o reservá una clase de prueba.">
      {services.isLoading ? (
        <LoadingState />
      ) : services.isError ? (
        <ErrorState error={services.error} onRetry={() => services.refetch()} />
      ) : !services.data?.length ? (
        <EmptyState title="Servicios en preparación" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.data.map((s) => (
            <article key={s.id} className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <h3 className="text-lg font-semibold">{s.name}</h3>
                <span className="whitespace-nowrap font-semibold tabular-nums">{formatPYG(s.price)}</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <Clock className="size-4" /> {s.duration_minutes} minutos
              </p>
              {s.description && <p className="mt-3 flex-1 text-sm">{s.description}</p>}
              <Button asChild variant="outline" className="mt-5 self-start">
                <Link to={`/contacto?tipo=clase_prueba&servicio=${s.id}`}>Solicitar clase de prueba</Link>
              </Button>
            </article>
          ))}
        </div>
      )}
    </Section>
  )
}
