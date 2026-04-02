import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTheme } from '../contexts/ThemeContext'
import { useSettings } from '../contexts/SettingsContext'

// Lazy load views for better performance
const LiveDashboard = lazy(() => import('./views/LiveDashboard'))
const DinoView = lazy(() => import('./views/DinoView'))
const EEGDashboard = lazy(() => import('./views/EEGDashboard'))
const RPSGame = lazy(() => import('./views/RPSGame'))
const LabView = lazy(() => import('./views/LabView'))
const SettingsView = lazy(() => import('./views/SettingsView'))
const ServoClawView = lazy(() => import('./views/ServoClawView'))

import '../styles/App.css';
import ScrollStack, { ScrollStackItem } from './ui/navigation/ScrollStack';
import PillNav from './ui/navigation/PillNav';
import Pill from './ui/navigation/Pill';
import { ConnectionButton } from './ui/display/ConnectionButton';
import Brain3D from './ui/display/Brain3D';
import MobileNav from './ui/navigation/MobileNav';
import { LoadingIndicator } from './application/loading-indicator/LoadingIndicator';
import { deriveApiUrlFromWs, getRuntimeConnection } from '../utils/runtimeConnection';

export default function Dashboard() {
  const location = useLocation()
  const navigate = useNavigate()

  // Determine current page from URL
  const currentPage = useMemo(() => {
    const path = location.pathname;
    if (path.includes('/terminal')) return 'live';
    if (path.includes('/dino')) return 'dino';
    if (path.includes('/eeg')) return 'eeg_dashboard';
    if (path.includes('/rps')) return 'rps';
    if (path.includes('/lab')) return 'lab';
    if (path.includes('/servo_claw')) return 'servo_claw';
    if (path.includes('/settings')) return 'settings';
    if (path.includes('/bubble_game')) return 'bubble_game';
    return 'live';
  }, [location.pathname]);


  const [mobileMainView, setMobileMainView] = useState('graphs')
  const [isMobile, setIsMobile] = useState(false);
  const { themes, currentTheme, currentThemeId, setTheme } = useTheme();
  const { settings, updateDeepSettings } = useSettings();

  // Unified WebSocket state from Context
  const runtimeConnection = getRuntimeConnection();
  const wsUrl = settings.general.wsUrl || runtimeConnection.wsUrl;
  const apiUrl = settings.general.apiUrl || deriveApiUrlFromWs(wsUrl) || runtimeConnection.apiUrl;

  const [localWs, setLocalWs] = useState(wsUrl)
  const [ngrokWs, setNgrokWs] = useState('wss://squelchingly-thriftier-cecile.ngrok-free.dev')

  const { status, lastMessage, lastConfig, lastEvent, latency, connect, disconnect, sendMessage, currentUrl, serverStatus } = useWebSocket(wsUrl)
  const liveWsUrl = status === 'disconnected' || status === 'connecting' ? null : (currentUrl || wsUrl);
  const isStreaming = status === 'streaming';

  // Derived nav colors from current theme
  const navColors = useMemo(() => ({
    base: currentTheme.navPill,
    pill: currentTheme.navBase,
    pillText: currentTheme.navPill,
    hoverText: currentTheme.navBase
  }), [currentTheme]);

  // Pill size calculation
  const [pillSize, setPillSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!themes.length) return;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = '16px Inter, sans-serif';

    let maxWidth = 0;
    themes.forEach(p => {
      const metrics = context.measureText(p.name);
      const w = metrics.width;
      if (w > maxWidth) maxWidth = w;
    });

    const paddedWidth = Math.ceil(maxWidth + 60);
    setPillSize({ width: paddedWidth, height: 40 });
  }, [themes]);

  useEffect(() => {
    connect(wsUrl)

    // Mobile detection
    const lgQuery = window.matchMedia('(min-width: 1024px)');
    setIsMobile(!lgQuery.matches);
    const handler = (e) => setIsMobile(!e.matches);
    lgQuery.addEventListener('change', handler);

    return () => {
      lgQuery.removeEventListener('change', handler);
    }
  }, [wsUrl])

  useEffect(() => {
    setLocalWs(wsUrl)
  }, [wsUrl])

  const navItems = useMemo(() => [
    { label: 'TERMINAL', href: '/dashboard/terminal' },
    { label: 'Dino', href: '/dashboard/dino' },
    { label: 'EEG Suite', href: '/dashboard/eeg' },
    { label: 'RPS', href: '/dashboard/rps' },
    { label: 'Lab', href: '/dashboard/lab/data_collection' },
    { label: 'Servo Claw', href: '/dashboard/servo_claw' },
    { label: 'Settings', href: '/dashboard/settings/account' },
    ...(isMobile ? [] : [{
      label: 'Theme',
      type: 'pill',
      key: 'theme-dropdown',
      href: '#',
      menu: ({ close }) => (
        <ScrollStack style={{ '--scroll-stack-width': `${pillSize.width + 78}px` }}>
          {themes.filter(t => t.visible !== false).map((t) => (
            <ScrollStackItem key={t.id}>
              <Pill
                label={t.name}
                activeHref={location.pathname}
                pillHeight={42}
                pillWidth={pillSize.width}
                active={currentThemeId === t.id}
                onClick={() => {
                  setTheme(t.id);
                  close?.();
                }}
                baseColor={t.navBase}
                pillColor={t.navPill}
                hoveredTextColor={t.navPill}
                pillTextColor={t.navBase}
              />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      )
    }])
  ], [themes, currentThemeId, pillSize.width, location.pathname, isMobile]);

  // Handle determining if spacers are needed
  const showSpacers = useMemo(() => {
    const FULL_SCREEN_PAGES = ['/dashboard/terminal', '/dashboard/dino', '/dashboard/eeg/meditation', '/dashboard/bubble_game'];
    // Check if current path starts with any of these or is exactly these
    return !FULL_SCREEN_PAGES.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
  }, [location.pathname]);

  return (
    <div className="app-root flex flex-col h-screen overflow-hidden">
      {/* Navigation */}
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
          <div className="w-[220px] flex justify-end shrink-0 lg:flex">
            <ConnectionButton
              status={status}
              latency={latency}
              connect={connect}
              disconnect={disconnect}
            />
          </div>
        </div>
      </div>

      {/* Main Container for MobileNav + Content Area */}
      <div className="flex flex-row flex-1 overflow-hidden relative">
        <MobileNav
          currentPage={currentPage}
          setCurrentPage={(id) => {
            const item = navItems.find(i => i.label.toLowerCase().includes(id.toLowerCase()));
            if (item) navigate(item.href);
            else if (id === 'live') navigate('/dashboard/terminal');
            else if (id === 'eeg_dashboard') navigate('/dashboard/eeg');
          }}
          mobileMainView={mobileMainView}
          setMobileMainView={setMobileMainView}
        />
        <div className="scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-primary/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] flex-1 flex flex-col" style={{ padding: '0px 0px', overflowY: 'hidden' }}>

          {showSpacers && <div className="h-[85px] shrink-0" />}

          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center bg-bg/50">
              <LoadingIndicator size="lg" label="Synchronizing Neural Streams..." />
            </div>
          }>
            <Routes>
              {/* Both root and nested paths handled if Dashboard is rendered at top-level */}
              <Route path="terminal" element={<LiveDashboard wsData={lastMessage} wsConfig={lastConfig} wsEvent={lastEvent} sendMessage={sendMessage} wsUrl={liveWsUrl} status={status} latency={latency} connect={connect} disconnect={disconnect} mobileMainView={mobileMainView} setMobileMainView={setMobileMainView} />} />

              <Route path="dino" element={<DinoView isConnected={isStreaming} wsEvent={lastEvent} />} />

              <Route path="eeg/*" element={<EEGDashboard isConnected={isStreaming} wsEvent={lastEvent} wsUrl={liveWsUrl} />} />

              <Route path="rps" element={<RPSGame wsEvent={lastEvent} />} />

              <Route path="lab/*" element={<LabView wsData={lastMessage} wsEvent={lastEvent} config={lastConfig} wsUrl={liveWsUrl} />} />

              <Route path="servo_claw" element={<ServoClawView wsEvent={lastEvent} isConnected={isStreaming} />} />

              <Route path="settings/*" element={<SettingsView latency={latency} connectionState={status} connectionStatus={serverStatus} apiUrl={apiUrl} localWs={localWs} setLocalWs={setLocalWs} ngrokWs={ngrokWs} setNgrokWs={setNgrokWs} connect={(url) => { const nextApiUrl = deriveApiUrlFromWs(url) || apiUrl; updateDeepSettings('general.wsUrl', url); updateDeepSettings('general.apiUrl', nextApiUrl); connect(url); }} />} />
              <Route path="bubble_game" element={<Navigate to="/dashboard/eeg/bubble_game" replace />} />
              <Route path="" element={<Navigate to="terminal" replace />} />
            </Routes>
          </Suspense>

          {showSpacers && <div className="h-[32px] shrink-0" />}
        </div>
      </div>

      {/* Footer */}
      <div className="footer shrink-0">
        <span className="flex items-center gap-1">NeuroTECH - A BCI Project </span>  •  {' '}
        <a className="muted flex items-center gap-1" href="#signup" rel="noreferrer">
          Sign Up
        </a>
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
  );
}

