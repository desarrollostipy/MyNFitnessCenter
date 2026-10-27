import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { LoadingState } from '@/components/states'
import { useAuth } from '../AuthProvider'
import { newPasswordSchema, type NewPasswordValues } from '../schemas'
import { AuthLayout } from './AuthLayout'

// Destino de los enlaces de recuperación e invitación: Supabase abre la sesión desde la URL.
export function ResetPasswordPage() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, formState } = useForm<NewPasswordValues>({
    resolver: zodResolver(newPasswordSchema),
  })

  if (loading) return <LoadingState />

  if (!session) {
    return (
      <AuthLayout title="Enlace inválido o vencido">
        <p className="text-sm text-muted-foreground">Solicite un nuevo enlace de recuperación.</p>
        <Button asChild className="mt-4 w-full">
          <Link to="/recuperar">Solicitar enlace</Link>
        </Button>
      </AuthLayout>
    )
  }

  const onSubmit = async ({ password }: NewPasswordValues) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    toast.success('Contraseña actualizada.')
    navigate('/inicio', { replace: true })
  }

  const { errors, isSubmitting } = formState
  return (
    <AuthLayout title="Nueva contraseña" subtitle={session.user.email}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Nueva contraseña" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...register('password')} />
        </Field>
        <Field label="Repetir contraseña" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Guardar contraseña
        </Button>
      </form>
    </AuthLayout>
  )
}
