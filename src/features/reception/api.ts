import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import type { AccessStatus, CheckIn, QuickSaleResult } from '@/types/domain'

export function useAccessStatus(studentId: string | undefined) {
  return useQuery({
    queryKey: ['access', studentId],
    enabled: !!studentId,
    // Siempre fresco: lo que se muestra en el mostrador decide si la persona pasa.
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('check_access', { p_student_id: studentId! })
      if (error) throw error
      return data as AccessStatus
    },
  })
}

export function useTodayCheckIns(gymId: string) {
  return useQuery({
    queryKey: ['check-ins', gymId, todayISO()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('check_ins')
        .select('*, students(first_name, last_name, document_number)')
        .eq('gym_id', gymId)
        .eq('business_date', todayISO())
        .order('checked_in_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as CheckIn[]
    },
  })
}

export function useRegisterCheckIn() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { studentId: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('register_check_in', {
        p_student_id: args.studentId,
        p_override_reason: args.reason || null,
      })
      if (error) throw error
      return data as { id: string; already: boolean; checked_in_at: string; access_ok: boolean }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['check-ins'] })
      qc.invalidateQueries({ queryKey: ['access'] })
    },
  })
}

export function useQuickSale(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      studentId: string | null
      firstName: string
      lastName: string
      document: string
      phone: string
      email: string
      planId: string
      methodId: string | null
      reference: string
      checkIn: boolean
      idempotencyKey: string
    }) => {
      const { data, error } = await supabase.rpc('quick_sale', {
        p_gym_id: gymId,
        p_student_id: args.studentId,
        p_first_name: args.firstName || null,
        p_last_name: args.lastName || null,
        p_document: args.document || null,
        p_phone: args.phone || null,
        p_plan_id: args.planId,
        p_method_id: args.methodId,
        p_reference: args.reference || null,
        p_idempotency_key: args.idempotencyKey,
        p_check_in: args.checkIn,
        p_email: args.email || null,
      })
      if (error) throw error
      return data as QuickSaleResult
    },
    onSuccess: () => {
      for (const key of ['students', 'cash', 'payments', 'charges', 'membership-status', 'subscriptions', 'check-ins', 'access']) {
        qc.invalidateQueries({ queryKey: [key] })
      }
    },
  })
}
