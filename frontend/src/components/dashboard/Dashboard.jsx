import React, { useState, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { useWebSocket } from '../../hooks/useWebSocket'
import { useSerial } from '../../hooks/useSerial'
import { useTheme } from '../../contexts/ThemeContext'
import { Github, UserPlus } from 'lucide-react'
import LiveDashboard from '../views/LiveDashboard'
import DinoView from '../views/DinoView'
import SSVEPView from '../views/SSVEPView'
import RPSGame from '../views/RPSGame'
import CalibrationView from '../views/CalibrationView'
import MLTrainingView from '../views/MLTrainingView'
import SettingsView from '../views/SettingsView'

import '../../styles/App.css';
import ScrollStack, { ScrollStackItem } from '../ui/ScrollStack';
import PillNav from '../ui/PillNav';
import Pill from '../ui/Pill';
import { ConnectionButton } from '../ui/ConnectionButton';

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [currentPage, setCurrentPage] = useState('live')

  // WebSocket (Auto-connects now)
  const { status, lastMessage, lastConfig, lastEvent, latency, sendMessage } = useWebSocket()

  // Serial & Acquisition Logic
  const {
    isConnected: isSerialConnected,
    connect: connectSerial,
    disconnect: disconnectSerial,
    startAcquisition: startSerialAcquisition,
    stopAcquisition: stopSerialAcquisition
  } = useSerial();
  const [isAcquiring, setIsAcquiring] = useState(false);

  // Stop acquisition if disconnected
  useEffect(() => {
    if (!isSerialConnected) setIsAcquiring(false);
  }, [isSerialConnected]);

  const handleStartAcquisition = async () => {
    await startSerialAcquisition();
    setIsAcquiring(true);
  };

  const handleStopAcquisition = async () => {
    await stopSerialAcquisition();
    setIsAcquiring(false);
  };

  // Bridge Serial Data to Visualization
  const [serialBridgeData, setSerialBridgeData] = useState(null);

  useEffect(() => {
    const handleSerialData = (packets) => {
      if (packets && packets.length > 0) {
        // 1. Local Visualization
        setSerialBridgeData({ _batch: packets });

        // 2. Relay to Backend
        if (sendMessage && status === 'connected') {
          sendMessage({ type: 'data', payload: packets });
        }
      }
    };

    // Dynamically import to ensure singleton is ready or avoid circular deps logic issues
    import('../../services/SerialService').then(({ serialService }) => {
      serialService.on('data', handleSerialData);
    });

    return () => {
      import('../../services/SerialService').then(({ serialService }) => {
        serialService.off('data', handleSerialData);
      });
    };
  }, [sendMessage, status]);

  const { themes, currentTheme, currentThemeId, setTheme } = useTheme();
  const [authView, setAuthView] = useState(null);
  const isAuthenticated = !!user;

  // Derived nav colors from current theme
  const navColors = React.useMemo(() => ({
    base: currentTheme.colors['--accent'],
    pill: currentTheme.colors['--text'],
    pillText: currentTheme.colors['--accent'],
    hoverText: currentTheme.colors['--text']
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
    // Handle initial hash
    const hash = window.location.hash.replace('#', '');
    if (hash) setCurrentPage(hash);

    // Handle hash changes
    const handleHashChange = () => {
      const newHash = window.location.hash.replace('#', '');
      if (newHash) setCurrentPage(newHash);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [])

  const handleSignupSuccess = () => {
    setAuthView(null);
  };

  const handleLoginSuccess = () => {
    setAuthView(null);
  };


  const navItems = React.useMemo(() => [
    { label: 'GRAPHS', onClick: () => setCurrentPage('live'), href: '#live' },
    { label: 'Dino', onClick: () => setCurrentPage('dino'), href: '#dino' },
    { label: 'SSVEP', onClick: () => setCurrentPage('ssvep'), href: '#ssvep' },
    { label: 'RPS', onClick: () => setCurrentPage('rps'), href: '#rps' },
    { label: 'M. L.', onClick: () => setCurrentPage('ml_training'), href: '#ml_training' },
    { label: 'Calibration', onClick: () => setCurrentPage('calibration'), href: '#calibration' },
    { label: 'Settings', onClick: () => setCurrentPage('settings'), href: '#settings' },
    {
      label: 'Theme',
      type: 'pill',
      key: 'theme-dropdown',
      href: '#',
      menu: ({ close }) => (
        <ScrollStack>
          {themes.map((t) => (
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
                baseColor={t.colors['--accent']}
                pillColor={t.colors['--text']}
                hoveredTextColor={t.colors['--text']}
                pillTextColor={t.colors['--accent']}
              />
            </ScrollStackItem>
          ))}
        </ScrollStack>
      )
    }
  ], [themes, currentThemeId, pillSize.width, currentPage]);

  return (
    <div className="app-root">
      {/* Navigation */}
      <div className="header" style={{ zIndex: 50 }}>
        <div className="header-inner container">
          <div className="flex items-center gap-3">
            <div className="relative group cursor-pointer" onClick={logout} title="Click to Logout">
              <div className="absolute inset-0 bg-primary/20 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <video muted autoPlay loop playsInline preload="auto" aria-label="logo animation" className="w-16 h-16 relative z-10 rounded-lg border border-border bg-black object-cover">
                <source src="/Resources/brain_animation.mp4" type="video/mp4" />
              </video>
            </div>

            <div className="headline flex flex-col">
              <div className="headline-line main">
                NeuroTECH
                <br />
                <div className="headline-line sub">BCI Dashboard</div>
              </div>
            </div>
          </div>

          <nav className="nav shrink-0">
            <div className="backdrop-blur-sm bg-surface/50 border border-white/5 rounded-full p-1">
              <PillNav
                items={navItems}
                activeHref={`#${currentPage}`}
                className="custom-nav"
                ease="power2.easeOut"
                baseColor={navColors.base}
                pillColor={navColors.pill}
                hoveredPillTextColor={navColors.hoverText}
                pillTextColor={navColors.pillText}
                onLogoClick={() => { }}
              />
            </div>
          </nav>
          <div className="flex items-center gap-2 justify-end shrink-0">
            {/* [NEW] Combined Connection Button */}
            <ConnectionButton
              isConnected={isSerialConnected}
              isAcquiring={isAcquiring}
              connect={connectSerial}
              disconnect={disconnectSerial}
              startAcquisition={handleStartAcquisition}
              stopAcquisition={handleStopAcquisition}
            />
          </div>
        </div>

        {/* [REMOVED] Spacer Logic. Rely on padding of the content area or CSS margin. 
            If Header is fixed (position: fixed), we need padding-top on the main content, not a spacer div inside it.
        */}
      </div>

      {/* Main Content Area */}
      {/* Added pt-[96px] to account for fixed header if needed. Using inline style or tailwind. */}
      {/* .header in App.css is fixed with height ~86px? (padding 10 + content). */}
      <div className="scrollbar-thin scrollbar-thumb-border hover:scrollbar-thumb-primary/50 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']">

        {/* Page Content */}
        {currentPage === 'live' && <LiveDashboard wsData={lastMessage?.raw?.payload?.stream_name === 'Backend-Processed' ? lastMessage.raw.payload : (isSerialConnected ? serialBridgeData : lastMessage)} wsConfig={lastConfig} wsEvent={lastEvent} sendMessage={sendMessage} isAcquiring={isAcquiring} />}
        {currentPage === 'dino' && <DinoView wsData={lastMessage} wsEvent={lastEvent} isPaused={!isAcquiring} />}
        {currentPage === 'ssvep' && <SSVEPView />}
        {/* {currentPage === 'test' && <TestView wsData={lastMessage} wsEvent={lastEvent} config={lastConfig} />} */}
        {currentPage === 'rps' && <RPSGame wsEvent={lastEvent} />}
        {currentPage === 'calibration' && <CalibrationView wsData={lastMessage} wsEvent={lastEvent} config={lastConfig} />}
        {currentPage === 'ml_training' && <MLTrainingView />}
        {currentPage === 'settings' && <SettingsView />}

      </div>

      {/* Footer */}
      <div className="footer">
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