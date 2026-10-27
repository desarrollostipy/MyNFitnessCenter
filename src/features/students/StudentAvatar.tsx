import { cn } from '@/lib/utils'
import { usePhotoUrl } from './api'

export function StudentAvatar({
  photoPath,
  firstName,
  lastName,
  size = 'sm',
}: {
  photoPath: string | null
  firstName: string
  lastName: string
  size?: 'sm' | 'lg'
}) {
  const url = usePhotoUrl(photoPath)
  const cls = size === 'lg' ? 'size-24 text-2xl' : 'size-9 text-xs'
  if (url.data) {
    return <img src={url.data} alt="" className={cn('shrink-0 rounded-full object-cover', cls)} />
  }
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground', cls)}
      aria-hidden
    >
      {(firstName[0] ?? '') + (lastName[0] ?? '')}
    </span>
  )
}
