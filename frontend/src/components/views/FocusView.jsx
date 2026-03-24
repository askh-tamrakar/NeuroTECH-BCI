import React from 'react';
import { Brain, Activity, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';

const FocusView = ({ result }) => {
  const getGlowColor = (indicator) => {
    switch(indicator) {
      case 'green': return '#22c55e';
      case 'yellow': return '#eab308';
      case 'red': return '#ef4444';
      default: return '#3b82f6';
    }
  };

  return (
    <div className="eeg-view-container" style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div className="eeg-view-header">
        <div className="eeg-view-icon"><Brain size={24} color="#3b82f6" /></div>
        <h2 className="eeg-view-title" style={{backgroundImage: 'linear-gradient(135deg, #3b82f6, #06b6d4)'}}>Focus Monitor</h2>
      </div>

      {result ? (
        <div className="eeg-status-box" style={{borderColor: `rgba(59, 130, 246, 0.2)`}}>
          <h3 style={{color: '#3b82f6', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', margin: 0}}>Concentration Level</h3>
          
          <div className="eeg-score-display pulse-glow" style={{color: getGlowColor(result.neurofeedback_indicator)}}>
            {result.focus_score}<span style={{fontSize: '2rem', opacity: 0.5}}>/100</span>
          </div>

          <div className="eeg-progress-track">
            <div className="eeg-progress-fill" style={{width: `${result.focus_score}%`, background: getGlowColor(result.neurofeedback_indicator)}}></div>
          </div>

          <div style={{display: 'flex', gap: '30px', margin: '30px auto 0', padding: '16px 32px', background: 'rgba(255,255,255,0.03)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)'}}>
            <div className="eeg-meta-text" style={{display: 'flex', alignItems: 'center', gap: '8px', margin: 0}}>
               {result.focus_trend === 'Increasing' ? <TrendingUp color="#22c55e" size={20}/> : 
                result.focus_trend === 'Decreasing' ? <TrendingDown color="#ef4444" size={20}/> : 
                <Activity color="#64748b" size={20}/>}
               {result.focus_trend}
            </div>
          </div>

          {result.attention_drop_detection && (
            <div className="pulse-glow" style={{marginTop: '20px', padding: '12px 24px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', borderRadius: '100px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold'}}>
              <AlertTriangle size={20} /> Attention Drop Detected
            </div>
          )}
        </div>
      ) : (
        <div className="waiting-container">
          <div className="loader-circle" style={{borderTopColor: '#3b82f6'}}></div>
          <p>Calibrating Attention Metrics...</p>
        </div>
      )}
    </div>
  );
};
export default FocusView;
