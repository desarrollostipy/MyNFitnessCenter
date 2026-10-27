import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, formatPYG } from './format'

describe('formatPYG', () => {
  it('formatea guaraníes con separador de miles y prefijo G.', () => {
    expect(formatPYG(1250000)).toBe('G. 1.250.000')
    expect(formatPYG(0)).toBe('G. 0')
    expect(formatPYG(950)).toBe('G. 950')
  })
  it('muestra guion ante valores ausentes', () => {
    expect(formatPYG(null)).toBe('—')
  })
})

describe('fechas', () => {
  it('fecha de negocio sin conversión de zona', () => {
    expect(formatDate('2026-03-01')).toBe('01/03/2026')
  })
  it('instante UTC mostrado en hora de Asunción (UTC-3)', () => {
    // 02:30 UTC del 1/3 = 23:30 del 28/2 en Asunción
    expect(formatDate('2026-03-01T02:30:00Z')).toBe('28/02/2026')
    expect(formatDateTime('2026-03-01T02:30:00Z')).toBe('28/02/2026 23:30')
  })
})
