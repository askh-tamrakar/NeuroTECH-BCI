import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTheme } from '../../../contexts/ThemeContext';
import '../../../styles/views/BubbleGameView.css';
import BubbleSidebar from '../sidebar/BubbleSidebar';
import { useSidebar } from './SidebarContext';

// BandSmoother class to track the rolling average of relative band powers
class BandSmoother {
  constructor(bufferSize) {
    this.bufferSize = bufferSize;
    this.buffers = {};
    this.sums = {};
    this.index = 0;

    ['delta', 'theta', 'alpha', 'beta', 'gamma'].forEach(band => {
      this.buffers[band] = new Array(bufferSize).fill(0);
      this.sums[band] = 0;
    });
  }

  updateAll(bandValues) {
    for (const band in bandValues) {
      const val = bandValues[band];
      this.sums[band] -= this.buffers[band][this.index];
      this.sums[band] += val;
      this.buffers[band][this.index] = val;
    }
    this.index = (this.index + 1) % this.bufferSize;
  }

  getSmoothed(band) {
    return this.sums[band] / this.bufferSize;
  }

  clear() {
    for (const band in this.buffers) {
      this.buffers[band].fill(0);
      this.sums[band] = 0;
    }
    this.index = 0;
  }
}

const BubbleGameView = ({ result, isConnected, onBackToMenu }) => {
  const containerRef = useRef(null);
  const balloonWrapRef = useRef(null);
  const { currentTheme } = useTheme();

  const [globalRunning, setGlobalRunning] = useState(false);
  const [showGameOver, setShowGameOver] = useState(false);
  const [stressScore, setStressScore] = useState(0);
  const [focusScore, setFocusScore] = useState(0);
  const [eegMapped, setEegMapped] = useState(true);
  const [betaThreshold, setBetaThreshold] = useState(0.40);
  
  const smootherRef = useRef(new BandSmoother(128));
  const lastBubbleTimeRef = useRef(0);
  const gameRunningRef = useRef(false);
  const sessionStartRef = useRef(0);
  const sessionScoreRef = useRef({ time: 0, score: 0, popped: 0 });

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
        betaThreshold={betaThreshold}
        setBetaThreshold={setBetaThreshold}
      />
    );
    return () => setSidebarSlot(null);
  }, [onBackToMenu, stressScore, focusScore, globalRunning, betaThreshold, setSidebarSlot]);

  useEffect(() => {
    if (result && result.eeg_mapped !== undefined) setEegMapped(result.eeg_mapped);
  }, [result]);

  const createFocusBubbles = () => {
    if (!gameRunningRef.current) return;
    const now = Date.now();
    const BUBBLE_COOLDOWN = 300;
    if (now - lastBubbleTimeRef.current < BUBBLE_COOLDOWN) return;
    lastBubbleTimeRef.current = now;

    const balloonWrap = balloonWrapRef.current;
    if (!balloonWrap) return;

    const balloon = balloonWrap.querySelector('.focus-balloon');
    if (!balloon) return;

    const bubbleCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < bubbleCount; i++) {
      const bubble = document.createElement('div');
      bubble.className = 'focus-bubble';

      const size = Math.floor(Math.random() * 30) + 10;
      bubble.style.width = `${size}px`;
      bubble.style.height = `${size}px`;

      const balloonRect = balloon.getBoundingClientRect();
      const wrapRect = balloonWrap.getBoundingClientRect();
      
      const startX = (balloonRect.left - wrapRect.left) + balloonRect.width / 2 - size / 2;
      const startY = (balloonRect.top - wrapRect.top) + balloonRect.height / 2 - size / 2;

      bubble.style.left = `${startX}px`;
      bubble.style.top = `${startY}px`;

      const angle = Math.random() * Math.PI * 2;
      const distance = 100 + Math.random() * 200;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance - 100;

      bubble.style.setProperty('--tx', `${tx}px`);
      bubble.style.setProperty('--ty', `${ty}px`);

      bubble.addEventListener('animationend', () => {
        bubble.remove();
      });

      balloonWrap.appendChild(bubble);
      sessionScoreRef.current.popped += 1;
      sessionScoreRef.current.score += 10;
    }
    
    const sc = document.getElementById('score-val');
    if (sc) sc.textContent = sessionScoreRef.current.score.toLocaleString();
  };

  useEffect(() => {
    if (!globalRunning || !result) return;
    
    const out = result.output || result;
    setStressScore(Math.max(0, Math.min(100, Math.round(out.stress_score ?? stressScore))));
    setFocusScore(Math.max(0, Math.min(100, Math.round(out.focus_score ?? focusScore))));

    const bp = result.band_powers;
    if (bp && bp.length >= 5) {
      const total = bp.reduce((a, b) => a + b, 0);
      if (total > 0) {
        const rels = {
          delta: bp[0] / total,
          theta: bp[1] / total,
          alpha: bp[2] / total,
          beta: bp[3] / total,
          gamma: bp[4] / total
        };

        smootherRef.current.updateAll(rels);
        const smooth = {
          delta: smootherRef.current.getSmoothed('delta'),
          theta: smootherRef.current.getSmoothed('theta'),
          alpha: smootherRef.current.getSmoothed('alpha'),
          beta: smootherRef.current.getSmoothed('beta'),
          gamma: smootherRef.current.getSmoothed('gamma')
        };

        ['delta', 'theta', 'alpha', 'beta', 'gamma'].forEach(band => {
          const pct = Math.round(smooth[band] * 100);
          const bar = document.getElementById(`bf-${band}`);
          if (bar) bar.style.width = `${pct}%`;
          const val = document.getElementById(`bv-${band}`);
          if (val) val.textContent = `${pct}%`;
        });

        if (rels.beta >= betaThreshold * 1.1 && smooth.beta >= betaThreshold) {
          createFocusBubbles();
        }
      }
    }
  }, [result, globalRunning, betaThreshold, stressScore, focusScore]);

  // Imperative handlers attached to containerRef for Sidebar access
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    function loadSessionData() { try { return JSON.parse(localStorage.getItem('nb_sessions') || '[]'); } catch { return []; } }
    
    container.clearHistoryHandler = () => { 
      localStorage.removeItem('nb_sessions'); 
      renderSessionHistory(); 
    };

    function saveSession(d) { 
      const s = loadSessionData(); 
      s.unshift(d); 
      if (s.length > 5) s.pop(); 
      localStorage.setItem('nb_sessions', JSON.stringify(s)); 
    }

    function renderSessionHistory() {
      const sessions = loadSessionData(); 
      const el = document.getElementById('session-history'); 
      if (!el) return;
      if (!sessions.length) { el.innerHTML = '<div class="text-[10px] text-[var(--muted)]/50 text-center tracking-[2px] py-4">NO SESSIONS YET</div>'; return; }
      el.innerHTML = sessions.map((s, i) => `
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/10 rounded-lg p-2.5 mb-2">
          <div class="flex justify-between items-baseline mb-1"><span class="text-[9px] text-[var(--teal)] opacity-60">#${i + 1}</span><span class="font-display text-[15px] font-bold text-white">${s.score.toLocaleString()}</span></div>
          <div class="flex gap-2 text-[8px] text-[var(--primary)]/60 tracking-widest uppercase font-bold"><span>LVL ${s.level}</span><span>ACC ${s.accuracy}%</span><span>${s.time}S</span><span>F:${s.avgFocus||0}%</span><span>S:${s.avgStress||0}%</span></div>
        </div>`).join('');
    }

    container.startGameHandler = () => {
      smootherRef.current.clear();
      sessionScoreRef.current = { time: 0, score: 0, popped: 0 };
      sessionStartRef.current = Date.now();
      const sc = document.getElementById('score-val'); 
      if (sc) sc.textContent = '0';
      
      setShowGameOver(false);
      gameRunningRef.current = true;
      setGlobalRunning(true);
      
      const bubbles = balloonWrapRef.current?.querySelectorAll('.focus-bubble');
      bubbles?.forEach(b => b.remove());
    };

    container.stopGameHandler = () => {
      gameRunningRef.current = false;
      setGlobalRunning(false);
      const elapsed = Math.round((Date.now() - sessionStartRef.current) / 1000);
      const score = sessionScoreRef.current.score;
      const popped = sessionScoreRef.current.popped;
      
      const sg = document.getElementById('stat-grid');
      if (sg) sg.innerHTML = `
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">SCORE</div><div class="font-display text-xl font-bold text-white">${score.toLocaleString()}</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">POPPED</div><div class="font-display text-xl font-bold text-white">${popped}</div></div>
        <div class="bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-lg p-3 text-center"><div class="text-[9px] tracking-[3px] text-[var(--teal)] opacity-70 mb-1">TIME</div><div class="font-display text-xl font-bold text-white">${elapsed}s</div></div>`;
      
      setShowGameOver(true);
      saveSession({ score, level: 1, accuracy: 100, time: elapsed, avgFocus: focusScore, avgStress: stressScore, mode: 'NEURAL' });
      renderSessionHistory();
    };

    renderSessionHistory();

    return () => {
      gameRunningRef.current = false;
    };
  }, [focusScore, stressScore]);

  return (
    <div className="w-full h-full flex overflow-hidden relative select-none" ref={containerRef}>
      {!eegMapped && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[300] flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 backdrop-blur-md">
          <AlertTriangle size={16} className="text-amber-400" />
          <span className="text-xs font-bold text-amber-300 tracking-wider">Please map an EEG sensor in Settings for accurate data</span>
        </div>
      )}
      <div className="flex-grow flex flex-col items-center justify-center relative transition-all duration-300">
        
        {/* Underwater Game Container */}
        <div className="absolute inset-0 underwater-bg" ref={balloonWrapRef}>
          <div className="light-ray" style={{ left: '10%', animationDelay: '0s' }}></div>
          <div className="light-ray" style={{ left: '30%', animationDelay: '3s' }}></div>
          <div className="light-ray" style={{ left: '50%', animationDelay: '6s' }}></div>
          <div className="light-ray" style={{ left: '70%', animationDelay: '9s' }}></div>
          <div className="light-ray" style={{ left: '90%', animationDelay: '12s' }}></div>

          <div className="balloon-container">
            <div className="focus-balloon"></div>
          </div>

          <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,rgba(0,0,0,0.06)_2px,rgba(0,0,0,0.06)_4px)] z-[300]"></div>

          {/* Top HUD */}
          <div className="absolute top-6 left-6 z-50 pointer-events-none flex flex-col items-start">
            <span className="font-display text-[10px] tracking-widest text-[var(--primary)] opacity-70 drop-shadow-md">SCORE</span>
            <span id="score-val" className="font-display text-4xl font-black text-white drop-shadow-[0_0_16px_var(--primary)]">0</span>
          </div>

          {/* Neural Status HUD */}
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex gap-6">
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black tracking-widest text-red-400 uppercase drop-shadow-md">Stress</span>
              <span className="font-display text-2xl font-black text-red-400 drop-shadow-md">{stressScore}%</span>
            </div>
            <div className="w-px h-12 bg-white/30" />
            <div className="flex flex-col items-center">
              <span className="text-[9px] font-black tracking-widest text-cyan-400 uppercase drop-shadow-md">Focus</span>
              <span className="font-display text-2xl font-black text-cyan-400 drop-shadow-md">{focusScore}%</span>
            </div>
          </div>

          {/* Game Control Panel */}
          <div className="game-control-panel">
            <div className="slider-container">
              <span className="slider-label">Beta Threshold:</span>
              <input 
                type="range" 
                min="0.1" max="0.9" step="0.05" 
                value={betaThreshold} 
                onChange={(e) => setBetaThreshold(parseFloat(e.target.value))} 
              />
              <span className="value-display">{betaThreshold.toFixed(2)}</span>
            </div>
            <div className="button-group">
              <button disabled={isConnected || globalRunning}>Connect Device</button>
              <button disabled={!isConnected}>Disconnect</button>
              <button disabled={!isConnected || globalRunning} onClick={() => containerRef.current?.startGameHandler()}>Start Stream</button>
              <button disabled={!globalRunning} onClick={() => containerRef.current?.stopGameHandler()}>Stop Stream</button>
            </div>
            <div className="status">
              {!isConnected ? "Not connected" : (!globalRunning ? "Connected but not streaming" : "Connected and streaming data")}
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
