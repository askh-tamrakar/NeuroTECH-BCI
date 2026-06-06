import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { Play, Wind, Power, Zap, Volume2, AlertTriangle, Brain, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from 'recharts';

const STATE_EMOJIS = {
  Calm: '🧘',
  Relaxed: '🌿',
  Focus: '🎯',
  Stressed: '⚡',
  Drowsy: '💤',
  Neutral: '⏳'
};
import FFTWorker from '../../../workers/fft.worker.js?worker';
import '../../../styles/views/MeditationView.css';
import MeditationSidebar from '../sidebar/MeditationSidebar';
import { useSidebar } from './SidebarContext';

/* â”€â”€ REAL SOUNDSCAPE TRACKS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const TRACKS = [
  { id: 'stress_melt', label: 'Singing Bowl Waves', file: '/Resources/audio/meditation/meditativetiger-stress-melt-gentle-singing-bowl-waves-489168.mp3', category: 'meditation' },
  { id: 'nature_calm', label: 'Nature Calm', file: '/Resources/audio/meditation/andriig-nature-calm-music-507173.mp3', category: 'meditation' },
  { id: 'soft_calm', label: 'Soft Calm Background', file: '/Resources/audio/meditation/krasnoshchok-background-music-soft-calm-404429.mp3', category: 'meditation' },
  { id: 'xylophone', label: 'Xylophone & Forest', file: '/Resources/audio/eeg_soundtrack/calm/mandakimdk-xylophone-and-forest-307174.mp3', category: 'focus' },
  { id: 'dark_ambient', label: 'Dark Desolation', file: '/Resources/audio/eeg_soundtrack/stress/aberrantrealities-dark-desolation-ambience-219091.mp3', category: 'focus' },
  { id: 'funk_rock', label: 'Funk Rock', file: '/Resources/audio/eeg_soundtrack/focus/kandlaker-funk-rock-2-226325.mp3', category: 'focus' },
  { id: 'countdown', label: 'Countdown', file: '/Resources/audio/eeg_soundtrack/focus/kaden_cook-countdown-219722.mp3', category: 'focus' },
];

/* ── DAILY WISDOM QUOTES ───────────────────────── */
const WISDOM = [
  { quote: 'Wherever you are, be there totally.', author: '— Eckhart Tolle' },
  { quote: 'The present moment is the only moment available to us, and it is the door to all moments.', author: '— Thich Nhat Hanh' },
  { quote: 'Meditation is not evasion; it is a serene encounter with reality.', author: '— Thich Nhat Hanh' },
  { quote: 'The quieter you become, the more you are able to hear.', author: '— Rumi' },
  { quote: 'Your goal is not to battle with the mind, but to witness the mind.', author: '— Swami Muktananda' },
  { quote: 'Within you, there is a stillness and a sanctuary.', author: '— Hermann Hesse' },
  { quote: 'Peace comes from within. Do not seek it without.', author: '— Buddha' },
];

/* ── BREATH CYCLE: 4-7-8 ───────────────────────── */
const PHASES = [
  { name: 'INHALE', dur: 4 },
  { name: 'HOLD', dur: 7 },
  { name: 'EXHALE', dur: 8 },
  { name: 'REST', dur: 1 },
];
const TOTAL_CYCLE = PHASES.reduce((s, p) => s + p.dur, 0);

/* â”€â”€ PRESETS (minutes) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const PRESETS = [3, 5, 10, 15];

/* ═══════════════════════════════════════════
   GRID LINES — CortEX High Fidelity Grid Lines
   ═══════════════════════════════════════════ */
const GridLines = React.memo(({ gridNumberY = 50, numGridLinesX = 205 }) => {
  const linesX = [];
  for (let j = 1; j < numGridLinesX; j++) {
    const isMajor = j % 5 === 0;
    const opacity = isMajor ? 0.2 : 0.05;
    linesX.push(
      <div
        key={`x-${j}`}
        className="absolute bg-[rgb(128,128,128)] pointer-events-none"
        style={{
          width: '1px',
          height: '100%',
          left: `${((j / numGridLinesX) * 100).toFixed(3)}%`,
          opacity: opacity
        }}
      />
    );
  }

  const linesY = [];
  for (let j = 1; j < gridNumberY; j++) {
    const isMajor = j % 5 === 0;
    const opacity = isMajor ? 0.2 : 0.05;
    linesY.push(
      <div
        key={`y-${j}`}
        className="absolute bg-[rgb(128,128,128)] pointer-events-none"
        style={{
          height: '1px',
          width: '100%',
          top: `${((j / gridNumberY) * 100).toFixed(3)}%`,
          opacity: opacity
        }}
      />
    );
  }

  return (
    <div className="grid-lines-wrapper absolute inset-0 pointer-events-none overflow-hidden">
      {linesX}
      {linesY}
    </div>
  );
});
GridLines.displayName = 'GridLines';

/* ═══════════════════════════════════════════
   STATE INDICATOR — CortEX High Fidelity State Indicator
   ═══════════════════════════════════════════ */
const stateIcons = {
  stressed: "😰",
  relaxed: "😌",
  happy: "😄",
  focused: "🧠",
  neutral: "😐",
  mild_stress: "😟",
  no_data: "⏳"
};

const stateColors = {
  stressed: "text-red-500",
  relaxed: "text-blue-500",
  happy: "text-green-500",
  focused: "text-yellow-500",
  neutral: "text-cyan-500",
  mild_stress: "text-orange-500",
  no_data: "text-white animate-pulse"
};

function mapStateToIndicator(stateStr) {
  if (!stateStr) return 'no_data';
  const lower = stateStr.toLowerCase();
  if (lower.includes('focus')) return 'focused';
  if (lower.includes('calm') || lower.includes('relax')) return 'relaxed';
  if (lower.includes('stressed') || lower.includes('stress')) return 'stressed';
  if (lower.includes('happy')) return 'happy';
  if (lower.includes('mild_stress') || lower.includes('mild')) return 'mild_stress';
  if (lower.includes('neutral') || lower.includes('waiting') || lower.includes('analyz')) return 'no_data';
  return 'neutral';
}

function StateIndicator({ state }) {
  const displayState = state || 'no_data';
  const displayText = displayState === "no_data" ? "Analyzing..." : displayState.replace("_", " ");

  return (
    <div className={`px-2 rounded-lg flex items-center space-x-2 ${stateColors[displayState]}`}>
      <span className="text-base leading-none">{stateIcons[displayState]}</span>
      <span className="font-semibold capitalize text-xs tracking-wider leading-none">
        {displayText}
      </span>
    </div>
  );
}

const MeditationView = ({ result, wsEvent, wsMessage, wsUrl, currentView, onNavigate, onBackToMenu }) => {
  const containerRef = useRef(null);
  const resultRef = useRef(null);
  const wsEventRef = useRef(null);
  const [eegMapped, setEegMapped] = useState(true);
  const [sessionResults, setSessionResults] = useState(null);

  // Keep resultRef fresh for the requestAnimationFrame loop
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (result && result.eeg_mapped !== undefined) setEegMapped(result.eeg_mapped);
  }, [result]);

  // Keep wsEventRef fresh â€” captures raw eeg_prediction events with full feature set
  useEffect(() => {
    wsEventRef.current = wsEvent;
  }, [wsEvent]);
  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  const [wisdomIdx] = useState(() => Math.floor(Math.random() * WISDOM.length));

  /* â”€â”€ LIVE MIND STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [mindState, setMindState] = useState({ state: 'Neutral', level: 0, all: {} });

  /* -- RADAR CHART DATA (Recharts) ------------- */
  const [radarData, setRadarData] = useState([
    { subject: "Delta", value: 20 },
    { subject: "Theta", value: 20 },
    { subject: "Alpha", value: 25 },
    { subject: "Beta", value: 20 },
    { subject: "Gamma", value: 15 },
  ]);


  /* â”€â”€ ECG / HRV STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [ecgMeta, setEcgMeta] = useState({ bpm: null, rr_sdnn: null, signal_quality: 0 });
  const [bpmStats, setBpmStats] = useState({ high: null, low: null, avg: null });
  const [hrvStats, setHrvStats] = useState({ high: null, avg: null, low: null });
  const [rrHistory, setRrHistory] = useState([]); // HRV trend chart data
  const bpmHistRef = useRef([]);
  const sdnnHistRef = useRef([]);
  const ecgPtsRef = useRef([]); // raw ECG samples for waveform canvas
  const eeg0PtsRef = useRef([]); // raw EEG Channel 0 samples
  const eeg1PtsRef = useRef([]); // raw EEG Channel 1 samples

  /* â”€â”€ Ingest ecg_prediction events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    if (!wsEvent) return;
    if (wsEvent.event === 'ecg_prediction' || wsEvent.type === 'ecg_prediction') {
      const f = wsEvent.features ?? {};
      const bpm = f.bpm ?? null;
      const sdnn = f.rr_sdnn ?? null;
      const rr = f.rr_ms ?? null;
      setEcgMeta({ bpm, rr_sdnn: sdnn, signal_quality: f.signal_quality ?? 0 });
      if (bpm != null) {
        bpmHistRef.current.push(bpm);
        if (bpmHistRef.current.length > 300) bpmHistRef.current = bpmHistRef.current.slice(-300);
        const arr = bpmHistRef.current;
        setBpmStats({ low: Math.round(Math.min(...arr)), avg: Math.round(arr.reduce((a, b) => a + b) / arr.length), high: Math.round(Math.max(...arr)) });
      }
      if (sdnn != null) {
        sdnnHistRef.current.push(sdnn);
        if (sdnnHistRef.current.length > 300) sdnnHistRef.current = sdnnHistRef.current.slice(-300);
        const arr = sdnnHistRef.current;
        setHrvStats({ low: Math.round(Math.min(...arr)), avg: Math.round(arr.reduce((a, b) => a + b) / arr.length), high: Math.round(Math.max(...arr)) });
      }
      if (rr != null) {
        setRrHistory(prev => {
          const t = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          const next = [...prev, { t, rr: Math.round(rr) }];
          return next.length > 120 ? next.slice(-120) : next;
        });
      }
    }
  }, [wsEvent]);

  /* ── Ingest raw ECG/EEG samples from bio_data_batch ── */
  useEffect(() => {
    if (!wsMessage) return;
    const batch = wsMessage.raw?._batch; if (!batch?.length) return;
    const sr = wsMessage.raw?.sample_rate || 512;
    const now = Date.now();
    const dur = (batch.length / sr) * 1000;
    const t0 = now - dur;
    batch.forEach((sample, i) => {
      const t = t0 + (i / batch.length) * dur;
      const ch = sample.channels || {};
      Object.entries(ch).forEach(([chKey, chData], ci) => {
        const type = (chData.type || '').toUpperCase();
        if (type === 'ECG') {
          ecgPtsRef.current.push({ t, value: chData.value });
        } else if (type === 'EEG') {
          if (chKey === '0' || ci === 0) {
            eeg0PtsRef.current.push({ t, value: chData.value });
          } else {
            eeg1PtsRef.current.push({ t, value: chData.value });
          }
        }
      });
    });
    [ecgPtsRef, eeg0PtsRef, eeg1PtsRef].forEach(r => { if (r.current.length > 4096) r.current = r.current.slice(-4096); });
  }, [wsMessage]);

  /* â”€â”€ MUSIC MIXER STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [musicState, setMusicState] = useState(
    TRACKS.map(t => ({ id: t.id, label: t.label, active: false, vol: 0.8, category: t.category }))
  );

  /* â”€â”€ AUDIO REFS (one Audio object per track) â”€â”€ */
  const audioRefs = useRef({});
  useEffect(() => {
    // Create Audio objects once on mount â€” high initial volume
    TRACKS.forEach(t => {
      const audio = new Audio(t.file);
      audio.loop = true;
      audio.volume = 0.8;
      audio.preload = 'auto';
      audioRefs.current[t.id] = audio;
    });
    return () => {
      Object.values(audioRefs.current).forEach(a => { a.pause(); a.src = ''; });
    };
  }, []);

  /* â”€â”€ FFT WORKER STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [spectra, setSpectra] = useState({});
  const [selectedChannel, setSelectedChannel] = useState('0');

  // Keep spectraRef fresh â€” used to drive the radar chart from the LIVE FFT graph data
  const spectraRef = useRef({});
  useEffect(() => {
    spectraRef.current = spectra;
  }, [spectra]);

  // Keep selectedChannelRef fresh for the interval closure
  const selectedChannelRef = useRef('0');
  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  // Keep wsUrlRef fresh to detect disconnections in the loop
  const wsUrlRef = useRef(wsUrl);
  useEffect(() => {
    wsUrlRef.current = wsUrl;
  }, [wsUrl]);

  useEffect(() => {
    if (!wsUrl) return;
    const dataWorker = new Worker(new URL('../../../workers/data.worker.js', import.meta.url), { type: 'module' });
    dataWorker.postMessage({ type: 'CONNECT', payload: { url: wsUrl } });

    const fftWorker = new FFTWorker();
    fftWorker.onmessage = (e) => {
      if (e.data.type === 'FFT_RESULT') {
        setSpectra(prev => {
          // Auto-select first channel if currently selected key is absent
          const keys = Object.keys(e.data.payload);
          if (keys.length > 0) {
            setSelectedChannel(ch => (e.data.payload[ch] ? ch : keys[0]));
          }
          return e.data.payload;
        });
      }
    };

    return () => {
      dataWorker.postMessage({ type: 'DISCONNECT' });
      dataWorker.terminate();
      fftWorker.terminate();
      setSpectra({}); // clear when disconnected
    };
  }, [wsUrl]);

  /* â”€â”€ VOLUME SYNC ONLY (no play/pause here) â”€â”€â”€â”€ */
  // play/pause must happen synchronously inside the user-click handler
  // to satisfy browser autoplay policy â€” see toggleMusic below
  useEffect(() => {
    musicState.forEach(m => {
      const audio = audioRefs.current[m.id];
      if (!audio) return;
      audio.volume = Math.max(0, Math.min(1, m.vol));
    });
  }, [musicState]);

  /* â”€â”€ PERSISTENT STATS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [stats, setStats] = useState(() => {
    try {
      const saved = localStorage.getItem('med_stats');
      const parsed = saved ? JSON.parse(saved) : null;
      return {
        streak: parsed?.streak ?? 0,
        totalMin: parsed?.totalMin ?? 0,
        sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
        lastDate: parsed?.lastDate ?? null,
        xp: parsed?.xp ?? 0
      };
    } catch {
      return { streak: 0, totalMin: 0, sessions: [], lastDate: null, xp: 0 };
    }
  });

  const toggleMusic = useCallback((id) => {
    // Play/pause synchronously HERE â€” this is the direct user-gesture context.
    // Browsers block audio.play() inside useEffect (not a user gesture).
    const audio = audioRefs.current[id];
    setMusicState(prev => {
      const next = prev.map(m => m.id === id ? { ...m, active: !m.active } : m);
      const track = next.find(m => m.id === id);
      if (audio) {
        if (track.active) {
          audio.volume = track.vol;
          audio.play().catch(err => console.warn('[Audio] Play blocked:', err));
        } else {
          audio.pause();
        }
      }
      return next;
    });
  }, []);

  const updateVol = useCallback((id, vol) => {
    const clampedVol = Math.max(0, Math.min(1, vol));
    const audio = audioRefs.current[id];
    if (audio) audio.volume = clampedVol;
    setMusicState(prev => prev.map(m => m.id === id ? { ...m, vol: clampedVol } : m));
  }, []);

  /* â”€â”€ MASTER VOLUME â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [masterVol, setMasterVol] = useState(1.0);
  const onMasterVol = useCallback((val) => {
    const clamped = Math.max(0, Math.min(1, val));
    setMasterVol(clamped);
    // Apply master * per-track volume to all Audio elements
    setMusicState(prev => {
      prev.forEach(m => {
        const audio = audioRefs.current[m.id];
        if (audio) audio.volume = Math.max(0, Math.min(1, m.vol * clamped));
      });
      return prev; // state unchanged, only audio.volume mutated
    });
  }, []);

  useEffect(() => {
    localStorage.setItem('med_stats', JSON.stringify(stats));
  }, [stats]);

  const { setSidebarSlot, setSidebarMode } = useSidebar();

  useEffect(() => {
    setSidebarMode('page');
  }, [setSidebarMode]);

  // Update the sidebar slot whenever state affecting the sidebar changes
  useEffect(() => {
    setSidebarSlot(
      <MeditationSidebar
        containerRef={containerRef}
        musicState={musicState}
        toggleMusic={toggleMusic}
        updateVol={updateVol}
        masterVol={masterVol}
        onMasterVol={onMasterVol}
        stats={stats}
        wisdomIdx={wisdomIdx}
        onBackToMenu={onBackToMenu}
      />
    );

  }, [musicState, masterVol, stats, wisdomIdx, toggleMusic, updateVol, onMasterVol, setSidebarSlot, result]);

  // Separate cleanup-only effect: clear slot on unmount
  useEffect(() => {
    return () => {
      setSidebarSlot(null);
    };
  }, [setSidebarSlot]);


  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => document.getElementById(id);

    /* â”€â”€ CANVASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const ecgCanvas = $('med-ecg-canvas');
    const ctxEcg = ecgCanvas?.getContext('2d');
    const eegCanvas = $('med-eeg-canvas');
    const ctxEeg = eegCanvas?.getContext('2d');

    /* â”€â”€ STATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    let eegMode = 'waiting';
    let fetchInterval = null;
    let animId = null;
    let sessionRunning = false;
    let sessionStart = 0;
    let presetSecs = 5 * 60; // default 5 min
    let calmSignal = 0;
    let rawBands = [20, 20, 25, 20, 15];

    let breathTick = 0;
    let cycleCount = 0;
    let lastTS = null;

    let calmAcc = 0, calmSamples = 0;

    /* â”€â”€ EMA SMOOTHING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    const EMA_ALPHA = 0.15; // lower = smoother (0.1-0.3 is good for 60ms interval)
    let smoothBands = [20, 20, 25, 20, 15];
    let smoothCalm = 0;
    let smoothFocus = 0;
    let smoothStress = 0;
    let prevDominant = 'Alpha';
    let dominantHoldFrames = 0;
    const DOMINANT_HOLD = 20; // hold dominant label for ~20 frames (~1.2s) to prevent flicker

    function ema(prev, next, alpha) {
      return prev + alpha * (next - prev);
    }

    /* â”€â”€ THEME COLOR HELPER â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function tc(name, fallback = '#ffffff') {
      return themeRef.current?.colors?.[name] || fallback;
    }
    function hex2rgba(hex, alpha) {
      if (!hex) return `rgba(255,255,255,${alpha})`;
      if (hex.startsWith('rgb')) return hex;
      let c = hex.replace('#', '');
      if (c.length === 3) c = c.split('').map(x => x + x).join('');
      const n = parseInt(c, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }

    /* â”€â”€ RESIZE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function resizeCanvas(canvas) {
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    function resizeAll() {
      [ecgCanvas, eegCanvas].filter(Boolean).forEach(resizeCanvas);
    }
    window.addEventListener('resize', resizeAll);
    // defer first resize so DOM is painted
    setTimeout(resizeAll, 50);

    /* â”€â”€ RADAR DRAW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function drawRadar(ctx, bands, isLeft) {
      if (!ctx || !ctx.canvas) return;
      const W = ctx.canvas.width, H = ctx.canvas.height;
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.36;
      const n = 5;
      // (labels already declared above for dominant wave)
      const angles = labels.map((_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);

      const primary = tc('--primary');
      const line1 = isLeft ? tc('--graph-line-1') : tc('--primary');
      const gridCol = tc('--graph-grid', 'rgba(255,255,255,0.06)');

      // Grid rings â€” 5 rings: 0, 25, 50, 75, 100
      // INNER is the fraction for the "0" baseline ring (no-signal pentagon)
      const INNER = 0.12;
      const ringFracs = [INNER, INNER + 0.22, INNER + 0.44, INNER + 0.66, 1.0];
      const ringLabels = ['0', '25', '50', '75', '100'];

      ctx.save();
      ringFracs.forEach((frac, ri) => {
        ctx.beginPath();
        angles.forEach((a, i) => {
          const x = cx + Math.cos(a) * R * frac;
          const y = cy + Math.sin(a) * R * frac;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = frac === 1.0
          ? hex2rgba(primary, 0.15)
          : frac === INNER
            ? hex2rgba(primary, 0.25)   // inner "0" ring is brighter â€” it's the baseline
            : hex2rgba(gridCol, 0.4);
        ctx.lineWidth = frac === 0.7 ? 0.8 : frac === INNER ? 0.7 : 0.4;
        ctx.stroke();

        // Numeric labels
        ctx.font = 'bold 9px "Share Tech Mono", monospace';
        ctx.fillStyle = hex2rgba(primary, frac === INNER ? 0.6 : 0.6);
        ctx.textAlign = 'center';
        ctx.fillText(ringLabels[ri], cx, cy - R * frac - 3);
      });

      // Spokes
      angles.forEach(a => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.strokeStyle = hex2rgba(primary, 0.06);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      });

      // Data polygon â€” remapped so norm=0 sits ON the 0-ring, norm=1 reaches outer edge
      const total = bands.reduce((a, b) => a + b, 0) || 100;
      const norm = bands.map(v => v / total);

      ctx.beginPath();
      angles.forEach((a, i) => {
        // Map: 0 â†’ INNER ring, 1 â†’ full radius
        const r = (INNER + norm[i] * (1 - INNER)) * R;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, hex2rgba(line1, 0.50));
      grad.addColorStop(1, hex2rgba(line1, 0.10));
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = line1;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10; ctx.shadowColor = line1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Band label colors â€” neon palette per wave type
      const bandColors = [
        '#4f8eff', // Delta â€” blue
        '#a855f7', // Theta â€” purple
        '#22c55e', // Alpha â€” green
        '#00e5ff', // Beta  â€” cyan
        '#f59e0b', // Gamma â€” amber
      ];

      // Vertex dots + highlighted labels
      const textCol = tc('--graph-text', tc('--muted'));
      angles.forEach((a, i) => {
        const r = (INNER + norm[i] * (1 - INNER)) * R;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        // Glowing dot at data vertex
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = bandColors[i];
        ctx.shadowBlur = 12; ctx.shadowColor = bandColors[i];
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label position â€” further out from center
        const lx = cx + Math.cos(a) * (R + 22);
        const ly = cy + Math.sin(a) * (R + 22);

        // Semi-transparent badge background
        ctx.font = 'bold 10px "Orbitron", "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelW = ctx.measureText(labels[i]).width + 10;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.beginPath();
        ctx.roundRect(lx - labelW / 2, ly - 8, labelW, 16, 4);
        ctx.fill();

        // Label text â€” no glow
        ctx.fillStyle = bandColors[i];
        ctx.fillText(labels[i], lx, ly);
      });
      ctx.restore();
    }

    function startLiveStream() {
      eegMode = 'ws';
      if (fetchInterval) clearInterval(fetchInterval);
      fetchInterval = setInterval(() => {
        const ws = wsEventRef.current;  // raw eeg_prediction â€” has full features
        const res = resultRef.current;   // processed result  â€” has state/band_mix/score

        // If disconnected from backend, force wave bands to 0 immediately
        if (!wsUrlRef.current || ws?.status === 'disconnected' || res?.status === 'disconnected') {
          rawBands = [0, 0, 0, 0, 0];
          calmSignal = 0;
          return;
        }

        // â”€â”€ BAND POWERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Compute REAL band powers directly from the live FFT spectra
        // Use the explicit source channel if backend provides it, otherwise fallback
        const activeCh = (ws?.source_channel !== undefined) ? String(ws.source_channel) : selectedChannelRef.current;
        const currentSp = spectraRef.current[activeCh] || spectraRef.current[selectedChannelRef.current] || Object.values(spectraRef.current)[0] || [];

        if (currentSp.length > 0) {
          let delta = 0, theta = 0, alpha = 0, beta = 0;
          currentSp.forEach(d => {
            if (d.freq >= 1 && d.freq < 4) delta += d.power;
            else if (d.freq >= 4 && d.freq < 8) theta += d.power;
            else if (d.freq >= 8 && d.freq < 13) alpha += d.power;
            else if (d.freq >= 13 && d.freq <= 30) beta += d.power;
          });

          // Smooth band powers with EMA to prevent rapid oscillation
          const newBands = [delta, theta, alpha, beta, 0];
          for (let i = 0; i < 5; i++) smoothBands[i] = ema(smoothBands[i], newBands[i], EMA_ALPHA);
          rawBands = smoothBands.slice();

          // â”€â”€ CALM SIGNAL â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
          const total = delta + theta + alpha + beta + 1e-6;
          const alphaRel = alpha / total;
          const betaRel = beta / total;
          const thetaRel = theta / total;

          // Calm = high alpha/theta, low beta â€” smoothed
          const rawCalm = Math.max(0, Math.min(1, (alphaRel + thetaRel * 0.5) * 1.5 - (betaRel * 0.5)));
          smoothCalm = ema(smoothCalm, rawCalm, EMA_ALPHA);
          calmSignal = smoothCalm;
        } else {
          // Fallback to wsEvent.features if FFT stream not ready
          const feat = ws?.features || res?.features;
          if (feat?.delta !== undefined) {
            rawBands = [feat.delta || 0, feat.theta || 0, feat.alpha || 0, feat.beta || 0, 0];
            const alphaRel = feat.alpha_rel || 0;
            const betaRel = feat.beta_rel || 0;
            calmSignal = Math.max(0, Math.min(1, alphaRel * 1.5 - betaRel * 0.5));
          }
        }
      }, 60);
    }

    /* â”€â”€ PHASE LOGIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function getPhase() {
      let t = breathTick % TOTAL_CYCLE;
      for (let i = 0; i < PHASES.length; i++) {
        if (t < PHASES[i].dur) return { phase: PHASES[i], idx: i, progress: t / PHASES[i].dur };
        t -= PHASES[i].dur;
      }
      return { phase: PHASES[0], idx: 0, progress: 0 };
    }

    /* â”€â”€ UPDATE DOM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function updateDOM(phaseInfo) {
      if (!containerRef.current) return;

      const pb = $('med-phase-badge');
      if (pb) pb.textContent = sessionRunning ? phaseInfo.phase.name : 'READY';

      if (sessionRunning) {
        const elapsed = Math.max(0, (Date.now() - sessionStart) / 1000);
        const remaining = Math.max(0, presetSecs - elapsed);
        const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
        const ss = String(Math.floor(remaining % 60)).padStart(2, '0');
        const td = $('med-timer-big');
        if (td) td.textContent = `${mm}:${ss}`;

        const cc = $('med-cycle-count');
        if (cc) cc.textContent = `CYCLE ${cycleCount + 1}`;

        // Auto-stop when countdown reaches 0
        if (remaining <= 0) container.stopSessionHandler?.();

        calmAcc += calmSignal; calmSamples++;
      }

      // Main Area Calm bar
      const cf = $('med-calm-fill');
      if (cf) cf.style.width = (calmSignal * 100).toFixed(0) + '%';
      const cp = $('med-calm-pct');
      if (cp) cp.textContent = (calmSignal * 100).toFixed(0) + '%';

      // Focus Orb Animation
      const orb = $('med-focus-orb');
      const orbText = $('med-orb-text');

      if (orb && orbText) {
        if (sessionRunning) {
          const { idx, progress } = phaseInfo;
          let scale = 1;

          // Base size 1, Max size 3.5
          if (idx === 0) { // INHALE
            scale = 1 + (2.5 * progress);
            orbText.textContent = 'INHALE';
            orbText.style.opacity = 1;
          } else if (idx === 1) { // HOLD
            scale = 3.5;
            orbText.textContent = 'HOLD';
            orbText.style.opacity = 0.5 + Math.sin(Date.now() / 200) * 0.5; // pulse
          } else if (idx === 2) { // EXHALE
            scale = 3.5 - (2.5 * progress);
            orbText.textContent = 'EXHALE';
            orbText.style.opacity = 1;
          } else if (idx === 3) { // REST
            scale = 1;
            orbText.textContent = 'REST';
            orbText.style.opacity = 0.5;
          }

          orb.style.transform = `scale(${scale})`;
          const cFactor = Math.floor(calmSignal * 255);
          orb.style.boxShadow = `0 0 ${20 + calmSignal * 60}px rgba(0, ${cFactor}, 255, 0.4)`;
        } else {
          orb.style.transform = 'scale(1)';
          orbText.textContent = 'READY';
          orbText.style.opacity = 0.5;
          orb.style.boxShadow = '0 0 40px var(--primary)';
        }
      }

      // â”€â”€ Focus & Stress live values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // eegResult is already the spread of wsEvent.output â€” fields live at top level
      const ws2 = wsEventRef.current;
      const res2 = resultRef.current;
      const out2 = res2 || {};
      const feat2 = ws2?.features || res2?.features;

      // â”€â”€ Update mind state from backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (out2.state) {
        setMindState({ state: out2.state, level: out2.state_level ?? 0, all: out2.all_states || {} });
      }

      let focusVal = 0;
      let stressVal = 0;

      // Compute raw focus/stress from ONE consistent source (spectra preferred)
      let rawFocus = smoothFocus;
      let rawStress = smoothStress;

      if (!wsUrlRef.current || ws2?.status === 'disconnected' || res2?.status === 'disconnected') {
        rawFocus = 0;
        rawStress = 0;
        smoothFocus = 0;
        smoothStress = 0;
      } else if (out2.focus_score !== undefined) {
        // Backend-computed scores â€” still smooth them
        rawFocus = out2.focus_score;
        rawStress = out2.stress_score ?? 0;
      } else {
        // Spectra-derived
        const currentSp = spectraRef.current[selectedChannelRef.current] || Object.values(spectraRef.current)[0] || [];
        if (currentSp.length > 0) {
          let delta = 0, theta = 0, alpha = 0, beta = 0;
          currentSp.forEach(d => {
            if (d.freq >= 1 && d.freq < 4) delta += d.power;
            else if (d.freq >= 4 && d.freq < 8) theta += d.power;
            else if (d.freq >= 8 && d.freq < 13) alpha += d.power;
            else if (d.freq >= 13 && d.freq <= 30) beta += d.power;
          });
          const total2 = delta + theta + alpha + beta + 1e-6;
          const alphaRel = alpha / total2;
          const betaRel = beta / total2;
          const thetaRel = theta / total2;
          rawFocus = Math.min(100, Math.max(0, (alphaRel + thetaRel * 0.5) * 200));
          const si = beta / (alpha + theta + 1e-6);
          rawStress = Math.min(100, Math.max(0, (Math.min(si, 2.0) / 2.0) * 100));
        } else if (feat2?.alpha !== undefined) {
          const total2 = (feat2.delta || 0) + (feat2.theta || 0) + (feat2.alpha || 0) + (feat2.beta || 0) + 1e-6;
          const alphaRel = (feat2.alpha || 0) / total2;
          const betaRel = (feat2.beta || 0) / total2;
          const thetaRel = (feat2.theta || 0) / total2;
          rawFocus = Math.min(100, Math.max(0, (alphaRel + thetaRel * 0.5) * 200));
          const si2 = (feat2.beta || 0) / ((feat2.alpha || 0) + (feat2.theta || 0) + 1e-6);
          rawStress = Math.min(100, Math.max(0, (Math.min(si2, 2.0) / 2.0) * 100));
        } else if (res2?.meditation_score !== undefined) {
          rawFocus = res2.meditation_score || 0;
          rawStress = Math.max(0, 100 - rawFocus);
        }
      }

      // EMA smooth focus & stress
      smoothFocus = ema(smoothFocus, rawFocus, EMA_ALPHA);
      smoothStress = ema(smoothStress, rawStress, EMA_ALPHA);
      focusVal = Math.round(smoothFocus);
      stressVal = Math.round(smoothStress);

      const fv = $('med-focus-val');
      if (fv) fv.textContent = focusVal;
      const sv = $('med-stress-val');
      if (sv) sv.textContent = stressVal;

      // Sidebar indicators
      const colCalm = $('med-col-calm-val');
      if (colCalm) colCalm.textContent = (calmSignal * 100).toFixed(0);
      const expCalm = $('med-exp-calm-val');
      if (expCalm) expCalm.textContent = (calmSignal * 100).toFixed(0) + '%';
      const expCalmPip = $('med-exp-calm-pip');
      if (expCalmPip) expCalmPip.style.width = (calmSignal * 100).toFixed(0) + '%';
    }

    /* ── ECG WAVEFORM DRAW ───────────────────────── */
    function drawEegWaveform() {
      if (!ctxEeg || !eegCanvas) return;
      const W = eegCanvas.width, H = eegCanvas.height;
      if (!W || !H) return;
      ctxEeg.clearRect(0, 0, W, H);

      ctxEeg.strokeStyle = 'rgba(255,255,255,0.05)';
      ctxEeg.lineWidth = 1; ctxEeg.setLineDash([4, 4]);
      ctxEeg.beginPath(); ctxEeg.moveTo(0, H / 2); ctxEeg.lineTo(W, H / 2); ctxEeg.stroke();
      ctxEeg.setLineDash([]);

      const pts = eeg0PtsRef.current.slice(-2048);
      if (pts.length < 2) return;
      const now = Date.now(), windowMs = 6000, tMin = now - windowMs;
      const recent = pts.filter(p => p.t >= tMin);
      if (recent.length < 2) return;
      const rawMax = Math.max(...recent.map(p => Math.abs(p.value)), 1);
      const yRange = Math.max(rawMax * 1.3, 30);
      const toX = t => ((t - tMin) / windowMs) * W;
      const toY = v => H / 2 - (v / yRange) * (H / 2 - 4);
      ctxEeg.strokeStyle = '#0ea5e9';
      ctxEeg.shadowColor = '#0ea5e9'; ctxEeg.shadowBlur = 6;
      ctxEeg.lineWidth = 1.5;
      ctxEeg.lineJoin = 'round'; ctxEeg.lineCap = 'round';
      ctxEeg.beginPath();
      recent.forEach((p, i) => { const x = toX(p.t), y = toY(p.value); i === 0 ? ctxEeg.moveTo(x, y) : ctxEeg.lineTo(x, y); });
      ctxEeg.stroke();
      ctxEeg.shadowBlur = 0;
    }

    function drawEcgWaveform() {
      if (!ctxEcg || !ecgCanvas) return;
      const W = ecgCanvas.width, H = ecgCanvas.height;
      if (!W || !H) return;
      ctxEcg.clearRect(0, 0, W, H);

      // Center line
      ctxEcg.strokeStyle = 'rgba(255,255,255,0.05)';
      ctxEcg.lineWidth = 1; ctxEcg.setLineDash([4, 4]);
      ctxEcg.beginPath(); ctxEcg.moveTo(0, H / 2); ctxEcg.lineTo(W, H / 2); ctxEcg.stroke();
      ctxEcg.setLineDash([]);

      // Get recent ECG samples
      const pts = ecgPtsRef.current.slice(-2048);
      if (pts.length < 2) return;

      const now = Date.now();
      const windowMs = 6000; // 6-second window
      const tMin = now - windowMs;
      const recent = pts.filter(p => p.t >= tMin);
      if (recent.length < 2) return;

      const rawMax = Math.max(...recent.map(p => Math.abs(p.value)), 1);
      const yRange = Math.max(rawMax * 1.3, 30);
      const toX = t => ((t - tMin) / windowMs) * W;
      const toY = v => H / 2 - (v / yRange) * (H / 2 - 4);

      ctxEcg.strokeStyle = '#f43f5e';
      ctxEcg.shadowColor = '#f43f5e'; ctxEcg.shadowBlur = 8;
      ctxEcg.lineWidth = 1.6;
      ctxEcg.lineJoin = 'round'; ctxEcg.lineCap = 'round';
      ctxEcg.beginPath();
      recent.forEach((p, i) => { const x = toX(p.t), y = toY(p.value); i === 0 ? ctxEcg.moveTo(x, y) : ctxEcg.lineTo(x, y); });
      ctxEcg.stroke();
      ctxEcg.shadowBlur = 0;
    }

    /* â”€â”€ MAIN LOOP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function loop(ts) {
      animId = requestAnimationFrame(loop);

      if (sessionRunning) {
        if (lastTS === null) lastTS = ts;
        const dt = (ts - lastTS) / 1000;
        lastTS = ts;
        if (Math.floor(breathTick) > 0 && Math.floor(breathTick) % TOTAL_CYCLE < dt) cycleCount++;
      } else {
        lastTS = null;
      }

      if (!sessionRunning) breathTick = 0;

      // Dominant Wave Calculation â€” with hold timer to prevent rapid flicker
      // (labels already declared above for dominant wave)
      const maxVal = Math.max(...rawBands);
      const dominantIdx = rawBands.indexOf(maxVal);
      const candidateWave = labels[dominantIdx];

      if (candidateWave !== prevDominant) {
        dominantHoldFrames++;
        if (dominantHoldFrames >= DOMINANT_HOLD) {
          prevDominant = candidateWave;
          dominantHoldFrames = 0;
        }
      } else {
        dominantHoldFrames = 0;
      }
      const dominantWaveName = prevDominant;

      const dwEl = $('med-dominant-val');
      if (dwEl) {
        dwEl.textContent = dominantWaveName.toUpperCase();
        dwEl.style.fontWeight = '900';
        // Color coding for dominant wave
        const colors = [tc('--delta', '#4466ff'), tc('--theta', '#a855f7'), tc('--alpha', '#22c55e'), tc('--beta', '#00f5ff'), tc('--gamma', '#f59e0b')];
        dwEl.style.color = colors[dominantIdx] || 'var(--primary)';
        dwEl.style.textShadow = `0 0 10px ${colors[dominantIdx] || 'var(--primary)'}`;
      }

      const phaseInfo = getPhase();
      const newRadar = labels.map((l, i) => ({ subject: l, value: Math.round(rawBands[i]) }));
      setRadarData(newRadar);

      drawEegWaveform();
      drawEcgWaveform();
      updateDOM(phaseInfo);
    }

    /* â”€â”€ SESSION PERSISTENCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    function saveSession(data) {
      setStats(prev => {
        const today = new Date().toDateString();
        let newStreak = prev.streak;
        if (prev.lastDate !== today) {
          // Increment streak if last session was yesterday
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
          if (prev.lastDate === yesterday.toDateString()) newStreak++;
          else if (!prev.lastDate) newStreak = 1;
          else newStreak = 1; // broken streak
        }

        const newSessions = [data, ...prev.sessions].slice(0, 10);
        const addedXP = 50 + (data.avgCalm * 2);

        return {
          ...prev,
          streak: newStreak,
          totalMin: prev.totalMin + (parseInt(data.duration.split(':')[0]) || 0),
          sessions: newSessions,
          lastDate: today,
          xp: prev.xp + addedXP
        };
      });
    }

    /* â”€â”€ EXPOSED HANDLERS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
    container.startSessionHandler = (presetMin) => {
      if (presetMin) presetSecs = presetMin * 60;
      breathTick = 0; cycleCount = 0; calmAcc = 0; calmSamples = 0;
      sessionStart = Date.now();
      sessionRunning = true; lastTS = null;

      // Notify backend
      fetch('/api/meditation/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: (presetMin || presetSecs / 60) }),
      }).catch(() => { });

      // Update Expanded Button
      const btn = $('med-session-btn');
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg> Stop`;
        btn.className = 'w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20';
      }

      // Update Collapsed Button
      const colBtn = $('med-col-session-btn');
      if (colBtn) {
        colBtn.className = 'transition-colors group relative p-3 rounded-full text-red-500 hover:bg-red-500/20';
        $('med-col-play')?.classList.add('hidden');
        $('med-col-stop')?.classList.remove('hidden');
        const tt = $('med-col-tooltip-session');
        if (tt) tt.textContent = 'Stop Session';
      }

      // Update Phase Badge Styling
      const pb = $('med-phase-badge');
      if (pb) {
        pb.classList.remove('border-muted/50', 'text-muted');
        pb.classList.add('border-primary', 'text-primary', 'shadow-[0_0_8px_var(--primary)]');
      }
    };

    container.stopSessionHandler = () => {
      if (!sessionRunning) return;
      sessionRunning = false;
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const avgCalm = calmSamples > 0 ? Math.round((calmAcc / calmSamples) * 100) : 0;

      // Call backend for detailed results
      fetch('/api/meditation/session/stop', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
          if (data.results) {
            setSessionResults(data.results);
          }
        })
        .catch(() => { });

      saveSession({ duration: `${mm}:${ss}`, avgCalm, cycles: cycleCount, mode: eegMode === 'ws' ? 'LIVE' : 'SIM' });

      // Update Expanded Button
      const btn = $('med-session-btn');
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play"><polygon points="6 3 20 12 6 21 6 3"/></svg> Start`;
        btn.className = 'w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow';
      }

      // Update Collapsed Button
      const colBtn = $('med-col-session-btn');
      if (colBtn) {
        colBtn.className = 'transition-colors group relative p-3 rounded-full text-green-500 hover:bg-green-500/20';
        $('med-col-play')?.classList.remove('hidden');
        $('med-col-stop')?.classList.add('hidden');
        const tt = $('med-col-tooltip-session');
        if (tt) tt.textContent = 'Start Session';
      }

      // Reset info
      const td = $('med-timer-big');
      if (td) td.textContent = '00:00';
      const pb = $('med-phase-badge');
      if (pb) {
        pb.textContent = 'READY';
        pb.classList.remove('border-primary', 'text-primary', 'shadow-[0_0_8px_var(--primary)]');
        pb.classList.add('border-muted/50', 'text-muted');
      }
    };

    container.sessionBtnHandler = () => {
      if (sessionRunning) container.stopSessionHandler();
      else container.startSessionHandler();
    };

    container.toggleConnHandler = () => {
      startLiveStream();
      const isWs = eegMode === 'ws';

      // Update Collapsed button
      const colConnBtn = $('med-col-conn-btn');
      if (colConnBtn) {
        colConnBtn.className = `w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all cursor-pointer shadow-sm group relative ${isWs ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`;
        if (isWs) {
          $('med-col-power')?.classList.add('hidden');
          $('med-col-zap')?.classList.remove('hidden');
          const lbl = $('med-col-conn-lbl');
          if (lbl) lbl.textContent = 'Sensor Connected';
        } else {
          $('med-col-power')?.classList.remove('hidden');
          $('med-col-zap')?.classList.add('hidden');
          const lbl = $('med-col-conn-lbl');
          if (lbl) lbl.textContent = 'Simulate Mode';
        }
      }

      // Update Expanded box
      const expConnL = $('med-exp-conn-icon-live');
      const expConnS = $('med-exp-conn-icon-sim');
      const expConnT = $('med-exp-conn-text');
      const expConnBg = $('med-exp-conn-box');
      if (isWs) {
        expConnL?.classList.remove('hidden');
        expConnS?.classList.add('hidden');
        if (expConnT) expConnT.textContent = 'LIVE FEED';
        if (expConnBg) expConnBg.className = 'bg-bg/50 border border-green-500/20 rounded-xl p-3 flex flex-col shrink-0 mb-4 shadow-[0_0_10px_rgba(34,197,94,0.1)] transition-colors cursor-pointer hover:bg-bg/70';
      } else {
        expConnL?.classList.add('hidden');
        expConnS?.classList.remove('hidden');
        if (expConnT) expConnT.textContent = 'SIMULATE';
        if (expConnBg) expConnBg.className = 'bg-bg/50 border border-red-500/20 rounded-xl p-3 flex flex-col shrink-0 mb-4 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition-colors cursor-pointer hover:bg-bg/70';
      }
    };

    container.presetHandler = (min) => {
      presetSecs = min * 60;
      const td = $('med-timer-big');
      if (td) { const mm = String(min).padStart(2, '0'); td.textContent = `${mm}:00`; }
      // highlight active preset
      document.querySelectorAll('.med-preset-btn').forEach(b => {
        if (parseInt(b.dataset.min) === min) {
          b.classList.add('bg-yellow-500', 'text-black', 'border-yellow-500', 'shadow-[0_0_10px_rgba(234,179,8,0.5)]');
          b.classList.remove('bg-bg/50', 'text-muted', 'border-border', 'hover:border-yellow-500', 'bg-primary', 'text-bg', 'border-primary', 'shadow-glow');
        } else {
          b.classList.remove('bg-yellow-500', 'text-black', 'border-yellow-500', 'shadow-[0_0_10px_rgba(234,179,8,0.5)]', 'bg-primary', 'text-bg', 'border-primary', 'shadow-glow');
          b.classList.add('bg-bg/50', 'text-muted', 'border-border', 'hover:border-yellow-500');
        }
      });
    };

    startLiveStream(); // start cleanly waiting for live stream
    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resizeAll);
      if (fetchInterval) clearInterval(fetchInterval);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  const emoji = STATE_EMOJIS[mindState.state] || '⏳';
  const stateLabel = mindState.state === 'Neutral' ? 'Analyzing...' : mindState.state;

  return (
    <div className="h-full w-full flex flex-col p-4 gap-4 font-sans overflow-hidden select-none text-[var(--text,#e4e4e7)] bg-[var(--bg-main,#18181b)] relative" ref={containerRef}>
      {/* LOCAL STYLES FOR OVERRIDING DEFAULT LOOK & LOCKING COLORS */}
      <style dangerouslySetInnerHTML={{
        __html: `
        :root {
          --bg-main: #18181b;
          --bg-panel: #1e1e21;
          --bg-panel-header: #1e1e21;
          --border-color: #2d2d30;
          --accent-yellow: var(--primary, #facc15);
          --text-muted: var(--muted, #a1a1aa);
          --grid-line: #2a2a2d;
        }

        .panel-container {
          background-color: var(--bg-panel);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .chart-grid-bg {
          background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px;
          background-image: 
              linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to right, rgba(255,255,255,0.015) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-position: center bottom;
        }

        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
      `}} />

      {/* ── EEG WARNING BANNER ── */}
      {!eegMapped && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 backdrop-blur-md">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-xs font-bold text-amber-300 tracking-wider">Please map an EEG sensor in Settings for accurate data</span>
        </div>
      )}

      {/* ── SESSION RESULTS OVERLAY ── */}
      {sessionResults && (() => {
        const q = sessionResults.quality_score ?? 0;
        const dur = sessionResults.duration_sec ?? sessionResults.duration_seconds ?? 0;
        const durMin = Math.floor(dur / 60);
        const durSec = dur % 60;
        const rating = q >= 80 ? { label: 'EXCELLENT', color: '#22c55e', icon: '🧘' }
          : q >= 60 ? { label: 'GOOD', color: '#0ea5e9', icon: '✨' }
            : q >= 40 ? { label: 'FAIR', color: '#f59e0b', icon: '💫' }
              : { label: 'KEEP TRYING', color: '#f43f5e', icon: '🔥' };
        const posPct = sessionResults.positive_time_pct ?? 0;
        const negPct = sessionResults.negative_time_pct ?? 0;
        const stateColors = { Focus: '#0ea5e9', Calm: '#a855f7', Relaxed: '#22c55e', Stressed: '#f43f5e', Drowsy: '#f59e0b', Neutral: '#94a3b8' };

        return (
          <div className="absolute inset-0 z-[200] flex items-center justify-center bg-[var(--bg)]/90 backdrop-blur-xl overflow-y-auto py-6">
            <div className="bg-[var(--surface)] border border-[var(--primary)]/30 rounded-2xl p-6 max-w-lg w-[92%] shadow-2xl">

              {/* Performance Rating */}
              <div className="text-center mb-5">
                <div className="text-4xl mb-1">{rating.icon}</div>
                <h2 className="font-display text-2xl font-black text-white tracking-widest mb-1">SESSION COMPLETE</h2>
                <div className="inline-block px-4 py-1 rounded-full text-xs font-black tracking-[3px] uppercase border"
                  style={{ color: rating.color, borderColor: rating.color + '66', backgroundColor: rating.color + '15' }}>
                  {rating.label}
                </div>
              </div>

              {/* Quality Ring */}
              <div className="flex justify-center mb-5">
                <div className="relative w-28 h-28">
                  <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
                    <circle cx="50" cy="50" r="42" fill="none" stroke={rating.color} strokeWidth="8"
                      strokeDasharray={`${q * 2.64} ${264 - q * 2.64}`} strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 6px ${rating.color}66)` }} />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-2xl font-black text-white">{q}</span>
                    <span className="text-[8px] tracking-[2px] text-white/50 uppercase">Quality</span>
                  </div>
                </div>
              </div>

              {/* Core Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                  <div className="text-[8px] tracking-[2px] text-white/40 mb-1">DURATION</div>
                  <div className="font-display text-lg font-bold text-white">{durMin > 0 ? `${durMin}m ${durSec}s` : `${durSec}s`}</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                  <div className="text-[8px] tracking-[2px] text-green-400/70 mb-1">POSITIVE</div>
                  <div className="font-display text-lg font-bold text-green-400">{posPct}%</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 text-center">
                  <div className="text-[8px] tracking-[2px] text-red-400/70 mb-1">NEGATIVE</div>
                  <div className="font-display text-lg font-bold text-red-400">{negPct}%</div>
                </div>
              </div>

              {/* Avg + Peak Stats */}
              <div className="grid grid-cols-2 gap-2 mb-4">
                <div className="bg-cyan-500/5 border border-cyan-500/15 rounded-lg p-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] tracking-[2px] text-cyan-400/70">AVG FOCUS</span>
                    <span className="text-[8px] tracking-[2px] text-cyan-400/50">PEAK {sessionResults.peak_focus ?? 0}</span>
                  </div>
                  <div className="font-display text-xl font-bold text-cyan-400">{sessionResults.avg_focus ?? 0}%</div>
                  <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${sessionResults.avg_focus ?? 0}%` }} />
                  </div>
                </div>
                <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] tracking-[2px] text-red-400/70">AVG STRESS</span>
                    <span className="text-[8px] tracking-[2px] text-red-400/50">LOW IS GOOD</span>
                  </div>
                  <div className="font-display text-xl font-bold text-red-400">{sessionResults.avg_stress ?? 0}%</div>
                  <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${sessionResults.avg_stress ?? 0}%` }} />
                  </div>
                </div>
                <div className="bg-green-500/5 border border-green-500/15 rounded-lg p-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-[8px] tracking-[2px] text-green-400/70">AVG CALM</span>
                    <span className="text-[8px] tracking-[2px] text-green-400/50">PEAK {sessionResults.peak_calm ?? 0}</span>
                  </div>
                  <div className="font-display text-xl font-bold text-green-400">{sessionResults.avg_calm ?? 0}%</div>
                  <div className="h-1 bg-white/5 rounded-full mt-1 overflow-hidden">
                    <div className="h-full bg-green-400 rounded-full" style={{ width: `${sessionResults.avg_calm ?? 0}%` }} />
                  </div>
                </div>
                <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-2.5">
                  <div className="text-[8px] tracking-[2px] text-amber-400/70 mb-1">SAMPLES</div>
                  <div className="font-display text-xl font-bold text-amber-400">{sessionResults.total_samples ?? 0}</div>
                </div>
              </div>

              {/* State Breakdown */}
              {sessionResults.state_breakdown && (
                <div className="mb-4">
                  <div className="text-[9px] tracking-[3px] text-[var(--muted)] mb-2 uppercase">State Breakdown</div>
                  <div className="flex flex-col gap-1.5">
                    {Object.entries(sessionResults.state_breakdown)
                      .sort(([, a], [, b]) => b - a)
                      .map(([state, pct]) => (
                        <div key={state} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold w-16 shrink-0" style={{ color: stateColors[state] || '#94a3b8' }}>{state}</span>
                          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: stateColors[state] || '#94a3b8' }} />
                          </div>
                          <span className="text-[10px] font-bold text-white/60 w-10 text-right">{pct}%</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Band Power Averages */}
              {sessionResults.avg_band_powers && (
                <div className="mb-5">
                  <div className="text-[9px] tracking-[3px] text-[var(--muted)] mb-2 uppercase">Avg Band Power</div>
                  <div className="flex gap-1.5">
                    {[
                      { key: 'delta', label: 'δ', color: '#4f8eff' },
                      { key: 'theta', label: 'θ', color: '#a855f7' },
                      { key: 'alpha', label: 'α', color: '#22c55e' },
                      { key: 'beta', label: 'β', color: '#00e5ff' },
                      { key: 'gamma', label: 'γ', color: '#f59e0b' },
                    ].map(band => {
                      const val = sessionResults.avg_band_powers[band.key] ?? 0;
                      const allVals = Object.values(sessionResults.avg_band_powers);
                      const maxVal = Math.max(...allVals, 1e-6);
                      const pct = Math.min(100, (val / maxVal) * 100);
                      return (
                        <div key={band.key} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full h-12 bg-white/5 rounded relative overflow-hidden flex items-end">
                            <div className="w-full rounded-t transition-all" style={{ height: `${pct}%`, backgroundColor: band.color + '99' }} />
                          </div>
                          <span className="text-sm font-bold" style={{ color: band.color }}>{band.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <button onClick={() => setSessionResults(null)} className="w-full py-3 rounded-xl text-sm font-black uppercase tracking-[3px] border-2 border-[var(--primary)] bg-[var(--primary)]/10 text-white hover:bg-[var(--primary)]/20 transition-all">
                CLOSE
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── MAIN DASHBOARD CONTAINER: TWO COLUMN LAYOUT ── */}
      <div className="flex-grow grid grid-cols-2 gap-4 min-w-0 min-h-0">

        {/* COLUMN 1: BRAIN ACTIVITY */}
        <div className="flex flex-col gap-4 h-full min-h-0">

          {/* BRAIN ACTIVITY HEADER PANEL (STANDALONE) */}
          <div className="panel-container shrink-0 flex flex-row items-center justify-center gap-3 h-[52px] bg-[var(--bg-panel-header)] border-[var(--border-color)]">
            <Brain className="w-5 h-5 text-[var(--accent-yellow)]" />
            <div className="text-center">
              <span className="font-bold text-[var(--text,#e4e4e7)] text-sm">Brain Activity</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium ml-2">Electroencephalogram (EEG)</span>
            </div>
          </div>

          {/* BRAIN ACTIVITY CHART PANEL (RADAR CHART) */}
          <div className="panel-container flex-[6.5] min-h-0 relative">
            <div className="flex justify-between items-center px-4 pt-4 shrink-0">
              <div className="flex items-center gap-2 text-[13px] font-bold text-[var(--text-muted)]">
                <span style={{ display: 'inline-block', width: '14px', height: '3px', background: 'var(--accent-yellow)', borderRadius: '1px' }}></span>
                <span style={{ letterSpacing: '0.02em' }}>RADAR</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black text-[var(--primary,#facc15)] uppercase tracking-widest opacity-100">Dominant:</span>
                <span id="med-dominant-val" className="text-[10px] font-black tracking-[2px] uppercase">Alpha</span>
              </div>
            </div>
            <div className="flex-grow min-h-0 relative flex items-center justify-center">
              <canvas id="med-radar" className="w-full h-full block" style={{ display: 'none' }} />
              <div className="absolute inset-0" style={{ padding: '8px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="65%">
                    <PolarGrid strokeDasharray="2 3" stroke="rgba(255,255,255,0.15)" strokeOpacity={0.6} />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 11, fontWeight: 600 }} />
                    <PolarRadiusAxis domain={[0, 'auto']} tick={false} axisLine={false} />
                    <Radar name="EEG" dataKey="value" stroke="var(--accent-yellow, #facc15)" strokeWidth={1.8}
                      fill="var(--accent-yellow, #facc15)" fillOpacity={0.18}
                      dot={{ fill: 'var(--accent-yellow, #facc15)', strokeWidth: 1, r: 3 }} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* RAW EEG OSCILLOSCOPE */}
          <div className="panel-container flex-[3.5] min-h-0">
            <div className="w-full h-full overflow-hidden relative bg-black/20">
              <GridLines gridNumberY={50} numGridLinesX={205} />
              <canvas id="med-eeg-canvas" className="w-full h-full block relative z-10" />
            </div>
          </div>

        </div>

        {/* COLUMN 2: HEART ACTIVITY */}
        <div className="flex flex-col gap-4 h-full min-h-0">

          {/* HEART ACTIVITY HEADER PANEL (STANDALONE) */}
          <div className="panel-container shrink-0 flex flex-row items-center justify-center gap-3 h-[52px] bg-[var(--bg-panel-header)] border-[var(--border-color)]">
            <Heart className="w-5 h-5 text-rose-500" />
            <div className="text-center">
              <span className="font-bold text-[var(--text,#e4e4e7)] text-sm">Heart Activity</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium ml-2">Electrocardiogram (ECG)</span>
            </div>
          </div>

          {/* HEART ACTIVITY CHART PANEL (ECG DETAILS) */}
          <div className="panel-container flex-[6.5] min-h-0" style={{ padding: '0.3rem' }}>
            <div className="flex-grow flex flex-col min-h-0 justify-between">

              {/* Top Section: Heart Rate Stats */}
              <div className="grid grid-cols-5 gap-2 flex-shrink-0 mb-3" style={{ padding: '2px' }}>
                {/* Current BPM */}
                <div className="col-span-2 flex flex-col justify-center pr-1 sm:pr-2 md:pr-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-[#f43f5e] leading-none">
                      {ecgMeta.bpm != null ? Math.round(ecgMeta.bpm) : '--'}
                    </span>
                    <span className="text-md sm:text-sm md:text-md lg:text-lg text-[var(--text-muted)] leading-none font-bold">
                      BPM
                    </span>
                  </div>
                </div>

                {/* Stats cards */}
                <div className="col-span-3 grid grid-cols-3 gap-1 sm:gap-2 md:gap-3">
                  {/* Low stat */}
                  <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                    <span className="text-sm text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                      LOW
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-white leading-none">
                        {bpmStats.low ?? '--'}
                      </span>
                      <span className="text-xs sm:text-sm md:text-lg text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                        BPM
                      </span>
                    </div>
                  </div>

                  {/* Avg stat */}
                  <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                    <span className="text-sm text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                      AVG
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-white leading-none">
                        {bpmStats.avg ?? '--'}
                      </span>
                      <span className="text-xs sm:text-lg md:text-lg text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                        BPM
                      </span>
                    </div>
                  </div>

                  {/* High stat */}
                  <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                    <span className="text-sm text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                      HIGH
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg sm:text-sm md:text-base lg:text-lg font-semibold text-white leading-none">
                        {bpmStats.high ?? '--'}
                      </span>
                      <span className="text-lg sm:text-xs md:text-lg text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                        BPM
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart Grid Area */}
              <div className="flex-grow relative w-full overflow-hidden my-3 min-h-0 bg-black/20">
                {rrHistory.length >= 2 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={rrHistory} margin={{ top: 12, right: 12, left: -24, bottom: 8 }}>
                      <CartesianGrid stroke="rgba(128,128,128,0.08)" strokeDasharray="1 0" />
                      <XAxis dataKey="t" hide />
                      <YAxis
                        stroke="rgba(255,255,255,0.08)"
                        tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 8, fontWeight: 600 }}
                        width={38}
                        domain={[200, 1200]}
                        ticks={[200, 400, 600, 800, 1000, 1200]}
                      />
                      <Line type="stepAfter" dataKey="rr" stroke="var(--primary, #eab308)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[10px] text-white/10 font-mono">No HRV data</div>
                )}
              </div>

              {/* Bottom Row: 4 Equal-width Columns */}
              <div className="grid grid-cols-4 gap-1 sm:gap-2 flex-shrink-0 mb-3" style={{ marginBottom: "1px" }}>
                <div className="flex flex-col items-center bg-[#222225] rounded-xl" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--text-muted)] mb-1" style={{ fontSize: '16px' }}>
                    LOW HRV
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold text-white">
                      {hrvStats.low ?? '--'}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]" style={{ fontSize: '16px' }}>
                      ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center bg-[#222225] rounded-lg" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--text-muted)] mb-1" style={{ fontSize: '16px' }}>
                    AVG HRV
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold text-[var(--accent-yellow)]">
                      {hrvStats.avg ?? '--'}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]" style={{ fontSize: '16px' }}>
                      ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center bg-[#222225] rounded-lg" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--text-muted)] mb-1" style={{ fontSize: '16px' }}>
                    HIGH HRV
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-semibold text-white">
                      {hrvStats.high ?? '--'}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]" style={{ fontSize: '16px' }}>
                      ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center bg-[#222225] rounded-lg justify-center" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--accent-yellow)] mb-1" style={{ fontSize: '16px' }}>
                    State
                  </span>
                  <div className="flex items-center justify-center min-h-[24px]">
                    <StateIndicator state={mapStateToIndicator(mindState.state)} />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* RAW ECG OSCILLOSCOPE */}
          <div className="panel-container flex-[3.5] min-h-0">
            <div className="w-full h-full overflow-hidden relative bg-black/20">
              <GridLines gridNumberY={100} numGridLinesX={205} />
              <canvas id="med-ecg-canvas" className="w-full h-full block relative z-10" />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};

export default MeditationView;
