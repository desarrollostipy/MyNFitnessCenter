import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, Lock, Plus, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { MoneyInput, Textarea } from '@/components/ui/form-controls'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { CASH_SOURCE_LABELS, type CashSession } from '@/types/domain'
import {
  cashTotals,
  useCashAdjustment,
  useCloseCash,
  useClosedSessions,
  useOpenCash,
  useOpenSession,
  useSessionMovements,
  useStaffNames,
} from './api'

export function CashPage() {
  const { gymId } = useAuth()
  const session = useOpenSession(gymId)

  return (
    <>
      <PageHeader
        title="Caja"
        description="Efectivo físico del día. Transferencias y tarjetas no pasan por la caja."
        actions={
          <Button asChild>
            <Link to="/caja/cobrar">
              <Plus /> Cobrar
            </Link>
          </Button>
        }
      />
      {session.isLoading ? (
        <LoadingState />
      ) : session.isError ? (
        <ErrorState error={session.error} onRetry={() => session.refetch()} />
      ) : session.data ? (
        <OpenSessionView session={session.data} />
      ) : (
        <OpenCashForm />
      )}
      <ClosedSessions />
    </>
  )
}

function OpenCashForm() {
  const { gymId } = useAuth()
  const open = useOpenCash(gymId)
  const [amount, setAmount] = useState<number | null>(null)

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5" /> Caja cerrada
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Cuente el efectivo inicial (cambio) y abra la caja para empezar a cobrar en efectivo.</p>
        <Field label="Saldo inicial en efectivo" htmlFor="open-amount">
          <MoneyInput id="open-amount" value={amount} onChange={setAmount} />
        </Field>
        <Button
          className="w-full"
          size="lg"
          loading={open.isPending}
          disabled={amount === null}
          onClick={() =>
            open.mutate(amount ?? 0, {
              onSuccess: () => toast.success('Caja abierta.'),
              onError: (e) => toast.error(errorMessage(e)),
            })
          }
        >
          Abrir caja
        </Button>
      </CardContent>
    </Card>
  )
}

