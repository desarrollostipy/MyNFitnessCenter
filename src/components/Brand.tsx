import { cn } from '@/lib/utils'

// Marca tipográfica provisoria. Reemplazar por el logotipo oficial cuando se suministre.
export function Brand({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="inline-block size-2.5 rounded-sm bg-lime" aria-hidden />
      <span className={dark ? 'text-smoke' : 'text-graphite'}>
        MyN <span className="font-normal">Fitness</span>
      </span>
    </span>
  )
}
