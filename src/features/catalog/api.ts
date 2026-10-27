import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MembershipPlan, PaymentMethod, Service } from '@/types/domain'

type CatalogTable = 'services' | 'membership_plans' | 'payment_methods'

function useCatalogList<T>(table: CatalogTable, gymId: string) {
  return useQuery({
    queryKey: [table, gymId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('gym_id', gymId)
        .order('is_active', { ascending: false })
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as T[]
    },
  })
}

/** Crea (sin id) o actualiza (con id). No hay borrado: los registros se desactivan. */
function useCatalogSave<T extends { id?: string }>(table: CatalogTable, gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: T) => {
      const { id, ...rest } = values as T & Record<string, unknown>
      const query = id
        ? supabase.from(table).update(rest).eq('id', id).eq('gym_id', gymId)
        : supabase.from(table).insert({ ...rest, gym_id: gymId })
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [table, gymId] }),
  })
}

export const useServices = (gymId: string) => useCatalogList<Service>('services', gymId)
export const usePlans = (gymId: string) => useCatalogList<MembershipPlan>('membership_plans', gymId)
export const usePaymentMethods = (gymId: string) => useCatalogList<PaymentMethod>('payment_methods', gymId)

export type ServiceInput = Omit<Service, 'id' | 'gym_id' | 'capacity'> & { id?: string }
export type PlanInput = Omit<MembershipPlan, 'id' | 'gym_id'> & { id?: string }
export type PaymentMethodInput = Partial<Omit<PaymentMethod, 'id' | 'gym_id'>> & { id?: string }

export const useSaveService = (gymId: string) => useCatalogSave<ServiceInput>('services', gymId)
export const useSavePlan = (gymId: string) => useCatalogSave<PlanInput>('membership_plans', gymId)
export const useSavePaymentMethod = (gymId: string) => useCatalogSave<PaymentMethodInput>('payment_methods', gymId)
