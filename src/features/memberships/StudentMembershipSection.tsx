import { useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { PauseCircle, Plus, RefreshCw, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPYG, todayISO } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePlans } from '@/features/catalog/api'
import { planDurationLabel } from '@/features/catalog/planUtils'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField, MoneyInput, Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { ErrorState, LoadingState } from '@/components/states'
import { FIXED_PLAN_DAYS, SUBSCRIPTION_STATUS_LABELS, type Charge, type Student, type Subscription } from '@/types/domain'
import {
  useCancelSubscription,
  useEnrollMembership,
  useMembershipStatus,
  usePauseSubscription,
  useRenewSubscription,
  useStudentCharges,
  useStudentSubscriptions,
  useVoidCharge,
} from './api'
import { ChargeStatusBadge } from './chargeUi'
import { StudentPaymentsCard } from '@/features/cash/StudentPaymentsCard'

/** Resumen + membresías + cuotas del alumno (ficha). */
export function StudentMembershipSection({ student }: { student: Student }) {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  return (
    <div className="space-y-6">
      <StatusSummary studentId={student.id} />
      <div className="grid gap-6 lg:grid-cols-2">
        <SubscriptionsCard student={student} canEdit={isAdmin} />
        <ChargesCard studentId={student.id} canVoid={isAdmin} />
        <StudentPaymentsCard studentId={student.id} />
      </div>
    </div>
  )
}

function StatusSummary({ studentId }: { studentId: string }) {
  const status = useMembershipStatus(studentId)
  if (!status.data) return null
  const s = status.data
  const hasAccess = s.active_subscriptions > 0 && !s.paused_today
  const items = [
    {
      label: 'Membresía',
      value: s.paused_today ? 'En pausa' : hasAccess ? 'Vigente' : 'Sin membresía vigente',
      tone: hasAccess ? 'text-success' : 'text-destructive',
    },
    { label: 'Vence', value: formatDate(s.active_until), tone: '' },
    { label: 'Saldo pendiente', value: formatPYG(s.open_amount), tone: '' },
    {
      label: 'Vencido',
      value: formatPYG(s.overdue_amount),
      tone: s.overdue_amount > 0 ? 'text-destructive' : '',
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((i) => (
        <Card key={i.label} className="p-4">
          <p className="text-xs text-muted-foreground">{i.label}</p>
          <p className={`mt-1 font-semibold tabular-nums ${i.tone}`}>{i.value}</p>
        </Card>
      ))}
    </div>
  )
}

