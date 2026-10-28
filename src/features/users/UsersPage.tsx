import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { ALL_ROLES, ROLE_LABELS, type AdminUserRow, type AppRole } from '@/types/domain'
import { useAdminUsers, useInviteUser, useSetUserRole } from './api'

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

type PendingChange = { user: AdminUserRow; role: AppRole; enabled: boolean }

export function UsersPage() {
  const { gymId, session } = useAuth()
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const users = useAdminUsers(gymId, debounced)
  const setRole = useSetUserRole(gymId)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)

  const apply = (change: PendingChange) =>
    setRole.mutate(
      { userId: change.user.user_id, role: change.role, enabled: change.enabled },
      {
        onSuccess: () => {
          toast.success(
            `${change.enabled ? 'Asignado' : 'Quitado'} el perfil ${ROLE_LABELS[change.role]} a ${change.user.full_name || change.user.email}.`,
          )
          setPending(null)
        },
        onError: (e) => {
          toast.error(errorMessage(e))
          setPending(null)
        },
      },
    )

  const onToggle = (user: AdminUserRow, role: AppRole, enabled: boolean) => {
    const change = { user, role, enabled }
    // Los perfiles administrativos y cualquier cambio sobre uno mismo requieren confirmación.
    const critical = ['admin', 'accountant', 'treasurer'].includes(role) || user.user_id === session?.user.id
    if (critical) setPending(change)
    else apply(change)
  }

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Habilite los perfiles de cada usuario. Un usuario puede tener varios perfiles."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus /> Invitar usuario
          </Button>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre o email"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar usuarios"
        />
      </div>

      <Card className="overflow-hidden">
        {users.isLoading ? (
          <LoadingState />
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : !users.data?.length ? (
          <EmptyState
            title={debounced ? 'Sin resultados' : 'Todavía no hay usuarios'}
            description={debounced ? 'Pruebe con otro nombre o email.' : 'Invite al primer usuario del equipo.'}
          />
        ) : (
          <>
          {/* Celular: una tarjeta por usuario con los perfiles como casillas. */}
          <ul className="divide-y divide-border md:hidden">
            {users.data.map((u) => (
              <li key={u.user_id} className="px-4 py-3">
                <p className="font-medium">{u.full_name || '—'}</p>
                <p className="text-xs text-muted-foreground">{u.email}</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4 accent-brand"
                        checked={u.roles.includes(r)}
                        disabled={setRole.isPending && setRole.variables?.userId === u.user_id && setRole.variables?.role === r}
                        onChange={(e) => onToggle(u, r, e.target.checked)}
                      />
                      {ROLE_LABELS[r]}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  {ALL_ROLES.map((r) => (
                    <th key={r} className="px-2 py-3 text-center font-medium">
                      {ROLE_LABELS[r]}
                    </th>
                  ))}
                  <th className="px-4 py-3 font-medium">Último ingreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.data.map((u) => (
                  <tr key={u.user_id} className="hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">{u.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    {ALL_ROLES.map((r) => {
                      const checked = u.roles.includes(r)
                      const busy =
                        setRole.isPending &&
                        setRole.variables?.userId === u.user_id &&
                        setRole.variables?.role === r
                      return (
                        <td key={r} className="px-2 py-3 text-center">
                          <input
                            type="checkbox"
                            className="size-4 accent-brand"
                            checked={checked}
                            disabled={busy}
                            onChange={(e) => onToggle(u, r, e.target.checked)}
                            aria-label={`${ROLE_LABELS[r]} para ${u.email}`}
                          />
                        </td>
                      )
                    })}
                    <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                      {formatDateTime(u.last_sign_in_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={pending?.enabled ? 'Asignar perfil' : 'Quitar perfil'}
        description={
          pending
            ? `¿${pending.enabled ? 'Asignar' : 'Quitar'} el perfil "${ROLE_LABELS[pending.role]}" ${pending.enabled ? 'a' : 'de'} ${pending.user.full_name || pending.user.email}? La operación queda registrada en auditoría.`
            : ''
        }
        destructive={!pending?.enabled}
        loading={setRole.isPending}
        onConfirm={() => pending && apply(pending)}
      />

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} />
    </>
  )
}

const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Ingrese el nombre').max(120),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  role: z.enum(ALL_ROLES as [AppRole, ...AppRole[]]),
})
type InviteValues = z.infer<typeof inviteSchema>

function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { gymId } = useAuth()
  const invite = useInviteUser(gymId)
  const { register, handleSubmit, reset, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'student' },
  })

  const onSubmit = (values: InviteValues) =>
    invite.mutate(values, {
      onSuccess: () => {
        toast.success(`Invitación enviada a ${values.email}.`)
        reset({ full_name: '', email: '', role: 'student' })
        onOpenChange(false)
      },
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invitar usuario"
      description="Recibirá un email para crear su contraseña."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Nombre completo" htmlFor="inv-name" error={formState.errors.full_name?.message}>
          <Input id="inv-name" {...register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="inv-email" error={formState.errors.email?.message}>
          <Input id="inv-email" type="email" {...register('email')} />
        </Field>
        <Field label="Perfil inicial" htmlFor="inv-role">
          <select
            id="inv-role"
            className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm"
            {...register('role')}
          >
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" loading={invite.isPending}>
            Enviar invitación
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
