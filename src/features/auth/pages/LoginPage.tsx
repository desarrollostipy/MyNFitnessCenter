import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { loginIdentifierToEmail } from '@/lib/ciAuth'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { useAuth } from '../AuthProvider'
import { AuthLayout } from './AuthLayout'

const schema = z.object({
  // CI (cuentas creadas en recepción) o email (invitaciones).
  identifier: z.string().trim().min(3, 'Ingrese su CI o email'),
  password: z.string().min(1, 'Ingrese su contraseña'),
})
type FormValues = z.infer<typeof schema>

export function LoginPage() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/inicio'

  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) })

  if (session) return <Navigate to={from} replace />

  const onSubmit = async (values: FormValues) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: loginIdentifierToEmail(values.identifier),
      password: values.password,
    })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    navigate(from, { replace: true })
  }

  const { errors, isSubmitting } = formState

  return (
    <AuthLayout title="Ingresar" subtitle="Acceda con su número de CI (o email) y su clave.">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <Field label="CI o email" htmlFor="identifier" error={errors.identifier?.message}>
          <Input id="identifier" autoComplete="username" autoCapitalize="none" aria-invalid={!!errors.identifier} {...register('identifier')} />
        </Field>
        <Field label="Clave o PIN" htmlFor="password" error={errors.password?.message}>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={!!errors.password}
            {...register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" loading={isSubmitting}>
          Ingresar
        </Button>
        <p className="text-center text-sm">
          <Link to="/recuperar" className="text-muted-foreground hover:text-foreground hover:underline">
            ¿Olvidó su clave?
          </Link>
        </p>
      </form>
    </AuthLayout>
  )
}
