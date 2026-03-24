import React from 'react';
import { AlertTriangle, ShieldAlert, HeartPulse, Activity } from 'lucide-react';

const StressView = ({ result }) => {
  const getSeverityColor = (score) => {
    if (score > 75) return '#ef4444'; // Red
    if (score > 50) return '#f97316'; // Orange
    return '#8b5cf6'; // Purple / Calm
  };

  return (
    <div className="eeg-view-container" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="eeg-view-header">
        <div className="eeg-view-icon"><Activity size={24} color="#f97316" /></div>
        <h2 className="eeg-view-title" style={{ backgroundImage: 'linear-gradient(135deg, #f97316, #ef4444)' }}>Stress Monitor</h2>
      </div>

      {result ? (
        <div className="eeg-status-box" style={{ borderColor: `rgba(${result.stress_score > 50 ? '239,68,68' : '139,92,246'}, 0.2)` }}>
          <h3 style={{ color: getSeverityColor(result.stress_score), fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', margin: 0 }}>Cognitive Load</h3>

          <div className="eeg-score-display pulse-glow" style={{ color: getSeverityColor(result.stress_score) }}>
            {result.stress_score}<span style={{ fontSize: '2rem', opacity: 0.5 }}>/100</span>
          </div>

          <div className="eeg-progress-track">
            <div className="eeg-progress-fill" style={{ width: `${result.stress_score}%`, background: getSeverityColor(result.stress_score) }}></div>
          </div>

          <div style={{ marginTop: '30px', color: '#fff', fontSize: '1.2rem' }}>
            <span style={{ opacity: 0.7 }}>State: </span>
            <strong style={{ color: getSeverityColor(result.stress_score) }}>{result.calm_vs_stress_state}</strong>
          </div>

          {result.break_recommendation ? (
            <div className="pulse-glow" style={{ marginTop: '30px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239,68,68,0.3)', padding: '20px', borderRadius: '16px', color: '#ef4444' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '1.2rem', fontWeight: 'bold', marginBottom: '10px' }}>
                <ShieldAlert size={24} /> High Stress Detected
              </div>
              <p style={{ margin: 0, opacity: 0.9 }}>{result.breathing_suggestion}</p>
            </div>
          ) : (
            <div style={{ marginTop: '30px', background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255,255,255,0.05)', padding: '20px', borderRadius: '16px', color: '#aaa' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', fontSize: '1.1rem', marginBottom: '10px' }}>
                <HeartPulse size={20} color="#8b5cf6" /> System Normal
              </div>
              <p style={{ margin: 0, opacity: 0.8 }}>{result.breathing_suggestion}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="waiting-container">
          <div className="loader-circle" style={{ borderTopColor: '#f97316' }}></div>
          <p>Processing High-Frequency Bands...</p>
        </div>
      )}
    </div>
  );
};

export default StressView;
