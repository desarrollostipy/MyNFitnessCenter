import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField } from '@/components/ui/form-controls'
import { Badge, Card } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { PaymentMethod } from '@/types/domain'
import { usePaymentMethods, useSavePaymentMethod } from './api'

export function PaymentMethodsPage() {
  const { gymId } = useAuth()
  const methods = usePaymentMethods(gymId)
  const save = useSavePaymentMethod(gymId)
  const [creating, setCreating] = useState(false)
  const [toggling, setToggling] = useState<PaymentMethod | null>(null)

  const toggle = (m: PaymentMethod) =>
    save.mutate(
      { id: m.id, is_active: !m.is_active },
      {
        onSuccess: () => {
          toast.success(`${m.name} ${m.is_active ? 'desactivado' : 'activado'}.`)
          setToggling(null)
        },
        onError: (e) => {
          toast.error(errorMessage(e))
          setToggling(null)
        },
      },
    )

  return (
    <>
      <PageHeader
        title="Medios de pago"
        description="Sólo los medios marcados como efectivo generan movimientos en la caja física."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nuevo medio
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {methods.isLoading ? (
          <LoadingState />
        ) : methods.isError ? (
          <ErrorState error={methods.error} onRetry={() => methods.refetch()} />
        ) : !methods.data?.length ? (
          <EmptyState title="Sin medios de pago" description="Ejecute supabase/seed.sql o cree uno nuevo." />
        ) : (
          <ul className="divide-y divide-border">
            {methods.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className={m.is_active ? 'font-medium' : 'font-medium text-muted-foreground'}>{m.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{m.code}</p>
                </div>
                <div className="flex items-center gap-2">
                  {m.affects_cash && <Badge tone="dark">Caja física</Badge>}
                  <Badge tone={m.is_active ? 'accent' : 'neutral'}>{m.is_active ? 'Activo' : 'Inactivo'}</Badge>
                  <Button variant="outline" size="sm" onClick={() => setToggling(m)}>
                    {m.is_active ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ConfirmDialog
        open={!!toggling}
        onOpenChange={(o) => !o && setToggling(null)}
        title={toggling?.is_active ? 'Desactivar medio de pago' : 'Activar medio de pago'}
        description={
          toggling?.is_active
            ? `"${toggling.name}" dejará de ofrecerse en nuevos cobros. Los cobros históricos no cambian.`
            : `"${toggling?.name}" volverá a estar disponible para cobros.`
        }
        destructive={!!toggling?.is_active}
        loading={save.isPending}
        onConfirm={() => toggling && toggle(toggling)}
      />
      {creating && <NewMethodDialog onClose={() => setCreating(false)} />}
    </>
  )
}

const schema = z.object({
  name: z.string().trim().min(2, 'Ingrese el nombre').max(60),
  code: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{1,29}$/, 'Minúsculas, números y guion bajo; empieza con letra (ej.: billetera_tigo)'),
  affects_cash: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function NewMethodDialog({ onClose }: { onClose: () => void }) {
  const { gymId } = useAuth()
  const save = useSavePaymentMethod(gymId)
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', code: '', affects_cash: false },
  })
  const { errors } = formState

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Nuevo medio de pago" description="El código no podrá modificarse después.">
      <form
        onSubmit={handleSubmit((v) =>
          save.mutate(v, {
            onSuccess: () => {
              toast.success('Medio de pago creado.')
              onClose()
            },
            onError: (e) => toast.error(errorMessage(e)),
          }),
        )}
        className="space-y-4"
        noValidate
      >
        <Field label="Nombre" htmlFor="m-name" error={errors.name?.message}>
          <Input id="m-name" placeholder="Billetera electrónica" {...register('name')} />
        </Field>
        <Field label="Código interno" htmlFor="m-code" error={errors.code?.message}>
          <Input id="m-code" placeholder="billetera" {...register('code')} />
        </Field>
        <CheckboxField id="m-cash" label="Es efectivo físico" hint="Requiere caja abierta y genera movimientos de caja." {...register('affects_cash')} />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Crear
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
