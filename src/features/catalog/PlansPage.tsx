import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField, MoneyInput, Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { FIXED_PLAN_MONTHS, PLAN_TYPE_LABELS, type MembershipPlan, type PlanType } from '@/types/domain'
import { usePlans, useSavePlan, useServices } from './api'
import { planDurationLabel } from './planUtils'

const PLAN_TYPES = Object.keys(PLAN_TYPE_LABELS) as PlanType[]

const schema = z
  .object({
    name: z.string().trim().min(2, 'Ingrese el nombre').max(120),
    description: z.string().trim().max(2000),
    plan_type: z.enum(PLAN_TYPES as [PlanType, ...PlanType[]]),
    price: z.number({ error: 'Ingrese el precio' }).int().min(0),
    duration_unit: z.enum(['months', 'days']),
    duration_value: z.coerce.number<number>().int().min(1, 'Mínimo 1'),
    included_sessions: z.coerce.number<number>().int().min(0).max(500),
    included_service_id: z.string().optional(),
    benefits_text: z.string().max(4000),
    conditions: z.string().trim().max(4000),
    is_public: z.boolean(),
    is_active: z.boolean(),
    sort_order: z.coerce.number<number>().int().min(0).max(999),
  })
  .superRefine((v, ctx) => {
    if (v.plan_type === 'sessions' && v.included_sessions < 1)
      ctx.addIssue({ code: 'custom', path: ['included_sessions'], message: 'Un plan por sesiones debe incluir al menos 1 sesión' })
    if (v.included_sessions > 0 && !v.included_service_id)
      ctx.addIssue({ code: 'custom', path: ['included_service_id'], message: 'Indique a qué servicio corresponden las sesiones' })
    const max = v.duration_unit === 'months' ? 36 : 1095
    if (v.duration_value > max)
      ctx.addIssue({ code: 'custom', path: ['duration_value'], message: `Máximo ${max}` })
    if (v.benefits_text.split('\n').filter((b) => b.trim()).length > 20)
      ctx.addIssue({ code: 'custom', path: ['benefits_text'], message: 'Máximo 20 beneficios' })
  })
type FormValues = z.infer<typeof schema>

function toForm(p: MembershipPlan | null): FormValues {
  if (!p)
    return {
      name: '',
      description: '',
      plan_type: 'monthly',
      price: 0,
      duration_unit: 'months',
      duration_value: 1,
      included_sessions: 0,
      included_service_id: '',
      benefits_text: '',
      conditions: '',
      is_public: true,
      is_active: true,
      sort_order: 0,
    }
  return {
    name: p.name,
    description: p.description ?? '',
    plan_type: p.plan_type,
    price: p.price,
    duration_unit: p.duration_months ? 'months' : 'days',
    duration_value: p.duration_months ?? p.duration_days ?? 1,
    included_sessions: p.included_sessions,
    included_service_id: p.included_service_id ?? '',
    benefits_text: p.benefits.join('\n'),
    conditions: p.conditions ?? '',
    is_public: p.is_public,
    is_active: p.is_active,
    sort_order: p.sort_order,
  }
}

