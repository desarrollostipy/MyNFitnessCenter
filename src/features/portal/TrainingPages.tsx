import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarCheck, ChevronLeft, ChevronRight, Flame, Lock, Medal, Share2, Sunrise, Trophy } from 'lucide-react'
import { formatDate, todayISO } from '@/lib/format'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { computeProgress, WEEK_GOAL, type Achievement, type AchievementKind, type Progress } from '@/lib/progress'
import { useAuth } from '@/features/auth/AuthProvider'
import { useGym, useModules } from '@/features/settings/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState, ErrorState, LoadingState, PageHeader } from '@/components/states'
import type { Student } from '@/types/domain'
import { useMySessionPlans, useMyVisits, useRanking, useSetRankingOptOut } from './api'
import { WithStudent } from './WithStudent'
import { shareCard, type ShareCardContent } from './shareCard'

const monthName = (month: string) =>
  new Intl.DateTimeFormat('es-PY', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))
const weeks = (n: number) => `${n} ${n === 1 ? 'semana' : 'semanas'}`

function useProgress(studentId: string) {
  const visits = useMyVisits(studentId)
  const progress = useMemo(() => (visits.data ? computeProgress(visits.data, todayISO()) : null), [visits.data])
  return { visits, progress }
}

/** Comparte una tarjeta y avisa el resultado. */
function useShare(student: Student) {
  const gym = useGym().data
  const [busy, setBusy] = useState(false)
  const run = async (c: Omit<ShareCardContent, 'name' | 'footer'>, text: string) => {
    setBusy(true)
    try {
      const r = await shareCard({ ...c, name: student.first_name.split(' ')[0], footer: gym?.name ?? 'M&N Fitness' }, text)
      if (r === 'downloaded') toast.success('Imagen descargada. Subila a tus historias.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return { share: run, busy }
}

// ---------------------------------------------------------------------
// Inicio del portal
// ---------------------------------------------------------------------

export function TrainingSummaryCard({ student }: { student: Student }) {
  const modules = useModules()
  const { progress } = useProgress(student.id)
  if (!modules.training || !progress) return null
  return (
    <Link to="/mi/entrenamientos" className="block">
      <Card className="flex items-center gap-4 p-4 hover:bg-white/10">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-brand/15">
          <Flame className="size-5 text-brand" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {progress.thisMonth} {progress.thisMonth === 1 ? 'entrenamiento' : 'entrenamientos'} este mes
          </p>
          <p className="text-sm text-muted-foreground">
            {progress.currentStreak > 0 ? `Racha de ${weeks(progress.currentStreak)}` : `Entrená ${WEEK_GOAL} veces esta semana para empezar tu racha`}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  )
}

export function RankingCard({ student }: { student: Student }) {
  const { gymId } = useAuth()
  const modules = useModules()
  const ranking = useRanking(gymId, modules.ranking)
  const optOut = useSetRankingOptOut(gymId)
  if (!modules.ranking) return null

  const toggle = () =>
    optOut.mutate(!student.ranking_opt_out, {
      onSuccess: () => toast.success(student.ranking_opt_out ? 'Volviste a aparecer en el ranking.' : 'Ya no aparecés en el ranking.'),
      onError: (e) => toast.error(errorMessage(e)),
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Trophy className="size-4 text-brand" /> Los que más entrenan en {monthName(todayISO().slice(0, 7))}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {ranking.isLoading ? (
          <LoadingState />
        ) : ranking.isError ? (
          <ErrorState error={ranking.error} onRetry={() => ranking.refetch()} />
        ) : !ranking.data?.length ? (
          <p className="text-sm text-muted-foreground">Todavía no hay entrenamientos este mes. ¡Sé el primero!</p>
        ) : (
          <ol className="space-y-1">
            {ranking.data.map((r, i) => (
              <li
                key={`${r.rank_position}-${r.student_label}-${i}`}
                className={cn('flex items-center gap-3 rounded-xl px-2 py-2', r.is_me && 'bg-brand/15', i > 0 && r.is_me && ranking.data[i - 1].rank_position + 1 < r.rank_position && 'mt-3')}
              >
                <span
                  className={cn(
                    'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums',
                    r.rank_position <= 3 ? 'bg-brand text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {r.rank_position}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {r.student_label}
                  {r.is_me && <span className="text-muted-foreground"> (vos)</span>}
                </span>
                <span className="text-sm tabular-nums text-muted-foreground">{r.visits}</span>
              </li>
            ))}
          </ol>
        )}
        <button onClick={toggle} disabled={optOut.isPending} className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline">
          {student.ranking_opt_out ? 'No aparecés en el ranking. Volver a aparecer' : 'No quiero aparecer en el ranking'}
        </button>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------
// Mis entrenamientos
// ---------------------------------------------------------------------

export function MyTrainingPage() {
  const gym = useGym()
  const modules = useModules()
  return (
    <>
      <PageHeader title="Mis entrenamientos" description="Cada ingreso al gimnasio cuenta como un entrenamiento." />
      {gym.isLoading ? (
        <LoadingState />
      ) : !modules.training ? (
        <EmptyState title="Este módulo no está habilitado" description="Consultá en recepción." />
      ) : (
        <WithStudent>{(s) => <Training student={s} showAchievements={modules.achievements} />}</WithStudent>
      )}
    </>
  )
}

function Training({ student, showAchievements }: { student: Student; showAchievements: boolean }) {
  const { visits, progress } = useProgress(student.id)
  const { share, busy } = useShare(student)
  if (visits.isLoading) return <LoadingState />
  if (visits.isError || !progress) return <ErrorState error={visits.error} onRetry={() => visits.refetch()} />

  const month = todayISO().slice(0, 7)
  const shareMonth = () =>
    share(
      {
        kicker: `Mi ${monthName(month)}`,
        big: String(progress.thisMonth),
        label: progress.thisMonth === 1 ? 'entrenamiento este mes' : 'entrenamientos este mes',
        detail: progress.currentStreak > 1 ? `Racha de ${weeks(progress.currentStreak)} seguidas` : undefined,
      },
      `Mi ${monthName(month)} en el gym: ${progress.thisMonth} entrenamientos 💪`,
    )

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Este mes" value={progress.thisMonth} />
        <Stat label="Racha actual" value={weeks(progress.currentStreak)} hint={`${WEEK_GOAL}+ por semana`} highlight={progress.currentStreak > 0} />
        <Stat label="Total" value={progress.total} />
        <Stat label="Mejor racha" value={weeks(progress.bestStreak)} />
      </div>

      {showAchievements && progress.total > 0 && (
        <Button variant="outline" className="w-full sm:w-auto" onClick={shareMonth} loading={busy}>
          <Share2 className="size-4" /> Compartir mi mes
        </Button>
      )}

      <MonthCalendar days={progress.days} />
      <SessionPlans studentId={student.id} visits={progress} />
      {showAchievements && <Achievements progress={progress} onShare={share} busy={busy} />}
    </div>
  )
}

function Stat({ label, value, hint, highlight }: { label: string; value: string | number; hint?: string; highlight?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-xl font-bold tabular-nums', highlight && 'text-brand')}>{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </Card>
  )
}

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

function MonthCalendar({ days }: { days: Set<string> }) {
  const current = todayISO().slice(0, 7)
  const [month, setMonth] = useState(current)
  const shift = (delta: number) => {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(Date.UTC(y, m - 1 + delta, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const lead = (first.getUTCDay() + 6) % 7
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const today = todayISO()
  const trained = [...days].filter((d) => d.startsWith(month)).length

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base capitalize">
          {monthName(month)} {y}
        </CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Mes anterior">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => shift(1)} disabled={month >= current} aria-label="Mes siguiente">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((w, i) => (
            <span key={i} className="pb-1 text-[11px] font-medium text-muted-foreground">
              {w}
            </span>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <span key={`x${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, '0')}`
            const done = days.has(date)
            return (
              <span
                key={date}
                title={done ? `Entrenaste el ${formatDate(date)}` : undefined}
                className={cn(
                  'mx-auto inline-flex aspect-square w-full max-w-11 items-center justify-center rounded-full text-sm tabular-nums',
                  done ? 'bg-brand font-semibold text-white' : date > today ? 'text-muted-foreground/40' : 'text-muted-foreground',
                  date === today && !done && 'ring-1 ring-foreground/40',
                )}
              >
                {i + 1}
              </span>
            )
          })}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {trained} {trained === 1 ? 'día entrenado' : 'días entrenados'} en {monthName(month)}.
        </p>
      </CardContent>
    </Card>
  )
}

function SessionPlans({ studentId, visits }: { studentId: string; visits: Progress }) {
  const plans = useMySessionPlans(studentId)
  if (!plans.data?.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sesiones de mi plan</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {plans.data.map((p) => {
          const used = [...visits.days].filter((d) => d >= p.periodStart && d <= p.periodEnd).length
          const left = Math.max(p.granted - used, 0)
          return (
            <div key={`${p.planName}-${p.periodStart}`}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium">{p.planName}</p>
                <p className="text-sm tabular-nums">
                  <span className={cn('text-lg font-bold', left === 0 && 'text-destructive')}>{left}</span>
                  <span className="text-muted-foreground"> de {p.granted} restantes</span>
                </p>
              </div>
              <Bar value={Math.min(used, p.granted)} max={p.granted} />
              <p className="mt-1 text-xs text-muted-foreground">
                Usaste {Math.min(used, p.granted)} · período del {formatDate(p.periodStart)} al {formatDate(p.periodEnd)}
              </p>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

function Bar({ value, max }: { value: number; max: number }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <div className="h-full rounded-full bg-brand" style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  )
}

const KIND_ICON: Record<AchievementKind, typeof Trophy> = { visits: Medal, streak: Flame, month: CalendarCheck, early: Sunrise }

function Achievements({
  progress,
  onShare,
  busy,
}: {
  progress: Progress
  onShare: (c: Omit<ShareCardContent, 'name' | 'footer'>, text: string) => void
  busy: boolean
}) {
  const unlocked = progress.achievements.filter((a) => a.unlockedOn)
  const share = (a: Achievement) =>
    onShare(
      { kicker: 'Logro desbloqueado', big: a.title, label: a.description, detail: `Logrado el ${formatDate(a.unlockedOn)}` },
      `¡Logro desbloqueado en el gym: ${a.title}! 🏆`,
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          Logros <span className="font-normal text-muted-foreground">· {unlocked.length} de {progress.achievements.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2">
          {progress.achievements.map((a) => {
            const Icon = a.unlockedOn ? KIND_ICON[a.kind] : Lock
            return (
              <li key={a.code} className={cn('flex items-start gap-3 rounded-2xl border border-border p-3', !a.unlockedOn && 'opacity-70')}>
                <span
                  className={cn(
                    'inline-flex size-10 shrink-0 items-center justify-center rounded-full',
                    a.unlockedOn ? 'bg-brand text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {a.unlockedOn ? (
                    <p className="mt-1 text-xs text-muted-foreground">Logrado el {formatDate(a.unlockedOn)}</p>
                  ) : (
                    <>
                      <Bar value={a.current} max={a.target} />
                      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                        {a.current} / {a.target}
                      </p>
                    </>
                  )}
                </div>
                {a.unlockedOn && (
                  <Button variant="ghost" size="icon" onClick={() => share(a)} disabled={busy} aria-label={`Compartir ${a.title}`}>
                    <Share2 className="size-4" />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
