import { Badge } from '@/components/ui/card'
import { CHARGE_STATUS_LABELS, type ChargeStatus } from '@/types/domain'

const TONES: Record<ChargeStatus, 'accent' | 'neutral' | 'dark' | 'danger'> = {
  pending: 'neutral',
  partial: 'dark',
  paid: 'accent',
  overdue: 'danger',
  voided: 'neutral',
}

export function ChargeStatusBadge({ status }: { status: ChargeStatus }) {
  return (
    <Badge tone={TONES[status]} className={status === 'voided' ? 'line-through' : undefined}>
      {CHARGE_STATUS_LABELS[status]}
    </Badge>
  )
}
