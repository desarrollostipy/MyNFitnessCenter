import { useEffect, useState, type ReactNode } from 'react'
import { Search } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, LoadingState } from '@/components/states'
import { useStudents } from './api'

/** Buscador de alumnos activos por nombre, documento o teléfono. */
export function StudentPicker({
  onPick,
  placeholder = 'Buscar alumno por nombre o documento',
  notFound,
}: {
  onPick: (id: string) => void
  placeholder?: string
  /** Acción cuando la búsqueda no encuentra a nadie (recibe el texto buscado). */
  notFound?: (term: string) => ReactNode
}) {
  const { gymId } = useAuth()
  const [search, setSearch] = useState('')
  const [term, setTerm] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setTerm(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const q = useStudents(gymId, { search: term, status: 'active', page: 0 })

  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder={placeholder}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Buscar alumno"
          />
        </div>
        {q.isLoading ? (
          <LoadingState />
        ) : !q.data?.rows.length ? (
          <EmptyState title="Sin resultados" action={term && notFound ? notFound(term) : undefined} />
        ) : (
          <ul className="divide-y divide-border">
            {q.data.rows.map((s) => (
              <li key={s.id}>
                <button onClick={() => onPick(s.id)} className="flex w-full items-center justify-between px-1 py-3 text-left hover:bg-muted/50">
                  <span className="font-medium">
                    {s.last_name}, {s.first_name}
                  </span>
                  <span className="text-xs text-muted-foreground">CI {s.document_number}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {term && notFound && !!q.data?.rows.length && <div className="border-t border-border pt-3">{notFound(term)}</div>}
      </CardContent>
    </Card>
  )
}
