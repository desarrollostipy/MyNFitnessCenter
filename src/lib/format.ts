// Formatos regionales de Paraguay. Los importes se manejan como guaraníes enteros.

const TZ = 'America/Asuncion'

const moneyFmt = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0, useGrouping: true })

/** 1250000 → "G. 1.250.000" */
export function formatPYG(amount: number | bigint | null | undefined): string {
  if (amount === null || amount === undefined) return '—'
  // es-PY ya agrupa con punto; se fuerza por si el navegador no trae la localización.
  const digits = moneyFmt.format(amount).replace(/[\s,\u00a0]/g, '.')
  return `G. ${digits}`
}

const dateFmt = new Intl.DateTimeFormat('es-PY', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const dateTimeFmt = new Intl.DateTimeFormat('es-PY', {
  timeZone: TZ,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** Instante (timestamptz) → "DD/MM/AAAA" en hora de Asunción. */
export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  // Una fecha de negocio "AAAA-MM-DD" no tiene hora: se formatea sin conversión de zona.
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-')
    return `${d}/${m}/${y}`
  }
  return dateFmt.format(new Date(value))
}

/** Instante → "DD/MM/AAAA HH:mm" en hora de Asunción. */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return dateTimeFmt.format(new Date(value)).replace(',', '')
}
