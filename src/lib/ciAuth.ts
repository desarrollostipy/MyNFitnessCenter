/**
 * Ingreso con número de CI. Supabase Auth necesita un email, así que las cuentas por CI
 * usan un email técnico en un dominio reservado que nunca recibe correo (RFC 2606).
 * Mantener igual que supabase/functions/admin-invite-user/index.ts.
 */
export const CI_EMAIL_DOMAIN = 'ci.example.com'

/** Igual que app.normalize_document: sin espacios ni puntos, en mayúsculas. */
export function normalizeDocument(doc: string): string {
  return doc.replace(/[\s.]/g, '').toUpperCase()
}

/** "4.123.456" → "4123456@ci.example.com"; un email se devuelve tal cual. */
export function loginIdentifierToEmail(value: string): string {
  const v = value.trim()
  if (v.includes('@')) return v.toLowerCase()
  return `${normalizeDocument(v).toLowerCase()}@${CI_EMAIL_DOMAIN}`
}

/** CI de una cuenta creada por documento, o null si es una cuenta con email real. */
export function ciFromEmail(email: string | null | undefined): string | null {
  if (!email?.endsWith(`@${CI_EMAIL_DOMAIN}`)) return null
  return email.slice(0, -(CI_EMAIL_DOMAIN.length + 1)).toUpperCase()
}

/** Para mostrar: "CI 4.123.456" o el email. */
export function accountLabel(email: string | null | undefined): string {
  const ci = ciFromEmail(email)
  if (!ci) return email ?? '—'
  return /^\d+$/.test(ci) ? `CI ${Number(ci).toLocaleString('es-PY').replace(/[\s,]/g, '.')}` : `CI ${ci}`
}
