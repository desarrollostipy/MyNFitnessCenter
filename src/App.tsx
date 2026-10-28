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
import { CreatePasswordPage } from '@/features/auth/pages/CreatePasswordPage'
import { PublicHomePage } from '@/features/public/PublicHomePage'
import { ConfigMissingPage, NoAccessPage, NotFoundPage } from '@/features/public/MessagePages'
import { ProfilePage } from '@/features/account/ProfilePage'
import { UsersPage } from '@/features/users/UsersPage'
import { AuditPage } from '@/features/audit/AuditPage'
import { GymSettingsPage } from '@/features/settings/GymSettingsPage'
import { PublicLayout } from '@/features/public/PublicLayout'
import { PublicPlansPage, PublicServicesPage } from '@/features/public/PublicCatalogPages'
import { ContactPage } from '@/features/public/ContactPage'
import { PlansPage } from '@/features/catalog/PlansPage'
import { ServicesPage } from '@/features/catalog/ServicesPage'
import { PaymentMethodsPage } from '@/features/catalog/PaymentMethodsPage'
import { LeadsPage } from '@/features/leads/LeadsPage'
import { StudentsPage } from '@/features/students/StudentsPage'
import { StudentDetailPage } from '@/features/students/StudentDetailPage'
import { TrainersPage } from '@/features/trainers/TrainersPage'
import { MyStudentsPage } from '@/features/trainers/MyStudentsPage'
import { ChargesPage } from '@/features/memberships/ChargesPage'
import { CashPage } from '@/features/cash/CashPage'
import { CollectPage } from '@/features/cash/CollectPage'
import { ReceiptPage } from '@/features/cash/ReceiptPage'
import { PaymentsPage } from '@/features/cash/PaymentsPage'
import { ExpensesPage } from '@/features/expenses/ExpensesPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MyHomePage, MyMembershipPage, MyPaymentsPage } from '@/features/portal/PortalPages'
import { CheckInPage } from '@/features/reception/CheckInPage'
import { QuickSalePage } from '@/features/reception/QuickSalePage'
import { TurnstilePreviewPage } from '@/features/turnstile/TurnstilePreviewPage'
import { FRONT_DESK_ROLES } from '@/types/domain'

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
            <Route element={<PublicLayout />}>
              <Route path="/" element={<PublicHomePage />} />
              <Route path="/planes" element={<PublicPlansPage />} />
              <Route path="/servicios" element={<PublicServicesPage />} />
              <Route path="/contacto" element={<ContactPage />} />
            </Route>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/recuperar" element={<ForgotPasswordPage />} />
            <Route path="/restablecer" element={<ResetPasswordPage />} />
            <Route path="/crear-clave" element={<CreatePasswordPage />} />
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
              <Route path="/admin/planes" element={<RequireRole roles={['admin']}><PlansPage /></RequireRole>} />
              <Route path="/admin/servicios" element={<RequireRole roles={['admin']}><ServicesPage /></RequireRole>} />
              <Route path="/admin/medios-de-pago" element={<RequireRole roles={['admin']}><PaymentMethodsPage /></RequireRole>} />
              <Route path="/admin/prospectos" element={<RequireRole roles={['admin', 'treasurer']}><LeadsPage /></RequireRole>} />
              <Route path="/admin/alumnos" element={<RequireRole roles={['admin', 'accountant', 'treasurer']}><StudentsPage /></RequireRole>} />
              <Route path="/admin/alumnos/:id" element={<RequireRole roles={['admin', 'accountant', 'treasurer']}><StudentDetailPage /></RequireRole>} />
              <Route path="/caja" element={<RequireRole roles={FRONT_DESK_ROLES}><CashPage /></RequireRole>} />
              <Route path="/caja/cobrar" element={<RequireRole roles={FRONT_DESK_ROLES}><CollectPage /></RequireRole>} />
              <Route path="/caja/venta-rapida" element={<RequireRole roles={FRONT_DESK_ROLES}><QuickSalePage /></RequireRole>} />
              <Route path="/admin/molinete" element={<RequireRole roles={['admin']}><TurnstilePreviewPage /></RequireRole>} />
              <Route path="/ingreso" element={<RequireRole roles={FRONT_DESK_ROLES}><CheckInPage /></RequireRole>} />
              <Route path="/recibo/:id" element={<RequireRole roles={['admin', 'accountant', 'treasurer', 'cashier', 'student']}><ReceiptPage /></RequireRole>} />
              <Route path="/mi" element={<RequireRole roles={['student']}><MyHomePage /></RequireRole>} />
              <Route path="/mi/membresia" element={<RequireRole roles={['student']}><MyMembershipPage /></RequireRole>} />
              <Route path="/mi/pagos" element={<RequireRole roles={['student']}><MyPaymentsPage /></RequireRole>} />
              <Route path="/admin/cobros" element={<RequireRole roles={['admin', 'accountant', 'treasurer']}><PaymentsPage /></RequireRole>} />
              <Route path="/admin/egresos" element={<RequireRole roles={['admin', 'accountant', 'treasurer']}><ExpensesPage /></RequireRole>} />
              <Route path="/admin/dashboard" element={<RequireRole roles={['admin', 'accountant']}><DashboardPage /></RequireRole>} />
              <Route path="/admin/cuotas"element={<RequireRole roles={['admin', 'accountant', 'treasurer']}><ChargesPage /></RequireRole>} />
              <Route path="/admin/entrenadores"element={<RequireRole roles={['admin']}><TrainersPage /></RequireRole>} />
              <Route path="/entrenador/alumnos" element={<RequireRole roles={['trainer']}><MyStudentsPage /></RequireRole>} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
