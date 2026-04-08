import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Music, Volume2, VolumeX, Pause, Play, Headphones, FastForward, Activity, RotateCcw, AlertTriangle } from 'lucide-react';
import '../../../styles/views/MusicView.css';
import MusicSidebar from '../sidebar/MusicSidebar';
import { useSidebar } from './SidebarContext';
import { musicHandler } from '../../../handlers/MusicHandler';

const FrequencyWaves = ({ stateTheme }) => {
  const barsRef = useRef([]);

  useEffect(() => {
    let animationId;
    const updateWaves = () => {
      const data = musicHandler.getFrequencyData();
      if (data && data.length > 0 && barsRef.current.length > 0) {
        for (let i = 0; i < 8; i++) {
          const bar = barsRef.current[i];
          if (bar) {
            const binIdx = Math.floor((i / 8) * (data.length * 0.6));
            const val = data[binIdx] || 0;
            const height = Math.max(15, (val / 255) * 100);
            bar.style.height = `${height}%`;
          }
        }
      }
      animationId = requestAnimationFrame(updateWaves);
    };
    updateWaves();
    return () => cancelAnimationFrame(animationId);
  }, []);

  const barColors = [
    `${stateTheme.primary}66`,
    `${stateTheme.primary}99`,
    stateTheme.primary,
    stateTheme.secondary,
    stateTheme.primary,
    stateTheme.accent,
    stateTheme.primary,
    `${stateTheme.primary}66`,
  ];

  return (
    <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10 hidden lg:block pointer-events-none">
      <div className="flex items-end gap-1.5 h-12 opacity-40">
        {barColors.map((color, i) => (
          <div
            key={i}
            ref={el => barsRef.current[i] = el}
            className="w-1.5 rounded-full transition-all duration-100"
            style={{ 
              backgroundColor: color, 
              height: '30%',
              boxShadow: `0 0 15px ${color}33`
            }}
          />
        ))}
      </div>
    </div>
  );
};

