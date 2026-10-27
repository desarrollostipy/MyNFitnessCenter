import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { AdminUserRow, AppRole } from '@/types/domain'

export function useAdminUsers(gymId: string, search: string) {
  return useQuery({
    queryKey: ['admin-users', gymId, search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_users', {
        p_gym_id: gymId,
        p_search: search || null,
      })
      if (error) throw error
      return (data ?? []) as AdminUserRow[]
    },
  })
}

export function useSetUserRole(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { userId: string; role: AppRole; enabled: boolean }) => {
      const { error } = await supabase.rpc('admin_set_user_role', {
        p_gym_id: gymId,
        p_user_id: args.userId,
        p_role: args.role,
        p_enabled: args.enabled,
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-users', gymId] })
      qc.invalidateQueries({ queryKey: ['my-roles'] })
    },
  })
}

export function useInviteUser(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { email: string; full_name: string; role: AppRole }) => {
      const { data, error } = await supabase.functions.invoke('admin-invite-user', {
        body: { gym_id: gymId, ...args },
      })
      if (error) {
        // El cuerpo de error de la Edge Function trae un mensaje en español.
        const ctx = (error as { context?: Response }).context
        const body = ctx ? await ctx.json().catch(() => null) : null
        throw new Error(body?.error ?? error.message)
      }
      return data as { user_id: string }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users', gymId] }),
  })
}