function OpenSessionView({ session }: { session: CashSession }) {
  const { gymId, hasRole, session: auth } = useAuth()
  // Ingresos y salidas manuales de efectivo: sólo administración y tesorería.
  const canAdjust = hasRole('admin', 'treasurer')
  const names = useStaffNames(gymId, [session.opened_by])
  const openedBy = session.opened_by === auth?.user.id ? 'vos' : names.data?.get(session.opened_by)
  const movements = useSessionMovements(session.id)
  const [adjust, setAdjust] = useState<'in' | 'out' | null>(null)
  const [closing, setClosing] = useState(false)
  const totals = cashTotals(session, movements.data ?? [])

  const cards = [
    { label: 'Saldo inicial', value: session.opening_amount },
    { label: 'Ingresos', value: totals.ins, tone: 'text-success' },
    { label: 'Salidas', value: totals.outs, tone: 'text-destructive' },
    { label: 'Efectivo esperado', value: totals.expected, strong: true },
  ]

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Abierta el {formatDateTime(session.opened_at)}
        {openedBy && (
          <>
            {' '}
            por <span className="font-medium text-foreground">{openedBy}</span>
          </>
        )}
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label} className={cn('p-4', c.strong && 'border-foreground/30')}>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={cn('mt-1 text-lg font-semibold tabular-nums', c.tone)}>{formatPYG(c.value)}</p>
          </Card>
        ))}
      </div>

      <div className={cn('grid gap-2 sm:flex', canAdjust ? 'grid-cols-3' : 'grid-cols-1')}>
        {canAdjust && (
          <>
            <Button variant="outline" onClick={() => setAdjust('in')}>
              <ArrowDownLeft /> Ingreso
            </Button>
            <Button variant="outline" onClick={() => setAdjust('out')}>
              <ArrowUpRight /> Salida
            </Button>
          </>
        )}
        <Button variant="accent" onClick={() => setClosing(true)} className="sm:ml-auto">
          <Lock /> Cerrar caja
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Movimientos de efectivo</CardTitle>
        </CardHeader>
        <CardContent>
          {movements.isLoading ? (
            <LoadingState />
          ) : !movements.data?.length ? (
            <p className="text-sm text-muted-foreground">Sin movimientos todavía.</p>
          ) : (
            <ul className="divide-y divide-border">
              {movements.data.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{m.note ?? CASH_SOURCE_LABELS[m.source]}</p>
                    <p className="text-xs text-muted-foreground">
                      {CASH_SOURCE_LABELS[m.source]} · {formatDateTime(m.created_at)}
                    </p>
                  </div>
                  <span className={cn('shrink-0 font-medium tabular-nums', m.direction === 'in' ? 'text-success' : 'text-destructive')}>
                    {m.direction === 'in' ? '+' : '−'} {formatPYG(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {adjust && <AdjustmentDialog sessionId={session.id} direction={adjust} available={totals.expected} onClose={() => setAdjust(null)} />}
      {closing && <CloseDialog session={session} expected={totals.expected} onClose={() => setClosing(false)} />}
    </div>
  )
}

function AdjustmentDialog({
  sessionId,
  direction,
  available,
  onClose,
}: {
  sessionId: string
  direction: 'in' | 'out'
  available: number
  onClose: () => void
}) {
  const adjust = useCashAdjustment()
  const [amount, setAmount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()

  const submit = () => {
    if (!amount) return setError('Ingrese el importe')
    if (direction === 'out' && amount > available) return setError(`Sólo hay ${formatPYG(available)} en caja`)
    if (note.trim().length < 3) return setError('Indique el concepto')
    adjust.mutate(
      { sessionId, direction, amount, note: note.trim() },
      {
        onSuccess: () => {
          toast.success('Movimiento registrado.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={direction === 'in' ? 'Ingreso de efectivo' : 'Salida de efectivo'}
      description={direction === 'in' ? 'Ej.: refuerzo de cambio.' : 'Ej.: depósito en banco, retiro autorizado. Los gastos se registran en Egresos.'}
    >
      <div className="space-y-4">
        <Field label="Importe" htmlFor="adj-amount" error={error}>
          <MoneyInput id="adj-amount" value={amount} onChange={setAmount} />
        </Field>
        <Field label="Concepto" htmlFor="adj-note">
          <Textarea id="adj-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={adjust.isPending} onClick={submit}>
            Registrar
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function CloseDialog({ session, expected, onClose }: { session: CashSession; expected: number; onClose: () => void }) {
  const close = useCloseCash()
  const [counted, setCounted] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const diff = counted === null ? null : counted - expected

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Cierre y arqueo de caja" description="Cuente el efectivo físico e ingréselo. La caja cerrada no puede modificarse.">
      <div className="space-y-4">
        <div className="flex justify-between rounded-lg bg-muted p-3 text-sm">
          <span>Efectivo esperado</span>
          <span className="font-semibold tabular-nums">{formatPYG(expected)}</span>
        </div>
        <Field label="Efectivo contado" htmlFor="close-counted">
          <MoneyInput id="close-counted" value={counted} onChange={setCounted} />
        </Field>
        {diff !== null && (
          <div className={cn('flex justify-between rounded-lg p-3 text-sm', diff === 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
            <span>{diff === 0 ? 'Cuadra' : diff > 0 ? 'Sobrante' : 'Faltante'}</span>
            <span className="font-semibold tabular-nums">{formatPYG(Math.abs(diff))}</span>
          </div>
        )}
        <Field label={diff ? 'Explicación de la diferencia (obligatoria)' : 'Observaciones (opcional)'} htmlFor="close-notes">
          <Textarea id="close-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Volver
          </Button>
          <Button
            variant="accent"
            disabled={counted === null || (!!diff && notes.trim().length < 3)}
            loading={close.isPending}
            onClick={() =>
              close.mutate(
                { sessionId: session.id, counted: counted ?? 0, notes },
                {
                  onSuccess: (r) => {
                    toast.success(r.difference === 0 ? 'Caja cerrada. Cuadra.' : `Caja cerrada con diferencia de ${formatPYG(r.difference)}.`)
                    onClose()
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            Cerrar caja
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

function ClosedSessions() {
  const { gymId, hasRole } = useAuth()
  const q = useClosedSessions(gymId)
  const names = useStaffNames(gymId, (q.data ?? []).flatMap((s) => [s.opened_by, s.closed_by]))
  if (q.isLoading || !q.data) return null
  const who = (id: string | null) => (id ? (names.data?.get(id) ?? '…') : '—')

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{hasRole('admin', 'treasurer', 'accountant') ? 'Cierres anteriores' : 'Mis cierres'}</CardTitle>
      </CardHeader>
      <CardContent>
        {!q.data.length ? (
          <EmptyState title="Todavía no hay cierres" />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p>{formatDateTime(s.closed_at)}</p>
                  <p className="text-xs text-muted-foreground">
                    Abrió <span className="text-foreground">{who(s.opened_by)}</span> el {formatDateTime(s.opened_at)} · Cerró{' '}
                    <span className="text-foreground">{who(s.closed_by)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Inicial {formatPYG(s.opening_amount)} · Esperado {formatPYG(s.expected_amount)} · Contado {formatPYG(s.counted_amount)}
                  </p>
                  {s.close_notes && <p className="text-xs text-muted-foreground">{s.close_notes}</p>}
                </div>
                <span className={cn('shrink-0 font-medium tabular-nums', s.difference ? 'text-destructive' : 'text-success')}>
                  {s.difference ? formatPYG(s.difference) : 'Cuadra'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
