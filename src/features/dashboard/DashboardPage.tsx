import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate, formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { BarList } from '@/components/BarList'
import { PeriodPicker, periodFor, type Period } from '@/components/PeriodPicker'
import { ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { DashboardSummary } from '@/types/domain'

function useDashboard(gymId: string, period: Period) {
  return useQuery({
    queryKey: ['dashboard', gymId, period.from, period.to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('dashboard_summary', { p_gym_id: gymId, p_from: period.from, p_to: period.to })
      if (error) throw error
      return data as DashboardSummary
    },
  })
}

/** Variación contra el período anterior. Sin base comparable no se muestra porcentaje. */
function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (!previous) return <span className="text-xs text-muted-foreground">Sin datos del período anterior</span>
  const pct = Math.round(((current - previous) / previous) * 100)
  const up = pct > 0
  const good = invert ? !up : up
  const Icon = pct === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', pct === 0 ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive')}>
      <Icon className="size-3.5" />
      {pct > 0 ? '+' : ''}
      {pct}% vs. período anterior
    </span>
  )
}

function Kpi({ label, value, sub, to, emphasis }: { label: string; value: ReactNode; sub?: ReactNode; to?: string; emphasis?: boolean }) {
  const body = (
    <Card className={cn('h-full p-4 transition-colors', to && 'hover:border-graphite/40', emphasis && 'border-graphite')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </Card>
  )
  return to ? (
    <Link to={to} className="block">
      {body}
    </Link>
  ) : (
    body
  )
}

function DailyChart({ data }: { data: DashboardSummary['daily'] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => Number(d.collections)), 1)
  const shown = active !== null ? data[active] : null
  const total = data.reduce((s, d) => s + Number(d.collections), 0)

  return (
    <div>
      <p className="mb-3 h-5 text-sm text-muted-foreground" aria-live="polite">
        {shown ? (
          <>
            {formatDate(shown.date)}: <span className="font-medium text-foreground">{formatPYG(shown.collections)}</span>
          </>
        ) : (
          'Tocá o pasá el mouse sobre una barra para ver el detalle'
        )}
      </p>
      {total === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Sin cobros en el período</p>
      ) : (
        <div className="flex h-40 items-end gap-[2px] border-b border-border" onMouseLeave={() => setActive(null)}>
          {data.map((d, i) => (
            <button
              key={d.date}
              type="button"
              className="group flex h-full min-w-0 flex-1 items-end"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={`${formatDate(d.date)}: ${formatPYG(d.collections)}`}
            >
              <span
                className={cn('w-full rounded-t-[4px] bg-graphite transition-opacity', active !== null && active !== i && 'opacity-40')}
                style={{ height: `${(Number(d.collections) / max) * 100}%`, minHeight: Number(d.collections) > 0 ? 2 : 0 }}
              />
            </button>
          ))}
        </div>
      )}
      {data.length > 1 && (
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
          <span>{formatDate(data[0].date)}</span>
          <span>{formatDate(data[data.length - 1].date)}</span>
        </div>
      )}
      <table className="sr-only">
        <caption>Cobros por día</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th>{formatDate(d.date)}</th>
              <td>{formatPYG(d.collections)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DashboardPage() {
  const { gymId } = useAuth()
  const [period, setPeriod] = useState<Period>(periodFor('month'))
  const q = useDashboard(gymId, period)

  return (
    <>
      <PageHeader title="Dashboard" description="Indicadores reales del gimnasio, calculados en el momento." />
      <PeriodPicker value={period} onChange={setPeriod} />
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <Dashboard d={q.data} />
      )}
    </>
  )
}

function Dashboard({ d }: { d: DashboardSummary }) {
  const net = Number(d.collections.period) - Number(d.expenses.period)
  const prevNet = Number(d.collections.prev) - Number(d.expenses.prev)

  return (
    <div className="space-y-6">
      <section aria-label="Dinero">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Dinero</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            emphasis
            label="Cobrado en el período"
            value={formatPYG(d.collections.period)}
            sub={<Delta current={Number(d.collections.period)} previous={Number(d.collections.prev)} />}
            to="/admin/cobros"
          />
          <Kpi label="Cobrado hoy" value={formatPYG(d.collections.today)} sub={<span className="text-xs text-muted-foreground">{d.collections.count} cobros en el período</span>} />
          <Kpi
            label="Egresos del período"
            value={formatPYG(d.expenses.period)}
            sub={<Delta current={Number(d.expenses.period)} previous={Number(d.expenses.prev)} invert />}
            to="/admin/egresos"
          />
          <Kpi
            label="Resultado (cobrado − egresos)"
            value={<span className={net < 0 ? 'text-destructive' : undefined}>{formatPYG(net)}</span>}
            sub={<Delta current={net} previous={prevNet} />}
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cobros por día</CardTitle>
          </CardHeader>
          <CardContent>
            <DailyChart data={d.daily} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por medio de pago</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={d.collections.by_method} />
          </CardContent>
        </Card>
      </div>

      <section aria-label="Cuentas por cobrar">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Cuentas por cobrar</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <Kpi label="Saldo pendiente total" value={formatPYG(d.receivables.open)} to="/admin/cuotas" />
          <Kpi
            label="Vencido"
            value={<span className={Number(d.receivables.overdue) > 0 ? 'text-destructive' : undefined}>{formatPYG(d.receivables.overdue)}</span>}
            to="/admin/cuotas"
          />
          <Kpi label="Alumnos morosos" value={d.receivables.debtors} to="/admin/cuotas" />
        </div>
      </section>

      <section aria-label="Alumnos">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Alumnos y membresías</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Alumnos activos" value={d.students.active} sub={<span className="text-xs text-muted-foreground">{d.students.inactive} dados de baja</span>} to="/admin/alumnos" />
          <Kpi label="Con membresía vigente hoy" value={d.students.with_access} />
          <Kpi label="Activos sin membresía vigente" value={d.students.without_membership} />
          <Kpi label="Nuevos en el período" value={d.students.new} sub={<Delta current={d.students.new} previous={d.students.new_prev} />} />
          <Kpi label="Vencen en 7 días (sin renovación)" value={d.memberships.expiring_7d} />
          <Kpi label="Membresías canceladas (período)" value={d.memberships.cancelled_period} />
          <Kpi label="Entrenadores activos" value={d.trainers_active} to="/admin/entrenadores" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Egresos por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={d.expenses.by_category} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Comercial</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-3 text-center">
            {[
              ['Consultas nuevas', d.leads.new],
              ['Sin contactar', d.leads.pending],
              ['Convertidas', d.leads.converted],
            ].map(([label, value]) => (
              <Link key={label} to="/admin/prospectos" className="rounded-lg bg-muted p-3 hover:bg-muted/70">
                <p className="text-2xl font-semibold tabular-nums">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
