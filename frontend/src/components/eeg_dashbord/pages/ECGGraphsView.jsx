import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, Brain, Download, Heart, Pause, Play,
  Volume2, VolumeX, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { useSidebar } from './SidebarContext';
import ECGGraphsSidebar from '../sidebar/ECGGraphsSidebar';

/* ── Constants ──────────────────────────────── */
const WINDOW_SECS    = 8;
const HISTORY_PTS    = 4096;
const GAIN_PRESETS   = [0.5, 1, 2, 4];
const YRANGE_DEFAULT = 60;

const BAND_COLORS = ['#4f8eff', '#a855f7', '#22c55e', '#00e5ff', '#f59e0b'];
const BAND_LABELS = ['Delta', 'Theta', 'Alpha', 'Beta', 'Gamma'];

const STATE_STYLES = {
  Focus:    { bg: 'rgba(14,165,233,0.15)',  border: 'rgba(14,165,233,0.4)',  text: '#0ea5e9' },
  Calm:     { bg: 'rgba(168,85,247,0.15)',  border: 'rgba(168,85,247,0.4)',  text: '#a855f7' },
  Relaxed:  { bg: 'rgba(34,197,94,0.15)',   border: 'rgba(34,197,94,0.4)',   text: '#22c55e' },
  Stressed: { bg: 'rgba(244,63,94,0.15)',   border: 'rgba(244,63,94,0.4)',   text: '#f43f5e' },
  Drowsy:   { bg: 'rgba(245,158,11,0.15)',  border: 'rgba(245,158,11,0.4)',  text: '#f59e0b' },
  Neutral:  { bg: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.3)', text: '#94a3b8' },
};

/* ── BPM colour helpers ─────────────────────── */
function bpmColor(bpm) {
  if (!bpm)      return 'var(--muted)';
  if (bpm < 60)  return '#3b82f6';
  if (bpm < 100) return '#22c55e';
  return '#ef4444';
}
function bpmZone(bpm) {
  if (!bpm)      return 'NO SIGNAL';
  if (bpm < 60)  return 'BRADYCARDIA';
  if (bpm < 100) return 'NORMAL';
  return 'TACHYCARDIA';
}
function hrvState(sdnn) {
  if (!sdnn)     return { label: '—',        color: 'var(--muted)' };
  if (sdnn < 20) return { label: 'STRESSED',  color: '#ef4444' };
  if (sdnn < 50) return { label: 'BALANCED',  color: '#f59e0b' };
  return               { label: 'RELAXED',   color: '#22c55e' };
}

/* ═══════════════════════════════════════════════
   PENTA RADAR — Canvas pentagon chart
   ═══════════════════════════════════════════════ */
function PentaRadar({ bandPowers }) {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const bandsRef  = useRef([0.2, 0.2, 0.25, 0.2, 0.15]);

  useEffect(() => {
    const total  = Math.max(1e-6, bandPowers.delta + bandPowers.theta + bandPowers.alpha + bandPowers.beta + bandPowers.gamma);
    const target = [
      bandPowers.delta / total, bandPowers.theta / total, bandPowers.alpha / total,
      bandPowers.beta  / total, bandPowers.gamma / total,
    ];
    const alpha = 0.12;

    const loop = () => {
      const prev = bandsRef.current;
      for (let i = 0; i < 5; i++) prev[i] = prev[i] + alpha * (target[i] - prev[i]);
      draw(prev);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [bandPowers]);

  function draw(bands) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const W = c.width, H = c.height;
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.36;
    const n  = 5;
    const angles = Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 - Math.PI / 2);

    const INNER = 0.10;
    [INNER, INNER + 0.225, INNER + 0.45, INNER + 0.675, 1.0].forEach(frac => {
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = cx + Math.cos(a) * R * frac;
        const y = cy + Math.sin(a) * R * frac;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.strokeStyle = frac === 1.0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.lineWidth   = frac === 1.0 ? 1 : 0.5;
      ctx.stroke();
    });

    angles.forEach(a => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.stroke();
    });

    ctx.beginPath();
    angles.forEach((a, i) => {
      const r = (INNER + bands[i] * (1 - INNER)) * R;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, 'rgba(0,255,200,0.25)');
    grad.addColorStop(1, 'rgba(0,255,200,0.03)');
    ctx.fillStyle   = grad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,255,200,0.7)';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    angles.forEach((a, i) => {
      const r  = (INNER + bands[i] * (1 - INNER)) * R;
      const x  = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle  = BAND_COLORS[i];
      ctx.shadowBlur = 10; ctx.shadowColor = BAND_COLORS[i];
      ctx.fill(); ctx.shadowBlur = 0;

      const lx = cx + Math.cos(a) * (R + 18), ly = cy + Math.sin(a) * (R + 18);
      ctx.font          = 'bold 10px monospace';
      ctx.textAlign     = 'center';
      ctx.textBaseline  = 'middle';
      ctx.fillStyle     = BAND_COLORS[i];
      ctx.fillText(BAND_LABELS[i], lx, ly);
    });
  }

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = canvasRef.current;
      if (!c || !c.parentElement) return;
      const r   = c.parentElement.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width  = r.width  * dpr;
      c.height = r.height * dpr;
      c.style.width  = r.width  + 'px';
      c.style.height = r.height + 'px';
    });
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    return () => ro.disconnect();
  }, []);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
}

