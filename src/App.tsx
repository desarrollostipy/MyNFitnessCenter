import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { GYM_ID, isSupabaseConfigured } from '@/lib/supabase'
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider'
import { RequireAuth, RequireRole, RequireSuperadmin } from '@/app/guards'
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
import { MyTrainingPage } from '@/features/portal/TrainingPages'
import { CheckInPage } from '@/features/reception/CheckInPage'
import { QuickSalePage } from '@/features/reception/QuickSalePage'
import { TurnstilePreviewPage } from '@/features/turnstile/TurnstilePreviewPage'
import { FeatureControlPage } from '@/features/platform/FeatureControlPage'
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
              <Route path="/admin/usuarios" element={<RequireRole roles={['admin']} feature="users"><UsersPage /></RequireRole>} />
              <Route path="/admin/auditoria" element={<RequireRole roles={['admin', 'accountant']} feature="audit"><AuditPage /></RequireRole>} />
              <Route path="/admin/configuracion" element={<RequireRole roles={['admin']} feature="settings"><GymSettingsPage /></RequireRole>} />
              <Route path="/admin/planes" element={<RequireRole roles={['admin']} feature="catalog"><PlansPage /></RequireRole>} />
              <Route path="/admin/servicios" element={<RequireRole roles={['admin']} feature="catalog"><ServicesPage /></RequireRole>} />
              <Route path="/admin/medios-de-pago" element={<RequireRole roles={['admin']} feature="catalog"><PaymentMethodsPage /></RequireRole>} />
              <Route path="/admin/prospectos" element={<RequireRole roles={['admin', 'treasurer']} feature="leads"><LeadsPage /></RequireRole>} />
              <Route path="/admin/alumnos" element={<RequireRole roles={['admin', 'accountant', 'treasurer']} feature="students"><StudentsPage /></RequireRole>} />
              <Route path="/admin/alumnos/:id" element={<RequireRole roles={['admin', 'accountant', 'treasurer']} feature="students"><StudentDetailPage /></RequireRole>} />
              <Route path="/caja" element={<RequireRole roles={FRONT_DESK_ROLES} feature="cash"><CashPage /></RequireRole>} />
              <Route path="/caja/cobrar" element={<RequireRole roles={FRONT_DESK_ROLES} feature="collect"><CollectPage /></RequireRole>} />
              <Route path="/caja/venta-rapida" element={<RequireRole roles={FRONT_DESK_ROLES} feature="quick_sale"><QuickSalePage /></RequireRole>} />
              <Route path="/admin/molinete" element={<RequireRole roles={['admin']} feature="turnstile"><TurnstilePreviewPage /></RequireRole>} />
              <Route path="/ingreso" element={<RequireRole roles={FRONT_DESK_ROLES} feature="checkin"><CheckInPage /></RequireRole>} />
              <Route path="/recibo/:id" element={<RequireRole roles={['admin', 'accountant', 'treasurer', 'cashier', 'student']}><ReceiptPage /></RequireRole>} />
              <Route path="/mi" element={<RequireRole roles={['student']}><MyHomePage /></RequireRole>} />
              <Route path="/mi/entrenamientos" element={<RequireRole roles={['student']} feature="portal_training"><MyTrainingPage /></RequireRole>} />
              <Route path="/mi/membresia" element={<RequireRole roles={['student']} feature="portal_membership"><MyMembershipPage /></RequireRole>} />
              <Route path="/mi/pagos" element={<RequireRole roles={['student']} feature="portal_receipts"><MyPaymentsPage /></RequireRole>} />
              <Route path="/admin/cobros" element={<RequireRole roles={['admin', 'accountant', 'treasurer']} feature="payments"><PaymentsPage /></RequireRole>} />
              <Route path="/admin/egresos" element={<RequireRole roles={['admin', 'accountant', 'treasurer']} feature="expenses"><ExpensesPage /></RequireRole>} />
              <Route path="/admin/dashboard" element={<RequireRole roles={['admin', 'accountant']} feature="dashboard"><DashboardPage /></RequireRole>} />
              <Route path="/admin/cuotas" element={<RequireRole roles={['admin', 'accountant', 'treasurer']} feature="memberships"><ChargesPage /></RequireRole>} />
              <Route path="/admin/entrenadores" element={<RequireRole roles={['admin']} feature="trainers"><TrainersPage /></RequireRole>} />
              <Route path="/entrenador/alumnos" element={<RequireRole roles={['trainer']} feature="trainer_students"><MyStudentsPage /></RequireRole>} />
              <Route path="/plataforma/funciones" element={<RequireSuperadmin><FeatureControlPage /></RequireSuperadmin>} />
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
          <Toaster position="top-right" richColors closeButton />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
