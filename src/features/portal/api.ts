import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Student, Trainer } from '@/types/domain'

/** Ficha del alumno conectado (RLS: sólo la propia). */
export function useMyStudent(userId: string | undefined) {
  return useQuery({
    queryKey: ['me', 'student', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.from('students').select('*').eq('user_id', userId!).maybeSingle()
      if (error) throw error
      return data as Student | null
    },
  })
}

/** Entrenadores con asignación vigente (RLS: sólo los propios). */
export function useMyTrainers(studentId: string | undefined) {
  return useQuery({
    queryKey: ['me', 'trainers', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trainer_student_assignments')
        .select('trainers(id, first_name, last_name, phone, specialties)')
        .eq('student_id', studentId!)
        .is('ends_on', null)
      if (error) throw error
      return (data ?? []).map((r) => r.trainers).filter(Boolean) as unknown as Pick<
        Trainer,
        'id' | 'first_name' | 'last_name' | 'phone' | 'specialties'
      >[]
    },
  })
}
