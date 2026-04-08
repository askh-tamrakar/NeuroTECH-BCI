import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Play, Square, Activity, Gamepad2, Mouse, Zap } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import '../../../styles/views/BubbleGameView.css';
import BubbleSidebar from '../sidebar/BubbleSidebar';
import { useSidebar } from './SidebarContext';

const BubbleGameView = ({ result, isConnected }) => {
  const containerRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const resultRef = useRef(null);
  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  const [globalRunning, setGlobalRunning] = useState(false);
  const [mouseMode, setMouseMode] = useState(false);
  const [difficulty, setDifficulty] = useState(1);
  const [showGameOver, setShowGameOver] = useState(false);
  const isConnectedRef = useRef(isConnected);

  // Refs so the imperative game loop always reads latest values
  const mouseModeRef = useRef(mouseMode);
  const difficultyRef = useRef(difficulty);
  useEffect(() => { mouseModeRef.current = mouseMode; }, [mouseMode]);
  useEffect(() => { difficultyRef.current = difficulty; }, [difficulty]);

  const [realTimeFreq, setRealTimeFreq] = useState(0);
  const [focusScore, setFocusScore] = useState(0);
  const [activeChannel, setActiveChannel] = useState('attention');
  const activeChannelRef = useRef(activeChannel);

  useEffect(() => { activeChannelRef.current = activeChannel; }, [activeChannel]);

  const { setSidebarSlot, setSidebarMiniSlot, setSidebarMode } = useSidebar();

  // Update the sidebar slot whenever the game state changes
  useEffect(() => {
    setSidebarSlot(
      <BubbleSidebar
        mouseMode={mouseMode}
        setMouseMode={setMouseMode}
        difficulty={difficulty}
        setDifficulty={setDifficulty}
        realTimeFreq={realTimeFreq}
        focusScore={focusScore}
        globalRunning={globalRunning}
        containerRef={containerRef}
      />
    );
    setSidebarMiniSlot(
      <div className="flex h-full w-full flex-col items-center gap-3 px-2 py-3 [scrollbar-width:none] [-ms-overflow-style:'none'] [&::-webkit-scrollbar]:hidden">
        <div className="mt-12 flex flex-col items-center gap-2">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--primary)]/35 bg-[var(--primary)]/10 text-[var(--primary)]">
            <Gamepad2 size={18} />
          </div>
          <span className="text-[9px] font-black uppercase tracking-[2px] text-[var(--primary)] [writing-mode:vertical-rl] rotate-180">
            Bubble
          </span>
        </div>

        <div className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--primary)]/20 bg-[var(--bg)]/60 px-1.5 py-2 shadow-[0_0_12px_rgba(0,0,0,0.16)]">
          <button
            type="button"
            onClick={() => globalRunning ? containerRef.current?.stopGameHandler() : containerRef.current?.startGameHandler()}
            className={`flex h-11 w-11 items-center justify-center rounded-xl border ${globalRunning ? 'border-red-500/35 bg-red-500/10 text-red-400' : 'border-green-500/35 bg-green-500/10 text-green-400'}`}
            title={globalRunning ? 'End session' : 'Start session'}
          >
            {globalRunning ? <Square size={18} /> : <Play size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setMouseMode((prev) => !prev)}
            className={`flex h-11 w-11 items-center justify-center rounded-xl border ${mouseMode ? 'border-amber-500/35 bg-amber-500/10 text-amber-400' : 'border-[var(--border)] bg-[var(--bg)] text-[var(--text)]'}`}
            title={mouseMode ? 'Switch to sensor mode' : 'Switch to manual mode'}
          >
            {mouseMode ? <Mouse size={18} /> : <Zap size={18} />}
          </button>
        </div>

        <div className="flex w-full flex-col gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)]/60 px-1.5 py-2">
          <span className="text-center text-[8px] font-black uppercase tracking-[2px] text-[var(--muted)]">Level</span>
          <div className="flex flex-col gap-1">
            {[1, 2, 3].map((lvl) => (
              <button
                key={lvl}
                type="button"
                onClick={() => setDifficulty(lvl)}
                className={`rounded-lg border px-1 py-1.5 text-[8px] font-black uppercase tracking-[1.5px] ${difficulty === lvl ? 'border-[var(--primary)]/50 bg-[var(--primary)]/15 text-[var(--primary)]' : 'border-[var(--border)] bg-[var(--surface)]/60 text-[var(--muted)]'}`}
                title={`Set difficulty ${lvl}`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-col items-center gap-1 rounded-2xl border border-[var(--border)] bg-[var(--bg)] px-1.5 py-2 text-center">
          <div className="text-[8px] font-black uppercase tracking-[2px] text-[var(--muted)]">Focus</div>
          <div className="text-[10px] font-black text-[var(--primary)]">{focusScore}%</div>
          <div className="text-[8px] font-black uppercase tracking-[1.5px] text-[var(--primary)]/70">
            {realTimeFreq ? `${Math.round(realTimeFreq)}hz` : 'idle'}
          </div>
        </div>
      </div>
    );
    setSidebarMode('page');
    // Important: Clear the slot on unmount to avoid ghost sidebars
    return () => {
      setSidebarSlot(null);
      setSidebarMiniSlot(null);
    };
  }, [mouseMode, difficulty, realTimeFreq, focusScore, globalRunning, setSidebarSlot, setSidebarMiniSlot, setSidebarMode]);

  useEffect(() => { themeRef.current = currentTheme; }, [currentTheme]);
  useEffect(() => { resultRef.current = result; }, [result]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
    if (containerRef.current && containerRef.current.onConnectionChange) {
      containerRef.current.onConnectionChange(isConnected);
    }
  }, [isConnected]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => container.querySelector(`#${id}`);
    const $$ = (sel) => container.querySelectorAll(sel);

    const canvas = $('gameCanvas');
    if (!canvas) return;

    let W, H;
    let score = 0, level = 1, lives = 3, combo = 0, maxCombo = 0;
    let bubbles = [], particles = [];
    let mouseX = 0, mouseY = 0;
    let eegSignal = 0, rawSignal = 0;
    let eegMode = 'simulate';
    let simInterval = null, fetchInterval = null;
    let waveHistory = [];
    const WAVE_LEN = 140;
    let gameRunning = false;
    let isMouseMode = mouseMode;
    let animId = null;
    let bubblesPopped = 0, bubblesMissed = 0;
    let sessionStart = 0;
    let peakBands = [0, 0, 0, 0, 0];
    let currentCalmSignal = 0;

    // Ensure we are in 'ws' mode if connected
    if (isConnectedRef.current) eegMode = 'ws';
    const ctx = canvas.getContext('2d');
    const waveCanvas = $('waveCanvas');
    const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

    const channels = {
      attention: v => Math.max(0, Math.min(1, v / 100)),
      alpha: v => Math.max(0, Math.min(1, v / 10)),
      theta: v => Math.max(0, Math.min(1, v / 10)),
      beta: v => Math.max(0, Math.min(1, v / 10)),
    };

    function resize() {
      const wrap = canvasWrapRef.current || canvas.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = canvas.width = rect.width;
      H = canvas.height = rect.height;
      if (waveCanvas) waveCanvas.width = waveCanvas.offsetWidth || 560;
    }
    window.addEventListener('resize', resize);
    resize(); // Force instant dimension assignment before drawBackground
    // Initial delay for tailwind transitions
    setTimeout(resize, 10);
    setTimeout(resize, 350);

    const mouseMoveHandler = (e) => {
      const wrap = canvasWrapRef.current || canvas.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      const cur = $('cursor');
      if (cur) { cur.style.left = mouseX + 'px'; cur.style.top = mouseY + 'px'; }
    };
    window.addEventListener('mousemove', mouseMoveHandler);

    function stopStream() {
      eegMode = 'idle';
      const indicator = $('conn-indicator');
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444]';
      const label = $('conn-label'); if (label) label.textContent = 'DISCONNECTED';
      if (fetchInterval) clearInterval(fetchInterval);

      eegSignal = 0; rawSignal = 0;
      setRealTimeFreq(0); setFocusScore(0);

      waveHistory = new Array(WAVE_LEN).fill(0);
      drawWave();

      ['delta', 'theta', 'alpha', 'beta', 'gamma'].forEach(id => {
        const bf = $(`bf-${id}`); if (bf) bf.style.width = '0%';
        const bv = $(`bv-${id}`); if (bv) bv.textContent = '0%';
      });
      const ae = $('bd-attn-val'); if (ae) ae.textContent = '0%';
      const af = $('bd-attn-fill'); if (af) af.style.strokeDashoffset = 201;
    }


    function startLiveStream() {
      eegMode = 'ws';
      const indicator = $('conn-indicator');
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]';
      const label = $('conn-label'); if (label) label.textContent = 'CONNECTED';

      if (simInterval) clearInterval(simInterval);
      if (fetchInterval) clearInterval(fetchInterval);

      fetchInterval = setInterval(() => {
        const event = resultRef.current;
        if (!event) return;

        const features = event.features || {};
        const total = (features.delta||0) + (features.theta||0) + (features.alpha||0) + (features.beta||0) + 1e-6;
        
        let alphaRel = features.alpha_rel || 0;
        let betaRel = features.beta_rel || 0;
        let thetaRel = features.theta_rel || 0;

        if (total > 1e-5) {
          alphaRel = (features.alpha||0) / total;
          betaRel = (features.beta||0) / total;
          thetaRel = (features.theta||0) / total;
        } else if (event.band_powers && event.band_powers.length >= 4) {
          const bp = event.band_powers;
          const sum = bp.reduce((a, b) => a + b, 0) + 1e-6;
          thetaRel = bp[1] / sum;
          alphaRel = bp[2] / sum;
          betaRel = bp[3] / sum;
        }

        // Meditation calm (spawns bubbles)
        const calmVal = Math.max(0, Math.min(1, alphaRel * 1.5 + thetaRel * 0.5 - betaRel * 0.5));
        
        // Focus (attention, beta) (pops bubbles)
        const focusVal = Math.max(0, Math.min(1, betaRel * 2.0));

        rawSignal = focusVal * 100;
        eegSignal = focusVal; 
        currentCalmSignal = calmVal;

        updateEEGUI();
      }, 60);
    }

    function updateEEGUI() {
      waveHistory.push(eegSignal);
      if (waveHistory.length > WAVE_LEN) waveHistory.shift();
      const fill = $('signal-fill');
      if (fill) { fill.style.width = (eegSignal * 100) + '%'; fill.className = 'signal-fill ' + (eegSignal > .65 ? 'high' : eegSignal < .3 ? 'low' : ''); }

      // Update React state explicitly for sidebar UI
      // Throttle state updates for the sidebar to 10Hz (once every 6 frames at 60fps)
      if (typeof window !== 'undefined' && (!window._bubbleThrottle || window._bubbleThrottle > 6)) {
        setRealTimeFreq(isNaN(rawSignal) ? 0 : rawSignal);
        setFocusScore(Math.round(eegSignal * 100));
        window._bubbleThrottle = 0;
      }
      window._bubbleThrottle = (window._bubbleThrottle || 0) + 1;

      drawWave();
      updateBandPanel();
    }

    function updateBandPanel() {
      const res = resultRef.current;
      const bfIds = ['bf-delta', 'bf-theta', 'bf-alpha', 'bf-beta', 'bf-gamma'];
      const bvIds = ['bv-delta', 'bv-theta', 'bv-alpha', 'bv-beta', 'bv-gamma'];
      const pkIds = ['pk-delta', 'pk-theta', 'pk-alpha', 'pk-beta', 'pk-gamma'];
      let bands = [];
      if (res && res.features) {
        const f = res.features;
        bands = [
          Math.round((f.delta_rel || 0) * 100),
          Math.round((f.theta_rel || 0) * 100),
          Math.round((f.alpha_rel || 0) * 100),
          Math.round((f.beta_rel || 0) * 100),
          Math.round((f.gamma_rel || 0) * 100),
        ];
      } else if (res && res.band_powers && res.band_powers.length >= 5) {
        const bp = res.band_powers;
        const sum = bp.reduce((a, b) => a + b, 0);
        bands = bp.map(v => sum > 0 ? Math.round((v / sum) * 100) : 0);
      } else {
        // No real data - show zero activity rather than fake oscillations
        bands = [0, 0, 0, 0, 0];
      }
      for (let i = 0; i < 5; i++) {
        const fill = $(bfIds[i]); if (fill) fill.style.width = bands[i] + '%';
        const val = $(bvIds[i]); if (val) val.textContent = bands[i] + '%';
        if (bands[i] > peakBands[i]) {
          peakBands[i] = bands[i];
          const pk = $(pkIds[i]); if (pk) pk.textContent = peakBands[i] + '%';
        }
      }
      const relTheta = (bands[1] || 0) / 100;
      const relAlpha = (bands[2] || 0) / 100;
      const relBeta = (bands[3] || 0) / 100;
      const attn = Math.min(99, Math.round((relBeta / (relTheta + relAlpha + 0.01)) * 50));
      const ae = $('bd-attn-val'); if (ae) ae.textContent = attn + '%';
      const af = $('bd-attn-fill'); if (af) af.style.strokeDashoffset = (201 - (attn / 100) * 201);
    }

    function drawWave() {
      if (!waveCanvas) return;
      const cw = waveCanvas.width, ch = waveCanvas.height;
      waveCtx.clearRect(0, 0, cw, ch);
      if (waveHistory.length < 2) return;
      const step = cw / (WAVE_LEN - 1);
      waveCtx.beginPath();
      waveCtx.strokeStyle = '#00f5ff'; waveCtx.lineWidth = 1.5;
      waveCtx.shadowColor = '#00f5ff'; waveCtx.shadowBlur = 4;
      for (let i = 0; i < waveHistory.length; i++) {
        const x = (i - (WAVE_LEN - waveHistory.length)) * step;
        const y = ch - waveHistory[i] * (ch * 0.85) - ch * 0.07;
        i === 0 ? waveCtx.moveTo(x, y) : waveCtx.lineTo(x, y);
      }
      waveCtx.stroke();

      waveCtx.beginPath();
      for (let i = 0; i < waveHistory.length; i++) {
        const x = (i - (WAVE_LEN - waveHistory.length)) * step;
        const y = ch - waveHistory[i] * (ch * 0.85) - ch * 0.07;
        i === 0 ? waveCtx.moveTo(x, y) : waveCtx.lineTo(x, y);
      }
      waveCtx.lineTo(cw, ch); waveCtx.lineTo(0, ch); waveCtx.closePath();
      const grad = waveCtx.createLinearGradient(0, 0, 0, ch);
      grad.addColorStop(0, 'rgba(0,245,255,.12)'); grad.addColorStop(1, 'rgba(0,245,255,0)');
      waveCtx.fillStyle = grad; waveCtx.fill();
    }

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
      const tc1 = t['--primary'] || '#00f5ff';
      const tc2 = t['--graph-line-1'] || '#00ff9d';
      const tc3 = t['--accent'] || '#7b2fff';
      const tc4 = t['--text-error'] || '#ff3d9a';
      const tc5 = t['--graph-line-2'] || '#ffb300';
      return [
        { stroke: tc1, fill: hexToRgba(tc1, 0.12), glow: tc1 },
        { stroke: tc2, fill: hexToRgba(tc2, 0.12), glow: tc2 },
        { stroke: tc3, fill: hexToRgba(tc3, 0.15), glow: tc3 },
        { stroke: tc4, fill: hexToRgba(tc4, 0.12), glow: tc4 },
        { stroke: tc5, fill: hexToRgba(tc5, 0.12), glow: tc5 },
      ];
    }

    const SPECIAL_TYPES = ['normal', 'normal', 'normal', 'chain', 'score', 'bomb'];

    function spawnBubble() {
      const cols = getBubbleColors();
      const col = cols[Math.floor(Math.random() * cols.length)];
      const type = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];

      let diff = difficultyRef.current || 1;

      const radius = 35 + Math.random() * 40 + (type === 'bomb' ? 15 : 0);
      bubbles.push({
        x: radius + Math.random() * (W - radius * 2), y: H + radius, r: radius,
        speed: 0.6 + Math.random() * 0.8 + level * 0.12 + (diff - 1) * 0.8,
        drift: (Math.random() - 0.5) * 0.4, col, type,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.03 + Math.random() * 0.02,
        opacity: 0, alive: true,
      });
    }

    function spawnParticles(x, y, col, count = 14) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 2 + Math.random() * 4;
        particles.push({
          x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 3, life: 1, decay: 0.025 + Math.random() * 0.03, color: col.stroke
        });
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

    function getCursorRadius() {
      const isManualMode = mouseModeRef.current;
      const r = isManualMode ? 65 : (20 + eegSignal * 110);
      
      const cur = $('cursor');
      if (cur) {
        const s = Math.round(r * 2 + 20);
        cur.setAttribute('width', s); cur.setAttribute('height', s);
        cur.style.marginLeft = (-s / 2) + 'px'; cur.style.marginTop = (-s / 2) + 'px';
        const aura = $('cursorAura');
        if (aura) { 
          aura.setAttribute('cx', s / 2); aura.setAttribute('cy', s / 2); aura.setAttribute('r', s / 2 - 4); 
          aura.setAttribute('opacity', isManualMode ? 0.6 : (0.3 + eegSignal * 0.55)); 
        }
        $$('#cursor circle').forEach((c, i) => { if (i > 0) { c.setAttribute('cx', s / 2); c.setAttribute('cy', s / 2); } });
      }
      return r;
    }

    function checkPops() {
      const curR = getCursorRadius();
      let poppedThisFrame = [];
      bubbles.forEach(b => {
        if (!b.alive) return;
        const dx = b.x - mouseX, dy = b.y - mouseY;
        if (Math.sqrt(dx * dx + dy * dy) < curR + b.r) { b.alive = false; poppedThisFrame.push(b); }
      });
      if (poppedThisFrame.length > 0) {
        combo++; maxCombo = Math.max(maxCombo, combo);
        poppedThisFrame.forEach(b => {
          bubblesPopped++;
          const pts = b.type === 'score' ? 50 : b.type === 'chain' ? 20 : 10;
          const total = pts + Math.floor(combo / 3) * 5;
          score += total;
          spawnParticles(b.x, b.y, b.col, b.type === 'bomb' ? 28 : 14);
          spawnFloatText(b.x, b.y - b.r, `+${total}` + (combo >= 3 ? ` ×${combo}` : ''), b.col.glow);
          if (b.type === 'bomb') {
            bubbles.forEach(o => {
              if (!o.alive) return;
              const dx2 = o.x - b.x, dy2 = o.y - b.y;
              if (Math.sqrt(dx2 * dx2 + dy2 * dy2) < 80) { o.alive = false; bubblesPopped++; score += 15; spawnParticles(o.x, o.y, o.col, 8); }
            });
          }
        });
        updateScoreUI(); updateComboUI();
      } else { if (combo > 0) combo = 0; }
      bubbles = bubbles.filter(b => b.alive);
    }

    function updateScoreUI() {
      const sc = $('score-val'); if (sc) sc.textContent = score.toLocaleString();
      const newLvl = 1 + Math.floor(score / 500);
      if (newLvl !== level) { level = newLvl; const lv = $('level-val'); if (lv) lv.textContent = String(level).padStart(2, '0'); }
    }
    function updateComboUI() {
      const el = $('combo-display');
      if (el) el.textContent = combo >= 3 ? `COMBO ×${combo}` : '';
    }
    function buildLivesUI() {
      const el = $('hud-lives'); if (!el) return; el.innerHTML = '';
      for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'w-2.5 h-2.5 rounded-full bg-pink-500 shadow-[0_0_8px_#ec4899] transition-opacity ' + (i >= lives ? 'opacity-10 shadow-none' : ''); el.appendChild(d); }
    }

    let spawnTimer = 0;
    function spawnRate() {
      const diff = difficultyRef.current || 1;
      const isManualMode = mouseModeRef.current;
      if (isManualMode) {
        // Classic game mechanics for manual mode
        return Math.max(15, 80 - level * 5 - (diff - 1) * 20);
      } else {
        // EEG mechanics for sensor mode: calm spawns faster
        let base = 120 - currentCalmSignal * 90;
        return Math.max(8, base - level * 5 - (diff - 1) * 20);
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
        b.wobble += b.wobbleSpeed; b.x += b.drift + Math.sin(b.wobble) * 0.4; b.y -= b.speed;
        b.opacity = Math.min(1, b.opacity + 0.04);
        if (b.y < -b.r * 2) { b.alive = false; if (b.type !== 'bomb') { bubblesMissed++; lives = Math.max(0, lives - 1); buildLivesUI(); if (lives === 0) endGame(); } return; }
        ctx.save(); ctx.globalAlpha = b.opacity;
        if (b.type === 'score') { ctx.shadowBlur = 30; ctx.shadowColor = b.col.glow; }
        else if (b.type === 'bomb') { ctx.shadowBlur = 25; ctx.shadowColor = '#ff3d9a'; }
        const grad = ctx.createRadialGradient(b.x - b.r * .3, b.y - b.r * .3, 1, b.x, b.y, b.r);
        grad.addColorStop(0, 'rgba(255,255,255,.15)'); grad.addColorStop(0.5, b.col.fill); grad.addColorStop(1, 'rgba(0,0,0,.05)');
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
        ctx.strokeStyle = b.col.stroke; ctx.lineWidth = 1.5; ctx.shadowBlur = 14; ctx.shadowColor = b.col.glow; ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x - b.r * .28, b.y - b.r * .3, b.r * .22, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.shadowBlur = 0; ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = b.col.stroke; ctx.font = `bold ${b.r * .7}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (b.type === 'score') ctx.fillText('★', b.x, b.y);
        else if (b.type === 'bomb') { ctx.fillStyle = '#ff3d9a'; ctx.fillText('⚡', b.x, b.y); }
        else if (b.type === 'chain') ctx.fillText('◈', b.x, b.y);
        ctx.restore();
      });
    }

    function drawParticles() {
      particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= p.decay; if (p.life <= 0) return; ctx.save(); ctx.globalAlpha = p.life; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2); ctx.fillStyle = p.color; ctx.shadowBlur = 8; ctx.shadowColor = p.color; ctx.fill(); ctx.restore(); });
      particles = particles.filter(p => p.life > 0);
    }

    function drawCursorGlow() {
      const r = getCursorRadius();
      const prim = themeRef.current?.colors?.['--primary'] || '#00f5ff';
      const alpha = 0.04 + eegSignal * 0.09;
      const grad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, r);
      grad.addColorStop(0, hexToRgba(prim, alpha * 2)); grad.addColorStop(0.5, hexToRgba(prim, alpha)); grad.addColorStop(1, hexToRgba(prim, 0));
      ctx.beginPath(); ctx.arc(mouseX, mouseY, r, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    }

    function loop() {
      if (!gameRunning) return;
      animId = requestAnimationFrame(loop);
      drawBackground(); drawCursorGlow();
      spawnTimer++;
      if (spawnTimer >= spawnRate()) { spawnBubble(); spawnTimer = 0; }
      if (level > 3 && spawnTimer === Math.floor(spawnRate() / 2)) spawnBubble();
      drawBubbles(); drawParticles(); checkPops();
    }

    // ── SESSION DATA ──────────────────────────────
    function loadSessionData() {
      try { return JSON.parse(localStorage.getItem('nb_sessions') || '[]'); } catch { return []; }
    }

    container.clearHistoryHandler = () => {
      localStorage.removeItem('nb_sessions');
      renderSessionHistory();
    };

    function saveSession(sessionData) {
      const sessions = loadSessionData();
      sessions.unshift(sessionData);
      if (sessions.length > 5) sessions.pop();
      localStorage.setItem('nb_sessions', JSON.stringify(sessions));
    }
    function renderSessionHistory() {
      const sessions = loadSessionData();
      const container2 = $('session-history');
      if (!container2) return;
      if (sessions.length === 0) { container2.innerHTML = '<div class="text-[10px] text-[var(--muted)]/50 text-center tracking-[2px] py-4">NO SESSIONS YET</div>'; return; }
      container2.innerHTML = sessions.map((s, i) => `
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-lg p-2.5 mb-2 hover:bg-[var(--primary)]/10 transition-colors">
          <div class="flex justify-between items-baseline mb-1">
            <span class="text-[9px] text-[var(--teal)] opacity-60 tracking-wider">#${i + 1}</span>
            <span class="font-display text-[15px] font-bold text-white shadow-glow">${s.score.toLocaleString()}</span>
          </div>
          <div class="flex gap-2 text-[8px] text-[var(--primary)]/60 tracking-widest flex-wrap uppercase font-bold">
            <span>LVL ${s.level}</span>
            <span>ACC ${s.accuracy}%</span>
            <span>${s.time}S</span>
            <span class="${s.mode === 'MANUAL' ? 'text-amber-500' : 'text-[var(--primary)]'}">${s.mode}</span>
          </div>
        </div>
      `).join('');
    }

    // ── GAME CONTROL ──────────────────────────────
    container.startGameHandler = () => {
      peakBands = [0, 0, 0, 0, 0];
      score = 0; level = 1; lives = 3; combo = 0; maxCombo = 0;
      bubblesPopped = 0; bubblesMissed = 0; bubbles = []; particles = []; waveHistory = [];
      spawnTimer = 0; sessionStart = Date.now();
      const sc = $('score-val'); if (sc) sc.textContent = '0';
      const lv = $('level-val'); if (lv) lv.textContent = '01';
      const cd = $('combo-display'); if (cd) cd.textContent = '';
      ['pk-delta', 'pk-theta', 'pk-alpha', 'pk-beta', 'pk-gamma'].forEach(id => { const el = $(id); if (el) el.textContent = '0%'; });
      buildLivesUI();

      setShowGameOver(false);

      initStars(); gameRunning = true;
      if (!fetchInterval && isConnectedRef.current) {
        startLiveStream();
      }
      loop();
      setGlobalRunning(true);
    };

    container.stopGameHandler = () => {
      endGame();
    };

    container.onConnectionChange = (connected) => {
      if (connected) { if (gameRunning && !fetchInterval) startLiveStream(); else if (!gameRunning) startLiveStream(); }
      else stopStream();
    };

    function endGame() {
      gameRunning = false;
      setGlobalRunning(false);
      if (animId) cancelAnimationFrame(animId);
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const acc = bubblesPopped + bubblesMissed > 0 ? Math.round(bubblesPopped / (bubblesPopped + bubblesMissed) * 100) : 0;
      const statGrid = $('stat-grid');
      if (statGrid) {
        statGrid.innerHTML = `
            <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">SCORE</div><div class="font-display text-xl font-bold text-white">${score.toLocaleString()}</div></div>
            <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">LEVEL</div><div class="font-display text-xl font-bold text-white">${level}</div></div>
            <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">COMBO</div><div class="font-display text-xl font-bold text-white">${maxCombo}</div></div>
            <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">POPPED</div><div class="font-display text-xl font-bold text-white">${bubblesPopped}</div></div>
            <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">ACCURACY</div><div class="font-display text-xl font-bold text-white">${acc}%</div></div>
            <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">TIME</div><div class="font-display text-xl font-bold text-white">${elapsed}s</div></div>
          `;
      }
      setShowGameOver(true);

      const isManualMode = mouseModeRef.current;
      saveSession({ score, level, accuracy: acc, time: elapsed, mode: isManualMode ? 'MANUAL' : 'SENSOR' });
      renderSessionHistory();
    }

    // Removed manual DOM tag handlers

    initStars(); renderSessionHistory();
    if (isConnectedRef.current) startLiveStream(); else stopStream();
    // initial paint draw
    drawBackground();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', mouseMoveHandler);
      if (fetchInterval) clearInterval(fetchInterval);
      if (animId) cancelAnimationFrame(animId);
      gameRunning = false;
    };
  }, []);

  return (
    <div className="w-full h-full flex bg-[var(--bg)] overflow-hidden relative select-none" ref={containerRef}>

      {/* ── GAME CANVAS MAIN AREA ── */}
      <div className="flex-grow flex flex-col items-center justify-center relative transition-all duration-300">
        <div className="absolute inset-0 bubble-canvas-wrap" ref={canvasWrapRef}>
          <canvas id="gameCanvas"></canvas>

          {/* Custom Cursor Aura */}
          <svg id="cursor" className="absolute pointer-events-none z-[100] transition-[width,height] duration-75" width="60" height="60" viewBox="0 0 60 60">
            <defs>
              <radialGradient id="cg" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00f5ff" stopOpacity=".9" />
                <stop offset="60%" stopColor="#00f5ff" stopOpacity=".15" />
                <stop offset="100%" stopColor="#00f5ff" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle id="cursorAura" cx="30" cy="30" r="26" fill="url(#cg)" opacity=".8" />
          </svg>

          {/* Overlays Canvas */}
          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.06)_2px,rgba(0,0,0,0.06)_4px)] z-[300]"></div>

          {/* Floating Top HUDs */}
          <div className="absolute top-6 left-6 z-50 pointer-events-none flex flex-col items-start">
            <span className="font-display text-[10px] tracking-widest text-[var(--primary)] opacity-70">SCORE</span>
            <span id="score-val" className="font-display text-4xl font-black text-white drop-shadow-[0_0_16px_var(--primary)]">0</span>
          </div>

          <div className="absolute top-6 right-6 z-50 pointer-events-none flex flex-col items-end">
            <span className="font-display text-[10px] tracking-widest text-[var(--primary)] opacity-70">LEVEL</span>
            <span id="level-val" className="font-display text-3xl font-bold text-[var(--graph-line-1)] drop-shadow-[0_0_12px_var(--graph-line-1)]">01</span>
            <span id="combo-display" className="font-display text-[13px] text-amber-500 mt-1 drop-shadow-md min-h-[20px]"></span>
          </div>

          <div id="hud-lives" className="absolute top-7 left-1/2 -translate-x-1/2 z-50 flex gap-2"></div>

          {/* Bottom HUD - Floating Panel */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto rounded-xl bg-[var(--surface)]/80 border border-[var(--primary)]/20 p-3 shadow-2xl backdrop-blur-md w-[min(560px,94%)]">
            <div className="flex justify-between items-center mb-2">
              <span className="font-display text-[9px] tracking-[3px] text-[var(--primary)] opacity-90 uppercase">EEG F1/F2 Signals (Ear Ref)</span>
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-[var(--primary)]/30 text-[9px] font-bold tracking-widest cursor-pointer hover:bg-[var(--primary)]/10 transition-colors">
                <span id="conn-indicator" className="w-2 h-2 rounded-full bg-gray-500"></span>
                <span id="conn-label" className="text-[var(--text)] uppercase">Waiting</span>
              </div>
            </div>
            <canvas id="waveCanvas" className="w-full h-10 rounded bg-black/30 mb-2"></canvas>
            <div className="h-1.5 bg-[var(--primary)]/10 rounded-full overflow-hidden mb-1.5">
              <div id="signal-fill" className="h-full bg-gradient-to-r from-[var(--teal)] to-[var(--primary)] shadow-[0_0_10px_var(--primary)] w-0 transition-all duration-100"></div>
            </div>
            <div className="flex justify-between text-[9px] text-[var(--primary)]/60 font-bold tracking-widest uppercase">
              <span>Activity Map</span>
              <span>Signal <span id="signal-val" className="text-[var(--primary)] font-black ml-1">0.00</span></span>
              <span>Focus <span id="focus-val" className="text-[var(--primary)] font-black ml-1">0%</span></span>
            </div>
            <div className="flex gap-2 flex-wrap mt-2">
              {['Fp1', 'Oz', 'attention', 'alpha', 'theta', 'beta'].map(ch => (
                <span
                  key={ch}
                  className={`ch-tag text-[9px] tracking-widest px-2 py-1 border border-[var(--primary)]/20 rounded cursor-pointer transition-colors select-none ${ch === activeChannel ? 'active bg-[var(--primary)]/15 border-[var(--primary)] text-white' : 'hover:bg-[var(--primary)]/5'}`}
                  onClick={() => setActiveChannel(ch)}
                >
                  {ch === 'attention' ? 'ATTN' : ch.toUpperCase()}
                </span>
              ))}
            </div>
          </div>

          {/* Game Over Screen */}
          <div id="gameOverScreen" className={`${showGameOver ? 'flex' : 'hidden'} absolute inset-0 z-[200] flex-col items-center justify-center bg-[var(--bg)]/90 backdrop-blur-xl pointer-events-auto`}>
            <h1 className="font-display text-5xl md:text-6xl font-black tracking-widest text-white drop-shadow-[0_0_30px_var(--primary)] mb-8 text-center leading-tight">SESSION<br />ENDED</h1>
            <div id="stat-grid" className="grid grid-cols-3 gap-3 mb-8 w-[min(460px,94%)]"></div>
            <button onClick={() => containerRef.current?.startGameHandler()} className="font-display text-xs tracking-widest px-10 py-3 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 text-white hover:bg-[var(--primary)]/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)] transition-all">
              NEW SESSION
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BubbleGameView;
