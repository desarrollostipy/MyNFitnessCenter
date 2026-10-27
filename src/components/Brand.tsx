import { cn } from '@/lib/utils'

/**
 * Monograma "M" de M&N Fitness, redibujado en vectores a partir del logotipo oficial.
 * Usa currentColor: blanco sobre fondos oscuros, grafito sobre claros.
 */
export function Monogram({ className }: { className?: string }) {
  return (
    <svg viewBox="270 112 658 566" className={className} fill="currentColor" aria-hidden>
      <path d="M312 118H447L605 276L778 118H922V530L815 627V212L597 407Z" />
      <path d="M275 212L597 541L778 376V495L592 672L375 450V598L275 500Z" />
    </svg>
  )
}

export function Brand({ dark = false, className }: { dark?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 leading-none', className)} aria-label="M&N Fitness">
      <Monogram className={cn('h-[1.6em] w-auto', dark ? 'text-smoke' : 'text-graphite')} />
      <span className="flex flex-col">
        <span className={cn('font-bold tracking-wide', dark ? 'text-smoke' : 'text-graphite')}>
          M<span className="text-brand">&amp;</span>N
        </span>
        <span className={cn('text-[0.55em] font-semibold uppercase tracking-[0.25em]', dark ? 'text-smoke/70' : 'text-muted-foreground')}>
          Fitness
        </span>
      </span>
    </span>
  )
}
