import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Settings, Play, Square, Activity, Wind, Power, Zap, History, Menu, ChevronLeft, ChevronRight, Brain, BookOpen } from 'lucide-react';
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

const MeditationView = ({ result }) => {
  const containerRef      = useRef(null);
  const resultRef         = useRef(null);
  const { currentTheme }  = useTheme();
  const themeRef          = useRef(currentTheme);

  const [wisdomIdx] = useState(() => Math.floor(Math.random() * WISDOM.length));
  const [showSidebar, setShowSidebar] = useState(true);

  useEffect(() => { themeRef.current = currentTheme; }, [currentTheme]);
  useEffect(() => { resultRef.current = result; }, [result]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => container.querySelector(`#${id}`);

    /* ── CANVASES ──────────────────────────────── */
    const radarL = $('med-radar-L');
    const radarR = $('med-radar-R');
    const waveC1 = $('med-wave-1');
    const waveC2 = $('med-wave-2');
    const ctxL   = radarL?.getContext('2d');
    const ctxR   = radarR?.getContext('2d');
    const wCtx1  = waveC1?.getContext('2d');
    const wCtx2  = waveC2?.getContext('2d');

    if (!ctxL || !ctxR || !wCtx1 || !wCtx2) return;

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
      [radarL, radarR, waveC1, waveC2].forEach(resizeCanvas);
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

        const alpha = Math.round(22 + calmSignal * 18 + (Math.random() - 0.5) * 4);
        const theta = Math.round(18 + calmSignal * 10 + (Math.random() - 0.5) * 3);
        const delta = Math.round(14 + (Math.random() - 0.5) * 4);
        const beta  = Math.round(Math.max(8, 26 - calmSignal * 18 + (Math.random() - 0.5) * 4));
        const gamma = Math.round(8  + (Math.random() - 0.5) * 3);
        rawBands = [delta, theta, alpha, beta, gamma];
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

      drawRadar(ctxL, rawBands, true);
      drawRadar(ctxR, rawBands, false);
      drawWave(wCtx1, wave1Hist, gl1);
      drawWave(wCtx2, wave2Hist, p);
      updateDOM(phaseInfo);
    }

    /* ── SESSION PERSISTENCE ───────────────────── */
    function loadSessions() {
      try { return JSON.parse(localStorage.getItem('med_sessions') || '[]'); } catch { return []; }
    }
    function saveSession(data) {
      const s = loadSessions(); s.unshift(data);
      if (s.length > 5) s.pop();
      localStorage.setItem('med_sessions', JSON.stringify(s));
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
  const rightWidth = showSidebar ? 'mr-80' : 'mr-[4.25rem]';

  return (
    <div className="w-full h-full flex bg-bg overflow-hidden relative" ref={containerRef}>

      {/* ══ CENTER AREA: Main Charts ═══════════════════════════════ */}
      <div className={`flex-grow flex flex-col transition-all duration-300 ${rightWidth}`}>
          <div className="med-main">
            {/* Top radar charts row */}
            <div className="med-charts-row">
              {/* Left hemisphere */}
              <div className="med-chart-panel">
                <div className="med-section-header">
                  <span className="med-section-icon">⬡</span>
                  <span className="med-section-title">Brain Activity</span>
                  <span className="med-section-sub"> · Electroencephalogram (EEG)</span>
                </div>
                <div className="med-chart-label">Left Hemisphere</div>
                <canvas id="med-radar-L" className="med-radar-canvas" />
              </div>

              {/* Right hemisphere */}
              <div className="med-chart-panel">
                <div className="med-section-header" style={{ opacity: 0, pointerEvents: 'none' }}>
                  <span className="med-section-icon">⬡</span>
                  <span className="med-section-title">Brain Activity</span>
                </div>
                <div className="med-chart-label">Right Hemisphere</div>
                <canvas id="med-radar-R" className="med-radar-canvas" />
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

      {/* ══ RIGHT SIDEBAR ══════════════════════════════ */}
      <div className={`absolute right-0 top-0 bottom-0 z-10 transition-all duration-300 ease-in-out border-l border-border bg-surface/80 backdrop-blur-md flex flex-col h-full ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.25rem] overflow-visible'} [&::-webkit-scrollbar]:hidden [-ms-overflow-style:'none'] [scrollbar-width:'none']`}>
        
        {/* Collapsed Sidebar */}
        {!showSidebar && (
            <div className="flex flex-col items-center justify-around py-4 w-full animate-fade-in shrink-0 h-full overflow-visible">
                <button onClick={() => setShowSidebar(true)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Expand Sidebar">
                    <Menu size={30} className="text-primary" />
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <div className="flex flex-col items-center cursor-default group relative w-full" title="Calm Signal">
                    <Activity size={24} className="text-primary mb-1" />
                    <span id="med-col-calm-val" className="text-[18px] font-black tabular-nums mt-1 text-primary">0</span>
                    <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Calm Signal %</div>
                </div>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <button id="med-col-session-btn" onClick={() => containerRef.current?.sessionBtnHandler()} title="Start/Stop Session" className="transition-colors group relative p-3 rounded-full text-green-500 hover:bg-green-500/20">
                    <Play id="med-col-play" size={26} />
                    <Square id="med-col-stop" size={26} className="hidden" />
                    <div id="med-col-tooltip-session" className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Start Session</div>
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <button onClick={() => setShowSidebar(true)} title="Controls Settings" className="hover:text-primary transition-colors group relative p-2">
                    <Settings size={28} className="text-muted group-hover:text-primary" />
                    <div className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Settings & Presets</div>
                </button>

                <div className="w-full h-px bg-border/80 shrink-0 my-2" />

                <div className="flex flex-col w-full items-center shrink-0 mt-auto">
                    <button id="med-col-conn-btn" onClick={() => containerRef.current?.toggleConnHandler()} className="w-[42px] h-[42px] flex items-center justify-center rounded-full border transition-all cursor-pointer shadow-sm group relative bg-red-500/10 border-red-500/30 text-red-500" title="Connection Mode">
                        <Zap id="med-col-zap" size={24} className="hidden" />
                        <Power id="med-col-power" size={24} />
                        <div id="med-col-conn-lbl" className="absolute right-14 top-1/2 -translate-y-1/2 bg-surface border border-border px-3 py-1.5 rounded-lg text-xs font-bold text-text whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Simulate Mode</div>
                    </button>
                </div>
            </div>
        )}

        {/* Expanded Sidebar */}
        <div className={`flex-grow flex flex-col overflow-hidden p-4 gap-3 font-mono transition-opacity duration-300 w-80 shrink-0 ${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-2">
                <div>
                    <h2 className="text-2xl font-bold text-text mb-1 flex items-center gap-3">
                        <Settings size={28} className="text-primary animate-pulse" />
                        <span style={{ letterSpacing: '2.3px' }}>Controls</span>
                    </h2>
                    <p className="text-xs text-muted font-mono">Meditation Trainer</p>
                </div>
                <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors" title="Collapse Sidebar">
                    <ChevronLeft size={24} className="rotate-180" />
                </button>
            </div>

            {/* Global Actions */}
            <div className="shrink-0 mb-2">
                <button id="med-session-btn" onClick={() => containerRef.current?.sessionBtnHandler()} className="w-full py-2.5 rounded-xl text-base font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2 border-2 bg-green-500/10 border-green-500/50 text-green-500 hover:bg-green-500/20 shadow-glow">
                    <Play size={18} /> Start
                </button>
            </div>

            {/* Session Phase Info */}
            <div className="flex flex-col gap-2 shrink-0 bg-bg/30 p-3 rounded-xl border border-border/50 mb-2">
                <div className="text-xs text-muted uppercase tracking-widest mb-1 flex items-center gap-2"><Wind size={16}/> Breath Phase</div>
                <div id="med-phase-badge" className="text-center font-bold text-lg font-mono tracking-widest py-2 rounded-lg border border-muted/50 text-muted bg-bg/50 transition-all">READY</div>
                <div id="med-timer-big" className="text-4xl text-center font-black text-text font-mono tracking-widest drop-shadow-[0_0_8px_var(--primary)] my-2">05:00</div>
                <div id="med-cycle-count" className="text-xs text-center text-muted font-mono tracking-widest opacity-80">CYCLE 0</div>
            </div>

            {/* Presets Grid */}
            <div className="mb-2 shrink-0">
                <div className="text-xs text-muted font-bold uppercase tracking-widest mb-2 flex items-center gap-2"><Wind size={16}/> Duration</div>
                <div className="grid grid-cols-2 gap-2">
                    {PRESETS.map(min => (
                        <button key={min} className={`med-preset-btn p-2 rounded-lg border transition-all font-mono text-sm tracking-wider ${min === 5 ? 'bg-primary text-bg border-primary shadow-glow' : 'bg-bg/50 border-border text-muted hover:border-primary'}`} data-min={min} onClick={() => containerRef.current?.presetHandler(min)}>{min} min</button>
                    ))}
                </div>
            </div>

            {/* Calm Signal */}
            <div className="bg-bg/50 border border-primary/20 rounded-xl p-3 flex items-center justify-between shrink-0 mb-2">
                <div className="flex flex-col">
                    <span className="text-base font-bold text-muted uppercase tracking-widest flex items-center gap-2 mb-1">
                        <Activity size={20} className="text-primary" /> Calm
                    </span>
                    <div className="flex items-baseline gap-1">
                        <span id="med-exp-calm-val" className="text-3xl font-black text-primary tabular-nums">0%</span>
                    </div>
                </div>
                <div className="w-1/2 flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_var(--primary)]" />
                        <span className="text-sm font-bold text-primary/80">SIGNAL</span>
                    </div>
                    <div className="w-full mt-2 h-1 bg-bg rounded-full overflow-hidden flex justify-end">
                        <div id="med-exp-calm-pip" className="h-full bg-primary transition-all duration-300 shadow-[0_0_8px_var(--primary)]" style={{ width: '0%' }} />
                    </div>
                </div>
            </div>

            {/* Connection Mode */}
            <div id="med-exp-conn-box" className="bg-bg/50 border border-red-500/20 rounded-xl p-3 flex flex-col shrink-0 mb-4 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition-colors cursor-pointer hover:bg-bg/70" onClick={() => containerRef.current?.toggleConnHandler()}>
               <div className="flex items-center justify-between mb-2">
                   <span className="text-xs font-bold text-muted uppercase tracking-widest">Input Source</span>
                   <button className="text-xs text-muted hover:text-text border border-border px-2 py-0.5 rounded-md hover:bg-white/5 transition-all">SWITCH</button>
               </div>
               <div className="flex items-center gap-3">
                   <div className="p-2 rounded-full bg-bg/80 border border-border">
                       <Zap id="med-exp-conn-icon-live" size={24} className="text-green-500 hidden" />
                       <Power id="med-exp-conn-icon-sim" size={24} className="text-red-500" />
                   </div>
                   <span id="med-exp-conn-text" className="font-bold text-lg tracking-widest">SIMULATE</span>
               </div>
            </div>

            {/* Daily Wisdom */}
            <div className="mt-auto border border-border/50 bg-bg/20 rounded-xl p-3 shrink-0">
                <div className="flex items-center gap-2 text-primary/80 font-mono text-xs font-bold uppercase tracking-widest mb-2">
                    <BookOpen size={14}/> Daily Wisdom
                </div>
                <p className="text-[13px] text-text/90 italic mb-2 leading-relaxed">"{wisdom.quote}"</p>
                <p className="text-xs text-primary/70">{wisdom.author}</p>
            </div>
        </div>

      </div>
    </div>
  );
};

export default MeditationView;
