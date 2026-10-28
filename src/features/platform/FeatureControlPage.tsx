import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ErrorState, LoadingState, PageHeader } from '@/components/states'
import { ROLE_LABELS, type AppRole, type FeatureRow } from '@/types/domain'
import { useFeatureMatrix, useSetFeature } from './api'

/** Pantalla del super admin: prende o apaga cada función, para todo el gimnasio o por rol. */
export function FeatureControlPage() {
  const matrix = useFeatureMatrix()
  const save = useSetFeature()

  const apply = (f: FeatureRow, enabled: boolean, disabledRoles: AppRole[], msg: string) =>
    save.mutate(
      { key: f.key, enabled, disabledRoles },
      { onSuccess: () => toast.success(msg), onError: (e) => toast.error(errorMessage(e)) },
    )

  const areas = [...new Set((matrix.data ?? []).map((f) => f.area))]

  return (
    <>
      <PageHeader
        title="Control de funciones"
        description="Sólo el super admin ve esta pantalla. Apague una función para todo el gimnasio o quítela a un perfil. Se aplica en el menú y en la base de datos; el administrador del gimnasio no puede cambiarlo."
      />
      {matrix.isLoading ? (
        <LoadingState />
      ) : matrix.isError ? (
        <ErrorState error={matrix.error} onRetry={() => matrix.refetch()} />
      ) : (
        <div className="space-y-4">
          {areas.map((area) => (
            <Card key={area}>
              <CardHeader>
                <CardTitle className="text-base">{area}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {matrix.data!.filter((f) => f.area === area).map((f) => (
                    <li key={f.key} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          role="switch"
                          className="size-5 accent-brand"
                          checked={f.enabled}
                          disabled={save.isPending}
                          onChange={(e) =>
                            apply(f, e.target.checked, f.disabled_roles, `${f.label}: ${e.target.checked ? 'activada' : 'apagada para todos'}.`)
                          }
                        />
                        <span>
                          <span className={cn('font-medium', !f.enabled && 'text-muted-foreground line-through')}>{f.label}</span>
                          {!f.enabled && <span className="block text-xs text-destructive">Apagada para todo el gimnasio</span>}
                        </span>
                      </label>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        {f.roles.map((r) => {
                          const on = !f.disabled_roles.includes(r)
                          return (
                            <label
                              key={r}
                              className={cn(
                                'flex cursor-pointer items-center gap-2 rounded-xl border border-border px-3 py-1.5 text-sm',
                                (!f.enabled || !on) && 'text-muted-foreground',
                              )}
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-brand"
                                checked={on}
                                disabled={!f.enabled || save.isPending}
                                onChange={(e) =>
                                  apply(
                                    f,
                                    f.enabled,
                                    e.target.checked ? f.disabled_roles.filter((x) => x !== r) : [...f.disabled_roles, r],
                                    `${f.label}: ${e.target.checked ? 'habilitada' : 'quitada'} para ${ROLE_LABELS[r]}.`,
                                  )
                                }
                              />
                              {ROLE_LABELS[r]}
                            </label>
                          )
                        })}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
