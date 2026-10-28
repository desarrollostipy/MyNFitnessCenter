import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle, Printer } from 'lucide-react'
import { formatDate, formatDateTime, formatPYG } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { Monogram } from '@/components/Brand'
import { Button } from '@/components/ui/button'
import { ErrorState, LoadingState } from '@/components/states'
import { fullName } from '@/types/domain'
import { InvoicePanel } from '@/features/invoicing/InvoicePanel'
import { StudentInvoiceNote } from '@/features/invoicing/StudentInvoiceNote'
import { useReceipt } from './api'

export function ReceiptPage() {
  const { id } = useParams()
  const { gymId, hasRole } = useAuth()
  const isStaff = hasRole('admin', 'accountant', 'treasurer')
  const q = useReceipt(id, gymId)

  if (q.isLoading) return <LoadingState />
  if (q.isError || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />

  const { payment: p, allocations, gym } = q.data
  const voided = p.status === 'voided'
  const student = p.students ? fullName(p.students) : '—'
  const shareText = [
    `${gym.name} — Recibo interno ${p.receipt_number}`,
    `Alumno: ${student}`,
    `Importe: ${formatPYG(p.amount)} (${p.payment_methods?.name ?? ''})`,
    `Fecha: ${formatDateTime(p.paid_at)}`,
    ...allocations.map((a) => `• ${a.charges?.concept}: ${formatPYG(a.amount)}`),
    'Comprobante interno, no válido como factura.',
  ].join('\n')

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          to={isStaff ? `/admin/alumnos/${p.student_id}` : '/mi/pagos'}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> {isStaff ? 'Ficha del alumno' : 'Mis recibos'}
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          </Button>
          <Button onClick={() => window.print()}>
            <Printer /> Imprimir
          </Button>
        </div>
      </div>

      <article className="paper relative mx-auto max-w-md overflow-hidden rounded-3xl border border-border bg-card p-6 shadow-2xl print:max-w-none print:rounded-none print:border-0 print:shadow-none">
        {voided && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="-rotate-12 rounded-lg border-4 border-destructive px-6 py-2 text-4xl font-black uppercase text-destructive/70">Anulado</span>
          </div>
        )}
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div className="flex items-center gap-3">
            <Monogram className="h-10 w-auto text-graphite" />
            <div>
              <p className="font-bold">{gym.name}</p>
              {gym.legal_name && <p className="text-xs text-muted-foreground">{gym.legal_name}</p>}
              {gym.ruc && <p className="text-xs text-muted-foreground">RUC {gym.ruc}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Recibo interno</p>
            <p className="font-mono font-semibold">{p.receipt_number}</p>
          </div>
        </header>

        <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 py-4 text-sm">
          <dt className="text-muted-foreground">Fecha</dt>
          <dd>{formatDateTime(p.paid_at)}</dd>
          <dt className="text-muted-foreground">Recibimos de</dt>
          <dd className="font-medium">{student}</dd>
          <dt className="text-muted-foreground">Documento</dt>
          <dd>{p.students?.document_number}</dd>
          <dt className="text-muted-foreground">Medio</dt>
          <dd>
            {p.payment_methods?.name}
            {p.reference ? ` · ${p.reference}` : ''}
          </dd>
        </dl>

        <table className="w-full text-sm">
          <thead className="border-y border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2 font-medium">Concepto</th>
              <th className="py-2 text-right font-medium">Importe</th>
            </tr>
          </thead>
          <tbody>
            {allocations.map((a, i) => (
              <tr key={i} className="border-b border-border/60">
                <td className="py-2 pr-2">
                  {a.charges?.concept}
                  {a.charges?.due_on && <span className="block text-xs text-muted-foreground">Vencimiento {formatDate(a.charges.due_on)}</span>}
                </td>
                <td className="py-2 text-right tabular-nums">{formatPYG(a.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-semibold">Total</td>
              <td className="pt-3 text-right text-lg font-bold tabular-nums">{formatPYG(p.amount)}</td>
            </tr>
          </tfoot>
        </table>

        {voided && (
          <p className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            Anulado el {formatDateTime(p.voided_at)}: {p.void_reason}
          </p>
        )}

        <footer className="mt-6 border-t border-dashed border-border pt-3 text-center text-xs text-muted-foreground">
          Comprobante interno — no válido como factura.
          {gym.address && <span className="block">{gym.address}</span>}
          {gym.phone && <span className="block">{gym.phone}</span>}
        </footer>
      </article>

      {isStaff ? <InvoicePanel paymentId={p.id} paymentVoided={voided} /> : <StudentInvoiceNote paymentId={p.id} />}
    </>
  )
}
