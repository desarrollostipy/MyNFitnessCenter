import type { MembershipPlan } from '@/types/domain'

/** "1 mes", "3 meses", "30 días" */
export function planDurationLabel(p: Pick<MembershipPlan, 'duration_months' | 'duration_days'>): string {
  if (p.duration_months) return p.duration_months === 1 ? '1 mes' : `${p.duration_months} meses`
  if (p.duration_days === 7) return '1 semana'
  if (p.duration_days) return p.duration_days === 1 ? '1 día' : `${p.duration_days} días`
  return '—'
}
