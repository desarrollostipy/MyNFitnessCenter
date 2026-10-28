import { CircleSlash, DoorOpen, Fingerprint, Info, Nfc, RefreshCw, Router } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { CheckboxField } from '@/components/ui/form-controls'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageHeader } from '@/components/states'

/*
 * VISTA PREVIA de la integración con el molinete ZKTeco (próxima etapa).
 * Nada de esta pantalla está conectado: los controles están deshabilitados y
 * las filas de las tablas son ejemplos rotulados como tales. Cuando se implemente,
 * los ingresos del equipo llegan a check_ins con source = 'device'.
 */

const SAMPLE_SYNC = [
  { name: 'Alumno de ejemplo 1', ci: '1.234.567', id: 'Huella + tag', state: 'Habilitado' },
  { name: 'Alumno de ejemplo 2', ci: '2.345.678', id: 'Huella', state: 'Bloqueado: cuota vencida' },
  { name: 'Alumno de ejemplo 3', ci: '3.456.789', id: 'Tag', state: 'Bloqueado: pase terminado' },
]

const SAMPLE_EVENTS = [
  { time: '07:02', name: 'Alumno de ejemplo 1', how: 'Huella', result: 'Pasó' },
  { time: '07:15', name: 'Alumno de ejemplo 2', how: 'Huella', result: 'Rechazado: cuota vencida' },
  { time: '07:31', name: 'Recepción', how: 'Botón "Abrir molinete"', result: 'Abierto con motivo' },
]

export function TurnstilePreviewPage() {
  return (
    <>
      <PageHeader
        title="Molinete"
        description="Conexión con el molinete ZKTeco TS2000 para habilitar el paso según el estado de pago."
      />

      <div className="mb-6 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
        <Info className="mt-0.5 size-5 shrink-0 text-warning" />
        <div>
          <p className="font-semibold">Vista previa — se habilita en la próxima etapa</p>
          <p className="text-muted-foreground">
            Esta pantalla muestra cómo va a funcionar. Todavía no está conectada al equipo: los controles están deshabilitados y las
            filas son ejemplos. Hoy el ingreso se registra desde Control de ingreso.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <Router className="size-5" /> Equipo
            </CardTitle>
            <Badge>
              <CircleSlash className="mr-1 size-3" /> No conectado
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Molinete</dt>
              <dd>ZKTeco serie TS2000</dd>
              <dt className="text-muted-foreground">Lector</dt>
              <dd>Modelo a confirmar</dd>
              <dt className="text-muted-foreground">Red</dt>
              <dd>Cable o wifi del gimnasio</dd>
              <dt className="text-muted-foreground">Última conexión</dt>
              <dd>—</dd>
            </dl>
            <Field label="Dirección del servidor (se carga en el equipo)" htmlFor="tp-server" hint="Se genera al activar la integración.">
              <Input id="tp-server" disabled placeholder="Disponible en la próxima etapa" />
            </Field>
            <Button variant="outline" disabled className="w-full">
              <RefreshCw /> Probar conexión
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reglas de paso</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <CheckboxField
              id="tp-overdue"
              disabled
              defaultChecked
              label="Bloquear con cuotas vencidas"
              hint="El alumno queda bloqueado en el molinete al vencer su cuota y se habilita en segundos al pagar."
            />
            <Field label="Días de gracia después del vencimiento" htmlFor="tp-grace" hint="Regla a definir con el gimnasio.">
              <Input id="tp-grace" type="number" disabled placeholder="A definir" className="w-32" />
            </Field>
            <CheckboxField
              id="tp-pass"
              disabled
              defaultChecked
              label="Pases diarios y semanales"
              hint="Habilitados sólo durante su vigencia."
            />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Fingerprint className="size-5" /> Huella
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border p-3">
                <Nfc className="size-5" /> Tag M&amp;N
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Alumnos en el molinete</CardTitle>
            <Badge>Ejemplo</Badge>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {SAMPLE_SYNC.map((r) => (
                <li key={r.ci} className="flex items-center justify-between gap-3 py-2.5 text-muted-foreground">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{r.name}</span>
                    CI {r.ci} · {r.id}
                  </span>
                  <Badge tone={r.state === 'Habilitado' ? 'accent' : 'danger'}>{r.state}</Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Pasadas recientes</CardTitle>
            <Badge>Ejemplo</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="divide-y divide-border text-sm">
              {SAMPLE_EVENTS.map((e) => (
                <li key={e.time} className="flex items-center gap-3 py-2.5 text-muted-foreground">
                  <span className="w-12 shrink-0 tabular-nums">{e.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-foreground">{e.name}</span>
                    {e.how}
                  </span>
                  <span className="text-right text-xs">{e.result}</span>
                </li>
              ))}
            </ul>
            <Button size="lg" variant="accent" disabled className="w-full">
              <DoorOpen /> Abrir molinete
            </Button>
            <p className="text-center text-xs text-muted-foreground">Disponible al conectar el equipo. Pide motivo y queda registrado.</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
