import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/features/auth/AuthProvider'
import type { Gym, GymModule } from '@/types/domain'

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

/** Módulos opcionales activos. Mientras carga, ninguno: no se muestra lo que quizá no está habilitado. */
export function useModules(): Record<GymModule, boolean> {
  const g = useGym().data
  return {
    training: !!g?.module_training,
    achievements: !!g?.module_training && !!g?.module_achievements,
    ranking: !!g?.module_ranking,
  }
}
