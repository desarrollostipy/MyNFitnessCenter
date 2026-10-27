import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Brand } from '@/components/Brand'

function Message({ title, body, action }: { title: string; body: string; action?: { to: string; label: string } }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action && (
        <Button asChild>
          <Link to={action.to}>{action.label}</Link>
        </Button>
      )}
    </div>
  )
}

export function NoAccessPage() {
  return (
    <Message
      title="Sin acceso"
      body="Su usuario no tiene el perfil necesario para ver esta sección. Si cree que es un error, consulte con la administración."
      action={{ to: '/inicio', label: 'Ir al inicio' }}
    />
  )
}

export function NotFoundPage() {
  return <Message title="Página no encontrada" body="La dirección no existe." action={{ to: '/', label: 'Volver' }} />
}

export function ConfigMissingPage() {
  return (
    <Message
      title="Configuración incompleta"
      body="Faltan las variables VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY y VITE_GYM_ID. Copie .env.example a .env.local y complete los valores del proyecto Supabase."
    />
  )
}
