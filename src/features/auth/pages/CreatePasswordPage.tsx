import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Navigate, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { LoadingState } from '@/components/states'
import { useAuth } from '../AuthProvider'
import { newPasswordSchema, type NewPasswordValues } from '../schemas'
import { AuthLayout } from './AuthLayout'

/** Primer ingreso con PIN temporal: la persona crea su propia clave antes de usar el sistema. */
export function CreatePasswordPage() {
  const { session, loading, mustChangePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const { register, handleSubmit, formState } = useForm<NewPasswordValues>({ resolver: zodResolver(newPasswordSchema) })

  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/login" replace />
  if (!mustChangePassword) return <Navigate to="/inicio" replace />

  const onSubmit = async ({ password }: NewPasswordValues) => {
    const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    toast.success('Clave creada. Desde ahora ingresá con ella.')
    navigate('/inicio', { replace: true })
  }

  const { errors, isSubmitting } = formState

  return (
    <AuthLayout title="Creá tu clave" subtitle="Ingresaste con un PIN temporal. Elegí una clave propia para seguir.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="Nueva clave" htmlFor="password" error={errors.password?.message} hint="Mínimo 8 caracteres, con letras y números.">
          <Input id="password" type="password" autoComplete="new-password" autoFocus {...register('password')} />
        </Field>
        <Field label="Repetir clave" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register('confirm')} />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Guardar y entrar
        </Button>
        <button type="button" onClick={signOut} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
          Salir
        </button>
      </form>
    </AuthLayout>
  )
}
