import React from 'react';
import { Wind, Heart } from 'lucide-react';

const MeditationView = ({ result }) => {
  return (
    <div className="eeg-view-container" style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div className="eeg-view-header">
        <div className="eeg-view-icon"><Wind size={24} color="#10b981" /></div>
        <h2 className="eeg-view-title" style={{backgroundImage: 'linear-gradient(135deg, #10b981, #34d399)'}}>Meditation Trainer</h2>
      </div>

      {result ? (
        <div className="eeg-status-box" style={{borderColor: 'rgba(16, 185, 129, 0.2)'}}>
          <h3 style={{color: '#10b981', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', margin: 0}}>Calmness Score</h3>
          <div className="eeg-score-display pulse-glow" style={{color: '#34d399'}}>
            {result.meditation_score}<span style={{fontSize: '2rem', opacity: 0.5}}>/100</span>
          </div>
          
          <div className="eeg-progress-track" style={{height: '12px', borderRadius: '6px', background: 'rgba(16,185,129,0.1)'}}>
             <div className="eeg-progress-fill pulse-glow" style={{width: `${result.calmness_meter}%`, background: 'linear-gradient(90deg, #10b981, #34d399)', borderRadius: '6px'}}></div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '40px', background: 'rgba(255,255,255,0.03)', padding: '24px', borderRadius: '20px', border: '1px solid rgba(255,255,255,0.05)', width: '100%', maxWidth: '400px'}}>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={{color: '#aaa', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px'}}>Current State</span>
              <span style={{color: '#fff', fontWeight: 'bold'}}>{result.relaxation_trend}</span>
            </div>
            <div style={{height: '1px', background: 'rgba(255,255,255,0.05)', width: '100%'}}></div>
            <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
              <span style={{color: '#aaa', textTransform: 'uppercase', fontSize: '0.8rem', letterSpacing: '1px'}}>Guide</span>
              <span style={{color: '#34d399', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px'}}>
                <Wind size={14}/> {result.breathing_guide}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="waiting-container">
          <div className="loader-circle" style={{borderTopColor: '#10b981'}}></div>
          <p>Measuring Alpha & Theta Waves...</p>
        </div>
      )}
    </div>
  );
};
export default MeditationView;
