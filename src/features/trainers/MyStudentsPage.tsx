import { Phone } from 'lucide-react'
import { useAuth } from '@/features/auth/AuthProvider'
import { StudentAvatar } from '@/features/students/StudentAvatar'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import { fullName } from '@/types/domain'
import { useMyStudents } from './api'

// Portal del entrenador: sólo alumnos con asignación vigente (lo garantiza RLS).
export function MyStudentsPage() {
  const { gymId } = useAuth()
  const students = useMyStudents(gymId)

  return (
    <>
      <PageHeader title="Mis alumnos" description="Alumnos asignados por la administración." />
      {students.isLoading ? (
        <LoadingState />
      ) : students.isError ? (
        <ErrorState error={students.error} onRetry={() => students.refetch()} />
      ) : !students.data?.length ? (
        <EmptyState title="No tenés alumnos asignados" description="Cuando la administración te asigne alumnos aparecerán aquí." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {students.data.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-center gap-3">
                <StudentAvatar photoPath={s.photo_path} firstName={s.first_name} lastName={s.last_name} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{fullName(s)}</p>
                  {s.phone && (
                    <a href={`tel:${s.phone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline">
                      <Phone className="size-3" /> {s.phone}
                    </a>
                  )}
                </div>
              </div>
              {s.notes && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{s.notes}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
