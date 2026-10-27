import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { AuthLayout } from './AuthLayout'

const schema = z.object({ email: z.string().trim().email('Ingrese un email válido') })
type FormValues = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async ({ email }: FormValues) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer`,
    })
    if (error) {
      toast.error(errorMessage(error))
      return
    }
    // Mismo mensaje exista o no la cuenta, para no revelar qué emails están registrados.
    setSent(true)
  }

  return (
    <AuthLayout title="Recuperar contraseña" subtitle="Le enviaremos un enlace para crear una nueva.">
      {sent ? (
        <div className="space-y-4 text-sm">
          <p>Si el email está registrado, recibirá un enlace en los próximos minutos. Revise también la carpeta de spam.</p>
          <Button asChild variant="outline" className="w-full">
            <Link to="/login">Volver a ingresar</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" {...register('email')} />
          </Field>
          <Button type="submit" className="w-full" loading={formState.isSubmitting}>
            Enviar enlace
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="text-muted-foreground hover:underline">
              Volver
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  )
}
