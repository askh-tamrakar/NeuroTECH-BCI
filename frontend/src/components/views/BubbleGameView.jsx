import React, { useEffect, useRef } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import '../../styles/views/BubbleGameView.css';

const BubbleGameView = ({ result, isConnected }) => {
  const containerRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const resultRef = useRef(null);
  const { currentTheme } = useTheme();
  const themeRef = useRef(currentTheme);

  useEffect(() => { themeRef.current = currentTheme; }, [currentTheme]);
  useEffect(() => { resultRef.current = result; }, [result]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const $ = (id) => container.querySelector(`#${id}`);
    const $$ = (sel) => container.querySelectorAll(sel);

    const canvas = $('gameCanvas');
    const ctx = canvas.getContext('2d');
    const waveCanvas = $('waveCanvas');
    const waveCtx = waveCanvas.getContext('2d');

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
    let mouseMode = false;
    let animId = null;
    let bubblesPopped = 0, bubblesMissed = 0;
    let sessionStart = 0;
    let activeChannel = 'attention';
    let peakBands = [0, 0, 0, 0, 0]; // Delta, Theta, Alpha, Beta, Gamma peaks

    const channels = {
      attention: v => Math.max(0, Math.min(1, v / 100)),
      alpha: v => Math.max(0, Math.min(1, v / 10)),
      theta: v => Math.max(0, Math.min(1, v / 10)),
      beta:  v => Math.max(0, Math.min(1, v / 10)),
    };

    // ── RESIZE ──────────────────────────────────
    function resize() {
      const wrap = canvasWrapRef.current || canvas.parentElement;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      W = canvas.width = rect.width;
      H = canvas.height = rect.height;
      if (waveCanvas) waveCanvas.width = waveCanvas.offsetWidth;
    }
    window.addEventListener('resize', resize);
    resize();

    // ── MOUSE ────────────────────────────────────
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

    // ── SIMULATION ───────────────────────────────
    let simPhase = 0, simTrend = 0;
    function startSimulation() {
      eegMode = 'simulate';
      setConnStatus('simulating', 'SIMULATE');
      if (simInterval) clearInterval(simInterval);
      if (fetchInterval) clearInterval(fetchInterval);
      simInterval = setInterval(() => {
        simPhase += 0.07;
        simTrend += (Math.random() - 0.48) * 0.04;
        simTrend = Math.max(-0.3, Math.min(0.3, simTrend));
        const base = 0.5 + simTrend;
        const noise = Math.sin(simPhase * 1.3) * 0.15 + Math.sin(simPhase * 3.7) * 0.07
                    + Math.sin(simPhase * 7.1) * 0.04 + (Math.random() - 0.5) * 0.1;
        eegSignal = Math.max(0, Math.min(1, base + noise));
        rawSignal = +(eegSignal * 100).toFixed(1);
        updateEEGUI();
      }, 60);
    }

    function startLiveStream() {
      eegMode = 'ws';
      setConnStatus('connected', 'LIVE STREAM');
      if (simInterval) clearInterval(simInterval);
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

    function setConnStatus(state, label) {
      const dot = $('conn-dot'); if (dot) dot.className = 'dot ' + state;
      const lbl = $('conn-label'); if (lbl) lbl.textContent = label;
    }

    function updateEEGUI() {
      waveHistory.push(eegSignal);
      if (waveHistory.length > WAVE_LEN) waveHistory.shift();
      const fill = $('signal-fill');
      if (fill) { fill.style.width = (eegSignal * 100) + '%'; fill.className = 'signal-fill' + (eegSignal > .65 ? ' high' : eegSignal < .3 ? ' low' : ''); }
      const sigVal = $('signal-val'); if (sigVal) sigVal.textContent = isNaN(rawSignal) ? '0.00' : rawSignal.toFixed(2);
      const focVal = $('focus-val'); if (focVal) focVal.textContent = Math.round(eegSignal * 100) + '%';
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
      waveCtx.shadowColor = '#00f5ff'; waveCtx.shadowBlur = 8;
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
      grad.addColorStop(0, 'rgba(0,245,255,.18)'); grad.addColorStop(1, 'rgba(0,245,255,0)');
      waveCtx.fillStyle = grad; waveCtx.fill();
    }

    // ── BUBBLE COLORS ────────────────────────────
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
      const radius = 18 + Math.random() * 22 + (type === 'bomb' ? 10 : 0);
      bubbles.push({
        x: radius + Math.random() * (W - radius * 2), y: H + radius, r: radius,
        speed: 0.6 + Math.random() * 0.8 + level * 0.12,
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
      el.className = 'pop-text';
      el.style.cssText = `left:${x}px;top:${y}px;color:${color};text-shadow:0 0 12px ${color}`;
      el.textContent = text;
      const wrap = canvasWrapRef.current;
      if (wrap) { wrap.appendChild(el); setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 900); }
    }

    function getCursorRadius() {
      const base = mouseMode ? 48 : 30, extra = mouseMode ? 60 : 100;
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
      for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'life-dot' + (i >= lives ? ' dead' : ''); el.appendChild(d); }
    }

    let spawnTimer = 0;
    function spawnRate() { return Math.max(30, 80 - level * 5); }

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
      if (sessions.length === 0) { container2.innerHTML = '<div class="no-sessions">No sessions yet</div>'; return; }
      container2.innerHTML = sessions.map((s, i) => `
        <div class="session-entry">
          <div class="se-top"><span class="se-num">#${i+1}</span><span class="se-score">${s.score.toLocaleString()}</span></div>
          <div class="se-bottom">
            <span>Lvl ${s.level}</span>
            <span>${s.accuracy}%</span>
            <span>${s.time}s</span>
            <span class="se-mode">${s.mode}</span>
          </div>
        </div>
      `).join('');
    }

    // ── GAME CONTROL ──────────────────────────────
    container.startGameHandler = (mMode = false) => {
      mouseMode = mMode; peakBands = [0,0,0,0,0];
      score = 0; level = 1; lives = 3; combo = 0; maxCombo = 0;
      bubblesPopped = 0; bubblesMissed = 0; bubbles = []; particles = []; waveHistory = [];
      spawnTimer = 0; sessionStart = Date.now();
      const sc = $('score-val'); if(sc) sc.textContent = '0';
      const lv = $('level-val'); if(lv) lv.textContent = '01';
      const cd = $('combo-display'); if(cd) cd.textContent = '';
      ['pk-delta','pk-theta','pk-alpha','pk-beta','pk-gamma'].forEach(id => { const el = $(id); if(el) el.textContent = '0%'; });
      buildLivesUI();
      $('startScreen').classList.add('hidden');
      $('gameOverScreen').classList.add('hidden');
      initStars(); gameRunning = true;
      if (!simInterval && !fetchInterval) startSimulation();
      loop();
      // Update mode indicator
      const mi = $('mode-indicator');
      if (mi) mi.textContent = mMode ? 'MANUAL' : 'SENSOR';
      const mb = $('mode-badge');
      if (mb) mb.className = 'mode-badge ' + (mMode ? 'mode-manual' : 'mode-sensor');
    };

    container.switchModeHandler = () => {
      if (gameRunning) {
        // Switch in-game
        mouseMode = !mouseMode;
        const mi = $('mode-indicator'); if (mi) mi.textContent = mouseMode ? 'MANUAL' : 'SENSOR';
        const mb = $('mode-badge'); if (mb) mb.className = 'mode-badge ' + (mouseMode ? 'mode-manual' : 'mode-sensor');
      }
    };

    function endGame() {
      gameRunning = false;
      if (animId) cancelAnimationFrame(animId);
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const acc = bubblesPopped + bubblesMissed > 0 ? Math.round(bubblesPopped / (bubblesPopped + bubblesMissed) * 100) : 0;
      const sg = $('stat-grid');
      if (sg) sg.innerHTML = `
        <div class="stat-cell"><div class="s-label">SCORE</div><div class="s-val">${score.toLocaleString()}</div></div>
        <div class="stat-cell"><div class="s-label">LEVEL</div><div class="s-val">${level}</div></div>
        <div class="stat-cell"><div class="s-label">MAX COMBO</div><div class="s-val">${maxCombo}</div></div>
        <div class="stat-cell"><div class="s-label">POPPED</div><div class="s-val">${bubblesPopped}</div></div>
        <div class="stat-cell"><div class="s-label">ACCURACY</div><div class="s-val">${acc}%</div></div>
        <div class="stat-cell"><div class="s-label">TIME</div><div class="s-val">${elapsed}s</div></div>
      `;
      $('gameOverScreen').classList.remove('hidden');
      saveSession({ score, level, accuracy: acc, time: elapsed, mode: mouseMode ? 'MANUAL' : 'SENSOR' });
      renderSessionHistory();
    }

    const connBtn = $('conn-btn');
    if (connBtn) { connBtn.onclick = () => { if (eegMode === 'simulate') startLiveStream(); else startSimulation(); }; }

    $$('.ch-tag').forEach(tag => {
      tag.onclick = (e) => {
        $$('.ch-tag').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        activeChannel = e.target.dataset.ch;
      };
    });

    startSimulation(); initStars(); renderSessionHistory();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', mouseMoveHandler);
      if (simInterval) clearInterval(simInterval);
      if (fetchInterval) clearInterval(fetchInterval);
      if (animId) cancelAnimationFrame(animId);
      gameRunning = false;
    };
  }, []);

  return (
    <div className="bubble-layout" ref={containerRef}>

      {/* ── GAME CANVAS AREA ── */}
      <div className="bubble-canvas-wrap" ref={canvasWrapRef}>
        <canvas id="gameCanvas"></canvas>

        {/* Custom cursor */}
        <svg id="cursor" width="60" height="60" viewBox="0 0 60 60">
          <defs>
            <radialGradient id="cg" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#00f5ff" stopOpacity=".9"/>
              <stop offset="60%" stopColor="#00f5ff" stopOpacity=".15"/>
              <stop offset="100%" stopColor="#00f5ff" stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle id="cursorAura" cx="30" cy="30" r="26" fill="url(#cg)" opacity=".6"/>
          <circle cx="30" cy="30" r="4" fill="#fff" opacity=".9"/>
          <circle cx="30" cy="30" r="2" fill="#00f5ff"/>
        </svg>

        {/* HUDs over canvas */}
        <div className="hud" id="hud-score">
          <div className="label">SCORE</div>
          <div className="value" id="score-val">0</div>
        </div>
        <div className="hud" id="hud-level">
          <div className="label">LEVEL</div>
          <div className="value" id="level-val">01</div>
          <div id="combo-display"></div>
        </div>
        <div className="hud" id="hud-lives"></div>

        {/* Bottom EEG panel */}
        <div className="hud" id="hud-eeg">
          <div className="eeg-panel">
            <div className="eeg-header">
              <span className="eeg-title">EEG · FRONTAL SIGNAL</span>
              <div className="connection-indicator" id="conn-btn">
                <div className="dot simulating" id="conn-dot"></div>
                <span id="conn-label">SIMULATE</span>
              </div>
            </div>
            <canvas id="waveCanvas" width="560" height="44"></canvas>
            <div className="signal-track"><div className="signal-fill" id="signal-fill"></div></div>
            <div className="signal-meta">
              <span>ACTIVITY MAP</span>
              <span>SIGNAL <span className="signal-value" id="signal-val">0.00</span></span>
              <span>FOCUS <span className="signal-value" id="focus-val">0%</span></span>
            </div>
            <div className="channel-row" style={{marginTop:'10px'}}>
              <span className="ch-tag active" data-ch="attention">ATTN</span>
              <span className="ch-tag" data-ch="alpha">ALPHA</span>
              <span className="ch-tag" data-ch="theta">THETA</span>
              <span className="ch-tag" data-ch="beta">BETA</span>
            </div>
          </div>
        </div>

        {/* Overlays */}
        <div className="overlay" id="startScreen">
          <div className="overlay-title">NEURO<br/>BUBBLE</div>
          <div className="overlay-sub">FOCUS YOUR FRONTAL CORTEX · POP THE BUBBLES</div>
          <div style={{fontSize:'11px',color:'var(--glow-teal)',opacity:'.7',marginBottom:'28px',maxWidth:'360px',textAlign:'center',lineHeight:'1.8'}}>
            HIGH FOCUS → larger cursor aura → pop more bubbles at once.
          </div>
          <button className="big-btn" onClick={() => containerRef.current?.startGameHandler(false)}>SENSOR MODE</button>
          <button className="big-btn" onClick={() => containerRef.current?.startGameHandler(true)} style={{borderColor:'var(--glow-amber)',color:'var(--glow-amber)'}}>MANUAL (MOUSE) MODE</button>
        </div>

        <div className="overlay hidden" id="gameOverScreen">
          <div className="overlay-title">SESSION<br/>ENDED</div>
          <div className="stat-grid" id="stat-grid"></div>
          <button className="big-btn" onClick={() => containerRef.current?.startGameHandler(false)}>NEW SESSION</button>
        </div>
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <div className="bubble-sidebar">

        {/* Mode Panel */}
        <div className="sb-section">
          <div className="sb-title">GAME MODE</div>
          <div className="mode-badge mode-sensor" id="mode-badge">
            <span id="mode-indicator">SENSOR</span>
          </div>
          <div className="mode-buttons">
            <button className="sb-btn" onClick={() => containerRef.current?.startGameHandler(false)}>⚡ SENSOR</button>
            <button className="sb-btn sb-btn-alt" onClick={() => containerRef.current?.startGameHandler(true)}>🖱 MANUAL</button>
          </div>
          <button className="sb-btn sb-btn-switch" onClick={() => containerRef.current?.switchModeHandler()}>↔ SWITCH IN-GAME</button>
        </div>

        {/* Live Band Powers */}
        <div className="sb-section">
          <div className="sb-title">EEG BANDS  <span style={{fontSize:'8px',opacity:.5}}>(LIVE · PEAK)</span></div>
          {[
            { id: 'delta', label: 'δ DELTA',  cls: 'bf-delta' },
            { id: 'theta', label: 'θ THETA',  cls: 'bf-theta' },
            { id: 'alpha', label: 'α ALPHA',  cls: 'bf-alpha' },
            { id: 'beta',  label: 'β BETA',   cls: 'bf-beta'  },
            { id: 'gamma', label: 'γ GAMMA',  cls: 'bf-gamma' },
          ].map(b => (
            <div className="band-row" key={b.id}>
              <div className="band-label">{b.label}</div>
              <div className="band-track"><div className={`band-fill ${b.cls}`} id={`bf-${b.id}`}></div></div>
              <div className="band-val" id={`bv-${b.id}`}>0%</div>
              <div className="band-peak" id={`pk-${b.id}`}>0%</div>
            </div>
          ))}

          {/* Attention ring */}
          <div className="attn-ring-wrap">
            <svg viewBox="0 0 80 80" className="attn-svg">
              <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(0,245,255,0.1)" strokeWidth="7"/>
              <circle id="bd-attn-fill" cx="40" cy="40" r="32" fill="none" stroke="var(--glow-cyan)" strokeWidth="7"
                strokeLinecap="round" strokeDasharray="201" strokeDashoffset="201"
                style={{transform:'rotate(-90deg)',transformOrigin:'40px 40px',transition:'stroke-dashoffset 0.3s'}}/>
            </svg>
            <div className="attn-center">
              <div id="bd-attn-val" className="attn-val">0%</div>
              <div className="attn-label">FOCUS</div>
            </div>
          </div>
        </div>

        {/* Session History */}
        <div className="sb-section sb-section-grow">
          <div className="sb-title">SESSION HISTORY</div>
          <div id="session-history" className="session-history">
            <div className="no-sessions">No sessions yet</div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default BubbleGameView;
