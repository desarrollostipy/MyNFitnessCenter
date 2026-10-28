import { useAuth } from '@/features/auth/AuthProvider'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import type { Student } from '@/types/domain'
import { useMyStudent } from './api'

/** Resuelve la ficha del alumno conectado; si no está vinculada, explica qué hacer. */
export function WithStudent({ children }: { children: (s: Student) => React.ReactNode }) {
  const { session } = useAuth()
  const me = useMyStudent(session?.user.id)
  if (me.isLoading) return <LoadingState />
  if (me.isError) return <ErrorState error={me.error} onRetry={() => me.refetch()} />
  if (!me.data)
    return (
      <EmptyState
        title="Tu cuenta todavía no está vinculada a una ficha de alumno"
        description="Pedí en recepción que vinculen tu cuenta. Mientras tanto podés editar tu perfil."
      />
    )
  return <>{children(me.data)}</>
}
