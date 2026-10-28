import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatPYG, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { usePaymentMethods } from '@/features/catalog/api'
import { useOpenSession } from '@/features/cash/api'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { MoneyInput, Select } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { ReasonDialog } from '@/components/ReasonDialog'
import { BarList } from '@/components/BarList'
import { PeriodPicker, periodFor, type Period } from '@/components/PeriodPicker'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { Expense } from '@/types/domain'
import { useExpenseCategories, useExpenses, useRegisterExpense, useSaveCategory, useVoidExpense } from './api'

export function ExpensesPage() {
  const { gymId, hasRole } = useAuth()
  const canRegister = hasRole('admin', 'treasurer')
  const [period, setPeriod] = useState<Period>(periodFor('month'))
  const q = useExpenses(gymId, period.from, period.to)
  const voidExpense = useVoidExpense()
  const [creating, setCreating] = useState(false)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [voiding, setVoiding] = useState<Expense | null>(null)

  const posted = (q.data ?? []).filter((e) => e.status === 'posted')
  const total = posted.reduce((s, e) => s + Number(e.amount), 0)
  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const e of posted) {
      const n = e.expense_categories?.name ?? '—'
      m.set(n, (m.get(n) ?? 0) + Number(e.amount))
    }
    return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount)
  }, [posted])

  return (
    <>
      <PageHeader
        title="Egresos"
        description="Gastos del gimnasio. Los pagados en efectivo salen de la caja abierta."
        actions={
          <>
            {hasRole('admin') && (
              <Button variant="outline" onClick={() => setCategoriesOpen(true)} aria-label="Categorías">
                <Tags /> <span className="hidden sm:inline">Categorías</span>
              </Button>
            )}
            {canRegister && (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Registrar egreso
              </Button>
            )}
          </>
        }
      />
      <PeriodPicker value={period} onChange={setPeriod} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="overflow-hidden">
          {q.isLoading ? (
            <LoadingState />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : !q.data?.length ? (
            <EmptyState title="Sin egresos en el período" />
          ) : (
            <ul className="divide-y divide-border">
              {q.data.map((e) => (
                <li key={e.id} className={cn('flex items-start gap-3 px-4 py-3', e.status === 'voided' && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.expense_categories?.name} · {e.payment_methods?.name} · {formatDate(e.paid_on)}
                    </p>
                    {(e.supplier || e.document_ref) && (
                      <p className="text-xs text-muted-foreground">{[e.supplier, e.document_ref].filter(Boolean).join(' · ')}</p>
                    )}
                    {e.status === 'voided' && <p className="text-xs text-destructive">Anulado: {e.void_reason}</p>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={cn('font-medium tabular-nums', e.status === 'voided' && 'line-through')}>{formatPYG(e.amount)}</span>
                    {e.status === 'voided' ? (
                      <Badge tone="danger">Anulado</Badge>
                    ) : (
                      hasRole('admin') && (
                        <button className="text-[11px] text-muted-foreground hover:text-destructive hover:underline" onClick={() => setVoiding(e)}>
                          Anular
                        </button>
                      )
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <p className="text-xs text-muted-foreground">Total del período</p>
            <CardTitle className="text-2xl tabular-nums">{formatPYG(total)}</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList items={byCategory} />
          </CardContent>
        </Card>
      </div>

      {creating && <ExpenseDialog onClose={() => setCreating(false)} />}
      {categoriesOpen && <CategoriesDialog onClose={() => setCategoriesOpen(false)} />}
      {voiding && (
        <ReasonDialog
          title="Anular egreso"
          description={`${voiding.description} — ${formatPYG(voiding.amount)}. Si fue en efectivo, el importe vuelve a la caja abierta.`}
          confirmLabel="Anular egreso"
          loading={voidExpense.isPending}
          onClose={() => setVoiding(null)}
          onConfirm={(reason) =>
            voidExpense.mutate(
              { id: voiding.id, reason },
              {
                onSuccess: () => {
                  toast.success('Egreso anulado.')
                  setVoiding(null)
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }
        />
      )}
    </>
  )
}

const schema = z.object({
  category_id: z.string().min(1, 'Elija la categoría'),
  description: z.string().trim().min(3, 'Describa el egreso').max(200),
  amount: z.number({ error: 'Ingrese el importe' }).int().positive('Ingrese el importe'),
  method_id: z.string().min(1, 'Elija el medio de pago'),
  paid_on: z.string().min(1),
  supplier: z.string().trim().max(120),
  document_ref: z.string().trim().max(60),
})
type FormValues = z.infer<typeof schema>

function ExpenseDialog({ onClose }: { onClose: () => void }) {
  const { gymId } = useAuth()
  const categories = useExpenseCategories(gymId)
  const methods = usePaymentMethods(gymId)
  const session = useOpenSession(gymId)
  const register = useRegisterExpense(gymId)
  const idempotencyKey = useMemo(() => crypto.randomUUID(), [])
  const { register: field, control, handleSubmit, watch, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { category_id: '', description: '', method_id: '', paid_on: todayISO(), supplier: '', document_ref: '' },
  })
  const { errors } = formState
  const activeMethods = (methods.data ?? []).filter((m) => m.is_active)
  const method = activeMethods.find((m) => m.id === watch('method_id'))
  const needsCash = !!method?.affects_cash && !session.data

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Registrar egreso">
      <form
        noValidate
        className="space-y-4"
        onSubmit={handleSubmit((v) =>
          register.mutate(
            {
              categoryId: v.category_id,
              description: v.description,
              amount: v.amount,
              methodId: v.method_id,
              paidOn: v.paid_on,
              supplier: v.supplier,
              documentRef: v.document_ref,
              idempotencyKey,
            },
            {
              onSuccess: () => {
                toast.success('Egreso registrado.')
                onClose()
              },
              onError: (e) => toast.error(errorMessage(e)),
            },
          ),
        )}
      >
        <Field label="Categoría" htmlFor="ex-cat" error={errors.category_id?.message}>
          <Select id="ex-cat" {...field('category_id')}>
            <option value="">Seleccionar…</option>
            {(categories.data ?? [])
              .filter((c) => c.is_active)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label="Descripción" htmlFor="ex-desc" error={errors.description?.message}>
          <Input id="ex-desc" placeholder="Ej.: Alquiler de noviembre" {...field('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Importe" htmlFor="ex-amount" error={errors.amount?.message}>
            <Controller
              control={control}
              name="amount"
              render={({ field: f }) => <MoneyInput id="ex-amount" value={f.value} onChange={(v) => f.onChange(v ?? undefined)} onBlur={f.onBlur} />}
            />
          </Field>
          <Field label="Fecha de pago" htmlFor="ex-date">
            <Input id="ex-date" type="date" min={todayISO(-60)} max={todayISO()} {...field('paid_on')} />
          </Field>
          <Field label="Medio de pago" htmlFor="ex-method" error={errors.method_id?.message}>
            <Select id="ex-method" {...field('method_id')}>
              <option value="">Seleccionar…</option>
              {activeMethods.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Proveedor (opcional)" htmlFor="ex-supplier">
            <Input id="ex-supplier" {...field('supplier')} />
          </Field>
        </div>
        <Field label="Nº de factura o comprobante del proveedor (opcional)" htmlFor="ex-doc">
          <Input id="ex-doc" placeholder="001-001-0001234" {...field('document_ref')} />
        </Field>
        {needsCash && <p className="rounded-lg bg-warning/10 p-3 text-sm text-warning">Para pagar en efectivo abrí la caja primero.</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={register.isPending} disabled={needsCash}>
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function CategoriesDialog({ onClose }: { onClose: () => void }) {
  const { gymId } = useAuth()
  const categories = useExpenseCategories(gymId)
  const save = useSaveCategory(gymId)
  const [name, setName] = useState('')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Categorías de egreso" description="Las categorías no se borran: se desactivan.">
      <div className="space-y-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (name.trim().length < 2) return
            save.mutate(
              { name: name.trim() },
              {
                onSuccess: () => {
                  setName('')
                  toast.success('Categoría creada.')
                },
                onError: (err) => toast.error(errorMessage(err)),
              },
            )
          }}
        >
          <Input placeholder="Nueva categoría" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Nueva categoría" />
          <Button type="submit" loading={save.isPending}>
            Agregar
          </Button>
        </form>
        <ul className="divide-y divide-border">
          {(categories.data ?? []).map((c) => (
            <li key={c.id} className="flex items-center justify-between py-2 text-sm">
              <span className={c.is_active ? '' : 'text-muted-foreground line-through'}>{c.name}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => save.mutate({ id: c.id, is_active: !c.is_active }, { onError: (err) => toast.error(errorMessage(err)) })}
              >
                {c.is_active ? 'Desactivar' : 'Activar'}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  )
}
