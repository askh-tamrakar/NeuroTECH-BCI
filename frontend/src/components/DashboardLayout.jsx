import React, { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTheme } from '../contexts/ThemeContext'
import { useSettings } from '../contexts/SettingsContext'
import '../styles/App.css'
import ScrollStack, { ScrollStackItem } from './ui/navigation/ScrollStack'
import PillNav from './ui/navigation/PillNav'
import Pill from './ui/navigation/Pill'
import { ConnectionButton } from './ui/display/ConnectionButton'
import Brain3D from './ui/display/Brain3D'
import MobileNav from './ui/navigation/MobileNav'
import { deriveApiUrlFromWs, getRuntimeConnection } from '../utils/runtimeConnection'

function getTopLevelPage(pathname) {
  if (pathname.startsWith('/dashboard/dino')) return 'dino'
  if (pathname.startsWith('/dashboard/eeg')) return 'eeg'
  if (pathname.startsWith('/dashboard/rps')) return 'rps'
  if (pathname.startsWith('/dashboard/lab')) return 'lab'
  if (pathname.startsWith('/dashboard/servo_claw')) return 'servo_claw'
  if (pathname.startsWith('/dashboard/settings')) return 'settings'
  return 'terminal'
}

const LEGACY_HASH_REDIRECTS = {
  '#live': '/dashboard/terminal',
  '#dino': '/dashboard/dino',
  '#eeg_dashboard': '/dashboard/eeg',
  '#rps': '/dashboard/rps',
  '#lab': '/dashboard/lab/data_collection',
  '#servo_claw': '/dashboard/servo_claw',
  '#settings': '/dashboard/settings/auth',
}

