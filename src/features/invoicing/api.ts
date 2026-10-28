import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Invoice, InvoiceDraft } from '@/types/domain'

function useInvalidateInvoices() {
  const qc = useQueryClient()
  return () => {
    for (const key of ['invoices', 'payments', 'invoice-draft']) {
      qc.invalidateQueries({ queryKey: [key] })
    }
  }
}

/** Datos a facturar de un cobro, armados por el servidor (receptor, ítems, IVA). */
export function useInvoiceDraft(paymentId: string, anonymous: boolean, enabled: boolean) {
  return useQuery({
    queryKey: ['invoice-draft', paymentId, anonymous],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('invoice_draft', { p_payment_id: paymentId, p_anonymous: anonymous })
      if (error) throw error
      return data as InvoiceDraft
    },
  })
}

export function usePaymentInvoices(paymentId: string) {
  return useQuery({
    queryKey: ['invoices', 'payment', paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('payment_id', paymentId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Invoice[]
    },
  })
}

export function useRegisterInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: async (args: { paymentId: string; cdc: string; anonymous: boolean }) => {
      const { data, error } = await supabase.rpc('register_invoice', {
        p_payment_id: args.paymentId,
        p_cdc: args.cdc,
        p_anonymous: args.anonymous,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: invalidate,
  })
}

export function useCancelInvoice() {
  const invalidate = useInvalidateInvoices()
  return useMutation({
    mutationFn: async (args: { id: string; reason: string; creditNoteCdc: string | null }) => {
      const { error } = await supabase.rpc('cancel_invoice', {
        p_invoice_id: args.id,
        p_reason: args.reason,
        p_credit_note_cdc: args.creditNoteCdc,
      })
      if (error) throw error
    },
    onSuccess: invalidate,
  })
}
