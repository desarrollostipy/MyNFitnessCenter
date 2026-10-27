import { useState, type ReactNode } from 'react'
import { Button } from './ui/button'
import { Field } from './ui/input'
import { Textarea } from './ui/form-controls'
import { Dialog } from './ui/dialog'

/** Confirmación de una operación crítica que exige motivo (anulaciones, bajas, cancelaciones). */
export function ReasonDialog({
  title,
  description,
  label = 'Motivo',
  confirmLabel,
  destructive = true,
  loading,
  children,
  onConfirm,
  onClose,
}: {
  title: string
  description?: string
  label?: string
  confirmLabel: string
  destructive?: boolean
  loading?: boolean
  children?: ReactNode
  onConfirm: (reason: string) => void
  onClose: () => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={title} description={description}>
      <div className="space-y-4">
        <Field label={label} htmlFor="reason" error={error}>
          <Textarea id="reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
        {children}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Volver
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            loading={loading}
            onClick={() => {
              if (reason.trim().length < 3) return setError('Indique el motivo (mínimo 3 caracteres)')
              onConfirm(reason.trim())
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
