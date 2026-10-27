import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, Pencil, Trash2, UserCheck, UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { errorMessage } from '@/lib/errors'
import { formatDate, formatDateTime } from '@/lib/format'
import { useAuth } from '@/features/auth/AuthProvider'
import { useTrainers } from '@/features/trainers/api'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/input'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/states'
import { STUDENT_STATUS_LABELS, fullName, type Student, type TrainerAssignment } from '@/types/domain'
import {
  useAssignTrainer,
  useEndAssignment,
  useRemoveStudentPhoto,
  useSetStudentStatus,
  useStudent,
  useStudentAssignments,
  useUploadStudentPhoto,
} from './api'
import { StudentAvatar } from './StudentAvatar'
import { StudentFormDialog } from './StudentFormDialog'
import { StudentMembershipSection } from '@/features/memberships/StudentMembershipSection'

function ageFrom(birth: string | null) {
  if (!birth) return null
  const b = new Date(birth + 'T00:00:00')
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  if (now < new Date(now.getFullYear(), b.getMonth(), b.getDate())) age--
  return age
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-2 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words">{value || '—'}</dd>
    </div>
  )
}

export function StudentDetailPage() {
  const { id } = useParams()
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin')
  const student = useStudent(id)
  const [editing, setEditing] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  if (student.isLoading) return <LoadingState />
  if (student.isError) return <ErrorState error={student.error} onRetry={() => student.refetch()} />
  if (!student.data) return <EmptyState title="Alumno no encontrado" description="No existe o no tiene permiso para verlo." />

  const s = student.data
  const age = ageFrom(s.birth_date)

  return (
    <>
      <Link to="/admin/alumnos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Alumnos
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <PhotoBlock student={s} canEdit={isAdmin} />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{fullName(s)}</h1>
            <p className="text-sm text-muted-foreground">CI {s.document_number}</p>
            <Badge className="mt-1" tone={s.status === 'active' ? 'accent' : 'neutral'}>
              {STUDENT_STATUS_LABELS[s.status]}
            </Badge>
          </div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Editar
            </Button>
            <Button variant={s.status === 'active' ? 'outline' : 'default'} onClick={() => setStatusOpen(true)}>
              {s.status === 'active' ? (
                <>
                  <UserMinus /> Dar de baja
                </>
              ) : (
                <>
                  <UserCheck /> Reactivar
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {s.status === 'inactive' && (
        <div className="mb-6 rounded-lg border border-border bg-muted px-4 py-3 text-sm">
          Dado de baja el {formatDateTime(s.status_changed_at)}
          {s.status_reason ? ` — ${s.status_reason}` : ''}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <Row label="Nacimiento" value={s.birth_date ? `${formatDate(s.birth_date)}${age !== null ? ` (${age} años)` : ''}` : null} />
              <Row label="Teléfono" value={s.phone} />
              <Row label="Email" value={s.email} />
              <Row label="Dirección" value={s.address} />
              <Row label="Inscripción" value={formatDate(s.enrolled_on)} />
              <Row
                label="Emergencia"
                value={[s.emergency_contact_name, s.emergency_contact_phone].filter(Boolean).join(' · ')}
              />
              <Row label="Acceso al portal" value={s.user_id ? 'Vinculado' : 'Sin cuenta'} />
            </dl>
            {s.notes && (
              <div className="mt-4 rounded-lg bg-muted p-3 text-sm">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Observaciones</p>
                <p className="whitespace-pre-wrap">{s.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <AssignmentsCard student={s} canEdit={isAdmin} />
      </div>

      <div className="mt-6">
        <StudentMembershipSection student={s} />
      </div>

      {editing && <StudentFormDialog student={s} onClose={() => setEditing(false)} />}
      {statusOpen && <StatusDialog student={s} onClose={() => setStatusOpen(false)} />}
    </>
  )
}

function PhotoBlock({ student, canEdit }: { student: Student; canEdit: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const upload = useUploadStudentPhoto()
  const remove = useRemoveStudentPhoto()
  const [confirmRemove, setConfirmRemove] = useState(false)

  return (
    <div className="relative">
      <StudentAvatar photoPath={student.photo_path} firstName={student.first_name} lastName={student.last_name} size="lg" />
      {canEdit && (
        <>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              upload.mutate(
                { student, file },
                {
                  onSuccess: () => toast.success('Foto actualizada.'),
                  onError: (err) => toast.error(errorMessage(err)),
                },
              )
            }}
          />
          <div className="absolute -bottom-1 -right-1 flex gap-1">
            <Button
              size="icon"
              variant="outline"
              className="size-8 rounded-full"
              loading={upload.isPending}
              onClick={() => input.current?.click()}
              aria-label="Cambiar foto"
            >
              {!upload.isPending && <Camera />}
            </Button>
            {student.photo_path && (
              <Button
                size="icon"
                variant="outline"
                className="size-8 rounded-full"
                onClick={() => setConfirmRemove(true)}
                aria-label="Quitar foto"
              >
                <Trash2 />
              </Button>
            )}
          </div>
          <ConfirmDialog
            open={confirmRemove}
            onOpenChange={setConfirmRemove}
            title="Quitar foto"
            description="La fotografía se eliminará del sistema."
            confirmLabel="Quitar"
            destructive
            loading={remove.isPending}
            onConfirm={() =>
              remove.mutate(student, {
                onSuccess: () => {
                  toast.success('Foto eliminada.')
                  setConfirmRemove(false)
                },
                onError: (err) => toast.error(errorMessage(err)),
              })
            }
          />
        </>
      )}
    </div>
  )
}

function StatusDialog({ student, onClose }: { student: Student; onClose: () => void }) {
  const setStatus = useSetStudentStatus()
  const deactivating = student.status === 'active'
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string>()

  const submit = () => {
    if (deactivating && reason.trim().length < 3) {
      setError('Indique el motivo de la baja')
      return
    }
    setStatus.mutate(
      { id: student.id, status: deactivating ? 'inactive' : 'active', reason: deactivating ? reason.trim() : null },
      {
        onSuccess: () => {
          toast.success(deactivating ? 'Alumno dado de baja.' : 'Alumno reactivado.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    )
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={deactivating ? 'Dar de baja al alumno' : 'Reactivar alumno'}
      description={
        deactivating
          ? 'Es una baja lógica: la ficha y todo su historial se conservan y puede reactivarse.'
          : 'El alumno volverá a figurar como activo.'
      }
    >
      {deactivating && (
        <Field label="Motivo" htmlFor="st-reason" error={error}>
          <Textarea id="st-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </Field>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancelar
        </Button>
        <Button variant={deactivating ? 'destructive' : 'default'} loading={setStatus.isPending} onClick={submit}>
          {deactivating ? 'Dar de baja' : 'Reactivar'}
        </Button>
      </div>
    </Dialog>
  )
}

function AssignmentsCard({ student, canEdit }: { student: Student; canEdit: boolean }) {
  const { gymId } = useAuth()
  const assignments = useStudentAssignments(student.id)
  const trainers = useTrainers(gymId)
  const assign = useAssignTrainer(gymId)
  const end = useEndAssignment()
  const [trainerId, setTrainerId] = useState('')
  const [ending, setEnding] = useState<TrainerAssignment | null>(null)

  const current = (assignments.data ?? []).filter((a) => !a.ends_on)
  const past = (assignments.data ?? []).filter((a) => a.ends_on)
  const available = (trainers.data ?? []).filter((t) => t.is_active && !current.some((a) => a.trainer_id === t.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrenadores asignados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {assignments.isLoading ? (
          <LoadingState />
        ) : assignments.isError ? (
          <ErrorState error={assignments.error} onRetry={() => assignments.refetch()} />
        ) : (
          <>
            {current.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin entrenador asignado.</p>
            ) : (
              <ul className="divide-y divide-border">
                {current.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium">{a.trainers ? fullName(a.trainers) : '—'}</p>
                      <p className="text-xs text-muted-foreground">Desde {formatDate(a.starts_on)}</p>
                    </div>
                    {canEdit && (
                      <Button size="sm" variant="ghost" onClick={() => setEnding(a)}>
                        Finalizar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canEdit && student.status === 'active' && (
              <div className="flex gap-2">
                <Select aria-label="Entrenador a asignar" value={trainerId} onChange={(e) => setTrainerId(e.target.value)}>
                  <option value="">{available.length ? 'Seleccionar entrenador…' : 'No hay entrenadores disponibles'}</option>
                  {available.map((t) => (
                    <option key={t.id} value={t.id}>
                      {fullName(t)}
                    </option>
                  ))}
                </Select>
                <Button
                  disabled={!trainerId}
                  loading={assign.isPending}
                  onClick={() =>
                    assign.mutate(
                      { studentId: student.id, trainerId },
                      {
                        onSuccess: () => {
                          toast.success('Entrenador asignado.')
                          setTrainerId('')
                        },
                        onError: (e) => toast.error(errorMessage(e)),
                      },
                    )
                  }
                >
                  Asignar
                </Button>
              </div>
            )}

            {past.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">Historial ({past.length})</summary>
                <ul className="mt-2 space-y-1">
                  {past.map((a) => (
                    <li key={a.id} className="text-muted-foreground">
                      {a.trainers ? fullName(a.trainers) : '—'} · {formatDate(a.starts_on)} – {formatDate(a.ends_on)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!ending}
        onOpenChange={(o) => !o && setEnding(null)}
        title="Finalizar asignación"
        description={`${ending?.trainers ? fullName(ending.trainers) : 'El entrenador'} dejará de ver la ficha de ${fullName(student)} desde hoy. La asignación queda en el historial.`}
        confirmLabel="Finalizar"
        destructive
        loading={end.isPending}
        onConfirm={() =>
          ending &&
          end.mutate(ending, {
            onSuccess: () => {
              toast.success('Asignación finalizada.')
              setEnding(null)
            },
            onError: (e) => toast.error(errorMessage(e)),
          })
        }
      />
    </Card>
  )
}
