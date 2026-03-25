import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
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
    const ctxL   = radarL.getContext('2d');
    const ctxR   = radarR.getContext('2d');
    const wCtx1  = waveC1.getContext('2d');
    const wCtx2  = waveC2.getContext('2d');

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
    let peakBands = [0, 0, 0, 0, 0];

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

      // Calm bar
      const cf = $('med-calm-fill');
      if (cf) cf.style.width = (calmSignal * 100).toFixed(0) + '%';
      const cp = $('med-calm-pct');
      if (cp) cp.textContent = (calmSignal * 100).toFixed(0) + '%';

      // Conn dot / label
      const dot = $('med-conn-dot');
      if (dot) dot.className = 'med-dot ' + (eegMode === 'ws' ? 'connected' : 'simulating');
      const lbl = $('med-conn-lbl');
      if (lbl) lbl.textContent = eegMode === 'ws' ? 'LIVE' : 'SIMULATE';
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
      peakBands = [0, 0, 0, 0, 0]; wave1Hist = []; wave2Hist = [];
      sessionStart = Date.now();
      sessionRunning = true; lastTS = null;

      const btn = $('med-session-btn');
      if (btn) { btn.textContent = '⏹ STOP'; btn.className = 'med-session-btn stop'; }
    };

    container.stopSessionHandler = () => {
      if (!sessionRunning) return;
      sessionRunning = false;
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const ss = String(elapsed % 60).padStart(2, '0');
      const avgCalm = calmSamples > 0 ? Math.round((calmAcc / calmSamples) * 100) : 0;
      saveSession({ duration: `${mm}:${ss}`, avgCalm, cycles: cycleCount, mode: eegMode === 'ws' ? 'LIVE' : 'SIM' });
      const btn = $('med-session-btn');
      if (btn) { btn.textContent = '▶ START'; btn.className = 'med-session-btn'; }
      const td = $('med-timer-big');
      if (td) td.textContent = '00:00';
    };

    container.sessionBtnHandler = () => {
      if (sessionRunning) container.stopSessionHandler();
      else container.startSessionHandler();
    };
    container.toggleConnHandler = () => {
      if (eegMode === 'simulate') startLiveStream(); else startSimulation();
    };
    container.presetHandler = (min) => {
      presetSecs = min * 60;
      const td = $('med-timer-big');
      if (td) { const mm = String(min).padStart(2, '0'); td.textContent = `${mm}:00`; }
      // highlight active preset
      container.querySelectorAll('.med-preset-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.min) === min);
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

  return (
    <div className="med-layout" ref={containerRef}>

      {/* ══ LEFT PANEL ══════════════════════════════ */}
      <div className="med-left-panel">

        {/* Brand */}
        <div className="med-brand">
          <div className="med-brand-icon">🧠</div>
          <div>
            <div className="med-brand-name">Meditate</div>
          </div>
        </div>

        {/* Phase + Timer */}
        <div className="med-left-section">
          <div className="med-left-label">Breath Phase</div>
          <div className="med-phase-badge" id="med-phase-badge">READY</div>
          <div className="med-timer-big" id="med-timer-big">05:00</div>
          <div className="med-cycle-count" id="med-cycle-count">CYCLE 0</div>
        </div>

        {/* Presets */}
        <div className="med-left-section">
          <div className="med-left-label">Session Duration</div>
          <div className="med-preset-grid">
            {PRESETS.map(min => (
              <button
                key={min}
                className={`med-preset-btn${min === 5 ? ' active' : ''}`}
                data-min={min}
                onClick={() => containerRef.current?.presetHandler(min)}
              >
                {min} min
              </button>
            ))}
          </div>
          <button
            className="med-session-btn"
            id="med-session-btn"
            onClick={() => containerRef.current?.sessionBtnHandler()}
          >
            ▶ START
          </button>
        </div>

        {/* Connection */}
        <div className="med-conn-row">
          <div className="med-dot simulating" id="med-conn-dot" />
          <span id="med-conn-lbl">SIMULATE</span>
          <button
            className="med-conn-toggle"
            onClick={() => containerRef.current?.toggleConnHandler()}
          >
            SWITCH
          </button>
        </div>

        {/* Daily Wisdom */}
        <div className="med-wisdom-section">
          <div className="med-wisdom-title">✦ Daily Wisdom</div>
          <div className="med-wisdom-quote">"{wisdom.quote}"</div>
          <div className="med-wisdom-author">{wisdom.author}</div>
        </div>
      </div>

      {/* ══ MAIN AREA ═══════════════════════════════ */}
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
  );
};

export default MeditationView;
