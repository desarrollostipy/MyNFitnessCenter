import { formatPYG } from '@/lib/format'

/** Desglose de magnitudes en barras horizontales de un solo tono (sin leyenda: cada fila se etiqueta). */
export function BarList({ items, empty = 'Sin datos en el período' }: { items: { name: string; amount: number }[]; empty?: string }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  const max = Math.max(...items.map((i) => Number(i.amount)), 1)
  const total = items.reduce((s, i) => s + Number(i.amount), 0)
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i.name}>
          <div className="mb-1 flex justify-between gap-3 text-sm">
            <span className="truncate">{i.name}</span>
            <span className="shrink-0 tabular-nums">
              {formatPYG(i.amount)} <span className="text-xs text-muted-foreground">· {Math.round((Number(i.amount) / total) * 100)}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-foreground/70" style={{ width: `${(Number(i.amount) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}