export default function DashboardLayout() {
  const { user } = useAuth()
  const { themes, currentTheme, currentThemeId, setTheme } = useTheme()
  const { settings, updateDeepSettings } = useSettings()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileMainView, setMobileMainView] = useState('graphs')
  const [isMobile, setIsMobile] = useState(false)
  const [localWs, setLocalWs] = useState(() => getRuntimeConnection().wsUrl || '')
  const [ngrokWs, setNgrokWs] = useState('wss://squelchingly-thriftier-cecile.ngrok-free.dev')

  const wsUrl = settings.general.wsUrl || ''
  const { status, connectionStatus, lastMessage, lastConfig, lastEvent, latency, connect, disconnect, sendMessage, currentUrl } = useWebSocket(wsUrl)
  const resolvedConnection = getRuntimeConnection()
  const activeWsUrl = currentUrl || resolvedConnection.wsUrl || wsUrl || ''
  const apiUrl = connectionStatus?.resolved_api_url || resolvedConnection.apiUrl || settings.general.apiUrl || ''
  const streamConnected = status === 'streaming' || status === 'connected' || status === 'stream_offline'
  const currentPage = getTopLevelPage(location.pathname)

  const navColors = useMemo(() => ({
    base: currentTheme.navPill,
    pill: currentTheme.navBase,
    pillText: currentTheme.navPill,
    hoverText: currentTheme.navBase,
  }), [currentTheme])

  const [pillSize, setPillSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!themes.length) return
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    context.font = '16px Inter, sans-serif'

    let maxWidth = 0
    themes.forEach((theme) => {
      maxWidth = Math.max(maxWidth, context.measureText(theme.name).width)
    })

    setPillSize({ width: Math.ceil(maxWidth + 60), height: 40 })
  }, [themes])

  useEffect(() => {
    connect()

    const lgQuery = window.matchMedia('(min-width: 1024px)')
    setIsMobile(!lgQuery.matches)
    const handler = (e) => setIsMobile(!e.matches)
    lgQuery.addEventListener('change', handler)

    const target = LEGACY_HASH_REDIRECTS[window.location.hash]
    if (target && location.pathname !== target) {
      navigate(target, { replace: true })
    }

    return () => {
      lgQuery.removeEventListener('change', handler)
    }
  }, [])

  useEffect(() => {
    if (!localWs) {
      setLocalWs(activeWsUrl)
    }
  }, [activeWsUrl, localWs])

  const navItems = useMemo(() => [
    { label: 'TERMINAL', href: '/dashboard/terminal' },
    { label: 'Dino', href: '/dashboard/dino' },
    { label: 'EEG Suite', href: '/dashboard/eeg' },
    { label: 'RPS', href: '/dashboard/rps' },
    { label: 'Lab', href: '/dashboard/lab/data_collection' },
    { label: 'Servo Claw', href: '/dashboard/servo_claw' },
    { label: 'Settings', href: '/dashboard/settings/auth' },
    ...(isMobile ? [] : [{
      label: 'Theme',
      type: 'pill',
      key: 'theme-dropdown',
      href: '#',
      menu: ({ close }) => (
        <ScrollStack style={{ '--scroll-stack-width': `${pillSize.width + 78}px` }}>
          {themes.map((theme) => (
            <ScrollStackItem key={theme.id}>
              <Pill
                label={theme.name}
                activeHref={location.pathname}
                pillHeight={42}
                pillWidth={pillSize.width}
                active={currentThemeId === theme.id}
                onClick={() => {
                  setTheme(theme.id)
                  close?.()
                }}
                baseColor={theme.navBase}
                pillColor={theme.navPill}
                hoveredTextColor={theme.navPill}
                pillTextColor={theme.navBase}
              />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      ),
    }]),
  ], [themes, currentThemeId, pillSize.width, location.pathname, isMobile, setTheme])

  const shellContext = {
    status,
    connectionStatus,
    lastMessage,
    lastConfig,
    lastEvent,
    latency,
    connect,
    disconnect,
    sendMessage,
    currentUrl,
    activeWsUrl,
    apiUrl,
    streamConnected,
    localWs,
    setLocalWs,
    ngrokWs,
    setNgrokWs,
    updateConnection: (nextWsUrl) => {
      const nextApiUrl = deriveApiUrlFromWs(nextWsUrl) || apiUrl
      updateDeepSettings('general.apiUrl', nextApiUrl)
      updateDeepSettings('general.wsUrl', nextWsUrl)
      connect(nextWsUrl)
    },
    mobileMainView,
    setMobileMainView,
  }

  const fullScreenPages = new Set(['terminal', 'dino'])
  const showSpacers = !fullScreenPages.has(currentPage)

  return (
    <div className="app-root flex flex-col h-screen overflow-hidden">
      <div className="header shrink-0" style={{ zIndex: 50 }}>
        <div className="header-inner">
          <div className="cursor-pointer m-0 p-0 flex-shrink-0 relative z-20 hidden lg:block" onClick={() => navigate('/dashboard/terminal')} title="Back to Terminal">
            <div className="pointer-events-none">
              <Brain3D />
            </div>
          </div>

          <div className="headline flex flex-col flex-grow cursor-pointer select-none" onClick={() => navigate('/dashboard/terminal')} title="Back to Terminal">
            <div className="headline-line main">
              NeuroTECH
              <br />
              <div className="headline-line sub"> BCI Dashboard </div>
            </div>
          </div>

          <nav className="nav absolute left-1/2 -translate-x-1/2 shrink-0 z-10 hidden landscape:block lg:block">
            <div className="backdrop-blur-sm bg-surface/50 border border-white/5 rounded-full p-1">
              <PillNav
                items={navItems}
                activeHref={location.pathname}
                onLogoClick={() => navigate('/dashboard/settings/link')}
                className="custom-nav"
                ease="power2.easeOut"
                baseColor={navColors.base}
                pillColor={navColors.pill}
                hoveredPillTextColor={navColors.hoverText}
                pillTextColor={navColors.pillText}
              />
            </div>
          </nav>

          <div className="w-[180px] flex justify-end shrink-0 lg:flex">
            <ConnectionButton
              status={status}
              latency={latency}
              connect={connect}
              disconnect={disconnect}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-row flex-1 overflow-hidden relative">
        <MobileNav
          currentPage={currentPage}
          mobileMainView={mobileMainView}
          setMobileMainView={setMobileMainView}
        />

        <div className="scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-primary/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] flex-1 flex flex-col" style={{ padding: '0px 0px', overflowY: 'hidden' }}>
          {showSpacers && <div className="h-[85px] shrink-0" />}
          <div className="flex-1 min-h-0 flex flex-col w-full">
            <Outlet context={shellContext} />
          </div>
          {showSpacers && <div className="h-[32px] shrink-0" />}
        </div>
      </div>

      <div className="footer shrink-0">
        <span className="flex items-center gap-1">NeuroTECH - A BCI Project </span>  •  {' '}
        <span className="muted flex items-center gap-1">
          {user?.username || 'Operator'}
        </span>
        {' '} • {' '}
        <a
          className="muted flex items-center gap-1"
          href="https://github.com/askh-tamrakar/NeuroTECH-BCI"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  )
}
