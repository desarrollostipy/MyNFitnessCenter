import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/features/auth/AuthProvider'
import { LoadingState } from '@/components/states'
import type { AppRole } from '@/types/domain'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading, mustChangePassword } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingState />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (mustChangePassword) return <Navigate to="/crear-clave" replace />
  return <>{children}</>
}

export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const { hasRole, loading } = useAuth()
  if (loading) return <LoadingState />
  if (!hasRole(...roles)) return <Navigate to="/sin-acceso" replace />
  return <>{children}</>
}
