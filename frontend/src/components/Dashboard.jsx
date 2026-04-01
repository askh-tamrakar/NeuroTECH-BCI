import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useWebSocket } from '../hooks/useWebSocket'
import { useTheme } from '../contexts/ThemeContext'
import { useSettings } from '../contexts/SettingsContext'
import LiveDashboard from './views/LiveDashboard'
import DinoView from './views/DinoView'
import EEGDashboard from './views/EEGDashboard'
import RPSGame from './views/RPSGame'
import LabView from './views/LabView'
import SettingsView from './views/SettingsView'
import ServoClawView from './views/ServoClawView'
import MLTrainingView from './lab/Split'

import '../styles/App.css';
import ScrollStack, { ScrollStackItem } from './ui/navigation/ScrollStack';
import PillNav from './ui/navigation/PillNav';
import Pill from './ui/navigation/Pill';
import { ConnectionButton } from './ui/display/ConnectionButton';
import Brain3D from './ui/display/Brain3D';
import MobileNav from './ui/navigation/MobileNav';

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState('live')
  const [activeSettingsSection, setActiveSettingsSection] = useState('account')
  const [mobileMainView, setMobileMainView] = useState('graphs')
  const [isMobile, setIsMobile] = useState(false);
  const { themes, currentTheme, currentThemeId, setTheme } = useTheme();
  const { settings, updateDeepSettings } = useSettings();

  // Unified WebSocket state from Context
  const wsUrl = settings.general.wsUrl || 'ws://localhost:5005';

  // These are now just helpers for the Settings View, not the source of truth for the hook
  const [localWs, setLocalWs] = useState('ws://localhost:5005')
  const [ngrokWs, setNgrokWs] = useState('wss://squelchingly-thriftier-cecile.ngrok-free.dev')

  const { status, lastMessage, lastConfig, lastEvent, latency, connect, disconnect, sendMessage, currentUrl } = useWebSocket(wsUrl)
  const [authView, setAuthView] = useState(null);
  const isAuthenticated = !!user;

  // Derived nav colors from current theme
  const navColors = React.useMemo(() => ({
    base: currentTheme.navPill,
    pill: currentTheme.navBase,
    pillText: currentTheme.navPill,
    hoverText: currentTheme.navBase
  }), [currentTheme]);

  // Pill size calculation
  const [pillSize, setPillSize] = React.useState({ width: 0, height: 0 });
  React.useEffect(() => {
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
    connect()

    // Handle initial hash
    const hash = window.location.hash.replace('#', '');
    if (hash) setCurrentPage(hash);

    // Handle hash changes
    const handleHashChange = () => {
      const newHash = window.location.hash.replace('#', '');
      if (newHash) setCurrentPage(newHash);
    };

    window.addEventListener('hashchange', handleHashChange);

    // Mobile detection
    const lgQuery = window.matchMedia('(min-width: 1024px)');
    setIsMobile(!lgQuery.matches);
    const handler = (e) => setIsMobile(!e.matches);
    lgQuery.addEventListener('change', handler);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      lgQuery.removeEventListener('change', handler);
    }
  }, [])

  const handleSignupSuccess = () => {
    setAuthView(null);
  };

  const handleLoginSuccess = () => {
    setAuthView(null);
  };


  const navItems = React.useMemo(() => [
    { label: 'TERMINAL', onClick: () => setCurrentPage('live'), href: '#live' },
    { label: 'Dino', onClick: () => setCurrentPage('dino'), href: '#dino' },
    { label: 'EEG Suite', onClick: () => setCurrentPage('eeg_dashboard'), href: '#eeg_dashboard' },
    { label: 'RPS', onClick: () => setCurrentPage('rps'), href: '#rps' },
    { label: 'Lab', onClick: () => setCurrentPage('lab'), href: '#lab' },
    { label: 'Servo Claw', onClick: () => setCurrentPage('servo_claw'), href: '#servo_claw' },
    { label: 'Settings', onClick: () => { setCurrentPage('settings'); setActiveSettingsSection('account'); }, href: '#settings' },
    { label: 'ML Training', onClick: () => setCurrentPage('ml_training'), href: '#ml_training' },
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
                activeHref={`#${currentPage}`}
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
  ], [themes, currentThemeId, pillSize.width, currentPage, isMobile]);

  return (
    <div className="app-root flex flex-col h-screen overflow-hidden">
      {/* Navigation */}
      <div className="header shrink-0" style={{ zIndex: 50 }}>
        <div className="header-inner">
          <div className="cursor-pointer m-0 p-0 flex-shrink-0 relative z-20 hidden lg:block" onClick={() => setCurrentPage('live')} title="Back to Terminal">
            <div className="pointer-events-none">
              <Brain3D />
            </div>
          </div>

          <div className="headline flex flex-col flex-grow cursor-pointer select-none" onClick={() => setCurrentPage('live')} title="Back to Terminal">
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
                activeHref={`#${currentPage}`}
                onLogoClick={() => { setActiveSettingsSection('connectivity'); setCurrentPage('settings'); }}
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

      {/* Main Container for MobileNav + Content Area */}
      <div className="flex flex-row flex-1 overflow-hidden relative">
        <MobileNav
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          mobileMainView={mobileMainView}
          setMobileMainView={setMobileMainView}
        />
        <div className="scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-primary/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none'] flex-1 flex flex-col" style={{ padding: '0px 0px', overflowY: 'hidden' }}>
          {/* Helper to determine if we need spacers (non-full-screen pages need them to clear fixed header/footer) */}
          {(() => {
            const FULL_SCREEN_PAGES = ['live', 'dino', 'rps', 'test', 'meditation'];
            const showSpacers = !FULL_SCREEN_PAGES.includes(currentPage);

            return (
              <>
                {showSpacers && <div className="h-[85px] shrink-0" />}

                {currentPage === 'live' && <LiveDashboard wsData={lastMessage} wsConfig={lastConfig} wsEvent={lastEvent} sendMessage={sendMessage} wsUrl={status === 'connected' ? (currentUrl || defaultWsSource) : null} mobileMainView={mobileMainView} setMobileMainView={setMobileMainView} />}
                {currentPage === 'dino' && <DinoView isConnected={!!lastMessage} wsEvent={lastEvent} isPaused={false} />}
                {currentPage === 'eeg_dashboard' && <EEGDashboard isConnected={!!lastMessage} wsEvent={lastEvent} wsUrl={status === 'connected' ? (currentUrl || defaultWsSource) : null} />}
                {currentPage === 'rps' && <RPSGame wsEvent={lastEvent} />}
                {currentPage === 'lab' && <LabView wsData={lastMessage} wsEvent={lastEvent} config={lastConfig} wsUrl={status === 'connected' ? (currentUrl || defaultWsSource) : null} />}
                {currentPage === 'servo_claw' && <ServoClawView wsEvent={lastEvent} isConnected={!!lastMessage} />}
                {currentPage === 'settings' && <SettingsView latency={latency} localWs={localWs} setLocalWs={setLocalWs} ngrokWs={ngrokWs} setNgrokWs={setNgrokWs} activeSection={activeSettingsSection} onSectionChange={setActiveSettingsSection} connect={(url) => { updateDeepSettings('general.wsUrl', url); connect(url); }} />}
                {currentPage === 'ml_training' && <MLTrainingView wsData={lastMessage} wsEvent={lastEvent} config={lastConfig} wsUrl={status === 'connected' ? (currentUrl || defaultWsSource) : null} />}

                {showSpacers && <div className="h-[35px] shrink-0" />}
              </>
            );
          })()}
        </div>
      </div>

      {/* Footer */}
      <div className="footer shrink-0">
        <span className="flex items-center gap-1">NeuroTECH - A BCI Project </span>  •  {' '}
        <a onClick={() => setAuthView('signup')} className="muted flex items-center gap-1" href="#signup" rel="noreferrer">
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
