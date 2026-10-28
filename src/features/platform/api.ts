import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { AppRole, FeatureKey, FeatureRow } from '@/types/domain'

export interface MyFeatures {
  superadmin: boolean
  isLoading: boolean
  has: (key: FeatureKey) => boolean
}

/** Funciones habilitadas para el usuario conectado (las decide el super admin). */
export function useMyFeatures(): MyFeatures {
  const { gymId, session } = useAuth()
  const q = useQuery({
    queryKey: ['my-features', gymId, session?.user.id],
    enabled: !!session,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_features', { p_gym_id: gymId })
      if (error) throw error
      const r = data as { superadmin: boolean; features: FeatureKey[] }
      return { superadmin: r.superadmin, features: new Set(r.features) }
    },
  })
  return {
    superadmin: !!q.data?.superadmin,
    isLoading: q.isLoading,
    has: (key) => !!q.data?.features.has(key),
  }
}

export function useFeatureMatrix() {
  const { gymId } = useAuth()
  return useQuery({
    queryKey: ['feature-matrix', gymId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('feature_matrix', { p_gym_id: gymId })
      if (error) throw error
      return (data ?? []) as FeatureRow[]
    },
  })
}

export function useSetFeature() {
  const { gymId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { key: FeatureKey; enabled: boolean; disabledRoles: AppRole[] }) => {
      const { error } = await supabase.rpc('set_feature', {
        p_gym_id: gymId,
        p_feature: args.key,
        p_enabled: args.enabled,
        p_disabled_roles: args.disabledRoles,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feature-matrix'] })
      qc.invalidateQueries({ queryKey: ['my-features'] })
    },
  })
}
