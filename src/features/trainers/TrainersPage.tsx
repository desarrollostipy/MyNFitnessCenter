import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Pencil, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useAdminUsers } from '@/features/users/api'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField, Select } from '@/components/ui/form-controls'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { fullName, type Trainer } from '@/types/domain'
import { useSaveTrainer, useTrainers } from './api'

export function TrainersPage() {
  const { gymId } = useAuth()
  const trainers = useTrainers(gymId)
  const [editing, setEditing] = useState<Trainer | 'new' | null>(null)

  return (
    <>
      <PageHeader
        title="Entrenadores"
        description="Ficha básica y vínculo con el usuario del sistema. Remuneración y disponibilidad se habilitan en un próximo incremento."
        actions={
          <Button onClick={() => setEditing('new')}>
            <Plus /> Nuevo entrenador
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {trainers.isLoading ? (
          <LoadingState />
        ) : trainers.isError ? (
          <ErrorState error={trainers.error} onRetry={() => trainers.refetch()} />
        ) : !trainers.data?.length ? (
          <EmptyState title="Todavía no hay entrenadores" />
        ) : (
          <ul className="divide-y divide-border">
            {trainers.data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className={t.is_active ? 'font-medium' : 'font-medium text-muted-foreground'}>{fullName(t)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[t.specialties, t.phone, t.email].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!t.user_id && <Badge tone="danger">Sin usuario</Badge>}
                  <Badge tone={t.is_active ? 'accent' : 'neutral'}>{t.is_active ? 'Activo' : 'Inactivo'}</Badge>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(t)} aria-label={`Editar ${fullName(t)}`}>
                    <Pencil /> Editar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {editing && (
        <TrainerDialog
          trainer={editing === 'new' ? null : editing}
          linkedUserIds={(trainers.data ?? []).map((t) => t.user_id).filter((x): x is string => !!x)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}

const schema = z.object({
  first_name: z.string().trim().min(1, 'Ingrese el nombre').max(80),
  last_name: z.string().trim().min(1, 'Ingrese el apellido').max(80),
  document_number: z
    .string()
    .transform((v) => v.replace(/[\s.]/g, '').toUpperCase())
    .pipe(z.union([z.literal(''), z.string().regex(/^[0-9A-Z-]{3,20}$/, 'Documento inválido')])),
  phone: z.string().trim().max(30),
  email: z.union([z.literal(''), z.string().trim().email('Email inválido')]),
  specialties: z.string().trim().max(500),
  user_id: z.string(),
  is_active: z.boolean(),
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

function TrainerDialog({
  trainer,
  linkedUserIds,
  onClose,
}: {
  trainer: Trainer | null
  linkedUserIds: string[]
  onClose: () => void
}) {
  const { gymId } = useAuth()
  const save = useSaveTrainer(gymId)
  const users = useAdminUsers(gymId, '')
  const candidates = (users.data ?? []).filter(
    (u) => u.roles.includes('trainer') && (!linkedUserIds.includes(u.user_id) || u.user_id === trainer?.user_id),
  )
  const { register, handleSubmit, formState } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: trainer?.first_name ?? '',
      last_name: trainer?.last_name ?? '',
      document_number: trainer?.document_number ?? '',
      phone: trainer?.phone ?? '',
      email: trainer?.email ?? '',
      specialties: trainer?.specialties ?? '',
      user_id: trainer?.user_id ?? '',
      is_active: trainer?.is_active ?? true,
    },
  })
  const { errors } = formState
  const nul = (s: string) => (s === '' ? null : s)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={trainer ? 'Editar entrenador' : 'Nuevo entrenador'}>
      <form
        onSubmit={handleSubmit((v) =>
          save.mutate(
            {
              id: trainer?.id,
              first_name: v.first_name,
              last_name: v.last_name,
              document_number: nul(v.document_number),
              phone: nul(v.phone),
              email: nul(v.email),
              specialties: nul(v.specialties),
              user_id: nul(v.user_id),
              is_active: v.is_active,
            },
            {
              onSuccess: () => {
                toast.success(trainer ? 'Entrenador actualizado.' : 'Entrenador creado.')
                onClose()
              },
              onError: (e) => {
                const pg = e as { code?: string }
                toast.error(pg.code === '23505' ? 'Documento o usuario ya vinculado a otro entrenador.' : errorMessage(e))
              },
            },
          ),
        )}
        className="space-y-4"
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="t-first" error={errors.first_name?.message}>
            <Input id="t-first" {...register('first_name')} />
          </Field>
          <Field label="Apellido" htmlFor="t-last" error={errors.last_name?.message}>
            <Input id="t-last" {...register('last_name')} />
          </Field>
          <Field label="Documento" htmlFor="t-doc" error={errors.document_number?.message}>
            <Input id="t-doc" {...register('document_number')} />
          </Field>
          <Field label="Teléfono" htmlFor="t-phone" error={errors.phone?.message}>
            <Input id="t-phone" type="tel" {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="t-email" error={errors.email?.message}>
            <Input id="t-email" type="email" {...register('email')} />
          </Field>
          <Field label="Especialidades" htmlFor="t-spec" error={errors.specialties?.message}>
            <Input id="t-spec" placeholder="Fuerza, funcional…" {...register('specialties')} />
          </Field>
        </div>
        <Field
          label="Usuario del sistema"
          htmlFor="t-user"
          hint="Sólo usuarios con perfil Entrenador. Sin vínculo, el entrenador no puede ver a sus alumnos."
        >
          <Select id="t-user" {...register('user_id')}>
            <option value="">Sin vincular</option>
            {candidates.map((u) => (
              <option key={u.user_id} value={u.user_id}>
                {u.full_name || u.email} ({u.email})
              </option>
            ))}
          </Select>
        </Field>
        <CheckboxField id="t-active" label="Activo" hint="Un entrenador inactivo pierde el acceso a sus alumnos." {...register('is_active')} />
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
