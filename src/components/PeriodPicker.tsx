import { todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Field, Input } from './ui/input'

export type PeriodKey = 'today' | '7d' | 'month' | 'prev_month' | 'custom'

export interface Period {
  key: PeriodKey
  from: string
  to: string
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Fechas AAAA-MM-DD de un período predefinido, en hora de Asunción. */
// eslint-disable-next-line react-refresh/only-export-components
export function periodFor(key: Exclude<PeriodKey, 'custom'>): Period {
  const today = todayISO()
  const [y, m] = today.split('-').map(Number)
  switch (key) {
    case 'today':
      return { key, from: today, to: today }
    case '7d':
      return { key, from: todayISO(-6), to: today }
    case 'month':
      return { key, from: `${y}-${pad(m)}-01`, to: today }
    case 'prev_month': {
      const py = m === 1 ? y - 1 : y
      const pm = m === 1 ? 12 : m - 1
      const last = new Date(Date.UTC(py, pm, 0)).getUTCDate()
      return { key, from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(last)}` }
    }
  }
}

const OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'today', label: 'Hoy' },
  { key: '7d', label: '7 días' },
  { key: 'month', label: 'Este mes' },
  { key: 'prev_month', label: 'Mes anterior' },
  { key: 'custom', label: 'Rango' },
]

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="mb-4 space-y-2">
      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-1" role="tablist" aria-label="Período">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              role="tab"
              aria-selected={value.key === o.key}
              onClick={() => onChange(o.key === 'custom' ? { ...value, key: 'custom' } : periodFor(o.key))}
              className={cn(
                'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm',
                value.key === o.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      {value.key === 'custom' && (
        <div className="flex gap-2 sm:max-w-sm">
          <Field label="Desde" htmlFor="pp-from">
            <Input id="pp-from" type="date" value={value.from} max={value.to} onChange={(e) => onChange({ ...value, from: e.target.value })} />
          </Field>
          <Field label="Hasta" htmlFor="pp-to">
            <Input id="pp-to" type="date" value={value.to} min={value.from} max={todayISO()} onChange={(e) => onChange({ ...value, to: e.target.value })} />
          </Field>
        </div>
      )}
    </div>
  )
}
