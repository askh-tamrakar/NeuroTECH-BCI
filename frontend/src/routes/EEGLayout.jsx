import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, ChevronLeft, ChevronRight, Eye, Grid3X3, Music, Wind, Brain, Zap, Headphones, Focus, Gamepad2, Sparkles, Orbit, RadioTower, Disc } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import '../styles/views/EEGDashboard.css'
import MainSidebar from '../components/eeg_dashbord/sidebar/MainSidebar'
import { SidebarProvider, useSidebar } from '../components/eeg_dashbord/pages/SidebarContext'
import { buildApiUrl } from '../utils/runtimeConnection'
import InlineModeToggle from '../components/ui/inputs/InlineModeToggle'

const MusicView = lazy(() => import('../components/eeg_dashbord/pages/MusicView'))
const MeditationView = lazy(() => import('../components/eeg_dashbord/pages/MeditationView'))
const BubbleGameView = lazy(() => import('../components/eeg_dashbord/pages/BubbleGameView'))
const SSVEPView = lazy(() => import('../components/eeg_dashbord/pages/SSVEPView'))

// Composite Icon Components
const MusicIcon = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <Headphones className="absolute text-white/90 z-20" size={42} strokeWidth={1.5} />
    <Disc className="absolute text-indigo-400/40 z-10 animate-spin-slow duration-[8000ms]" size={64} strokeWidth={1} />
    <RadioTower className="absolute text-purple-300/30 -right-2 -top-2 animate-pulse" size={24} />
  </div>
);

const MeditationIcon = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <Wind className="absolute text-white/90 z-20" size={42} strokeWidth={1.5} />
    <Orbit className="absolute text-emerald-400/40 z-10 animate-spin-slow duration-[12000ms]" size={68} strokeWidth={1} />
    <Sparkles className="absolute text-blue-300/50 -left-1 -top-1 animate-pulse" size={20} />
  </div>
);

const BubbleIcon = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <Gamepad2 className="absolute text-white/90 z-20" size={38} strokeWidth={1.5} />
    <Activity className="absolute text-cyan-400/40 z-10" size={60} strokeWidth={1} />
  </div>
);

const SSVEPIcon = () => (
  <div className="relative w-full h-full flex items-center justify-center">
    <Eye className="absolute text-white/90 z-20" size={38} strokeWidth={1.5} />
    <Zap className="absolute text-orange-400/50 z-10 animate-pulse" size={56} strokeWidth={1} />
  </div>
);

const OVERVIEW_APPS = [
  { id: 'music', title: 'Music Control', icon: <MusicIcon />, fallbackIcon: Music, desc: 'Control playback using frontal lobe focus states.', spanClass: 'col-span-2 row-span-2 bento-hero' },
  { id: 'meditation', title: 'Meditation Trainer', icon: <MeditationIcon />, fallbackIcon: Wind, desc: 'Guided neurofeedback breathing sessions.', spanClass: 'col-span-2 row-span-1 bento-wide' },
  { id: 'bubble', title: 'Bubble Game', icon: <BubbleIcon />, fallbackIcon: Activity, desc: 'Interactive peak wave game.', spanClass: 'col-span-1 row-span-1 bento-square' },
  { id: 'ssvep', title: 'SSVEP Interface', icon: <SSVEPIcon />, fallbackIcon: Eye, desc: 'Visual cortex stimulation via flickering targets.', spanClass: 'col-span-1 row-span-1 bento-square' },
]

