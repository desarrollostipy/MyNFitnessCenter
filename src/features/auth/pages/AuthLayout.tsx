import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Brand } from '@/components/Brand'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-graphite px-4 py-12">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 block text-center">
          <Brand dark className="text-xl" />
        </Link>
        <div className="rounded-lg bg-card p-6 shadow-xl">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  )
}
