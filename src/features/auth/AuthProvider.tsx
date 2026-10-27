import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { GYM_ID, supabase } from '@/lib/supabase'
import type { AppRole, UserProfile } from '@/types/domain'

interface AuthContextValue {
  session: Session | null
  /** true mientras se resuelve la sesión inicial o los roles del usuario */
  loading: boolean
  profile: UserProfile | null
  roles: AppRole[]
  gymId: string
  hasRole: (...roles: AppRole[]) => boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, phone, avatar_path')
        .eq('id', userId!)
        .maybeSingle()
      if (error) throw error
      return data as UserProfile | null
    },
  })

  // Los roles se leen de la base (RLS: cada usuario ve sólo los suyos). El frontend
  // los usa para navegación; la protección real de datos la hace RLS en el servidor.
  const rolesQuery = useQuery({
    queryKey: ['my-roles', userId, GYM_ID],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_gym_roles')
        .select('role')
        .eq('user_id', userId!)
        .eq('gym_id', GYM_ID)
      if (error) throw error
      return (data ?? []).map((r) => r.role as AppRole)
    },
  })

  const value = useMemo<AuthContextValue>(() => {
    const roles = rolesQuery.data ?? []
    return {
      session,
      loading: sessionLoading || (!!userId && (profileQuery.isLoading || rolesQuery.isLoading)),
      profile: profileQuery.data ?? null,
      roles,
      gymId: GYM_ID,
      hasRole: (...wanted) => wanted.some((r) => roles.includes(r)),
      signOut: async () => {
        await supabase.auth.signOut()
        queryClient.clear()
      },
    }
  }, [session, sessionLoading, userId, profileQuery.isLoading, profileQuery.data, rolesQuery.isLoading, rolesQuery.data, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
