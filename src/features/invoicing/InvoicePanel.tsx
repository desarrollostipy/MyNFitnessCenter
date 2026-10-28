import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, ExternalLink, FileCheck2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime, formatPYG } from '@/lib/format'
import { EKUATIA_CONSULTA_URL, cdcProblem, cdcSummary, cleanCdc, formatCdc } from '@/lib/fiscal'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField } from '@/components/ui/form-controls'
import { ReasonDialog } from '@/components/ReasonDialog'
import { ErrorState, LoadingState } from '@/components/states'
import { INVOICE_RECEIVER_LABELS, INVOICE_STATUS_LABELS, type Invoice } from '@/types/domain'
import { useCancelInvoice, useInvoiceDraft, usePaymentInvoices, useRegisterInvoice } from './api'

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    toast.error('No se pudo copiar: seleccione el texto y cópielo a mano.')
    return false
  }
}

/** Fila con un dato a cargar en e-Kuatia y botón para copiarlo. */
function CopyRow({ label, value, copy }: { label: string; value: string; copy?: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="break-words font-medium">{value}</p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Copiar ${label}`}
        onClick={async () => {
          if (await copyText(copy ?? value)) {
            setDone(true)
            setTimeout(() => setDone(false), 1500)
          }
        }}
      >
        {done ? <Check className="text-success" /> : <Copy />}
      </Button>
    </div>
  )
}

/** Factura vinculada a un cobro: datos para emitirla en e-Kuatia y registro de su CDC. */
export function InvoicePanel({ paymentId, paymentVoided }: { paymentId: string; paymentVoided: boolean }) {
  const { hasRole } = useAuth()
  const invoices = usePaymentInvoices(paymentId)
  const current = invoices.data?.find((i) => i.status === 'issued')
  const past = invoices.data?.filter((i) => i.status !== 'issued') ?? []

  return (
    <Card className="mx-auto mt-6 max-w-md print:hidden">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Factura electrónica</CardTitle>
          {current ? <Badge tone="accent">{current.invoice_number}</Badge> : !paymentVoided && <Badge>Sin facturar</Badge>}
        </div>
        {!current && !paymentVoided && (
          <CardDescription>Emítala en el facturador de la DNIT con estos datos y después registre el CDC.</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {invoices.isLoading ? (
          <LoadingState />
        ) : invoices.isError ? (
          <ErrorState error={invoices.error} onRetry={() => invoices.refetch()} />
        ) : current ? (
          <IssuedInvoice invoice={current} canCancel={hasRole('admin')} />
        ) : paymentVoided ? (
          <p className="text-sm text-muted-foreground">El cobro está anulado: no corresponde facturarlo.</p>
        ) : (
          <InvoiceDraftSteps paymentId={paymentId} canRegister={hasRole('admin', 'treasurer')} />
        )}

        {past.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Historial</p>
            <ul className="space-y-1 text-sm">
              {past.map((i) => (
                <li key={i.id} className="text-muted-foreground">
                  <span className="font-mono">{i.invoice_number}</span> · {INVOICE_STATUS_LABELS[i.status]} el {formatDateTime(i.cancelled_at)}
                  {i.cancel_reason && <span className="block text-xs">Motivo: {i.cancel_reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IssuedInvoice({ invoice: inv, canCancel }: { invoice: Invoice; canCancel: boolean }) {
  const [cancelling, setCancelling] = useState(false)

  return (
    <>
      <dl className="grid grid-cols-[6.5rem_1fr] gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Número</dt>
        <dd className="font-mono">{inv.invoice_number}</dd>
        <dt className="text-muted-foreground">Emitida</dt>
        <dd>{formatDate(inv.issued_on)}</dd>
        <dt className="text-muted-foreground">Receptor</dt>
        <dd>
          {inv.receiver_name}
          {inv.receiver_document && <span className="text-muted-foreground"> · {inv.receiver_document}</span>}
        </dd>
        <dt className="text-muted-foreground">Total</dt>
        <dd className="tabular-nums">
          {formatPYG(inv.total)} <span className="text-muted-foreground">(IVA 10%: {formatPYG(inv.iva10)})</span>
        </dd>
      </dl>
      <CopyRow label="CDC" value={formatCdc(inv.cdc)} copy={inv.cdc} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <a href={EKUATIA_CONSULTA_URL} target="_blank" rel="noreferrer">
            <ExternalLink /> Consultar en e-Kuatia
          </a>
        </Button>
        {canCancel && (
          <Button variant="ghost" onClick={() => setCancelling(true)}>
            Cancelar o nota de crédito
          </Button>
        )}
      </div>
      {cancelling && <CancelInvoiceDialog invoice={inv} onClose={() => setCancelling(false)} />}
    </>
  )
}

function InvoiceDraftSteps({ paymentId, canRegister }: { paymentId: string; canRegister: boolean }) {
  const { hasRole } = useAuth()
  const [anonymous, setAnonymous] = useState(false)
  const [cdc, setCdc] = useState('')
  const [error, setError] = useState<string>()
  const draft = useInvoiceDraft(paymentId, anonymous, true)
  const register = useRegisterInvoice()

  if (draft.isLoading) return <LoadingState />
  if (draft.isError || !draft.data) return <ErrorState error={draft.error} onRetry={() => draft.refetch()} />
  const d = draft.data
  const digits = cleanCdc(cdc)
  const preview = digits.length === 44 && !cdcProblem(digits) ? cdcSummary(digits) : null

  const submit = () => {
    const problem = cdcProblem(cdc)
    if (problem) return setError(problem)
    setError(undefined)
    register.mutate(
      { paymentId, cdc: digits, anonymous },
      {
        onSuccess: () => toast.success('Factura registrada.'),
        onError: (e) => setError(errorMessage(e)),
      },
    )
  }

  return (
    <>
      {d.missing.length > 0 && (
        <p className="flex gap-2 rounded-xl bg-warning/10 p-3 text-sm text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            Faltan datos de facturación del gimnasio: {d.missing.join(', ')}.{' '}
            {hasRole('admin') && (
              <Link to="/admin/configuracion" className="underline">
                Completar
              </Link>
            )}
          </span>
        </p>
      )}

      <section>
        <p className="text-sm font-semibold">1 · Datos para e-Kuatia</p>
        <CheckboxField
          id="inv-anon"
          className="mt-2"
          label="Consumidor final sin nombre"
          hint="Use esto sólo si el cliente no quiere la factura a su nombre."
          checked={anonymous}
          onChange={(e) => setAnonymous(e.target.checked)}
        />
        <div className="mt-2 divide-y divide-border">
          <CopyRow label="Tipo de transacción" value={d.emitter.transaction_type} />
          <CopyRow label="Receptor" value={INVOICE_RECEIVER_LABELS[d.receiver.kind]} />
          {d.receiver.document && (
            <CopyRow label={d.receiver.kind === 'ruc' ? 'RUC' : 'Documento'} value={d.receiver.document} />
          )}
          <CopyRow label={d.receiver.kind === 'ruc' ? 'Razón social' : 'Nombre'} value={d.receiver.name} />
          {d.items.map((it, i) => (
            <div key={i} className="py-1">
              <CopyRow label={`Ítem ${i + 1} · descripción (cantidad 1, IVA 10%)`} value={it.description} />
              <CopyRow label="Precio unitario (IVA incluido)" value={formatPYG(it.amount)} copy={String(it.amount)} />
            </div>
          ))}
        </div>
        <div className="mt-2 flex justify-between rounded-xl bg-white/5 px-3 py-2 text-sm">
          <span>
            Total <span className="text-muted-foreground">· IVA 10%: {formatPYG(d.iva10)}</span>
          </span>
          <span className="font-semibold tabular-nums">{formatPYG(d.total)}</span>
        </div>
      </section>

      <section className="border-t border-border pt-4">
        <p className="mb-2 text-sm font-semibold">2 · Registrar el CDC</p>
        {canRegister ? (
          <div className="space-y-3">
            <Field
              label="CDC de la factura emitida"
              htmlFor="inv-cdc"
              error={error}
              hint={preview ? `Factura ${preview.number} del ${formatDate(preview.issuedOn)}` : '44 dígitos, impresos debajo del QR.'}
            >
              <Input
                id="inv-cdc"
                inputMode="numeric"
                autoComplete="off"
                className="font-mono"
                value={cdc}
                onChange={(e) => {
                  setCdc(e.target.value)
                  setError(undefined)
                }}
              />
            </Field>
            <Button className="w-full" onClick={submit} loading={register.isPending} disabled={digits.length === 0}>
              <FileCheck2 /> Registrar factura
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Sólo administración o recepción registran facturas.</p>
        )}
      </section>
    </>
  )
}

function CancelInvoiceDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const cancel = useCancelInvoice()
  const [mode, setMode] = useState<'cancelled' | 'credited'>('cancelled')
  const [nc, setNc] = useState('')
  const [ncError, setNcError] = useState<string>()

  return (
    <ReasonDialog
      title={`Factura ${invoice.invoice_number}`}
      description="Primero cancele la factura o emita la nota de crédito en e-Kuatia; acá sólo se registra lo hecho."
      confirmLabel="Registrar"
      loading={cancel.isPending}
      onClose={onClose}
      onConfirm={(reason) => {
        let creditNoteCdc: string | null = null
        if (mode === 'credited') {
          const problem = cdcProblem(nc) ?? (cdcSummary(nc).docType !== '05' ? 'Ese CDC no es de una nota de crédito.' : null)
          if (problem) return setNcError(problem)
          creditNoteCdc = cleanCdc(nc)
        }
        cancel.mutate(
          { id: invoice.id, reason, creditNoteCdc },
          {
            onSuccess: () => {
              toast.success(mode === 'credited' ? 'Nota de crédito registrada.' : 'Factura marcada como cancelada.')
              onClose()
            },
            onError: (e) => toast.error(errorMessage(e)),
          },
        )
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium">¿Qué se hizo en e-Kuatia?</legend>
        <label className="flex items-start gap-3 text-sm">
          <input type="radio" name="inv-mode" className="mt-0.5 accent-brand" checked={mode === 'cancelled'} onChange={() => setMode('cancelled')} />
          <span>
            Se canceló la factura
            <span className="block text-xs text-muted-foreground">Dentro de las 72 horas de emitida.</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="radio" name="inv-mode" className="mt-0.5 accent-brand" checked={mode === 'credited'} onChange={() => setMode('credited')} />
          <span>
            Se emitió una nota de crédito
            <span className="block text-xs text-muted-foreground">Pasado el plazo de cancelación.</span>
          </span>
        </label>
      </fieldset>
      {mode === 'credited' && (
        <Field label="CDC de la nota de crédito" htmlFor="inv-nc" error={ncError}>
          <Input
            id="inv-nc"
            inputMode="numeric"
            className="font-mono"
            value={nc}
            onChange={(e) => {
              setNc(e.target.value)
              setNcError(undefined)
            }}
          />
        </Field>
      )}
    </ReasonDialog>
  )
}
