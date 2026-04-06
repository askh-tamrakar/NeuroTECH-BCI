import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Music, Volume2, VolumeX, Pause, Play, Headphones, FastForward, Activity } from 'lucide-react';
import '../../styles/views/MusicView.css';
import MusicSidebar from './sidebar/MusicSidebar';
import { useSidebar } from './SidebarContext';
import { musicHandler } from '../../handlers/MusicHandler';

const MusicView = ({ result, onNavigate }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // State-to-Color Mapping for Visuals
  const stateTheme = useMemo(() => {
    const s = result?.state || 'Neutral';
    switch (s) {
      case 'Focus': return { primary: '#0ea5e9', secondary: '#38bdf8', accent: '#7dd3fc', glow: 'rgba(14, 165, 233, 0.5)' };
      case 'Calm': return { primary: '#a855f7', secondary: '#d946ef', accent: '#e879f9', glow: 'rgba(168, 85, 247, 0.5)' };
      case 'Relax': return { primary: '#22c55e', secondary: '#4ade80', accent: '#86efac', glow: 'rgba(34, 197, 94, 0.5)' };
      case 'Stress': return { primary: '#f43f5e', secondary: '#fb7185', accent: '#fda4af', glow: 'rgba(244, 63, 94, 0.5)' };
      case 'Drowsy': return { primary: '#f59e0b', secondary: '#fbbf24', accent: '#fcd34d', glow: 'rgba(245, 158, 11, 0.5)' };
      default: return { primary: '#94a3b8', secondary: '#cbd5e1', accent: '#e2e8f0', glow: 'rgba(148, 163, 184, 0.3)' };
    }
  }, [result?.state]);

  const { setSidebarSlot } = useSidebar();

  const togglePlayback = async () => {
    if (!isPlaying) {
      await musicHandler.resume();
      musicHandler.play();
    } else {
      musicHandler.stop();
    }
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    setSidebarSlot(
      <MusicSidebar
        isPlaying={isPlaying}
        togglePlayback={togglePlayback}
        isMuted={isMuted}
        setIsMuted={setIsMuted}
        result={result}
        stateTheme={stateTheme}
      />
    );
    return () => setSidebarSlot(null);
  }, [isPlaying, isMuted, result, stateTheme, setSidebarSlot]);

  // Track initialization
  useEffect(() => {
    const loadAndInit = async () => {
      await musicHandler.init();
      // Using the specific file found in the project
      await musicHandler.loadTrack('/data/audio/Fed_Up_Slowed__Reverb_-_Ghostemane_1772539057.mp3');
    };
    loadAndInit();

    return () => {
      musicHandler.stop();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // State Response
  useEffect(() => {
    if (result?.state) {
      musicHandler.applyStateEffect(result.state);
    }
  }, [result?.state]);

  useEffect(() => {
    if (musicHandler.audioElement) {
      musicHandler.audioElement.muted = isMuted;
    }
  }, [isMuted]);

  // Visualizer Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const render = () => {
      const freqData = musicHandler.getFrequencyData();
      const width = canvas.width;
      const height = canvas.height;
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) * 0.25;

      ctx.clearRect(0, 0, width, height);

      // Background Pulse
      const avgFreq = freqData.length > 0 ? freqData.reduce((a, b) => a + b, 0) / freqData.length : 0;
      const pulseScale = 1 + (avgFreq / 512);

      const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius * 2);
      gradient.addColorStop(0, 'transparent');
      gradient.addColorStop(0.5, `${stateTheme.primary}10`);
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * pulseScale * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Audio Particles / Bars
      const barCount = 64;
      for (let i = 0; i < barCount; i++) {
        const angle = (i / barCount) * Math.PI * 2;
        const val = freqData[i % freqData.length] || 0;
        const barHeight = (val / 255) * radius * 0.8;

        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.strokeStyle = i % 2 === 0 ? stateTheme.primary : stateTheme.secondary;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Add a small glow at the tip
        ctx.fillStyle = stateTheme.accent;
        ctx.beginPath();
        ctx.arc(x2, y2, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Center Disk
      ctx.shadowBlur = 20;
      ctx.shadowColor = stateTheme.glow;
      ctx.fillStyle = stateTheme.primary;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [stateTheme]);

  return (
    <div className="w-full h-full flex bg-[var(--bg)] overflow-hidden relative select-none">

      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-grow flex flex-col items-center justify-center relative transition-all duration-300">

        <div className="eeg-view-header">
          <div className="eeg-view-icon" style={{ background: `${stateTheme.primary}20`, borderColor: stateTheme.primary }}>
            <Music size={24} color={stateTheme.primary} />
          </div>
          <h2 className="eeg-view-title" style={{ backgroundImage: `linear-gradient(135deg, ${stateTheme.primary}, ${stateTheme.secondary})` }}>
            Neural Audio Synergy
          </h2>
        </div>

        <div className="eeg-status-box" style={{ borderColor: `${stateTheme.primary}40`, background: 'rgba(0,0,0,0.4)', position: 'relative', overflow: 'hidden', width: 'min(90%, 800px)', height: 'min(70vh, 500px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

          <canvas
            ref={canvasRef}
            width={600}
            height={400}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.8 }}
          />

          <div style={{ zIndex: 10, textAlign: 'center' }}>
            <h3 style={{ color: stateTheme.accent, fontSize: '1rem', textTransform: 'uppercase', letterSpacing: '4px', margin: '0 0 10px', opacity: 0.8 }}>
              Detected Resonance
            </h3>
            <div className="eeg-score-display pulse-glow" style={{ color: '#fff', textShadow: `0 0 20px ${stateTheme.glow}`, margin: '10px 0' }}>
              {result?.state || 'Awaiting Signal...'}
            </div>

            <div className="eeg-progress-track" style={{ maxWidth: '240px', margin: '10px auto 40px', background: 'rgba(255,255,255,0.05)' }}>
              <div className="eeg-progress-fill pulse-glow" style={{ width: result ? '100%' : '0%', background: `linear-gradient(90deg, ${stateTheme.primary}, ${stateTheme.secondary})` }}></div>
            </div>

            <div className="eeg-meta-text" style={{
              display: 'inline-flex', alignItems: 'center', gap: '12px',
              color: '#fff', background: 'rgba(255,255,255,0.05)',
              padding: '12px 24px', borderRadius: '100px',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(10px)'
            }}>
              {result?.action?.includes('tempo') ? <FastForward size={20} color={stateTheme.secondary} /> :
                result?.action?.includes('volume') ? <Activity size={20} color={stateTheme.primary} /> : <Headphones size={20} color={stateTheme.accent} />}
              <span style={{ fontSize: '0.9rem', letterSpacing: '1px', fontWeight: 500 }}>
                {result?.action || 'Monitoring Auditory Cortex...'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MusicView;
