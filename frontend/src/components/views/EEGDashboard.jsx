import React, { useState, useEffect, useRef } from 'react';
import { Activity, Music, Wind, Eye, Grid } from 'lucide-react';
import '../../styles/views/EEGDashboard.css';

import SSVEPView from '../eeg/SSVEPView';
import MusicView from '../eeg/MusicView';
import MeditationView from '../eeg/MeditationView';
import BubbleGameView from '../eeg/BubbleGameView';

const OVERVIEW_APPS = [
  { id: 'music', title: 'Music Control', icon: Music, desc: 'Control playback using frontal lobe focus states.' },
  { id: 'meditation', title: 'Meditation Trainer', icon: Wind, desc: 'Guided neurofeedback breathing sessions.' },
  { id: 'bubble', title: 'Bubble Game', icon: Activity, desc: 'Interactive peak wave game.' },
  { id: 'ssvep', title: 'SSVEP Interface', icon: Eye, desc: 'Visual cortex stimulation via flickering targets.' },
];

const OverviewGrid = ({ onSelect }) => (
  <div className="eeg-overview-container animate-fade-in">
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
  const [currentView, setCurrentView] = useState("overview");
  const [eegResult, setEegResult] = useState(null);

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

  const renderView = () => {
    switch (currentView) {
      case "overview": return <OverviewGrid onSelect={setCurrentView} />;
      case "music": return <MusicView result={eegResult} />;
      case "meditation": return <MeditationView result={eegResult} />;
      case "bubble": return <BubbleGameView result={eegResult} isConnected={isConnected} />;
      case "ssvep": return <SSVEPView isConnected={isConnected} wsEvent={wsEvent} />;
      default: return <OverviewGrid onSelect={setCurrentView} />;
    }
  };

  const isFullContainer = currentView === "ssvep" || currentView === "bubble";

  return (
    <div className="eeg-dashboard-wrapper">
      {/* Sidebar Navigation */}
      <div className="eeg-sidebar">
        <div className="eeg-sidebar-header">
          <Activity size={24} color="var(--accent, #FFC107)" />
          <span>EEG Suite</span>
        </div>

        <div className="eeg-sidebar-group flex-grow overflow-y-auto [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 hover:[&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
          <div className="eeg-sidebar-title">Applications</div>
          <div
            className={`eeg-nav-item ${currentView === 'overview' ? 'active' : ''}`}
            onClick={() => setCurrentView('overview')}
          >
            <Grid size={18} /> Dashboard Overview
          </div>

          <div
            className={`eeg-nav-item ${currentView === 'music' ? 'active' : ''}`}
            onClick={() => setCurrentView('music')}
          >
            <Music size={18} /> Music Control
          </div>
          <div
            className={`eeg-nav-item ${currentView === 'meditation' ? 'active' : ''}`}
            onClick={() => setCurrentView('meditation')}
          >
            <Wind size={18} /> Meditation Trainer
          </div>

          <div
            className={`eeg-nav-item ${currentView === 'bubble' ? 'active' : ''}`}
            onClick={() => setCurrentView('bubble')}
          >
            <Activity size={18} /> Bubble Game
          </div>
          <div
            className={`eeg-nav-item ${currentView === 'ssvep' ? 'active' : ''}`}
            onClick={() => setCurrentView('ssvep')}
          >
            <Eye size={18} /> SSVEP Interface
          </div>

        </div>


      </div>

      {/* Main Content Area */}
      <div className="eeg-main-content" style={
        isFullContainer
          ? { padding: 0, background: currentView === "ssvep" ? '#000' : 'transparent', overflow: 'hidden', position: 'relative', height: '100%' }
          : { overflowY: 'auto', overflowX: 'hidden' }
      }>
        {isFullContainer ? (
          renderView()
        ) : currentView === "overview" ? (
          renderView()
        ) : (
          <div className="eeg-glass-card">
            {renderView()}
          </div>
        )}
      </div>
    </div >
  );
};

export default EEGDashboard;