function OverviewGrid({ onSelect }) {
  const [hoveredId, setHoveredId] = useState(null)

  return (
    <div className="eeg-overview-container animate-fade-in w-full h-full flex flex-col justify-center items-center">
      {/* Background System */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden eeg-ambient-bg">
          <div className="ambient-sphere sphere-blue"></div>
          <div className="ambient-sphere sphere-purple"></div>
          <div className="ambient-grid-lines"></div>
          <div className="scanner-sweep"></div>
          
          {/* Framer Motion Particles */}
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-cyan-400/30 rounded-full blur-[1px]"
              initial={{ 
                x: Math.random() * 100 + "%", 
                y: Math.random() * 100 + "%",
                opacity: 0 
              }}
              animate={{ 
                y: [null, Math.random() * 100 + "%"],
                opacity: [0, 0.5, 0]
              }}
              transition={{ 
                duration: Math.random() * 10 + 20, 
                repeat: Infinity,
                ease: "linear"
              }}
            />
          ))}
      </div>

      <div className="w-full max-w-[1200px] mb-8 relative z-10 text-center">
          <h1 className="eeg-overview-title mx-auto text-center justify-center flex items-center gap-4">
              <Brain size={48} className="text-[var(--primary)]" />
              Neural Hub
          </h1>
          <p className="eeg-overview-subtitle text-center mx-auto mt-2">Select a neuro-application to begin session.</p>
      </div>

      <div className="eeg-bento-grid w-full max-w-[1200px] mx-auto z-10">
        {OVERVIEW_APPS.map((app) => (
          <div
            key={app.id} 
            className={`eeg-bento-card group card-${app.id} ${app.spanClass}`} 
            onClick={() => onSelect(app.id)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const y = e.clientY - rect.top
              e.currentTarget.style.setProperty('--mouse-x', `${x}px`)
              e.currentTarget.style.setProperty('--mouse-y', `${y}px`)
            }}
          >
            {/* Tech Readouts */}
            <div className="tech-readout readout-tl">
               MOD_ID: <span className="text-white/40">{app.id.toUpperCase()}</span>
               <div className="bitstream-anim text-[6px] opacity-30 mt-1">01101001 10101111</div>
            </div>
            <div className="tech-readout readout-br">
               SYS_ACT: <span className="text-cyan-400">ONLINE</span>
               <div className="text-[6px] opacity-30 mt-1">0x{Math.floor(Math.random()*0xFFFF).toString(16).toUpperCase()}</div>
            </div>

            {/* Holographic Decoration Layer */}
            <div className="eeg-card-decoration">
              <div className="decoration-orb orb-1"></div>
              <div className="decoration-orb orb-2"></div>
            </div>

            {/* Shimmer line */}
            <div className="card-shimmer"></div>

            <div className={`bento-icon-wrapper ${app.spanClass.includes('hero') ? 'hero-icon' : ''}`}>
              {app.icon}
            </div>
            
            <div className={`relative z-10 w-full bento-content ${app.spanClass.includes('hero') ? 'hero-content' : ''}`}>
              <h3 className="card-title-premium">{app.title}</h3>
              <p className="card-desc-premium">{app.desc}</p>
            </div>

            {/* Glowing Action Button */}
            <div className="absolute bottom-6 right-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-8 group-hover:translate-x-0">
              <div className="w-12 h-12 rounded-full border border-white/30 bg-white/10 flex items-center justify-center backdrop-blur-2xl shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                <span className="text-white text-2xl font-light">→</span>
              </div>
            </div>
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
        setEegResult(lastEvent.output || lastEvent)
      } else if (lastEvent.event === 'eeg_prediction' || lastEvent.output?.event === 'eeg_prediction') {
        setEegResult(lastEvent.output || lastEvent)
      } else if (lastEvent.features || lastEvent.band_powers) {
        setEegResult(lastEvent)
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
    ...OVERVIEW_APPS.map(({ id, title, fallbackIcon }) => ({ id, title, icon: fallbackIcon })),
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
    content = <BubbleGameView result={eegResult} isConnected={streamConnected} />
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
          className="absolute -right-5 top-1/2 z-20 flex h-16 w-6 -translate-y-1/2 items-center justify-center rounded-r-xl border border-l-0 border-[var(--primary)]/35 bg-[var(--surface)] text-[var(--primary)] shadow-[0_10px_30px_rgba(0,0,0,0.35)] transition-all hover:border-[var(--primary)]/60 hover:bg-[var(--primary)]/10"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <div className="relative flex-grow overflow-hidden">
        <Suspense fallback={<div className="flex h-full items-center justify-center text-muted">Loading EEG view...</div>}>
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
