import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Charge, ChargeStatus, MembershipStatusRow, Subscription } from '@/types/domain'

export const CHARGES_PAGE_SIZE = 25

/** Invalida todo lo que depende de membresías/cuotas. */
function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    for (const key of ['subscriptions', 'charges', 'membership-status', 'debtors']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
}

export function useStudentSubscriptions(studentId: string) {
  return useQuery({
    queryKey: ['subscriptions', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, subscription_pauses(from_date, to_date, reason)')
        .eq('student_id', studentId)
        .order('status')
        .order('starts_on', { ascending: false })
      if (error) throw error
      return (data ?? []) as Subscription[]
    },
  })
}

export function useStudentCharges(studentId: string) {
  return useQuery({
    queryKey: ['charges', 'student', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charges')
        .select('*')
        .eq('student_id', studentId)
        .order('due_on', { ascending: false })
        .limit(60)
      if (error) throw error
      return (data ?? []) as Charge[]
    },
  })
}

export function useMembershipStatus(studentId: string) {
  return useQuery({
    queryKey: ['membership-status', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_student_membership_status')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle()
      if (error) throw error
      return data as MembershipStatusRow | null
    },
  })
}

export type ChargeFilter = 'open' | 'overdue' | 'paid' | 'voided'
const FILTER_STATUSES: Record<ChargeFilter, ChargeStatus[]> = {
  open: ['pending', 'partial', 'overdue'],
  overdue: ['overdue'],
  paid: ['paid'],
  voided: ['voided'],
}

export function useCharges(gymId: string, filter: ChargeFilter, page: number) {
  return useQuery({
    queryKey: ['charges', 'list', gymId, filter, page],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from('charges')
        .select('*, students(first_name, last_name, document_number)', { count: 'exact' })
        .eq('gym_id', gymId)
        .in('status', FILTER_STATUSES[filter])
        .order('due_on', { ascending: filter === 'paid' || filter === 'voided' ? false : true })
        .range(page * CHARGES_PAGE_SIZE, page * CHARGES_PAGE_SIZE + CHARGES_PAGE_SIZE - 1)
      if (error) throw error
      return { rows: (data ?? []) as Charge[], total: count ?? 0 }
    },
  })
}

export interface DebtorRow extends MembershipStatusRow {
  students: { first_name: string; last_name: string; document_number: string; phone: string | null } | null
}

/** Alumnos con cuotas vencidas, de mayor a menor deuda. */
export function useDebtors(gymId: string) {
  return useQuery({
    queryKey: ['debtors', gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_student_membership_status')
        .select('*')
        .eq('gym_id', gymId)
        .gt('overdue_amount', 0)
        .order('overdue_amount', { ascending: false })
        .limit(200)
      if (error) throw error
      const rows = (data ?? []) as MembershipStatusRow[]
      if (!rows.length) return [] as DebtorRow[]
      const { data: st, error: e2 } = await supabase
        .from('students')
        .select('id, first_name, last_name, document_number, phone')
        .in('id', rows.map((r) => r.student_id))
      if (e2) throw e2
      const byId = new Map((st ?? []).map((s) => [s.id, s]))
      return rows.map((r) => ({ ...r, students: byId.get(r.student_id) ?? null })) as DebtorRow[]
    },
  })
}

// ---------------------------------------------------------------------
// Operaciones (todas por RPC transaccional)
// ---------------------------------------------------------------------

export function useEnrollMembership() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (args: {
      studentId: string
      planId: string
      startsOn: string
      discount: number
      discountReason: string
      autoRenew: boolean
      idempotencyKey: string
    }) => {
      const { data, error } = await supabase.rpc('enroll_membership', {
        p_student_id: args.studentId,
        p_plan_id: args.planId,
        p_starts_on: args.startsOn,
        p_discount_amount: args.discount,
        p_discount_reason: args.discountReason || null,
        p_auto_renew: args.autoRenew,
        p_idempotency_key: args.idempotencyKey,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useRenewSubscription() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('renew_subscription', { p_subscription_id: id })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function usePauseSubscription() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (args: { id: string; from: string; to: string; reason: string }) => {
      const { error } = await supabase.rpc('pause_subscription', {
        p_subscription_id: args.id,
        p_from: args.from,
        p_to: args.to,
        p_reason: args.reason,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCancelSubscription() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (args: { id: string; reason: string; voidFuture: boolean }) => {
      const { error } = await supabase.rpc('cancel_subscription', {
        p_subscription_id: args.id,
        p_reason: args.reason,
        p_void_future_charges: args.voidFuture,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useVoidCharge() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('void_charge', { p_charge_id: args.id, p_reason: args.reason })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useRunMembershipJobs(gymId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('run_membership_jobs', { p_gym_id: gymId })
      if (error) throw error
      return data as { renewed: number; expired: number; overdue: number }
    },
    onSuccess: invalidate,
  })
}
