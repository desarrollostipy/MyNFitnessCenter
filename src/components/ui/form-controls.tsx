import * as React from 'react'
import { cn } from '@/lib/utils'
import { formatThousands } from '@/lib/format'

const controlBase =
  'w-full rounded-xl border border-border bg-white/5 px-3.5 text-base sm:text-sm focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/15 disabled:opacity-50 aria-[invalid=true]:border-destructive'

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => <select ref={ref} className={cn(controlBase, 'h-11', className)} {...props} />,
)
Select.displayName = 'Select'

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, ...props }, ref) => (
    <textarea ref={ref} rows={rows} className={cn(controlBase, 'py-2', className)} {...props} />
  ),
)
Textarea.displayName = 'Textarea'

/** Casilla con etiqueta y texto de ayuda opcional. */
export const CheckboxField = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }
>(({ label, hint, id, className, ...props }, ref) => (
  <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3', className)}>
    <input ref={ref} id={id} type="checkbox" className="mt-0.5 size-4 accent-brand" {...props} />
    <span>
      <span className="text-sm font-medium">{label}</span>
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </span>
  </label>
))
CheckboxField.displayName = 'CheckboxField'

/**
 * Importe en guaraníes enteros. Muestra separador de miles mientras se escribe
 * y entrega un número (o null si está vacío).
 */
export function MoneyInput({
  id,
  value,
  onChange,
  onBlur,
  invalid,
  disabled,
}: {
  id: string
  value: number | null | undefined
  onChange: (value: number | null) => void
  onBlur?: () => void
  invalid?: boolean
  disabled?: boolean
}) {
  const display = value === null || value === undefined ? '' : formatThousands(value)
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">G.</span>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        className={cn(controlBase, 'h-10 pl-9 text-right tabular-nums')}
        value={display}
        aria-invalid={invalid}
        disabled={disabled}
        onBlur={onBlur}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 13)
          onChange(digits === '' ? null : Number(digits))
        }}
      />
    </div>
  )
}
