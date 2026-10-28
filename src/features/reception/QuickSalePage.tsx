import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { UserPlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePaymentMethods, usePlans } from '@/features/catalog/api'
import { planDurationLabel } from '@/features/catalog/planUtils'
import { useOpenSession } from '@/features/cash/api'
import { useStudent } from '@/features/students/api'
import { StudentPicker } from '@/features/students/StudentPicker'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField } from '@/components/ui/form-controls'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, LoadingState, PageHeader } from '@/components/states'
import { FIXED_PLAN_DAYS, PLAN_TYPE_LABELS, fullName, type MembershipPlan } from '@/types/domain'
import { useQuickSale } from './api'

interface NewPerson {
  firstName: string
  lastName: string
  document: string
  phone: string
}

const DOC_RE = /^[0-9A-Za-z.\- ]{3,20}$/

/** Pases primero: es lo que más se vende en el mostrador. */
function salesOrder(a: MembershipPlan, b: MembershipPlan) {
  const pa = FIXED_PLAN_DAYS[a.plan_type] ? 0 : 1
  const pb = FIXED_PLAN_DAYS[b.plan_type] ? 0 : 1
  return pa - pb || a.sort_order - b.sort_order || a.price - b.price
}

export function QuickSalePage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const studentId = params.get('alumno')
  const initialDoc = (location.state as { doc?: string } | null)?.doc ?? ''
  const [person, setPerson] = useState<NewPerson | null>(
    initialDoc && !studentId ? { firstName: '', lastName: '', document: /\d/.test(initialDoc) ? initialDoc : '', phone: '' } : null,
  )

  return (
    <>
      <PageHeader title="Venta rápida" description="Pase o plan, cobro y recibo en un solo paso. Recibo interno, no fiscal." />
      {studentId || person ? (
        <SaleForm
          key={studentId ?? 'new'}
          studentId={studentId}
          person={person}
          onPersonChange={setPerson}
          onChangeStudent={() => {
            setPerson(null)
            setParams({})
          }}
        />
      ) : (
        <StudentPicker
          placeholder="Buscar por documento o nombre"
          onPick={(id) => setParams({ alumno: id })}
          notFound={(term) => (
            <Button variant="outline" onClick={() => setPerson({ firstName: '', lastName: '', document: /\d/.test(term) ? term : '', phone: '' })}>
              <UserPlus /> Registrar persona nueva
            </Button>
          )}
        />
      )}
      {!studentId && !person && (
        <div className="mt-3 text-center">
          <Button variant="ghost" onClick={() => setPerson({ firstName: '', lastName: '', document: '', phone: '' })}>
            <UserPlus /> Es una persona nueva
          </Button>
        </div>
      )}
    </>
  )
}

