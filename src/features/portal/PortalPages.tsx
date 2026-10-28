import { Link } from 'react-router-dom'
import { CalendarClock, ChevronRight, Phone, ReceiptText, UserRound, Wallet } from 'lucide-react'
import { formatDate, formatDateTime, formatPYG, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { useMembershipStatus, useStudentCharges, useStudentSubscriptions } from '@/features/memberships/api'
import { ChargeStatusBadge } from '@/features/memberships/chargeUi'
import { useStudentPayments } from '@/features/cash/api'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { SUBSCRIPTION_STATUS_LABELS, type Student } from '@/types/domain'
import { useMyStudent, useMyTrainers } from './api'

/** Resuelve la ficha del alumno conectado; si no está vinculada, explica qué hacer. */
function WithStudent({ children }: { children: (s: Student) => React.ReactNode }) {
  const { session } = useAuth()
  const me = useMyStudent(session?.user.id)
  if (me.isLoading) return <LoadingState />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />
  if (!me.data)
    return (
      <EmptyState
        title="Tu cuenta todavía no está vinculada a una ficha de alumno"
        description="Pedí en recepción que vinculen tu cuenta. Mientras tanto podés editar tu perfil."
      />
    )
  return <>{children(me.data)}</>
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('es-PY', { timeZone: 'America/Asuncion', hour: 'numeric', hour12: false }).format(new Date()))
  return h < 12 ? 'Buen día' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function MyHomePage() {
  return <WithStudent>{(s) => <Home student={s} />}</WithStudent>
}

function Home({ student }: { student: Student }) {
  const status = useMembershipStatus(student.id)
  const charges = useStudentCharges(student.id)
  const trainers = useMyTrainers(student.id)
  const st = status.data
  const hasAccess = !!st && st.active_subscriptions > 0 && !st.paused_today
  const nextCharge = (charges.data ?? [])
    .filter((c) => ['pending', 'partial', 'overdue'].includes(c.status))
    .sort((a, b) => a.due_on.localeCompare(b.due_on))[0]
  const daysLeft = st?.active_until ? Math.round((Date.parse(st.active_until) - Date.parse(todayISO())) / 86_400_000) : null

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{greeting()},</p>
        <h1 className="text-2xl font-bold tracking-tight">{student.first_name}</h1>
      </div>

      <Card className={cn('overflow-hidden border-0 text-smoke', hasAccess ? 'bg-graphite' : 'bg-brand')}>
        <CardContent className="p-5">
          <p className="text-xs uppercase tracking-widest text-smoke/70">Mi membresía</p>
          <p className="mt-1 text-2xl font-bold">{st?.paused_today ? 'En pausa' : hasAccess ? 'Activa' : 'Sin membresía vigente'}</p>
          {st?.active_until && (
            <p className="mt-1 text-sm text-smoke/80">
              Vence el {formatDate(st.active_until)}
              {daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft === 0 ? 'hoy' : `en ${daysLeft} días`}` : ''}
            </p>
          )}
          <Link to="/mi/membresia" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-smoke hover:underline">
            Ver detalle <ChevronRight className="size-4" />
          </Link>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Saldo pendiente</p>
          <p className={cn('mt-1 text-lg font-semibold tabular-nums', st && st.overdue_amount > 0 && 'text-destructive')}>{formatPYG(st?.open_amount ?? 0)}</p>
          {st && st.overdue_amount > 0 && <p className="text-xs text-destructive">{formatPYG(st.overdue_amount)} vencido</p>}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Próximo vencimiento</p>
          <p className="mt-1 text-lg font-semibold">{nextCharge ? formatDate(nextCharge.due_on) : '—'}</p>
          {nextCharge && <p className="text-xs text-muted-foreground tabular-nums">{formatPYG(nextCharge.total - nextCharge.paid_amount)}</p>}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mi entrenador</CardTitle>
        </CardHeader>
        <CardContent>
          {!trainers.data?.length ? (
            <p className="text-sm text-muted-foreground">Todavía no tenés entrenador asignado.</p>
          ) : (
            <ul className="space-y-3">
              {trainers.data.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted">
                      <UserRound className="size-5 text-muted-foreground" />
                    </span>
                    <div>
                      <p className="font-medium">
                        {t.first_name} {t.last_name}
                      </p>
                      {t.specialties && <p className="text-xs text-muted-foreground">{t.specialties}</p>}
                    </div>
                  </div>
                  {t.phone && (
                    <a href={`https://wa.me/${t.phone.replace(/\D/g, '').replace(/^0/, '595')}`} target="_blank" rel="noreferrer" className="rounded-full bg-muted p-2" aria-label={`WhatsApp a ${t.first_name}`}>
                      <Phone className="size-4" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <QuickLink to="/mi/membresia" icon={CalendarClock} label="Mis cuotas" />
        <QuickLink to="/mi/pagos" icon={ReceiptText} label="Mis recibos" />
      </div>
    </div>
  )
}

function QuickLink({ to, icon: Icon, label }: { to: string; icon: typeof Wallet; label: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 font-medium hover:bg-muted">
      <Icon className="size-5 text-brand" /> {label}
    </Link>
  )
}

export function MyMembershipPage() {
  return (
    <>
      <PageHeader title="Mi membresía" />
      <WithStudent>{(s) => <Membership studentId={s.id} />}</WithStudent>
    </>
  )
}

function Membership({ studentId }: { studentId: string }) {
  const subs = useStudentSubscriptions(studentId)
  const charges = useStudentCharges(studentId)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planes</CardTitle>
        </CardHeader>
        <CardContent>
          {!subs.data?.length ? (
            <p className="text-sm text-muted-foreground">Sin membresías.</p>
          ) : (
            <ul className="divide-y divide-border">
              {subs.data.map((s) => (
                <li key={s.id} className="flex items-start justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.plan_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(s.starts_on)} → {formatDate(s.ends_on)}
                      {s.included_sessions ? ` · ${s.included_sessions} sesiones por período` : ''}
                    </p>
                  </div>
                  <Badge tone={s.status === 'active' ? 'accent' : 'neutral'}>{SUBSCRIPTION_STATUS_LABELS[s.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cuotas</CardTitle>
        </CardHeader>
        <CardContent>
          {!charges.data?.length ? (
            <p className="text-sm text-muted-foreground">Sin cuotas.</p>
          ) : (
            <ul className="divide-y divide-border">
              {charges.data
                .filter((c) => c.status !== 'voided')
                .map((c) => (
                  <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm">{c.concept}</p>
                      <p className="text-xs text-muted-foreground">Vence {formatDate(c.due_on)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="font-medium tabular-nums">{formatPYG(c.status === 'paid' ? c.total : c.total - c.paid_amount)}</span>
                      <ChargeStatusBadge status={c.status} />
                    </div>
                  </li>
                ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">Para pagar acercate a recepción. Consultas por WhatsApp.</p>
        </CardContent>
      </Card>
    </div>
  )
}

export function MyPaymentsPage() {
  return (
    <>
      <PageHeader title="Mis recibos" />
      <WithStudent>{(s) => <MyPayments studentId={s.id} />}</WithStudent>
    </>
  )
}

function MyPayments({ studentId }: { studentId: string }) {
  const payments = useStudentPayments(studentId)
  if (payments.isLoading) return <LoadingState />
  if (!payments.data?.length) return <EmptyState title="Todavía no hay pagos registrados" />
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
        {payments.data.map((p) => (
          <li key={p.id}>
            <Link to={`/recibo/${p.id}`} className={cn('flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50', p.status === 'voided' && 'opacity-60')}>
              <div>
                <p className="font-mono text-sm">{p.receipt_number}</p>
                <p className="text-xs text-muted-foreground">
                  {p.payment_methods?.name} · {formatDateTime(p.paid_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('font-medium tabular-nums', p.status === 'voided' && 'line-through')}>{formatPYG(p.amount)}</span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
