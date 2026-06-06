import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Brain, Heart, X } from 'lucide-react';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { useSidebar } from './SidebarContext';
import MedLabSidebar from '../sidebar/MedLabSidebar';
import { predictState, STATE_ICONS, STATE_COLORS, stateBadgeStyle } from './stateClassifier';
import MeditationWaveform from './MeditationWaveform';

/* ── Constants ──────────────────────────────── */
const ECG_WINDOW_SECS = 8;
const EEG_WINDOW_SECS = 6;
const HISTORY_PTS     = 4096;

const CARD = {
  background: 'rgba(255,255,255,0.025)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: '8px',
  overflow: 'hidden',
};
const GRID_BG = {
  backgroundSize: '24px 24px',
  backgroundImage:
    'linear-gradient(to right,rgba(255,255,255,0.035) 1px,transparent 1px),' +
    'linear-gradient(to bottom,rgba(255,255,255,0.035) 1px,transparent 1px)',
};

const STATE_STYLES = {
  Focus:    { bg: 'rgba(14,165,233,0.14)',  border: 'rgba(14,165,233,0.3)',   text: '#0ea5e9' },
  Calm:     { bg: 'rgba(168,85,247,0.14)',  border: 'rgba(168,85,247,0.3)',   text: '#a855f7' },
  Relaxed:  { bg: 'rgba(34,197,94,0.14)',   border: 'rgba(34,197,94,0.3)',    text: '#22c55e' },
  Stressed: { bg: 'rgba(244,63,94,0.14)',   border: 'rgba(244,63,94,0.3)',    text: '#f43f5e' },
  Drowsy:   { bg: 'rgba(245,158,11,0.14)',  border: 'rgba(245,158,11,0.3)',   text: '#f59e0b' },
  Neutral:  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: '#a1a1aa' },
};

function bpmColor(bpm) {
  if (!bpm)      return '#f43f5e';
  if (bpm < 60)  return '#3b82f6';
  if (bpm < 100) return '#f43f5e';
  return '#ef4444';
}

/* ═══════════════════════════════════════════
   PENTAGON RADAR — dashed wireframe style
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
    const R  = Math.min(W, H) * 0.34;
    const n  = 5;
    const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);
    const INNER = 0.12;

    ctx.setLineDash([2, 4]);
    [INNER, INNER + 0.22, INNER + 0.44, INNER + 0.66, 1.0].forEach(frac => {
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = cx + Math.cos(a) * R * frac, y = cy + Math.sin(a) * R * frac;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.13)';
      ctx.lineWidth   = 0.8;
      ctx.stroke();
    });
    ctx.setLineDash([]);

    angles.forEach(a => {
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 0.5; ctx.stroke();
    });

    ctx.beginPath();
    angles.forEach((a, i) => {
      const r = (INNER + bands[i] * (1 - INNER)) * R;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle   = fillColor; ctx.fill();
    ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5; ctx.stroke();

    angles.forEach((a, i) => {
      const r = (INNER + bands[i] * (1 - INNER)) * R;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle  = strokeColor;
      ctx.shadowBlur = 6; ctx.shadowColor = strokeColor;
      ctx.fill(); ctx.shadowBlur = 0;
    });

    angles.forEach((a, i) => {
      const lx = cx + Math.cos(a) * (R + 17), ly = cy + Math.sin(a) * (R + 17);
      ctx.font = '500 9px ui-sans-serif,system-ui,sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(161,161,170,0.75)';
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
   OSCILLOSCOPE CANVAS
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

    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
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
   RR INTERVAL STEP CHART
   ═══════════════════════════════════════════ */
function RRChart({ history }) {
  if (!history || history.length < 2) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <span style={{ color: 'rgba(255,255,255,0.12)', fontSize: '9px', fontFamily: 'monospace' }}>No data</span>
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history} margin={{ top: 6, right: 4, left: 0, bottom: 4 }}>
        <XAxis dataKey="t" hide />
        <YAxis
          stroke="rgba(255,255,255,0.08)"
          tick={{ fill: 'rgba(255,255,255,0.28)', fontSize: 8, fontWeight: 600 }}
          width={38}
          domain={[200, 1200]}
          ticks={[200, 400, 600, 800, 1000, 1200]}
        />
        <Line type="stepAfter" dataKey="rr" stroke="#eab308" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════
   MAIN MED LAB VIEW
   ═══════════════════════════════════════════ */
