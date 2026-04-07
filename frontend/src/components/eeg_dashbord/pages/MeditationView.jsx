import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import { Play, Wind, Power, Zap, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
  
  // Keep resultRef fresh for the requestAnimationFrame loop
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

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

  useEffect(() => {
    if (!wsUrl) return;
    const dataWorker = new Worker(new URL('../../../workers/data.worker.js', import.meta.url), { type: 'module' });
    dataWorker.postMessage({ type: 'CONNECT', payload: { url: wsUrl } });

    const fftWorker = new FFTWorker();
    fftWorker.onmessage = (e) => {
        if (e.data.type === 'FFT_RESULT') {
            setSpectra(e.data.payload);
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
          <span className="text-center text-[8px] font-black uppercase tracking-[2px] text-[var(--muted)]">Presets</span>
          <div className="grid grid-cols-2 gap-1">
            {PRESETS.map((min) => (
              <button
                key={min}
                type="button"
                onClick={() => containerRef.current?.presetHandler(min)}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-1 py-1.5 text-[8px] font-black uppercase tracking-[1.5px] text-[var(--muted)] hover:border-primary/40 hover:text-primary"
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
    let rawBands = [20, 20, 25, 20, 15];

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

      // Grid rings
      ctx.save();
      [0.25, 0.5, 0.75, 1.0].forEach(frac => {
        ctx.beginPath();
        angles.forEach((a, i) => {
          const x = cx + Math.cos(a) * R * frac;
          const y = cy + Math.sin(a) * R * frac;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.strokeStyle = frac === 1
          ? hex2rgba(primary, 0.25)
          : hex2rgba(gridCol, 0.8);
        ctx.lineWidth = frac === 1 ? 1.2 : 0.7;
        ctx.stroke();

        // Numeric labels (25, 50, 75, 100)
        ctx.font = 'bold 9px "Share Tech Mono", monospace';
        ctx.fillStyle = hex2rgba(primary, 0.7);
        ctx.textAlign = 'center';
        ctx.fillText((frac * 100).toFixed(0), cx, cy - R * frac - 3);
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

      // Data polygon
      const total = bands.reduce((a, b) => a + b, 0) || 100;
      const norm = bands.map(v => v / total);

      ctx.beginPath();
      angles.forEach((a, i) => {
        const r = R * norm[i];
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
        const res = resultRef.current;
        if (res?.band_powers?.length >= 5) {
          // Use absolute backend band powers - radar normalizes them via ratio automatically
          // We can apply a small log baseline so delta doesn't 100% crush the UI visually, 
          // or just pass them raw as requested by user's raw band matching rule
          rawBands = [...res.band_powers];
        }

        if (res?.meditation_score !== undefined) {
          calmSignal = Math.max(0, Math.min(1, res.meditation_score / 100));
        } else if (res?.band_mix) {
           // Fallback to calculate base calm from mix if score is omitted for some reason
           const { alpha, theta, beta } = res.band_mix;
           calmSignal = Math.max(0, Math.min(1, (alpha + theta * 0.5) / (beta + 0.1) * 0.4));
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
                 const chKey = wsEvent?.source_channel !== undefined ? String(wsEvent.source_channel) : '0';
                 const data = spectra[chKey] || spectra['0'] || spectra['1'] || Object.values(spectra)[0];
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
