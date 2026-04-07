import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Music, Volume2, VolumeX, Pause, Play, Headphones, FastForward, Activity } from 'lucide-react';
import '../../../styles/views/MusicView.css';
import MusicSidebar from '../sidebar/MusicSidebar';
import { useSidebar } from './SidebarContext';
import { musicHandler } from '../../../handlers/MusicHandler';

const MusicView = ({ result, onNavigate }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

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

  const { setSidebarSlot, setSidebarMiniSlot } = useSidebar();

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
    setSidebarMiniSlot(
      <div className="flex h-full w-full flex-col items-center gap-3 px-2 py-3 [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
        <div className="mt-12 flex flex-col items-center gap-2">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--primary)]/35 bg-[var(--primary)]/10 text-[var(--primary)]"
            title={result?.state || 'Music'}
          >
            <Music size={18} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[2px] text-[var(--primary)] [writing-mode:vertical-rl] rotate-180">
            Music
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--primary)]/20 bg-[var(--bg)]/60 px-1.5 py-2 shadow-[0_0_12px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={togglePlayback}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--primary)]/35 bg-[var(--bg)] text-[var(--primary)]"
            title={isPlaying ? 'Pause playback' : 'Start playback'}
          >
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setIsMuted(!isMuted)}
            className={`flex h-11 w-11 items-center justify-center rounded-xl border ${isMuted ? 'border-red-500/35 text-red-400 bg-red-500/10' : 'border-[var(--border)] text-[var(--text)] bg-[var(--bg)]'}`}
            title={isMuted ? 'Unmute output' : 'Mute output'}
          >
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        <div className="flex w-full flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 px-1.5 py-2 text-center">
          <span className="text-[8px] font-black uppercase tracking-[2px] text-[var(--muted)]">State</span>
          <div
            className="w-full rounded-xl border border-[var(--primary)]/20 px-1 py-2 text-[8px] font-black uppercase tracking-[1.5px]"
            style={{ color: stateTheme.primary, boxShadow: `inset 0 0 10px ${stateTheme.glow}` }}
            title={result?.state || 'Awaiting neural state'}
          >
            {(result?.state || 'Idle').slice(0, 8)}
          </div>
          <div className="flex w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-1 py-2 text-[8px] font-black uppercase tracking-[1.5px] text-[var(--muted)]">
            {result?.action?.includes('tempo') ? <FastForward size={12} className="mr-1 text-[var(--primary)]" /> :
              result?.action?.includes('volume') ? <Activity size={12} className="mr-1 text-[var(--primary)]" /> :
                <Headphones size={12} className="mr-1 text-[var(--primary)]" />}
            {(result?.action || 'Monitor').slice(0, 8)}
          </div>
        </div>
      </div>
    );
    return () => {
      setSidebarSlot(null);
      setSidebarMiniSlot(null);
    };
  }, [isPlaying, isMuted, result, stateTheme, setSidebarSlot, setSidebarMiniSlot]);

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

  // Visualizer Loop (Terrain Mesh Waves)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let offset = 0;

    const render = () => {
      const freqData = musicHandler.getFrequencyData();
      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // Draw dense mountain lines from back to front
      const lineCount = 40; 
      const stepY = height / (lineCount * 1.8);
      const startY = height * 0.95;

      ctx.lineWidth = 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = lineCount; i >= 0; i--) {
        const z = i / lineCount;
        const yBase = startY - (z * height * 0.6);
        const alpha = (1 - z) * 0.8;
        
        ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
        // Create a fill for the mountain face
        ctx.fillStyle = `rgba(10, 26, 31, ${alpha * 0.8})`; 
        
        ctx.beginPath();

        const segmentCount = 60;
        const segmentWidth = width / segmentCount;

        for (let j = 0; j <= segmentCount; j++) {
          const x = j * segmentWidth;
          
          // Audio influence
          const binIdx = Math.floor((j / segmentCount) * (freqData.length * 0.4));
          const val = freqData[binIdx] || 0;
          
          // Complex Wave: Frequency + Multi-frequency Sine + Offset
          const audioPeak = (val / 255) * 120 * (1 - z);
          const noise = Math.sin(j * 0.15 + (offset * (1 + z)) + (i * 0.5)) * 25 * (1 - z);
          const noise2 = Math.cos(j * 0.05 - (offset * 0.5)) * 10 * (1 - z);
          
          const y = yBase - audioPeak - noise - noise2;

          if (j === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        // Close the path to fill the mountain floor
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }

      offset += 0.015;
      animationRef.current = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationRef.current);
  }, [stateTheme]);

  return (
    <div className="music-view-container select-none">
      {/* ── BACKGROUND ELEMENTS ── */}
      <div className="music-halo-arc" />
      <div className="music-mesh-surface" />

      {/* ── REAL-TIME CANVAS VISUALIZER (MOUNTAIN MESH) ── */}
      <canvas
        ref={canvasRef}
        width={1600}
        height={1000}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 2,
          opacity: 0.9,
          maskImage: 'radial-gradient(ellipse at bottom, black 60%, transparent 95%)'
        }}
      />
    </div>
  );
};
export default MusicView;
