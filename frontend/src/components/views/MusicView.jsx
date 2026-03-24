import React from 'react';
import { Music, VolumeX, FastForward, Headphones } from 'lucide-react';

const MusicView = ({ result }) => {
  return (
    <div className="eeg-view-container" style={{display: 'flex', flexDirection: 'column', height: '100%'}}>
      <div className="eeg-view-header">
        <div className="eeg-view-icon"><Music size={24} color="#a855f7" /></div>
        <h2 className="eeg-view-title" style={{backgroundImage: 'linear-gradient(135deg, #a855f7, #ec4899)'}}>Music Control</h2>
      </div>

      {result && result.action ? (
        <div className="eeg-status-box" style={{borderColor: 'rgba(168, 85, 247, 0.2)'}}>
          <h3 style={{color: '#a855f7', fontSize: '1.2rem', textTransform: 'uppercase', letterSpacing: '2px', margin: 0}}>Detected State</h3>
          <div className="eeg-score-display pulse-glow" style={{color: '#ec4899'}}>{result.state}</div>
          
          <div className="eeg-progress-track" style={{maxWidth: '300px', margin: '0 auto 30px'}}>
             <div className="eeg-progress-fill pulse-glow" style={{width: '100%', background: 'linear-gradient(90deg, #a855f7, #ec4899)'}}></div>
          </div>

          <div className="eeg-meta-text" style={{display: 'flex', alignItems: 'center', gap: '10px', color: '#fff', background: 'rgba(255,255,255,0.05)', padding: '16px 32px', borderRadius: '100px', border: '1px solid rgba(255,255,255,0.1)'}}>
            {result.action.includes('tempo') ? <FastForward size={20} color="#ec4899"/> : 
             result.action.includes('volume') ? <VolumeX size={20} color="#a855f7"/> : <Headphones size={20} color="#ec4899"/>}
            {result.action}
          </div>
        </div>
      ) : (
        <div className="waiting-container">
          <div className="loader-circle" style={{borderTopColor: '#a855f7'}}></div>
          <p>Analyzing Auditory Networks...</p>
        </div>
      )}
    </div>
  );
};
export default MusicView;
