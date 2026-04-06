import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Activity, Music, Wind, Eye, Grid, MonitorPlay, Layers } from 'lucide-react';
import '../../styles/views/EEGDashboard.css';

import SSVEPView from '../eeg_dashbord/SSVEPView';
import MusicView from '../eeg_dashbord/MusicView';
import MeditationView from '../eeg_dashbord/MeditationView';
import BubbleGameView from '../eeg_dashbord/BubbleGameView';
import { SidebarProvider, useSidebar } from '../eeg_dashbord/SidebarContext';
import MainSidebar from '../eeg_dashbord/sidebar/MainSidebar';

const OVERVIEW_APPS = [
  { id: 'music', title: 'Music Control', icon: Music, desc: 'Control playback using frontal lobe focus states.', path: 'music' },
  { id: 'meditation', title: 'Meditation Trainer', icon: Wind, desc: 'Guided neurofeedback breathing sessions.', path: 'meditation' },
  { id: 'bubble', title: 'Bubble Game', icon: Activity, desc: 'Interactive peak wave game.', path: 'bubble_game' },
  { id: 'ssvep', title: 'SSVEP Interface', icon: Eye, desc: 'Visual cortex stimulation via flickering targets.', path: 'ssvep' },
];

const OverviewGrid = ({ onSelect }) => (
  <div className="eeg-overview-container animate-fade-in w-full">
    <h1 className="eeg-overview-title">Applications Dashboard</h1>
    <p className="eeg-overview-subtitle">Select a neuro-application to begin session.</p>
    <div className="eeg-app-grid">
      {OVERVIEW_APPS.map(app => (
        <div key={app.id} className="eeg-app-card" onClick={() => onSelect(app.id)}>
          <div className="eeg-app-icon"><app.icon size={28} /></div>
          <h3>{app.title}</h3>
          <p>{app.desc}</p>
        </div>
      ))}
    </div>
  </div>
);

const EEGDashboardContent = ({ wsEvent, isConnected, wsUrl }) => {
  const [currentView, setCurrentView] = useState("overview");
  const [eegResult, setEegResult] = useState(null);
  const { sidebarMode, setSidebarMode, sidebarSlot } = useSidebar();

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
      case "meditation": return <MeditationView result={eegResult} currentView={currentView} onNavigate={handleSelectView} onBackToMenu={handleBackToMenu} />;
      case "bubble": return <BubbleGameView result={eegResult} isConnected={isConnected} onBackToMenu={handleBackToMenu} onNavigate={handleSelectView} />;
      case "ssvep": return <SSVEPView isConnected={isConnected} wsEvent={wsEvent} onBackToMenu={handleBackToMenu} onNavigate={handleSelectView} />;
      default: return <OverviewGrid onSelect={handleSelectView} />;
    }
  };

  // All page views are now "Full Container" because they handle their own internal layout/sidebars
  const isFullContainer = currentView !== "overview";

  return (
    <div className="flex flex-row h-full w-full bg-[var(--bg)] overflow-hidden">

      {/* ── DUAL SIDEBAR SYSTEM ── */}
      <div className="w-[18rem] bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col h-full z-20 relative transition-all duration-500">

        {/* LabVIEW-style Toggle Button — always a fixed header row */}
        <div className="shrink-0 flex items-center justify-end px-4 pt-3 pb-2 border-b border-[var(--border)]/30">
          {isFullContainer ? (
            <button
              onClick={() => setSidebarMode(sidebarMode === 'main' ? 'page' : 'main')}
              className="nav-controls-toggle"
              title="Switch Navigation / Controls"
            >
              <Layers size={14} />
              {sidebarMode === 'main' ? 'NAV' : 'CTRL'}
            </button>
          ) : (
            <span className="text-[9px] font-black tracking-[3px] uppercase text-[var(--muted)]/40 pr-1">EEG Suite</span>
          )}
        </div>

        {/* Sidebar content — flex-1 allows it to grow and inner panel handles scroll */}
        <div className="sidebar-wrapper flex-1 min-h-0">
          {/* Global Navigation Panel */}
          <div className={`sidebar-panel ${sidebarMode === 'main' ? 'sidebar-active' : 'sidebar-hidden'}`}>
            <MainSidebar currentView={currentView} onSelect={handleSelectView} />
          </div>

          {/* Page-Specific Sidebar Panel (Empty for overview) */}
          <div className={`sidebar-panel ${sidebarMode === 'page' ? 'sidebar-active' : 'sidebar-hidden'}`}>
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