export default function MedLabView({ result, wsEvent, wsMessage, onBackToMenu }) {
  const [bandPowers, setBandPowers] = useState({ delta: 20, theta: 20, alpha: 25, beta: 20, gamma: 15 });
  const [mindState,  setMindState]  = useState({ state: 'Neutral' });
  const [ecgMeta,    setEcgMeta]    = useState({ bpm: null, rr_ms: null, rr_sdnn: null, signal_quality: 0 });
  const [bpmStats,   setBpmStats]   = useState({ low: null, avg: null, high: null });
  const [hrvStats,   setHrvStats]   = useState({ low: null, avg: null, high: null });
  const [rrHistory,  setRrHistory]  = useState([]);

  // ── Session state ─────────────────────────────────────────────────
  const [deviceConnected, setDeviceConnected] = useState(false);
  const [meditationState, setMeditationState] = useState('configuring');
  const [selectedDuration, setSelectedDuration] = useState(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [sessionResult, setSessionResult] = useState(null);
  const [showResultsModal, setShowResultsModal] = useState(false);
  const [fullSessionResults, setFullSessionResults] = useState(null);

  // ── CortEX-style session data accumulation ───────────────────────
  const sessionDataRef = useRef([]);         // { timestamp, alpha, beta, theta, delta, symmetry, bpm, hrv }
  const isMeditatingRef = useRef(false);
  const sessionStartRef = useRef(null);
  const sessionSavedRef = useRef(false);

  const bpmHistRef  = useRef([]);
  const sdnnHistRef = useRef([]);
  const ecgPtsRef   = useRef([]);
  const eegPtsRef   = useRef([]);
  const lastBpmRef  = useRef(null);
  const lastSdnnRef = useRef(null);

  const { setSidebarSlot, setSidebarMode } = useSidebar();

  /* ─────────────────────────────────────────────────────────────────
     analyzeSession() — CortEX-style session analysis
     ───────────────────────────────────────────────────────────────── */
  const analyzeSession = useCallback((data) => {
    if (!data?.length) return null;

    const durationSec = selectedDuration ? selectedDuration * 60 : data.length * 0.5;
    const convert     = (ticks) => ((ticks * 0.5) / 60).toFixed(2);

    const averages = {
      alpha:    data.reduce((s, d) => s + d.alpha, 0) / data.length,
      beta:     data.reduce((s, d) => s + d.beta,  0) / data.length,
      theta:    data.reduce((s, d) => s + d.theta, 0) / data.length,
      delta:    data.reduce((s, d) => s + (d.delta ?? 0), 0) / data.length,
      symmetry: data.reduce((s, d) => s + (d.symmetry ?? 0), 0) / data.length,
    };

    const totalPower = averages.alpha + averages.beta + averages.theta + averages.delta;
    const safeDiv = (v) => (totalPower > 0 ? (v / totalPower) * 100 : 0);

    const statePercentages = {
      Relaxed:   safeDiv(averages.alpha).toFixed(1),
      Focused:   safeDiv(averages.beta).toFixed(1),
      Meditation: safeDiv(averages.theta).toFixed(1),
      Drowsy:    safeDiv(averages.delta).toFixed(1),
    };

    const goodMeditationPct = totalPower > 0
      ? (((averages.alpha + averages.theta) / totalPower) * 100).toFixed(1)
      : '0.0';

    // Determine mental state (CortEX algorithm)
    let mentalState = '', stateDescription = '';
    const ap = safeDiv(averages.alpha), bp = safeDiv(averages.beta),
          tp = safeDiv(averages.theta), dp = safeDiv(averages.delta);

    if (dp > 40) {
      mentalState = 'Drowsy';
      stateDescription = 'Your brain was in a very slow-wave state, indicating deep rest or sleepiness. Consider meditating when more alert.';
    } else if (tp > 35 && ap > 25) {
      mentalState = 'Deep Meditation';
      stateDescription = 'You achieved a profound meditative state with strong theta and alpha waves—excellent work.';
    } else if (tp > 30) {
      mentalState = 'Meditative';
      stateDescription = 'You entered a meditative state with good theta wave activity. This indicates deep focus and inner awareness.';
    } else if (ap > 35) {
      mentalState = 'Relaxed';
      stateDescription = 'Your mind was in a calm and relaxed state, ideal for stress relief and peaceful meditation.';
    } else if (ap > 25 && bp < 40) {
      mentalState = 'Relaxed Focus';
      stateDescription = 'You maintained a balanced state of relaxed alertness—perfect for mindful meditation.';
    } else if (bp > 45) {
      mentalState = 'Highly Focused';
      stateDescription = 'Your mind was very active and alert. Try to gently soften your focus for deeper meditation.';
    } else if (bp > 35) {
      mentalState = 'Focused';
      stateDescription = 'Your mind was in an active, alert state. Try directing attention to your breath.';
    } else {
      const maxKey = Object.entries(averages).filter(([k]) => k !== 'symmetry').sort((a, b) => b[1] - a[1])[0][0];
      const map = { alpha: ['Relaxed', 'Calm and relaxed'], beta: ['Focused', 'Active and alert'],
                    theta: ['Meditative', 'Meditative state achieved'], delta: ['Drowsy', 'Slow-wave rest state'] };
      [mentalState, stateDescription] = map[maxKey] || ['Balanced', 'Balanced mental state throughout the session.'];
    }

    const bpmVals = data.map(d => d.bpm).filter(n => n != null);
    const hrvVals = data.map(d => d.hrv).filter(n => n != null);
    const avgBPM = bpmVals.length ? Math.round(bpmVals.reduce((a, b) => a + b, 0) / bpmVals.length) : null;
    const avgHRV = hrvVals.length ? Math.round(hrvVals.reduce((a, b) => a + b, 0) / hrvVals.length) : null;

    const mostFrequent = Object.entries(averages).filter(([k]) => k !== 'symmetry').sort((a, b) => b[1] - a[1])[0][0];

    const focusScore = ((averages.alpha + averages.theta) / (averages.beta + 0.001)).toFixed(2);

    return {
      duration: durationSec,
      formattedDuration: `${selectedDuration || Math.round(durationSec / 60)} min`,
      averages,
      mentalState,
      stateDescription,
      focusScore,
      symmetry: averages.symmetry > 0.005 ? 'Left hemisphere dominant'
              : averages.symmetry < -0.005 ? 'Right hemisphere dominant' : 'Balanced',
      data,
      dominantBands: { alpha: Math.round(ap), beta: Math.round(bp), theta: Math.round(tp), delta: Math.round(dp) },
      mostFrequent,
      convert,
      avgSymmetry: averages.symmetry.toFixed(3),
      statePercentages,
      goodMeditationPct,
      weightedEEGScore: Math.round((averages.alpha * 0.4 + averages.theta * 0.6) * 100),
      averageHRV: avgHRV,
      averageBPM: avgBPM,
    };
  }, [selectedDuration]);

  /* ── Start / Stop session ────────────────────────────────────────── */
  const startMeditation = useCallback(() => {
    sessionDataRef.current = [];
    isMeditatingRef.current = true;
    sessionStartRef.current = Date.now();
    sessionSavedRef.current = false;
    setFullSessionResults(null);
    setShowResultsModal(false);
  }, []);

  const stopMeditation = useCallback(() => {
    isMeditatingRef.current = false;
    const frozen = [...sessionDataRef.current];
    const results = analyzeSession(frozen);
    if (results) {
      setFullSessionResults(results);
      setShowResultsModal(true);
    }
  }, [analyzeSession]);

  /* ── Timer-based auto-complete ──────────────────────────────────── */
  useEffect(() => {
    if (meditationState === 'active' && timerRemaining === 0 && isMeditatingRef.current) {
      stopMeditation();
    }
  }, [meditationState, timerRemaining, stopMeditation]);

  /* ── Ingest wsEvent (ECG predictions + band powers) ─────────────── */
  useEffect(() => {
    if (!wsEvent) return;
    if (wsEvent.event === 'ecg_prediction' || wsEvent.type === 'ecg_prediction') {
      const f    = wsEvent.features ?? {};
      const bpm  = f.bpm     ?? null;
      const rr   = f.rr_ms   ?? null;
      const sdnn = f.rr_sdnn ?? null;
      setEcgMeta({ bpm, rr_ms: rr, rr_sdnn: sdnn, signal_quality: f.signal_quality ?? 0 });
      if (bpm != null) {
        lastBpmRef.current = bpm;
        bpmHistRef.current.push(bpm);
        if (bpmHistRef.current.length > 300) bpmHistRef.current = bpmHistRef.current.slice(-300);
        const arr = bpmHistRef.current;
        setBpmStats({ low: Math.round(Math.min(...arr)), avg: Math.round(arr.reduce((a, b) => a + b) / arr.length), high: Math.round(Math.max(...arr)) });
      }
      if (sdnn != null) {
        lastSdnnRef.current = sdnn;
        sdnnHistRef.current.push(sdnn);
        if (sdnnHistRef.current.length > 300) sdnnHistRef.current = sdnnHistRef.current.slice(-300);
        const arr = sdnnHistRef.current;
        setHrvStats({ low: Math.round(Math.min(...arr)), avg: Math.round(arr.reduce((a, b) => a + b) / arr.length), high: Math.round(Math.max(...arr)) });
      }
      if (rr != null) {
        const t = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setRrHistory(prev => { const next = [...prev, { t, rr: Math.round(rr) }]; return next.length > 120 ? next.slice(-120) : next; });
      }
    }
    const out = wsEvent.output || wsEvent;
    if (out.state)       setMindState({ state: out.state });
    if (out.band_powers) setBandPowers({
      delta: out.band_powers.delta ?? 0, theta: out.band_powers.theta ?? 0,
      alpha: out.band_powers.alpha ?? 0, beta:  out.band_powers.beta  ?? 0,
      gamma: out.band_powers.gamma ?? 0,
    });

    // ── Session data accumulation (every wsEvent during active session) ──
    if (isMeditatingRef.current && out.band_powers) {
      const bp = out.band_powers;
      sessionDataRef.current.push({
        timestamp: Date.now(),
        alpha: bp.alpha ?? 0, beta: bp.beta ?? 0, theta: bp.theta ?? 0, delta: bp.delta ?? 0, gamma: bp.gamma ?? 0,
        symmetry: Math.abs((bp.alpha ?? 0) - 0), // single-channel symmetry placeholder
        bpm: lastBpmRef.current,
        hrv: lastSdnnRef.current,
      });
    }
  }, [wsEvent]);

  useEffect(() => {
    if (!result) return;
    if (result.state)       setMindState({ state: result.state });
    if (result.band_powers) setBandPowers({
      delta: result.band_powers.delta ?? 0, theta: result.band_powers.theta ?? 0,
      alpha: result.band_powers.alpha ?? 0, beta:  result.band_powers.beta  ?? 0,
      gamma: result.band_powers.gamma ?? 0,
    });
  }, [result]);

  /* ── Raw waveforms from wsMessage ───────────────────────────────── */
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
      Object.values(ch).forEach((chData) => {
        const type = (chData.type || '').toUpperCase();
        if      (type === 'ECG') ecgPtsRef.current.push({ t, value: chData.value });
        else if (type === 'EEG') eegPtsRef.current.push({ t, value: chData.value });
      });
    });
    [ecgPtsRef, eegPtsRef].forEach(r => { if (r.current.length > HISTORY_PTS) r.current = r.current.slice(-HISTORY_PTS); });
  }, [wsMessage]);

  /* ── Sidebar ─────────────────────────────────────────────────────── */
  useEffect(() => {
    setSidebarMode('page');
    return () => setSidebarSlot(null);
  }, []);

  useEffect(() => {
    const WISDOM = [
      { quote: 'Wherever you are, be there totally.', author: '— Eckhart Tolle' },
      { quote: 'The present moment is the only moment available to us.', author: '— Thich Nhat Hanh' },
      { quote: 'Almost everything will work again if you unplug it for a few minutes, including you.', author: '— Anne Lamott' },
    ];
    setSidebarSlot(
      <MedLabSidebar
        deviceConnected={deviceConnected}
        setDeviceConnected={setDeviceConnected}
        meditationState={meditationState}
        setMeditationState={setMeditationState}
        selectedDuration={selectedDuration}
        setSelectedDuration={setSelectedDuration}
        timerRemaining={timerRemaining}
        setTimerRemaining={setTimerRemaining}
        sessionResult={sessionResult}
        setSessionResult={setSessionResult}
        startMeditation={() => { setMeditationState('active'); setTimerRemaining((selectedDuration || 5) * 60); startMeditation(); }}
        stopMeditation={() => { setMeditationState('complete'); stopMeditation(); }}
        onSessionComplete={(data) => setSessionResult(data)}
        wisdomQuote={WISDOM[Math.floor(Math.random() * WISDOM.length)]}
        onBackToMenu={onBackToMenu}
      />
    );
  }, [deviceConnected, meditationState, selectedDuration, timerRemaining, sessionResult, onBackToMenu, startMeditation, stopMeditation]);

  /* ── HRV state prediction ────────────────────────────────────────── */
  const hrvState = predictState({
    sdnn:  ecgMeta.rr_sdnn ?? 0,
    rmssd: ecgMeta.rr_sdnn ? ecgMeta.rr_sdnn * 0.8 : 0,  // RMSSD ≈ 0.8 × SDNN approximation
    pnn50: ecgMeta.rr_sdnn ? Math.min((ecgMeta.rr_sdnn / 50) * 100, 100) : 0,
  });
  const hrvIcon  = STATE_ICONS[hrvState];
  const hrvBadge = stateBadgeStyle(hrvState);

  const bColor = bpmColor(ecgMeta.bpm);

  /* ── Session result modal data ───────────────────────────────────── */
  const sRes = fullSessionResults;

  return (
    <>
      {/* ════════════════════════════════════════════════════════════════
         MAIN GRID
         ════════════════════════════════════════════════════════════════ */}
      <div
        style={{
          display: 'grid',
          gridTemplateAreas: `
            "brainH heartH"
            "radar  heartC"
            "eegRaw ecgC  "
          `,
          gridTemplateColumns: '1fr 1.5fr',
          gridTemplateRows: '52px 2fr 1fr',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: 'var(--bg)',
          gap: '5px',
          padding: '5px',
          boxSizing: 'border-box',
        }}
      >
        {/* ══ Brain Activity Header ══ */}
        <div style={{ gridArea: 'brainH', ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Brain size={20} style={{ color: 'var(--primary)' }} />
          <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Brain Activity</div>
            <div style={{ fontSize: '10px', color: 'rgba(161,161,170,0.55)' }}>Electroencephalogram (EEG)</div>
          </div>
        </div>

        {/* ══ Heart Activity Header ══ */}
        <div style={{ gridArea: 'heartH', ...CARD, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <Heart size={20} style={{ color: '#f43f5e' }} />
          <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>Heart Activity</div>
            <div style={{ fontSize: '10px', color: 'rgba(161,161,170,0.55)' }}>Electrocardiogram (ECG)</div>
          </div>
        </div>

        {/* ══ Radar Panel ══ */}
        <div style={{ gridArea: 'radar', ...CARD, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0, padding: '12px 16px 16px' }}>
          <div style={{ flex: 1, width: '100%', minHeight: 0 }}>
            <PentaRadar bandPowers={bandPowers} strokeColor="#d97706" fillColor="rgba(217,119,6,0.18)" />
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, marginTop: '6px', color: '#d97706', flexShrink: 0 }}>Brain Waves</div>
        </div>

        {/* ══ Heart Content Panel ══ */}
        <div style={{ gridArea: 'heartC', ...CARD, display: 'flex', flexDirection: 'column', minHeight: 0, padding: '12px 14px 10px', gap: '8px', overflow: 'auto' }}>
          {/* BPM row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0, background: bColor, display: 'inline-block' }} />
              <span style={{ fontSize: '30px', fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-1px', lineHeight: 1, color: bColor }}>
                {ecgMeta.bpm != null ? Math.round(ecgMeta.bpm) : '—'}
              </span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'rgba(161,161,170,0.7)', marginBottom: '2px' }}>BPM</span>
            </div>
            <div style={{ display: 'flex', gap: '24px', paddingBottom: '2px' }}>
              {[{ label: 'LOW', val: bpmStats.low }, { label: 'AVG', val: bpmStats.avg }, { label: 'HIGH', val: bpmStats.high }].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(161,161,170,0.4)', marginBottom: '3px' }}>{s.label}</div>
                  <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)' }}>
                    {s.val ?? '—'} <span style={{ fontSize: '9px', color: 'rgba(161,161,170,0.35)', fontWeight: 400 }}>BPM</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* RR chart */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', borderRadius: '4px', ...GRID_BG, border: '1px solid rgba(255,255,255,0.07)' }}>
            <RRChart history={rrHistory} />
          </div>
          {/* HRV stats + State (CortEX-style) */}
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, height: '50px' }}>
            {[{ label: 'LOW HRV', val: hrvStats.low }, { label: 'AVG HRV', val: hrvStats.avg }, { label: 'HIGH HRV', val: hrvStats.high }].map(h => (
              <div key={h.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px' }}>
                <div style={{ fontSize: '8.5px', fontWeight: 600, letterSpacing: '0.08em', color: 'rgba(161,161,170,0.4)', textTransform: 'uppercase' }}>{h.label}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text)', marginTop: '2px' }}>{h.val != null ? `${h.val} ms` : '— ms'}</div>
              </div>
            ))}
            {/* CortEX-style HRV state indicator */}
            <div style={{ flexShrink: 0, minWidth: '112px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 10px', borderRadius: '6px', ...hrvBadge }}>
              <div style={{ fontSize: '8.5px', fontWeight: 700, letterSpacing: '0.08em', color: hrvBadge.color, textTransform: 'uppercase' }}>State</div>
              <div style={{ fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', color: hrvBadge.color }}>
                <span>{hrvIcon}</span>
                <span>{hrvState === 'no_data' ? 'Analyzing...' : hrvState.replace('_', ' ')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ══ EEG Panel ══ */}
        <div style={{ gridArea: 'eegRaw', ...CARD, ...GRID_BG, minHeight: 0 }}>
          <OscilloscopeCanvas ptsRef={eegPtsRef} windowSecs={EEG_WINDOW_SECS} strokeColor="#3b82f6" />
        </div>

        {/* ══ ECG Panel ══ */}
        <div style={{ gridArea: 'ecgC', ...CARD, ...GRID_BG, minHeight: 0 }}>
          <OscilloscopeCanvas ptsRef={ecgPtsRef} windowSecs={ECG_WINDOW_SECS} strokeColor="#f43f5e" />
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════
         SESSION RESULTS MODAL (CortEX-style)
         ════════════════════════════════════════════════════════════════ */}
      {showResultsModal && sRes && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => setShowResultsModal(false)}
        >
          <div
            style={{
              width: 'min(95vw, 1100px)', maxHeight: '90vh',
              background: '#141419', borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.1)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>
                🧘 Session Complete: Meditation Insights
              </div>
              <button
                onClick={() => setShowResultsModal(false)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)', padding: '4px',
                }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Body: Left (waveform) + Right (analysis) */}
            <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
              {/* Left: Meditation Waveform (12 phases) */}
              <div style={{ flex: 1, minWidth: 0, padding: '16px', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                  Session Phase Analysis
                </div>
                <div style={{ width: '100%', height: 'calc(100% - 28px)', minHeight: '280px' }}>
                  <MeditationWaveform data={sRes.data} sessionDurationSec={sRes.duration} darkMode />
                </div>
                {/* Legend */}
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px', fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>
                  <span><span style={{ color: '#34d399' }}>●</span> Relaxed</span>
                  <span><span style={{ color: '#f97316' }}>●</span> Focused</span>
                  <span><span style={{ color: '#6366f1' }}>●</span> Deep Meditation</span>
                  <span><span style={{ color: '#9ca3af' }}>●</span> Drowsy</span>
                </div>
              </div>

              {/* Right: Analysis cards */}
              <div style={{ flex: 1, minWidth: 0, padding: '16px', overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Mental state header */}
                <div style={{
                  padding: '12px', borderRadius: '10px', textAlign: 'center',
                  background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
                }}>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: '#a78bfa', marginBottom: '4px' }}>
                    {sRes.mostFrequent === 'alpha' ? '🧘 Deep Relaxation' :
                     sRes.mostFrequent === 'theta' ? '🛌 Profound Meditation' :
                     sRes.mostFrequent === 'beta'  ? '🎯 Active Focus' :
                     sRes.mostFrequent === 'delta' ? '💤 Restful State' : '⚪ Balanced State'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Primary mental state during session</div>
                </div>

                {/* Summary grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                  {[
                    ['Dominant State', sRes.mostFrequent, 'rgba(99,102,241,0.1)', 'rgba(99,102,241,0.2)', '#818cf8'],
                    ['Duration', sRes.formattedDuration, 'rgba(6,182,212,0.1)', 'rgba(6,182,212,0.2)', '#22d3ee'],
                    ['Brain Symmetry', sRes.symmetry, 'rgba(52,211,153,0.1)', 'rgba(52,211,153,0.2)', '#34d399'],
                  ].map(([label, val, bg, border, color]) => (
                    <div key={label} style={{ padding: '10px 6px', textAlign: 'center', borderRadius: '8px', background: bg, border: `1px solid ${border}` }}>
                      <div style={{ fontSize: '8.5px', fontWeight: 600, color, textTransform: 'uppercase', marginBottom: '4px' }}>{label}</div>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{val}</div>
                    </div>
                  ))}
                </div>

                {/* Brainwave analysis */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#60a5fa', marginBottom: '8px' }}>🧠 Brainwave Breakdown</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    {Object.entries(sRes.statePercentages).map(([state, pct]) => (
                      <div key={state} style={{
                        display: 'flex', justifyContent: 'space-between', padding: '7px 10px',
                        borderRadius: '6px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
                        fontSize: '11px',
                      }}>
                        <span style={{ color: 'rgba(255,255,255,0.6)' }}>{state}</span>
                        <span style={{ fontWeight: 700, color: '#facc15' }}>{pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HRV + BPM averages */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                  <div style={{ padding: '10px', textAlign: 'center', borderRadius: '8px', background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.2)' }}>
                    <div style={{ fontSize: '8.5px', fontWeight: 600, color: '#f472b6', textTransform: 'uppercase', marginBottom: '3px' }}>Average HRV</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{sRes.averageHRV ?? '—'} ms</div>
                  </div>
                  <div style={{ padding: '10px', textAlign: 'center', borderRadius: '8px', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.2)' }}>
                    <div style={{ fontSize: '8.5px', fontWeight: 600, color: '#f87171', textTransform: 'uppercase', marginBottom: '3px' }}>Average BPM</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{sRes.averageBPM ?? '—'}</div>
                  </div>
                </div>

                {/* Performance */}
                <div style={{
                  padding: '10px', textAlign: 'center', borderRadius: '8px',
                  background: Number(sRes.goodMeditationPct) >= 75 ? 'rgba(52,211,153,0.1)' : Number(sRes.goodMeditationPct) >= 50 ? 'rgba(250,204,21,0.1)' : 'rgba(248,113,113,0.08)',
                  border: `1px solid ${Number(sRes.goodMeditationPct) >= 75 ? 'rgba(52,211,153,0.2)' : Number(sRes.goodMeditationPct) >= 50 ? 'rgba(250,204,21,0.2)' : 'rgba(248,113,113,0.15)'}`,
                }}>
                  <div style={{ fontSize: '13px', fontWeight: 800, color: Number(sRes.goodMeditationPct) >= 75 ? '#34d399' : Number(sRes.goodMeditationPct) >= 50 ? '#facc15' : '#f87171' }}>
                    {Number(sRes.goodMeditationPct) >= 75 ? '🌟 Excellent Session!' : Number(sRes.goodMeditationPct) >= 50 ? '🌿 Great Progress!' : '⚠️ Keep Practicing!'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.45)', marginTop: '4px' }}>
                    {Number(sRes.goodMeditationPct) >= 75
                      ? `You spent ${Math.round(Number(sRes.goodMeditationPct))}% in a strong meditative state.`
                      : Number(sRes.goodMeditationPct) >= 50
                        ? `You spent ${Math.round(Number(sRes.goodMeditationPct))}% in a good meditation state.`
                        : 'You are building your meditation foundation. Keep going!'}
                  </div>
                </div>

                {/* Insight */}
                <div style={{ padding: '12px', borderRadius: '8px', background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.15)', fontSize: '11px', lineHeight: 1.6, color: 'rgba(255,255,255,0.7)' }}>
                  <div style={{ fontWeight: 700, color: '#facc15', marginBottom: '6px' }}>📊 Session Insights</div>
                  <p style={{ margin: '0 0 4px' }}>
                    <strong>State Analysis:</strong> {sRes.stateDescription}
                  </p>
                  <p style={{ margin: '0 0 4px' }}>
                    <strong>Brain Balance:</strong> Your session {sRes.symmetry.toLowerCase()}.
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Recommendation:</strong> {
                      Number(sRes.statePercentages.Focused) > 30
                        ? 'Consider focusing on breath awareness to reduce mental chatter.'
                        : Number(sRes.statePercentages.Meditation) > 40
                          ? 'Excellent deep meditation achieved! You are developing strong mindfulness skills.'
                          : 'Good foundation building. Regular practice will deepen your meditative states.'
                    }
                  </p>
                </div>

                {/* Close button */}
                <button
                  onClick={() => setShowResultsModal(false)}
                  style={{
                    width: '100%', padding: '10px 0', borderRadius: '8px',
                    border: 'none', background: 'var(--primary)', color: '#000',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    marginTop: '4px',
                  }}
                >
                  Close Results
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
