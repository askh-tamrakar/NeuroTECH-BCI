import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Settings, Play, Square, Activity, Wind, Power, Zap, History, Menu, ChevronLeft, ChevronRight, Brain, BookOpen, Eye, Grid, Music, Volume2, Trophy, Clock, Calendar, CheckSquare, Sparkles, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import '../../styles/views/MeditationView.css';

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
  { name: 'INHALE',  dur: 4 },
  { name: 'HOLD',    dur: 7 },
  { name: 'EXHALE',  dur: 8 },
  { name: 'REST',    dur: 1 },
];
const TOTAL_CYCLE = PHASES.reduce((s, p) => s + p.dur, 0);

/* ── PRESETS (minutes) ─────────────────────────── */
const PRESETS = [3, 5, 10, 15];

const MeditationView = ({ result, currentView, onNavigate }) => {
  const containerRef      = useRef(null);
  const resultRef         = useRef(null);
  const { currentTheme }  = useTheme();
  const themeRef          = useRef(currentTheme);

  const [wisdomIdx] = useState(() => Math.floor(Math.random() * WISDOM.length));
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState('controls');

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

  useEffect(() => {
    localStorage.setItem('med_stats', JSON.stringify(stats));
  }, [stats]);

  /* ── MUSIC MIXER STATE ─────────────────────── */
  const [musicState, setMusicState] = useState([
    { id: 'rain',    label: 'Rain/Storm',   active: false, vol: 0.5 },
    { id: 'forest',  label: 'Deep Forest',  active: false, vol: 0.5 },
    { id: 'alpha',   label: 'Binaural-α',   active: false, vol: 0.3 },
    { id: 'theta',   label: 'Binaural-θ',   active: false, vol: 0.3 },
  ]);

  const toggleMusic = (id) => {
    setMusicState(prev => prev.map(m => m.id === id ? { ...m, active: !m.active } : m));
  };

  const updateVol = (id, vol) => {
    setMusicState(prev => prev.map(m => m.id === id ? { ...m, vol } : m));
  };

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => container.querySelector(`#${id}`);

    /* ── CANVASES ──────────────────────────────── */
    const radar = $('med-radar');
    const waveC1 = $('med-wave-1');
    const waveC2 = $('med-wave-2');
    const ctxRadar = radar?.getContext('2d');
    const wCtx1  = waveC1?.getContext('2d');
    const wCtx2  = waveC2?.getContext('2d');

    if (!ctxRadar || !wCtx1 || !wCtx2) return;

    /* ── STATE ─────────────────────────────────── */
    let eegMode        = 'simulate';
    let simInterval    = null;
    let fetchInterval  = null;
    let animId         = null;
    let sessionRunning = false;
    let sessionStart   = 0;
    let presetSecs     = 5 * 60; // default 5 min
    let calmSignal     = 0;
    let rawBands       = [20, 20, 25, 20, 15];

    const WAVE_LEN = 160;
    let wave1Hist  = [];
    let wave2Hist  = [];

    let breathTick = 0;
    let cycleCount = 0;
    let lastTS     = null;

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
      canvas.width  = rect.width;
      canvas.height = rect.height;
    }
    function resizeAll() {
      [radar, waveC1, waveC2].forEach(resizeCanvas);
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
      const R  = Math.min(W, H) * 0.36;
      const n  = 5;
      const labels = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];
      const angles = labels.map((_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);

      const primary = tc('--primary');
      const line1   = isLeft ? tc('--graph-line-1') : tc('--primary');
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
      const norm  = bands.map(v => v / total);

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
      ctx.lineWidth   = 1.5;
      ctx.shadowBlur  = 10; ctx.shadowColor = line1;
      ctx.stroke();
      ctx.shadowBlur  = 0;

      // Vertex dots + labels
      const textCol = tc('--graph-text', tc('--muted'));
      angles.forEach((a, i) => {
        const r = R * norm[i];
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = line1; ctx.fill();

        const lx = cx + Math.cos(a) * (R + 16);
        const ly = cy + Math.sin(a) * (R + 16);
        ctx.font = '9px "Share Tech Mono", monospace';
        ctx.fillStyle = hex2rgba(textCol, 0.75);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(labels[i], lx, ly);
      });
      ctx.restore();
    }

    /* ── WAVE DRAW ─────────────────────────────── */
    function drawWave(ctx, hist, color) {
      if (!ctx || !ctx.canvas) return;
      const W = ctx.canvas.width, H = ctx.canvas.height;
      if (!W || !H || hist.length < 2) { ctx.clearRect(0, 0, W, H); return; }
      ctx.clearRect(0, 0, W, H);
      const step = W / (WAVE_LEN - 1);

      // Grid lines (horizontal)
      const gridCol = tc('--graph-grid', 'rgba(255,255,255,0.05)');
      ctx.strokeStyle = hex2rgba(gridCol, 0.6);
      ctx.lineWidth = 0.5;
      for (let r = 0; r <= 4; r++) {
        const y = (r / 4) * H;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }

      ctx.beginPath();
      ctx.strokeStyle = color; ctx.lineWidth = 1.5;
      ctx.shadowColor = color; ctx.shadowBlur = 6;
      for (let i = 0; i < hist.length; i++) {
        const x = (i - (WAVE_LEN - hist.length)) * step;
        const y = H * 0.92 - hist[i] * H * 0.8;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Fill under line
      ctx.beginPath();
      for (let i = 0; i < hist.length; i++) {
        const x = (i - (WAVE_LEN - hist.length)) * step;
        const y = H * 0.92 - hist[i] * H * 0.8;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, hex2rgba(color, 0.18));
      grad.addColorStop(1, hex2rgba(color, 0));
      ctx.fillStyle = grad; ctx.fill();
      ctx.shadowBlur = 0;
    }

    /* ── SIMULATION ────────────────────────────── */
    let simPhase = 0, simTrend = 0;

    function startSimulation() {
      eegMode = 'simulate';
      if (simInterval)  clearInterval(simInterval);
      if (fetchInterval) clearInterval(fetchInterval);
      simInterval = setInterval(() => {
        simPhase += 0.06;
        simTrend += (Math.random() - 0.47) * 0.03;
        simTrend = Math.max(-0.3, Math.min(0.3, simTrend));
        const base  = 0.55 + simTrend;
        const noise = Math.sin(simPhase * 1.2) * 0.12 + Math.sin(simPhase * 3.5) * 0.06
                    + (Math.random() - 0.5) * 0.06;
        calmSignal = Math.max(0, Math.min(1, base + noise));

        const delta = Math.round(14 + (Math.random() - 0.5) * 4);
        const theta = Math.round(18 + calmSignal * 15 + (Math.random() - 0.5) * 3);
        const alpha = Math.round(22 + calmSignal * 22 + (Math.random() - 0.5) * 4);
        const beta  = Math.round(Math.max(8, 28 - calmSignal * 20 + (Math.random() - 0.5) * 4));
        const gamma = Math.round(8  + (Math.random() - 0.5) * 3);
        rawBands = [delta, theta, alpha, beta, gamma];

        // Derived Metrics
        const focusScore = Math.round(calmSignal * 100);
        const stressLevel = Math.max(0, Math.round(100 - (calmSignal * 100) + (Math.random() - 0.5) * 10));
        
        const fv = $('med-focus-val'); if(fv) fv.textContent = focusScore;
        const sv = $('med-stress-val'); if(sv) sv.textContent = stressLevel;
      }, 60);
    }

    function startLiveStream() {
      eegMode = 'ws';
      if (simInterval)  clearInterval(simInterval);
      if (fetchInterval) clearInterval(fetchInterval);
      fetchInterval = setInterval(() => {
        const res = resultRef.current;
        if (res?.band_powers?.length >= 5) {
          const bp  = res.band_powers;
          const sum = bp.reduce((a, b) => a + b, 0) || 1;
          rawBands  = bp.map(v => Math.round((v / sum) * 100));
          const relA = rawBands[2] / 100, relT = rawBands[1] / 100, relB = rawBands[3] / 100;
          calmSignal = Math.max(0, Math.min(1, (relA + relT * 0.5) / (relB + 0.1) * 0.4));
        }
        if (res?.meditation_score !== undefined) {
          calmSignal = Math.max(0, Math.min(1, res.meditation_score / 100));
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
        const elapsed  = Math.max(0, (Date.now() - sessionStart) / 1000);
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
             orb.style.boxShadow = `0 0 ${20 + calmSignal*60}px rgba(0, ${cFactor}, 255, 0.4)`;
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

      // Push wave histories — use left=alpha, right=theta as channel proxies
      const leftSig  = rawBands[2] / 100; // alpha
      const rightSig = rawBands[1] / 100; // theta
      wave1Hist.push(leftSig + (Math.random() - 0.5) * 0.04);
      wave2Hist.push(rightSig + (Math.random() - 0.5) * 0.03);
      if (wave1Hist.length > WAVE_LEN) wave1Hist.shift();
      if (wave2Hist.length > WAVE_LEN) wave2Hist.shift();

      const p = tc('--primary');
      const gl1 = tc('--graph-line-1');
      const gl2 = tc('--graph-line-2');

      drawRadar(ctxRadar, rawBands, true);
      drawWave(wCtx1, wave1Hist, gl1);
      drawWave(wCtx2, wave2Hist, p);
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
      wave1Hist = []; wave2Hist = [];
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
        if(tt) tt.textContent = 'Stop Session';
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
        if(tt) tt.textContent = 'Start Session';
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
      if (eegMode === 'simulate') startLiveStream(); else startSimulation();
      const isWs = eegMode === 'ws';
      
      // Update Collapsed button
      const colConnBtn = $('med-col-conn-btn');
      if (colConnBtn) {
          colConnBtn.className = `w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all cursor-pointer shadow-sm group relative ${isWs ? 'bg-green-500/10 border-green-500/30 text-green-500' : 'bg-red-500/10 border-red-500/30 text-red-500'}`;
          if (isWs) {
              $('med-col-power')?.classList.add('hidden');
              $('med-col-zap')?.classList.remove('hidden');
              const lbl = $('med-col-conn-lbl');
              if(lbl) lbl.textContent = 'Sensor Connected';
          } else {
              $('med-col-power')?.classList.remove('hidden');
              $('med-col-zap')?.classList.add('hidden');
              const lbl = $('med-col-conn-lbl');
              if(lbl) lbl.textContent = 'Simulate Mode';
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
          if(expConnT) expConnT.textContent = 'LIVE FEED';
          if(expConnBg) expConnBg.className = 'bg-bg/50 border border-green-500/20 rounded-xl p-3 flex flex-col shrink-0 mb-4 shadow-[0_0_10px_rgba(34,197,94,0.1)] transition-colors cursor-pointer hover:bg-bg/70';
      } else {
          expConnL?.classList.add('hidden');
          expConnS?.classList.remove('hidden');
          if(expConnT) expConnT.textContent = 'SIMULATE';
          if(expConnBg) expConnBg.className = 'bg-bg/50 border border-red-500/20 rounded-xl p-3 flex flex-col shrink-0 mb-4 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition-colors cursor-pointer hover:bg-bg/70';
      }
    };

    container.presetHandler = (min) => {
      presetSecs = min * 60;
      const td = $('med-timer-big');
      if (td) { const mm = String(min).padStart(2, '0'); td.textContent = `${mm}:00`; }
      // highlight active preset
      container.querySelectorAll('.med-preset-btn').forEach(b => {
        if (parseInt(b.dataset.min) === min) {
          b.classList.add('bg-primary', 'text-bg', 'border-primary', 'shadow-glow');
          b.classList.remove('bg-bg/50', 'text-muted', 'border-border');
        } else {
          b.classList.remove('bg-primary', 'text-bg', 'border-primary', 'shadow-glow');
          b.classList.add('bg-bg/50', 'text-muted', 'border-border');
        }
      });
    };

    startSimulation();
    animId = requestAnimationFrame(loop);

    return () => {
      window.removeEventListener('resize', resizeAll);
      if (simInterval)  clearInterval(simInterval);
      if (fetchInterval) clearInterval(fetchInterval);
      if (animId) cancelAnimationFrame(animId);
    };
  }, []);

  const wisdom = WISDOM[wisdomIdx];
  const leftWidth = showSidebar ? 'ml-80' : 'ml-[4.25rem]';

  return (
    <div className="w-full h-full flex bg-bg overflow-hidden relative" ref={containerRef}>

      {/* ══ CENTER AREA: Main Charts ═══════════════════════════════ */}
      <div className={`flex-grow flex flex-col transition-all duration-300 ${leftWidth}`}>
          <div className="med-main">
            {/* Top row: Brain Activity & Focus Orb */}
            <div className="med-charts-row">
              {/* Brain Activity (Radar) */}
              <div className="med-chart-panel">
                <div className="med-section-header">
                  <span className="med-section-icon">⬡</span>
                  <span className="med-section-title">Brain Activity</span>
                  <span className="med-section-sub"> · Electroencephalogram (EEG)</span>
                </div>
                <div className="med-chart-label">Global EEG Power</div>
                <canvas id="med-radar" className="med-radar-canvas" />
              </div>

              {/* Focus Bubble (Breathing) */}
              <div className="med-chart-panel border-l border-border/50">
                <div className="med-section-header">
                  <span className="med-section-icon" style={{ marginLeft: '-2px' }}>◎</span>
                  <span className="med-section-title">Respiration</span>
                  <span className="med-section-sub"> · Focus Bubble</span>
                </div>
                
                {/* Real-time Metrics Overlays */}
                <div className="absolute top-16 left-4 right-4 flex justify-between z-10 pointer-events-none">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-primary/60 tracking-widest uppercase">Focus</span>
                        <span id="med-focus-val" className="text-2xl font-black text-primary font-mono tabular-nums">0</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-bold text-red-500/60 tracking-widest uppercase">Stress</span>
                        <span id="med-stress-val" className="text-2xl font-black text-red-500 font-mono tabular-nums">0</span>
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

            {/* Bottom EEG wave rows */}
            <div className="med-waves-col" style={{ height: '38%' }}>
              <div className="med-wave-row">
                <div className="med-wave-label">CH1 · ALPHA BAND (α)</div>
                <div className="med-calm-bar-wrap">
                  <span>CALM</span>
                  <div className="med-calm-track">
                    <div className="med-calm-fill" id="med-calm-fill" />
                  </div>
                  <span className="med-calm-pct" id="med-calm-pct">0%</span>
                </div>
                <canvas id="med-wave-1" className="med-wave-canvas" />
              </div>

              <div className="med-wave-row">
                <div className="med-wave-label">CH2 · THETA BAND (θ)</div>
                <canvas id="med-wave-2" className="med-wave-canvas" />
              </div>
            </div>
          </div>
      </div>

      {/* ══ LEFT SIDEBAR ══════════════════════════════ */}
      <div className={`absolute left-0 top-0 bottom-0 z-10 transition-all duration-300 ease-in-out border-r border-border bg-surface/80 backdrop-blur-md flex flex-col h-full ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.25rem] overflow-visible'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}>
        
        {/* Collapsed Sidebar */}
        {!showSidebar && (
            <div className="flex flex-col items-center justify-start py-4 w-full animate-fade-in shrink-0 h-full overflow-visible">
                <button onClick={() => { setShowSidebar(true); setSidebarTab('nav'); }} className="hover:bg-white/10 p-2 rounded-full transition-colors group relative mb-2" title="App Navigation">
                    <Grid size={28} className="text-muted group-hover:text-primary" />
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">App Navigation</div>
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <button onClick={() => { setShowSidebar(true); setSidebarTab('controls'); }} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Expand Controls">
                    <Menu size={30} className="text-primary" />
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <div className="flex flex-col items-center cursor-default group relative w-full" title="Calm Signal">
                    <Activity size={24} className="text-primary mb-1" />
                    <span id="med-col-calm-val" className="text-[18px] font-black tabular-nums mt-1 text-primary">0</span>
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Calm Signal %</div>
                </div>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <button id="med-col-session-btn" onClick={() => containerRef.current?.sessionBtnHandler()} title="Start/Stop Session" className="transition-colors group relative p-3 rounded-full text-green-500 hover:bg-green-500/20">
                    <Play id="med-col-play" size={26} />
                    <Square id="med-col-stop" size={26} className="hidden" />
                    <div id="med-col-tooltip-session" className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Start Session</div>
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <button onClick={() => setShowSidebar(true)} title="Controls Settings" className="hover:text-primary transition-colors group relative p-2">
                    <Settings size={28} className="text-muted group-hover:text-primary" />
                    <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Settings & Presets</div>
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <div className="flex flex-col w-full items-center shrink-0 mt-auto">
                    <button id="med-col-conn-btn" onClick={() => containerRef.current?.toggleConnHandler()} className="w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all cursor-pointer shadow-sm group relative bg-red-500/10 border-red-500/30 text-red-500" title="Connection Mode">
                        <Zap id="med-col-zap" size={24} className="hidden" />
                        <Power id="med-col-power" size={24} />
                        <div id="med-col-conn-lbl" className="absolute left-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Simulate Mode</div>
                    </button>
                </div>
            </div>
        )}

        {/* Expanded Sidebar */}
        <div className={`flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 w-80 shrink-0 ${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-1">
                <div>
                    <h2 className="text-[22px] font-bold text-text mb-1 flex items-center gap-3 tracking-[2px]">
                        {sidebarTab === 'controls' ? <Wind size={26} className="text-primary" /> : <Grid size={26} className="text-primary" />}
                        <span style={{ letterSpacing: '2.3px' }}>{sidebarTab === 'controls' ? 'TRAINER' : 'NEURO SUITE'}</span>
                    </h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Collapse Sidebar">
                        <ChevronLeft size={24} className="" />
                    </button>
                </div>
            </div>

            {/* Tab Switcher */}
            <div className="flex bg-bg/50 border border-border p-1 rounded-xl shrink-0 mb-1">
               <button onClick={() => setSidebarTab('controls')} className={`flex-1 py-1.5 rounded-lg text-[11px] border ${sidebarTab === 'controls' ? 'border-primary/20' : 'border-transparent'} font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all ${sidebarTab === 'controls' ? 'bg-primary/10 text-primary shadow-glow' : 'text-muted hover:text-text hover:bg-white/5'}`}>
                  <Settings size={14} /> Controls
               </button>
               <button onClick={() => setSidebarTab('nav')} className={`flex-1 py-1.5 rounded-lg text-[11px] border ${sidebarTab === 'nav' ? 'border-primary/20' : 'border-transparent'} font-bold tracking-widest uppercase flex items-center justify-center gap-2 transition-all ${sidebarTab === 'nav' ? 'bg-primary/10 text-primary shadow-glow' : 'text-muted hover:text-text hover:bg-white/5'}`}>
                  <Grid size={14} /> Navigation
               </button>
            </div>

            {sidebarTab === 'controls' && (
               <div className="flex flex-col gap-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden pb-10">
                  
                  {/* Global Play/Stop */}
                  <div className="shrink-0">
                      <button id="med-session-btn" onClick={() => containerRef.current?.sessionBtnHandler()} className="w-full py-4 rounded-xl text-sm font-black uppercase tracking-[3px] transition-all flex items-center justify-center gap-3 border-2 shadow-lg bg-green-500/10 border-green-500/40 text-green-500 hover:bg-green-500/20 shadow-glow">
                          <Play size={20} /> NEW SESSION
                      </button>
                  </div>

                  {/* ──────────────────────────────── Section: LIVE MEDITATION ──────────────────────────────── */}
                  <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                      <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                        <Activity size={14} /> Live Focus Mode
                      </h4>

                      <div id="med-exp-conn-box" className="bg-surface/50 border border-red-500/20 rounded-lg p-2.5 flex items-center justify-between cursor-pointer hover:bg-bg/70 transition-all" onClick={() => containerRef.current?.toggleConnHandler()}>
                         <div className="flex items-center gap-3">
                            <Zap id="med-exp-conn-icon-live" size={18} className="text-green-500 hidden" />
                            <Power id="med-exp-conn-icon-sim" size={18} className="text-red-500" />
                            <span id="med-exp-conn-text" className="text-xs font-bold tracking-widest">SIMULATING</span>
                         </div>
                         <span className="text-[9px] bg-red-500/10 text-red-500 px-1.5 py-0.5 rounded border border-red-500/20">MOCK</span>
                      </div>

                      <div className="flex flex-col gap-2 p-2.5 bg-surface/30 border border-border/50 rounded-lg">
                          <div className="flex justify-between items-center mb-1">
                             <div id="med-phase-badge" className="text-[11px] font-black tracking-widest text-muted">READY</div>
                             <div id="med-timer-big" className="text-lg font-black text-primary font-mono tabular-nums">05:00</div>
                          </div>
                          <div className="w-full h-1 bg-border rounded-full overflow-hidden">
                             <div id="med-exp-calm-pip" className="h-full bg-primary transition-all duration-300" style={{ width: '0%' }} />
                          </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5">
                          {PRESETS.map(min => (
                              <button key={min} className={`med-preset-btn py-1.5 rounded-md border transition-all font-mono text-[10px] tracking-wider ${min === 5 ? 'bg-primary text-bg border-primary' : 'bg-surface/50 border-border text-muted hover:border-primary'}`} data-min={min} onClick={() => containerRef.current?.presetHandler(min)}>{min}M</button>
                          ))}
                      </div>
                  </div>

                  {/* ──────────────────────────────── Section: RELAXATION MUSIC ──────────────────────────────── */}
                  <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                      <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                         <Volume2 size={14} /> Soundscape Mixer
                      </h4>

                      <div className="flex flex-col gap-2.5">
                         {musicState.map(m => (
                            <div key={m.id} className="flex flex-col gap-2 p-2 rounded-lg bg-surface/30 border border-border/30 hover:border-primary/30 transition-all">
                               <div className="flex items-center justify-between">
                                  <span className={`text-[11px] font-bold tracking-tight ${m.active ? 'text-primary' : 'text-muted'}`}>{m.label}</span>
                                  <button onClick={() => toggleMusic(m.id)} className={`p-1 rounded-md transition-all ${m.active ? 'bg-primary text-bg' : 'bg-surface border border-border text-muted hover:text-text'}`}>
                                     {m.active ? <Volume2 size={12} /> : <VolumeX size={12} />}
                                  </button>
                               </div>
                               {m.active && (
                                  <input type="range" min="0" max="1" step="0.01" value={m.vol} onChange={(e) => updateVol(m.id, parseFloat(e.target.value))} className="w-full h-1 bg-primary/20 rounded-lg appearance-none cursor-pointer accent-primary" />
                               )}
                            </div>
                         ))}
                      </div>
                  </div>

                  {/* ──────────────────────────────── Section: CLOUD STATS & PROFILE ──────────────────────────────── */}
                  <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                      <h4 className="text-[10px] font-bold text-muted/80 uppercase tracking-widest flex items-center gap-2">
                        <Trophy size={14} /> Performance
                      </h4>

                      <div className="grid grid-cols-2 gap-2">
                         <div className="bg-surface/30 p-2.5 rounded-lg border border-border/50 flex flex-col items-center">
                            <span className="text-[10px] text-muted uppercase tracking-tighter mb-1">STREAK</span>
                            <span className="text-xl font-black text-orange-500">🔥 {stats.streak}D</span>
                         </div>
                         <div className="bg-surface/30 p-2.5 rounded-lg border border-border/50 flex flex-col items-center">
                            <span className="text-[10px] text-muted uppercase tracking-tighter mb-1">TOTAL</span>
                            <span className="text-xl font-black text-primary">{stats.totalMin}M</span>
                         </div>
                      </div>

                      <div className="p-2.5 bg-surface/30 border border-border/50 rounded-lg">
                         <div className="flex justify-between items-center mb-1.5">
                            <span className="text-[10px] font-bold text-muted">LEVEL {Math.floor(stats.xp / 1000) + 1}</span>
                            <span className="text-[10px] font-mono text-primary">{stats.xp % 1000}/1000 XP</span>
                         </div>
                         <div className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-primary to-blue-400" style={{ width: `${(stats.xp % 1000) / 10}%` }} />
                         </div>
                      </div>

                      {stats.sessions.length > 0 && (
                         <div className="mt-2 space-y-1.5">
                            <span className="text-[9px] font-black text-muted uppercase tracking-widest block mb-2">RECENT SESSIONS</span>
                            {stats.sessions.slice(0, 3).map((s, idx) => (
                               <div key={idx} className="flex items-center justify-between text-[10px] bg-bg/30 p-1.5 rounded border border-border/40">
                                  <div className="flex gap-2 items-center">
                                     <Calendar size={10} className="text-primary" />
                                     <span className="font-bold opacity-80">{s.duration}</span>
                                  </div>
                                  <span className="font-mono text-primary font-black">{s.avgCalm}% CALM</span>
                               </div>
                            ))}
                         </div>
                      )}
                  </div>

                  {/* Daily Wisdom Footer */}
                  <div className="mt-2 border border-border/50 bg-bg/20 rounded-xl p-3 shrink-0">
                      <div className="flex items-center gap-2 text-primary/80 font-mono text-[9px] font-bold uppercase tracking-widest mb-1.5">
                          <BookOpen size={12}/> Daily Wisdom
                      </div>
                      <p className="text-[11px] text-text/80 italic mb-1.5 leading-relaxed">"{wisdom.quote}"</p>
                      <p className="text-[10px] text-primary/70">{wisdom.author}</p>
                  </div>
               </div>
            )}

            {sidebarTab === 'nav' && (
               <div className="flex flex-col gap-2 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden pb-4">
                 <button 
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'overview' ? 'bg-primary/10 text-primary border-primary/30 shadow-sm' : 'text-text hover:bg-bg border-border/50'}`} 
                    onClick={() => onNavigate && onNavigate('overview')}
                 >
                    <Grid size={18} /> Dashboard Overview
                 </button>
                 <button 
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'music' ? 'bg-primary/10 text-primary border-primary/30 shadow-sm' : 'text-text hover:bg-bg border-border/50'}`} 
                    onClick={() => onNavigate && onNavigate('music')}
                 >
                    <Music size={18} /> Music Control
                 </button>
                 <button 
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'meditation' ? 'bg-primary/10 text-primary border-primary/30 shadow-sm' : 'text-text hover:bg-bg border-border/50'}`} 
                    onClick={() => onNavigate && onNavigate('meditation')}
                 >
                    <Wind size={18} /> Meditation Trainer
                 </button>
                 <button 
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'bubble' ? 'bg-primary/10 text-primary border-primary/30 shadow-sm' : 'text-text hover:bg-bg border-border/50'}`} 
                    onClick={() => onNavigate && onNavigate('bubble')}
                 >
                    <Activity size={18} /> Bubble Game
                 </button>
                 <button 
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm border ${currentView === 'ssvep' ? 'bg-primary/10 text-primary border-primary/30 shadow-sm' : 'text-text hover:bg-bg border-border/50'}`} 
                    onClick={() => onNavigate && onNavigate('ssvep')}
                 >
                    <Eye size={18} /> SSVEP Interface
                 </button>
               </div>
            )}
        </div>

      </div>
    </div>
  );
};

export default MeditationView;
