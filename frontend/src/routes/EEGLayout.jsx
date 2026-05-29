import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ChevronLeft, ChevronRight, Eye, Grid3X3, Music, Wind } from 'lucide-react'
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import '../styles/views/EEGDashboard.css'
import MainSidebar from '../components/eeg_dashbord/sidebar/MainSidebar'
import { SidebarProvider, useSidebar } from '../components/eeg_dashbord/pages/SidebarContext'
import { buildApiUrl } from '../utils/runtimeConnection'
import InlineModeToggle from '../components/ui/inputs/InlineModeToggle'
import LoadingScreen from '../components/ui/display/LoadingScreen'

const MusicView = lazy(() => import('../components/eeg_dashbord/pages/MusicView'))
const MeditationView = lazy(() => import('../components/eeg_dashbord/pages/MeditationView'))
const BubbleGameView = lazy(() => import('../components/eeg_dashbord/pages/BubbleGameView'))
const SSVEPView = lazy(() => import('../components/eeg_dashbord/pages/SSVEPView'))

const OVERVIEW_APPS = [
  { id: 'music', title: 'Music Control', icon: Music, desc: 'Control playback using frontal lobe focus states.' },
  { id: 'meditation', title: 'Meditation Trainer', icon: Wind, desc: 'Guided neurofeedback breathing sessions.' },
  { id: 'bubble', title: 'Bubble Game', icon: Activity, desc: 'Interactive peak wave game.' },
  { id: 'ssvep', title: 'SSVEP Interface', icon: Eye, desc: 'Visual cortex stimulation via flickering targets.' },
]

