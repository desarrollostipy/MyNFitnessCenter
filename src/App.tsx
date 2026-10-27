import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { GYM_ID, isSupabaseConfigured } from '@/lib/supabase'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { RequireAuth, RequireRole } from '@/app/guards'
import { AppShell } from '@/app/layouts/AppShell'
import { homePathFor } from '@/app/navigation'
import { LoadingState } from '@/components/states'
import { LoginPage } from '@/features/auth/pages/LoginPage'
import { ForgotPasswordPage } from '@/features/auth/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/features/auth/pages/ResetPasswordPage'
import { PublicHomePage } from '@/features/public/PublicHomePage'
import { ConfigMissingPage, NoAccessPage, NotFoundPage } from '@/features/public/MessagePages'
import { ProfilePage } from '@/features/account/ProfilePage'
import { UsersPage } from '@/features/users/UsersPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { GymSettingsPage } from '@/features/settings/GymSettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
    // Nunca reintentar mutaciones automáticamente: las operaciones críticas usan idempotencia explícita.
    mutations: { retry: 0 },
  },
})

function HomeRedirect() {
  const { hasRole, loading } = useAuth()
  if (loading) return <LoadingState />
  return <Navigate to={homePathFor(hasRole)} replace />
}

export default function App() {
  if (!isSupabaseConfigured || !GYM_ID) return <ConfigMissingPage />

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<PublicHomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recuperar" element={<ForgotPasswordPage />} />
            <Route path="/restablecer" element={<ResetPasswordPage />} />
            <Route path="/sin-acceso" element={<NoAccessPage />} />

            <Route
              element={
                <RequireAuth>
                  <AppShell />
                </RequireAuth>
              }
            >
              <Route path="/inicio" element={<HomeRedirect />} />
              <Route path="/cuenta" element={<ProfilePage />} />
              <Route path="/admin/usuarios" element={<RequireRole roles={['admin']}><UsersPage /></RequireRole>} />
              <Route path="/admin/auditoria" element={<RequireRole roles={['admin', 'accountant']}><AuditPage /></RequireRole>} />
              <Route path="/admin/configuracion" element={<RequireRole roles={['admin']}><GymSettingsPage /></RequireRole>} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
