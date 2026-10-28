import { useState } from 'react'
import { Check, Copy, ExternalLink } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { EKUATIA_CONSULTA_URL, formatCdc } from '@/lib/fiscal'
import { Button } from '@/components/ui/button'
import { usePaymentInvoices } from './api'

/** Para el alumno: la factura legal de su cobro, si ya fue registrada. */
export function StudentInvoiceNote({ paymentId }: { paymentId: string }) {
  const q = usePaymentInvoices(paymentId)
  const [copied, setCopied] = useState(false)
  const inv = q.data?.find((i) => i.status === 'issued')
  if (!inv) return null

  return (
    <div className="glass mx-auto mt-6 max-w-md space-y-3 rounded-3xl p-5 text-sm print:hidden">
      <p>
        Factura electrónica <span className="font-mono font-medium">{inv.invoice_number}</span> del {formatDate(inv.issued_on)}
      </p>
      <p className="break-all font-mono text-xs text-muted-foreground">CDC {formatCdc(inv.cdc)}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(inv.cdc)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              // Sin permiso de portapapeles: el CDC queda visible para copiarlo a mano.
            }
          }}
        >
          {copied ? <Check /> : <Copy />} Copiar CDC
        </Button>
        <Button variant="outline" asChild>
          <a href={EKUATIA_CONSULTA_URL} target="_blank" rel="noreferrer">
            <ExternalLink /> Consultar en e-Kuatia
          </a>
        </Button>
      </div>
    </div>
  )
}