function OverviewGrid({ onSelect }) {
  return (
    <div className="eeg-overview-container animate-fade-in w-full">
      <h1 className="eeg-overview-title">Applications Dashboard</h1>
      <p className="eeg-overview-subtitle">Select a neuro-application to begin session.</p>
      <div className="eeg-app-grid">
        {OVERVIEW_APPS.map((app) => (
          <div key={app.id} className={`eeg-app-card card-${app.id}`} onClick={() => onSelect(app.id)}>
            <div className="eeg-card-decoration decoration-orb orb-1" />
            <div className="eeg-card-decoration decoration-orb orb-2" />
            <div className="card-shimmer" />
            
            <div className="eeg-app-icon"><app.icon size={36} /></div>
            <h3 className="card-title-premium">{app.title}</h3>
            <p className="card-desc-premium">{app.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function EEGContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sidebarMode, setSidebarMode, sidebarSlot, sidebarMiniSlot } = useSidebar()
  const { lastEvent, streamConnected, activeWsUrl } = useOutletContext()
  const [eegResult, setEegResult] = useState(null)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const currentView = useMemo(() => {
    const path = location.pathname.replace(/\/+$/, '')
    const tail = path.split('/dashboard/eeg')[1] || ''
    if (!tail || tail === '/') return 'overview'
    return tail.replace(/^\//, '')
  }, [location.pathname])
  const normalizedView = currentView === 'views' ? 'overview' : currentView

  useEffect(() => {
    let modePreset = 'frontal_fp1'
    if (normalizedView === 'ssvep') modePreset = 'visual_eeg_oz'

    fetch(buildApiUrl('/api/mode'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: modePreset, view: normalizedView }),
    }).catch((err) => console.error('Failed to update mode:', err))

    setEegResult(null)
    setSidebarMode(normalizedView === 'overview' ? 'main' : 'page')
  }, [normalizedView, setSidebarMode])

  useEffect(() => {
    if (lastEvent) {
      if (lastEvent.event === 'eeg_mode_result') {
        const output = lastEvent.output || {};
        setEegResult({
          ...output,
          band_powers: lastEvent.band_powers,
          eeg_mapped: lastEvent.eeg_mapped,
          features: lastEvent.features,
        });
      } else if (lastEvent.event === 'eeg_prediction' || lastEvent.output?.event === 'eeg_prediction' || lastEvent.features || lastEvent.band_powers) {
        setEegResult(prev => {
          if (!prev) return lastEvent.output || lastEvent;
          const data = lastEvent.output || lastEvent;
          return {
            ...prev,
            features: data.features || prev.features,
            band_powers: data.band_powers || prev.band_powers,
            predicted_frequency: data.predicted_frequency !== undefined ? data.predicted_frequency : prev.predicted_frequency,
            peak_frequency: data.peak_frequency !== undefined ? data.peak_frequency : prev.peak_frequency
          };
        });
      }
    }
  }, [lastEvent])

  const handleSelectView = useCallback((view) => {
    navigate(view === 'overview' ? '/dashboard/eeg' : `/dashboard/eeg/${view}`)
  }, [navigate])

  const handleBackToMenu = useCallback(() => navigate('/dashboard/eeg'), [navigate])
  const canShowPageControls = normalizedView !== 'overview' && !!sidebarSlot
  const effectiveSidebarMode = canShowPageControls ? sidebarMode : 'main'
  const showingPageSidebar = effectiveSidebarMode === 'page'
  const sidebarMeta = useMemo(() => {
    const map = {
      overview: { title: 'Navigator', subtitle: 'Choose an EEG application' },
      music: { title: 'Music Controls', subtitle: 'Neural audio response' },
      meditation: { title: 'Meditation Controls', subtitle: 'Guided neurofeedback session' },
      bubble: { title: 'Bubble Controls', subtitle: 'Interactive focus training' },
      ssvep: { title: 'SSVEP Controls', subtitle: 'Visual stimulation interface' },
    }
    return map[normalizedView] || map.overview
  }, [normalizedView])
  const compactNavItems = useMemo(() => ([
    { id: 'overview', title: 'Overview', icon: Grid3X3 },
    ...OVERVIEW_APPS.map(({ id, title, icon }) => ({ id, title, icon })),
  ]), [])

  if (location.pathname === '/dashboard/eeg/views') {
    return <Navigate to="/dashboard/eeg" replace />
  }

  let content = <OverviewGrid onSelect={handleSelectView} />
  if (normalizedView === 'music') {
    content = <MusicView result={eegResult} onNavigate={handleSelectView} onBackToMenu={handleBackToMenu} />
  } else if (normalizedView === 'meditation') {
    content = <MeditationView result={eegResult} wsEvent={lastEvent} wsUrl={streamConnected ? activeWsUrl : null} currentView={normalizedView} onNavigate={handleSelectView} onBackToMenu={handleBackToMenu} />
  } else if (normalizedView === 'bubble') {
    content = <BubbleGameView result={eegResult} isConnected={streamConnected} onBackToMenu={handleBackToMenu} />
  } else if (normalizedView === 'ssvep') {
    content = <SSVEPView isConnected={streamConnected} wsEvent={lastEvent} onBackToMenu={handleBackToMenu} onNavigate={handleSelectView} />
  } else if (normalizedView !== 'overview') {
    return <Navigate to="/dashboard/eeg" replace />
  }

  return (
    <div className="flex h-full w-full overflow-hidden rounded-[24px] border border-[var(--border)]/60 bg-[var(--bg)]">
      <div className={`relative shrink-0 transition-[width] duration-300 ${sidebarCollapsed ? 'w-[4.75rem]' : 'w-[22rem]'}`}>
        <div className="h-full border-r border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-sm">
          <div className="flex h-full flex-col">
            <div className={`relative border-b border-[var(--border)]/70 ${sidebarCollapsed ? 'px-2 py-3' : 'px-4 py-4'}`}>
              {canShowPageControls ? (
                <div className={`absolute transition-all shrink-0 ${sidebarCollapsed ? 'top-2 left-1/2 -translate-x-1/2 scale-[0.72]' : 'top-3 right-3 scale-[0.88]'}`}>
                  <InlineModeToggle
                    value={showingPageSidebar ? 'page' : 'main'}
                    onChange={setSidebarMode}
                    options={[
                      { id: 'main', label: sidebarCollapsed ? '' : 'NAV' },
                      { id: 'page', label: sidebarCollapsed ? '' : 'CTRL' },
                    ]}
                  />
                </div>
              ) : null}
              {sidebarCollapsed ? (
                <div className="flex justify-center pt-7 pb-1">
                  <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--primary)] [writing-mode:vertical-rl] rotate-180">
                    EEG
                  </span>
                </div>
              ) : (
                <div className="min-w-0 pr-14">
                  <h2 className="truncate text-[14px] font-black uppercase tracking-[4px] text-[var(--primary)]">
                    {sidebarMeta.title}
                  </h2>
                  <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[2px] text-[var(--muted)]/75">
                    {sidebarMeta.subtitle}
                  </p>
                </div>
              )}
            </div>
            {sidebarCollapsed ? (
              <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 py-3 [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
                {showingPageSidebar && sidebarMiniSlot ? sidebarMiniSlot : compactNavItems.map((item) => {
                  const Icon = item.icon
                  const active = normalizedView === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelectView(item.id)}
                      title={item.title}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all ${
                        active
                          ? 'border-[var(--primary)]/40 bg-[var(--primary)]/12 text-[var(--primary)] shadow-sm'
                          : 'border-transparent bg-transparent text-[var(--text)] hover:border-[var(--border)] hover:bg-[var(--bg)]'
                      }`}
                    >
                      <Icon size={18} />
                    </button>
                  )
                })}
                {(!showingPageSidebar || !sidebarMiniSlot) ? (
                  <>
                    <div className="mt-auto mb-2 h-px w-8 bg-[var(--border)]/50" />
                    <div className="flex items-center justify-center opacity-60">
                      <div className="h-2 w-2 rounded-full bg-[var(--primary)] animate-pulse" />
                    </div>
                  </>
                ) : null}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
                {showingPageSidebar ? sidebarSlot : <MainSidebar currentView={normalizedView} onSelect={handleSelectView} />}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          className="absolute -right-5 top-1/2 z-[999] flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-[var(--primary)]/35 bg-[var(--surface)] text-[var(--primary)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/10"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <div className="relative flex-grow overflow-hidden">
        <Suspense fallback={<LoadingScreen label="Loading EEG view..." />}>
          {content}
        </Suspense>
      </div>
    </div>
  )
}

export default function EEGLayout() {
  return (
    <SidebarProvider>
      <EEGContent />
    </SidebarProvider>
  )
}
