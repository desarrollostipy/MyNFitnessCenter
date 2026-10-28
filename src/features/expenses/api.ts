import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Expense, ExpenseCategory } from '@/types/domain'

function useInvalidate() {
  const qc = useQueryClient()
  return () => {
    for (const key of ['expenses', 'cash', 'dashboard']) qc.invalidateQueries({ queryKey: [key] })
  }
}

export function useExpenseCategories(gymId: string) {
  return useQuery({
    queryKey: ['expenses', 'categories', gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name, is_active, sort_order')
        .eq('gym_id', gymId)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as ExpenseCategory[]
    },
  })
}

export function useSaveCategory(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: { id?: string; name?: string; is_active?: boolean }) => {
      const { id, ...rest } = c
      const { error } = id
        ? await supabase.from('expense_categories').update(rest).eq('id', id)
        : await supabase.from('expense_categories').insert({ ...rest, gym_id: gymId, sort_order: 50 })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expenses', 'categories', gymId] }),
  })
}

export function useExpenses(gymId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['expenses', 'list', gymId, from, to],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*, expense_categories(name), payment_methods(name)')
        .eq('gym_id', gymId)
        .gte('paid_on', from)
        .lte('paid_on', to)
        .order('paid_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500)
      if (error) throw error
      return (data ?? []) as Expense[]
    },
  })
}

export function useRegisterExpense(gymId: string) {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (a: {
      categoryId: string
      description: string
      amount: number
      methodId: string
      paidOn: string
      supplier: string
      documentRef: string
      idempotencyKey: string
    }) => {
      const { error } = await supabase.rpc('register_expense', {
        p_gym_id: gymId,
        p_category_id: a.categoryId,
        p_description: a.description,
        p_amount: a.amount,
        p_method_id: a.methodId,
        p_paid_on: a.paidOn,
        p_supplier: a.supplier || null,
        p_document_ref: a.documentRef || null,
        p_idempotency_key: a.idempotencyKey,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}

export function useVoidExpense() {
  const invalidate = useInvalidate()
  return useMutation({
    mutationFn: async (a: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('void_expense', { p_expense_id: a.id, p_reason: a.reason })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
