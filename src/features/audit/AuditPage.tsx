import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatDateTime } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { AuditLog } from '@/types/domain'

const PAGE_SIZE = 25

const ACTION_LABELS: Record<string, string> = {
  'role.grant': 'Perfil asignado',
  'role.revoke': 'Perfil quitado',
  'role.bootstrap_admin': 'Alta del primer administrador',
  'gym.update': 'Configuración modificada',
}

export function AuditPage() {
  const { gymId } = useAuth()
  const [page, setPage] = useState(0)

  const q = useQuery({
    queryKey: ['audit', gymId, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const from = page * PAGE_SIZE
      const { data, error, count } = await supabase
        .from('audit_logs')
        .select('id, actor_id, action, entity, entity_id, before, after, reason, created_at', { count: 'exact' })
        .eq('gym_id', gymId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as AuditLog[], total: count ?? 0 }
    },
  })

  const total = q.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader title="Auditoría" description="Registro inalterable de operaciones sensibles." />
      <Card className="overflow-hidden">
        {q.isLoading ? (
          <LoadingState />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.rows.length ? (
          <EmptyState title="Sin registros todavía" />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Fecha</th>
                    <th className="px-4 py-3 font-medium">Acción</th>
                    <th className="px-4 py-3 font-medium">Detalle</th>
                    <th className="px-4 py-3 font-medium">Motivo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.rows.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-3">{formatDateTime(r.created_at)}</td>
                      <td className="px-4 py-3">{ACTION_LABELS[r.action] ?? r.action}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {r.entity} {r.entity_id ? `· ${r.entity_id.slice(0, 8)}` : ''}{' '}
                        {r.after ? JSON.stringify(r.after) : r.before ? JSON.stringify(r.before) : ''}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{r.reason ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                Página {page + 1} de {pages} · {total} registros
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
    </>
  )
}
