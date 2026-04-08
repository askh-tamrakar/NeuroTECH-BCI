import React, { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import { soundHandler } from './handlers/SoundHandler'
import CursorHandler from './components/ui/overlays/CursorHandler'
import ErrorBoundary from './components/ErrorBoundary'
import PWAInstallPrompt from './components/PWAInstallPrompt'

const DashboardLayout = lazy(() => import('./components/DashboardLayout.jsx'))
const TerminalRoute = lazy(() => import('./routes/TerminalRoute.jsx'))
const DinoRoute = lazy(() => import('./routes/DinoRoute.jsx'))
const RpsRoute = lazy(() => import('./routes/RpsRoute.jsx'))
const ServoClawRoute = lazy(() => import('./routes/ServoClawRoute.jsx'))
const EEGLayout = lazy(() => import('./routes/EEGLayout.jsx'))
const LabLayout = lazy(() => import('./routes/LabLayout.jsx'))
const SettingsRoute = lazy(() => import('./routes/SettingsRoute.jsx'))

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-2xl">Loading...</div>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  useEffect(() => {
    const handleGlobalClick = () => {
      soundHandler.resume()
      soundHandler.playClick()
    }

    window.addEventListener('click', handleGlobalClick)
    return () => window.removeEventListener('click', handleGlobalClick)
  }, [])

  if (loading) {
    return <RouteFallback />
  }

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to={user ? '/dashboard/terminal' : '/login'} replace />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard/terminal" replace /> : <LoginPage />} />

        {user && (
          <Route path="/dashboard/*" element={<DashboardLayout />}>
            <Route index element={<Navigate to="terminal" replace />} />
            <Route path="terminal" element={<TerminalRoute />} />
            <Route path="live" element={<Navigate to="/dashboard/terminal" replace />} />
            <Route path="dino" element={<DinoRoute />} />
            <Route path="rps" element={<RpsRoute />} />
            <Route path="servo_claw" element={<ServoClawRoute />} />
            <Route path="eeg/*" element={<EEGLayout />} />
            <Route path="eeg_dashboard" element={<Navigate to="/dashboard/eeg" replace />} />
            <Route path="lab" element={<Navigate to="/dashboard/lab/data_collection" replace />} />
            <Route path="lab/*" element={<LabLayout />} />
            <Route path="settings" element={<Navigate to="/dashboard/settings/auth" replace />} />
            <Route path="settings/*" element={<SettingsRoute />} />

            <Route path="settings/style" element={<Navigate to="/dashboard/settings/styles" replace />} />
            <Route path="settings/stlyes" element={<Navigate to="/dashboard/settings/styles" replace />} />
            <Route path="settings/sountrack" element={<Navigate to="/dashboard/settings/soundtrack" replace />} />
            <Route path="settings/soundtrac" element={<Navigate to="/dashboard/settings/soundtrack" replace />} />
            <Route path="settings/keys" element={<Navigate to="/dashboard/settings/controls" replace />} />
            <Route path="settings/account" element={<Navigate to="/dashboard/settings/auth" replace />} />
            <Route path="*" element={<Navigate to="/dashboard/terminal" replace />} />
          </Route>
        )}

        <Route path="*" element={<Navigate to={user ? '/dashboard/terminal' : '/login'} replace />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <>
      <CursorHandler />
      <PWAInstallPrompt />
      <ErrorBoundary>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ErrorBoundary>
    </>
  )
}
