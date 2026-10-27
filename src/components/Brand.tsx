import { cn } from '@/lib/utils'

// Marca tipográfica de M&N Fitness. Se reemplaza por el archivo oficial del logotipo
// (PNG/SVG con fondo transparente) cuando esté disponible en public/brand/.
export function Brand({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-baseline gap-1.5 leading-none', className)}>
      <span className={cn('font-black tracking-tight', dark ? 'text-smoke' : 'text-graphite')}>
        M<span className="text-brand">&amp;</span>N
      </span>
      <span className={cn('text-[0.7em] font-semibold uppercase tracking-[0.2em]', dark ? 'text-smoke/70' : 'text-muted-foreground')}>
        Fitness
      </span>
    </span>
  )
}
