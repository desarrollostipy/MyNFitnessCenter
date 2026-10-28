import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Gym } from '@/types/domain'

/** Datos del gimnasio (RLS: cualquier miembro lo ve). */
export function useGym() {
  const { gymId, session } = useAuth()
  return useQuery({
    queryKey: ['gym', gymId],
    enabled: !!session,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('gyms').select('*').eq('id', gymId).single()
      if (error) throw error
      return data as Gym
    },
  })
}
