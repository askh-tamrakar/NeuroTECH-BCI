// SignalChart.jsx
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useCallback } from 'react'
import { ChartSpline, ZoomIn, ArrowUpDown, ArrowDown, ArrowUp, Sigma, Clock, Minus, Plus, Activity, ChevronUp, ChevronDown, Heart } from 'lucide-react'
import ElasticSlider from '../ui/inputs/ElasticSlider'
import { useTheme } from '../../contexts/ThemeContext'
import { useHeartbeatAudio } from '../../hooks/useHeartbeatAudio'
import '../../styles/live/SignalChart.css'

// ── ECG helpers ─────────────────────────────────────────────────────
function ecgBpmColor(bpm) {
  if (!bpm) return 'var(--muted)'
  if (bpm < 60)  return '#3b82f6'
  if (bpm < 100) return '#22c55e'
  return '#ef4444'
}
function ecgZoneLabel(bpm) {
  if (!bpm) return 'NO SIGNAL'
  if (bpm < 60)  return 'BRADYCARDIA'
  if (bpm < 100) return 'NORMAL SINUS'
  return 'TACHYCARDIA'
}
function ecgQualityLabel(q) {
  if (!q || q < 0.3) return { text: 'POOR',   color: '#ef4444' }
  if (q < 0.7)       return { text: 'FAIR',   color: '#f59e0b' }
  return                    { text: 'GOOD',   color: '#22c55e' }
}

const DEFAULT_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#06d6a0'
]

const getPrevGoodRange = (val) => {
  if (val <= 1) return 1;
  const target = val * 0.98; // 2% reduction leeway
  let power = Math.floor(Math.log10(target));
  let fraction = target / Math.pow(10, power);

  if (fraction < 1.0) {
    power -= 1;
    fraction = target / Math.pow(10, power);
  }

  let niceFraction;
  if (fraction >= 10.0) niceFraction = 10.0;
  else if (fraction >= 7.5) niceFraction = 7.5;
  else if (fraction >= 5.0) niceFraction = 5.0;
  else if (fraction >= 4.0) niceFraction = 4.0;
  else if (fraction >= 3.0) niceFraction = 3.0;
  else if (fraction >= 2.5) niceFraction = 2.5;
  else if (fraction >= 2.0) niceFraction = 2.0;
  else if (fraction >= 1.5) niceFraction = 1.5;
  else if (fraction >= 1.25) niceFraction = 1.25;
  else niceFraction = 1.0;

  return parseFloat((niceFraction * Math.pow(10, power)).toPrecision(15));
};

const getNextGoodRange = (val) => {
  if (val <= 0) return 1;
  const padded = val * 1.02; // 2% padding margin
  const power = Math.floor(Math.log10(padded));
  const fraction = padded / Math.pow(10, power);

  let niceFraction;
  if (fraction <= 1.0) niceFraction = 1.0;
  else if (fraction <= 1.25) niceFraction = 1.25;
  else if (fraction <= 1.5) niceFraction = 1.5;
  else if (fraction <= 2.0) niceFraction = 2.0;
  else if (fraction <= 2.5) niceFraction = 2.5;
  else if (fraction <= 3.0) niceFraction = 3.0;
  else if (fraction <= 4.0) niceFraction = 4.0;
  else if (fraction <= 5.0) niceFraction = 5.0;
  else if (fraction <= 7.5) niceFraction = 7.5;
  else niceFraction = 10.0;

  // Format to avoid floating point precision issues
  return parseFloat((niceFraction * Math.pow(10, power)).toPrecision(15));
};

