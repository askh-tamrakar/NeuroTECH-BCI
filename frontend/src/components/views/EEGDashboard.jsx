import React, { useState, useEffect } from 'react';
import { Activity, Music, Wind, Eye, Grid, MonitorPlay, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../../styles/views/EEGDashboard.css';

import SSVEPView from '../eeg_dashbord/pages/SSVEPView';
import MusicView from '../eeg_dashbord/pages/MusicView';
import MeditationView from '../eeg_dashbord/pages/MeditationView';
import BubbleGameView from '../eeg_dashbord/pages/BubbleGameView';
import { SidebarProvider, useSidebar } from '../eeg_dashbord/pages/SidebarContext';
import MainSidebar from '../eeg_dashbord/sidebar/MainSidebar';
import { CalibrationApi } from '../../services/calibrationApi';

const OVERVIEW_APPS = [
  { id: 'music', title: 'Music Control', icon: Music, desc: 'Control playback using frontal lobe focus states.' },
  { id: 'meditation', title: 'Meditation Trainer', icon: Wind, desc: 'Guided neurofeedback breathing sessions.' },
  { id: 'bubble', title: 'Bubble Game', icon: Activity, desc: 'Interactive peak wave game.' },
  { id: 'ssvep', title: 'SSVEP Interface', icon: Eye, desc: 'Visual cortex stimulation via flickering targets.' },
];

const CARD_THEMES = {
  music: {
    bg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(99, 102, 241, 0.06) 50%, rgba(30, 20, 50, 0.9) 100%)',
    border: 'rgba(168, 85, 247, 0.35)',
    shadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 50px rgba(168,85,247,0.15), inset 0 0 0 1px rgba(168,85,247,0.15)',
    hoverBg: 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(99, 102, 241, 0.12) 60%, rgba(30, 20, 50, 0.95) 100%)',
    hoverBorder: 'rgba(168, 85, 247, 0.7)',
    hoverShadow: '0 0 80px rgba(168,85,247,0.35), 0 0 160px rgba(168,85,247,0.15), inset 0 0 100px rgba(168,85,247,0.1)',
  },
  meditation: {
    bg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.18) 0%, rgba(59, 130, 246, 0.06) 50%, rgba(15, 40, 30, 0.9) 100%)',
    border: 'rgba(16, 185, 129, 0.35)',
    shadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 50px rgba(16,185,129,0.15), inset 0 0 0 1px rgba(16,185,129,0.15)',
    hoverBg: 'linear-gradient(135deg, rgba(16, 185, 129, 0.3) 0%, rgba(59, 130, 246, 0.12) 60%, rgba(15, 40, 30, 0.95) 100%)',
    hoverBorder: 'rgba(16, 185, 129, 0.7)',
    hoverShadow: '0 0 80px rgba(16,185,129,0.35), 0 0 160px rgba(16,185,129,0.15), inset 0 0 100px rgba(16,185,129,0.1)',
  },
  bubble: {
    bg: 'linear-gradient(135deg, rgba(14, 165, 233, 0.18) 0%, rgba(45, 212, 191, 0.06) 50%, rgba(15, 25, 45, 0.9) 100%)',
    border: 'rgba(14, 165, 233, 0.35)',
    shadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 50px rgba(14,165,233,0.15), inset 0 0 0 1px rgba(14,165,233,0.15)',
    hoverBg: 'linear-gradient(135deg, rgba(14, 165, 233, 0.3) 0%, rgba(45, 212, 191, 0.12) 60%, rgba(15, 25, 45, 0.95) 100%)',
    hoverBorder: 'rgba(14, 165, 233, 0.7)',
    hoverShadow: '0 0 80px rgba(14,165,233,0.35), 0 0 160px rgba(14,165,233,0.15), inset 0 0 100px rgba(14,165,233,0.1)',
  },
  ssvep: {
    bg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.18) 0%, rgba(239, 68, 68, 0.06) 50%, rgba(45, 30, 15, 0.9) 100%)',
    border: 'rgba(245, 158, 11, 0.35)',
    shadow: '0 24px 48px rgba(0,0,0,0.4), 0 0 50px rgba(245,158,11,0.15), inset 0 0 0 1px rgba(245,158,11,0.15)',
    hoverBg: 'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(239, 68, 68, 0.12) 60%, rgba(45, 30, 15, 0.95) 100%)',
    hoverBorder: 'rgba(245, 158, 11, 0.7)',
    hoverShadow: '0 0 80px rgba(245,158,11,0.35), 0 0 160px rgba(245,158,11,0.15), inset 0 0 100px rgba(245,158,11,0.1)',
  },
};

