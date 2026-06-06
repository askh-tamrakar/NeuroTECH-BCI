import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import '../../../styles/views/BubbleGameView.css';
import BubbleSidebar from '../sidebar/BubbleSidebar';
import { useSidebar } from './SidebarContext';

const BubbleGameView = ({ result, isConnected, onBackToMenu }) => {
  const containerRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const resultRef = useRef(null);
  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  const [globalRunning, setGlobalRunning] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [stressScore, setStressScore] = useState(0);
  const [focusScore, setFocusScore] = useState(0);
  const [eegMapped, setEegMapped] = useState(true);
  const isConnectedRef = useRef(isConnected);

  const { setSidebarSlot, setSidebarMode } = useSidebar();

  useEffect(() => {
    setSidebarMode('page');
  }, [setSidebarMode]);

  useEffect(() => {
    setSidebarSlot(
      <BubbleSidebar
        onBackToMenu={onBackToMenu}
        stressScore={stressScore}
        focusScore={focusScore}
        globalRunning={globalRunning}
        containerRef={containerRef}
      />
    );
    return () => setSidebarSlot(null);
  }, [onBackToMenu, stressScore, focusScore, globalRunning, setSidebarSlot]);

  useEffect(() => { themeRef.current = currentTheme; }, [currentTheme]);
  useEffect(() => { resultRef.current = result; }, [result]);
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  useEffect(() => {
    if (result && result.eeg_mapped !== undefined) setEegMapped(result.eeg_mapped);
  }, [result]);

  const signalQuality = result?.signal_quality ?? 1.0;
  const isLowSignal = signalQuality < 0.15;

  /* ── IMPERATIVE GAME ENGINE ── */
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => document.getElementById(id);

    const canvas = $('gameCanvas');
    if (!canvas) return;

    let W, H;
    let score = 0, level = 1, combo = 0, maxCombo = 0;
    let bubbles = [], particles = [];
    let animId = null;
    let bubblesPopped = 0, bubblesMissed = 0;
    let sessionStart = 0;
    let gameRunning = false;
    let currentStress = 0, currentFocus = 0, autoPopAccum = 0;
    let peakBands = [0, 0, 0, 0, 0];

    const ctx = canvas.getContext('2d');

    function resize() {
      const wrap = canvasWrapRef.current || canvas.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = canvas.width = rect.width;
      H = canvas.height = rect.height;
    }
    window.addEventListener('resize', resize);
    resize();
    setTimeout(resize, 10);
    setTimeout(resize, 350);

    const hexToRgba = (hex, alpha) => {
      if (!hex) return `rgba(255,255,255,${alpha})`;
      if (hex.startsWith('rgba') || hex.startsWith('rgb')) return hex;
      let c = hex.substring(1).split('');
      if (c.length === 3) c = [c[0], c[0], c[1], c[1], c[2], c[2]];
      c = '0x' + c.join('');
      return 'rgba(' + [(c >> 16) & 255, (c >> 8) & 255, c & 255].join(',') + ',' + alpha + ')';
    };

    function getBubbleColors() {
      const t = themeRef.current?.colors || {};
      return [
        { stroke: t['--primary'] || '#00f5ff', fill: hexToRgba(t['--primary'] || '#00f5ff', 0.12), glow: t['--primary'] || '#00f5ff' },
        { stroke: t['--graph-line-1'] || '#00ff9d', fill: hexToRgba(t['--graph-line-1'] || '#00ff9d', 0.12), glow: t['--graph-line-1'] || '#00ff9d' },
        { stroke: t['--accent'] || '#7b2fff', fill: hexToRgba(t['--accent'] || '#7b2fff', 0.15), glow: t['--accent'] || '#7b2fff' },
        { stroke: t['--text-error'] || '#ff3d9a', fill: hexToRgba(t['--text-error'] || '#ff3d9a', 0.12), glow: t['--text-error'] || '#ff3d9a' },
        { stroke: t['--graph-line-2'] || '#ffb300', fill: hexToRgba(t['--graph-line-2'] || '#ffb300', 0.12), glow: t['--graph-line-2'] || '#ffb300' },
      ];
    }

    function spawnBubble() {
      const cols = getBubbleColors();
      const col = cols[Math.floor(Math.random() * cols.length)];
      const sf = currentStress / 100;
      const baseR = 20 + Math.random() * 20;
      const radius = baseR * (1.2 - sf * 0.5);
      const speed = 0.4 + Math.random() * 0.6 + sf * 0.8;
      bubbles.push({
        x: radius + Math.random() * (W - radius * 2), y: radius + Math.random() * (H - radius * 2), r: radius,
        speed, drift: (Math.random() - 0.5) * 0.4, col,
        wobble: Math.random() * Math.PI * 2, wobbleSpeed: 0.025 + Math.random() * 0.02,
        moveAngle: Math.random() * Math.PI * 2,
        opacity: 0, alive: true, points: Math.round(10 + sf * 15), age: 0,
      });
    }

    function spawnParticles(x, y, col, count = 14) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const spd = 2 + Math.random() * 4;
        particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, r: 2 + Math.random() * 3, life: 1, decay: 0.025 + Math.random() * 0.03, color: col.stroke });
      }
    }

    function spawnFloatText(x, y, text, color) {
      const el = document.createElement('div');
      el.className = 'pop-text absolute pointer-events-none font-display font-bold text-lg z-50';
      el.style.cssText = `left:${x}px;top:${y}px;color:${color};text-shadow:0 0 12px ${color}`;
      el.textContent = text;
      const wrap = canvasWrapRef.current;
      if (wrap) { wrap.appendChild(el); setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900); }
    }

    /* Focus-driven auto-pop: higher focus = faster popping */
    function autoPopBubbles() {
      if (currentFocus < 10 || bubbles.length === 0) return;
      const popsPerSec = ((currentFocus - 10) / 90) * 5;
      autoPopAccum += popsPerSec / 60;
      while (autoPopAccum >= 1 && bubbles.length > 0) {
        autoPopAccum -= 1;
        const idx = bubbles.findIndex(b => b.alive);
        if (idx === -1) break;
        const b = bubbles[idx];
        b.alive = false;
        bubblesPopped++;
        combo++; maxCombo = Math.max(maxCombo, combo);
        const pts = b.points + Math.floor(combo / 3) * 5;
        score += pts;
        spawnParticles(b.x, b.y, b.col, 14);
        spawnFloatText(b.x, b.y - b.r, `+${pts}`, b.col.glow);
        updateScoreUI();
      }
    }

    function updateScoreUI() {
      const sc = $('score-val'); if (sc) sc.textContent = score.toLocaleString();
      const newLvl = 1 + Math.floor(score / 500);
      if (newLvl !== level) { level = newLvl; const lv = $('level-val'); if (lv) lv.textContent = String(level).padStart(2, '0'); }
    }

    let spawnTimer = 0;
    function getSpawnInterval() {
      return Math.max(12, Math.round(80 - currentStress * 0.68));
    }

    // Running totals for true session averages
    let focusSum = 0, stressSum = 0, metricSampleCount = 0;

    /* ── Reactive EEG ingestion (replaces polling setInterval) ── */
    function ingestResult(ev) {
      if (!ev) return;
      currentStress = Math.max(0, Math.min(100, ev.stress_score ?? currentStress));
      currentFocus = Math.max(0, Math.min(100, ev.focus_score ?? currentFocus));

      // Accumulate for session averages
      if (gameRunning) {
        focusSum += currentFocus;
        stressSum += currentStress;
        metricSampleCount++;
      }

      setStressScore(Math.round(currentStress));
      setFocusScore(Math.round(currentFocus));
      updateBandPanel(ev);
    }

    // Expose ingestion function on the container ref for the useEffect
    container._ingestResult = ingestResult;

    function updateBandPanel(res) {
      const ids = ['delta', 'theta', 'alpha', 'beta', 'gamma'];
      let bands = [0, 0, 0, 0, 0];
      if (res?.band_powers?.length >= 5) {
        const bp = res.band_powers;
        // Only use first 5 bands (delta..gamma), exclude total power at index 5
        const sum = bp[0] + bp[1] + bp[2] + bp[3] + bp[4];
        bands = [0, 1, 2, 3, 4].map(i => sum > 0 ? Math.round((bp[i] / sum) * 100) : 0);
      }
      for (let i = 0; i < 5; i++) {
        const fill = $(`bf-${ids[i]}`); if (fill) fill.style.width = bands[i] + '%';
        const val = $(`bv-${ids[i]}`); if (val) val.textContent = bands[i] + '%';
        if (bands[i] > peakBands[i]) { peakBands[i] = bands[i]; const pk = $(`pk-${ids[i]}`); if (pk) pk.textContent = peakBands[i] + '%'; }
      }
    }

    let bgStars = [];
    function initStars() {
      bgStars = Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.5, a: Math.random(), twinkle: Math.random() * Math.PI * 2, ts: 0.02 + Math.random() * 0.03 }));
    }

    function drawBackground() {
      const t = themeRef.current?.colors || {};
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, t['--bg'] || '#010a14');
      bg.addColorStop(1, t['--surface'] || '#021220');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      bgStars.forEach(s => {
        s.twinkle += s.ts;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(t['--primary'] || '#00f5ff', s.a * (0.4 + 0.4 * Math.sin(s.twinkle)));
        ctx.fill();
      });
    }

    function drawBubbles() {
      bubbles.forEach(b => {
        b.wobble += b.wobbleSpeed;
        b.age++;
        // Float in a random direction with gentle wobble
        b.x += Math.cos(b.moveAngle) * b.speed * 0.4 + Math.sin(b.wobble) * 0.4;
        b.y += Math.sin(b.moveAngle) * b.speed * 0.4 + Math.cos(b.wobble) * 0.3;
        b.opacity = Math.min(1, b.opacity + 0.04);
        // Bounce off edges
        if (b.x < b.r) { b.x = b.r; b.moveAngle = Math.PI - b.moveAngle; }
        if (b.x > W - b.r) { b.x = W - b.r; b.moveAngle = Math.PI - b.moveAngle; }
        if (b.y < b.r) { b.y = b.r; b.moveAngle = -b.moveAngle; }
        if (b.y > H - b.r) { b.y = H - b.r; b.moveAngle = -b.moveAngle; }
        // Expire after ~8 seconds (480 frames at 60fps) if not popped
        if (b.age > 480) { b.alive = false; bubblesMissed++; if (combo > 0) combo = 0; return; }
        ctx.save(); ctx.globalAlpha = b.opacity;
        const grad = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .3, 1, b.x, b.y, b.r);
        grad.addColorStop(0, 'rgba(255,255,255,.15)'); grad.addColorStop(0.5, b.col.fill); grad.addColorStop(1, 'rgba(0,0,0,.05)');
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = b.col.stroke; ctx.lineWidth = 1.5; ctx.shadowBlur = 14; ctx.shadowColor = b.col.glow; ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x - b.r * .28, b.y - b.r * .3, b.r * .22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.shadowBlur = 0; ctx.fill();
        ctx.restore();
      });
    }

    function drawParticles() {
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= p.decay;
        if (p.life <= 0) return;
        ctx.save(); ctx.globalAlpha = p.life;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color; ctx.shadowBlur = 8; ctx.shadowColor = p.color; ctx.fill(); ctx.restore();
      });
      particles = particles.filter(p => p.life > 0);
    }

    function loop() {
      if (!gameRunning) return;
      animId = requestAnimationFrame(loop);
      drawBackground();
      spawnTimer++;
      const interval = getSpawnInterval();
      if (spawnTimer >= interval) {
        spawnBubble(); spawnTimer = 0;
        if (currentStress > 70) spawnBubble();
        if (currentStress > 90) spawnBubble();
      }
      drawBubbles(); drawParticles(); autoPopBubbles();
      bubbles = bubbles.filter(b => b.alive);
    }

    function loadSessionData() { try { return JSON.parse(localStorage.getItem('nb_sessions') || '[]'); } catch { return []; } }
    container.clearHistoryHandler = () => { localStorage.removeItem('nb_sessions'); renderSessionHistory(); };
    function saveSession(d) { const s = loadSessionData(); s.unshift(d); if (s.length > 5) s.pop(); localStorage.setItem('nb_sessions', JSON.stringify(s)); }
    function renderSessionHistory() {
      const sessions = loadSessionData(); const el = $('session-history'); if (!el) return;
      if (!sessions.length) { el.innerHTML = '<div class="text-[10px] text-[var(--muted)]/50 text-center tracking-[2px] py-4">NO SESSIONS YET</div>'; return; }
      el.innerHTML = sessions.map((s, i) => `
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-lg p-2.5 mb-2">
          <div class="flex justify-between items-baseline mb-1"><span class="text-[9px] text-[var(--teal)] opacity-60">#${i + 1}</span><span class="font-display text-[15px] font-bold text-white">${s.score.toLocaleString()}</span></div>
          <div class="flex gap-2 text-[8px] text-[var(--primary)]/60 tracking-widest uppercase font-bold"><span>LVL ${s.level}</span><span>ACC ${s.accuracy}%</span><span>${s.time}S</span><span>F:${s.avgFocus||0}%</span><span>S:${s.avgStress||0}%</span></div>
        </div>`).join('');
    }

    container.startGameHandler = () => {
      peakBands = [0, 0, 0, 0, 0];
      score = 0; level = 1; combo = 0; maxCombo = 0;
      bubblesPopped = 0; bubblesMissed = 0; bubbles = []; particles = [];
      spawnTimer = 0; autoPopAccum = 0; sessionStart = Date.now();
      focusSum = 0; stressSum = 0; metricSampleCount = 0;
      const sc = $('score-val'); if (sc) sc.textContent = '0';
      const lv = $('level-val'); if (lv) lv.textContent = '01';
      ['pk-delta','pk-theta','pk-alpha','pk-beta','pk-gamma'].forEach(id => { const e = $(id); if (e) e.textContent = '0%'; });
      setShowGameOver(false);
      initStars(); gameRunning = true;
      loop(); setGlobalRunning(true);
    };
    container.stopGameHandler = () => endGame();

    function endGame() {
      gameRunning = false; setGlobalRunning(false);
      if (animId) cancelAnimationFrame(animId);
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const acc = bubblesPopped + bubblesMissed > 0 ? Math.round(bubblesPopped / (bubblesPopped + bubblesMissed) * 100) : 0;
      const avgF = metricSampleCount > 0 ? Math.round(focusSum / metricSampleCount) : Math.round(currentFocus);
      const avgS = metricSampleCount > 0 ? Math.round(stressSum / metricSampleCount) : Math.round(currentStress);
      const sg = $('stat-grid');
      if (sg) sg.innerHTML = `
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">SCORE</div><div class="font-display text-xl font-bold text-white">${score.toLocaleString()}</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">LEVEL</div><div class="font-display text-xl font-bold text-white">${level}</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">MAX COMBO</div><div class="font-display text-xl font-bold text-white">${maxCombo}</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">POPPED</div><div class="font-display text-xl font-bold text-white">${bubblesPopped}</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">ACCURACY</div><div class="font-display text-xl font-bold text-white">${acc}%</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">TIME</div><div class="font-display text-xl font-bold text-white">${elapsed}s</div></div>`;
      setShowGameOver(true);
      saveSession({ score, level, accuracy: acc, time: elapsed, avgFocus: avgF, avgStress: avgS, mode: 'NEURAL' });
      renderSessionHistory();
    }

    initStars(); renderSessionHistory();
    drawBackground();

    return () => {
      window.removeEventListener('resize', resize);
      if (animId) cancelAnimationFrame(animId);
      gameRunning = false;
    };
  }, []);

  /* ── Reactive EEG ingestion via useEffect ── */
  useEffect(() => {
    if (!result || !containerRef.current) return;
    // Access ingestResult via the container ref to avoid stale closures
    if (typeof containerRef.current._ingestResult === 'function') {
      containerRef.current._ingestResult(result);
    }
  }, [result]);

  return (
    <div className="w-full h-full flex bg-[var(--bg)] overflow-hidden relative select-none" ref={containerRef}>
      {!eegMapped && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 backdrop-blur-md">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-xs font-bold text-amber-300 tracking-wider">Please map an EEG sensor in Settings for accurate data</span>
        </div>
      )}
      {eegMapped && isLowSignal && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/40 backdrop-blur-md">
          <AlertTriangle size={16} className="text-red-400" />
          <span className="text-xs font-bold text-red-300 tracking-wider">Weak EEG signal — check electrode contact</span>
        </div>
      )}
      <div className="flex-grow flex flex-col items-center justify-center relative transition-all duration-300">
        <div className="absolute inset-0 bubble-canvas-wrap" ref={canvasWrapRef}>
          <canvas id="gameCanvas"></canvas>
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.06)_2px,rgba(0,0,0,0.06)_4px)] z-[300]"></div>

          {/* Top HUD */}
          <div className="absolute top-6 left-6 z-50 pointer-events-none flex flex-col items-start">
            <span className="font-display text-[10px] tracking-widest text-[var(--primary)] opacity-70">SCORE</span>
            <span id="score-val" className="font-display text-4xl font-black text-white drop-shadow-[0_0_16px_var(--primary)]">0</span>
          </div>
          <div className="absolute top-6 right-6 z-50 pointer-events-none flex flex-col items-end">
            <span className="font-display text-[10px] tracking-widest text-[var(--primary)] opacity-70">LEVEL</span>
            <span id="level-val" className="font-display text-3xl font-bold text-[var(--graph-line-1)] drop-shadow-[0_0_12px_var(--graph-line-1)]">01</span>
          </div>

          {/* Neural Status HUD */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex gap-6">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black tracking-widest text-red-400 uppercase">Stress</span>
              <span className="font-display text-2xl font-black text-red-400">{stressScore}%</span>
              <span className="text-[8px] text-red-400/60">{stressScore > 70 ? 'HIGH SPAWN' : stressScore > 40 ? 'MEDIUM' : 'LOW'}</span>
            </div>
            <div className="w-px h-12 bg-white/10" />
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black tracking-widest text-cyan-400 uppercase">Focus</span>
              <span className="font-display text-2xl font-black text-cyan-400">{focusScore}%</span>
              <span className="text-[8px] text-cyan-400/60">{focusScore > 60 ? 'FAST POP' : focusScore > 30 ? 'POPPING' : 'IDLE'}</span>
            </div>
          </div>

          {/* Game Over */}
          <div id="gameOverScreen" className={`${showGameOver ? 'flex' : 'hidden'} absolute inset-0 z-[200] flex-col items-center justify-center bg-[var(--bg)]/90 backdrop-blur-xl pointer-events-auto`}>
            <h1 className="font-display text-5xl md:text-6xl font-black tracking-widest text-white drop-shadow-[0_0_30px_var(--primary)] mb-8 text-center leading-tight">SESSION<br />ENDED</h1>
            <div id="stat-grid" className="grid grid-cols-3 gap-3 mb-8 w-[min(460px,94%)]"></div>
            <button onClick={() => containerRef.current?.startGameHandler()} className="font-display text-xs tracking-widest px-10 py-3 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 text-white hover:bg-[var(--primary)]/20 transition-all">NEW SESSION</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BubbleGameView;
