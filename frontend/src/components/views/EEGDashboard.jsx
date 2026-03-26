import React, { useState, useEffect } from 'react';
import { Activity, Music, Brain, Wind, AlertTriangle, Eye, Radio, Layout } from 'lucide-react';
import '../../styles/views/EEGDashboard.css';

import SSVEPView from './SSVEPView';
import MusicView from './MusicView';
import FocusView from './FocusView';
import MeditationView from './MeditationView';
import StressView from './StressView';
import FFTView from './FFTView';
import BubbleGameView from './BubbleGameView';
import VisualEEGView from './VisualEEGView';

const EEGDashboard = ({ wsEvent, isConnected, wsUrl }) => {
  const [preset, setPreset] = useState("frontal_fp1");
  const [currentView, setCurrentView] = useState("music");
  const [eegResult, setEegResult] = useState(null);

  useEffect(() => {
    fetch('/api/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preset, view: currentView })
    }).catch(err => console.error("Failed to update mode:", err));

    setEegResult(null);
  }, [preset, currentView]);

  useEffect(() => {
    if (wsEvent && wsEvent.event === 'eeg_mode_result') {
      setEegResult(wsEvent.output || wsEvent);
    }
  }, [wsEvent]);

  const renderView = () => {
    if (preset.includes("ssvep")) {
      return <SSVEPView isConnected={isConnected} wsEvent={wsEvent} />;
    }

    switch (currentView) {
      case "music": return <MusicView result={eegResult} />;
      case "focus": return <FocusView result={eegResult} />;
      case "meditation": return <MeditationView result={eegResult} />;
      case "stress": return <StressView result={eegResult} />;
      case "fft": return <FFTView wsUrl={wsUrl} />;
      case "bubble": return <BubbleGameView result={eegResult} isConnected={isConnected} />;
      case "monitor": return <VisualEEGView wsEvent={wsEvent} isConnected={isConnected} />;
      default: return <div className="waiting-container">Select an application...</div>;
    }
  };

  return (
    <div className="eeg-dashboard-wrapper">
      {/* Sidebar Navigation */}
      <div className="eeg-sidebar">
        <div className="eeg-sidebar-header">
          <Activity size={24} color="var(--accent, #4CAF50)" />
          <span>EEG Suite</span>
        </div>

        <div className="eeg-sidebar-group">
          <div className="eeg-sidebar-title">Pipeline / Sensor</div>
          <div
            className={`eeg-nav-item ${preset === 'ssvep_eeg_oz' ? 'active' : ''}`}
            onClick={() => setPreset('ssvep_eeg_oz')}
          >
            <Eye size={18} /> SSVEP (Oz)
          </div>

          <div
            className={`eeg-nav-item ${preset === 'frontal_fp1' ? 'active' : ''}`}
            onClick={() => setPreset('frontal_fp1')}
          >
            <Brain size={18} /> Frontal Lobe (FP1)
          </div>
          <div
            className={`eeg-nav-item ${preset === 'frontal_fp2' ? 'active' : ''}`}
            onClick={() => setPreset('frontal_fp2')}
          >
            <Brain size={18} /> Frontal Lobe (FP2)
          </div>
        </div>

        {preset.includes("frontal") && (
          <div className="eeg-sidebar-group">
            <div className="eeg-sidebar-title">Frontal Applications</div>
            <div
              className={`eeg-nav-item ${currentView === 'music' ? 'active' : ''}`}
              onClick={() => setCurrentView('music')}
            >
              <Music size={18} /> Music Control
            </div>
            <div
              className={`eeg-nav-item ${currentView === 'focus' ? 'active' : ''}`}
              onClick={() => setCurrentView('focus')}
            >
              <Brain size={18} /> Focus Monitor
            </div>
            <div
              className={`eeg-nav-item ${currentView === 'meditation' ? 'active' : ''}`}
              onClick={() => setCurrentView('meditation')}
            >
              <Wind size={18} /> Meditation Trainer
            </div>
            <div
              className={`eeg-nav-item ${currentView === 'stress' ? 'active' : ''}`}
              onClick={() => setCurrentView('stress')}
            >
              <AlertTriangle size={18} /> Stress Monitor
            </div>
            <div
              className={`eeg-nav-item ${currentView === 'fft' ? 'active' : ''}`}
              onClick={() => setCurrentView('fft')}
            >
              <Radio size={18} /> FFT Spectrum
            </div>
            <div
              className={`eeg-nav-item ${currentView === 'bubble' ? 'active' : ''}`}
              onClick={() => setCurrentView('bubble')}
            >
              <Activity size={18} /> Bubble Game
            </div>
            <div
              className={`eeg-nav-item ${currentView === 'monitor' ? 'active' : ''}`}
              onClick={() => setCurrentView('monitor')}
            >
              <Layout size={18} /> Live Analytics
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="eeg-main-content" style={
        (preset.includes("ssvep") || currentView === 'bubble')
          ? { padding: 0, background: preset.includes("ssvep") ? '#000' : 'transparent', overflow: 'hidden', position: 'relative', height: '100%' }
          : { overflowY: 'auto', overflowX: 'hidden' }
      }>
        {preset.includes("ssvep") || currentView === 'bubble' ? (
          renderView()
        ) : (
          <div className="eeg-glass-card">
            {renderView()}
          </div>
        )}
      </div>
    </div>
  );
};

export default EEGDashboard;