export function PlansPage() {
  const { gymId } = useAuth()
  const plans = usePlans(gymId)
  const [editing, setEditing] = useState<MembershipPlan | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title="Planes"
        description="Membresías y paquetes que se ofrecen a los alumnos."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Nuevo plan
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {plans.isLoading ? (
          <LoadingState />
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
        ) : !plans.data?.length ? (
          <EmptyState title="Todavía no hay planes" description="Cree el primer plan de membresía." />
        ) : (
          <ul className="divide-y divide-border">
            {plans.data.map((p) => (
              <li key={p.id} className={cn('flex items-center gap-3 px-4 py-3', !p.is_active && 'text-muted-foreground')}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {PLAN_TYPE_LABELS[p.plan_type]} · {planDurationLabel(p)}
                    {p.included_sessions ? ` · ${p.included_sessions} sesiones` : ''}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={p.is_active ? 'accent' : 'neutral'}>{p.is_active ? 'Activo' : 'Inactivo'}</Badge>
                    {p.is_public && <Badge>Público</Badge>}
                  </div>
                </div>
                <p className="whitespace-nowrap text-right font-medium tabular-nums">{formatPYG(p.price)}</p>
                <Button variant="ghost" size="icon" onClick={() => setEditing(p)} aria-label={`Editar ${p.name}`}>
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <PlanDialog plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function PlanDialog({ plan, onClose }: { plan: MembershipPlan | null; onClose: () => void }) {
  const { gymId } = useAuth()
  const save = useSavePlan(gymId)
  const services = useServices(gymId)
  const { register, control, handleSubmit, setValue, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: toForm(plan),
  })
  const { errors } = formState
  const planType = useWatch({ control, name: 'plan_type' })
  const includedSessions = useWatch({ control, name: 'included_sessions' })
  const fixedMonths = FIXED_PLAN_MONTHS[planType]

  const onTypeChange = (t: PlanType) => {
    const months = FIXED_PLAN_MONTHS[t]
    if (months) {
      setValue('duration_unit', 'months')
      setValue('duration_value', months)
    } else if (t === 'sessions') {
      setValue('duration_unit', 'days')
      setValue('duration_value', 30)
    }
  }

  const onSubmit = (v: FormValues) => {
    const months = FIXED_PLAN_MONTHS[v.plan_type]
    const unit = months ? 'months' : v.duration_unit
    const value = months ?? v.duration_value
    save.mutate(
      {
        id: plan?.id,
        name: v.name,
        description: v.description || null,
        plan_type: v.plan_type,
        price: v.price,
        duration_months: unit === 'months' ? value : null,
        duration_days: unit === 'days' ? value : null,
        included_sessions: v.included_sessions,
        included_service_id: v.included_sessions > 0 ? v.included_service_id || null : null,
        benefits: v.benefits_text.split('\n').map((b) => b.trim()).filter(Boolean),
        conditions: v.conditions || null,
        is_public: v.is_public,
        is_active: v.is_active,
        sort_order: v.sort_order,
      },
      {
        onSuccess: () => {
          toast.success(plan ? 'Plan actualizado.' : 'Plan creado.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  const activeServices = (services.data ?? []).filter((s) => s.is_active || s.id === plan?.included_service_id)

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={plan ? 'Editar plan' : 'Nuevo plan'}
      description={plan ? 'Los cambios de precio aplican a nuevas membresías; las vigentes conservan su precio pactado.' : undefined}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
        <Field label="Nombre" htmlFor="p-name" error={errors.name?.message}>
          <Input id="p-name" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo de plan" htmlFor="p-type">
            <Select id="p-type" {...register('plan_type', { onChange: (e) => onTypeChange(e.target.value) })}>
              {PLAN_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PLAN_TYPE_LABELS[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Precio" htmlFor="p-price" error={errors.price?.message}>
            <Controller
              control={control}
              name="price"
              render={({ field }) => (
                <MoneyInput id="p-price" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} invalid={!!errors.price} />
              )}
            />
          </Field>
          <Field
            label="Vigencia"
            htmlFor="p-dur"
            error={errors.duration_value?.message}
            hint={fixedMonths ? 'Fija según el tipo de plan.' : undefined}
          >
            {/* Para tipos con vigencia fija se muestra el valor; el envío lo fija onSubmit. */}
            {fixedMonths ? (
              <Input id="p-dur" readOnly value={fixedMonths === 1 ? '1 mes' : `${fixedMonths} meses`} />
            ) : (
              <div className="flex gap-2">
                <Input id="p-dur" type="number" min={1} className="w-24" {...register('duration_value')} />
                <Select aria-label="Unidad de vigencia" {...register('duration_unit')}>
                  <option value="months">meses</option>
                  <option value="days">días</option>
                </Select>
              </div>
            )}
          </Field>
          <Field label="Orden de aparición" htmlFor="p-order" error={errors.sort_order?.message}>
            <Input id="p-order" type="number" min={0} {...register('sort_order')} />
          </Field>
          <Field label="Sesiones incluidas" htmlFor="p-sessions" error={errors.included_sessions?.message} hint="0 si el plan no incluye sesiones.">
            <Input id="p-sessions" type="number" min={0} {...register('included_sessions')} />
          </Field>
          <Field label="Servicio de las sesiones" htmlFor="p-service" error={errors.included_service_id?.message}>
            <Select id="p-service" disabled={!Number(includedSessions)} {...register('included_service_id')}>
              <option value="">— Seleccionar —</option>
              {activeServices.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descripción" htmlFor="p-desc" error={errors.description?.message}>
          <Textarea id="p-desc" {...register('description')} />
        </Field>
        <Field label="Beneficios" htmlFor="p-benefits" hint="Uno por línea." error={errors.benefits_text?.message}>
          <Textarea id="p-benefits" rows={4} {...register('benefits_text')} />
        </Field>
        <Field label="Condiciones" htmlFor="p-cond" error={errors.conditions?.message}>
          <Textarea id="p-cond" {...register('conditions')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField id="p-public" label="Visible en la web pública" {...register('is_public')} />
          <CheckboxField id="p-active" label="Activo" hint="Los inactivos no se ofrecen en nuevas inscripciones." {...register('is_active')} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