const MusicView = ({ result, onNavigate }) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [eegMapped, setEegMapped] = useState(true);
  const lastStateRef = useRef(null);

  // Extract output data from result
  const output = result?.output || result || {};
  const currentState = output.state || result?.state || 'Neutral';
  const stateLevel = output.state_level ?? 50;
  const stressScore = output.stress_score ?? 0;
  const focusScore = output.focus_score ?? 0;
  // State-to-Color Mapping for Visuals
  const stateTheme = useMemo(() => {
    switch (currentState) {
      case 'Focus': return { primary: '#0ea5e9', secondary: '#38bdf8', accent: '#7dd3fc', glow: 'rgba(14, 165, 233, 0.5)' };
      case 'Calm': return { primary: '#a855f7', secondary: '#d946ef', accent: '#e879f9', glow: 'rgba(168, 85, 247, 0.5)' };
      case 'Relaxed': return { primary: '#22c55e', secondary: '#4ade80', accent: '#86efac', glow: 'rgba(34, 197, 94, 0.5)' };
      case 'Stressed': return { primary: '#f43f5e', secondary: '#fb7185', accent: '#fda4af', glow: 'rgba(244, 63, 94, 0.5)' };
      case 'Drowsy': return { primary: '#f59e0b', secondary: '#fbbf24', accent: '#fcd34d', glow: 'rgba(245, 158, 11, 0.5)' };
      default: return { primary: '#94a3b8', secondary: '#cbd5e1', accent: '#e2e8f0', glow: 'rgba(148, 163, 184, 0.3)' };
    }
  }, [currentState]);

  // Dominant wave from band_powers
  const dominantWave = useMemo(() => {
    const bp = result?.band_powers;
    if (!bp || bp.length < 5) return '—';
    const labels = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
    let maxIdx = 0;
    for (let i = 1; i < 5; i++) { if (bp[i] > bp[maxIdx]) maxIdx = i; }
    return labels[maxIdx];
  }, [result?.band_powers]);

  const { setSidebarSlot } = useSidebar();

  useEffect(() => {
    if (result && result.eeg_mapped !== undefined) setEegMapped(result.eeg_mapped);
  }, [result]);

  const togglePlayback = async () => {
    if (!isPlaying) {
      await musicHandler.resume();
      await musicHandler.playStateTrack(currentState, stateLevel);
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
        stressScore={stressScore}
        focusScore={focusScore}
        currentState={currentState}
        stateLevel={stateLevel}
      />
    );
    return () => setSidebarSlot(null);
  }, [isPlaying, isMuted, result, stateTheme, stressScore, focusScore, currentState, stateLevel, setSidebarSlot]);

  // Init handler
  useEffect(() => {
    const loadAndInit = async () => {
      await musicHandler.init();
    };
    loadAndInit();

    return () => {
      musicHandler.stop();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  // State change → switch track from state folder
  useEffect(() => {
    if (!isPlaying || !currentState) return;
    if (currentState !== lastStateRef.current) {
      lastStateRef.current = currentState;
      musicHandler.playStateTrack(currentState, stateLevel);
    } else {
      // Same state, just adjust volume based on level
      musicHandler.setStateVolume(stateLevel);
    }
  }, [currentState, stateLevel, isPlaying]);

  // Apply DSP effects for state
  useEffect(() => {
    if (currentState) {
      musicHandler.applyStateEffect(currentState);
    }
  }, [currentState]);

  useEffect(() => {
    if (musicHandler.gainNode && musicHandler.ctx) {
      musicHandler.gainNode.gain.setTargetAtTime(isMuted ? 0 : stateLevel / 100, musicHandler.ctx.currentTime, 0.2);
    }
  }, [isMuted, stateLevel]);

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

      // REDUCED Line Count for "Cleaner" Look
      const lineCount = 20; 
      const startY = height * 0.9;

      ctx.lineWidth = 0.8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = lineCount; i >= 0; i--) {
        const z = i / lineCount;
        const yBase = startY - (z * height * 0.5);
        const alpha = (1 - z) * 0.6;
        
        ctx.strokeStyle = `rgba(0, 229, 255, ${alpha})`;
        ctx.fillStyle = `rgba(5, 15, 20, ${alpha * 0.5})`; 
        
        ctx.beginPath();
        const segmentCount = 50;
        const segmentWidth = width / segmentCount;

        for (let j = 0; j <= segmentCount; j++) {
          const x = j * segmentWidth;
          const binIdx = Math.floor((j / segmentCount) * (freqData.length * 0.3));
          const val = freqData[binIdx] || 0;
          
          // Smoother, less erratic peaks
          const audioPeak = (val / 255) * 80 * (1 - z);
          const noise = Math.sin(j * 0.1 + (offset * (0.8 + z)) + (i * 0.4)) * 15 * (1 - z);
          
          const y = yBase - audioPeak - noise;

          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
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
          zIndex: 5,
          opacity: 0.9,
          maskImage: 'radial-gradient(ellipse at bottom, black 60%, transparent 95%)'
        }}
      />

      {/* ── BACKGROUND REFINEMENTS FROM PREVIEW ── */}
      <div className="absolute inset-0 z-0 opacity-40">
        <img 
          alt="neon wireframe landscape" 
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuBRzTWxdbmQm_2SDM4jYV1nKfQE1YgCMX5zAKU4SzZqnhIH2nmfAyoiNGkL_ZEZupPX2OZfhGoslGa23Ull1cjPSZvkxkxaXCEIXLKa9ftnnNfsqgXwknUwWQfuyJhMsyxlKgDCO88S0XLcwYXlWvrhYtvHMDjvspoXG46LPAr-ZiaG8y4I_mmKqi0rWAsWPCvZitvtt9cEnKFwUlU9wDFSs1l8QB7aiubp3OHC3L3n4iHqEXSj-XzbhSHtZWIVCJbx6GAZPlhLENk" 
          className="w-full h-full object-cover mix-blend-screen"
        />
        <div 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] transition-colors duration-1000" 
          style={{ backgroundColor: `${stateTheme.primary}22` }}
        />
      </div>


      {/* ── EEG WARNING BANNER ── */}
      {!eegMapped && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 backdrop-blur-md">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-xs font-bold text-amber-300 tracking-wider">Please map an EEG sensor in Settings for accurate data</span>
        </div>
      )}

      {/* ── PARAMETER CLUSTER (Bottom Left) ── */}
      <div className="absolute bottom-40 left-12 z-10">
        <div className="parameter-cluster">

          {/* Focus Score */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Focus</span>
              <span className="parameter-value" style={{ color: '#0ea5e9' }}>
                {Math.round(focusScore)}%
              </span>
            </div>
            <div className="parameter-progress-bg">
              <div
                className="parameter-progress-fill"
                style={{
                  width: `${Math.min(100, focusScore)}%`,
                  backgroundColor: '#0ea5e9',
                  boxShadow: '0 0 10px rgba(14,165,233,0.4)',
                }}
              />
            </div>
          </div>

          {/* Stress Score */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Stress</span>
              <span className="parameter-value" style={{ color: '#f43f5e' }}>
                {Math.round(stressScore)}%
              </span>
            </div>
            <div className="parameter-progress-bg">
              <div
                className="parameter-progress-fill"
                style={{
                  width: `${Math.min(100, stressScore)}%`,
                  backgroundColor: '#f43f5e',
                  boxShadow: '0 0 10px rgba(244,63,94,0.4)',
                }}
              />
            </div>
          </div>

          {/* Dominant Wave */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Dominant Wave</span>
              <span className="parameter-value" style={{ color: stateTheme.secondary }}>
                {dominantWave}
              </span>
            </div>
          </div>

          {/* Brain State */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Brain State</span>
              <span
                className="parameter-value px-2 py-0.5 rounded-full text-black text-[8px] font-black tracking-widest uppercase"
                style={{
                  backgroundColor: stateTheme.primary,
                  boxShadow: `0 0 12px ${stateTheme.primary}66`,
                  color: '#000',
                }}
              >
                {currentState}
              </span>
            </div>
            <div className="text-[8px] tracking-widest uppercase mt-0.5" style={{ color: `${stateTheme.secondary}cc` }}>
              Level: {stateLevel}%
            </div>
          </div>

        </div>
      </div>

      {/* ── FREQUENCY WAVE BARS (Frozen & Centered) ── */}
      <FrequencyWaves stateTheme={stateTheme} />

      {/* ── MINI CONTROL PANEL (Bottom Center — Absolute) ── */}
      <div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-12 items-center z-50"
        style={{
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '9999px',
          padding: '1.2rem 3.5rem',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 0 50px rgba(0,0,0,0.5)',
        }}
      >
        <button
          onClick={() => {
            musicHandler.stop();
            musicHandler.play();
          }}
          className="flex flex-col items-center gap-1.5 text-white/60 hover:scale-110 hover:text-white transition-all active:scale-90"
        >
          <RotateCcw size={22} />
          <span className="font-bold text-[8px] tracking-[0.2em] uppercase opacity-60">Restart</span>
        </button>

        <button
          onClick={togglePlayback}
          className="w-16 h-16 flex items-center justify-center rounded-full text-black shadow-lg transition-all hover:scale-105 active:scale-95"
          style={{
            background: `linear-gradient(135deg, ${stateTheme.primary}, ${stateTheme.secondary})`,
            boxShadow: `0 0 30px ${stateTheme.primary}55`,
          }}
        >
          {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
        </button>

        <button className="flex flex-col items-center gap-1.5 text-white/60 hover:scale-110 hover:text-white transition-all active:scale-90">
          <FastForward size={22} />
          <span className="font-bold text-[8px] tracking-[0.2em] uppercase opacity-60">Next Mode</span>
        </button>
      </div>
    </div>
  );
};
export default MusicView;