const SignalChart = forwardRef(({
  graphNo,
  title,
  color = '#3b82f6',
  timeWindowMs = 10000,
  height = 300,
  showGrid = true,
  annotations = [],
  markedWindows = [],
  currentZoom = 1,
  currentManual = "",
  onZoomChange = null,
  onTimeWindowChange = null,
  onRangeChange = null,
  onColorChange = null,
  disabled = false,
  channelIndex = -1,
  activeSensor,
  displayMode = 'raw',
  smoothing = true,
  titleAddon = null,
  wsEvent = null
}, ref) => {

  const containerRef = useRef(null)
  const workerRef = useRef(null)

  const [stats, setStats] = useState({ min: 0, max: 0, mean: 0 })
  const [autoScaledRange, setAutoScaledRange] = useState(null)
  const { currentTheme } = useTheme() || {};

  // ── ECG overlay state ──────────────────────────────────────────────
  const [ecgStats, setEcgStats] = useState({ bpm: null, rr_ms: null, rr_sdnn: null, signal_quality: 0 })
  const lastHeartbeatRef = useRef(null)
  const { playBeat, prime } = useHeartbeatAudio(0.65)

  // Initialize Worker
  useEffect(() => {
    if (!containerRef.current) return;

    let canvas = null;

    if (!workerRef.current) {
      // Dynamically create canvas to avoid React StrictMode DOM reuse issues with OffscreenCanvas
      canvas = document.createElement('canvas');
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'block';
      canvas.style.margin = '0';
      canvas.style.padding = '0';
      containerRef.current.prepend(canvas);

      if (!canvas.transferControlToOffscreen) {
        console.error("OffscreenCanvas not supported!");
        return;
      }

      try {
        const worker = new Worker(new URL('../../workers/signal.worker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        const offscreen = canvas.transferControlToOffscreen();

        worker.postMessage({
          type: 'INIT',
          payload: {
            canvas: offscreen,
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
            config: {
              timeWindowMs,
              color,
              themeAxisColor: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#aaaaaa',
              zoom: currentZoom,
              manualRange: autoScaledRange || currentManual,
              showGrid,
              channelIndex,
              disabled,
              activeSensor,
              displayMode,
              smoothing
            }
          }
        }, [offscreen]);

        worker.onmessage = (e) => {
          const { type, payload } = e.data;
          if (type === 'STATS') {
            // Update local state less frequently, or rely on worker throttling
            setStats({ min: payload.min || 0, max: payload.max || 0, mean: payload.mean || 0 });
          }
        };
      }
      catch (err) {
        console.error("Failed to init worker:", err);
      }
    }

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        if (workerRef.current) {
          workerRef.current.postMessage({
            type: 'RESIZE',
            payload: { width, height }
          });
        }
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      if (workerRef.current) {
        // We must ALWAYS terminate the worker when the component unmounts
        // or during strict mode re-renders, otherwise multiple workers
        // will pile up in the background and crash the browser context limits.
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (canvas && containerRef.current && containerRef.current.contains(canvas)) {
        containerRef.current.removeChild(canvas);
      }
      observer.disconnect();
    };
  }, []); // init only once

  // Sync Config Updates
  useEffect(() => {
    if (workerRef.current) {
      const style = getComputedStyle(document.documentElement);
      const gridColor = style.getPropertyValue('--graph-grid').trim() || 'rgba(255, 255, 255, 0.1)';
      const textColor = style.getPropertyValue('--graph-text').trim() || '#9ca3af';

      workerRef.current.postMessage({
        type: 'SET_CONFIG',
        payload: {
          timeWindowMs,
          color,
          themeAxisColor: textColor,
          themeGridColor: gridColor,
          zoom: currentZoom,
          manualRange: autoScaledRange || currentManual,
          showGrid,
          channelIndex,
          disabled,
          activeSensor,
          displayMode,
          smoothing
        }
      });
    }
  }, [timeWindowMs, color, currentZoom, currentManual, autoScaledRange, showGrid, currentTheme, disabled, activeSensor, displayMode, smoothing]);

  // Sync Annotations
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'SET_ANNOTATIONS',
        payload: annotations
      });
    }
  }, [annotations]);

  // Handle Disabled State (Clear chart so it doesn't leave frozen data)
  useEffect(() => {
    if (disabled && workerRef.current) {
      workerRef.current.postMessage({ type: 'CLEAR_DATA' });
    }
  }, [disabled]);

  // Sync Windows
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'SET_WINDOWS',
        payload: markedWindows
      });
    }
  }, [markedWindows]);


  useImperativeHandle(ref, () => ({
    addData: (points) => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'ADD_DATA', payload: points });
      }
    },
    clearData: () => {
      if (workerRef.current) {
        workerRef.current.postMessage({ type: 'CLEAR_DATA' });
      }
      setStats({ min: 0, max: 0, mean: 0 });
    }
  }));

  // Clear auto-scaled range if manual config changes
  useEffect(() => {
    setAutoScaledRange(null);
  }, [currentManual, currentZoom]);

  const effectiveRangeStr = autoScaledRange || currentManual;
  const yDomainRaw = parseFloat(effectiveRangeStr);
  let rangeDisplay = isNaN(yDomainRaw) ? Math.round(1500 / currentZoom).toString() : yDomainRaw.toString();

  // ── ECG: ingest wsEvent for overlay data + heartbeat sound ──────────
  useEffect(() => {
    if (!wsEvent || activeSensor !== 'ECG') return

    // ECG features → update overlay
    if (wsEvent.event === 'ecg_prediction' || wsEvent.type === 'ecg_prediction') {
      const f = wsEvent.features ?? {}
      setEcgStats({
        bpm:            f.bpm            ?? null,
        rr_ms:          f.rr_ms          ?? null,
        rr_sdnn:        f.rr_sdnn        ?? null,
        signal_quality: f.signal_quality ?? 0,
      })
    }

    // Heartbeat event → play the thump sound
    if (wsEvent.event === 'Heartbeat') {
      // Deduplicate: ignore if same event object fires twice
      if (lastHeartbeatRef.current !== wsEvent) {
        lastHeartbeatRef.current = wsEvent
        playBeat()
      }
    }
  }, [wsEvent, activeSensor, playBeat]);

  // Prime AudioContext on first pointer-down inside this chart
  const handlePointerDown = useCallback(() => {
    if (activeSensor === 'ECG') prime()
  }, [activeSensor, prime])

  return (
    <div className={`signal-chart-container ${disabled ? 'signal-chart-disabled' : ''}`}>
      <div className="chart-header">
        {/* Left: Title and Color */}
        <div className="flex items-center gap-4 min-w-0">
          <h3 className="chart-title" style={{ position: 'relative' }}>
            <button
              onClick={(e) => {
                e.preventDefault()
                if (onColorChange) {
                  const currentIndex = DEFAULT_PALETTE.indexOf(color)
                  const nextIndex = (currentIndex + 1) % DEFAULT_PALETTE.length
                  onColorChange(DEFAULT_PALETTE[nextIndex === -1 ? 0 : nextIndex])
                }
              }}
              className="p-1 hover:bg-muted/10 rounded-full transition-colors cursor-pointer group"
              title="Click to Cycle Color"
            >
              <ChartSpline
                size={32}
                strokeWidth={3}
                style={{ color: color }}
                className="mr-2 group-hover:scale-110 transition-transform"
              />
            </button>
            <span className="flex items-center gap-2 shrink-0">
              {graphNo}
              <span className="channel-color-dot" style={{ backgroundColor: color }}></span>
              {title}
            </span>
          </h3>
          <div className="flex items-center">{titleAddon}</div>
        </div>

        {/* Middle: Controls Box */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted">
              <Clock size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Time</span>
            </div>
            <div className="w-48">
              <ElasticSlider
                defaultValue={(timeWindowMs || 10000) / 1000}
                startingValue={1}
                maxValue={20}
                stepSize={1}
                isStepped={true}
                onChange={(val) => onTimeWindowChange && onTimeWindowChange(val * 1000)}
                leftIcon={<Minus size={16} className="text-muted" />}
                rightIcon={<Plus size={16} className="text-muted" />}
                className="w-full h-5"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted">
              <ZoomIn size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Zoom</span>
            </div>
            <div className="flex gap-1.5 bg-bg/50 p-1.5 rounded-lg">
              {[1, 2, 5, 10, 20, 50].map((z) => (
                <button
                  key={z}
                  onClick={() => onZoomChange && onZoomChange(z)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition-all border ${currentZoom === z
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-bg text-muted border-border hover:text-text hover:border-muted/50'
                    }`}
                >
                  {z}x
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-muted">
              <ArrowUpDown size={18} />
              <span className="text-xs font-bold uppercase tracking-wider">Range</span>
            </div>
            <div className="flex items-center bg-bg/50 border border-border rounded-lg overflow-hidden focus-within:border-primary transition-colors h-8">
              <input
                type="number"
                value={currentManual}
                placeholder={Math.round(1500 / currentZoom).toString()}
                onChange={(e) => onRangeChange && onRangeChange(e.target.value)}
                className="w-14 bg-transparent px-0 py-1 text-[16px] font-mono font-bold text-primary focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <div className="text-[16px] font-bold text-muted pointer-events-none pr-2">uV</div>
              <div className="flex flex-col border-l border-border h-full">
                <button
                  onClick={() => {
                    const val = parseFloat(currentManual) || Math.round(1500 / currentZoom);
                    onRangeChange && onRangeChange(getNextGoodRange(val).toString());
                  }}
                  className="flex-1 flex items-center justify-center px-1.5 hover:bg-muted/10 text-muted hover:text-text transition-colors border-b border-border outline-none focus:outline-none"
                >
                  <ChevronUp size={14} strokeWidth={4} />
                </button>
                <button
                  onClick={() => {
                    const val = parseFloat(currentManual) || Math.round(1500 / currentZoom);
                    onRangeChange && onRangeChange(getPrevGoodRange(val).toString());
                  }}
                  className="flex-1 flex items-center justify-center px-1.5 hover:bg-muted/10 text-muted hover:text-text transition-colors outline-none focus:outline-none"
                >
                  <ChevronDown size={14} strokeWidth={4} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Stats Box */}
        <div className="flex items-center gap-4 pl-4 border-l border-border">
          <div className="range-display text-[16px] font-bold text-muted tabular-nums">
            +/-{rangeDisplay} uV
          </div>
          <div className="chart-stats flex gap-5">
            <div className="stat-item flex items-center gap-0.25">
              <span className="stat-label-chart flex items-center gap-1 text-xs text-muted"><ArrowDown size={18} /> Min</span>
              <span className="stat-value text-sm font-mono font-bold">{stats.min.toFixed(2)}</span>
            </div>
            <div className="stat-item flex items-center gap-0.25">
              <span className="stat-label-chart flex items-center gap-1 text-xs text-muted"><ArrowUp size={18} /> Max</span>
              <span className="stat-value text-sm font-mono font-bold">{stats.max.toFixed(2)}</span>
            </div>
            <div className="stat-item flex items-center gap-0.25">
              <span className="stat-label-chart flex items-center gap-1 text-xs text-muted"><Sigma size={18} /> Mean</span>
              <span className="stat-value text-sm font-mono font-bold">{stats.mean.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="chart-area flex-grow relative" style={{ minHeight: 0, overflow: 'hidden', margin: 0, padding: 0 }} ref={containerRef} onPointerDown={handlePointerDown}>

        {/* Centered Static Labels Overlay */}
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          fontFamily: 'sans-serif',
          fontSize: '12px',
          fontWeight: 'bold',
          pointerEvents: 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: color }}>
            <Activity size={14} color={color} /> ACTIVE
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: color, opacity: 0.4 }}>
            <Clock size={14} color={color} /> HISTORY
          </div>
        </div>

        {/* ECG Info Overlay — top-right corner, only when ECG sensor is active */}
        {activeSensor === 'ECG' && (() => {
          const bpmColor = ecgBpmColor(ecgStats.bpm)
          const zone     = ecgZoneLabel(ecgStats.bpm)
          const quality  = ecgQualityLabel(ecgStats.signal_quality)
          return (
            <div className="ecg-overlay-box" style={{ pointerEvents: 'none' }}>
              {/* BPM — headline number */}
              <div className="ecg-overlay-bpm" style={{ color: bpmColor }}>
                <Heart size={14} fill={bpmColor} strokeWidth={0} style={{ flexShrink: 0 }} />
                <span className="ecg-bpm-value">{ecgStats.bpm != null ? Math.round(ecgStats.bpm) : '—'}</span>
                <span className="ecg-bpm-unit">BPM</span>
              </div>

              <div className="ecg-overlay-zone" style={{ color: bpmColor }}>{zone}</div>

              <div className="ecg-overlay-divider" />

              <div className="ecg-overlay-row">
                <span className="ecg-ol-label">RR</span>
                <span className="ecg-ol-value">{ecgStats.rr_ms != null ? `${Math.round(ecgStats.rr_ms)} ms` : '—'}</span>
              </div>
              <div className="ecg-overlay-row">
                <span className="ecg-ol-label">HRV</span>
                <span className="ecg-ol-value">{ecgStats.rr_sdnn != null ? `${ecgStats.rr_sdnn.toFixed(0)} ms` : '—'}</span>
              </div>
              <div className="ecg-overlay-row">
                <span className="ecg-ol-label">QUALITY</span>
                <span className="ecg-ol-value" style={{ color: quality.color }}>{quality.text}</span>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
})

export default SignalChart
