import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import LoginPage from './components/auth/LoginPage'
import Dashboard from './components/Dashboard'
import { soundHandler } from './handlers/SoundHandler';
import { LoadingIndicator } from './components/application/loading-indicator/loading-indicator';

// Lazy load views for better performance
const DinoView = lazy(() => import('./components/views/DinoView'));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <LoadingIndicator size="lg" label="Authenticating..." />
    </div>
  );

  if (!user) return <Navigate to="/auth" replace />;

  return children;
}

function AppContent() {
  const { user } = useAuth()

  // Global sound listener
  useEffect(() => {
    const handleGlobalClick = () => {
      soundHandler.resume();
      soundHandler.playClick();
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <LoadingIndicator size="lg" label="Streamlining Neural Data..." />
      </div>
    }>
      <Routes>
        <Route path="/auth" element={!user ? <LoginPage /> : <Navigate to="/dashboard/terminal" replace />} />

        <Route path="/dashboard/*" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        <Route path="/dino" element={<Navigate to="/dashboard/dino" replace />} />

        {/* Redirect directly to dashboard if logged in, else auth */}
        <Route path="/" element={<Navigate to={user ? "/dashboard/terminal" : "/auth"} replace />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

import CursorHandler from './components/ui/overlays/CursorHandler';
import ErrorBoundary from './components/ErrorBoundary';
import PWAInstallPrompt from './components/PWAInstallPrompt';


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

