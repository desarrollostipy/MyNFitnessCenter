import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { newPasswordSchema, type NewPasswordValues } from '@/features/auth/schemas'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/states'
import { ROLE_LABELS } from '@/types/domain'

const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'Ingrese su nombre').max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+\s()-]*$/, 'Sólo números, espacios y + ( ) -'),
})
type ProfileValues = z.infer<typeof profileSchema>

export function ProfilePage() {
  const { session, profile, roles } = useAuth()
  const queryClient = useQueryClient()
  const userId = session!.user.id

  const profileForm = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', phone: '' },
  })
  useEffect(() => {
    if (profile) profileForm.reset({ full_name: profile.full_name, phone: profile.phone ?? '' })
  }, [profile, profileForm])

  const saveProfile = useMutation({
    mutationFn: async (values: ProfileValues) => {
      const { error } = await supabase
        .from('user_profiles')
        .update({ full_name: values.full_name, phone: values.phone || null })
        .eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Datos actualizados.')
      queryClient.invalidateQueries({ queryKey: ['profile', userId] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const pwdForm = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) })
  const changePassword = useMutation({
    mutationFn: async ({ password }: NewPasswordValues) => {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Contraseña actualizada.')
      pwdForm.reset({ password: '', confirm: '' })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <>
      <PageHeader title="Mi perfil" description={session?.user.email} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
            <CardDescription>
              Perfiles:{' '}
              {roles.length ? (
                roles.map((r) => (
                  <Badge key={r} className="mr-1">
                    {ROLE_LABELS[r]}
                  </Badge>
                ))
              ) : (
                <span>sin perfil asignado. Un administrador debe habilitarlo.</span>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={profileForm.handleSubmit((v) => saveProfile.mutate(v))}
              className="space-y-4"
              noValidate
            >
              <Field label="Nombre completo" htmlFor="full_name" error={profileForm.formState.errors.full_name?.message}>
                <Input id="full_name" autoComplete="name" {...profileForm.register('full_name')} />
              </Field>
              <Field label="Teléfono" htmlFor="phone" error={profileForm.formState.errors.phone?.message}>
                <Input id="phone" type="tel" autoComplete="tel" placeholder="+595 981 000 000" {...profileForm.register('phone')} />
              </Field>
              <Button type="submit" loading={saveProfile.isPending}>
                Guardar
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={pwdForm.handleSubmit((v) => changePassword.mutate(v))}
              className="space-y-4"
              noValidate
            >
              <Field label="Nueva contraseña" htmlFor="new-password" error={pwdForm.formState.errors.password?.message}>
                <Input id="new-password" type="password" autoComplete="new-password" {...pwdForm.register('password')} />
              </Field>
              <Field label="Repetir contraseña" htmlFor="confirm-password" error={pwdForm.formState.errors.confirm?.message}>
                <Input id="confirm-password" type="password" autoComplete="new-password" {...pwdForm.register('confirm')} />
              </Field>
              <Button type="submit" variant="outline" loading={changePassword.isPending}>
                Actualizar contraseña
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
