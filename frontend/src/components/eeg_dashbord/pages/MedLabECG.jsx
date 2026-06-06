import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Brain, Heart, Sun, Info } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useSidebar } from './SidebarContext';
import MedLabSidebar from '../sidebar/MedLabSidebar';

/* ── Constants ──────────────────────────────── */
const ECG_WINDOW_SECS = 8;
const EEG_WINDOW_SECS = 6;
const HISTORY_PTS     = 4096;

const WISDOM = [
  { quote: 'An apple a day keeps the doctor away.', author: '— Proverb' },
  { quote: 'Wherever you are, be there totally.', author: '— Eckhart Tolle' },
  { quote: 'The present moment is the only moment available to us.', author: '— Thich Nhat Hanh' },
  { quote: 'Almost everything will work again if you unplug it for a few minutes, including you.', author: '— Anne Lamott' },
  { quote: 'Rest when you are weary. Refresh and renew yourself.', author: '— Ralph Waldo Emerson' },
  { quote: 'Within you, there is a stillness and a sanctuary.', author: '— Hermann Hesse' },
  { quote: 'The mind is everything. What you think, you become.', author: '— Buddha' },
];

const STATE_STYLES = {
  Focus:    { bg: 'rgba(14,165,233,0.14)',  border: 'rgba(14,165,233,0.3)',   text: '#0ea5e9' },
  Calm:     { bg: 'rgba(168,85,247,0.14)',  border: 'rgba(168,85,247,0.3)',   text: '#a855f7' },
  Relaxed:  { bg: 'rgba(34,197,94,0.14)',   border: 'rgba(34,197,94,0.3)',    text: '#22c55e' },
  Stressed: { bg: 'rgba(244,63,94,0.14)',   border: 'rgba(244,63,94,0.3)',    text: '#f43f5e' },
  Drowsy:   { bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.3)',   text: '#f59e0b' },
  Neutral:  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: '#a1a1aa' },
};

const STATE_EMOJIS = {
  Focus: '🎯', Calm: '😌', Relaxed: '🧘', Stressed: '🤯', Drowsy: '😴', Neutral: '⏳',
};

/* ═══════════════════════════════════════════
   PENTAGON RADAR — Custom Canvas Implementation
   ═══════════════════════════════════════════ */
const BAND_LABELS = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];