const OverviewGrid = ({ onSelect }) => {
  const [hoveredId, setHoveredId] = React.useState(null);

  return (
  <div className="eeg-overview-container animate-fade-in w-full">
    <h1 className="eeg-overview-title">Applications Dashboard</h1>
    <p className="eeg-overview-subtitle">Select a neuro-application to begin session.</p>
    <div className="eeg-app-grid">
      <AnimatePresence>
        {OVERVIEW_APPS.map((app, index) => {
          const theme = CARD_THEMES[app.id];
          const isHovered = hoveredId === app.id;
          return (
          <motion.div
            key={app.id}
            className={`eeg-app-card group card-${app.id}`}
            style={{
              background: isHovered ? theme.hoverBg : theme.bg,
              borderColor: isHovered ? theme.hoverBorder : theme.border,
              boxShadow: isHovered ? theme.hoverShadow : theme.shadow,
            }}
            onMouseEnter={() => setHoveredId(app.id)}
            onMouseLeave={(e) => {
              setHoveredId(null);
              e.currentTarget.style.setProperty('--mouse-x', '50%');
              e.currentTarget.style.setProperty('--mouse-y', '50%');
            }}
            onClick={() => onSelect(app.id)}
            initial={{ opacity: 0, y: 60, scale: 0.85, rotateX: 15 }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: -30, scale: 0.9, transition: { duration: 0.3 } }}
            transition={{
              duration: 1,
              delay: index * 0.15,
              type: "spring",
              stiffness: 80,
              damping: 18
            }}
            whileHover={{
              y: -16,
              scale: 1.04,
              rotateX: 4,
              rotateY: -4,
              z: 40,
              transition: { duration: 0.45, type: "spring", stiffness: 250, damping: 20 }
            }}
            whileTap={{ scale: 0.97, rotateX: 0, rotateY: 0, transition: { duration: 0.1 } }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const x = e.clientX - rect.left;
              const y = e.clientY - rect.top;
              e.currentTarget.style.setProperty('--mouse-x', `${x}px`);
              e.currentTarget.style.setProperty('--mouse-y', `${y}px`);
            }}
          >
            {/* Holographic Decoration Layer */}
            <div className="eeg-card-decoration">
              <div className="decoration-orb orb-1"></div>
              <div className="decoration-orb orb-2"></div>
            </div>

            {/* Shimmer line */}
            <div className="card-shimmer"></div>

            <div className="eeg-app-icon">
              <app.icon size={32} strokeWidth={1.5} />
            </div>

            <div className="relative z-10 w-full">
              <h3 className="card-title-premium">{app.title}</h3>
              <p className="card-desc-premium">{app.desc}</p>
            </div>

            {/* Glowing Action Button */}
            <div className="absolute bottom-10 right-10 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-x-10 group-hover:translate-x-0">
              <div className="w-14 h-14 rounded-full border border-white/30 bg-white/10 flex items-center justify-center backdrop-blur-2xl shadow-[0_0_20px_rgba(255,255,255,0.2)]">
                <span className="text-white text-3xl font-light">→</span>
              </div>
            </div>
          </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  </div>
  );
};

const EEGDashboardContent = ({ wsEvent, isConnected, wsUrl }) => {
  const [currentView, setCurrentView] = useState("overview");
  const [eegResult, setEegResult] = useState(null);
  const { sidebarMode, setSidebarMode, sidebarSlot } = useSidebar();
  const [sidebarVisible, setSidebarVisible] = useState(true);

  useEffect(() => {
    // When inside EEG dashboard, stop EMG and EOG, and start EEG.
    CalibrationApi.togglePrediction('EMG', false).catch(e => {});
    CalibrationApi.togglePrediction('EOG', false).catch(e => {});
    CalibrationApi.togglePrediction('EEG', true).catch(e => {});

    return () => {
      // When leaving EEG dashboard, stop EEG.
      CalibrationApi.togglePrediction('EEG', false).catch(e => {});
    };
  }, []);

  useEffect(() => {
    let modePreset = "frontal_fp1";
    if (currentView === "ssvep") modePreset = "visual_eeg_oz";

    fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: modePreset, view: currentView })
    }).catch(err => console.error("Failed to update mode:", err));

    setEegResult(null);

    // Automatically switch to 'page' mode when entering a specific app
    if (currentView !== 'overview') {
      setSidebarMode('page');
    } else {
      setSidebarMode('main');
    }
  }, [currentView, setSidebarMode]);

  useEffect(() => {
    if (wsEvent) {
      // Priority 1: Direct mode manager output
      if (wsEvent.event === 'eeg_mode_result') {
        const output = wsEvent.output || {};
        setEegResult({
          ...output,
          band_powers: wsEvent.band_powers,
          eeg_mapped: wsEvent.eeg_mapped,
          features: wsEvent.features,
          signal_quality: wsEvent.signal_quality ?? output.signal_quality ?? 1.0,
        });
      }
      // Priority 2 & 3: Background Router Events (Predictions or Features)
      else if (wsEvent.event === 'eeg_prediction' || wsEvent.output?.event === 'eeg_prediction' || wsEvent.features || wsEvent.band_powers) {
        setEegResult(prev => {
          if (!prev) return wsEvent.output || wsEvent;
          const data = wsEvent.output || wsEvent;
          // Strict merge: only update features, bands, and frequency data.
          // NEVER overwrite frontend mode manager keys (state, stress_score, focus_score).
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
  }, [wsEvent]);

  const handleSelectView = React.useCallback((view) => {
    setCurrentView(view);
  }, []);

  const handleBackToMenu = React.useCallback(() => {
    setCurrentView('overview');
  }, []);

  const renderView = () => {
    switch (currentView) {
      case "overview": return <OverviewGrid onSelect={handleSelectView} />;
      case "music": return <MusicView result={eegResult} onNavigate={handleSelectView} onBackToMenu={handleBackToMenu} />;
      case "meditation": return <MeditationView result={eegResult} wsEvent={wsEvent} wsUrl={wsUrl} currentView={currentView} onNavigate={handleSelectView} onBackToMenu={handleBackToMenu} />;
      case "bubble": return <BubbleGameView result={eegResult} isConnected={isConnected} onBackToMenu={handleBackToMenu} onNavigate={handleSelectView} />;
      case "ssvep": return <SSVEPView isConnected={isConnected} wsEvent={wsEvent} onBackToMenu={handleBackToMenu} onNavigate={handleSelectView} />;
      default: return <OverviewGrid onSelect={handleSelectView} />;
    }
  };

  // All page views are now "Full Container" because they handle their own internal layout/sidebars
  const isFullContainer = currentView !== "overview";

  return (
    <div className="flex flex-row h-full w-full bg-[var(--bg)] overflow-hidden relative">

      {/* ── TOGGLE BUTTON ── */}
      <button
        onClick={() => setSidebarVisible(prev => !prev)}
        className={`absolute top-1/2 -translate-y-1/2 z-[999] p-2 rounded-r-md bg-[var(--surface)]/90 backdrop-blur-md border border-l-0 border-[var(--primary)]/30 text-[var(--text)] shadow-lg transition-all duration-500 hover:bg-[var(--primary)]/20 ${sidebarVisible ? 'left-[21rem]' : 'left-0'}`}
        title={sidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
      >
        {sidebarVisible ? <ChevronLeft size={24} /> : <ChevronRight size={24} />}
      </button>

      {/* ── DUAL SIDEBAR SYSTEM ── */}
      <div className={`${sidebarVisible ? 'w-[21rem] border-r border-[var(--border)] opacity-100 translate-x-0' : 'w-0 border-none opacity-0 -translate-x-full'} bg-[var(--surface)] shrink-0 flex flex-col h-full z-20 relative transition-all duration-500 overflow-hidden`}>

        {/* Sidebar content — flex-1 allows it to grow and inner panel handles scroll */}
        <div className="sidebar-wrapper flex-1 min-h-0">
          {/* Global Navigation Panel */}
          <div className={`sidebar-panel scrollbar-hide ${sidebarMode === 'main' ? 'sidebar-active' : 'sidebar-hidden'}`}>
            <MainSidebar currentView={currentView} onSelect={handleSelectView} />
          </div>

          {/* Page-Specific Sidebar Panel (Empty for overview) */}
          <div className={`sidebar-panel scrollbar-hide ${sidebarMode === 'page' ? 'sidebar-active' : 'sidebar-hidden'}`}>
            <div className="h-full">
              {sidebarSlot || (
                <div className="flex flex-col items-center justify-center h-full opacity-40 text-center px-6">
                  <MonitorPlay size={40} className="mb-4 text-[var(--primary)]" />
                  <p className="text-[10px] font-bold tracking-widest uppercase">
                    Select a view to see controls
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-grow h-full relative overflow-hidden">
        {renderView()}
      </div>
    </div>
  );
};

const EEGDashboard = (props) => (
  <SidebarProvider>
    <EEGDashboardContent {...props} />
  </SidebarProvider>
);

export default EEGDashboard;
