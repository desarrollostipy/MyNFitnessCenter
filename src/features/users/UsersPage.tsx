import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { KeyRound, Mail, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/format'
import { accountLabel, ciFromEmail, normalizeDocument } from '@/lib/ciAuth'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/form-controls'
import { Card } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { ALL_ROLES, ROLE_LABELS, type AdminUserRow, type AppRole } from '@/types/domain'
import { useAdminUsers, useCreateUser, useResetPin, useSetUserRole } from './api'
import { PinDialog, type PinInfo } from './PinDialog'

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
  const resetPin = useResetPin(gymId)
  const [pending, setPending] = useState<PendingChange | null>(null)
  const [dialog, setDialog] = useState<'ci' | 'email' | null>(null)
  const [pinFor, setPinFor] = useState<AdminUserRow | null>(null)
  const [pinInfo, setPinInfo] = useState<PinInfo | null>(null)

  const nameOf = (u: AdminUserRow) => u.full_name || accountLabel(u.email)

  const apply = (change: PendingChange) =>
    setRole.mutate(
      { userId: change.user.user_id, role: change.role, enabled: change.enabled },
      {
        onSuccess: () => {
          toast.success(`${change.enabled ? 'Asignado' : 'Quitado'} el perfil ${ROLE_LABELS[change.role]} a ${nameOf(change.user)}.`)
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

  const doResetPin = (u: AdminUserRow) =>
    resetPin.mutate(u.user_id, {
      onSuccess: (r) => {
        setPinFor(null)
        if (r.pin) setPinInfo({ name: nameOf(u), account: accountLabel(u.email), pin: r.pin })
      },
      onError: (e) => {
        setPinFor(null)
        toast.error(errorMessage(e))
      },
    })

  const pinButton = (u: AdminUserRow) =>
    u.user_id !== session?.user.id && (
      <Button variant="outline" size="sm" onClick={() => setPinFor(u)}>
        <KeyRound /> Nuevo PIN
      </Button>
    )

  return (
    <>
      <PageHeader
        title="Usuarios"
        description="Cree cuentas con el número de CI y habilite los perfiles de cada usuario."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog('email')}>
              <Mail /> Invitar por email
            </Button>
            <Button onClick={() => setDialog('ci')}>
              <UserPlus /> Crear usuario
            </Button>
          </div>
        }
      />

      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, CI o email"
          className="pl-10"
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
            description={debounced ? 'Pruebe con otro nombre, CI o email.' : 'Cree el primer usuario del equipo.'}
          />
        ) : (
          <>
            {/* Celular: una tarjeta por usuario con los perfiles como casillas. */}
            <ul className="divide-y divide-border md:hidden">
              {users.data.map((u) => (
                <li key={u.user_id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{u.full_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{accountLabel(u.email)}</p>
                    </div>
                    {pinButton(u)}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {ALL_ROLES.map((r) => (
                      <label key={r} className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm">
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
                    <th className="px-4 py-3" aria-label="Acceso" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.data.map((u) => (
                    <tr key={u.user_id} className="hover:bg-muted/50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{u.full_name || '—'}</p>
                        <p className="text-xs text-muted-foreground">{accountLabel(u.email)}</p>
                      </td>
                      {ALL_ROLES.map((r) => {
                        const busy = setRole.isPending && setRole.variables?.userId === u.user_id && setRole.variables?.role === r
                        return (
                          <td key={r} className="px-2 py-3 text-center">
                            <input
                              type="checkbox"
                              className="size-4 accent-brand"
                              checked={u.roles.includes(r)}
                              disabled={busy}
                              onChange={(e) => onToggle(u, r, e.target.checked)}
                              aria-label={`${ROLE_LABELS[r]} para ${nameOf(u)}`}
                            />
                          </td>
                        )
                      })}
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(u.last_sign_in_at)}</td>
                      <td className="px-4 py-3 text-right">{pinButton(u)}</td>
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
            ? `¿${pending.enabled ? 'Asignar' : 'Quitar'} el perfil "${ROLE_LABELS[pending.role]}" ${pending.enabled ? 'a' : 'de'} ${nameOf(pending.user)}? La operación queda registrada en auditoría.`
            : ''
        }
        destructive={!pending?.enabled}
        loading={setRole.isPending}
        onConfirm={() => pending && apply(pending)}
      />

      <ConfirmDialog
        open={!!pinFor}
        onOpenChange={(o) => !o && setPinFor(null)}
        title="Generar un PIN nuevo"
        description={
          pinFor
            ? `${nameOf(pinFor)} dejará de poder ingresar con su clave actual y deberá usar el PIN nuevo (y luego crear su clave). Queda registrado en auditoría.${ciFromEmail(pinFor.email) ? '' : ' Esta cuenta ingresa con email: el PIN reemplaza su contraseña.'}`
            : ''
        }
        confirmLabel="Generar PIN"
        loading={resetPin.isPending}
        onConfirm={() => pinFor && doResetPin(pinFor)}
      />

      {dialog === 'ci' && <CreateByCiDialog onClose={() => setDialog(null)} onCreated={setPinInfo} />}
      {dialog === 'email' && <InviteDialog onClose={() => setDialog(null)} />}
      <PinDialog info={pinInfo} onClose={() => setPinInfo(null)} />
    </>
  )
}

const ciSchema = z.object({
  full_name: z.string().trim().min(2, 'Ingrese el nombre').max(120),
  document: z
    .string()
    .trim()
    .refine((v) => /^[0-9A-Z-]{3,20}$/.test(normalizeDocument(v)), 'Número de documento inválido'),
  role: z.enum(ALL_ROLES as [AppRole, ...AppRole[]]),
})
type CiValues = z.infer<typeof ciSchema>

function CreateByCiDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: PinInfo) => void }) {
  const { gymId } = useAuth()
  const create = useCreateUser(gymId)
  const { register, handleSubmit, formState } = useForm<CiValues>({
    resolver: zodResolver(ciSchema),
    defaultValues: { full_name: '', document: '', role: 'treasurer' },
  })

  const onSubmit = (v: CiValues) =>
    create.mutate(
      { full_name: v.full_name, document: v.document, role: v.role },
      {
        onSuccess: (r) => {
          onClose()
          if (r.pin) onCreated({ name: v.full_name, account: `CI ${v.document}`, pin: r.pin })
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Crear usuario" description="Ingresa con su número de CI y un PIN que se genera ahora.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Nombre completo" htmlFor="ci-name" error={formState.errors.full_name?.message}>
          <Input id="ci-name" autoFocus {...register('full_name')} />
        </Field>
        <Field label="Número de CI" htmlFor="ci-doc" error={formState.errors.document?.message}>
          <Input id="ci-doc" inputMode="numeric" autoComplete="off" {...register('document')} />
        </Field>
        <Field label="Perfil inicial" htmlFor="ci-role" hint="Después puede sumar otros perfiles desde la tabla.">
          <Select id="ci-role" {...register('role')}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={create.isPending}>
            Crear y generar PIN
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

const inviteSchema = z.object({
  full_name: z.string().trim().min(2, 'Ingrese el nombre').max(120),
  email: z.string().trim().toLowerCase().email('Email inválido'),
  role: z.enum(ALL_ROLES as [AppRole, ...AppRole[]]),
})
type InviteValues = z.infer<typeof inviteSchema>

function InviteDialog({ onClose }: { onClose: () => void }) {
  const { gymId } = useAuth()
  const invite = useCreateUser(gymId)
  const { register, handleSubmit, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: 'student' },
  })

  const onSubmit = (values: InviteValues) =>
    invite.mutate(values, {
      onSuccess: () => {
        toast.success(`Invitación enviada a ${values.email}.`)
        onClose()
      },
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Invitar por email" description="Recibirá un email para crear su contraseña.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Nombre completo" htmlFor="inv-name" error={formState.errors.full_name?.message}>
          <Input id="inv-name" {...register('full_name')} />
        </Field>
        <Field label="Email" htmlFor="inv-email" error={formState.errors.email?.message}>
          <Input id="inv-email" type="email" {...register('email')} />
        </Field>
        <Field label="Perfil inicial" htmlFor="inv-role">
          <Select id="inv-role" {...register('role')}>
            {ALL_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
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
