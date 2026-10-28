import { useState } from 'react'
import { Check, Copy, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'

export interface PinInfo {
  name: string
  account: string
  pin: string
}

/** Muestra una sola vez el PIN temporal para entregarlo a la persona. */
export function PinDialog({ info, onClose }: { info: PinInfo | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  if (!info) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.pin)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Sin permiso de portapapeles: el PIN queda visible para dictarlo.
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="PIN de acceso" description={`${info.name} · ${info.account}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-white/5 px-5 py-4">
          <KeyRound className="size-5 shrink-0 text-brand" />
          <span className="flex-1 text-center font-mono text-3xl font-semibold tracking-[0.25em]">{info.pin}</span>
          <Button variant="ghost" size="icon" onClick={copy} aria-label="Copiar PIN">
            {copied ? <Check /> : <Copy />}
          </Button>
        </div>
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          <li>• Entregáselo en mano o por un mensaje privado. No se vuelve a mostrar.</li>
          <li>• Ingresa con su número de CI y este PIN.</li>
          <li>• Al primer ingreso el sistema le pide crear su propia clave.</li>
        </ul>
        <Button className="w-full" onClick={onClose}>
          Listo
        </Button>
      </div>
    </Dialog>
  )
}
