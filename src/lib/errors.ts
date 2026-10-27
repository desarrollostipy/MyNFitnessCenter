// Traduce errores de Supabase/PostgREST a mensajes comprensibles.

type MaybePgError = { message?: string; code?: string; status?: number }

const AUTH_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'Email o contraseña incorrectos.',
  'Email not confirmed': 'Debe confirmar su email antes de ingresar.',
  'User already registered': 'Ya existe un usuario con ese email.',
  'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
  'New password should be different from the old password.':
    'La nueva contraseña debe ser distinta de la anterior.',
}

export function errorMessage(err: unknown): string {
  if (!err) return 'Ocurrió un error inesperado.'
  const e = err as MaybePgError
  const msg = e.message ?? String(err)

  if (AUTH_MESSAGES[msg]) return AUTH_MESSAGES[msg]
  if (e.code === '42501') return 'No tiene permisos para realizar esta operación.'
  if (e.code === '23505') return 'El registro ya existe (dato duplicado).'
  if (e.code === '23503') return 'El registro está relacionado con otros datos.'
  if (e.code === '23514') return 'Los datos no cumplen las reglas de validación. Revise los valores ingresados.'
  if (e.code === 'P0001') return msg // errores de negocio lanzados por las RPC, ya en español
  if (msg.includes('Failed to fetch')) return 'Sin conexión con el servidor. Verifique su internet.'
  return msg
}
