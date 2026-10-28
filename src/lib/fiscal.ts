/** Dígito verificador módulo 11 de la DNIT (mismo algoritmo para RUC y CDC). */
export function checkDigit11(digits: string): number {
  let k = 2
  let total = 0
  for (let i = digits.length - 1; i >= 0; i--) {
    total += Number(digits[i]) * k
    k = k === 11 ? 2 : k + 1
  }
  const r = total % 11
  return r > 1 ? 11 - r : 0
}

export function isValidRuc(ruc: string): boolean {
  const m = /^(\d{1,8})-(\d)$/.exec(ruc)
  return !!m && checkDigit11(m[1]) === Number(m[2])
}

export const cleanCdc = (s: string) => s.replace(/\D/g, '')

/** Valida la forma del CDC antes de enviarlo (el servidor vuelve a validar todo). */
export function cdcProblem(raw: string): string | null {
  const cdc = cleanCdc(raw)
  if (cdc.length !== 44) return `El CDC tiene 44 dígitos (van ${cdc.length}).`
  if (checkDigit11(cdc.slice(0, 43)) !== Number(cdc[43])) return 'El CDC no es válido: revise que esté copiado completo.'
  return null
}

/** Datos legibles dentro del CDC: tipo de documento, número y fecha de emisión (AAAA-MM-DD). */
export function cdcSummary(raw: string) {
  const c = cleanCdc(raw)
  return {
    docType: c.slice(0, 2),
    number: `${c.slice(11, 14)}-${c.slice(14, 17)}-${c.slice(17, 24)}`,
    issuedOn: `${c.slice(25, 29)}-${c.slice(29, 31)}-${c.slice(31, 33)}`,
  }
}

/** CDC en grupos de 4 para leerlo o dictarlo. */
export const formatCdc = (cdc: string) => cdc.replace(/(\d{4})(?=\d)/g, '$1 ')

export const EKUATIA_CONSULTA_URL = 'https://ekuatia.set.gov.py/consultas/'
