import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'
import { formatPYG } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { planDurationLabel } from '@/features/catalog/planUtils'
import type { MembershipPlan } from '@/types/domain'

type PublicPlan = Pick<
  MembershipPlan,
  'id' | 'name' | 'description' | 'price' | 'duration_months' | 'duration_days' | 'included_sessions' | 'benefits' | 'conditions'
>

export function PlanCard({ plan, showConditions = false }: { plan: PublicPlan; showConditions?: boolean }) {
  return (
    <article className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold">{plan.name}</h3>
      {plan.description && <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>}
      <p className="mt-5">
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatPYG(plan.price)}</span>
        <span className="ml-1 text-sm text-muted-foreground">/ {planDurationLabel(plan)}</span>
      </p>
      <ul className="mt-5 flex-1 space-y-2 text-sm">
        {plan.included_sessions > 0 && (
          <li className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-graphite" />
            {plan.included_sessions} {plan.included_sessions === 1 ? 'sesión incluida' : 'sesiones incluidas'}
          </li>
        )}
        {plan.benefits.map((b) => (
          <li key={b} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-graphite" />
            {b}
          </li>
        ))}
      </ul>
      {showConditions && plan.conditions && (
        <p className="mt-4 whitespace-pre-wrap border-t border-border pt-4 text-xs text-muted-foreground">{plan.conditions}</p>
      )}
      <Button asChild className="mt-6 w-full">
        <Link to={`/contacto?tipo=inscripcion&plan=${plan.id}`}>Quiero este plan</Link>
      </Button>
    </article>
  )
}
