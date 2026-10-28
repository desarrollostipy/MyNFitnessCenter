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

type UserAdminResult = { user_id: string; already_existed?: boolean; pin?: string }

async function callUserAdmin(body: Record<string, unknown>): Promise<UserAdminResult> {
  const { data, error } = await supabase.functions.invoke('admin-invite-user', { body })
  if (error) {
    // El cuerpo de error de la Edge Function trae un mensaje en español.
    const ctx = (error as { context?: Response }).context
    const payload = ctx ? await ctx.json().catch(() => null) : null
    throw new Error(payload?.error ?? error.message)
  }
  return data as UserAdminResult
}

/** Alta por CI (devuelve el PIN temporal) o invitación por email. */
export function useCreateUser(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (args: { full_name: string; role: AppRole; document?: string; email?: string; student_id?: string }) =>
      callUserAdmin({ gym_id: gymId, action: args.document ? 'create_ci' : 'invite', ...args }),
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ['admin-users', gymId] })
      if (args.student_id) qc.invalidateQueries({ queryKey: ['student', args.student_id] })
    },
  })
}

export function useResetPin(gymId: string) {
  return useMutation({
    mutationFn: (userId: string) => callUserAdmin({ gym_id: gymId, action: 'reset_pin', user_id: userId }),
  })
}
