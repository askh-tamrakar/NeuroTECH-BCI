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

const OVERVIEW_APPS = [
  { id: 'music', title: 'Music Control', icon: Music, desc: 'Control playback using frontal lobe focus states.' },
  { id: 'meditation', title: 'Meditation Trainer', icon: Wind, desc: 'Guided neurofeedback breathing sessions.' },
  { id: 'bubble', title: 'Bubble Game', icon: Activity, desc: 'Interactive peak wave game.' },
  { id: 'ssvep', title: 'SSVEP Interface', icon: Eye, desc: 'Visual cortex stimulation via flickering targets.' },
];

const OverviewGrid = ({ onSelect }) => (
  <div className="eeg-overview-container animate-fade-in w-full">
    <h1 className="eeg-overview-title">Applications Dashboard</h1>
    <p className="eeg-overview-subtitle">Select a neuro-application to begin session.</p>
    <div className="eeg-app-grid">
      <AnimatePresence>
        {OVERVIEW_APPS.map((app, index) => (
          <motion.div 
            key={app.id} 
            className={`eeg-app-card group card-${app.id}`} 
            onClick={() => onSelect(app.id)}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ 
              duration: 0.8, 
              delay: index * 0.1, 
              type: "spring", 
              stiffness: 100, 
              damping: 15 
            }}
            whileHover={{ 
              y: -20, 
              scale: 1.05, 
              rotateX: 5, 
              rotateY: -5,
              z: 50,
              transition: { duration: 0.4, type: "spring", stiffness: 300 }
            }}
            whileTap={{ scale: 0.98, rotateX: 0, rotateY: 0 }}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
              e.currentTarget.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
              
              // Custom GSAP-like 3D feel using CSS Variables if needed, but framer-motion handles most.
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
        ))}
      </AnimatePresence>
    </div>
  </div>
);

const EEGDashboardContent = ({ wsEvent, isConnected, wsUrl }) => {
  const [currentView, setCurrentView] = useState("overview");
  const [eegResult, setEegResult] = useState(null);
  const { sidebarMode, setSidebarMode, sidebarSlot } = useSidebar();
  const [sidebarVisible, setSidebarVisible] = useState(true);

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
        setEegResult(wsEvent.output || wsEvent);
      }
      // Priority 2: Feature Router predictions (F1/F2)
      else if (wsEvent.event === 'eeg_prediction' || wsEvent.output?.event === 'eeg_prediction') {
        setEegResult(wsEvent.output || wsEvent);
      }
      // Priority 3: Catch-all for any object containing relevant EEG fields
      else if (wsEvent.features || wsEvent.band_powers) {
        setEegResult(wsEvent);
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
        className={`absolute top-4 z-[100] p-1.5 rounded-md bg-[var(--surface)]/80 backdrop-blur-md border border-[var(--primary)]/30 text-[var(--text)] shadow-lg transition-all duration-500 hover:bg-[var(--primary)]/20 ${sidebarVisible ? 'left-[calc(21rem+1rem)]' : 'left-4'}`}
        title={sidebarVisible ? "Hide Sidebar" : "Show Sidebar"}
      >
        {sidebarVisible ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
      </button>

      {/* ── DUAL SIDEBAR SYSTEM ── */}
      <div className={`${sidebarVisible ? 'w-[21rem] border-r opacity-100' : 'w-0 border-r-0 opacity-0'} bg-[var(--surface)] border-[var(--border)] shrink-0 flex flex-col h-full z-20 relative transition-all duration-500 overflow-hidden`}>

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
