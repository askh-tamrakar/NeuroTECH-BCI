import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Music, Volume2, VolumeX, Pause, Play, Headphones, FastForward, Activity, RotateCcw } from 'lucide-react';
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

  // ── REAL-TIME METRIC DERIVATIONS ──
  const liveMetrics = useMemo(() => {
    const features = result?.features || {};
    const bandMix = result?.band_mix || {};

    // Frequency Gain: alpha relative power (relaxation/focus intensity) as a 0–100% value
    const alphaRel = features.alpha_rel ?? bandMix.alpha ?? null;
    const freqGain = alphaRel !== null ? Math.round(alphaRel * 100) : null;

    // Dominant Wave: pick the highest-powered band
    const bands = {
      Delta: features.delta ?? 0,
      Theta: features.theta ?? 0,
      Alpha: features.alpha ?? 0,
      Beta:  features.beta  ?? 0,
    };
    const dominantWave = Object.entries(bands).reduce(
      (best, [k, v]) => (v > best[1] ? [k, v] : best),
      ['—', -1]
    )[0];

    const state = result?.state || null;

    return { freqGain, dominantWave, state };
  }, [result]);

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

<<<<<<< HEAD
      // REDUCED Line Count for "Cleaner" Look
      const lineCount = 20; 
      const startY = height * 0.9;

      ctx.lineWidth = 0.8;
=======
      // Draw dense mountain lines from back to front
      const lineCount = 40; 
      const stepY = height / (lineCount * 1.8);
      const startY = height * 0.95;

      ctx.lineWidth = 1.0;
>>>>>>> eeg-application-dashboard
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      for (let i = lineCount; i >= 0; i--) {
        const z = i / lineCount;
<<<<<<< HEAD
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

=======
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
>>>>>>> eeg-application-dashboard
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
<<<<<<< HEAD
          zIndex: 5,
=======
          zIndex: 2,
>>>>>>> eeg-application-dashboard
          opacity: 0.9,
          maskImage: 'radial-gradient(ellipse at bottom, black 60%, transparent 95%)'
        }}
      />
<<<<<<< HEAD

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


      {/* ── PARAMETER CLUSTER (Bottom Left) ── */}
      <div className="absolute bottom-40 left-12 z-10">
        <div className="parameter-cluster">

          {/* Frequency Gain — live alpha band power */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Frequency Gain</span>
              <span className="parameter-value" style={{ color: stateTheme.primary }}>
                {liveMetrics.freqGain !== null ? `${liveMetrics.freqGain}%` : '—'}
              </span>
            </div>
            <div className="parameter-progress-bg">
              <div
                className="parameter-progress-fill"
                style={{
                  width: liveMetrics.freqGain !== null ? `${liveMetrics.freqGain}%` : '0%',
                  backgroundColor: stateTheme.primary,
                  boxShadow: `0 0 10px ${stateTheme.primary}44`,
                }}
              />
            </div>
          </div>

          {/* Dominant Wave */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Dominant Wave</span>
              <span className="parameter-value" style={{ color: stateTheme.secondary }}>
                {liveMetrics.dominantWave}
              </span>
            </div>
            <div
              className="text-[8px] tracking-widest uppercase mt-0.5"
              style={{ color: `${stateTheme.secondary}cc` }}
            >
              {liveMetrics.dominantWave !== '—'
                ? `${liveMetrics.dominantWave} wave active`
                : 'Awaiting signal...'}
            </div>
          </div>

          {/* Brain State */}
          <div className="parameter-item">
            <div className="parameter-label-row">
              <span className="parameter-label">Brain State</span>
              <span
                className="parameter-value px-2 py-0.5 rounded-full text-black text-[8px] font-black tracking-widest uppercase"
                style={{
                  backgroundColor: liveMetrics.state ? stateTheme.primary : '#334155',
                  boxShadow: liveMetrics.state ? `0 0 12px ${stateTheme.primary}66` : 'none',
                  color: '#000',
                }}
              >
                {liveMetrics.state || 'No Signal'}
              </span>
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
=======
>>>>>>> eeg-application-dashboard
    </div>
  );
};
export default MusicView;
