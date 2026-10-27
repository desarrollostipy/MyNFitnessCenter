import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { Gym } from '@/types/domain'

const optional = (max: number) => z.string().trim().max(max)

const schema = z.object({
  name: z.string().trim().min(2, 'Ingrese el nombre comercial').max(120),
  legal_name: optional(160),
  ruc: optional(20).regex(/^(\d{1,8}-\d)?$/, 'Formato RUC: 1234567-8'),
  phone: optional(30),
  email: z.union([z.literal(''), z.string().trim().email('Email inválido')]),
  address: optional(250),
})
type FormValues = z.infer<typeof schema>

export function GymSettingsPage() {
  const { gymId } = useAuth()
  const qc = useQueryClient()

  const gym = useQuery({
    queryKey: ['gym', gymId],
    queryFn: async () => {
      const { data, error } = await supabase.from('gyms').select('*').eq('id', gymId).single()
      if (error) throw error
      return data as Gym
    },
  })

  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  useEffect(() => {
    if (gym.data) {
      const g = gym.data
      form.reset({
        name: g.name,
        legal_name: g.legal_name ?? '',
        ruc: g.ruc ?? '',
        phone: g.phone ?? '',
        email: g.email ?? '',
        address: g.address ?? '',
      })
    }
  }, [gym.data, form])

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const nul = (s: string) => (s === '' ? null : s)
      const { error } = await supabase
        .from('gyms')
        .update({
          name: v.name,
          legal_name: nul(v.legal_name),
          ruc: nul(v.ruc),
          phone: nul(v.phone),
          email: nul(v.email),
          address: nul(v.address),
        })
        .eq('id', gymId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Configuración guardada.')
      qc.invalidateQueries({ queryKey: ['gym', gymId] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const { errors } = form.formState

  return (
    <>
      <PageHeader title="Configuración" description="Datos de la empresa." />
      {gym.isLoading ? (
        <LoadingState />
      ) : gym.isError ? (
        <ErrorState error={gym.error} onRetry={() => gym.refetch()} />
      ) : (
        <Card className="max-w-2xl">
          <CardHeader>
            <CardTitle>Empresa</CardTitle>
            <CardDescription>
              Zona horaria {gym.data?.timezone} · Moneda {gym.data?.currency}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="grid gap-4 sm:grid-cols-2" noValidate>
              <Field label="Nombre comercial" htmlFor="name" error={errors.name?.message}>
                <Input id="name" {...form.register('name')} />
              </Field>
              <Field label="Razón social" htmlFor="legal_name" error={errors.legal_name?.message}>
                <Input id="legal_name" {...form.register('legal_name')} />
              </Field>
              <Field label="RUC" htmlFor="ruc" error={errors.ruc?.message}>
                <Input id="ruc" placeholder="1234567-8" {...form.register('ruc')} />
              </Field>
              <Field label="Teléfono" htmlFor="phone" error={errors.phone?.message}>
                <Input id="phone" type="tel" {...form.register('phone')} />
              </Field>
              <Field label="Email" htmlFor="email" error={errors.email?.message}>
                <Input id="email" type="email" {...form.register('email')} />
              </Field>
              <Field label="Dirección" htmlFor="address" error={errors.address?.message}>
                <Input id="address" {...form.register('address')} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </>
  )
}
