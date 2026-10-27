import { useMutation, useQuery } from '@tanstack/react-query'
import { GYM_ID, supabase } from '@/lib/supabase'
import type { LeadInterest, MembershipPlan, Service } from '@/types/domain'

// Filtro explícito además de RLS: un usuario del staff autenticado ve también lo no publicado.
export function usePublicPlans() {
  return useQuery({
    queryKey: ['public-plans', GYM_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('id, name, description, plan_type, price, duration_months, duration_days, included_sessions, benefits, conditions, sort_order')
        .eq('gym_id', GYM_ID)
        .eq('is_public', true)
        .eq('is_active', true)
        .order('sort_order')
        .order('price')
      if (error) throw error
      return (data ?? []) as Omit<MembershipPlan, 'gym_id' | 'is_public' | 'is_active' | 'included_service_id'>[]
    },
  })
}

export function usePublicServices() {
  return useQuery({
    queryKey: ['public-services', GYM_ID],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('services')
        .select('id, name, description, duration_minutes, price, sort_order')
        .eq('gym_id', GYM_ID)
        .eq('is_public', true)
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Pick<Service, 'id' | 'name' | 'description' | 'duration_minutes' | 'price' | 'sort_order'>[]
    },
  })
}

export interface LeadSubmission {
  full_name: string
  phone: string
  email: string
  interest: LeadInterest
  plan_id: string
  service_id: string
  preferred_date: string
  message: string
}

export function useSubmitLead() {
  return useMutation({
    mutationFn: async (v: LeadSubmission) => {
      const { error } = await supabase.rpc('submit_lead', {
        p_gym_id: GYM_ID,
        p_full_name: v.full_name,
        p_phone: v.phone || null,
        p_email: v.email || null,
        p_interest: v.interest,
        p_plan_id: v.plan_id || null,
        p_service_id: v.service_id || null,
        p_preferred_date: v.preferred_date || null,
        p_message: v.message || null,
      })
      if (error) throw error
    },
  })
}
