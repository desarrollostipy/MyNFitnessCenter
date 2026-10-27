import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { todayISO } from '@/lib/format'
import type { Student, StudentStatus, TrainerAssignment } from '@/types/domain'

export const STUDENTS_PAGE_SIZE = 20
const PHOTO_BUCKET = 'student-photos'

/** Quita caracteres con significado en la sintaxis de filtros de PostgREST. */
const safeTerm = (s: string) => s.replace(/[,()*%.]/g, ' ').trim()

export function useStudents(gymId: string, opts: { search: string; status: StudentStatus | 'all'; page: number }) {
  return useQuery({
    queryKey: ['students', gymId, opts],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from('students')
        .select('id, first_name, last_name, document_number, phone, email, status, enrolled_on, photo_path', { count: 'exact' })
        .eq('gym_id', gymId)
        .order('last_name')
        .order('first_name')
        .range(opts.page * STUDENTS_PAGE_SIZE, opts.page * STUDENTS_PAGE_SIZE + STUDENTS_PAGE_SIZE - 1)
      if (opts.status !== 'all') q = q.eq('status', opts.status)
      // Cada palabra debe aparecer en nombre, apellido, documento o teléfono.
      for (const word of safeTerm(opts.search).split(/\s+/).filter(Boolean)) {
        q = q.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,document_number.ilike.%${word}%,phone.ilike.%${word}%`)
      }
      const { data, error, count } = await q
      if (error) throw error
      return { rows: (data ?? []) as Pick<Student, 'id' | 'first_name' | 'last_name' | 'document_number' | 'phone' | 'email' | 'status' | 'enrolled_on' | 'photo_path'>[], total: count ?? 0 }
    },
  })
}

export function useStudent(id: string | undefined) {
  return useQuery({
    queryKey: ['student', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('students').select('*').eq('id', id!).maybeSingle()
      if (error) throw error
      return data as Student | null
    },
  })
}

export type StudentInput = Omit<
  Student,
  'id' | 'gym_id' | 'user_id' | 'status' | 'status_reason' | 'status_changed_at' | 'photo_path' | 'created_at' | 'lead_id'
>

export function useSaveStudent(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values, leadId }: { id?: string; values: StudentInput; leadId?: string | null }) => {
      if (id) {
        const { error } = await supabase.from('students').update(values).eq('id', id)
        if (error) throw error
        return id
      }
      const { data, error } = await supabase
        .from('students')
        .insert({ ...values, gym_id: gymId, lead_id: leadId ?? null })
        .select('id')
        .single()
      if (error) throw error
      if (leadId) {
        // El alumno ya quedó creado; si esto falla sólo queda el prospecto sin marcar.
        await supabase.from('leads').update({ status: 'converted', student_id: data.id }).eq('id', leadId)
      }
      return data.id as string
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['students', gymId] })
      qc.invalidateQueries({ queryKey: ['student', id] })
      qc.invalidateQueries({ queryKey: ['leads', gymId] })
    },
  })
}

export function useSetStudentStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { id: string; status: StudentStatus; reason: string | null }) => {
      const { error } = await supabase
        .from('students')
        .update({ status: args.status, status_reason: args.reason })
        .eq('id', args.id)
      if (error) throw error
    },
    onSuccess: (_d, args) => {
      qc.invalidateQueries({ queryKey: ['students'] })
      qc.invalidateQueries({ queryKey: ['student', args.id] })
    },
  })
}

// ---------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------

export function usePhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['photo-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(path!, 60 * 60)
      if (error) throw error
      return data.signedUrl
    },
  })
}

/** Reduce la imagen a 512 px de lado mayor y la convierte a JPEG (protege tamaño y metadatos EXIF). */
async function resizeImage(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen'))), 'image/jpeg', 0.85),
  )
}

export function useUploadStudentPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ student, file }: { student: Pick<Student, 'id' | 'gym_id' | 'photo_path'>; file: File }) => {
      if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen')
      if (file.size > 15 * 1024 * 1024) throw new Error('La imagen supera los 15 MB')
      const blob = await resizeImage(file)
      const path = `${student.gym_id}/${student.id}/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error } = await supabase.from('students').update({ photo_path: path }).eq('id', student.id)
      if (error) {
        await supabase.storage.from(PHOTO_BUCKET).remove([path])
        throw error
      }
      if (student.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([student.photo_path])
    },
    onSuccess: (_d, { student }) => {
      qc.invalidateQueries({ queryKey: ['student', student.id] })
      qc.invalidateQueries({ queryKey: ['students'] })
    },
  })
}

export function useRemoveStudentPhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (student: Pick<Student, 'id' | 'photo_path'>) => {
      const { error } = await supabase.from('students').update({ photo_path: null }).eq('id', student.id)
      if (error) throw error
      if (student.photo_path) await supabase.storage.from(PHOTO_BUCKET).remove([student.photo_path])
    },
    onSuccess: (_d, student) => qc.invalidateQueries({ queryKey: ['student', student.id] }),
  })
}

// ---------------------------------------------------------------------
// Entrenadores asignados
// ---------------------------------------------------------------------

export function useStudentAssignments(studentId: string | undefined) {
  return useQuery({
    queryKey: ['assignments', studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trainer_student_assignments')
        .select('id, trainer_id, student_id, starts_on, ends_on, trainers(first_name, last_name, is_active)')
        .eq('student_id', studentId!)
        .order('ends_on', { ascending: false, nullsFirst: true })
        .order('starts_on', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as TrainerAssignment[]
    },
  })
}

export function useAssignTrainer(gymId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { studentId: string; trainerId: string }) => {
      const { error } = await supabase
        .from('trainer_student_assignments')
        .insert({ gym_id: gymId, student_id: args.studentId, trainer_id: args.trainerId })
      if (error) {
        if (error.code === '23505') throw new Error('Ese entrenador ya está asignado a este alumno.')
        throw error
      }
    },
    onSuccess: (_d, args) => qc.invalidateQueries({ queryKey: ['assignments', args.studentId] }),
  })
}

export function useEndAssignment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (a: Pick<TrainerAssignment, 'id' | 'student_id'>) => {
      // ends_on es exclusivo: con la fecha de hoy el acceso del entrenador termina de inmediato.
      const { error } = await supabase.from('trainer_student_assignments').update({ ends_on: todayISO() }).eq('id', a.id)
      if (error) throw error
    },
    onSuccess: (_d, a) => qc.invalidateQueries({ queryKey: ['assignments', a.student_id] }),
  })
}
