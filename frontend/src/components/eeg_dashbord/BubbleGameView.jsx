import React, { useEffect, useRef, useState } from 'react';
import { Settings, Play, Square, Activity, MousePointer2, Zap, History, Menu, ChevronLeft, ChevronUp, Power, ChevronDown, Gamepad2, Mouse, Trash2 } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import '../../styles/views/BubbleGameView.css';

const BubbleGameView = ({ result, isConnected, onBackToMenu }) => {
  const containerRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const resultRef = useRef(null);
  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  const [showSidebar, setShowSidebar] = useState(true);
  const [globalRunning, setGlobalRunning] = useState(false);
  const [mouseMode, setMouseMode] = useState(false);
  const [difficulty, setDifficulty] = useState(1);
  const isConnectedRef = useRef(isConnected);

  // Expose these for React to read
  const [realTimeFreq, setRealTimeFreq] = useState(0);
  const [focusScore, setFocusScore] = useState(0);

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
    if (!canvas) return; // Wait for mount
    const ctx = canvas.getContext('2d');
    const waveCanvas = $('waveCanvas');
    const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

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
    let activeChannel = 'attention';
    let peakBands = [0, 0, 0, 0, 0]; 

    const channels = {
      attention: v => Math.max(0, Math.min(1, v / 100)),
      alpha: v => Math.max(0, Math.min(1, v / 10)),
      theta: v => Math.max(0, Math.min(1, v / 10)),
      beta:  v => Math.max(0, Math.min(1, v / 10)),
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
      
      ['delta','theta','alpha','beta','gamma'].forEach(id => {
         const bf = $(`bf-${id}`); if(bf) bf.style.width = '0%';
         const bv = $(`bv-${id}`); if(bv) bv.textContent = '0%';
      });
      const ae = $('bd-attn-val'); if(ae) ae.textContent = '0%';
      const af = $('bd-attn-fill'); if(af) af.style.strokeDashoffset = 201;
    }


    function startLiveStream() {
      eegMode = 'ws';
      const indicator = $('conn-indicator');
      if (indicator) indicator.className = 'w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_#22c55e]';
      const label = $('conn-label'); if (label) label.textContent = 'CONNECTED';
      if (fetchInterval) clearInterval(fetchInterval);
      fetchInterval = setInterval(() => {
        const res = resultRef.current;
        if (res && res.band_powers && res.band_powers.length >= 5) {
          const bp = res.band_powers;
          const sum = bp.reduce((a, b) => a + b, 0);
          const relAlpha = sum > 0 ? bp[2] / sum : 0;
          const relTheta = sum > 0 ? bp[1] / sum : 0;
          const relBeta  = sum > 0 ? bp[3] / sum : 0;
          let val = 0;
          if (activeChannel === 'alpha') val = relAlpha * 100;
          else if (activeChannel === 'theta') val = relTheta * 100;
          else if (activeChannel === 'beta') val = relBeta * 100;
          else if (typeof res.focus_score === 'number') val = res.focus_score;
          else val = (relBeta / (relTheta + relAlpha + 0.01)) * 50;
          rawSignal = val;
          eegSignal = Math.max(0, Math.min(1, channels[activeChannel] ? channels[activeChannel](rawSignal) : rawSignal / 100));
          updateEEGUI();
        }
      }, 60);
    }

    function updateEEGUI() {
      waveHistory.push(eegSignal);
      if (waveHistory.length > WAVE_LEN) waveHistory.shift();
      const fill = $('signal-fill');
      if (fill) { fill.style.width = (eegSignal * 100) + '%'; fill.className = 'signal-fill ' + (eegSignal > .65 ? 'high' : eegSignal < .3 ? 'low' : ''); }
      
      // Update React state explicitly for sidebar UI
      setRealTimeFreq(isNaN(rawSignal) ? 0 : rawSignal);
      setFocusScore(Math.round(eegSignal * 100));

      drawWave();
      updateBandPanel();
    }

    function updateBandPanel() {
      const res = resultRef.current;
      const bfIds = ['bf-delta','bf-theta','bf-alpha','bf-beta','bf-gamma'];
      const bvIds = ['bv-delta','bv-theta','bv-alpha','bv-beta','bv-gamma'];
      const pkIds = ['pk-delta','pk-theta','pk-alpha','pk-beta','pk-gamma'];
      let bands = [];
      if (res && res.band_powers && res.band_powers.length >= 5) {
        const bp = res.band_powers;
        const sum = bp.reduce((a, b) => a + b, 0);
        bands = bp.map(v => sum > 0 ? Math.round((v / sum) * 100) : 0);
      } else {
        bands = [
          Math.round(15 + eegSignal * 10),
          Math.round(20 - eegSignal * 10),
          Math.round(25 - eegSignal * 5),
          Math.round(eegSignal * 50),
          Math.round(5 + eegSignal * 10),
        ];
      }
      for (let i = 0; i < 5; i++) {
        const fill = $(bfIds[i]); if (fill) fill.style.width = bands[i] + '%';
        const val  = $(bvIds[i]); if (val)  val.textContent = bands[i] + '%';
        if (bands[i] > peakBands[i]) {
          peakBands[i] = bands[i];
          const pk = $(pkIds[i]); if (pk) pk.textContent = peakBands[i] + '%';
        }
      }
      const relTheta = (bands[1] || 0) / 100;
      const relAlpha = (bands[2] || 0) / 100;
      const relBeta  = (bands[3] || 0) / 100;
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
      if (c.length === 3) c = [c[0],c[0],c[1],c[1],c[2],c[2]];
      c = '0x' + c.join('');
      return 'rgba('+[(c>>16)&255,(c>>8)&255,c&255].join(',')+','+alpha+')';
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

    const SPECIAL_TYPES = ['normal','normal','normal','chain','score','bomb'];

    function spawnBubble() {
      const cols = getBubbleColors();
      const col = cols[Math.floor(Math.random() * cols.length)];
      const type = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
      
      let diff = 1;
      try { const df = container.querySelector('#game-difficulty'); if (df) diff = parseInt(df.dataset.val) || 1; } catch (e) {}

      const radius = 18 + Math.random() * 22 + (type === 'bomb' ? 10 : 0);
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
        particles.push({ x, y, vx: Math.cos(angle)*speed, vy: Math.sin(angle)*speed,
          r: 2 + Math.random() * 3, life: 1, decay: 0.025 + Math.random() * 0.03, color: col.stroke });
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
      let isManualMode = false;
      try {
           const btn = container.querySelector('#mode-indicator-switch');
           if (btn && btn.textContent.includes('MANUAL')) isManualMode = true; 
      } catch (e) {}

      const base = isManualMode ? 48 : 30, extra = isManualMode ? 60 : 100;
      const r = base + eegSignal * extra;
      const cur = $('cursor');
      if (cur) {
        const s = Math.round(r * 2 + 20);
        cur.setAttribute('width', s); cur.setAttribute('height', s);
        cur.style.marginLeft = (-s/2) + 'px'; cur.style.marginTop = (-s/2) + 'px';
        const aura = $('cursorAura');
        if (aura) { aura.setAttribute('cx',s/2); aura.setAttribute('cy',s/2); aura.setAttribute('r',s/2-4); aura.setAttribute('opacity', 0.3 + eegSignal * 0.55); }
        $$('#cursor circle').forEach((c,i) => { if(i>0) { c.setAttribute('cx',s/2); c.setAttribute('cy',s/2); } });
      }
      return r;
    }

    function checkPops() {
      const curR = getCursorRadius();
      let poppedThisFrame = [];
      bubbles.forEach(b => {
        if (!b.alive) return;
        const dx = b.x - mouseX, dy = b.y - mouseY;
        if (Math.sqrt(dx*dx+dy*dy) < curR + b.r) { b.alive = false; poppedThisFrame.push(b); }
      });
      if (poppedThisFrame.length > 0) {
        combo++; maxCombo = Math.max(maxCombo, combo);
        poppedThisFrame.forEach(b => {
          bubblesPopped++;
          const pts = b.type === 'score' ? 50 : b.type === 'chain' ? 20 : 10;
          const total = pts + Math.floor(combo/3) * 5;
          score += total;
          spawnParticles(b.x, b.y, b.col, b.type === 'bomb' ? 28 : 14);
          spawnFloatText(b.x, b.y - b.r, `+${total}` + (combo >= 3 ? ` ×${combo}` : ''), b.col.glow);
          if (b.type === 'bomb') {
            bubbles.forEach(o => {
              if (!o.alive) return;
              const dx2 = o.x-b.x, dy2 = o.y-b.y;
              if (Math.sqrt(dx2*dx2+dy2*dy2) < 80) { o.alive = false; bubblesPopped++; score += 15; spawnParticles(o.x,o.y,o.col,8); }
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
      if (newLvl !== level) { level = newLvl; const lv = $('level-val'); if (lv) lv.textContent = String(level).padStart(2,'0'); }
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
      let diff = 1;
      try { const df = container.querySelector('#game-difficulty'); if (df) diff = parseInt(df.dataset.val) || 1; } catch (e) {}
      return Math.max(15, 80 - level * 5 - (diff - 1) * 20); 
    }

    let bgStars = [];
    function initStars() {
      bgStars = Array.from({length: 80}, () => ({ x: Math.random()*W, y: Math.random()*H, r: Math.random()*1.5, a: Math.random(), twinkle: Math.random()*Math.PI*2, ts: 0.02+Math.random()*0.03 }));
    }

    function drawBackground() {
      const t = themeRef.current?.colors || {};
      const bg = ctx.createLinearGradient(0,0,0,H);
      bg.addColorStop(0, t['--bg'] || '#010a14');
      bg.addColorStop(1, t['--surface'] || '#021220');
      ctx.fillStyle = bg; ctx.fillRect(0,0,W,H);
      bgStars.forEach(s => {
        s.twinkle += s.ts;
        ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
        ctx.fillStyle = hexToRgba(t['--primary'] || '#00f5ff', s.a*(0.4+0.4*Math.sin(s.twinkle)));
        ctx.fill();
      });
    }

    function drawBubbles() {
      bubbles.forEach(b => {
        b.wobble += b.wobbleSpeed; b.x += b.drift + Math.sin(b.wobble)*0.4; b.y -= b.speed;
        b.opacity = Math.min(1, b.opacity + 0.04);
        if (b.y < -b.r*2) { b.alive = false; if (b.type !== 'bomb') { bubblesMissed++; lives = Math.max(0,lives-1); buildLivesUI(); if (lives===0) endGame(); } return; }
        ctx.save(); ctx.globalAlpha = b.opacity;
        if (b.type === 'score') { ctx.shadowBlur = 30; ctx.shadowColor = b.col.glow; }
        else if (b.type === 'bomb') { ctx.shadowBlur = 25; ctx.shadowColor = '#ff3d9a'; }
        const grad = ctx.createRadialGradient(b.x-b.r*.3,b.y-b.r*.3,1,b.x,b.y,b.r);
        grad.addColorStop(0,'rgba(255,255,255,.15)'); grad.addColorStop(0.5,b.col.fill); grad.addColorStop(1,'rgba(0,0,0,.05)');
        ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
        ctx.strokeStyle=b.col.stroke; ctx.lineWidth=1.5; ctx.shadowBlur=14; ctx.shadowColor=b.col.glow; ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x-b.r*.28,b.y-b.r*.3,b.r*.22,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.35)'; ctx.shadowBlur=0; ctx.fill();
        ctx.shadowBlur=0; ctx.fillStyle=b.col.stroke; ctx.font=`bold ${b.r*.7}px monospace`; ctx.textAlign='center'; ctx.textBaseline='middle';
        if (b.type==='score') ctx.fillText('★',b.x,b.y);
        else if (b.type==='bomb') { ctx.fillStyle='#ff3d9a'; ctx.fillText('⚡',b.x,b.y); }
        else if (b.type==='chain') ctx.fillText('◈',b.x,b.y);
        ctx.restore();
      });
    }

    function drawParticles() {
      particles.forEach(p => { p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.life-=p.decay; if(p.life<=0) return; ctx.save(); ctx.globalAlpha=p.life; ctx.beginPath(); ctx.arc(p.x,p.y,p.r*p.life,0,Math.PI*2); ctx.fillStyle=p.color; ctx.shadowBlur=8; ctx.shadowColor=p.color; ctx.fill(); ctx.restore(); });
      particles = particles.filter(p => p.life > 0);
    }

    function drawCursorGlow() {
      const r = getCursorRadius();
      const prim = themeRef.current?.colors?.['--primary'] || '#00f5ff';
      const alpha = 0.04 + eegSignal * 0.09;
      const grad = ctx.createRadialGradient(mouseX,mouseY,0,mouseX,mouseY,r);
      grad.addColorStop(0, hexToRgba(prim, alpha*2)); grad.addColorStop(0.5, hexToRgba(prim, alpha)); grad.addColorStop(1, hexToRgba(prim, 0));
      ctx.beginPath(); ctx.arc(mouseX,mouseY,r,0,Math.PI*2); ctx.fillStyle=grad; ctx.fill();
    }

    function loop() {
      if (!gameRunning) return;
      animId = requestAnimationFrame(loop);
      drawBackground(); drawCursorGlow();
      spawnTimer++;
      if (spawnTimer >= spawnRate()) { spawnBubble(); spawnTimer = 0; }
      if (level > 3 && spawnTimer === Math.floor(spawnRate()/2)) spawnBubble();
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
            <span class="text-[9px] text-[var(--teal)] opacity-60 tracking-wider">#${i+1}</span>
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
      peakBands = [0,0,0,0,0];
      score = 0; level = 1; lives = 3; combo = 0; maxCombo = 0;
      bubblesPopped = 0; bubblesMissed = 0; bubbles = []; particles = []; waveHistory = [];
      spawnTimer = 0; sessionStart = Date.now();
      const sc = $('score-val'); if(sc) sc.textContent = '0';
      const lv = $('level-val'); if(lv) lv.textContent = '01';
      const cd = $('combo-display'); if(cd) cd.textContent = '';
      ['pk-delta','pk-theta','pk-alpha','pk-beta','pk-gamma'].forEach(id => { const el = $(id); if(el) el.textContent = '0%'; });
      buildLivesUI();
      
      const go = $('gameOverScreen');
      if (go) go.classList.add('hidden');
      
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
      const goScreen = $('gameOverScreen');
      if (goScreen) goScreen.classList.remove('hidden');
      
      let isManualMode = false;
      try {
           const btn = container.querySelector('#mode-indicator-switch');
           if (btn && btn.textContent.includes('MANUAL')) isManualMode = true; 
      } catch (e) {}

      saveSession({ score, level, accuracy: acc, time: elapsed, mode: isManualMode ? 'MANUAL' : 'SENSOR' });
      renderSessionHistory();
    }

    $$('.ch-tag').forEach(tag => {
      tag.onclick = (e) => {
        $$('.ch-tag').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        activeChannel = e.target.dataset.ch;
      };
    });

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
      <div id="game-difficulty" data-val={difficulty} className="hidden"></div>
      {/* ── GAME CANVAS MAIN AREA ── */}
      <div className={`flex-grow flex flex-col items-center justify-center relative transition-all duration-300 ${showSidebar ? 'ml-80' : 'ml-[4.25rem]'}`}>
         <div className="absolute inset-0 bubble-canvas-wrap" ref={canvasWrapRef}>
            <canvas id="gameCanvas"></canvas>

            {/* Custom Cursor Aura */}
            <svg id="cursor" className="absolute pointer-events-none z-[100] transition-[width,height] duration-75" width="60" height="60" viewBox="0 0 60 60">
                <defs>
                    <radialGradient id="cg" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="#00f5ff" stopOpacity=".9"/>
                        <stop offset="60%" stopColor="#00f5ff" stopOpacity=".15"/>
                        <stop offset="100%" stopColor="#00f5ff" stopOpacity="0"/>
                    </radialGradient>
                </defs>
                <circle id="cursorAura" cx="30" cy="30" r="26" fill="url(#cg)" opacity=".8"/>
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
                 <span className="font-display text-[9px] tracking-[3px] text-[var(--primary)] opacity-90 uppercase">Frontal EEG Signal</span>
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
                 {['attention', 'alpha', 'theta', 'beta'].map(ch => (
                     <span key={ch} className={`ch-tag text-[9px] tracking-widest px-2 py-1 border border-[var(--primary)]/20 rounded cursor-pointer transition-colors select-none ${ch === 'attention' ? 'active bg-[var(--primary)]/15 border-[var(--primary)] text-white' : 'hover:bg-[var(--primary)]/5'}`} data-ch={ch}>
                        {ch === 'attention' ? 'ATTN' : ch.toUpperCase()}
                     </span>
                 ))}
               </div>
            </div>

            {/* Game Over Screen */}
            <div id="gameOverScreen" className="hidden absolute inset-0 z-[200] flex flex-col items-center justify-center bg-[var(--bg)]/90 backdrop-blur-xl pointer-events-auto">
               <h1 className="font-display text-5xl md:text-6xl font-black tracking-widest text-white drop-shadow-[0_0_30px_var(--primary)] mb-8 text-center leading-tight">SESSION<br/>ENDED</h1>
               <div id="stat-grid" className="grid grid-cols-3 gap-3 mb-8 w-[min(460px,94%)]"></div>
               <button onClick={() => containerRef.current?.startGameHandler()} className="font-display text-xs tracking-widest px-10 py-3 rounded-full border border-[var(--primary)] bg-[var(--primary)]/10 text-white hover:bg-[var(--primary)]/20 shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)] transition-all">
                  NEW SESSION
               </button>
            </div>
         </div>
      </div>

      {/* ── LEFT SIDEBAR (SSVEP STYLE) ── */}
      <div 
         className={`absolute left-0 top-0 bottom-0 z-10 transition-all duration-300 ease-in-out border-r border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-md flex flex-col h-full pointer-events-auto select-none ${showSidebar ? 'w-80 overflow-y-auto overflow-x-hidden' : 'w-[4.25rem] overflow-visible'} [&::-webkit-scrollbar]:hidden `}
      >
         
         {/* Collapsed Sidebar */}
         {!showSidebar && (
            <div className="flex flex-col items-center justify-start py-3 w-full animate-fade-in shrink-0 h-full overflow-visible gap-2">
               <button onClick={onBackToMenu} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative" title="Back to Menu">
                  <ChevronLeft size={26} className="text-[var(--text)]" />
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold text-[var(--primary)] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Back to Menu</div>
               </button>
               
               <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />

               <button onClick={() => setShowSidebar(true)} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative" title="Expand Bar">
                  <Menu size={24} className="text-[var(--primary)]" />
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-1.5 rounded-lg text-xs font-bold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Expand Sidebar</div>
               </button>

               <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />

               <button 
                  onClick={() => {
                     setMouseMode(!mouseMode);
                     const btn = document.getElementById('mode-indicator-switch');
                     if(btn) btn.textContent = mouseMode ? '⚡ SENSOR' : '🖱 MANUAL';
                  }} 
                  className={`p-2.5 rounded-full transition-colors group relative ${mouseMode ? 'text-amber-500 bg-amber-500/10' : 'text-[var(--primary)] bg-[var(--primary)]/10'}`} title="Mode Select"
               >
                  {mouseMode ? <Mouse size={24} /> : <Zap size={24} />}
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 shadow-glow">
                     Mode: {mouseMode ? 'MANUAL' : 'SENSOR'}
                  </div>
               </button>

               <div className="w-full h-px bg-[var(--border)]/80 shrink-0 my-1" />

               <div className="flex flex-col items-center group relative cursor-default w-full py-2">
                  <Activity size={24} className="text-[var(--primary)] mb-1" />
                  <span className="text-sm font-black text-[var(--primary)]">{realTimeFreq}</span>
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">Score/Signal Power</div>
               </div>

               <button onClick={() => setShowSidebar(true)} className="hover:bg-white/10 p-2.5 rounded-full transition-colors group relative mt-auto">
                  <History size={24} className="text-[var(--muted)]" />
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">SESSION LOG</div>
               </button>
               
               <button onClick={() => globalRunning ? containerRef.current?.stopGameHandler() : containerRef.current?.startGameHandler()} className={`p-3 rounded-full group relative transition-all shadow-md ${globalRunning ? 'text-red-500 bg-red-500/10 hover:bg-red-500/20' : 'text-green-500 bg-green-500/10 hover:bg-green-500/20'}`} style={{marginBottom: '20px'}}>
                  {globalRunning ? <Square size={26} /> : <Play size={26} />}
                  <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[var(--surface)] px-3 py-1.5 rounded-lg text-xs font-bold text-white opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg">
                     {globalRunning ? 'End Session' : 'Start Session'}
                  </div>
               </button>
            </div>
         )}
         
         {/* Expanded Sidebar */}
         <div className={`flex-grow flex flex-col p-4 gap-4 font-mono transition-opacity duration-300 w-80 shrink-0 ${!showSidebar ? 'opacity-0 h-0 hidden' : 'opacity-100'}`}>

             {/* Header */}
             <div className="flex items-center justify-between shrink-0 mb-1">
                 <div>
                     <h2 className="text-[22px] font-bold text-[var(--text)] mb-1 flex items-center gap-3 tracking-[2px]">
                         <Gamepad2 size={26} className="text-[var(--primary)]" />
                         BUBBLE GAME
                     </h2>
                 </div>
                 <div className="flex gap-2">
                     <button onClick={onBackToMenu} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                         <ChevronLeft size={22} className="text-[var(--text)]" />
                     </button>
                     <button onClick={() => setShowSidebar(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                         <ChevronLeft size={22} className="rotate-180 text-[var(--text)]" />
                     </button>
                 </div>
             </div>

             {/* Global Play/Stop */}
             <div className="shrink-0 mb-1">
                 <button onClick={() => globalRunning ? containerRef.current?.stopGameHandler() : containerRef.current?.startGameHandler()} className={`w-full py-3.5 rounded-xl text-sm font-black uppercase tracking-[3px] transition-all flex items-center justify-center gap-3 border-2 shadow-lg ${globalRunning ? 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20' : 'bg-green-500/10 border-green-500/40 text-green-500 hover:bg-green-500/20'}`}>
                     {globalRunning ? <><Square size={20} /> END SESSION</> : <><Play size={20} /> NEW SESSION</>}
                 </button>
             </div>

             {/* Game Mode */}
             <div className="bg-[var(--bg)]/50 border border-[var(--primary)]/20 rounded-xl p-3 shrink-0 flex flex-col gap-3">
                 <h4 className="text-[10px] font-bold text-[var(--muted)]/80 uppercase tracking-widest flex items-center gap-2">
                    <Settings size={14} /> Control Mode
                 </h4>
                 
                 <div className="flex gap-2 w-full p-1 bg-[var(--surface)] rounded-lg border border-[var(--border)]">
                    <button 
                       id="mode-indicator-switch"
                       onClick={() => { setMouseMode(false); }} 
                       className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${!mouseMode ? 'bg-[var(--primary)]/20 text-[var(--primary)] shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]' : 'text-[var(--muted)] hover:bg-white/5'}`}>
                       <Zap size={14} /> SENSOR
                    </button>
                    <button 
                       onClick={() => { setMouseMode(true); }} 
                       className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${mouseMode ? 'bg-amber-500/20 text-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-[var(--muted)] hover:bg-white/5'}`}>
                       <Mouse size={14} /> MANUAL
                    </button>
                 </div>

                 <h4 className="text-[10px] font-bold text-[var(--muted)]/80 uppercase tracking-widest flex items-center gap-2 mt-3">
                    <Activity size={14} /> Difficulty Level
                 </h4>
                 
                 <div className="flex gap-2 w-full p-1 bg-[var(--surface)] rounded-lg border border-[var(--border)] mb-1">
                    {[1, 2, 3].map(lvl => (
                      <button 
                         key={lvl}
                         onClick={() => setDifficulty(lvl)}
                         className={`flex-1 py-1.5 rounded-md text-[11px] font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-2 ${difficulty === lvl ? 'bg-[var(--primary)]/20 text-[var(--primary)] shadow-[0_0_8px_rgba(var(--primary-rgb),0.3)]' : 'text-[var(--muted)] hover:bg-white/5'}`}>
                         LVL {lvl}
                      </button>
                    ))}
                 </div>
                 
                 <p className="text-[10px] text-[var(--muted)] leading-relaxed italic opacity-80">
                   {mouseMode ? "Use mouse movement. Game dynamically scales based on cursor proximity." : "Focus level scales up cursor aura to pop bubbles entirely with your mind."}
                 </p>
             </div>

             {/* Live Band Analysis */}
             <div className="bg-[var(--bg)]/60 border border-[var(--primary)]/30 rounded-xl p-3 shrink-0 backdrop-blur-md pb-4 pt-4">
                  <h4 className="text-[10px] font-bold text-[var(--primary)]/80 uppercase tracking-[2px] mb-4 flex justify-between items-center">
                     <span>EEG Bands (Live · Peak)</span>
                     <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse shadow-glow"></span>
                  </h4>

                  <div className="flex flex-col gap-2">
                     {[
                        { id: 'delta', label: 'δ DELTA',  color: '#4466ff' },
                        { id: 'theta', label: 'θ THETA',  color: 'var(--glow-violet)' },
                        { id: 'alpha', label: 'α ALPHA',  color: 'var(--glow-green)' },
                        { id: 'beta',  label: 'β BETA',   color: 'var(--primary)'  },
                        { id: 'gamma', label: 'γ GAMMA',  color: 'var(--glow-amber)' },
                     ].map(b => (
                        <div key={b.id} className="flex items-center gap-2">
                           <span className="text-[10px] tracking-widest font-bold opacity-60 w-[48px] shrink-0" style={{color: b.color}}>{b.label}</span>
                           <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div id={`bf-${b.id}`} className="h-full rounded-full transition-all duration-150 shadow-md" style={{background: b.color, width: '0%'}}></div>
                           </div>
                           <span id={`bv-${b.id}`} className="text-[10px] w-8 text-right font-black" style={{color: b.color}}>0%</span>
                           <span id={`pk-${b.id}`} className="text-[9px] w-6 text-right font-black text-amber-500/80">0%</span>
                        </div>
                     ))}
                  </div>

                  <div className="h-px w-full bg-white/5 my-4"></div>

                  <div className="relative w-[100px] h-[100px] mx-auto">
                     <svg viewBox="0 0 80 80" className="w-full h-full -rotate-90">
                        <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8"/>
                        <circle id="bd-attn-fill" cx="40" cy="40" r="32" fill="none" stroke="var(--primary)" strokeWidth="8"
                           strokeLinecap="round" strokeDasharray="201" strokeDashoffset="201"
                           style={{transition: 'stroke-dashoffset 0.3s ease-out', filter: 'drop-shadow(0 0 4px var(--primary))'}}/>
                     </svg>
                     <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span id="bd-attn-val" className="font-display font-black text-2xl text-white drop-shadow-md">0%</span>
                        <span className="text-[8px] font-bold tracking-widest text-[var(--primary)] uppercase mt-0.5 opacity-80">FOCUS</span>
                     </div>
                  </div>
             </div>

             {/* Session History Container */}
             <div className="flex flex-col h-[250px] shrink-0 border border-[var(--border)] rounded-xl bg-[var(--bg)]/40 p-3 pt-3">
                 <h4 className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-[3px] mb-3 flex items-center justify-between border-b border-[var(--border)]/50 pb-2">
                     <div className="flex items-center gap-2">
                         <History size={14} /> History
                     </div>
                     <button onClick={() => containerRef.current?.clearHistoryHandler()} className="text-[var(--text-error)] opacity-70 hover:opacity-100 transition-opacity" title="Clear History">
                         <Trash2 size={12} />
                     </button>
                 </h4>
                 <div id="session-history" className="flex-grow overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-[var(--primary)]/20 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-[var(--primary)]/40 flex flex-col gap-2">
                    {/* populated by javascript */}
                 </div>
             </div>

         </div>
      </div>
    </div>
  );
};

export default BubbleGameView;