/* ═══════════════════════════════════════════════
   ECG CANVAS — Canvas real-time ECG waveform
   ═══════════════════════════════════════════════ */
function ECGCanvas({ ptsRef, gainIdx, bpm, paused }) {
  const canvasRef    = useRef(null);
  const rafRef       = useRef(null);
  const yRangeRef    = useRef(YRANGE_DEFAULT);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) { rafRef.current = requestAnimationFrame(draw); return; }
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const now  = Date.now();
    const tMin = now - WINDOW_SECS * 1000;
    const gain = GAIN_PRESETS[gainIdx];
    const pts  = ptsRef.current.filter(p => p.t >= tMin);

    if (pts.length > 0) {
      const rawMax = Math.max(...pts.map(p => Math.abs(p.value)), 1);
      yRangeRef.current = Math.max(yRangeRef.current, rawMax * 1.15);
    }
    const yRange = Math.max(yRangeRef.current, YRANGE_DEFAULT) * (1 / gain);

    const toPx = t => ((t - tMin) / (WINDOW_SECS * 1000)) * W;
    const toY  = v => H / 2 - (v * gain / yRange) * (H / 2 - 10);

    /* Grid */
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let s = 0; s <= WINDOW_SECS; s++) {
      const x = (s / WINDOW_SECS) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let row = 1; row < 4; row++) {
      const y = (row / 4) * H;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    /* Baseline */
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth   = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    /* ECG trace */
    if (pts.length >= 2) {
      const color     = bpmColor(bpm);
      ctx.strokeStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 7;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const x = toPx(p.t), y = toY(p.value);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      /* No-signal placeholder */
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth   = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle    = 'rgba(255,255,255,0.15)';
      ctx.font         = 'bold 11px monospace';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Waiting for ECG signal…', W / 2, H / 2 - 14);
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [gainIdx, bpm, ptsRef]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
      {paused && (
        <div className="absolute top-2 right-3 text-[0.63rem] font-black tracking-wider
          bg-amber-500/15 border border-amber-500/40 text-amber-400 px-2 py-0.5 rounded">
          PAUSED
        </div>
      )}
      <div className="absolute bottom-2 left-3 text-[0.65rem] font-black text-[var(--muted)] tracking-wide">
        ×{GAIN_PRESETS[gainIdx]}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   EEG BAND TIMELINE — Recharts line chart
   ═══════════════════════════════════════════════ */
function EEGWaveform({ history }) {
  if (!history || history.length < 2) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted)]/30 text-xs font-mono">
        Waiting for EEG data…
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={history} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
        <XAxis dataKey="t" stroke="#444" tick={{ fill: '#555', fontSize: 8 }} tickCount={5} />
        <YAxis stroke="#444" tick={{ fill: '#555', fontSize: 8 }} tickFormatter={v => v.toFixed(1)} width={32} />
        <Tooltip
          contentStyle={{ backgroundColor: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px' }}
          labelStyle={{ color: '#fff', fontSize: 10 }}
          formatter={v => [Number(v).toFixed(2), '']}
        />
        {BAND_LABELS.map((label, i) => (
          <Line key={label} type="monotone" dataKey={label.toLowerCase()} stroke={BAND_COLORS[i]}
            strokeWidth={1.2} dot={false} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ═══════════════════════════════════════════════
   MAIN ECG GRAPHS VIEW
   ═══════════════════════════════════════════════ */
export default function ECGGraphsView({ result, wsEvent, wsMessage, onBackToMenu }) {
  const [paused,  setPaused]  = useState(false);
  const [gainIdx, setGainIdx] = useState(1);
  const [soundOn, setSoundOn] = useState(true);

  /* ECG raw pts buffer */
  const ptsRef       = useRef([]);

  /* ECG metadata */
  const [ecgMeta, setEcgMeta] = useState({ bpm: null, rr_ms: null, rr_sdnn: null, signal_quality: 0 });

  /* BPM session stats */
  const bpmHistRef = useRef([]);
  const [bpmStats, setBpmStats] = useState({ low: null, avg: null, high: null });

  /* HRV session stats */
  const sdnnHistRef = useRef([]);
  const [hrvStats, setHrvStats] = useState({ low: null, avg: null, high: null });

  /* EEG */
  const [bandPowers, setBandPowers] = useState({ delta: 20, theta: 20, alpha: 25, beta: 20, gamma: 15 });
  const [eegHistory, setEegHistory]  = useState([]);
  const [mindState,  setMindState]   = useState({ state: 'Neutral', level: 0 });

  const { setSidebarSlot, setSidebarMode } = useSidebar();

  /* ── Ingest ECG metadata from wsEvent ────── */
  useEffect(() => {
    if (!wsEvent || paused) return;
    if (wsEvent.event === 'ecg_prediction' || wsEvent.type === 'ecg_prediction') {
      const f    = wsEvent.features ?? {};
      const bpm  = f.bpm     ?? null;
      const sdnn = f.rr_sdnn ?? null;
      setEcgMeta({ bpm, rr_ms: f.rr_ms ?? null, rr_sdnn: sdnn, signal_quality: f.signal_quality ?? 0 });

      if (bpm != null) {
        bpmHistRef.current.push(bpm);
        if (bpmHistRef.current.length > 300) bpmHistRef.current = bpmHistRef.current.slice(-300);
        const arr = bpmHistRef.current;
        setBpmStats({
          low:  Math.round(Math.min(...arr)),
          avg:  Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
          high: Math.round(Math.max(...arr)),
        });
      }
      if (sdnn != null) {
        sdnnHistRef.current.push(sdnn);
        if (sdnnHistRef.current.length > 300) sdnnHistRef.current = sdnnHistRef.current.slice(-300);
        const arr = sdnnHistRef.current;
        setHrvStats({
          low:  Math.round(Math.min(...arr)),
          avg:  Math.round(arr.reduce((a, b) => a + b, 0) / arr.length),
          high: Math.round(Math.max(...arr)),
        });
      }
    }
    /* EEG from same stream */
    const out = wsEvent.output || wsEvent;
    if (out.state)       setMindState({ state: out.state, level: out.state_level ?? 0 });
    if (out.band_powers) {
      const bp = out.band_powers;
      setBandPowers({ delta: bp.delta ?? 0, theta: bp.theta ?? 0, alpha: bp.alpha ?? 0, beta: bp.beta ?? 0, gamma: bp.gamma ?? 0 });
      const t = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setEegHistory(prev => {
        const next = [...prev, { t, delta: bp.delta ?? 0, theta: bp.theta ?? 0, alpha: bp.alpha ?? 0, beta: bp.beta ?? 0, gamma: bp.gamma ?? 0 }];
        return next.length > 60 ? next.slice(-60) : next;
      });
    }
  }, [wsEvent, paused]);

  /* ── Sync EEG result prop ────────────────── */
  useEffect(() => {
    if (!result) return;
    if (result.state)       setMindState({ state: result.state, level: result.state_level ?? 0 });
    if (result.band_powers) {
      const bp = result.band_powers;
      setBandPowers({ delta: bp.delta ?? 0, theta: bp.theta ?? 0, alpha: bp.alpha ?? 0, beta: bp.beta ?? 0, gamma: bp.gamma ?? 0 });
    }
  }, [result]);

  /* ── Ingest raw ECG waveform from wsMessage ─ */
  useEffect(() => {
    if (!wsMessage || paused) return;
    const batch = wsMessage.raw?._batch;
    if (!batch?.length) return;
    const sr             = wsMessage.raw?.sample_rate || 512;
    const now            = Date.now();
    const batchDurMs     = (batch.length / sr) * 1000;
    const batchStartMs   = now - batchDurMs;
    batch.forEach((sample, i) => {
      const t        = batchStartMs + (i / batch.length) * batchDurMs;
      const channels = sample.channels || {};
      for (const chData of Object.values(channels)) {
        if ((chData.type || '').toUpperCase() === 'ECG') {
          ptsRef.current.push({ t, value: chData.value });
          break;
        }
      }
    });
    if (ptsRef.current.length > HISTORY_PTS) ptsRef.current = ptsRef.current.slice(-HISTORY_PTS);
  }, [wsMessage, paused]);

  /* ── Sidebar ─────────────────────────────── */
  const handleClear = useCallback(() => {
    ptsRef.current     = [];
    bpmHistRef.current = [];
    sdnnHistRef.current = [];
    setBpmStats({ low: null, avg: null, high: null });
    setHrvStats({ low: null, avg: null, high: null });
  }, []);

  useEffect(() => {
    setSidebarMode('page');
    return () => setSidebarSlot(null);
  }, []);

  useEffect(() => {
    setSidebarSlot(
      <ECGGraphsSidebar
        paused={paused}          onTogglePause={() => setPaused(p => !p)}
        gainIdx={gainIdx}        onGainDown={() => setGainIdx(i => Math.max(0, i - 1))}
        onGainUp={() => setGainIdx(i => Math.min(GAIN_PRESETS.length - 1, i + 1))}
        gainPresets={GAIN_PRESETS}
        soundOn={soundOn}        onToggleSound={() => setSoundOn(s => !s)}
        ecgMeta={ecgMeta}        bpmStats={bpmStats}
        onClear={handleClear}    onBackToMenu={onBackToMenu}
        mindState={mindState}    bandPowers={bandPowers}
      />
    );
  }, [paused, gainIdx, soundOn, ecgMeta, bpmStats, mindState, bandPowers, onBackToMenu, handleClear]);

  const bColor = bpmColor(ecgMeta.bpm);
  const hrv    = hrvState(ecgMeta.rr_sdnn);
  const st     = STATE_STYLES[mindState.state] || STATE_STYLES.Neutral;

  return (
    <div className="w-full h-full flex flex-col bg-[var(--bg)] overflow-hidden p-3 gap-2.5">

      {/* ══ TOP ROW: Brain Activity + Heart Activity ══ */}
      <div className="flex gap-2.5 shrink-0" style={{ height: '40%' }}>

        {/* ── Brain Activity (EEG) ── */}
        <div className="flex-1 rounded-2xl border border-[var(--border)]/30 bg-[var(--surface)]/20 p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Brain size={14} className="text-[var(--primary)]" />
              <div>
                <div className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text)]/80">Brain Activity</div>
                <div className="text-[7px] text-[var(--muted)]/40">Electroencephalogram (EEG)</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {BAND_LABELS.map((l, i) => (
                <div key={l} className="flex items-center gap-0.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: BAND_COLORS[i] }} />
                  <span className="text-[6px] font-mono" style={{ color: BAND_COLORS[i] }}>{l}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-1 min-h-0 gap-2">
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="text-[8px] text-[var(--primary)]/70 font-bold tracking-wider text-center shrink-0 mb-1">
                Left Hemisphere
              </div>
              <div className="flex-1 min-h-0"><PentaRadar bandPowers={bandPowers} /></div>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="text-[8px] text-[var(--primary)]/70 font-bold tracking-wider text-center shrink-0 mb-1">
                Right Hemisphere
              </div>
              <div className="flex-1 min-h-0"><PentaRadar bandPowers={bandPowers} /></div>
            </div>
          </div>
        </div>

        {/* ── Heart Activity (ECG) ── */}
        <div className="w-[330px] shrink-0 rounded-2xl border border-[var(--border)]/30 bg-[var(--surface)]/20 p-3 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Heart size={14} className="text-red-400" />
              <div>
                <div className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text)]/80">Heart Activity</div>
                <div className="text-[7px] text-[var(--muted)]/40">Electrocardiogram (ECG)</div>
              </div>
            </div>
          </div>

          {/* BPM + LOW/AVG/HIGH ── */}
          <div className="flex items-center gap-3 mb-2">
            {/* Current BPM */}
            <div className="flex flex-col items-center justify-center shrink-0 w-[72px]">
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-black font-mono tabular-nums leading-none" style={{ color: bColor }}>
                  {ecgMeta.bpm != null ? Math.round(ecgMeta.bpm) : '—'}
                </span>
                <span className="text-[9px] font-bold text-[var(--muted)]">BPM</span>
              </div>
              <span className="text-[7px] font-black tracking-wider mt-1 px-2 py-0.5 rounded-full border"
                style={{ color: bColor, borderColor: bColor + '55', backgroundColor: bColor + '12' }}>
                {bpmZone(ecgMeta.bpm)}
              </span>
            </div>

            {/* Session BPM Stats */}
            <div className="flex flex-col gap-1 flex-1">
              {[
                { label: 'LOW BPM',  val: bpmStats.low,  color: '#3b82f6' },
                { label: 'AVG BPM',  val: bpmStats.avg,  color: '#22c55e' },
                { label: 'HIGH BPM', val: bpmStats.high, color: '#ef4444' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between bg-[var(--bg)]/30 rounded-lg px-2 py-0.5">
                  <span className="text-[7px] font-black tracking-[1px] text-[var(--muted)]/60">{s.label}</span>
                  <span className="text-sm font-black font-mono tabular-nums" style={{ color: s.color }}>
                    {s.val != null ? s.val : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* HRV section ── */}
          <div className="border-t border-[var(--border)]/20 pt-2 grid grid-cols-4 gap-1">
            {[
              { label: 'LOW HRV',  val: hrvStats.low  != null ? hrvStats.low  : (ecgMeta.rr_sdnn ? Math.round(ecgMeta.rr_sdnn * 0.7) : null), unit: 'ms' },
              { label: 'AVG HRV',  val: hrvStats.avg  != null ? hrvStats.avg  : ecgMeta.rr_sdnn != null ? Math.round(ecgMeta.rr_sdnn) : null, unit: 'ms' },
              { label: 'HIGH HRV', val: hrvStats.high != null ? hrvStats.high : (ecgMeta.rr_sdnn ? Math.round(ecgMeta.rr_sdnn * 1.3) : null), unit: 'ms' },
              { label: 'State',    val: hrv.label,    color: hrv.color, isState: true },
            ].map(h => (
              <div key={h.label}
                className="flex flex-col items-center justify-center rounded-lg p-1.5 text-center"
                style={h.isState ? { border: `1px solid ${hrv.color}55`, backgroundColor: hrv.color + '12' } : { backgroundColor: 'rgba(0,0,0,0.2)' }}>
                <span className="text-[6px] font-black tracking-[1px] text-[var(--muted)]/50 leading-tight mb-0.5">{h.label}</span>
                <span className="text-[11px] font-black font-mono leading-none" style={{ color: h.color || 'var(--text)' }}>
                  {h.val != null ? h.val : '—'}
                  {h.unit && <span className="text-[6px] text-[var(--muted)]/40 ml-0.5">{h.unit}</span>}
                </span>
              </div>
            ))}
          </div>

          {/* Brain state badge */}
          <div className="mt-auto pt-2">
            <div className="rounded-lg px-3 py-1.5 text-center border"
              style={{ borderColor: st.border, backgroundColor: st.bg }}>
              <span className="text-[8px] font-black tracking-[2px] uppercase" style={{ color: st.text }}>
                {mindState.state} — {hrv.label !== '—' ? hrv.label : 'Analyzing…'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ══ BOTTOM ROWS: EEG Timeline + ECG Waveform ══ */}
      <div className="flex flex-col flex-1 min-h-0 gap-2.5">

        {/* ── EEG Band Power Timeline ── */}
        <div className="flex-1 min-h-0 rounded-2xl border border-[var(--border)]/30 bg-[var(--surface)]/20 p-3 flex flex-col">
          <div className="flex items-center gap-2 mb-1 shrink-0">
            <Activity size={12} className="text-[var(--primary)]" />
            <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text)]/80">
              EEG Band Power Timeline
            </span>
          </div>
          <div className="flex-1 min-h-0"><EEGWaveform history={eegHistory} /></div>
        </div>

        {/* ── ECG Waveform Canvas ── */}
        <div className="flex-1 min-h-0 rounded-2xl border border-[var(--border)]/30 bg-[var(--surface)]/20 p-3 flex flex-col">
          <div className="flex items-center gap-2 mb-1 shrink-0">
            <Heart size={12} className="text-red-400" />
            <span className="text-[9px] font-black uppercase tracking-[3px] text-[var(--text)]/80">ECG Waveform</span>
            <span className="text-[7px] text-[var(--muted)]/40 ml-0.5">{WINDOW_SECS}s window</span>

            {/* Inline toolbar */}
            <div className="ml-auto flex items-center gap-1.5">
              <button onClick={() => setPaused(p => !p)}
                className="flex items-center gap-1 text-[8px] font-bold px-2 py-1 rounded border border-[var(--border)]/30 hover:bg-[var(--surface)]/40 transition-all text-[var(--text)]">
                {paused ? <><Play size={10} /> Resume</> : <><Pause size={10} /> Pause</>}
              </button>
              <button onClick={() => setGainIdx(i => Math.max(0, i - 1))} disabled={gainIdx === 0}
                className="p-1 rounded border border-[var(--border)]/30 hover:bg-[var(--surface)]/40 disabled:opacity-30 text-[var(--text)] transition-all">
                <ZoomOut size={10} />
              </button>
              <span className="text-[8px] font-mono text-[var(--muted)] w-6 text-center">×{GAIN_PRESETS[gainIdx]}</span>
              <button onClick={() => setGainIdx(i => Math.min(GAIN_PRESETS.length - 1, i + 1))} disabled={gainIdx === GAIN_PRESETS.length - 1}
                className="p-1 rounded border border-[var(--border)]/30 hover:bg-[var(--surface)]/40 disabled:opacity-30 text-[var(--text)] transition-all">
                <ZoomIn size={10} />
              </button>
              <button onClick={() => setSoundOn(s => !s)}
                className="p-1 rounded border border-[var(--border)]/30 hover:bg-[var(--surface)]/40 transition-all text-[var(--text)]">
                {soundOn ? <Volume2 size={10} /> : <VolumeX size={10} />}
              </button>
              <button onClick={() => { ptsRef.current = []; }}
                className="text-[8px] font-bold px-2 py-1 rounded border border-[var(--border)]/30 hover:bg-[var(--surface)]/40 transition-all text-[var(--text)]">
                Clear
              </button>
            </div>
          </div>

          {/* Signal quality bar */}
          <div className="flex items-center gap-2 mb-1.5 shrink-0">
            <span className="text-[7px] text-[var(--muted)]/50">Signal</span>
            <div className="flex-1 h-1 bg-[var(--bg)]/60 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width:      `${(ecgMeta.signal_quality ?? 0) * 100}%`,
                  background: ecgMeta.signal_quality > 0.6 ? '#22c55e' : '#f59e0b',
                }} />
            </div>
            <span className="text-[7px] font-mono text-[var(--muted)]/50">
              {ecgMeta.signal_quality > 0.6 ? 'Good' : ecgMeta.signal_quality > 0.3 ? 'Fair' : 'Poor'}
            </span>
            {ecgMeta.rr_ms != null && (
              <span className="text-[7px] font-mono ml-1" style={{ color: bColor }}>
                RR: {Math.round(ecgMeta.rr_ms)} ms
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0">
            <ECGCanvas ptsRef={ptsRef} gainIdx={gainIdx} bpm={ecgMeta.bpm} paused={paused} />
          </div>
        </div>
      </div>
    </div>
  );
}