function PentaRadar({ bandPowers, strokeColor, fillColor }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const bandsRef  = useRef([0.2, 0.2, 0.25, 0.2, 0.15]);

  useEffect(() => {
    const total = Math.max(1e-6,
      bandPowers.delta + bandPowers.theta + bandPowers.alpha + bandPowers.beta + bandPowers.gamma);
    const target = [
      bandPowers.delta / total, bandPowers.theta / total, bandPowers.alpha / total,
      bandPowers.beta  / total, bandPowers.gamma / total,
    ];
    const ALPHA = 0.1;
    const loop = () => {
      const prev = bandsRef.current;
      for (let i = 0; i < 5; i++) prev[i] = prev[i] + ALPHA * (target[i] - prev[i]);
      draw(prev);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bandPowers]);

  function draw(bands) {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.36;
    const n  = 5;
    const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);
    const INNER = 0.12;

    /* Dashed rings */
    ctx.setLineDash([2, 4]);
    [INNER, INNER + 0.22, INNER + 0.44, INNER + 0.66, 1.0].forEach(frac => {
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = cx + Math.cos(a) * R * frac, y = cy + Math.sin(a) * R * frac;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    });
    ctx.setLineDash([]);

    /* Spokes */
    angles.forEach(a => {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 0.5; ctx.stroke();
    });

    /* Data polygon */
    ctx.beginPath();
    angles.forEach((a, i) => {
      const r = (INNER + bands[i] * (1 - INNER)) * R;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle   = fillColor; ctx.fill();
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.8; ctx.stroke();

    /* Vertex dots */
    angles.forEach((a, i) => {
      const r = (INNER + bands[i] * (1 - INNER)) * R;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle  = strokeColor;
      ctx.shadowBlur = 6; ctx.shadowColor = strokeColor;
      ctx.fill(); ctx.shadowBlur = 0;
    });

    /* Labels */
    angles.forEach((a, i) => {
      const lx = cx + Math.cos(a) * (R + 17), ly = cy + Math.sin(a) * (R + 17);
      ctx.font = '700 10px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(BAND_LABELS[i], lx, ly);
    });
  }

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current; if (!c?.parentElement) return;
      const r = c.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width  = r.width  * dpr; c.height = r.height * dpr;
      c.style.width  = r.width  + 'px'; c.style.height = r.height + 'px';
    });
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

/* ═══════════════════════════════════════════
   GRID LINES — CortEX High Fidelity Grid Lines
   ═══════════════════════════════════════════ */
const GridLines = React.memo(({ gridNumberY = 50, numGridLinesX = 205 }) => {
  const linesX = [];
  for (let j = 1; j < numGridLinesX; j++) {
    const isMajor = j % 5 === 0;
    const opacity = isMajor ? 0.2 : 0.05;
    linesX.push(
      <div
        key={`x-${j}`}
        className="absolute bg-[rgb(128,128,128)] pointer-events-none"
        style={{
          width: '1px',
          height: '100%',
          left: `${((j / numGridLinesX) * 100).toFixed(3)}%`,
          opacity: opacity
        }}
      />
    );
  }

  const linesY = [];
  for (let j = 1; j < gridNumberY; j++) {
    const isMajor = j % 5 === 0;
    const opacity = isMajor ? 0.2 : 0.05;
    linesY.push(
      <div
        key={`y-${j}`}
        className="absolute bg-[rgb(128,128,128)] pointer-events-none"
        style={{
          height: '1px',
          width: '100%',
          top: `${((j / gridNumberY) * 100).toFixed(3)}%`,
          opacity: opacity
        }}
      />
    );
  }

  return (
    <div className="grid-lines-wrapper absolute inset-0 pointer-events-none overflow-hidden">
      {linesX}
      {linesY}
    </div>
  );
});
GridLines.displayName = 'GridLines';

/* ═══════════════════════════════════════════
   STATE INDICATOR — CortEX High Fidelity State Indicator
   ═══════════════════════════════════════════ */
const stateIcons = {
  stressed: "😰",
  relaxed: "😌",
  happy: "😄",
  focused: "🧠",
  neutral: "😐",
  mild_stress: "😟",
  no_data: "⏳"
};

const stateColors = {
  stressed: "text-red-500",
  relaxed: "text-blue-500",
  happy: "text-green-500",
  focused: "text-yellow-500",
  neutral: "text-cyan-500",
  mild_stress: "text-orange-500",
  no_data: "text-white animate-pulse"
};

function mapStateToIndicator(stateStr) {
  if (!stateStr) return 'no_data';
  const lower = stateStr.toLowerCase();
  if (lower.includes('focus')) return 'focused';
  if (lower.includes('calm') || lower.includes('relax')) return 'relaxed';
  if (lower.includes('stressed') || lower.includes('stress')) return 'stressed';
  if (lower.includes('happy')) return 'happy';
  if (lower.includes('mild_stress') || lower.includes('mild')) return 'mild_stress';
  if (lower.includes('neutral') || lower.includes('waiting') || lower.includes('analyz')) return 'no_data';
  return 'neutral';
}

function StateIndicator({ state }) {
  const displayState = state || 'no_data';
  const displayText = displayState === "no_data" ? "Analyzing..." : displayState.replace("_", " ");
  
  return (
    <div className={`px-2 rounded-lg flex items-center space-x-2 ${stateColors[displayState]}`}>
      <span className="text-base leading-none">{stateIcons[displayState]}</span>
      <span className="font-semibold capitalize text-xs tracking-wider leading-none">
        {displayText}
      </span>
    </div>
  );
}

/* ═══════════════════════════════════════════
   OSCILLOSCOPE CANVAS — Custom Live Waveforms
   ═══════════════════════════════════════════ */
function OscilloscopeCanvas({ ptsRef, windowSecs, strokeColor }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const yRangeRef = useRef(60);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const now  = Date.now();
    const tMin = now - windowSecs * 1000;
    const pts  = ptsRef.current.filter(p => p.t >= tMin);

    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    if (pts.length >= 2) {
      const rawMax = Math.max(...pts.map(p => Math.abs(p.value)), 1);
      yRangeRef.current = Math.max(yRangeRef.current, rawMax * 1.2);
      const yr   = yRangeRef.current;
      const toPx = t => ((t - tMin) / (windowSecs * 1000)) * W;
      const toY  = v => H / 2 - (v / yr) * (H / 2 - 10);
      ctx.strokeStyle = strokeColor;
      ctx.shadowColor = strokeColor; ctx.shadowBlur = 7;
      ctx.lineWidth   = 1.8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => { const x = toPx(p.t), y = toY(p.value); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke(); ctx.shadowBlur = 0;
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [windowSecs, strokeColor, ptsRef]);

  useEffect(() => { rafRef.current = requestAnimationFrame(draw); return () => cancelAnimationFrame(rafRef.current); }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ro = new ResizeObserver(() => { canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight; });
    ro.observe(canvas);
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />;
}

/* ═══════════════════════════════════════════
   RR INTERVAL STEP CHART (Y-axis 200–1200 ms)
   ═══════════════════════════════════════════ */
function RRChart({ history }) {
  if (!history || history.length < 2) {
    return (
      <div className="flex items-center justify-center h-full">
        <span className="text-white/10 text-[10px] font-mono">Waiting for RR interval data...</span>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history} margin={{ top: 12, right: 12, left: -24, bottom: 8 }}>
        <CartesianGrid stroke="rgba(128,128,128,0.08)" strokeDasharray="1 0" />
        <XAxis dataKey="t" hide />
        <YAxis
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 8, fontWeight: 600 }}
          width={38}
          domain={[200, 1200]}
          ticks={[200, 400, 600, 800, 1000, 1200]}
        />
        <Line
          type="stepAfter" dataKey="rr" stroke="var(--primary, #eab308)"
          strokeWidth={1.5} dot={false} isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   MAIN MED LAB ECG COMPONENT
   ═══════════════════════════════════════════ */
export default function MedLabECG({ result, wsEvent, wsMessage, onBackToMenu }) {
  // --- Sidebar Slot Context ---
  const { setSidebarSlot, setSidebarMode } = useSidebar();

  // --- State Variables ---
  const [bandPowers, setBandPowers] = useState({ delta: 20, theta: 20, alpha: 25, beta: 20, gamma: 15 });
  const [mindState,  setMindState]  = useState({ state: 'Neutral' });
  const [ecgMeta,    setEcgMeta]    = useState({ bpm: null, rr_ms: null, rr_sdnn: null, signal_quality: 0 });
  const [bpmStats,   setBpmStats]   = useState({ low: null, avg: null, high: null });
  const [hrvStats,   setHrvStats]   = useState({ low: null, avg: null, high: null });
  const [rrHistory,  setRrHistory]  = useState([]);

  // Connection and Session state
  const [deviceConnected, setDeviceConnected] = useState(true);
  const [meditationState, setMeditationState] = useState('complete'); // 'configuring' | 'active' | 'complete'
  const [selectedDuration, setSelectedDuration] = useState(5);
  const [timerRemaining, setTimerRemaining] = useState(300);

  // Wisdom Quote
  const [wisdomQuote, setWisdomQuote] = useState(() => WISDOM[Math.floor(Math.random() * WISDOM.length)]);

  // Oscilloscope Refs
  const ecgPtsRef   = useRef([]);
  const eeg1PtsRef  = useRef([]);
  const bpmHistRef  = useRef([]);
  const sdnnHistRef = useRef([]);

  // Timer interval ref
  const timerRef = useRef(null);

  // --- Real-time WebSocket Data Subscriptions ---
  useEffect(() => {
    if (!wsEvent) return;
    if (wsEvent.event === 'ecg_prediction' || wsEvent.type === 'ecg_prediction') {
      const f    = wsEvent.features ?? {};
      const bpm  = f.bpm     ?? null;
      const rr   = f.rr_ms   ?? null;
      const sdnn = f.rr_sdnn ?? null;
      setEcgMeta({ bpm, rr_ms: rr, rr_sdnn: sdnn, signal_quality: f.signal_quality ?? 0 });
      if (bpm != null) {
        bpmHistRef.current.push(bpm);
        if (bpmHistRef.current.length > 300) bpmHistRef.current = bpmHistRef.current.slice(-300);
        const arr = bpmHistRef.current;
        setBpmStats({
          low: Math.round(Math.min(...arr)),
          avg: Math.round(arr.reduce((a, b) => a + b) / arr.length),
          high: Math.round(Math.max(...arr))
        });
      }
      if (rr != null) {
        const t = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setRrHistory(prev => {
          const next = [...prev, { t, rr: Math.round(rr) }];
          return next.length > 120 ? next.slice(-120) : next;
        });
      }
      if (sdnn != null) {
        sdnnHistRef.current.push(sdnn);
        if (sdnnHistRef.current.length > 300) sdnnHistRef.current = sdnnHistRef.current.slice(-300);
        const arr = sdnnHistRef.current;
        setHrvStats({
          low: Math.round(Math.min(...arr)),
          avg: Math.round(arr.reduce((a, b) => a + b) / arr.length),
          high: Math.round(Math.max(...arr))
        });
      }
    }
    const out = wsEvent.output || wsEvent;
    if (out.state)       setMindState({ state: out.state });
    if (out.band_powers) setBandPowers({
      delta: out.band_powers.delta ?? 0,
      theta: out.band_powers.theta ?? 0,
      alpha: out.band_powers.alpha ?? 0,
      beta: out.band_powers.beta ?? 0,
      gamma: out.band_powers.gamma ?? 0
    });
  }, [wsEvent]);

  useEffect(() => {
    if (!result) return;
    if (result.state)       setMindState({ state: result.state });
    if (result.band_powers) setBandPowers({
      delta: result.band_powers.delta ?? 0,
      theta: result.band_powers.theta ?? 0,
      alpha: result.band_powers.alpha ?? 0,
      beta: result.band_powers.beta ?? 0,
      gamma: result.band_powers.gamma ?? 0
    });
  }, [result]);

  useEffect(() => {
    if (!wsMessage) return;
    const batch = wsMessage.raw?._batch; if (!batch?.length) return;
    const sr  = wsMessage.raw?.sample_rate || 512;
    const now = Date.now();
    const dur = (batch.length / sr) * 1000;
    const t0  = now - dur;
    batch.forEach((sample, i) => {
      const t  = t0 + (i / batch.length) * dur;
      const ch = sample.channels || {};
      Object.values(ch).forEach((chData, ci) => {
        const type = (chData.type || '').toUpperCase();
        if      (type === 'ECG')             ecgPtsRef.current.push({ t, value: chData.value });
        else if (type === 'EEG' && ci === 0) eeg1PtsRef.current.push({ t, value: chData.value });
      });
    });
    [ecgPtsRef, eeg1PtsRef].forEach(r => {
      if (r.current.length > HISTORY_PTS) r.current = r.current.slice(-HISTORY_PTS);
    });
  }, [wsMessage]);

  // --- Meditation Timer Hook ---
  useEffect(() => {
    if (meditationState === 'active') {
      timerRef.current = setInterval(() => {
        setTimerRemaining(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setMeditationState('complete');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [meditationState]);

  const startMeditation = () => {
    setTimerRemaining(selectedDuration * 60);
    setMeditationState('active');
  };

  const stopMeditation = () => {
    setMeditationState('complete');
  };

  // --- Setup Sidebar Slot ---
  useEffect(() => {
    setSidebarMode('page');
    return () => setSidebarSlot(null);
  }, [setSidebarMode, setSidebarSlot]);

  useEffect(() => {
    setSidebarSlot(
      <MedLabSidebar
        deviceConnected={deviceConnected}
        setDeviceConnected={setDeviceConnected}
        meditationState={meditationState}
        setMeditationState={setMeditationState}
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        timerRemaining={timerRemaining}
        startMeditation={startMeditation}
        stopMeditation={stopMeditation}
        wisdomQuote={wisdomQuote}
        onBackToMenu={onBackToMenu}
      />
    );
  }, [
    deviceConnected,
    meditationState,
    selectedDuration,
    timerRemaining,
    wisdomQuote,
    setSidebarSlot,
    onBackToMenu,
  ]);

  // --- Theme variables mapping ---
  const st = STATE_STYLES[mindState.state] || STATE_STYLES.Neutral;
  const emoji = STATE_EMOJIS[mindState.state] || '⏳';
  const stateLabel = mindState.state === 'Neutral' ? 'Analyzing...' : mindState.state;

  return (
    <div className="h-full w-full flex flex-col p-4 gap-4 font-sans overflow-hidden select-none text-[var(--text,#e4e4e7)] bg-[var(--bg-main)]">
      {/* LOCAL STYLES FOR OVERRIDING DEFAULT LOOK & LOCKING COLORS */}
      <style dangerouslySetInnerHTML={{ __html: `
        :root {
          --bg-main: #18181b;
          --bg-panel: #1e1e21;
          --bg-panel-header: #1e1e21;
          --border-color: #2d2d30;
          --accent-yellow: var(--primary, #facc15);
          --text-muted: var(--muted, #a1a1aa);
          --grid-line: #2a2a2d;
        }

        .panel-container {
          background-color: var(--bg-panel);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .chart-grid-bg {
          background-size: 50px 50px, 50px 50px, 10px 10px, 10px 10px;
          background-image: 
              linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to right, rgba(255,255,255,0.015) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.015) 1px, transparent 1px);
          background-position: center bottom;
        }

        ::-webkit-scrollbar { display: none; }
        * { scrollbar-width: none; }
      `}} />



      {/* MAIN DASHBOARD CONTAINER: TWO COLUMN LAYOUT */}
      <div className="flex-grow grid grid-cols-2 gap-4 min-w-0 min-h-0">
        
        {/* COLUMN 1: BRAIN ACTIVITY */}
        <div className="flex flex-col gap-4 h-full min-h-0">
          
          {/* BRAIN ACTIVITY HEADER PANEL (STANDALONE) */}
          <div className="panel-container shrink-0 flex flex-row items-center justify-center gap-3 h-[52px] bg-[var(--bg-panel-header)] border-[var(--border-color)]">
            <svg className="w-5 h-5 text-[var(--accent-yellow)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v.064c0 .351-.115.693-.324.974l-.948 1.272A2.5 2.5 0 0 0 6 10.5v1.277c0 .484-.136.953-.385 1.345l-1.036 1.62A2.5 2.5 0 0 0 5 18.5v1a2 2 0 0 0 2 2h3m5-19.5A2.5 2.5 0 0 1 17 4.5v.064c0 .351.115.693.324.974l.948 1.272A2.5 2.5 0 0 1 18 10.5v1.277c0 .484.136.953.385 1.345l1.036 1.62A2.5 2.5 0 0 1 19 18.5v1a2 2 0 0 1-2 2h-3m-4.5-20v21"/>
            </svg>
            <div className="text-center">
              <span className="font-bold text-[var(--text)] text-sm">Brain Activity</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium ml-2">Electroencephalogram (EEG)</span>
            </div>
          </div>

          {/* BRAIN ACTIVITY CHART PANEL (BAND POWERS) */}
          <div className="panel-container flex-[6.5] min-h-0">
            <div className="flex-grow flex flex-col items-center justify-center p-4 pb-6 min-h-0 overflow-hidden">
              <div className="flex-grow w-full relative min-h-0">
                <PentaRadar bandPowers={bandPowers} strokeColor="var(--accent-yellow)" fillColor="rgba(250, 204, 21, 0.08)" />
              </div>
              <div className="text-[var(--accent-yellow)] text-[10px] font-black tracking-widest mt-2 flex-shrink-0">BAND POWERS</div>
            </div>
          </div>

          {/* RAW EEG OSCILLOSCOPE */}
          <div className="panel-container flex-[3.5] min-h-0">
            <div className="w-full h-full overflow-hidden relative bg-black/20">
              <GridLines gridNumberY={50} numGridLinesX={205} />
              <OscilloscopeCanvas ptsRef={eeg1PtsRef} windowSecs={EEG_WINDOW_SECS} strokeColor="var(--primary, #c28b3c)" />
            </div>
          </div>

        </div>

        {/* COLUMN 2: HEART ACTIVITY */}
        <div className="flex flex-col gap-4 h-full min-h-0">
          
          {/* HEART ACTIVITY HEADER PANEL (STANDALONE) */}
          <div className="panel-container shrink-0 flex flex-row items-center justify-center gap-3 h-[52px] bg-[var(--bg-panel-header)] border-[var(--border-color)]">
            <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
            </svg>
            <div className="text-center">
              <span className="font-bold text-[var(--text)] text-sm">Heart Activity</span>
              <span className="text-[10px] text-[var(--text-muted)] font-medium ml-2">Electrocardiogram (ECG)</span>
            </div>
          </div>

          {/* HEART ACTIVITY CHART PANEL (ECG DETAILS) */}
          <div className="panel-container flex-[6.5] min-h-0" style={{ padding: '0.3rem' }}>
            <div className="flex-grow flex flex-col min-h-0 justify-between">
              
              {/* Top Section: Heart Rate Stats */}
              <div className="grid grid-cols-5 gap-2 flex-shrink-0 mb-3" style={{ padding: '2px' }}>
                {/* Current BPM - takes 2 columns */}
                <div className="col-span-2 flex flex-col justify-center pr-1 sm:pr-2 md:pr-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-bold text-[#f43f5e] leading-none">
                      {ecgMeta.bpm ?? '--'}
                    </span>
                    <span className="text-md sm:text-sm md:text-md lg:text-lg text-[var(--text-muted)] leading-none font-bold">
                      BPM
                    </span>
                  </div>
                </div>

                {/* Stats cards - takes 3 columns */}
                <div className="col-span-3 grid grid-cols-3 gap-1 sm:gap-2 md:gap-3">
                  {/* Low stat */}
                  <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                    <span className="text-sm text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                      LOW
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-white leading-none">
                        {bpmStats.low ?? '--'}
                      </span>
                      <span className="text-xs sm:text-sm md:text-lg text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                        BPM
                      </span>
                    </div>
                  </div>

                  {/* Avg stat */}
                  <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                    <span className="text-sm text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                      AVG
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs sm:text-sm md:text-base lg:text-lg font-semibold text-white leading-none">
                        {bpmStats.avg ?? '--'}
                      </span>
                      <span className="text-xs sm:text-lg md:text-lg text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                        BPM
                      </span>
                    </div>
                  </div>

                  {/* High stat */}
                  <div className="flex flex-col items-center justify-center p-1 sm:p-2">
                    <span className="text-sm text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                      HIGH
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg sm:text-sm md:text-base lg:text-lg font-semibold text-white leading-none">
                        {bpmStats.high ?? '--'}
                      </span>
                      <span className="text-lg sm:text-xs md:text-lg text-[var(--text-muted)] mb-1 sm:mb-2 leading-none font-bold">
                        BPM
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Chart Grid Area */}
              <div className="flex-grow relative w-full overflow-hidden my-3 min-h-0 bg-black/20">
                <RRChart history={rrHistory} />
              </div>

              {/* Bottom Row: 4 Equal-width Columns */}
              <div className="grid grid-cols-4 gap-1 sm:gap-2 flex-shrink-0 mb-3" style={{ marginBottom: "1px" }}>
                <div className="flex flex-col items-center bg-[#222225] rounded-xl" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--text-muted)] mb-1" style={{ fontSize: '16px' }}>
                    LOW HRV
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold text-white">
                      {hrvStats.low ?? '--'}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]" style={{ fontSize: '16px' }}>
                      ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center bg-[#222225] rounded-lg" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--text-muted)] mb-1" style={{ fontSize: '16px' }}>
                    AVG HRV
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-semibold text-[var(--accent-yellow)]">
                      {hrvStats.avg ?? '--'}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]" style={{ fontSize: '16px' }}>
                      ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center bg-[#222225] rounded-lg" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--text-muted)] mb-1" style={{ fontSize: '16px' }}>
                    HIGH HRV
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-semibold text-white">
                      {hrvStats.high ?? '--'}
                    </span>
                    <span className="ml-1 text-[var(--text-muted)]" style={{ fontSize: '16px' }}>
                      ms
                    </span>
                  </div>
                </div>

                <div className="flex flex-col items-center bg-[#222225] rounded-lg justify-center" style={{ padding: '0.2rem' }}>
                  <span className="text-xs text-[var(--accent-yellow)] mb-1" style={{ fontSize: '16px' }}>
                    State
                  </span>
                  <div className="flex items-center justify-center min-h-[24px]">
                    <StateIndicator state={mapStateToIndicator(mindState.state)} />
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* RAW ECG OSCILLOSCOPE */}
          <div className="panel-container flex-[3.5] min-h-0">
             <div className="w-full h-full overflow-hidden relative bg-black/20">
                <GridLines gridNumberY={100} numGridLinesX={205} />
                <OscilloscopeCanvas ptsRef={ecgPtsRef} windowSecs={ECG_WINDOW_SECS} strokeColor="#f43f5e" />
             </div>
          </div>

        </div>

      </div>
    </div>
  );
}