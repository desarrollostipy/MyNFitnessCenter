// Progreso del alumno a partir de sus ingresos (check_ins): rachas semanales y logros.
// Un ingreso = un entrenamiento (uno por día). Hoy lo registra recepción; con el
// molinete llegan igual, así que este cálculo no cambia.

export interface Visit {
  business_date: string // YYYY-MM-DD (día de negocio en Asunción)
  checked_in_at: string // instante ISO
}

/** Entrenamientos por semana para que la semana cuente en la racha. */
export const WEEK_GOAL = 2

export type AchievementKind = 'visits' | 'streak' | 'month' | 'early'

export interface AchievementDef {
  code: string
  kind: AchievementKind
  target: number
  title: string
  description: string
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { code: 'visits-1', kind: 'visits', target: 1, title: 'Primer paso', description: 'Tu primer entrenamiento' },
  { code: 'visits-10', kind: 'visits', target: 10, title: 'En marcha', description: '10 entrenamientos' },
  { code: 'visits-25', kind: 'visits', target: 25, title: 'Constante', description: '25 entrenamientos' },
  { code: 'visits-50', kind: 'visits', target: 50, title: 'Medio centenar', description: '50 entrenamientos' },
  { code: 'visits-100', kind: 'visits', target: 100, title: 'Club de los 100', description: '100 entrenamientos' },
  { code: 'visits-200', kind: 'visits', target: 200, title: 'Leyenda', description: '200 entrenamientos' },
  { code: 'streak-4', kind: 'streak', target: 4, title: 'Un mes sin fallar', description: `4 semanas seguidas con ${WEEK_GOAL}+ entrenamientos` },
  { code: 'streak-8', kind: 'streak', target: 8, title: 'Dos meses firmes', description: `8 semanas seguidas con ${WEEK_GOAL}+ entrenamientos` },
  { code: 'streak-12', kind: 'streak', target: 12, title: 'Imparable', description: `12 semanas seguidas con ${WEEK_GOAL}+ entrenamientos` },
  { code: 'month-12', kind: 'month', target: 12, title: 'Mes fuerte', description: '12 entrenamientos en un mismo mes' },
  { code: 'month-20', kind: 'month', target: 20, title: 'Mes de hierro', description: '20 entrenamientos en un mismo mes' },
  { code: 'early-10', kind: 'early', target: 10, title: 'Madrugador', description: '10 entrenamientos antes de las 7:00' },
]

export interface Achievement extends AchievementDef {
  unlockedOn: string | null
  /** Avance hacia el objetivo (0..target). */
  current: number
}

export interface Progress {
  total: number
  thisMonth: number
  currentStreak: number
  bestStreak: number
  bestMonth: number
  achievements: Achievement[]
  /** Días entrenados (YYYY-MM-DD). */
  days: Set<string>
}

const DAY = 86_400_000
const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Lunes de la semana de la fecha. */
export function weekStart(d: string): string {
  const ms = toMs(d)
  const dow = (new Date(ms).getUTCDay() + 6) % 7 // lunes = 0
  return fromMs(ms - dow * DAY)
}

const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Asuncion', hour: 'numeric', hourCycle: 'h23' })
const asuncionHour = (iso: string) => Number(hourFmt.format(new Date(iso)))

export function computeProgress(visits: Visit[], today: string): Progress {
  const sorted = [...visits].sort((a, b) => a.business_date.localeCompare(b.business_date))
  const days = new Set(sorted.map((v) => v.business_date))
  const unlocked = new Map<string, string>()
  const unlock = (kind: AchievementKind, value: number, on: string) => {
    for (const a of ACHIEVEMENTS) if (a.kind === kind && value >= a.target && !unlocked.has(a.code)) unlocked.set(a.code, on)
  }

  const perWeek = new Map<string, number>()
  const perMonth = new Map<string, number>()
  const activeWeeks: { week: string; on: string }[] = []
  let early = 0

  sorted.forEach((v, i) => {
    unlock('visits', i + 1, v.business_date)

    const month = v.business_date.slice(0, 7)
    const inMonth = (perMonth.get(month) ?? 0) + 1
    perMonth.set(month, inMonth)
    unlock('month', inMonth, v.business_date)

    if (asuncionHour(v.checked_in_at) < 7) unlock('early', ++early, v.business_date)

    const week = weekStart(v.business_date)
    const inWeek = (perWeek.get(week) ?? 0) + 1
    perWeek.set(week, inWeek)
    if (inWeek === WEEK_GOAL) activeWeeks.push({ week, on: v.business_date })
  })

  let run = 0
  let bestStreak = 0
  activeWeeks.forEach((w, i) => {
    run = i > 0 && toMs(w.week) - toMs(activeWeeks[i - 1].week) === 7 * DAY ? run + 1 : 1
    bestStreak = Math.max(bestStreak, run)
    unlock('streak', run, w.on)
  })

  // La semana en curso no corta la racha mientras no termina.
  const isActive = (week: string) => (perWeek.get(week) ?? 0) >= WEEK_GOAL
  let cursor = weekStart(today)
  if (!isActive(cursor)) cursor = fromMs(toMs(cursor) - 7 * DAY)
  let currentStreak = 0
  while (isActive(cursor)) {
    currentStreak++
    cursor = fromMs(toMs(cursor) - 7 * DAY)
  }

  const bestMonth = Math.max(0, ...perMonth.values())
  const currentFor = (kind: AchievementKind) =>
    kind === 'visits' ? sorted.length : kind === 'streak' ? bestStreak : kind === 'month' ? bestMonth : early

  return {
    total: sorted.length,
    thisMonth: perMonth.get(today.slice(0, 7)) ?? 0,
    currentStreak,
    bestStreak,
    bestMonth,
    days,
    achievements: ACHIEVEMENTS.map((a) => ({
      ...a,
      unlockedOn: unlocked.get(a.code) ?? null,
      current: Math.min(currentFor(a.kind), a.target),
    })),
  }
}
