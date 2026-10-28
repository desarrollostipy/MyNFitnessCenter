import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePaymentMethods } from '@/features/catalog/api'
import { useStudent } from '@/features/students/api'
import { StudentPicker } from '@/features/students/StudentPicker'
import { ChargeStatusBadge } from '@/features/memberships/chargeUi'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { MoneyInput } from '@/components/ui/form-controls'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingState, PageHeader } from '@/components/states'
import { fullName } from '@/types/domain'
import { useOpenCharges, useOpenSession, useRegisterPayment } from './api'

export function CollectPage() {
  const [params, setParams] = useSearchParams()
  const studentId = params.get('alumno')

  return (
    <>
      <PageHeader title="Cobrar cuota" description="Registra el pago y emite un recibo interno (no fiscal)." />
      {studentId ? (
        <CollectForm key={studentId} studentId={studentId} onChangeStudent={() => setParams({})} />
      ) : (
        <StudentPicker onPick={(id) => setParams({ alumno: id })} />
      )}
    </>
  )
}

function CollectForm({ studentId, onChangeStudent }: { studentId: string; onChangeStudent: () => void }) {
  const { gymId } = useAuth()
  const navigate = useNavigate()
  const student = useStudent(studentId)
  const charges = useOpenCharges(studentId)
  const methods = usePaymentMethods(gymId)
  const session = useOpenSession(gymId)
  const register = useRegisterPayment()
  // Una clave por formulario: un doble toque o reintento no cobra dos veces.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [amount, setAmount] = useState<number | null>(null)
  const [methodId, setMethodId] = useState('')
  const [reference, setReference] = useState('')

  const open = useMemo(() => charges.data ?? [], [charges.data])
  const chosen = selected ?? new Set(open.map((c) => c.id))
  const selectedCharges = open.filter((c) => chosen.has(c.id))
  const selectedBalance = selectedCharges.reduce((s, c) => s + (c.total - c.paid_amount), 0)
  const payAmount = amount ?? selectedBalance
  const activeMethods = (methods.data ?? []).filter((m) => m.is_active)
  const method = activeMethods.find((m) => m.id === methodId) ?? activeMethods[0]
  const needsCash = !!method?.affects_cash && !session.data

  const toggle = (id: string) => {
    const next = new Set(chosen)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
    setAmount(null)
  }

  const submit = () => {
    if (!method) return toast.error('No hay medios de pago activos')
    if (!payAmount || payAmount <= 0) return toast.error('Ingrese el importe')
    if (payAmount > selectedBalance) return toast.error(`El importe supera el saldo seleccionado (${formatPYG(selectedBalance)})`)
    // Reparte el importe entre las cuotas elegidas, de la más antigua a la más nueva.
    let rest = payAmount
    const allocations = selectedCharges
      .map((c) => {
        const a = Math.min(rest, c.total - c.paid_amount)
        rest -= a
        return { charge_id: c.id, amount: a }
      })
      .filter((a) => a.amount > 0)
    register.mutate(
      { studentId, methodId: method.id, amount: payAmount, allocations, reference, notes: '', idempotencyKey },
      {
        onSuccess: (paymentId) => {
          toast.success('Cobro registrado.')
          navigate(`/recibo/${paymentId}`, { replace: true })
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  if (student.isLoading || charges.isLoading) return <LoadingState />

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
          <div>
            <CardTitle>{student.data ? fullName(student.data) : '—'}</CardTitle>
            <p className="text-sm text-muted-foreground">CI {student.data?.document_number}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onChangeStudent}>
            <X /> Cambiar
          </Button>
        </CardHeader>
        <CardContent>
          {!open.length ? (
            <EmptyState title="Sin cuotas pendientes" description="Este alumno está al día." />
          ) : (
            <ul className="divide-y divide-border">
              {open.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-start gap-3 py-3">
                    <input type="checkbox" className="mt-1 size-5 accent-brand" checked={chosen.has(c.id)} onChange={() => toggle(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{c.concept}</span>
                      <span className="text-xs text-muted-foreground">
                        Vence {formatDate(c.due_on)}
                        {c.paid_amount > 0 ? ` · Ya pagado ${formatPYG(c.paid_amount)}` : ''}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-medium tabular-nums">{formatPYG(c.total - c.paid_amount)}</span>
                      <ChargeStatusBadge status={c.status} />
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {open.length > 0 && (
        <Card className="h-fit lg:sticky lg:top-6">
          <CardContent className="space-y-4 pt-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Saldo seleccionado</span>
              <span className="font-semibold tabular-nums">{formatPYG(selectedBalance)}</span>
            </div>
            <Field label="Importe a cobrar" htmlFor="pay-amount" hint="Puede ser menor al saldo (pago parcial).">
              <MoneyInput id="pay-amount" value={payAmount} onChange={setAmount} />
            </Field>
            <div>
              <p className="mb-1.5 text-sm font-medium">Medio de pago</p>
              <div className="grid grid-cols-2 gap-2">
                {activeMethods.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMethodId(m.id)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-sm',
                      method?.id === m.id ? 'border-transparent bg-selected text-selected-foreground' : 'border-border bg-card hover:bg-white/10',
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
            {method && !method.affects_cash && (
              <Field label="Referencia (opcional)" htmlFor="pay-ref" hint="Nº de transferencia o comprobante del POS.">
                <Input id="pay-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
              </Field>
            )}
            {needsCash && (
              <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
                Para cobrar en efectivo abrí la caja primero.{' '}
                <Link to="/caja" className="font-medium underline">
                  Ir a Caja
                </Link>
              </p>
            )}
            <Button
              size="lg"
              variant="accent"
              className="w-full"
              disabled={needsCash || !payAmount || chosen.size === 0}
              loading={register.isPending}
              onClick={submit}
            >
              Cobrar {payAmount ? formatPYG(payAmount) : ''}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
