import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { useAuth } from '@/features/auth/AuthProvider'
import { errorMessage } from '@/lib/errors'
import { todayISO } from '@/lib/format'
import { isValidRuc } from '@/lib/fiscal'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/form-controls'
import { Dialog } from '@/components/ui/dialog'
import type { Student } from '@/types/domain'
import { useSaveStudent, type StudentInput } from './api'

const phone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === '' || /^[+\d][\d\s()-]{5,}$/.test(v), 'Teléfono inválido')

const schema = z.object({
  first_name: z.string().trim().min(1, 'Ingrese el nombre').max(80),
  last_name: z.string().trim().min(1, 'Ingrese el apellido').max(80),
  document_number: z
    .string()
    .transform((v) => v.replace(/[\s.]/g, '').toUpperCase())
    .pipe(z.string().regex(/^[0-9A-Z-]{3,20}$/, 'Documento inválido (sólo números, letras y guion)')),
  birth_date: z
    .string()
    .refine((v) => v === '' || (v >= '1900-01-01' && v <= todayISO()), 'Fecha inválida'),
  phone,
  email: z.union([z.literal(''), z.string().trim().email('Email inválido')]),
  address: z.string().trim().max(250),
  enrolled_on: z.string().min(1, 'Ingrese la fecha de inscripción'),
  emergency_contact_name: z.string().trim().max(120),
  emergency_contact_phone: phone,
  notes: z.string().trim().max(2000),
  billing_ruc: z.string().trim().refine((v) => v === '' || isValidRuc(v), 'RUC inválido (formato 1234567-8, revise el dígito verificador)'),
  billing_name: z.string().trim().max(160),
}).refine((v) => (v.billing_ruc === '') === (v.billing_name === ''), {
  path: ['billing_name'],
  message: 'Para facturar a RUC complete RUC y razón social',
})
type FormInput = z.input<typeof schema>
type FormOutput = z.output<typeof schema>

export interface StudentPrefill {
  first_name?: string
  last_name?: string
  phone?: string
  email?: string
}

function toForm(s: Student | null, prefill?: StudentPrefill): FormInput {
  return {
    first_name: s?.first_name ?? prefill?.first_name ?? '',
    last_name: s?.last_name ?? prefill?.last_name ?? '',
    document_number: s?.document_number ?? '',
    birth_date: s?.birth_date ?? '',
    phone: s?.phone ?? prefill?.phone ?? '',
    email: s?.email ?? prefill?.email ?? '',
    address: s?.address ?? '',
    enrolled_on: s?.enrolled_on ?? todayISO(),
    emergency_contact_name: s?.emergency_contact_name ?? '',
    emergency_contact_phone: s?.emergency_contact_phone ?? '',
    notes: s?.notes ?? '',
    billing_ruc: s?.billing_ruc ?? '',
    billing_name: s?.billing_name ?? '',
  }
}

export function StudentFormDialog({
  student,
  prefill,
  leadId,
  onClose,
  onSaved,
}: {
  student: Student | null
  prefill?: StudentPrefill
  leadId?: string | null
  onClose: () => void
  onSaved?: (id: string) => void
}) {
  const { gymId } = useAuth()
  const save = useSaveStudent(gymId)
  const { register, handleSubmit, formState } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: toForm(student, prefill),
  })
  const { errors } = formState

  const onSubmit = (v: FormOutput) => {
    const nul = (s: string) => (s === '' ? null : s)
    const values: StudentInput = {
      first_name: v.first_name,
      last_name: v.last_name,
      document_number: v.document_number,
      birth_date: nul(v.birth_date),
      phone: nul(v.phone),
      email: nul(v.email),
      address: nul(v.address),
      enrolled_on: v.enrolled_on,
      emergency_contact_name: nul(v.emergency_contact_name),
      emergency_contact_phone: nul(v.emergency_contact_phone),
      notes: nul(v.notes),
      billing_ruc: nul(v.billing_ruc),
      billing_name: nul(v.billing_name),
    }
    save.mutate(
      { id: student?.id, values, leadId },
      {
        onSuccess: (id) => {
          toast.success(student ? 'Datos del alumno actualizados.' : 'Alumno registrado.')
          onSaved?.(id)
          onClose()
        },
        onError: (e) => {
          const pg = e as { code?: string }
          toast.error(pg.code === '23505' ? 'Ya existe un alumno con ese documento.' : errorMessage(e))
        },
      },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={student ? 'Editar alumno' : 'Nuevo alumno'}
      description={leadId ? 'Datos tomados del prospecto. Complete el documento.' : undefined}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre" htmlFor="st-first" error={errors.first_name?.message}>
            <Input id="st-first" autoComplete="off" aria-invalid={!!errors.first_name} {...register('first_name')} />
          </Field>
          <Field label="Apellido" htmlFor="st-last" error={errors.last_name?.message}>
            <Input id="st-last" autoComplete="off" aria-invalid={!!errors.last_name} {...register('last_name')} />
          </Field>
          <Field label="Documento de identidad" htmlFor="st-doc" error={errors.document_number?.message} hint="Sin puntos. Ej.: 4512333">
            <Input id="st-doc" inputMode="text" autoComplete="off" aria-invalid={!!errors.document_number} {...register('document_number')} />
          </Field>
          <Field label="Fecha de nacimiento" htmlFor="st-birth" error={errors.birth_date?.message}>
            <Input id="st-birth" type="date" max={todayISO()} {...register('birth_date')} />
          </Field>
          <Field label="Teléfono / WhatsApp" htmlFor="st-phone" error={errors.phone?.message}>
            <Input id="st-phone" type="tel" {...register('phone')} />
          </Field>
          <Field label="Email" htmlFor="st-email" error={errors.email?.message}>
            <Input id="st-email" type="email" {...register('email')} />
          </Field>
          <Field label="Dirección (opcional)" htmlFor="st-address" error={errors.address?.message}>
            <Input id="st-address" {...register('address')} />
          </Field>
          <Field label="Fecha de inscripción" htmlFor="st-enrolled" error={errors.enrolled_on?.message}>
            <Input id="st-enrolled" type="date" {...register('enrolled_on')} />
          </Field>
          <Field label="Contacto de emergencia (opcional)" htmlFor="st-ec-name" error={errors.emergency_contact_name?.message}>
            <Input id="st-ec-name" placeholder="Nombre y vínculo" {...register('emergency_contact_name')} />
          </Field>
          <Field label="Teléfono de emergencia" htmlFor="st-ec-phone" error={errors.emergency_contact_phone?.message}>
            <Input id="st-ec-phone" type="tel" {...register('emergency_contact_phone')} />
          </Field>
        </div>
        <fieldset className="grid gap-4 rounded-2xl border border-border p-4 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Facturar a RUC (opcional)</legend>
          <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">
            Sin RUC, la factura sale a nombre del alumno con su cédula.
          </p>
          <Field label="RUC" htmlFor="st-ruc" error={errors.billing_ruc?.message}>
            <Input id="st-ruc" placeholder="1234567-8" autoComplete="off" {...register('billing_ruc')} />
          </Field>
          <Field label="Razón social" htmlFor="st-ruc-name" error={errors.billing_name?.message}>
            <Input id="st-ruc-name" autoComplete="off" {...register('billing_name')} />
          </Field>
        </fieldset>
        <Field
          label="Observaciones"
          htmlFor="st-notes"
          error={errors.notes?.message}
          hint="Visibles para administración y entrenadores asignados. No registre información médica innecesaria."
        >
          <Textarea id="st-notes" {...register('notes')} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={save.isPending}>
            Guardar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
