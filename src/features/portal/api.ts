import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import type { Visit } from '@/lib/progress'
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

/** Todos los ingresos del alumno (RLS: sólo los propios). */
export function useMyVisits(studentId: string | undefined) {
  return useQuery({
    queryKey: ['me', 'visits', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('check_ins')
        .select('business_date, checked_in_at')
        .eq('student_id', studentId!)
        .order('business_date')
        .limit(5000)
      if (error) throw error
      return (data ?? []) as Visit[]
    },
  })
}

export interface SessionPlan {
  planName: string
  granted: number
  periodStart: string
  periodEnd: string
}

/** Planes por sesiones vigentes hoy, con las sesiones del período en curso. */
export function useMySessionPlans(studentId: string | undefined) {
  return useQuery({
    queryKey: ['me', 'session-plans', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const today = todayISO()
      const { data, error } = await supabase
        .from('subscriptions')
        .select('plan_name, subscription_periods(period_start, period_end, session_entitlements(granted))')
        .eq('student_id', studentId!)
        .eq('status', 'active')
        .gt('included_sessions', 0)
      if (error) throw error
      type Row = {
        plan_name: string
        subscription_periods: { period_start: string; period_end: string; session_entitlements: { granted: number } | { granted: number }[] | null }[]
      }
      const plans: SessionPlan[] = []
      for (const s of (data ?? []) as unknown as Row[]) {
        const p = s.subscription_periods.find((x) => x.period_start <= today && x.period_end >= today)
        const ent = Array.isArray(p?.session_entitlements) ? p.session_entitlements[0] : p?.session_entitlements
        if (p && ent) plans.push({ planName: s.plan_name, granted: ent.granted, periodStart: p.period_start, periodEnd: p.period_end })
      }
      return plans
    },
  })
}

export interface RankingRow {
  rank_position: number
  student_label: string
  visits: number
  is_me: boolean
}

export function useRanking(gymId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['ranking', gymId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('attendance_ranking', { p_gym_id: gymId, p_limit: 5 })
      if (error) throw error
      return (data ?? []) as RankingRow[]
    },
  })
}

export function useSetRankingOptOut(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (optOut: boolean) => {
      const { error } = await supabase.rpc('set_ranking_opt_out', { p_gym_id: gymId, p_opt_out: optOut })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ranking'] })
      qc.invalidateQueries({ queryKey: ['me', 'student'] })
    },
  })
}
