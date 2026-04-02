import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Activity, Music, Wind, Eye, Grid, MonitorPlay, Layers } from 'lucide-react';
import '../../styles/views/EEGDashboard.css';

import SSVEPView from '../eeg_dashbord/SSVEPView';
import MusicView from '../eeg_dashbord/MusicView';
import MeditationView from '../eeg_dashbord/MeditationView';
import BubbleGameView from '../eeg_dashbord/BubbleGameView';

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

const EEGDashboard = ({ wsEvent, isConnected, wsUrl }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [eegResult, setEegResult] = useState(null);

  // Derive current view from path
  const currentView = useMemo(() => {
    if (location.pathname.endsWith('/music')) return 'music';
    if (location.pathname.endsWith('/meditation')) return 'meditation';
    if (location.pathname.endsWith('/bubble_game')) return 'bubble';
    if (location.pathname.endsWith('/ssvep')) return 'ssvep';
    return 'overview';
  }, [location.pathname]);

  useEffect(() => {
    let modePreset = "frontal_fp1";
    if (currentView === "ssvep") modePreset = "visual_eeg_oz";

    fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset: modePreset, view: currentView })
    }).catch(err => console.error("Failed to update mode:", err));

    setEegResult(null);
  }, [currentView]);

  useEffect(() => {
    if (wsEvent && wsEvent.event === 'eeg_mode_result') {
      setEegResult(wsEvent.output || wsEvent);
    }
  }, [wsEvent]);

  const isFullContainer = currentView === "ssvep" || currentView === "bubble";

  return (
    <div className="flex flex-row h-full w-full bg-[var(--bg)]">

      {/* Native Left Sidebar Navigation (Hidden when Full Container App is active) */}
      {!isFullContainer && (
        <div className="w-[18rem] bg-[var(--surface)] border-r border-[var(--border)] shrink-0 flex flex-col h-full z-10 p-4">
          <h2 className="text-xl font-black mb-6 text-[var(--primary)] tracking-widest px-2">NEURO SUITE</h2>

          <div className="flex flex-col gap-1.5 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden">
            <button
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'overview' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 shadow-sm' : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent'}`}
              onClick={() => navigate('/dashboard/eeg')}
            >
              <Grid size={18} /> Dashboard Overview
            </button>
            <button
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'music' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 shadow-sm' : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent'}`}
              onClick={() => navigate('/dashboard/eeg/music')}
            >
              <Music size={18} /> Music Control
            </button>
            <button
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'meditation' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 shadow-sm' : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent'}`}
              onClick={() => navigate('/dashboard/eeg/meditation')}
            >
              <Wind size={18} /> Meditation Trainer
            </button>
            <button
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'bubble' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 shadow-sm' : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent'}`}
              onClick={() => navigate('/dashboard/eeg/bubble_game')}
            >
              <Activity size={18} /> Bubble Game
            </button>
            <button
              className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'ssvep' ? 'bg-[var(--primary)]/10 text-[var(--primary)] border-[var(--primary)]/30 shadow-sm' : 'text-[var(--text)] hover:bg-[var(--bg)] border-transparent'}`}
              onClick={() => navigate('/dashboard/eeg/ssvep')}
            >
              <Eye size={18} /> SSVEP Interface
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={`flex-grow h-full overflow-hidden flex flex-col relative`}>
        <div className={isFullContainer ? "h-full w-full" : "w-full h-full mx-auto flex-1 overflow-y-auto p-4 md:p-8"}>
          <Routes>
            <Route index element={<OverviewGrid onSelect={(id) => navigate(`/dashboard/eeg/${id === 'bubble' ? 'bubble_game' : id}`)} />} />
            <Route path="music" element={<MusicView result={eegResult} />} />
            <Route path="meditation" element={<MeditationView result={eegResult} />} />
            <Route path="bubble_game" element={<BubbleGameView result={eegResult} isConnected={isConnected} onBackToMenu={() => navigate('/dashboard/eeg')} />} />
            <Route path="ssvep" element={<SSVEPView isConnected={isConnected} wsEvent={wsEvent} onBackToMenu={() => navigate('/dashboard/eeg')} />} />
            <Route path="*" element={<Navigate to="/dashboard/eeg" replace />} />
          </Routes>
        </div>
      </div>
    </div>
  );
};

export default EEGDashboard;

