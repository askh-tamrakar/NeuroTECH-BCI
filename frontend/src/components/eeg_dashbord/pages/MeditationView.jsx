import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { Play, Wind, Power, Zap, Volume2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import FFTWorker from '../../../workers/fft.worker.js?worker';
import '../../../styles/views/MeditationView.css';
import MeditationSidebar from '../sidebar/MeditationSidebar';
import { useSidebar } from './SidebarContext';

/* ── REAL SOUNDSCAPE TRACKS ────────────────────── */
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
  { quote: 'The present moment is the only moment available to us, and it is the door to all moments.', author: '— Thích Nhất Hạnh' },
  { quote: 'Meditation is not evasion; it is a serene encounter with reality.', author: '— Thích Nhất Hạnh' },
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

/* ── PRESETS (minutes) ─────────────────────────── */
const PRESETS = [3, 5, 10, 15];

const MeditationView = ({ result, wsEvent, wsUrl, currentView, onNavigate }) => {
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

  // Keep wsEventRef fresh — captures raw eeg_prediction events with full feature set
  useEffect(() => {
    wsEventRef.current = wsEvent;
  }, [wsEvent]);
  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  const [wisdomIdx] = useState(() => Math.floor(Math.random() * WISDOM.length));

  /* ── LIVE MIND STATE ───────────────────────── */
  const [mindState, setMindState] = useState({ state: 'Neutral', level: 0, all: {} });

  /* ── MUSIC MIXER STATE ─────────────────────── */
  const [musicState, setMusicState] = useState(
    TRACKS.map(t => ({ id: t.id, label: t.label, active: false, vol: 0.8, category: t.category }))
  );

  /* ── AUDIO REFS (one Audio object per track) ── */
  const audioRefs = useRef({});
  useEffect(() => {
    // Create Audio objects once on mount — high initial volume
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

  /* ── FFT WORKER STATE ──────────────────────── */
  const [spectra, setSpectra] = useState({});
  const [selectedChannel, setSelectedChannel] = useState('0');

  // Keep spectraRef fresh — used to drive the radar chart from the LIVE FFT graph data
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

  /* ── VOLUME SYNC ONLY (no play/pause here) ──── */
  // play/pause must happen synchronously inside the user-click handler
  // to satisfy browser autoplay policy — see toggleMusic below
  useEffect(() => {
    musicState.forEach(m => {
      const audio = audioRefs.current[m.id];
      if (!audio) return;
      audio.volume = Math.max(0, Math.min(1, m.vol));
    });
  }, [musicState]);

  /* ── PERSISTENT STATS ──────────────────────── */
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
    // Play/pause synchronously HERE — this is the direct user-gesture context.
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

  /* ── MASTER VOLUME ────────────────────────── */
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

  const { setSidebarSlot } = useSidebar();

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

    /* ── CANVASES ──────────────────────────────── */
    const radar = $('med-radar');
    const ctxRadar = radar?.getContext('2d');

    if (!ctxRadar) return;

    /* ── STATE ─────────────────────────────────── */
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

    /* ── EMA SMOOTHING ──────────────────────────── */
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

    /* ── THEME COLOR HELPER ────────────────────── */
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

    /* ── RESIZE ────────────────────────────────── */
    function resizeCanvas(canvas) {
      if (!canvas || !canvas.parentElement) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      canvas.width = rect.width;
      canvas.height = rect.height;
    }
    function resizeAll() {
      [radar].forEach(resizeCanvas);
    }
    window.addEventListener('resize', resizeAll);
    // defer first resize so DOM is painted
    setTimeout(resizeAll, 50);

    /* ── RADAR DRAW ────────────────────────────── */
    function drawRadar(ctx, bands, isLeft) {
      if (!ctx || !ctx.canvas) return;
      const W = ctx.canvas.width, H = ctx.canvas.height;
      if (!W || !H) return;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2, cy = H / 2;
      const R = Math.min(W, H) * 0.36;
      const n = 5;
      const labels = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
      const angles = labels.map((_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);

      const primary = tc('--primary');
      const line1 = isLeft ? tc('--graph-line-1') : tc('--primary');
      const gridCol = tc('--graph-grid', 'rgba(255,255,255,0.06)');

      // Grid rings — 5 rings: 0, 25, 50, 75, 100
      // INNER is the fraction for the "0" baseline ring (no-signal pentagon)
      const INNER = 0.12;
      const ringFracs  = [INNER, INNER + 0.22, INNER + 0.44, INNER + 0.66, 1.0];
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
          ? hex2rgba(primary, 0.30)
          : frac === INNER
            ? hex2rgba(primary, 0.50)   // inner "0" ring is brighter — it's the baseline
            : hex2rgba(gridCol, 0.8);
        ctx.lineWidth = frac === 1.0 ? 1.2 : frac === INNER ? 1.0 : 0.6;
        ctx.stroke();

        // Numeric labels
        ctx.font = 'bold 9px "Share Tech Mono", monospace';
        ctx.fillStyle = hex2rgba(primary, frac === INNER ? 0.9 : 0.6);
        ctx.textAlign = 'center';
        ctx.fillText(ringLabels[ri], cx, cy - R * frac - 3);
      });

      // Spokes
      angles.forEach(a => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        ctx.strokeStyle = hex2rgba(primary, 0.12);
        ctx.lineWidth = 0.7;
        ctx.stroke();
      });

      // Data polygon — remapped so norm=0 sits ON the 0-ring, norm=1 reaches outer edge
      const total = bands.reduce((a, b) => a + b, 0) || 100;
      const norm  = bands.map(v => v / total);

      ctx.beginPath();
      angles.forEach((a, i) => {
        // Map: 0 → INNER ring, 1 → full radius
        const r = (INNER + norm[i] * (1 - INNER)) * R;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, hex2rgba(line1, 0.40));
      grad.addColorStop(1, hex2rgba(line1, 0.06));
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = line1;
      ctx.lineWidth = 1.5;
      ctx.shadowBlur = 10; ctx.shadowColor = line1;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Band label colors — neon palette per wave type
      const bandColors = [
        '#4f8eff', // Delta — blue
        '#a855f7', // Theta — purple
        '#22c55e', // Alpha — green
        '#00e5ff', // Beta  — cyan
        '#f59e0b', // Gamma — amber
      ];

      // Vertex dots + highlighted labels
      const textCol = tc('--graph-text', tc('--muted'));
      angles.forEach((a, i) => {
        const r = R * norm[i];
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        // Glowing dot at data vertex
        ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = bandColors[i];
        ctx.shadowBlur = 12; ctx.shadowColor = bandColors[i];
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label position — further out from center
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

        // Label text — no glow
        ctx.fillStyle = bandColors[i];
        ctx.fillText(labels[i], lx, ly);
      });
      ctx.restore();
    }

    function startLiveStream() {
      eegMode = 'ws';
      if (fetchInterval) clearInterval(fetchInterval);
      fetchInterval = setInterval(() => {
        const ws  = wsEventRef.current;  // raw eeg_prediction — has full features
        const res = resultRef.current;   // processed result  — has state/band_mix/score

        // If disconnected from backend, force wave bands to 0 immediately
        if (!wsUrlRef.current || ws?.status === 'disconnected' || res?.status === 'disconnected') {
           rawBands = [0, 0, 0, 0, 0];
           calmSignal = 0;
           return;
        }

        // ── BAND POWERS ──────────────────────────────────────────────────────
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
          
          // ── CALM SIGNAL ──────────────────────────────────────────────────────
          const total = delta + theta + alpha + beta + 1e-6;
          const alphaRel = alpha / total;
          const betaRel  = beta / total;
          const thetaRel = theta / total;
          
          // Calm = high alpha/theta, low beta — smoothed
          const rawCalm = Math.max(0, Math.min(1, (alphaRel + thetaRel * 0.5) * 1.5 - (betaRel * 0.5)));
          smoothCalm = ema(smoothCalm, rawCalm, EMA_ALPHA);
          calmSignal = smoothCalm;
        } else {
          // Fallback to wsEvent.features if FFT stream not ready
          const feat = ws?.features || res?.features;
          if (feat?.delta !== undefined) {
            rawBands = [feat.delta||0, feat.theta||0, feat.alpha||0, feat.beta||0, 0];
            const alphaRel = feat.alpha_rel || 0;
            const betaRel  = feat.beta_rel  || 0;
            calmSignal = Math.max(0, Math.min(1, alphaRel * 1.5 - betaRel * 0.5));
          }
        }
      }, 60);
    }

    /* ── PHASE LOGIC ───────────────────────────── */
    function getPhase() {
      let t = breathTick % TOTAL_CYCLE;
      for (let i = 0; i < PHASES.length; i++) {
        if (t < PHASES[i].dur) return { phase: PHASES[i], idx: i, progress: t / PHASES[i].dur };
        t -= PHASES[i].dur;
      }
      return { phase: PHASES[0], idx: 0, progress: 0 };
    }

    /* ── UPDATE DOM ────────────────────────────── */
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

      // ── Focus & Stress live values ────────────────────────────────
      // eegResult is already the spread of wsEvent.output — fields live at top level
      const ws2  = wsEventRef.current;
      const res2 = resultRef.current;
      const out2 = res2 || {};
      const feat2 = ws2?.features || res2?.features;

      // ── Update mind state from backend ────────────────────────────
      if (out2.state) {
        setMindState({ state: out2.state, level: out2.state_level ?? 0, all: out2.all_states || {} });
      }

      let focusVal  = 0;
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
        // Backend-computed scores — still smooth them
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
         const betaRel  = beta / total2;
         const thetaRel = theta / total2;
         rawFocus  = Math.min(100, Math.max(0, (alphaRel + thetaRel * 0.5) * 200));
         const si = beta / (alpha + theta + 1e-6);
         rawStress = Math.min(100, Math.max(0, (Math.min(si, 3.0) / 3.0) * 100));
        } else if (feat2?.alpha !== undefined) {
          const total2 = (feat2.delta||0) + (feat2.theta||0) + (feat2.alpha||0) + (feat2.beta||0) + 1e-6;
          const alphaRel = (feat2.alpha||0) / total2;
          const betaRel  = (feat2.beta||0)  / total2;
          const thetaRel = (feat2.theta||0) / total2;
          rawFocus  = Math.min(100, Math.max(0, (alphaRel + thetaRel * 0.5) * 200));
          const si2 = (feat2.beta||0) / ((feat2.alpha||0) + (feat2.theta||0) + 1e-6);
          rawStress = Math.min(100, Math.max(0, (Math.min(si2, 3.0) / 3.0) * 100));
        } else if (res2?.meditation_score !== undefined) {
          rawFocus  = res2.meditation_score || 0;
          rawStress = Math.max(0, 100 - rawFocus);
        }
      }

      // EMA smooth focus & stress
      smoothFocus  = ema(smoothFocus, rawFocus, EMA_ALPHA);
      smoothStress = ema(smoothStress, rawStress, EMA_ALPHA);
      focusVal  = Math.round(smoothFocus);
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

    /* ── MAIN LOOP ─────────────────────────────── */
    function loop(ts) {
      animId = requestAnimationFrame(loop);

      if (sessionRunning) {
        if (lastTS === null) lastTS = ts;
        const dt = (ts - lastTS) / 1000;
        lastTS = ts;
        breathTick += dt;
        if (Math.floor(breathTick) > 0 && Math.floor(breathTick) % TOTAL_CYCLE < dt) cycleCount++;
      } else {
        lastTS = null;
      }

      const phaseInfo = getPhase();

      // Dominant Wave Calculation — with hold timer to prevent rapid flicker
      const labels = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
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

      drawRadar(ctxRadar, rawBands, true);
      updateDOM(phaseInfo);
    }

    /* ── SESSION PERSISTENCE ───────────────────── */
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

    /* ── EXPOSED HANDLERS ──────────────────────── */
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
      }).catch(() => {});

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
        .catch(() => {});

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

  const wisdom = WISDOM[wisdomIdx];

  return (
    <div className="w-full h-full flex bg-bg overflow-hidden relative" ref={containerRef}>

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
                      .sort(([,a], [,b]) => b - a)
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

      {/* ══ CENTER AREA: Main Charts ═══════════════════════════════ */}
      <div className="flex-grow flex flex-col transition-all duration-300">
        <div className="med-main">
          {/* Top row: Brain Activity & Focus Orb */}
          <div className="med-charts-row">
            {/* Brain Activity (Radar) */}
            <div className="med-chart-panel">
              <div className="med-section-header">
                <span className="med-section-icon">⬡</span>
                <span className="med-section-title" style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', fontWeight: '800', letterSpacing: '3px', color: 'var(--primary)', textShadow: '0 0 12px var(--primary)', textTransform: 'uppercase' }}>Brain Activity</span>
                <span className="med-section-sub" style={{ fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)', opacity: '.8', marginLeft: '2px' }}> · EEG (Fpz)</span>
                <div className="ml-auto flex items-center gap-2 pr-2">
                  <span className="text-[8px] font-black text-[var(--primary)] uppercase tracking-widest opacity-100">Dominant:</span>
                  <span id="med-dominant-val" className="text-[10px] font-black tracking-[2px] uppercase">Alpha</span>
                </div>
              </div>
              <canvas id="med-radar" className="med-radar-canvas" />
            </div>

            {/* Focus Bubble (Breathing) */}
            <div className="med-chart-panel border-l border-border/50">
              <div className="med-section-header">
                <span className="med-section-icon" style={{ marginLeft: '-2px' }}>◎</span>
                <span className="med-section-title" style={{ fontFamily: 'Orbitron, sans-serif', fontSize: '10px', fontWeight: '800', letterSpacing: '3px', color: 'var(--primary)', textShadow: '0 0 12px var(--primary)', textTransform: 'uppercase' }}>Respiration</span>
                <span className="med-section-sub" style={{ fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)', opacity: '.8', marginLeft: '2px' }}> · Focus Bubble</span>
              </div>

              {/* Real-time Metrics Overlays */}
              <div className="absolute top-16 left-4 right-4 flex justify-between z-10 pointer-events-none">
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black text-primary tracking-widest uppercase opacity-100">Focus</span>
                  <span id="med-focus-val" className="text-2xl font-black text-primary font-mono tabular-nums drop-shadow-glow">0</span>
                </div>
                {/* Live Mind State Badge */}
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-black tracking-[3px] uppercase" style={{ color: 'var(--muted)' }}>State</span>
                  <span
                    className="px-3 py-1 rounded-full text-[10px] font-black tracking-[2px] uppercase border transition-all duration-500"
                    style={{
                      backgroundColor: {
                        Focus: 'rgba(14,165,233,0.15)', Calm: 'rgba(168,85,247,0.15)',
                        Relaxed: 'rgba(34,197,94,0.15)', Stressed: 'rgba(244,63,94,0.15)',
                        Drowsy: 'rgba(245,158,11,0.15)', Neutral: 'rgba(148,163,184,0.15)',
                      }[mindState.state] || 'rgba(148,163,184,0.15)',
                      borderColor: {
                        Focus: 'rgba(14,165,233,0.4)', Calm: 'rgba(168,85,247,0.4)',
                        Relaxed: 'rgba(34,197,94,0.4)', Stressed: 'rgba(244,63,94,0.4)',
                        Drowsy: 'rgba(245,158,11,0.4)', Neutral: 'rgba(148,163,184,0.3)',
                      }[mindState.state] || 'rgba(148,163,184,0.3)',
                      color: {
                        Focus: '#0ea5e9', Calm: '#a855f7', Relaxed: '#22c55e',
                        Stressed: '#f43f5e', Drowsy: '#f59e0b', Neutral: '#94a3b8',
                      }[mindState.state] || '#94a3b8',
                      boxShadow: `0 0 12px ${({
                        Focus: 'rgba(14,165,233,0.3)', Calm: 'rgba(168,85,247,0.3)',
                        Relaxed: 'rgba(34,197,94,0.3)', Stressed: 'rgba(244,63,94,0.3)',
                        Drowsy: 'rgba(245,158,11,0.3)', Neutral: 'transparent',
                      }[mindState.state] || 'transparent')}`,
                    }}
                  >
                    {mindState.state}
                  </span>
                  <span className="text-[8px] font-mono tabular-nums" style={{ color: 'var(--muted)' }}>{mindState.level}%</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[10px] font-black text-red-500 tracking-widest uppercase opacity-100">Stress</span>
                  <span id="med-stress-val" className="text-2xl font-black text-red-500 font-mono tabular-nums drop-shadow-glow">0</span>
                </div>
              </div>

              <div className="flex-grow flex flex-col items-center justify-center relative bg-bg/20">
                <div className="relative w-64 h-64 flex items-center justify-center">
                  {/* Outer glow ring limits */}
                  <div className="absolute inset-2 rounded-full border border-primary/20 opacity-50 border-dashed" style={{ boxShadow: 'inset 0 0 40px rgba(0,255,255,0.1)' }} />

                  {/* The animated bubble */}
                  <div id="med-focus-orb" className="w-16 h-16 rounded-full bg-gradient-to-tr from-primary/80 to-primary/30 backdrop-blur-sm transition-transform duration-75 border border-primary/50 flex flex-col items-center justify-center relative overflow-hidden will-change-transform z-10" style={{ transformOrigin: 'center center', boxShadow: '0 0 40px var(--primary)' }}>
                    {/* Inner sheen */}
                    <div className="absolute inset-0 bg-white/20 rounded-full w-full h-[30%] -top-[10%] blur-sm pointer-events-none" />
                  </div>
                </div>

                <div id="med-orb-text" className="absolute bottom-8 font-mono text-primary/80 font-bold tracking-[0.3em] uppercase text-xl transition-all">READY</div>
              </div>
            </div>
          </div>

          {/* Bottom FFT Chart */}
          <div className="med-waves-col" style={{ height: '38%', padding: '15px' }}>
            <div className="flex justify-between items-end mb-2 w-full">
               <div className="med-wave-label tracking-widest text-[10px] uppercase font-black text-muted opacity-100">
                 Power Spectrum (FFT)
               </div>
               <div className="med-calm-bar-wrap shrink-0" style={{ width: '120px' }}>
                 <span style={{ fontSize: '9px', fontWeight: '900' }}>CALM</span>
                 <div className="med-calm-track">
                   <div className="med-calm-fill" id="med-calm-fill" />
                 </div>
                 <span className="med-calm-pct" id="med-calm-pct" style={{ color: 'var(--primary)', fontWeight: '900', width: '28px', opacity: '1' }}>0%</span>
               </div>
            </div>
            
            <div className="flex-grow w-full relative">
              {(() => {
                 const data = spectra[selectedChannel] || spectra['0'] || spectra['1'] || Object.values(spectra)[0];
                 const chartData = data ? data.filter(d => d.freq >= 1 && d.freq <= 50) : [];
                 
                 return chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.15)" vertical={false} />
                            <XAxis
                                dataKey="freq"
                                stroke="#9ca3af"
                                tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 'bold' }}
                                tickCount={25}
                                type="number"
                                domain={[1, 50]}
                            />
                            <YAxis
                                stroke="#9ca3af"
                                tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 'bold' }}
                                tickFormatter={(val) => val.toExponential(0)}
                                width={40}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid var(--primary)', borderRadius: '8px' }}
                                itemStyle={{ color: 'var(--primary)', fontWeight: 'bold' }}
                                labelStyle={{ color: '#fff' }}
                                formatter={(value) => [value.toExponential(2), 'Power']}
                                labelFormatter={(label) => `${label} Hz`}
                            />
                            <Line
                                type="monotone"
                                dataKey="power"
                                stroke="var(--primary)"
                                strokeWidth={2}
                                dot={false}
                                activeDot={{ r: 4, fill: 'var(--bg)', stroke: 'var(--primary)', strokeWidth: 2 }}
                                isAnimationActive={false}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                 ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-50">
                        <div className="inline-block w-6 h-6 border-2 border-t-primary border-r-primary border-b-transparent border-l-transparent rounded-full animate-spin mb-2" />
                        <span className="text-xs text-muted">Waiting for raw EEG stream...</span>
                    </div>
                 );
              })()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeditationView;