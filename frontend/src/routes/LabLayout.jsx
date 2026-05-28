import React, { Suspense, lazy, useMemo } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import LoadingScreen from '../components/ui/display/LoadingScreen'

const DataCollectionView = lazy(() => import('../components/lab/DataCollectionView'))
const MLTrainingView = lazy(() => import('../components/lab/MLTrainingView'))

function SectionFallback() {
  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <LoadingScreen label="Loading lab..." />
    </div>
  )
}

export default function LabLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { lastMessage, lastEvent, lastConfig, activeWsUrl, streamConnected } = useOutletContext()

  const currentSection = useMemo(() => {
    const normalizedPath = location.pathname.replace(/\/+$/, '')
    if (normalizedPath.endsWith('/ml_training')) return 'ml_training'
    return 'data_collection'
  }, [location.pathname])

  if (location.pathname === '/dashboard/lab' || location.pathname === '/dashboard/lab/') {
    return <Navigate to="/dashboard/lab/data_collection" replace />
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <Suspense fallback={<SectionFallback />}>
        {currentSection === 'ml_training' ? (
          <MLTrainingView
            onSwitchLab={() => navigate('/dashboard/lab/data_collection')}
          />
        ) : (
          <DataCollectionView
            wsData={lastMessage}
            wsEvent={lastEvent}
            config={lastConfig}
            wsUrl={streamConnected ? activeWsUrl : null}
            onSwitchLab={() => navigate('/dashboard/lab/ml_training')}
          />
        )}
      </Suspense>
    </div>
  )
}
