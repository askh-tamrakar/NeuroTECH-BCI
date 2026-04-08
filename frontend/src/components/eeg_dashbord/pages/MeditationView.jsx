import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { Play, Wind, Power, Zap, Volume2, Radio } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import FFTWorker from '../../../workers/fft.worker.js?worker';
import '../../../styles/views/MeditationView.css';
import MeditationSidebar from '../sidebar/MeditationSidebar';
import { useSidebar } from './SidebarContext';

/* ── REAL SOUNDSCAPE TRACKS ────────────────────── */
const TRACKS = [
  { id: 'stress_melt', label: 'Singing Bowl Waves', file: '/Resources/eeg_music/meditativetiger-stress-melt-gentle-singing-bowl-waves-489168.mp3', category: 'meditation' },
  { id: 'nature_calm', label: 'Nature Calm', file: '/Resources/eeg_music/andriig-nature-calm-music-507173.mp3', category: 'meditation' },
  { id: 'xylophone', label: 'Xylophone & Forest', file: '/Resources/eeg_music/mandakimdk-xylophone-and-forest-307174.mp3', category: 'meditation' },
  { id: 'soft_calm', label: 'Soft Calm Background', file: '/Resources/eeg_music/krasnoshchok-background-music-soft-calm-404429.mp3', category: 'focus' },
  { id: 'dark_ambient', label: 'Dark Desolation', file: '/Resources/eeg_music/aberrantrealities-dark-desolation-ambience-219091.mp3', category: 'focus' },
  { id: 'funk_rock', label: 'Funk Rock', file: '/Resources/eeg_music/kandlaker-funk-rock-2-226325.mp3', category: 'focus' },
  { id: 'countdown', label: 'Countdown', file: '/Resources/eeg_music/kaden_cook-countdown-219722.mp3', category: 'focus' },
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
  
  // Keep resultRef fresh for the requestAnimationFrame loop
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  // Keep wsEventRef fresh — captures raw eeg_prediction events with full feature set
  useEffect(() => {
    wsEventRef.current = wsEvent;
  }, [wsEvent]);



  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  const [wisdomIdx] = useState(() => Math.floor(Math.random() * WISDOM.length));

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
                    setSelectedChannel(ch => (prev[ch] ? ch : keys[0]));
                }
                return e.data.payload;
            });
        }
    };

    return () => {
        dataWorker.postMessage({ type: 'DISCONNECT' });
        dataWorker.terminate();
        fftWorker.terminate();
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

  const { setSidebarSlot, setSidebarMiniSlot } = useSidebar();

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
    setSidebarMiniSlot(
      <div className="flex h-full w-full flex-col items-center gap-3 px-2 py-3 [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary/35 bg-primary/10 text-primary">
            <Wind size={18} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[2px] text-primary [writing-mode:vertical-rl] rotate-180">
            Meditate
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-primary/20 bg-bg/60 px-1.5 py-2 shadow-[0_0_12px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={() => containerRef.current?.sessionBtnHandler()}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-green-500/35 bg-green-500/10 text-green-400"
            title="Start or stop session"
          >
            <Play size={18} />
          </button>
          <button
            type="button"
            onClick={() => containerRef.current?.toggleConnHandler()}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg)] text-[var(--text)]"
            title="Toggle live mode"
          >
            <Power size={18} />
          </button>
        </div>

        <div className="flex w-full flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 px-1.5 py-2">
          <span className="text-center text-[8px] font-black uppercase tracking-[2px] text-[var(--muted)] mb-1">Timer</span>
          <div className="flex flex-col gap-1">
            {PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => containerRef.current?.presetHandler(min)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 py-2 text-[9px] font-black uppercase tracking-[1.5px] text-[var(--muted)] hover:border-primary/50 hover:bg-primary/10 hover:text-primary transition-all"
                title={`Set ${min} minute session`}
              >
                {min}m
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-1.5 py-2 text-center">
          <div className="text-[8px] font-black uppercase tracking-[2px] text-[var(--muted)]">Calm</div>
          <div className="text-[10px] font-black text-primary">{Math.round((result?.meditation_score || 0))}%</div>
          <div className="text-[8px] font-black uppercase tracking-[1.5px] text-primary/70">
            {musicState.filter((m) => m.active).length} tracks
          </div>
        </div>
      </div>
    );
  }, [musicState, masterVol, stats, wisdomIdx, toggleMusic, updateVol, onMasterVol, setSidebarSlot, setSidebarMiniSlot, result]);

  // Separate cleanup-only effect: clear slot on unmount
  useEffect(() => {
    return () => {
      setSidebarSlot(null);
      setSidebarMiniSlot(null);
    };
  }, [setSidebarSlot, setSidebarMiniSlot]);


  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => container.querySelector(`#${id}`);

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
    let rawBands = [20, 20, 25, 20, 0]; // gamma always 0

    let breathTick = 0;
    let cycleCount = 0;
    let lastTS = null;

    let calmAcc = 0, calmSamples = 0;

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
      angles.forEach((a, i) => {
        // CORRECTED: use same remapped radius as the polygon
        const r = (INNER + norm[i] * (1 - INNER)) * R;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;

        // Glowing dot at data vertex
        ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fillStyle = bandColors[i];
        ctx.shadowBlur = 16; ctx.shadowColor = bandColors[i];
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label position — far enough out so they never overlap the polygon
        const labelDist = R * 1.22 + 18;
        const lx = cx + Math.cos(a) * labelDist;
        const ly = cy + Math.sin(a) * labelDist;

        ctx.font = 'bold 13px "Orbitron", "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Percentage value — gamma (index 4) always shows 0
        const pct = i === 4 ? 0 : Math.round(norm[i] * 100);
        const labelText = labels[i];
        const pctText = `${pct}%`;

        // Badge background sized for two lines
        const labelW = Math.max(ctx.measureText(labelText).width, ctx.measureText(pctText).width) + 16;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.beginPath();
        ctx.roundRect(lx - labelW / 2, ly - 14, labelW, 28, 6);
        ctx.fill();

        // Band name
        ctx.fillStyle = bandColors[i];
        ctx.shadowBlur = 6; ctx.shadowColor = bandColors[i];
        ctx.fillText(labelText, lx, ly - 4);
        ctx.shadowBlur = 0;

        // Percentage in dimmer text
        ctx.font = 'bold 10px "Share Tech Mono", monospace';
        ctx.fillStyle = `${bandColors[i]}cc`;
        ctx.fillText(pctText, lx, ly + 10);
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
          
          // Use raw powers instead of log — radar normalizes them anyway
          rawBands = [delta, theta, alpha, beta, 0];
          
          // ── CALM SIGNAL ──────────────────────────────────────────────────────
          const total = delta + theta + alpha + beta + 1e-6;
          const alphaRel = alpha / total;
          const betaRel  = beta / total;
          const thetaRel = theta / total;
          
          // Calm = high alpha/theta, low beta
          calmSignal = Math.max(0, Math.min(1, (alphaRel + thetaRel * 0.5) * 1.5 - (betaRel * 0.5)));
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
      // Focus = alpha/theta dominance over beta  (0-100)
      // Stress = beta dominance, inverse of calm (0-100)
      const ws2  = wsEventRef.current;
      const res2 = resultRef.current;
      const feat2 = ws2?.features || res2?.features;

      // Focus & Stress also using spectra-derived features for consistency
      const activeCh2 = (ws2?.source_channel !== undefined) ? String(ws2.source_channel) : selectedChannelRef.current;
      const currentSp = spectraRef.current[activeCh2] || spectraRef.current[selectedChannelRef.current] || Object.values(spectraRef.current)[0] || [];
      let focusVal  = 0;
      let stressVal = 0;

      if (!wsUrlRef.current || ws2?.status === 'disconnected' || res2?.status === 'disconnected') {
         focusVal = 0;
         stressVal = 0;
      } else if (currentSp.length > 0) {
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
         focusVal  = Math.round(Math.min(100, Math.max(0, (alphaRel + thetaRel * 0.5) * 200)));
         stressVal = Math.round(Math.min(100, Math.max(0, betaRel * 300)));
      } else if (feat2?.alpha !== undefined) {
        const total2 = (feat2.delta||0) + (feat2.theta||0) + (feat2.alpha||0) + (feat2.beta||0) + 1e-6;
        const alphaRel = (feat2.alpha||0) / total2;
        const betaRel  = (feat2.beta||0)  / total2;
        const thetaRel = (feat2.theta||0) / total2;
        focusVal  = Math.round(Math.min(100, Math.max(0, (alphaRel + thetaRel * 0.5) * 200)));
        stressVal = Math.round(Math.min(100, Math.max(0, betaRel * 300)));
      } else if (res2?.meditation_score !== undefined) {
        focusVal  = Math.round(res2.meditation_score || 0);
        stressVal = Math.round(Math.max(0, 100 - focusVal));
      }

      const fv = $('med-focus-val');
      if (fv) fv.textContent = focusVal;
      const sv = $('med-stress-val');
      if (sv) sv.textContent = stressVal;

      // ── Sidebar indicators ────────────────────────────────────────
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

      // Dominant Wave Calculation
      const labels = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
      const maxVal = Math.max(...rawBands);
      const dominantIdx = rawBands.indexOf(maxVal);
      const dominantWaveName = labels[dominantIdx];

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

      // Update Expanded Button
      const btn = $('med-session-btn');
      if (btn) {
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg> END SESSION`;
        btn.className = 'w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20';
      }

      // Update Collapsed Button
      const colBtn = $('med-col-session-btn');
      if (colBtn) {
        colBtn.className = 'transition-colors group relative p-3 rounded-full text-red-500 hover:bg-red-500/20';
        $('med-col-play')?.classList.add('hidden');
        $('med-col-stop')?.classList.remove('hidden');
        const tt = $('med-col-tooltip-session');
        if (tt) tt.textContent = 'End Session';
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

    // Auto-start EEG data reading as soon as the component mounts.
    // The session toggle only controls the breathing timer, not data flow.
    startLiveStream();
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
                <span className="med-section-sub" style={{ fontSize: '8px', letterSpacing: '2px', color: 'var(--muted)', opacity: '.8', marginLeft: '2px' }}> · {wsEvent?.source_channel !== undefined ? `CH${wsEvent.source_channel}` : 'EEG'} {wsEvent?.preset === 'frontal_fp1' ? '(Fp1)' : (wsEvent?.preset === 'visual_eeg_oz' ? '(Oz)' : '')}</span>
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

          {/* Bottom FFT Chart — FFTView style */}
          <div className="med-waves-col" style={{ height: '38%', padding: '15px 20px' }}>

            {/* ── Header row ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              {/* Left: icon + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '7px', background: 'rgba(168,85,247,0.12)', borderRadius: '10px', display: 'flex' }}>
                  <Radio size={16} color="#a855f7" />
                </div>
                <span style={{ backgroundImage: 'linear-gradient(135deg,#a855f7,#d946ef)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontSize: '11px', fontWeight: '800', letterSpacing: '3px', fontFamily: 'Orbitron,sans-serif', textTransform: 'uppercase' }}>
                  Power Spectrum (FFT)
                </span>
              </div>

              {/* Right: calm bar only */}
              <div className="med-calm-bar-wrap shrink-0" style={{ width: '110px' }}>
                <span style={{ fontSize: '9px', fontWeight: '900' }}>CALM</span>
                <div className="med-calm-track">
                  <div className="med-calm-fill" id="med-calm-fill" />
                </div>
                <span className="med-calm-pct" id="med-calm-pct" style={{ color: 'var(--primary)', fontWeight: '900', width: '28px', opacity: '1' }}>0%</span>
              </div>
            </div>

            {/* ── Chart area ── */}
            <div style={{ flexGrow: 1, position: 'relative', background: 'rgba(0,0,0,0.20)', borderRadius: '14px', border: '1px solid rgba(168,85,247,0.15)', padding: '10px 6px 4px', overflow: 'hidden', minHeight: 0 }} className="flex-grow w-full">
              {(() => {
                 const activeCh = wsEvent?.source_channel !== undefined ? String(wsEvent.source_channel) : selectedChannel;
                 const data = spectra[activeCh] || spectra[selectedChannel] || Object.values(spectra)[0];
                 const chartData = data ? data.filter(d => d.freq >= 1 && d.freq <= 50) : [];

                 // Find the peak point (highest power)
                 const peak = chartData.reduce((best, d) => (!best || d.power > best.power ? d : best), null);

                 return chartData.length > 0 ? (
                   <>
                     <ResponsiveContainer width="100%" height="100%">
                         <LineChart data={chartData} margin={{ top: 5, right: 12, left: 8, bottom: 18 }}>
                             <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                             <XAxis
                                 dataKey="freq"
                                 stroke="#9ca3af"
                                 tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 'bold' }}
                                 tickCount={25}
                                 type="number"
                                 domain={[1, 50]}
                                 label={{ value: 'Frequency (Hz)', position: 'insideBottom', offset: -10, fill: '#9ca3af', fontSize: 10 }}
                             />
                             <YAxis
                                 stroke="#9ca3af"
                                 tick={{ fill: '#9ca3af', fontSize: 10, fontWeight: 'bold' }}
                                 tickFormatter={(val) => val.toExponential(1)}
                                 width={48}
                                 label={{ value: 'Power', angle: -90, position: 'insideLeft', fill: '#9ca3af', fontSize: 10 }}
                             />
                             <Tooltip
                                 contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: '1px solid #a855f7', borderRadius: '8px' }}
                                 itemStyle={{ color: '#a855f7', fontWeight: 'bold' }}
                                 labelStyle={{ color: '#fff' }}
                                 formatter={(value) => [value.toExponential(2), 'Power']}
                                 labelFormatter={(label) => `${label} Hz`}
                             />
                             <Line
                                 type="monotone"
                                 dataKey="power"
                                 stroke="#a855f7"
                                 strokeWidth={2}
                                 dot={(props) => {
                                   if (!peak) return null;
                                   const { cx, cy, payload } = props;
                                   if (payload.freq !== peak.freq) return null;
                                   return (
                                     <g key={`peak-dot-${peak.freq}`}>
                                       {/* outer glow ring */}
                                       <circle cx={cx} cy={cy} r={10} fill="rgba(245,158,11,0.15)" stroke="rgba(245,158,11,0.4)" strokeWidth={1} />
                                       {/* inner dot */}
                                       <circle cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#fff" strokeWidth={1.5} />
                                       {/* crosshair lines */}
                                       <line x1={cx} y1={cy - 14} x2={cx} y2={cy - 7} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2 2" />
                                       <line x1={cx} y1={cy + 7} x2={cx} y2={cy + 14} stroke="#f59e0b" strokeWidth={1} strokeDasharray="2 2" />
                                     </g>
                                   );
                                 }}
                                 activeDot={{ r: 5, fill: '#d946ef', stroke: '#fff', strokeWidth: 2 }}
                                 isAnimationActive={false}
                             />
                             {/* No ReferenceLine — peak shown as glowing dot above */}
                         </LineChart>
                     </ResponsiveContainer>

                     {/* Peak info badge */}
                     {peak && (
                       <div style={{ position: 'absolute', top: '10px', left: '58px', background: 'rgba(0,0,0,0.70)', padding: '3px 10px', borderRadius: '8px', border: '1px solid rgba(245,158,11,0.45)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                         <span style={{ fontSize: '0.65rem', color: '#9ca3af', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px' }}>Peak</span>
                         <span style={{ fontSize: '0.75rem', fontWeight: '900', color: '#f59e0b', fontFamily: 'Orbitron, monospace', textShadow: '0 0 8px rgba(245,158,11,0.7)' }}>{peak.freq.toFixed(1)} Hz</span>
                         <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>·</span>
                         <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#fcd34d' }}>{peak.power.toExponential(1)}</span>
                       </div>
                     )}

                     {/* Live Render badge */}
                     <div style={{ position: 'absolute', top: '10px', right: '14px', background: 'rgba(0,0,0,0.65)', padding: '3px 9px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.10)' }}>
                       <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>Live Render: </span>
                       <span style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#22c55e' }}>Active</span>
                     </div>
                   </>
                 ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center opacity-50">
                        <div className="loader-circle" style={{ borderTopColor: '#a855f7', width: '24px', height: '24px', borderWidth: '2px' }} />
                        <span className="text-xs text-muted" style={{ marginTop: '10px' }}>Waiting for EEG stream from worker…</span>
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
