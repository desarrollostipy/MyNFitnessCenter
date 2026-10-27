import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { CheckboxField, MoneyInput, Textarea } from '@/components/ui/form-controls'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { Service } from '@/types/domain'
import { useSaveService, useServices } from './api'

const schema = z.object({
  name: z.string().trim().min(2, 'Ingrese el nombre').max(120),
  description: z.string().trim().max(2000),
  duration_minutes: z.coerce.number<number>().int().min(5, 'Mínimo 5 minutos').max(600),
  price: z.number({ error: 'Ingrese el precio' }).int().min(0),
  cancellation_hours: z.coerce.number<number>().int().min(0).max(168, 'Máximo 168 horas'),
  no_show_consumes_credit: z.boolean(),
  is_bookable: z.boolean(),
  is_commissionable: z.boolean(),
  is_public: z.boolean(),
  is_active: z.boolean(),
  sort_order: z.coerce.number<number>().int().min(0).max(999),
})
type FormValues = z.infer<typeof schema>

const EMPTY: FormValues = {
  name: '',
  description: '',
  duration_minutes: 60,
  price: 0,
  cancellation_hours: 12,
  no_show_consumes_credit: true,
  is_bookable: true,
  is_commissionable: true,
  is_public: true,
  is_active: true,
  sort_order: 0,
}

export function ServicesPage() {
  const { gymId } = useAuth()
  const services = useServices(gymId)
  const [editing, setEditing] = useState<Service | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title="Servicios"
        description="Entrenamientos y sesiones individuales que se pueden reservar o incluir en planes."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Nuevo servicio
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {services.isLoading ? (
          <LoadingState />
        ) : services.isError ? (
          <ErrorState error={services.error} onRetry={() => services.refetch()} />
        ) : !services.data?.length ? (
          <EmptyState title="Todavía no hay servicios" description="Cree el primer servicio para poder usarlo en planes y reservas." />
        ) : (
          <ul className="divide-y divide-border">
            {services.data.map((s) => (
              <li key={s.id} className={cn('flex items-center gap-3 px-4 py-3', !s.is_active && 'text-muted-foreground')}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.duration_minutes} min · cancelación {s.cancellation_hours} h antes
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge tone={s.is_active ? 'accent' : 'neutral'}>{s.is_active ? 'Activo' : 'Inactivo'}</Badge>
                    {s.is_public && <Badge>Público</Badge>}
                    {s.is_bookable && <Badge>Reservable</Badge>}
                  </div>
                </div>
                <p className="whitespace-nowrap text-right font-medium tabular-nums">{formatPYG(s.price)}</p>
                <Button variant="ghost" size="icon" onClick={() => setEditing(s)} aria-label={`Editar ${s.name}`}>
                  <Pencil />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && <ServiceDialog service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </>
  )
}

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const { gymId } = useAuth()
  const save = useSaveService(gymId)
  const { register, control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: service ? { ...service, description: service.description ?? '' } : EMPTY,
  })
  const { errors } = formState

  const onSubmit = (v: FormValues) =>
    save.mutate(
      { ...v, id: service?.id, description: v.description || null },
      {
        onSuccess: () => {
          toast.success(service ? 'Servicio actualizado.' : 'Servicio creado.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={service ? 'Editar servicio' : 'Nuevo servicio'}>
      <form onSubmit={handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
        <Field label="Nombre" htmlFor="s-name" error={errors.name?.message}>
          <Input id="s-name" aria-invalid={!!errors.name} {...register('name')} />
        </Field>
        <Field label="Descripción" htmlFor="s-desc" error={errors.description?.message}>
          <Textarea id="s-desc" {...register('description')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duración (minutos)" htmlFor="s-dur" error={errors.duration_minutes?.message}>
            <Input id="s-dur" type="number" min={5} {...register('duration_minutes')} />
          </Field>
          <Field label="Precio por sesión" htmlFor="s-price" error={errors.price?.message}>
            <Controller
              control={control}
              name="price"
              render={({ field }) => (
                <MoneyInput id="s-price" value={field.value} onChange={(v) => field.onChange(v ?? 0)} onBlur={field.onBlur} invalid={!!errors.price} />
              )}
            />
          </Field>
          <Field
            label="Cancelación sin cargo (horas antes)"
            htmlFor="s-cancel"
            error={errors.cancellation_hours?.message}
          >
            <Input id="s-cancel" type="number" min={0} {...register('cancellation_hours')} />
          </Field>
          <Field label="Orden de aparición" htmlFor="s-order" error={errors.sort_order?.message}>
            <Input id="s-order" type="number" min={0} {...register('sort_order')} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxField id="s-bookable" label="Reservable" hint="Aparece en la agenda de reservas." {...register('is_bookable')} />
          <CheckboxField id="s-comm" label="Genera comisión" hint="Base para honorarios porcentuales." {...register('is_commissionable')} />
          <CheckboxField id="s-noshow" label="La ausencia consume crédito" hint="Si el alumno no asiste, se descuenta la sesión." {...register('no_show_consumes_credit')} />
          <CheckboxField id="s-public" label="Visible en la web pública" {...register('is_public')} />
          <CheckboxField id="s-active" label="Activo" hint="Los inactivos no pueden usarse en nuevas operaciones." {...register('is_active')} />
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
