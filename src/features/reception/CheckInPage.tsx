import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ShoppingBag, Wallet, X, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPYG, formatTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { useStudent } from '@/features/students/api'
import { StudentPicker } from '@/features/students/StudentPicker'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { Textarea } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { ACCESS_ISSUE_LABELS, fullName } from '@/types/domain'
import { useAccessStatus, useRegisterCheckIn, useTodayCheckIns } from './api'

export function CheckInPage() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const studentId = params.get('alumno')

  return (
    <>
      <PageHeader
        title="Control de ingreso"
        description="Buscá al alumno por documento o nombre y registrá su entrada."
        actions={
          <Button variant="outline" asChild>
            <Link to="/caja/venta-rapida">
              <ShoppingBag /> Venta rápida
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        {studentId ? (
          <AccessCard key={studentId} studentId={studentId} onClose={() => setParams({})} />
        ) : (
          <StudentPicker
            placeholder="Documento o nombre"
            onPick={(id) => setParams({ alumno: id })}
            notFound={(term) => (
              <Button variant="outline" onClick={() => navigate('/caja/venta-rapida', { state: { doc: term } })}>
                <ShoppingBag /> No está registrado: vender pase
              </Button>
            )}
          />
        )}
        <TodayCheckIns />
      </div>
    </>
  )
}

function AccessCard({ studentId, onClose }: { studentId: string; onClose: () => void }) {
  const student = useStudent(studentId)
  const access = useAccessStatus(studentId)
  const register = useRegisterCheckIn()
  const [reason, setReason] = useState('')

  if (student.isLoading || access.isLoading) return <LoadingState />
  if (access.isError || !access.data) return <ErrorState error={access.error} onRetry={() => access.refetch()} />

  const a = access.data
  const submit = () =>
    register.mutate(
      { studentId, reason: a.ok ? undefined : reason },
      {
        onSuccess: (r) => {
          if (r.already) toast.info(`Ya había ingresado hoy a las ${formatTime(r.checked_in_at)}.`)
          else toast.success('Ingreso registrado.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <Card className="h-fit overflow-hidden">
      <div className={cn('flex items-center gap-3 px-5 py-4 text-white', a.ok ? 'bg-success' : 'bg-destructive')}>
        {a.ok ? <CheckCircle2 className="size-8 shrink-0" /> : <XCircle className="size-8 shrink-0" />}
        <div>
          <p className="text-xl font-bold">{a.ok ? 'Habilitado' : 'No habilitado'}</p>
          {a.ok && a.active_until && <p className="text-sm opacity-90">Vigente hasta el {formatDate(a.active_until)}</p>}
        </div>
      </div>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{student.data ? fullName(student.data) : '—'}</CardTitle>
          <p className="text-sm text-muted-foreground">CI {student.data?.document_number}</p>
          {a.plans.length > 0 && <p className="mt-1 text-sm">{a.plans.join(' · ')}</p>}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X /> Cambiar
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!a.ok && (
          <ul className="space-y-1 text-sm">
            {a.issues.map((i) => (
              <li key={i} className="flex items-center gap-2 text-destructive">
                <XCircle className="size-4" /> {ACCESS_ISSUE_LABELS[i]}
                {i === 'overdue' && <span className="font-semibold tabular-nums">({formatPYG(a.overdue_amount)})</span>}
              </li>
            ))}
          </ul>
        )}

        {a.checked_in_at ? (
          <p className="rounded-lg bg-muted p-3 text-sm">Ya registró su ingreso hoy a las {formatTime(a.checked_in_at)}.</p>
        ) : a.ok ? (
          <Button size="lg" variant="accent" className="w-full" loading={register.isPending} onClick={submit}>
            Registrar ingreso
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {a.open_amount > 0 && (
                <Button variant="outline" asChild>
                  <Link to={`/caja/cobrar?alumno=${studentId}`}>
                    <Wallet /> Cobrar
                  </Link>
                </Button>
              )}
              <Button variant="outline" asChild className={cn(a.open_amount <= 0 && 'col-span-2')}>
                <Link to={`/caja/venta-rapida?alumno=${studentId}`}>
                  <ShoppingBag /> Vender pase
                </Link>
              </Button>
            </div>
            <Field label="Dejar pasar igual" htmlFor="ci-reason" hint="Queda registrado con tu usuario y el motivo.">
              <Textarea id="ci-reason" rows={2} maxLength={300} placeholder="Motivo" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <Button variant="outline" className="w-full" disabled={reason.trim().length < 3} loading={register.isPending} onClick={submit}>
              Registrar ingreso con motivo
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function TodayCheckIns() {
  const { gymId } = useAuth()
  const q = useTodayCheckIns(gymId)

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Ingresos de hoy <span className="tabular-nums">{q.data?.length ?? ''}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState title="Todavía no ingresó nadie hoy" />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-12 shrink-0 tabular-nums text-muted-foreground">{formatTime(c.checked_in_at)}</span>
                <Link to={`/ingreso?alumno=${c.student_id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {c.students ? fullName(c.students) : '—'}
                </Link>
                {!c.access_ok && (
                  <Badge tone="danger" title={c.override_reason ?? undefined}>
                    Con motivo
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
