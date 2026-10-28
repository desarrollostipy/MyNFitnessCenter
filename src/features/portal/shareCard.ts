// Tarjeta para compartir (formato historia 1080×1920), dibujada en el navegador.
// No sale nada del dispositivo hasta que el alumno elige dónde compartirla.

export interface ShareCardContent {
  kicker: string // ej. "LOGRO DESBLOQUEADO"
  big: string // ej. "14" o "Madrugador"
  label: string // ej. "entrenamientos en octubre"
  detail?: string
  name: string
  footer: string // ej. "M&N Fitness · Itauguá"
}

const W = 1080
const H = 1920
const BRAND = '#e3131b'
const SMOKE = '#f5f5f6'
const FONT = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Monograma (mismos trazos que <Monogram />, viewBox 270 112 658 566).
const MONOGRAM = ['M312 118H447L605 276L778 118H922V530L815 627V212L597 407Z', 'M275 212L597 541L778 376V495L592 672L375 450V598L275 500Z']

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, start: number, weight = 800) {
  let size = start
  do {
    ctx.font = `${weight} ${size}px ${FONT}`
    size -= 4
  } while (ctx.measureText(text).width > maxWidth && size > 40)
}

export async function renderShareCard(c: ShareCardContent): Promise<Blob> {
  await document.fonts?.ready
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#070708'
  ctx.fillRect(0, 0, W, H)
  const glow = (x: number, y: number, r: number, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r)
    g.addColorStop(0, `rgba(227, 19, 27, ${alpha})`)
    g.addColorStop(1, 'rgba(227, 19, 27, 0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }
  glow(W * 0.9, H * 0.12, 900, 0.55)
  glow(W * 0.05, H * 0.95, 800, 0.25)

  // Marca
  ctx.save()
  ctx.translate(96, 150)
  const scale = 110 / 566
  ctx.scale(scale, scale)
  ctx.translate(-270, -112)
  ctx.fillStyle = SMOKE
  for (const d of MONOGRAM) ctx.fill(new Path2D(d))
  ctx.restore()
  ctx.fillStyle = SMOKE
  ctx.font = `800 52px ${FONT}`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText('M', 250, 205)
  const mW = ctx.measureText('M').width
  ctx.fillStyle = BRAND
  ctx.fillText('&', 250 + mW, 205)
  const ampW = ctx.measureText('&').width
  ctx.fillStyle = SMOKE
  ctx.fillText('N', 250 + mW + ampW, 205)
  ctx.font = `700 24px ${FONT}`
  ctx.fillStyle = 'rgba(245, 245, 246, 0.7)'
  ctx.fillText('F I T N E S S', 252, 245)

  // Contenido central
  const left = 96
  const maxW = W - left * 2
  ctx.fillStyle = BRAND
  ctx.font = `700 40px ${FONT}`
  ctx.fillText(c.kicker.toUpperCase().split('').join(' '), left, 760)

  ctx.fillStyle = SMOKE
  fitText(ctx, c.big, maxW, c.big.length <= 4 ? 360 : 150)
  ctx.fillText(c.big, left - 8, c.big.length <= 4 ? 1080 : 950)

  ctx.font = `600 64px ${FONT}`
  wrap(ctx, c.label, left, c.big.length <= 4 ? 1180 : 1060, maxW, 78)

  if (c.detail) {
    ctx.fillStyle = 'rgba(245, 245, 246, 0.65)'
    ctx.font = `500 40px ${FONT}`
    wrap(ctx, c.detail, left, c.big.length <= 4 ? 1340 : 1240, maxW, 54)
  }

  // Pie
  ctx.fillStyle = BRAND
  ctx.fillRect(left, 1640, 96, 8)
  ctx.fillStyle = SMOKE
  ctx.font = `800 64px ${FONT}`
  ctx.fillText(c.name, left, 1740)
  ctx.fillStyle = 'rgba(245, 245, 246, 0.65)'
  ctx.font = `500 36px ${FONT}`
  ctx.fillText(c.footer, left, 1800)

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png'))
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width > maxW && line) {
      ctx.fillText(line, x, y)
      line = word
      y += lineH
    } else line = next
  }
  if (line) ctx.fillText(line, x, y)
}

/**
 * Comparte la imagen con el menú nativo del celular (Instagram, WhatsApp…).
 * Si el navegador no lo permite, la descarga.
 */
export async function shareCard(content: ShareCardContent, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const blob = await renderShareCard(content)
  const file = new File([blob], 'myn-fitness.png', { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return 'shared'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled'
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'myn-fitness.png'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
