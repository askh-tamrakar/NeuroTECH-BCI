import React from 'react';

const DURATIONS = [5, 10, 15, 30, 45, 60];

const CARD_STYLE = {
  background: '#222225',
  border: '1px solid #2d2d30',
  borderRadius: '8px',
  padding: '24px 16px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  width: '100%',
  boxSizing: 'border-box',
};

const formatTimer = (seconds) => {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export default function MedLabSidebar({
  deviceConnected,
  setDeviceConnected,
  meditationState,
  setMeditationState,
  selectedDuration,
  setSelectedDuration,
  timerRemaining,
  startMeditation,
  stopMeditation,
  wisdomQuote,
  onBackToMenu,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box', overflowY: 'auto', gap: '16px' }}>
      
      {/* PANEL 1: Device Connection Status */}
      <div style={{ ...CARD_STYLE, flexShrink: 0 }}>
        {/* 3D Cube Icon */}
        <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '120px' }}>
          <svg 
            style={{ width: '48px', height: '48px', color: 'var(--primary, #facc15)' }}
            viewBox="0 0 48 48" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <polygon points="24,4 44,14 44,34 24,44 4,34 4,14" stroke="currentColor" strokeWidth="1.4" fill="rgba(255,255,255,0.03)" />
            <polyline points="24,4 24,24 4,14"   stroke="currentColor" strokeWidth="0.8" opacity="0.6" fill="none" />
            <polyline points="24,24 44,14"        stroke="currentColor" strokeWidth="0.8" opacity="0.6" fill="none" />
            <polyline points="24,24 24,44"        stroke="currentColor" strokeWidth="0.8" opacity="0.6" fill="none" />
          </svg>
        </div>
        <button
          onClick={() => setDeviceConnected(!deviceConnected)}
          style={{
            width: '140px',
            padding: '8px 0',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--primary, #facc15)',
            color: '#1a1a1a',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'opacity 0.15s',
            marginTop: 'auto'
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          {deviceConnected ? 'Disconnect' : 'Connect'}
        </button>
      </div>

      {/* PANEL 2: Meditation Session Controls */}
      <div style={{ ...CARD_STYLE, flexShrink: 0 }}>
        {meditationState === 'configuring' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'var(--primary, #facc15)', fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Meditation</div>
            <div style={{ color: '#a1a1aa', fontSize: '13px', marginBottom: '8px' }}>Select Meditation Duration</div>
            
            {/* 2x3 Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', width: '100%', marginBottom: '24px' }}>
              {DURATIONS.map(d => {
                const active = selectedDuration === d;
                return (
                  <button
                    key={d}
                    onClick={() => setSelectedDuration(d)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '12px 4px',
                      borderRadius: '8px',
                      border: active ? '1px solid rgba(250, 204, 21, 0.5)' : '1px solid #2d2d30',
                      background: active ? 'rgba(250, 204, 21, 0.1)' : '#2a2a2d',
                      color: active ? 'var(--primary, #facc15)' : '#a1a1aa',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: '18px', fontWeight: 700, lineHeight: 1 }}>{d}</span>
                    <span style={{ fontSize: '12px', marginTop: '2px', opacity: 0.8 }}>min</span>
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={startMeditation}
              style={{
                width: '140px',
                padding: '8px 0',
                borderRadius: '6px',
                border: 'none',
                background: selectedDuration ? 'var(--primary, #facc15)' : 'rgba(250, 204, 21, 0.3)',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: 700,
                cursor: selectedDuration ? 'pointer' : 'default',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { if (selectedDuration) e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { if (selectedDuration) e.currentTarget.style.opacity = '1'; }}
            >
              Begin Session
            </button>
          </div>
        )}

        {meditationState === 'active' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'var(--primary, #facc15)', fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Meditation</div>
            <div style={{ color: 'var(--primary, #facc15)', fontSize: '13px', fontWeight: 700, animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite', marginBottom: '16px' }}>Session Live</div>
            
            <div style={{ color: '#fff', fontSize: '36px', fontFamily: 'monospace', fontWeight: 700, margin: '16px 0 32px' }}>
              {formatTimer(timerRemaining)}
            </div>
            
            <button
              onClick={stopMeditation}
              style={{
                width: '140px',
                padding: '8px 0',
                borderRadius: '6px',
                border: '1px solid #f87171',
                background: 'transparent',
                color: '#f87171',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#f87171';
                e.currentTarget.style.color = '#1a1a1a';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = '#f87171';
              }}
            >
              End Session
            </button>
          </div>
        )}

        {meditationState === 'complete' && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ color: 'var(--primary, #facc15)', fontSize: '18px', fontWeight: 700, marginBottom: '24px' }}>Meditation</div>
            <div style={{ color: '#fff', fontSize: '16px', fontWeight: 700, marginBottom: '32px' }}>Session Complete</div>
            
            <button
              onClick={() => setMeditationState('configuring')}
              style={{
                width: '140px',
                padding: '8px 0',
                borderRadius: '6px',
                border: 'none',
                background: 'var(--primary, #facc15)',
                color: '#1a1a1a',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              Start New Session
            </button>
          </div>
        )}
      </div>

      {/* PANEL 3: Daily Wisdom */}
      <div style={{ ...CARD_STYLE, flexGrow: 1 }}>
        <div style={{ color: 'var(--primary, #facc15)', fontSize: '20px', fontWeight: 700, margin: '0 0 32px 0' }}>Daily Wisdom</div>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '18px', lineHeight: 1.5, margin: '0 0 32px 0', padding: '0 8px' }}>
          {wisdomQuote ? wisdomQuote.quote : 'You can’t hustle through a broken system—especially your own.'}
        </p>
        <div style={{ color: 'var(--primary, #facc15)', fontSize: '16px', fontWeight: 700, marginTop: 'auto' }}>
          — {wisdomQuote ? wisdomQuote.author : 'Ritika Mishra'}
        </div>
      </div>

    </div>
  );
}
