import React, { useEffect, useRef, useState } from 'react';
import '../../styles/views/BubbleGameView.css';

const BubbleGameView = ({ result, isConnected }) => {
  const containerRef = useRef(null);
  const resultRef = useRef(null);

  // Update the latest result reference seamlessly
  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Helper to scope document lookups to this component
    const $ = (id) => container.querySelector(`#${id}`);
    const $$ = (sel) => container.querySelectorAll(sel);

    const canvas = $('gameCanvas');
    const ctx = canvas.getContext('2d');
    const waveCanvas = $('waveCanvas');
    const waveCtx = waveCanvas.getContext('2d');

    let W, H;
    let score = 0, level = 1, lives = 3, combo = 0, maxCombo = 0;
    let bubbles = [], particles = [], floatTexts = [];
    let mouseX = 0, mouseY = 0;
    let eegSignal = 0;       // 0–1 normalized
    let rawSignal = 0;       // raw µV or 0–100 attention
    let eegMode = 'simulate';
    let simInterval = null;
    let fetchInterval = null;
    let waveHistory = [];
    const WAVE_LEN = 140;
    let gameRunning = false;
    let mouseMode = false;
    let animId = null;
    let bubblesPopped = 0, bubblesMissed = 0;
    let sessionStart = 0;

    // EEG config
    let activeChannel = 'attention';
    const channels = {
      attention: v => Math.max(0, Math.min(1, v / 100)),
      alpha: v => Math.max(0, Math.min(1, v / 10)),
      theta: v => Math.max(0, Math.min(1, v / 10)),
      beta:  v => Math.max(0, Math.min(1, v / 10)),
    };

    function resize() {
      if (!container) return;
      const rect = container.getBoundingClientRect();
      W = canvas.width = rect.width;
      H = canvas.height = rect.height;
      if (waveCanvas) waveCanvas.width = waveCanvas.offsetWidth;
    }
    window.addEventListener('resize', resize);
    resize();

    const mouseMoveHandler = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
      const cur = $('cursor');
      if (cur) {
        cur.style.left = mouseX + 'px';
        cur.style.top = mouseY + 'px';
      }
    };
    window.addEventListener('mousemove', mouseMoveHandler);

    // ═══════════════════════════════════════════════════════
    //  EEG SIMULATION / LIVE DATA
    // ═══════════════════════════════════════════════════════
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
          // indices: 0:Delta, 1:Theta, 2:Alpha, 3:Beta, 4:Gamma
          const bp = res.band_powers;
          const sum = bp.reduce((a, b) => a + b, 0);
          const relAlpha = sum > 0 ? (bp[2] / sum) : 0;
          const relTheta = sum > 0 ? (bp[1] / sum) : 0;
          const relBeta = sum > 0 ? (bp[3] / sum) : 0;
          
          let val = 0;
          if (activeChannel === 'alpha') val = relAlpha * 100;
          else if (activeChannel === 'theta') val = relTheta * 100;
          else if (activeChannel === 'beta') val = relBeta * 100;
          else if (activeChannel === 'attention') {
            // Rough attention metric: Beta / (Theta + Alpha) scaled to 0-100
            val = ((relBeta) / (relTheta + relAlpha + 0.01)) * 50; 
          }
          
          rawSignal = val;
          eegSignal = channels[activeChannel] ? channels[activeChannel](rawSignal) : (rawSignal/100);
          eegSignal = Math.max(0, Math.min(1, eegSignal));
          updateEEGUI();
        } else {
          // No live data yet
        }
      }, 60);
    }

    function setConnStatus(state, label) {
      const dot = $('conn-dot');
      const lbl = $('conn-label');
      if (dot) dot.className = 'dot ' + state;
      if (lbl) lbl.textContent = label;
    }

    function updateEEGUI() {
      waveHistory.push(eegSignal);
      if (waveHistory.length > WAVE_LEN) waveHistory.shift();

      const fill = $('signal-fill');
      if (fill) {
        fill.style.width = (eegSignal * 100) + '%';
        fill.className = 'signal-fill' + (eegSignal > .65 ? ' high' : eegSignal < .3 ? ' low' : '');
      }
      const sigVal = $('signal-val');
      if (sigVal) sigVal.textContent = isNaN(rawSignal) ? "0.00" : rawSignal.toFixed(2);
      
      const focVal = $('focus-val');
      if (focVal) focVal.textContent = Math.round(eegSignal * 100) + '%';
      
      drawWave();
    }

    function drawWave() {
      if (!waveCanvas) return;
      const cw = waveCanvas.width, ch = waveCanvas.height;
      waveCtx.clearRect(0, 0, cw, ch);

      if (waveHistory.length < 2) return;
      const step = cw / (WAVE_LEN - 1);

      waveCtx.beginPath();
      waveCtx.strokeStyle = '#00f5ff';
      waveCtx.lineWidth = 1.5;
      waveCtx.shadowColor = '#00f5ff';
      waveCtx.shadowBlur = 8;

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
      grad.addColorStop(0, 'rgba(0,245,255,.18)');
      grad.addColorStop(1, 'rgba(0,245,255,0)');
      waveCtx.fillStyle = grad;
      waveCtx.fill();
    }

    // ═══════════════════════════════════════════════════════
    //  BUBBLES & PARTICLES
    // ═══════════════════════════════════════════════════════
    const BUBBLE_COLORS = [
      { stroke: '#00f5ff', fill: 'rgba(0,245,255,.12)', glow: '#00f5ff' },
      { stroke: '#00ff9d', fill: 'rgba(0,255,157,.12)', glow: '#00ff9d' },
      { stroke: '#7b2fff', fill: 'rgba(123,47,255,.15)', glow: '#9b6fff' },
      { stroke: '#ff3d9a', fill: 'rgba(255,61,154,.12)', glow: '#ff3d9a' },
      { stroke: '#ffb300', fill: 'rgba(255,179,0,.12)', glow: '#ffb300' },
    ];

    const SPECIAL_TYPES = ['normal','normal','normal','chain','score','bomb'];

    function spawnBubble() {
      const col = BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)];
      const type = SPECIAL_TYPES[Math.floor(Math.random() * SPECIAL_TYPES.length)];
      const radius = 18 + Math.random() * 22 + (type === 'bomb' ? 10 : 0);
      bubbles.push({
        x: radius + Math.random() * (W - radius * 2),
        y: H + radius,
        r: radius,
        speed: 0.6 + Math.random() * 0.8 + level * 0.12,
        drift: (Math.random() - 0.5) * 0.4,
        col, type,
        wobble: Math.random() * Math.PI * 2,
        wobbleSpeed: 0.03 + Math.random() * 0.02,
        opacity: 0,
        alive: true,
      });
    }

    function spawnParticles(x, y, col, count = 14) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
        const speed = 2 + Math.random() * 4;
        particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          r: 2 + Math.random() * 3,
          life: 1,
          decay: 0.025 + Math.random() * 0.03,
          color: col.stroke,
        });
      }
    }

    function spawnFloatText(x, y, text, color) {
      const el = document.createElement('div');
      el.className = 'pop-text';
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.color = color;
      el.style.textShadow = `0 0 12px ${color}`;
      el.textContent = text;
      container.appendChild(el);
      setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 900);
    }

    function getCursorRadius() {
      const base = mouseMode ? 48 : 30;
      const extra = mouseMode ? 60 : 100;
      const r = base + eegSignal * extra;
      const cur = $('cursor');
      if (cur) {
        const s = Math.round(r * 2 + 20);
        cur.setAttribute('width', s);
        cur.setAttribute('height', s);
        cur.style.marginLeft = (-s/2) + 'px';
        cur.style.marginTop  = (-s/2) + 'px';
        const aura = $('cursorAura');
        if (aura) {
          aura.setAttribute('cx', s/2);
          aura.setAttribute('cy', s/2);
          aura.setAttribute('r', s/2 - 4);
          aura.setAttribute('opacity', 0.3 + eegSignal * 0.55);
        }
        $$('#cursor circle').forEach((c,i) => {
          if(i>0) { c.setAttribute('cx',s/2); c.setAttribute('cy',s/2); }
        });
      }
      return r;
    }

    function checkPops() {
      const curR = getCursorRadius();
      let poppedThisFrame = [];

      bubbles.forEach(b => {
        if (!b.alive) return;
        const dx = b.x - mouseX;
        const dy = b.y - mouseY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < curR + b.r) {
          b.alive = false;
          poppedThisFrame.push(b);
        }
      });

      if (poppedThisFrame.length > 0) {
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        poppedThisFrame.forEach(b => {
          bubblesPopped++;
          const pts = b.type === 'score' ? 50 : b.type === 'chain' ? 20 : 10;
          const comboBonus = Math.floor(combo / 3);
          const total = pts + comboBonus * 5;
          score += total;
          spawnParticles(b.x, b.y, b.col, b.type === 'bomb' ? 28 : 14);
          spawnFloatText(b.x, b.y - b.r,
            `+${total}` + (combo >= 3 ? ` ×${combo}` : ''), b.col.glow);
          if (b.type === 'bomb') {
            bubbles.forEach(other => {
              if (!other.alive) return;
              const dx2 = other.x - b.x, dy2 = other.y - b.y;
              if (Math.sqrt(dx2*dx2+dy2*dy2) < 80) {
                other.alive = false; bubblesPopped++;
                score += 15; spawnParticles(other.x, other.y, other.col, 8);
              }
            });
          }
        });
        updateScoreUI();
        updateComboUI();
      } else {
        if (combo > 0) combo = 0;
      }
      bubbles = bubbles.filter(b => b.alive);
    }

    function updateScoreUI() {
      const sc = $('score-val');
      if (sc) sc.textContent = score.toLocaleString();
      const newLevel = 1 + Math.floor(score / 500);
      if (newLevel !== level) {
        level = newLevel;
        const lv = $('level-val');
        if (lv) lv.textContent = String(level).padStart(2,'0');
      }
    }
    
    function updateComboUI() {
      const el = $('combo-display');
      if (!el) return;
      if (combo >= 3) {
        el.textContent = `COMBO ×${combo}`;
      } else {
        el.textContent = '';
      }
    }

    function buildLivesUI() {
      const el = $('hud-lives');
      if (!el) return;
      el.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const d = document.createElement('div');
        d.className = 'life-dot' + (i >= lives ? ' dead' : '');
        el.appendChild(d);
      }
    }

    let spawnTimer = 0;
    function spawnRate() { return Math.max(30, 80 - level * 5); }

    let bgStars = [];
    function initStars() {
      bgStars = Array.from({length: 80}, () => ({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() * 1.5, a: Math.random(),
        twinkle: Math.random() * Math.PI * 2,
        ts: 0.02 + Math.random() * 0.03
      }));
    }

    function drawBackground() {
      ctx.clearRect(0, 0, W, H);
      bgStars.forEach(s => {
        s.twinkle += s.ts;
        const alpha = s.a * (0.4 + 0.4 * Math.sin(s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,245,255,${alpha})`;
        ctx.fill();
      });
    }

    function drawBubbles() {
      bubbles.forEach(b => {
        b.wobble += b.wobbleSpeed;
        b.x += b.drift + Math.sin(b.wobble) * 0.4;
        b.y -= b.speed;
        b.opacity = Math.min(1, b.opacity + 0.04);

        if (b.y < -b.r * 2) {
          b.alive = false;
          if (b.type !== 'bomb') {
            bubblesMissed++;
            lives = Math.max(0, lives - 1);
            buildLivesUI();
            if (lives === 0) endGame();
          }
          return;
        }

        ctx.save();
        ctx.globalAlpha = b.opacity;

        if (b.type === 'score') {
          ctx.shadowBlur = 30;
          ctx.shadowColor = b.col.glow;
        } else if (b.type === 'bomb') {
          ctx.shadowBlur = 25;
          ctx.shadowColor = '#ff3d9a';
        }

        const grad = ctx.createRadialGradient(b.x - b.r*.3, b.y - b.r*.3, 1, b.x, b.y, b.r);
        grad.addColorStop(0, 'rgba(255,255,255,.15)');
        grad.addColorStop(0.5, b.col.fill);
        grad.addColorStop(1, 'rgba(0,0,0,.05)');
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = b.col.stroke;
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 14;
        ctx.shadowColor = b.col.glow;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.x - b.r*.28, b.y - b.r*.3, b.r * .22, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.shadowBlur = 0;
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.fillStyle = b.col.stroke;
        ctx.font = `bold ${b.r * .7}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (b.type === 'score') ctx.fillText('★', b.x, b.y);
        else if (b.type === 'bomb') { ctx.fillStyle = '#ff3d9a'; ctx.fillText('⚡', b.x, b.y); }
        else if (b.type === 'chain') ctx.fillText('◈', b.x, b.y);

        ctx.restore();
      });
    }

    function drawParticles() {
      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08;
        p.life -= p.decay;
        if (p.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;
        ctx.fill();
        ctx.restore();
      });
      particles = particles.filter(p => p.life > 0);
    }

    function drawCursorGlow() {
      const r = getCursorRadius();
      const grad = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, r);
      const alpha = 0.04 + eegSignal * 0.09;
      grad.addColorStop(0, `rgba(0,245,255,${alpha * 2})`);
      grad.addColorStop(0.5, `rgba(0,245,255,${alpha})`);
      grad.addColorStop(1, 'rgba(0,245,255,0)');
      ctx.beginPath();
      ctx.arc(mouseX, mouseY, r, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    function loop() {
      if (!gameRunning) return;
      animId = requestAnimationFrame(loop);

      drawBackground();
      drawCursorGlow();

      spawnTimer++;
      if (spawnTimer >= spawnRate()) {
        spawnBubble();
        spawnTimer = 0;
      }

      if (level > 3 && spawnTimer === Math.floor(spawnRate() / 2)) spawnBubble();

      drawBubbles();
      drawParticles();
      checkPops();
    }

    // Exported Handlers for React Elements via direct attachments
    container.startGameHandler = (mMode = false) => {
      mouseMode = mMode;
      score = 0; level = 1; lives = 3; combo = 0; maxCombo = 0;
      bubblesPopped = 0; bubblesMissed = 0;
      bubbles = []; particles = []; waveHistory = [];
      spawnTimer = 0; sessionStart = Date.now();
      
      const sc = $('score-val'); if(sc) sc.textContent = '0';
      const lv = $('level-val'); if(lv) lv.textContent = '01';
      const cd = $('combo-display'); if(cd) cd.textContent = '';
      
      buildLivesUI();
      $('startScreen').classList.add('hidden');
      $('gameOverScreen').classList.add('hidden');
      
      initStars();
      gameRunning = true;
      if (simInterval || fetchInterval) {
         // keep whichever is running
      } else {
         startSimulation();
      }
      loop();
    };

    container.endGameHandler = () => {
      endGame();
    }
    
    function endGame() {
      gameRunning = false;
      if (animId) cancelAnimationFrame(animId);
      const elapsed = Math.round((Date.now() - sessionStart) / 1000);
      const acc = bubblesPopped + bubblesMissed > 0
        ? Math.round(bubblesPopped / (bubblesPopped + bubblesMissed) * 100) : 0;
      
      const sg = $('stat-grid');
      if (sg) {
        sg.innerHTML = `
          <div class="stat-cell"><div class="s-label">SCORE</div><div class="s-val">${score.toLocaleString()}</div></div>
          <div class="stat-cell"><div class="s-label">LEVEL</div><div class="s-val">${level}</div></div>
          <div class="stat-cell"><div class="s-label">MAX COMBO</div><div class="s-val">${maxCombo}</div></div>
          <div class="stat-cell"><div class="s-label">POPPED</div><div class="s-val">${bubblesPopped}</div></div>
          <div class="stat-cell"><div class="s-label">ACCURACY</div><div class="s-val">${acc}%</div></div>
          <div class="stat-cell"><div class="s-label">TIME</div><div class="s-val">${elapsed}s</div></div>
        `;
      }
      $('gameOverScreen').classList.remove('hidden');
    }

    // Channel Selection
    $$('.ch-tag').forEach(tag => {
      tag.onclick = (e) => {
        $$('.ch-tag').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        activeChannel = e.target.dataset.ch;
      };
    });

    // Toggle logic
    const connBtn = $('conn-btn');
    if (connBtn) {
      connBtn.onclick = () => {
        if (eegMode === 'simulate') {
          startLiveStream();
        } else {
          startSimulation();
        }
      }
    }

    // Auto-start simulation when mounting
    startSimulation();
    initStars();

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
    <div className="bubble-app-container" ref={containerRef}>
      {/* ── CANVASES ── */}
      <canvas id="gameCanvas"></canvas>

      {/* ── CUSTOM CURSOR ── */}
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

      {/* ── HUD ── */}
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

      {/* ── EEG PANEL ── */}
      <div className="hud" id="hud-eeg">
        <div className="eeg-panel">
          <div className="eeg-header">
            <span className="eeg-title">EEG · FRONTAL SIGNAL</span>
            <div className="connection-indicator" id="conn-btn" title="Click to bind live stream">
              <div className="dot simulating" id="conn-dot"></div>
              <span id="conn-label">SIMULATE</span>
            </div>
          </div>

          <canvas id="waveCanvas" width="560" height="44"></canvas>

          <div className="signal-track">
            <div className="signal-fill" id="signal-fill"></div>
          </div>

          <div className="signal-meta">
            <span>ACTIVITY MAP</span>
            <span>SIGNAL <span className="signal-value" id="signal-val">0.00</span></span>
            <span>FOCUS POWER <span className="signal-value" id="focus-val">0%</span></span>
          </div>

          <div className="channel-row" style={{marginTop: '12px'}}>
            <span className="ch-tag active" data-ch="attention">ATTENTION</span>
            <span className="ch-tag" data-ch="alpha">ALPHA</span>
            <span className="ch-tag" data-ch="theta">THETA</span>
            <span className="ch-tag" data-ch="beta">BETA</span>
          </div>
        </div>
      </div>

      {/* ── START SCREEN ── */}
      <div className="overlay" id="startScreen">
        <div className="overlay-title">NEURO<br/>BUBBLE</div>
        <div className="overlay-sub">FOCUS YOUR FRONTAL CORTEX · POP THE BUBBLES</div>
        <div style={{fontSize: '11px', letterSpacing: '2px', color: 'rgba(0,245,255,.5)', marginBottom: '30px', maxWidth: '380px', textAlign: 'center', lineHeight: '1.8'}}>
          Your EEG frontal attention signal controls the size and power of your mind cursor.<br/>
          HIGH FOCUS → larger aura → pop more bubbles at once.
        </div>
        <button className="big-btn" onClick={() => containerRef.current && containerRef.current.startGameHandler(false)}>BEGIN SESSION</button>
        <button className="big-btn" onClick={() => containerRef.current && containerRef.current.startGameHandler(true)} style={{borderColor: 'var(--glow-amber)', color: 'var(--glow-amber)'}}>MOUSE MODE</button>
      </div>

      {/* ── GAME OVER SCREEN ── */}
      <div className="overlay hidden" id="gameOverScreen">
        <div className="overlay-title">SESSION<br/>ENDED</div>
        <div className="stat-grid" id="stat-grid"></div>
        <button className="big-btn" onClick={() => containerRef.current && containerRef.current.startGameHandler(false)}>NEW SESSION</button>
      </div>

    </div>
  );
};

export default BubbleGameView;
