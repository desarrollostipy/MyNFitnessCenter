import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useSearchParams } from 'react-router-dom'
import { CircleCheck } from 'lucide-react'
import { errorMessage } from '@/lib/errors'
import { todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Select, Textarea } from '@/components/ui/form-controls'
import { LEAD_INTEREST_LABELS, type LeadInterest } from '@/types/domain'
import { usePublicPlans, usePublicServices, useSubmitLead } from './api'

const TIPO_TO_INTEREST: Record<string, LeadInterest> = {
  inscripcion: 'enrollment',
  clase_prueba: 'trial_class',
  info: 'info',
}

const INTEREST_HELP: Record<LeadInterest, string> = {
  info: 'Consultas generales sobre planes, horarios y servicios.',
  enrollment: 'Queremos conocerte para preparar tu inscripción.',
  trial_class: 'Coordinamos una clase de prueba con un profesor.',
}

const schema = z
  .object({
    full_name: z.string().trim().min(2, 'Ingresá tu nombre').max(120),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine((v) => v === '' || /^[+\d][\d\s()-]{5,}$/.test(v), 'Teléfono inválido'),
    email: z.union([z.literal(''), z.string().trim().email('Email inválido')]),
    interest: z.enum(['info', 'enrollment', 'trial_class']),
    plan_id: z.string(),
    service_id: z.string(),
    preferred_date: z.string(),
    message: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
    website: z.string(), // trampa para bots: debe quedar vacío
    consent: z.literal(true, { error: 'Necesitamos tu autorización para contactarte' }),
  })
  .refine((v) => v.phone !== '' || v.email !== '', {
    path: ['phone'],
    message: 'Ingresá un teléfono o un email',
  })
type FormValues = z.infer<typeof schema>

export function ContactPage() {
  const [params] = useSearchParams()
  const plans = usePublicPlans()
  const services = usePublicServices()
  const submit = useSubmitLead()
  const [done, setDone] = useState(false)

  const { register, handleSubmit, control, formState, setError } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      full_name: '',
      phone: '',
      email: '',
      interest: TIPO_TO_INTEREST[params.get('tipo') ?? ''] ?? 'info',
      plan_id: params.get('plan') ?? '',
      service_id: params.get('servicio') ?? '',
      preferred_date: '',
      message: '',
      website: '',
    },
  })
  const interest = useWatch({ control, name: 'interest' })
  const { errors, isSubmitting } = formState

  const onSubmit = async (v: FormValues) => {
    if (v.website) {
      setDone(true)
      return
    }
    try {
      await submit.mutateAsync({
        ...v,
        plan_id: v.interest === 'enrollment' ? v.plan_id : '',
        service_id: v.interest === 'trial_class' ? v.service_id : '',
        preferred_date: v.interest === 'trial_class' ? v.preferred_date : '',
      })
      setDone(true)
    } catch (e) {
      setError('root', { message: errorMessage(e) })
    }
  }

  if (done) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
        <CircleCheck className="size-12 text-success" />
        <h1 className="mt-4 text-2xl font-semibold">¡Gracias! Recibimos tu solicitud.</h1>
        <p className="mt-2 text-muted-foreground">Te contactaremos a la brevedad por el medio que indicaste.</p>
        <Button asChild variant="outline" className="mt-8">
          <Link to="/planes">Ver planes</Link>
        </Button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Contacto</h1>
      <p className="mt-2 text-muted-foreground">{INTEREST_HELP[interest]}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">¿Qué necesitás?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(LEAD_INTEREST_LABELS) as LeadInterest[]).map((i) => (
              <label
                key={i}
                className={cn(
                  'flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-sm',
                  interest === i ? 'border-graphite bg-graphite text-smoke' : 'border-border bg-card hover:bg-muted',
                )}
              >
                <input type="radio" value={i} className="sr-only" {...register('interest')} />
                {LEAD_INTEREST_LABELS[i]}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Nombre y apellido" htmlFor="c-name" error={errors.full_name?.message}>
          <Input id="c-name" autoComplete="name" aria-invalid={!!errors.full_name} {...register('full_name')} />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Teléfono / WhatsApp" htmlFor="c-phone" error={errors.phone?.message}>
            <Input id="c-phone" type="tel" autoComplete="tel" placeholder="0981 123 456" aria-invalid={!!errors.phone} {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="c-email" error={errors.email?.message}>
            <Input id="c-email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
        </div>

        {interest === 'enrollment' && (
          <Field label="Plan de interés" htmlFor="c-plan">
            <Select id="c-plan" {...register('plan_id')}>
              <option value="">Todavía no sé</option>
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {interest === 'trial_class' && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Servicio" htmlFor="c-service">
              <Select id="c-service" {...register('service_id')}>
                <option value="">Cualquiera</option>
                {(services.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha preferida" htmlFor="c-date" hint="Sujeta a disponibilidad.">
              <Input id="c-date" type="date" min={todayISO()} max={todayISO(90)} {...register('preferred_date')} />
            </Field>
          </div>
        )}

        <Field label="Mensaje (opcional)" htmlFor="c-msg" error={errors.message?.message}>
          <Textarea id="c-msg" rows={4} {...register('message')} />
        </Field>

        {/* Campo trampa: invisible para personas, los bots suelen completarlo. */}
        <div className="absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="c-website">No completar</label>
          <input id="c-website" tabIndex={-1} autoComplete="off" {...register('website')} />
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-graphite" {...register('consent')} />
          <span>Autorizo a M&N Fitness a contactarme por teléfono, WhatsApp o email para responder esta solicitud.</span>
        </label>
        {errors.consent && (
          <p className="text-xs text-destructive" role="alert">
            {errors.consent.message}
          </p>
        )}

        {errors.root && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
            {errors.root.message}
          </p>
        )}

        <Button type="submit" size="lg" className="w-full sm:w-auto" loading={isSubmitting}>
          Enviar solicitud
        </Button>
      </form>
    </section>
  )
}
