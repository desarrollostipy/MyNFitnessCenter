import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { STUDENT_STATUS_LABELS, type Lead, type StudentStatus } from '@/types/domain'
import { STUDENTS_PAGE_SIZE, useStudents } from './api'
import { StudentAvatar } from './StudentAvatar'
import { StudentFormDialog, type StudentPrefill } from './StudentFormDialog'

/** "Ana María Gómez Ruiz" → nombre "Ana María", apellido "Gómez Ruiz" (aproximación para precargar). */
function splitName(full: string): StudentPrefill {
  const parts = full.trim().split(/\s+/)
  if (parts.length <= 1) return { first_name: full.trim() }
  const cut = parts.length >= 4 ? 2 : 1
  return { first_name: parts.slice(0, cut).join(' '), last_name: parts.slice(cut).join(' ') }
}

export function StudentsPage() {
  const { gymId, hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState<StudentStatus | 'all'>('active')
  const [page, setPage] = useState(0)
  const leadId = params.get('lead')
  const [creating, setCreating] = useState(params.get('nuevo') === '1')
  // Se navega a la ficha después de que closeForm limpie los parámetros de la URL.
  const [createdId, setCreatedId] = useState<string | null>(null)
  useEffect(() => {
    if (createdId) navigate(`/admin/alumnos/${createdId}`)
  }, [createdId, navigate])

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  // Conversión desde un prospecto: precarga nombre y contacto.
  const lead = useQuery({
    queryKey: ['lead', leadId],
    enabled: !!leadId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.from('leads').select('id, full_name, phone, email').eq('id', leadId!).single()
      if (error) throw error
      return data as Pick<Lead, 'id' | 'full_name' | 'phone' | 'email'>
    },
  })

  const q = useStudents(gymId, { search: term, status, page })
  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / STUDENTS_PAGE_SIZE))

  const closeForm = () => {
    setCreating(false)
    if (params.has('nuevo') || params.has('lead')) setParams({}, { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Alumnos"
        description="Fichas de alumnos, estado y entrenadores asignados."
        actions={
          isAdmin && (
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nuevo alumno
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1" role="tablist" aria-label="Filtrar por estado">
          {(['active', 'inactive', 'all'] as const).map((s) => (
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
              {s === 'all' ? 'Todos' : s === 'active' ? 'Activos' : 'Inactivos'}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Nombre, documento o teléfono"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar alumnos"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState
            title={term ? 'Sin resultados' : 'No hay alumnos en esta vista'}
            description={term ? 'Pruebe con otro nombre o documento.' : isAdmin ? 'Registre el primer alumno.' : undefined}
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {q.data.rows.map((s) => (
                <li key={s.id}>
                  <Link to={`/admin/alumnos/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                    <StudentAvatar photoPath={s.photo_path} firstName={s.first_name} lastName={s.last_name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">
                        {s.last_name}, {s.first_name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        CI {s.document_number}
                        {s.phone ? ` · ${s.phone}` : ''}
                      </p>
                    </div>
                    <div className="hidden text-right text-xs text-muted-foreground sm:block">
                      Inscripto el {formatDate(s.enrolled_on)}
                    </div>
                    <Badge tone={s.status === 'active' ? 'accent' : 'neutral'}>{STUDENT_STATUS_LABELS[s.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Página {page + 1} de {pages} · {total} alumnos
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

      {creating && isAdmin && (!leadId || lead.data) && (
        <StudentFormDialog
          student={null}
          leadId={lead.data?.id}
          prefill={lead.data ? { ...splitName(lead.data.full_name), phone: lead.data.phone ?? '', email: lead.data.email ?? '' } : undefined}
          onClose={closeForm}
          onSaved={setCreatedId}
        />
      )}
    </>
  )
}
