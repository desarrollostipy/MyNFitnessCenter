import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Student, Trainer } from '@/types/domain'

export function useTrainers(gymId: string) {
  return useQuery({
    queryKey: ['trainers', gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trainers')
        .select('*')
        .eq('gym_id', gymId)
        .order('is_active', { ascending: false })
        .order('last_name')
      if (error) throw error
      return (data ?? []) as Trainer[]
    },
  })
}

export type TrainerInput = Omit<Trainer, 'id' | 'gym_id'> & { id?: string }

export function useSaveTrainer(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: TrainerInput) => {
      const { error } = id
        ? await supabase.from('trainers').update(values).eq('id', id)
        : await supabase.from('trainers').insert({ ...values, gym_id: gymId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['trainers', gymId] }),
  })
}

/** Alumnos visibles para el entrenador conectado (RLS limita a asignaciones vigentes). */
export function useMyStudents(gymId: string) {
  return useQuery({
    queryKey: ['my-students', gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('students')
        .select('id, first_name, last_name, phone, photo_path, status, notes')
        .eq('gym_id', gymId)
        .order('last_name')
      if (error) throw error
      return (data ?? []) as Pick<Student, 'id' | 'first_name' | 'last_name' | 'phone' | 'photo_path' | 'status' | 'notes'>[]
    },
  })
}
