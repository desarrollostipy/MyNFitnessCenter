import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { isValidRuc } from '@/lib/fiscal'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField } from '@/components/ui/form-controls'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/components/states'
import { useGym } from './api'

const optional = (max: number) => z.string().trim().max(max)
const digits = (n: number, label: string) => z.string().trim().regex(new RegExp(`^(\\d{${n}})?$`), `${label}: ${n} dígitos`)

const schema = z.object({
  name: z.string().trim().min(2, 'Ingrese el nombre comercial').max(120),
  legal_name: optional(160),
  ruc: optional(20).refine((v) => v === '' || isValidRuc(v), 'RUC inválido (formato 1234567-8, revise el dígito verificador)'),
  phone: optional(30),
  email: z.union([z.literal(''), z.string().trim().email('Email inválido')]),
  address: optional(250),
  fiscal_timbrado: digits(8, 'Timbrado'),
  fiscal_timbrado_from: z.string(),
  fiscal_establishment: digits(3, 'Establecimiento'),
  fiscal_point: digits(3, 'Punto de expedición'),
  fiscal_activity: optional(160),
  fiscal_transaction_type: z.string().trim().min(3, 'Indique el tipo de transacción').max(80),
  module_training: z.boolean(),
  module_achievements: z.boolean(),
  module_ranking: z.boolean(),
})
type FormValues = z.infer<typeof schema>

export function GymSettingsPage() {
  const { gymId } = useAuth()
  const qc = useQueryClient()
  const gym = useGym()

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
        fiscal_timbrado: g.fiscal_timbrado ?? '',
        fiscal_timbrado_from: g.fiscal_timbrado_from ?? '',
        fiscal_establishment: g.fiscal_establishment ?? '',
        fiscal_point: g.fiscal_point ?? '',
        fiscal_activity: g.fiscal_activity ?? '',
        fiscal_transaction_type: g.fiscal_transaction_type,
        module_training: g.module_training,
        module_achievements: g.module_achievements,
        module_ranking: g.module_ranking,
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
          fiscal_timbrado: nul(v.fiscal_timbrado),
          fiscal_timbrado_from: nul(v.fiscal_timbrado_from),
          fiscal_establishment: nul(v.fiscal_establishment),
          fiscal_point: nul(v.fiscal_point),
          fiscal_activity: nul(v.fiscal_activity),
          fiscal_transaction_type: v.fiscal_transaction_type,
          module_training: v.module_training,
          module_achievements: v.module_achievements,
          module_ranking: v.module_ranking,
        })
        .eq('id', gymId)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Configuración guardada.')
      qc.invalidateQueries({ queryKey: ['gym', gymId] })
      qc.invalidateQueries({ queryKey: ['invoice-draft'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const { errors } = form.formState

  return (
    <>
      <PageHeader title="Configuración" description="Datos de la empresa, facturación y portal del alumno." />
      {gym.isLoading ? (
        <LoadingState />
      ) : gym.isError ? (
        <ErrorState error={gym.error} onRetry={() => gym.refetch()} />
      ) : (
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="max-w-2xl space-y-4" noValidate>
          <Card>
            <CardHeader>
              <CardTitle>Empresa</CardTitle>
              <CardDescription>
                Zona horaria {gym.data?.timezone} · Moneda {gym.data?.currency}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Facturación electrónica</CardTitle>
              <CardDescription>
                Copie estos datos tal como figuran en su factura de e-Kuatia. Las facturas se emiten en el facturador de la DNIT y
                acá se registra el CDC de cada una.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Timbrado N°" htmlFor="fiscal_timbrado" error={errors.fiscal_timbrado?.message}>
                <Input id="fiscal_timbrado" inputMode="numeric" placeholder="12345678" {...form.register('fiscal_timbrado')} />
              </Field>
              <Field label="Inicio de vigencia" htmlFor="fiscal_timbrado_from" error={errors.fiscal_timbrado_from?.message}>
                <Input id="fiscal_timbrado_from" type="date" {...form.register('fiscal_timbrado_from')} />
              </Field>
              <Field label="Establecimiento" htmlFor="fiscal_establishment" error={errors.fiscal_establishment?.message}>
                <Input id="fiscal_establishment" inputMode="numeric" placeholder="001" {...form.register('fiscal_establishment')} />
              </Field>
              <Field label="Punto de expedición" htmlFor="fiscal_point" error={errors.fiscal_point?.message}>
                <Input id="fiscal_point" inputMode="numeric" placeholder="001" {...form.register('fiscal_point')} />
              </Field>
              <Field label="Actividad económica" htmlFor="fiscal_activity" error={errors.fiscal_activity?.message}>
                <Input id="fiscal_activity" placeholder="Administración de instalaciones deportivas" {...form.register('fiscal_activity')} />
              </Field>
              <Field
                label="Tipo de transacción"
                htmlFor="fiscal_transaction_type"
                error={errors.fiscal_transaction_type?.message}
                hint="Para cuotas y pases suele ser «Prestación de servicios». Confírmelo con su contador."
              >
                <Input id="fiscal_transaction_type" {...form.register('fiscal_transaction_type')} />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Portal del alumno</CardTitle>
              <CardDescription>
                Módulos opcionales que ven los alumnos en su portal. La asistencia sale del control de ingreso de recepción (y del
                molinete cuando esté conectado).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CheckboxField
                id="module_training"
                label="Mis entrenamientos"
                hint="Calendario de días entrenados, racha semanal y sesiones restantes de los planes por sesiones."
                {...form.register('module_training')}
              />
              <CheckboxField
                id="module_achievements"
                label="Logros y compartir"
                hint="Medallas por constancia y tarjetas para compartir en redes. Requiere «Mis entrenamientos»."
                {...form.register('module_achievements')}
              />
              <CheckboxField
                id="module_ranking"
                label="Ranking del mes"
                hint="Los alumnos que más entrenaron en el mes, con nombre corto (María G.). Cada alumno puede elegir no aparecer."
                {...form.register('module_ranking')}
              />
            </CardContent>
          </Card>

          <Button type="submit" loading={save.isPending} disabled={!form.formState.isDirty}>
            Guardar cambios
          </Button>
        </form>
      )}
    </>
  )
}
