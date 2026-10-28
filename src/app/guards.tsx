import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { useMyFeatures } from '@/features/platform/api'
import { EmptyState, LoadingState } from '@/components/states'
import type { AppRole, FeatureKey } from '@/types/domain'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, mustChangePassword } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (mustChangePassword) return <Navigate to="/crear-clave" replace />
  return <>{children}</>
}

/** Rol requerido y, si se indica, función habilitada por el super admin. */
export function RequireRole({ roles, feature, children }: { roles: AppRole[]; feature?: FeatureKey; children: ReactNode }) {
  const { hasRole, loading } = useAuth()
  const features = useMyFeatures()
  if (loading || (feature && features.isLoading)) return <LoadingState />
  if (!hasRole(...roles)) return <Navigate to="/sin-acceso" replace />
  if (feature && !features.has(feature))
    return <EmptyState title="Función deshabilitada" description="Esta función no está habilitada para su perfil. Consulte con el administrador." />
  return <>{children}</>
}

export function RequireSuperadmin({ children }: { children: ReactNode }) {
  const features = useMyFeatures()
  if (features.isLoading) return <LoadingState />
  if (!features.superadmin) return <Navigate to="/sin-acceso" replace />
  return <>{children}</>
}
