import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, formatPYG } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ReasonDialog } from '@/components/ReasonDialog'
import { ErrorState, LoadingState } from '@/components/states'
import type { Payment } from '@/types/domain'
import { issuedInvoice, useStudentPayments, useVoidPayment } from './api'

export function StudentPaymentsCard({ studentId }: { studentId: string }) {
  const { hasRole } = useAuth()
  const canCollect = hasRole('admin', 'treasurer')
  const canVoid = hasRole('admin')
  const payments = useStudentPayments(studentId)
  const voidPayment = useVoidPayment()
  const [voiding, setVoiding] = useState<Payment | null>(null)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle>Pagos</CardTitle>
        {canCollect && (
          <Button size="sm" variant="accent" asChild>
            <Link to={`/caja/cobrar?alumno=${studentId}`}>
              <Wallet /> Cobrar
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {payments.isLoading ? (
          <LoadingState />
        ) : payments.isError ? (
          <ErrorState error={payments.error} onRetry={() => payments.refetch()} />
        ) : !payments.data?.length ? (
          <p className="text-sm text-muted-foreground">Sin pagos registrados.</p>
        ) : (
          <ul className="divide-y divide-border">
            {payments.data.map((p) => (
              <li key={p.id} className={cn('flex items-center justify-between gap-3 py-2.5', p.status === 'voided' && 'opacity-60')}>
                <Link to={`/recibo/${p.id}`} className="min-w-0 hover:underline">
                  <p className="font-mono text-sm">{p.receipt_number}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.payment_methods?.name} · {formatDateTime(p.paid_at)}
                  </p>
                  {p.status === 'posted' && (
                    <p className="text-xs text-muted-foreground">{issuedInvoice(p) ? `Factura ${issuedInvoice(p)!.invoice_number}` : 'Sin facturar'}</p>
                  )}
                </Link>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={cn('font-medium tabular-nums', p.status === 'voided' && 'line-through')}>{formatPYG(p.amount)}</span>
                  {p.status === 'voided' ? (
                    <Badge tone="danger">Anulado</Badge>
                  ) : (
                    canVoid && (
                      <button className="text-[11px] text-muted-foreground hover:text-destructive hover:underline" onClick={() => setVoiding(p)}>
                        Anular
                      </button>
                    )
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {voiding && (
        <ReasonDialog
          title="Anular pago"
          description={`${voiding.receipt_number} — ${formatPYG(voiding.amount)}. Las cuotas vuelven a quedar pendientes${voiding.payment_methods?.affects_cash ? ' y se registra la salida del efectivo en la caja abierta' : ''}.`}
          confirmLabel="Anular pago"
          loading={voidPayment.isPending}
          onClose={() => setVoiding(null)}
          onConfirm={(reason) =>
            voidPayment.mutate(
              { id: voiding.id, reason },
              {
                onSuccess: () => {
                  toast.success('Pago anulado.')
                  setVoiding(null)
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        />
      )}
    </Card>
  )
}
