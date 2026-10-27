import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDateTime, formatPYG, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Badge, Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { fullName } from '@/types/domain'
import { usePayments } from './api'

type Range = 'today' | 'month' | 'custom'

function monthStart() {
  return todayISO().slice(0, 8) + '01'
}

export function PaymentsPage() {
  const { gymId } = useAuth()
  const [range, setRange] = useState<Range>('today')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(todayISO())
  const f = range === 'today' ? todayISO() : range === 'month' ? monthStart() : from
  const t = range === 'custom' ? to : todayISO()
  const q = usePayments(gymId, f, t)

  const posted = (q.data ?? []).filter((p) => p.status === 'posted')
  const total = posted.reduce((s, p) => s + Number(p.amount), 0)
  const byMethod = new Map<string, number>()
  for (const p of posted) {
    const name = p.payment_methods?.name ?? '—'
    byMethod.set(name, (byMethod.get(name) ?? 0) + Number(p.amount))
  }

  return (
    <>
      <PageHeader title="Cobranzas" description="Cobros registrados por período y medio de pago." />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        {(
          [
            ['today', 'Hoy'],
            ['month', 'Este mes'],
            ['custom', 'Rango'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setRange(id)}
            className={cn('rounded-lg px-3 py-1.5 text-sm', range === id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
          >
            {label}
          </button>
        ))}
        {range === 'custom' && (
          <div className="flex w-full gap-2 sm:w-auto">
            <Field label="Desde" htmlFor="pr-from">
              <Input id="pr-from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="Hasta" htmlFor="pr-to">
              <Input id="pr-to" type="date" value={to} min={from} max={todayISO()} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-graphite p-4">
          <p className="text-xs text-muted-foreground">Total cobrado</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{formatPYG(total)}</p>
          <p className="text-xs text-muted-foreground">{posted.length} cobros</p>
        </Card>
        {[...byMethod.entries()].map(([name, amount]) => (
          <Card key={name} className="p-4">
            <p className="text-xs text-muted-foreground">{name}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatPYG(amount)}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Sin cobros en el período" />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.map((p) => (
              <li key={p.id}>
                <Link to={`/recibo/${p.id}`} className={cn('flex items-center gap-3 px-4 py-3 hover:bg-muted/50', p.status === 'voided' && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.students ? fullName(p.students) : '—'}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{p.receipt_number}</span> · {p.payment_methods?.name} · {formatDateTime(p.paid_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('font-medium tabular-nums', p.status === 'voided' && 'line-through')}>{formatPYG(p.amount)}</span>
                    {p.status === 'voided' && <Badge tone="danger">Anulado</Badge>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
