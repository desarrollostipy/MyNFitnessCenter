/**
 * Número en formato internacional para WhatsApp (sólo dígitos), o null si no se reconoce.
 * Acepta celulares paraguayos (0981 123456, 981123456, +595 981 123456) y
 * números extranjeros escritos con "+" y código de país.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  const raw = phone.trim()
  const d = raw.replace(/\D/g, '')
  if (d.startsWith('595') && d.length === 12) return d
  if (d.startsWith('09') && d.length === 10) return `595${d.slice(1)}`
  if (d.startsWith('9') && d.length === 9) return `595${d}`
  if (raw.startsWith('+') && !d.startsWith('595') && d.length >= 8 && d.length <= 15) return d
  return null
}

export const isValidPhone = (phone: string) => waNumber(phone) !== null
