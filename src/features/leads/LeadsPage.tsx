import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Mail, Phone, Search, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Card } from '@/components/ui/card'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { LEAD_INTEREST_LABELS, LEAD_STATUS_LABELS, type Lead, type LeadStatus } from '@/types/domain'

const PAGE_SIZE = 20
const STATUSES = Object.keys(LEAD_STATUS_LABELS) as LeadStatus[]
const STATUS_TONE: Record<LeadStatus, 'accent' | 'neutral' | 'dark' | 'danger'> = {
  new: 'accent',
  contacted: 'neutral',
  converted: 'dark',
  lost: 'danger',
}

export function LeadsPage() {
  const { gymId } = useAuth()
  const [status, setStatus] = useState<LeadStatus | 'all'>('new')
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Lead | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const q = useQuery({
    queryKey: ['leads', gymId, status, term, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select('*, membership_plans(name), services(name)', { count: 'exact' })
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)
      if (status !== 'all') query = query.eq('status', status)
      if (term) {
        // Se quitan caracteres con significado en la sintaxis de filtros de PostgREST.
        const safe = term.replace(/[,()*%]/g, ' ')
        query = query.or(`full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%`)
      }
      const { data, error, count } = await query
      if (error) throw error
      return { rows: (data ?? []) as Lead[], total: count ?? 0 }
    },
  })

  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader title="Prospectos" description="Consultas, solicitudes de inscripción y clases de prueba recibidas desde la web." />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar por estado">
          {(['all', ...STATUSES] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => {
                setStatus(s)
                setPage(0)
              }}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm',
                status === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {s === 'all' ? 'Todos' : LEAD_STATUS_LABELS[s]}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nombre, email o teléfono"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar prospectos"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState title="No hay prospectos" description={term ? 'Pruebe con otra búsqueda.' : 'Las solicitudes del formulario público aparecerán aquí.'} />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {q.data.rows.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() => setSelected(l)}
                    className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{l.full_name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[l.phone, l.email].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
                      <Badge>{LEAD_INTEREST_LABELS[l.interest]}</Badge>
                      {(l.membership_plans || l.services) && (
                        <span className="text-muted-foreground">{l.membership_plans?.name ?? l.services?.name}</span>
                      )}
                      <Badge tone={STATUS_TONE[l.status]}>{LEAD_STATUS_LABELS[l.status]}</Badge>
                      <span className="text-muted-foreground">{formatDateTime(l.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Página {page + 1} de {pages} · {total} prospectos
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </Button>
                <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>
                  Siguiente
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      {selected && <LeadDialog lead={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

const schema = z.object({
  status: z.enum(STATUSES as [LeadStatus, ...LeadStatus[]]),
  internal_notes: z.string().trim().max(4000),
})
type FormValues = z.infer<typeof schema>

function LeadDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const { gymId, session, hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const qc = useQueryClient()
  const { register, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { status: lead.status, internal_notes: lead.internal_notes ?? '' },
  })

  const save = useMutation({
    mutationFn: async (v: FormValues) => {
      const firstContact = v.status !== 'new' && !lead.contacted_at
      const { error } = await supabase
        .from('leads')
        .update({
          status: v.status,
          internal_notes: v.internal_notes || null,
          handled_by: session!.user.id,
          ...(firstContact ? { contacted_at: new Date().toISOString() } : {}),
        })
        .eq('id', lead.id)
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Prospecto actualizado.')
      qc.invalidateQueries({ queryKey: ['leads', gymId] })
      onClose()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const waPhone = lead.phone?.replace(/\D/g, '').replace(/^0/, '595')

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={lead.full_name} description={`Recibido el ${formatDateTime(lead.created_at)}`}>
      <div className="space-y-4">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Interés</dt>
          <dd>{LEAD_INTEREST_LABELS[lead.interest]}</dd>
          {lead.membership_plans && (
            <>
              <dt className="text-muted-foreground">Plan</dt>
              <dd>{lead.membership_plans.name}</dd>
            </>
          )}
          {lead.services && (
            <>
              <dt className="text-muted-foreground">Servicio</dt>
              <dd>{lead.services.name}</dd>
            </>
          )}
          {lead.preferred_date && (
            <>
              <dt className="text-muted-foreground">Fecha preferida</dt>
              <dd>{formatDate(lead.preferred_date)}</dd>
            </>
          )}
          {lead.message && (
            <>
              <dt className="text-muted-foreground">Mensaje</dt>
              <dd className="whitespace-pre-wrap">{lead.message}</dd>
            </>
          )}
        </dl>
        <div className="flex flex-wrap gap-2">
          {isAdmin && !lead.student_id && (
            <Button asChild size="sm">
              <Link to={`/admin/alumnos?nuevo=1&lead=${lead.id}`}>
                <UserPlus /> Convertir en alumno
              </Link>
            </Button>
          )}
          {lead.student_id && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/admin/alumnos/${lead.student_id}`}>Ver ficha del alumno</Link>
            </Button>
          )}
          {lead.phone && (
            <Button asChild variant="outline" size="sm">
              <a href={`https://wa.me/${waPhone}`} target="_blank" rel="noreferrer">
                <Phone /> WhatsApp {lead.phone}
              </a>
            </Button>
          )}
          {lead.email && (
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${lead.email}`}>
                <Mail /> {lead.email}
              </a>
            </Button>
          )}
        </div>
        <form onSubmit={handleSubmit((v) => save.mutate(v))} className="space-y-4 border-t border-border pt-4" noValidate>
          <Field label="Estado" htmlFor="l-status">
            <Select id="l-status" {...register('status')}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas internas" htmlFor="l-notes" error={formState.errors.internal_notes?.message} hint="No visibles para el prospecto.">
            <Textarea id="l-notes" rows={3} {...register('internal_notes')} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
            <Button type="submit" loading={save.isPending}>
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </Dialog>
  )
}
