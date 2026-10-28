import { describe, expect, it } from 'vitest'
import { computeProgress, weekStart, type Visit } from './progress'

// 12:00 en Asunción (UTC−3) salvo que se indique la hora.
const v = (d: string, utcTime = '15:00:00'): Visit => ({ business_date: d, checked_in_at: `${d}T${utcTime}Z` })

describe('weekStart', () => {
  it('devuelve el lunes de la semana', () => {
    expect(weekStart('2026-10-28')).toBe('2026-10-26') // miércoles
    expect(weekStart('2026-10-26')).toBe('2026-10-26') // lunes
    expect(weekStart('2026-11-01')).toBe('2026-10-26') // domingo
  })
})

describe('computeProgress', () => {
  it('sin ingresos: todo en cero y sin logros', () => {
    const p = computeProgress([], '2026-10-28')
    expect(p.total).toBe(0)
    expect(p.currentStreak).toBe(0)
    expect(p.achievements.every((a) => a.unlockedOn === null)).toBe(true)
  })

  it('racha: cuentan las semanas con 2+ entrenamientos, la semana en curso no la corta', () => {
    const visits = [
      v('2026-10-05'), v('2026-10-07'), // semana 1
      v('2026-10-12'), v('2026-10-14'), // semana 2
      v('2026-10-19'), v('2026-10-21'), // semana 3
      v('2026-10-27'), // semana en curso, 1 sola
    ]
    const p = computeProgress(visits, '2026-10-28')
    expect(p.currentStreak).toBe(3)
    expect(p.bestStreak).toBe(3)
    expect(p.thisMonth).toBe(7)
  })

  it('una semana floja corta la racha', () => {
    const visits = [v('2026-09-28'), v('2026-09-30'), v('2026-10-05'), v('2026-10-19'), v('2026-10-20')]
    const p = computeProgress(visits, '2026-10-28')
    expect(p.currentStreak).toBe(1)
    expect(p.bestStreak).toBe(1)
  })

  it('si la semana anterior quedó floja, la racha actual es 0', () => {
    const p = computeProgress([v('2026-10-12'), v('2026-10-13')], '2026-10-28')
    expect(p.currentStreak).toBe(0)
    expect(p.bestStreak).toBe(1)
  })

  it('logros con la fecha del ingreso que los desbloqueó', () => {
    const visits: Visit[] = []
    for (let d = 1; d <= 12; d++) visits.push(v(`2026-10-${String(d).padStart(2, '0')}`))
    const p = computeProgress(visits, '2026-10-28')
    const by = (code: string) => p.achievements.find((a) => a.code === code)!
    expect(by('visits-1').unlockedOn).toBe('2026-10-01')
    expect(by('visits-10').unlockedOn).toBe('2026-10-10')
    expect(by('month-12').unlockedOn).toBe('2026-10-12')
    expect(by('visits-25').unlockedOn).toBeNull()
    expect(by('visits-25').current).toBe(12)
  })

  it('madrugador usa la hora de Asunción', () => {
    // 09:30 UTC = 06:30 en Asunción; 10:30 UTC = 07:30
    const early = Array.from({ length: 10 }, (_, i) => v(`2026-10-${String(i + 1).padStart(2, '0')}`, '09:30:00'))
    expect(computeProgress(early, '2026-10-28').achievements.find((a) => a.code === 'early-10')!.unlockedOn).toBe('2026-10-10')
    const late = early.map((x) => ({ ...x, checked_in_at: x.checked_in_at.replace('09:30', '10:30') }))
    expect(computeProgress(late, '2026-10-28').achievements.find((a) => a.code === 'early-10')!.unlockedOn).toBeNull()
  })
})