function SubscriptionsCard({ student, canEdit }: { student: Student; canEdit: boolean }) {
  const subs = useStudentSubscriptions(student.id)
  const renew = useRenewSubscription()
  const [enrolling, setEnrolling] = useState(false)
  const [renewing, setRenewing] = useState<Subscription | null>(null)
  const [pausing, setPausing] = useState<Subscription | null>(null)
  const [cancelling, setCancelling] = useState<Subscription | null>(null)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Membresías</CardTitle>
        {canEdit && student.status === 'active' && (
          <Button size="sm" onClick={() => setEnrolling(true)}>
            <Plus /> Nueva
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {subs.isLoading ? (
          <LoadingState />
        ) : subs.isError ? (
          <ErrorState error={subs.error} onRetry={() => subs.refetch()} />
        ) : !subs.data?.length ? (
          <p className="text-sm text-muted-foreground">Sin membresías registradas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {subs.data.map((s) => {
              const pauseToday = s.subscription_pauses.find((p) => p.from_date <= todayISO() && p.to_date >= todayISO())
              return (
                <li key={s.id} className="py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{s.plan_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(s.starts_on)} → {formatDate(s.ends_on)} · {formatPYG(s.price_agreed - s.discount_amount)} por período
                      </p>
                      {s.discount_amount > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Descuento {formatPYG(s.discount_amount)}: {s.discount_reason}
                        </p>
                      )}
                      {s.status === 'cancelled' && s.cancel_reason && (
                        <p className="text-xs text-muted-foreground">Motivo: {s.cancel_reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge tone={s.status === 'active' ? 'accent' : s.status === 'cancelled' ? 'danger' : 'neutral'}>
                        {pauseToday ? 'En pausa' : SUBSCRIPTION_STATUS_LABELS[s.status]}
                      </Badge>
                      {s.status === 'active' && (
                        <span className="text-[11px] text-muted-foreground">
                          {s.auto_renew ? 'Renovación automática' : 'Sin renovación'}
                        </span>
                      )}
                    </div>
                  </div>
                  {canEdit && s.status !== 'cancelled' && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => setRenewing(s)}>
                        <RefreshCw /> Renovar
                      </Button>
                      {s.status === 'active' && (
                        <Button size="sm" variant="outline" onClick={() => setPausing(s)}>
                          <PauseCircle /> Pausar
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setCancelling(s)}>
                        <XCircle /> Cancelar
                      </Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>

      {enrolling && <EnrollDialog student={student} onClose={() => setEnrolling(false)} />}
      <ConfirmDialog
        open={!!renewing}
        onOpenChange={(o) => !o && setRenewing(null)}
        title="Renovar membresía"
        description={`Se generará el próximo período de "${renewing?.plan_name}" y su cuota. Si ya estaba generado, no se duplica.`}
        confirmLabel="Renovar"
        loading={renew.isPending}
        onConfirm={() =>
          renewing &&
          renew.mutate(renewing.id, {
            onSuccess: () => {
              toast.success('Período generado.')
              setRenewing(null)
            },
            onError: (e) => {
              toast.error(errorMessage(e))
              setRenewing(null)
            },
          })
        }
      />
      {pausing && <PauseDialog sub={pausing} onClose={() => setPausing(null)} />}
      {cancelling && <CancelDialog sub={cancelling} onClose={() => setCancelling(null)} />}
    </Card>
  )
}

const enrollSchema = z
  .object({
    plan_id: z.string().min(1, 'Seleccione un plan'),
    starts_on: z.string().min(1, 'Ingrese la fecha de inicio'),
    discount: z.number().int().min(0),
    discount_reason: z.string().trim().max(200),
    auto_renew: z.boolean(),
  })
  .refine((v) => v.discount === 0 || v.discount_reason.length >= 3, {
    path: ['discount_reason'],
    message: 'Indique el motivo del descuento',
  })
type EnrollValues = z.infer<typeof enrollSchema>

function EnrollDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const { gymId } = useAuth()
  const plans = usePlans(gymId)
  const enroll = useEnrollMembership()
  // Una clave por apertura del formulario: el doble clic o un reintento no duplica la membresía.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])
  const { register, control, handleSubmit, formState, setError } = useForm<EnrollValues>({
    resolver: zodResolver(enrollSchema),
    defaultValues: { plan_id: '', starts_on: todayISO(), discount: 0, discount_reason: '', auto_renew: true },
  })
  const { errors } = formState
  const planId = useWatch({ control, name: 'plan_id' })
  const discount = useWatch({ control, name: 'discount' })
  const activePlans = (plans.data ?? []).filter((p) => p.is_active)
  const plan = activePlans.find((p) => p.id === planId)

  const onSubmit = (v: EnrollValues) => {
    if (plan && v.discount > plan.price) {
      setError('discount', { message: 'El descuento supera el precio' })
      return
    }
    enroll.mutate(
      {
        studentId: student.id,
        planId: v.plan_id,
        startsOn: v.starts_on,
        discount: v.discount,
        discountReason: v.discount_reason,
        autoRenew: v.auto_renew,
        idempotencyKey,
      },
      {
        onSuccess: () => {
          toast.success('Membresía registrada. Se generó la primera cuota.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nueva membresía" description={`${student.first_name} ${student.last_name}`}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Plan" htmlFor="m-plan" error={errors.plan_id?.message}>
          <Select id="m-plan" {...register('plan_id')}>
            <option value="">{activePlans.length ? 'Seleccionar…' : 'No hay planes activos'}</option>
            {activePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatPYG(p.price)} / {planDurationLabel(p)}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Inicio" htmlFor="m-start" error={errors.starts_on?.message}>
            <Input id="m-start" type="date" min={todayISO(-60)} max={todayISO(90)} {...register('starts_on')} />
          </Field>
          <Field label="Descuento por período" htmlFor="m-disc" error={errors.discount?.message}>
            <Controller
              control={control}
              name="discount"
              render={({ field }) => (
                <MoneyInput id="m-disc" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} />
              )}
            />
          </Field>
        </div>
        {discount > 0 && (
          <Field label="Motivo del descuento" htmlFor="m-reason" error={errors.discount_reason?.message}>
            <Textarea id="m-reason" rows={2} {...register('discount_reason')} />
          </Field>
        )}
        {plan && FIXED_PLAN_DAYS[plan.plan_type] ? (
          <p className="text-sm text-muted-foreground">Los pases diarios y semanales no se renuevan solos: el alumno vuelve a comprarlos.</p>
        ) : (
          <CheckboxField
            id="m-renew"
            label="Renovación automática"
            hint="Genera el próximo período y su cuota 7 días antes del vencimiento."
            {...register('auto_renew')}
          />
        )}
        {plan && (
          <div className="rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between">
              <span>Cuota por período</span>
              <span className="font-semibold tabular-nums">{formatPYG(Math.max(0, plan.price - (discount || 0)))}</span>
            </div>
            {plan.included_sessions > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Incluye {plan.included_sessions} sesiones por período.</p>
            )}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={enroll.isPending}>
            Registrar membresía
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function PauseDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const pause = usePauseSubscription()
  const [from, setFrom] = useState(todayISO())
  const [to, setTo] = useState(todayISO(6))
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1

  return (
    <ReasonDialog
      title="Pausar membresía"
      description={`${sub.plan_name}. El vencimiento se corre la misma cantidad de días; las cuotas ya emitidas no cambian.`}
      confirmLabel={days > 0 ? `Pausar ${days} días` : 'Pausar'}
      destructive={false}
      loading={pause.isPending}
      onClose={onClose}
      onConfirm={(reason) => {
        if (!(days > 0 && days <= 90)) return toast.error('El período de pausa debe ser de 1 a 90 días.')
        pause.mutate(
          { id: sub.id, from, to, reason },
          {
            onSuccess: () => {
              toast.success('Membresía pausada.')
              onClose()
            },
            onError: (e) => toast.error(errorMessage(e)),
          },
        )
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor="pz-from">
          <Input id="pz-from" type="date" min={todayISO()} value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta" htmlFor="pz-to">
          <Input id="pz-to" type="date" min={from} value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
    </ReasonDialog>
  )
}

function CancelDialog({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const cancel = useCancelSubscription()
  const [voidFuture, setVoidFuture] = useState(true)
  return (
    <ReasonDialog
      title="Cancelar membresía"
      description={`${sub.plan_name}. No se generarán más períodos. El historial se conserva.`}
      confirmLabel="Cancelar membresía"
      loading={cancel.isPending}
      onClose={onClose}
      onConfirm={(reason) =>
        cancel.mutate(
          { id: sub.id, reason, voidFuture },
          {
            onSuccess: () => {
              toast.success('Membresía cancelada.')
              onClose()
            },
            onError: (e) => toast.error(errorMessage(e)),
          },
        )
      }
    >
      <CheckboxField
        id="c-void"
        label="Anular cuotas de períodos futuros sin pagos"
        checked={voidFuture}
        onChange={(e) => setVoidFuture(e.target.checked)}
      />
    </ReasonDialog>
  )
}

function ChargesCard({ studentId, canVoid }: { studentId: string; canVoid: boolean }) {
  const charges = useStudentCharges(studentId)
  const voidCharge = useVoidCharge()
  const [voiding, setVoiding] = useState<Charge | null>(null)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cuotas</CardTitle>
      </CardHeader>
      <CardContent>
        {charges.isLoading ? (
          <LoadingState />
        ) : charges.isError ? (
          <ErrorState error={charges.error} onRetry={() => charges.refetch()} />
        ) : !charges.data?.length ? (
          <p className="text-sm text-muted-foreground">Sin cuotas generadas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {charges.data.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm">{c.concept}</p>
                  <p className="text-xs text-muted-foreground">
                    Vence {formatDate(c.due_on)}
                    {c.paid_amount > 0 && c.status !== 'paid' ? ` · Pagado ${formatPYG(c.paid_amount)}` : ''}
                  </p>
                  {c.status === 'voided' && c.void_reason && <p className="text-xs text-muted-foreground">{c.void_reason}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-medium tabular-nums">{formatPYG(c.total - (c.status === 'voided' ? 0 : c.paid_amount))}</span>
                  <ChargeStatusBadge status={c.status} />
                  {canVoid && c.status !== 'voided' && c.paid_amount === 0 && (
                    <button className="text-[11px] text-muted-foreground hover:text-destructive hover:underline" onClick={() => setVoiding(c)}>
                      Anular
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Las cuotas son obligaciones internas, no comprobantes fiscales.
        </p>
      </CardContent>
      {voiding && (
        <ReasonDialog
          title="Anular cuota"
          description={`${voiding.concept} — ${formatPYG(voiding.total)}. Queda registrada como anulada con su motivo.`}
          confirmLabel="Anular cuota"
          loading={voidCharge.isPending}
          onClose={() => setVoiding(null)}
          onConfirm={(reason) =>
            voidCharge.mutate(
              { id: voiding.id, reason },
              {
                onSuccess: () => {
                  toast.success('Cuota anulada.')
                  setVoiding(null)
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        />
      )}
    </Card>
  )
}