function SaleForm({
  studentId,
  person,
  onPersonChange,
  onChangeStudent,
}: {
  studentId: string | null
  person: NewPerson | null
  onPersonChange: (p: NewPerson) => void
  onChangeStudent: () => void
}) {
  const { gymId } = useAuth()
  const navigate = useNavigate()
  const student = useStudent(studentId ?? undefined)
  const plans = usePlans(gymId)
  const methods = usePaymentMethods(gymId)
  const session = useOpenSession(gymId)
  const sale = useQuickSale(gymId)
  // Una clave por formulario: un doble toque o un reintento no vende dos veces.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])

  const [planId, setPlanId] = useState('')
  const [methodId, setMethodId] = useState('')
  const [reference, setReference] = useState('')
  const [checkIn, setCheckIn] = useState(true)
  const [touched, setTouched] = useState(false)

  const activePlans = (plans.data ?? []).filter((p) => p.is_active).sort(salesOrder)
  const plan = activePlans.find((p) => p.id === planId)
  const activeMethods = (methods.data ?? []).filter((m) => m.is_active)
  const method = activeMethods.find((m) => m.id === methodId) ?? activeMethods[0]
  const free = plan?.price === 0
  const needsCash = !free && !!method?.affects_cash && !session.data

  const personErrors = person
    ? {
        firstName: !person.firstName.trim() ? 'Ingrese el nombre' : undefined,
        lastName: !person.lastName.trim() ? 'Ingrese el apellido' : undefined,
        document: !DOC_RE.test(person.document.trim()) ? 'Documento inválido' : undefined,
      }
    : {}
  const personInvalid = Object.values(personErrors).some(Boolean)

  const submit = () => {
    setTouched(true)
    if (personInvalid) return
    if (!plan) return toast.error('Elegí un pase o plan')
    if (!free && !method) return toast.error('No hay medios de pago activos')
    sale.mutate(
      {
        studentId,
        firstName: person?.firstName.trim() ?? '',
        lastName: person?.lastName.trim() ?? '',
        document: person?.document.trim() ?? '',
        phone: person?.phone.trim() ?? '',
        planId: plan.id,
        methodId: free ? null : method!.id,
        reference,
        checkIn,
        idempotencyKey,
      },
      {
        onSuccess: (r) => {
          if (checkIn && !r.check_in) toast.warning('Venta registrada. Tiene cuotas anteriores pendientes: el ingreso se registra aparte, con motivo.')
          else toast.success(r.check_in ? 'Venta e ingreso registrados.' : 'Venta registrada.')
          navigate(r.payment_id ? `/recibo/${r.payment_id}` : `/ingreso?alumno=${r.student_id}`, { replace: true })
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  if (studentId && student.isLoading) return <LoadingState />

  const set = (k: keyof NewPerson) => (e: React.ChangeEvent<HTMLInputElement>) => person && onPersonChange({ ...person, [k]: e.target.value })

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
            <div>
              <CardTitle>{student.data ? fullName(student.data) : 'Persona nueva'}</CardTitle>
              {student.data && <p className="text-sm text-muted-foreground">CI {student.data.document_number}</p>}
            </div>
            <Button variant="ghost" size="sm" onClick={onChangeStudent}>
              <X /> Cambiar
            </Button>
          </CardHeader>
          {person && (
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" htmlFor="qs-first" error={touched ? personErrors.firstName : undefined}>
                <Input id="qs-first" autoFocus maxLength={80} value={person.firstName} onChange={set('firstName')} />
              </Field>
              <Field label="Apellido" htmlFor="qs-last" error={touched ? personErrors.lastName : undefined}>
                <Input id="qs-last" maxLength={80} value={person.lastName} onChange={set('lastName')} />
              </Field>
              <Field label="Documento (CI)" htmlFor="qs-doc" error={touched ? personErrors.document : undefined} hint="Si ya existe, se usa su ficha.">
                <Input id="qs-doc" inputMode="numeric" maxLength={20} value={person.document} onChange={set('document')} />
              </Field>
              <Field label="Teléfono (opcional)" htmlFor="qs-phone">
                <Input id="qs-phone" type="tel" maxLength={30} value={person.phone} onChange={set('phone')} />
              </Field>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pase o plan</CardTitle>
          </CardHeader>
          <CardContent>
            {plans.isLoading ? (
              <LoadingState />
            ) : !activePlans.length ? (
              <EmptyState title="No hay planes activos" description="Un administrador debe crearlos en Catálogo → Planes." />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {activePlans.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlanId(p.id)}
                    className={cn(
                      'rounded-lg border p-3 text-left',
                      planId === p.id ? 'border-graphite bg-graphite text-smoke' : 'border-border bg-card hover:bg-muted',
                    )}
                  >
                    <span className="block font-medium">{p.name}</span>
                    <span className={cn('text-xs', planId === p.id ? 'text-smoke/80' : 'text-muted-foreground')}>
                      {PLAN_TYPE_LABELS[p.plan_type]} · {planDurationLabel(p)}
                    </span>
                    <span className="mt-1 block font-semibold tabular-nums">{formatPYG(p.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="h-fit lg:sticky lg:top-6">
        <CardContent className="space-y-4 pt-5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total</span>
            <span className="text-xl font-bold tabular-nums">{plan ? formatPYG(plan.price) : '—'}</span>
          </div>
          {plan && <p className="text-xs text-muted-foreground">Desde hoy · {planDurationLabel(plan)}</p>}
          {!free && (
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
                      method?.id === m.id ? 'border-graphite bg-graphite text-smoke' : 'border-border bg-card hover:bg-muted',
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!free && method && !method.affects_cash && (
            <Field label="Referencia (opcional)" htmlFor="qs-ref" hint="Nº de transferencia o comprobante del POS.">
              <Input id="qs-ref" value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
            </Field>
          )}
          <CheckboxField id="qs-checkin" label="Registrar el ingreso ahora" checked={checkIn} onChange={(e) => setCheckIn(e.target.checked)} />
          {needsCash && (
            <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">
              Para cobrar en efectivo abrí la caja primero.{' '}
              <Link to="/caja" className="font-medium underline">
                Ir a Caja
              </Link>
            </p>
          )}
          <Button size="lg" variant="accent" className="w-full" disabled={!plan || needsCash} loading={sale.isPending} onClick={submit}>
            {plan ? (free ? 'Registrar' : `Cobrar ${formatPYG(plan.price)}`) : 'Elegí un pase'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
