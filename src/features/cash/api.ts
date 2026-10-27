import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { CashMovement, CashSession, Charge, Payment } from '@/types/domain'

function useInvalidateMoney() {
  const qc = useQueryClient()
  return () => {
    for (const key of ['cash', 'payments', 'charges', 'membership-status', 'debtors']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
}

export function useOpenSession(gymId: string) {
  return useQuery({
    queryKey: ['cash', 'open', gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('gym_id', gymId)
        .eq('status', 'open')
        .maybeSingle()
      if (error) throw error
      return data as CashSession | null
    },
  })
}

export function useSessionMovements(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['cash', 'movements', sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_movements')
        .select('*')
        .eq('cash_session_id', sessionId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as CashMovement[]
    },
  })
}

export function useClosedSessions(gymId: string) {
  return useQuery({
    queryKey: ['cash', 'closed', gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('gym_id', gymId)
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return (data ?? []) as CashSession[]
    },
  })
}

/** Totales de efectivo de una caja a partir de sus movimientos. */
export function cashTotals(session: CashSession, movements: CashMovement[]) {
  const ins = movements.filter((m) => m.direction === 'in').reduce((s, m) => s + Number(m.amount), 0)
  const outs = movements.filter((m) => m.direction === 'out').reduce((s, m) => s + Number(m.amount), 0)
  return { ins, outs, expected: Number(session.opening_amount) + ins - outs }
}

export function useOpenCash(gymId: string) {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (opening: number) => {
      const { error } = await supabase.rpc('open_cash_session', { p_gym_id: gymId, p_opening_amount: opening })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCashAdjustment() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (args: { sessionId: string; direction: 'in' | 'out'; amount: number; note: string }) => {
      const { error } = await supabase.rpc('register_cash_adjustment', {
        p_session_id: args.sessionId,
        p_direction: args.direction,
        p_amount: args.amount,
        p_note: args.note,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useCloseCash() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (args: { sessionId: string; counted: number; notes: string }) => {
      const { data, error } = await supabase.rpc('close_cash_session', {
        p_session_id: args.sessionId,
        p_counted_amount: args.counted,
        p_notes: args.notes || null,
      })
      if (error) throw error
      return data as { expected: number; counted: number; difference: number }
    },
    onSuccess: invalidate,
  })
}

// ---------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------

export function useOpenCharges(studentId: string | null) {
  return useQuery({
    queryKey: ['charges', 'open', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('charges')
        .select('*')
        .eq('student_id', studentId!)
        .in('status', ['pending', 'partial', 'overdue'])
        .order('due_on')
      if (error) throw error
      return (data ?? []) as Charge[]
    },
  })
}

export function useRegisterPayment() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (args: {
      studentId: string
      methodId: string
      amount: number
      allocations: { charge_id: string; amount: number }[] | null
      reference: string
      notes: string
      idempotencyKey: string
    }) => {
      const { data, error } = await supabase.rpc('register_payment', {
        p_student_id: args.studentId,
        p_method_id: args.methodId,
        p_amount: args.amount,
        p_allocations: args.allocations,
        p_reference: args.reference || null,
        p_notes: args.notes || null,
        p_idempotency_key: args.idempotencyKey,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useVoidPayment() {
  const invalidate = useInvalidateMoney()
  return useMutation({
    mutationFn: async (args: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('void_payment', { p_payment_id: args.id, p_reason: args.reason })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

const PAYMENT_SELECT = '*, students(first_name, last_name, document_number), payment_methods(name, affects_cash)'

export function usePayments(gymId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['payments', 'range', gymId, from, to],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Límites del día en hora de Asunción (UTC−3).
      const { data, error } = await supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('gym_id', gymId)
        .gte('paid_at', `${from}T00:00:00-03:00`)
        .lte('paid_at', `${to}T23:59:59.999-03:00`)
        .order('paid_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Payment[]
    },
  })
}

export function useStudentPayments(studentId: string) {
  return useQuery({
    queryKey: ['payments', 'student', studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(PAYMENT_SELECT)
        .eq('student_id', studentId)
        .order('paid_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data ?? []) as Payment[]
    },
  })
}

export interface ReceiptData {
  payment: Payment
  allocations: { amount: number; charges: { concept: string; due_on: string } | null }[]
  gym: { name: string; legal_name: string | null; ruc: string | null; address: string | null; phone: string | null }
}

export function useReceipt(paymentId: string | undefined, gymId: string) {
  return useQuery({
    queryKey: ['payments', 'receipt', paymentId],
    enabled: !!paymentId,
    queryFn: async () => {
      const [p, a, g] = await Promise.all([
        supabase.from('payments').select(PAYMENT_SELECT).eq('id', paymentId!).single(),
        supabase.from('payment_allocations').select('amount, charges(concept, due_on)').eq('payment_id', paymentId!),
        supabase.from('gyms').select('name, legal_name, ruc, address, phone').eq('id', gymId).single(),
      ])
      if (p.error) throw p.error
      if (a.error) throw a.error
      if (g.error) throw g.error
      return { payment: p.data, allocations: a.data, gym: g.data } as unknown as ReceiptData
    },
  })
}
