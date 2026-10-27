import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Phone, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { fullName } from '@/types/domain'
import { CHARGES_PAGE_SIZE, useCharges, useDebtors, useRunMembershipJobs, type ChargeFilter } from './api'
import { ChargeStatusBadge } from './chargeUi'

type Tab = ChargeFilter | 'debtors'
const TABS: { id: Tab; label: string }[] = [
  { id: 'open', label: 'Por cobrar' },
  { id: 'overdue', label: 'Vencidas' },
  { id: 'debtors', label: 'Morosos' },
  { id: 'paid', label: 'Pagadas' },
  { id: 'voided', label: 'Anuladas' },
]

export function ChargesPage() {
  const { gymId, hasRole } = useAuth()
  const [tab, setTab] = useState<Tab>('open')
  const [page, setPage] = useState(0)
  const jobs = useRunMembershipJobs(gymId)

  return (
    <>
      <PageHeader
        title="Cuotas"
        description="Obligaciones de pago de los alumnos. Los vencimientos se actualizan automáticamente cada día a las 00:05."
        actions={
          hasRole('admin') && (
            <Button
              variant="outline"
              loading={jobs.isPending}
              onClick={() =>
                jobs.mutate(undefined, {
                  onSuccess: (r) =>
                    toast.success(`Actualizado: ${r.renewed} renovaciones, ${r.overdue} cuotas vencidas, ${r.expired} membresías finalizadas.`),
                  onError: (e) => toast.error(errorMessage(e)),
                })
              }
            >
              {!jobs.isPending && <RefreshCw />} Actualizar ahora
            </Button>
          )
        }
      />

      <div className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1" role="tablist" aria-label="Filtrar cuotas">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => {
                setTab(t.id)
                setPage(0)
              }}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm',
                tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'debtors' ? <DebtorsList /> : <ChargesList filter={tab} page={page} setPage={setPage} />}
    </>
  )
}

function ChargesList({ filter, page, setPage }: { filter: ChargeFilter; page: number; setPage: (fn: (p: number) => number) => void }) {
  const { gymId } = useAuth()
  const q = useCharges(gymId, filter, page)
  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / CHARGES_PAGE_SIZE))

  return (
    <Card className="overflow-hidden">
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.rows.length ? (
        <EmptyState title="No hay cuotas en esta vista" />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {q.data.rows.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/alumnos/${c.student_id}`} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{c.students ? fullName(c.students) : '—'}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.concept}</p>
                    <p className="text-xs text-muted-foreground">Vence {formatDate(c.due_on)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-medium tabular-nums">
                      {formatPYG(filter === 'paid' || filter === 'voided' ? c.total : c.total - c.paid_amount)}
                    </span>
                    <ChargeStatusBadge status={c.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
            <span className="text-muted-foreground">
              {page + 1}/{pages} · {total} cuotas
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function DebtorsList() {
  const { gymId } = useAuth()
  const q = useDebtors(gymId)
  const totalDebt = (q.data ?? []).reduce((sum, d) => sum + Number(d.overdue_amount), 0)

  return (
    <Card className="overflow-hidden">
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title="No hay alumnos morosos" description="Ningún alumno tiene cuotas vencidas." />
      ) : (
        <>
          <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3 text-sm">
            <span>{q.data.length} alumnos con deuda vencida</span>
            <span className="font-semibold tabular-nums text-destructive">{formatPYG(totalDebt)}</span>
          </div>
          <ul className="divide-y divide-border">
            {q.data.map((d) => (
              <li key={d.student_id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/admin/alumnos/${d.student_id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="truncate font-medium">{d.students ? fullName(d.students) : '—'}</p>
                  <p className="text-xs text-muted-foreground">Vencido desde {formatDate(d.oldest_overdue_on)}</p>
                </Link>
                <span className="font-semibold tabular-nums text-destructive">{formatPYG(d.overdue_amount)}</span>
                {d.students?.phone && (
                  <Button asChild size="icon" variant="ghost" aria-label={`Llamar a ${fullName(d.students)}`}>
                    <a href={`tel:${d.students.phone}`}>
                      <Phone />
                    </a>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
