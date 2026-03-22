// SignalChart.jsx
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { ChartSpline, ZoomIn, ArrowUpDown, ArrowDown, ArrowUp, Sigma, Clock, Minus, Plus, Activity, ChevronUp, ChevronDown } from 'lucide-react'
import ElasticSlider from '../ui/ElasticSlider'
import { useTheme } from '../../contexts/ThemeContext'
import '../../styles/live/SignalChart.css'

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
  channelIndex = -1
}, ref) => {

  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const workerRef = useRef(null)
  const isTransferred = useRef(false)

  const [stats, setStats] = useState({ min: 0, max: 0, mean: 0 })
  const [autoScaledRange, setAutoScaledRange] = useState(null)
  const { currentTheme } = useTheme() || {};

  // Initialize Worker
  useEffect(() => {
    if (!canvasRef.current || disabled) return;

    if (!workerRef.current) {
      if (!canvasRef.current.transferControlToOffscreen) {
        console.error("OffscreenCanvas not supported!");
        return;
      }

      try {
        const worker = new Worker(new URL('../../workers/signal.worker.js', import.meta.url), { type: 'module' });
        workerRef.current = worker;

        if (!isTransferred.current) {
          const offscreen = canvasRef.current.transferControlToOffscreen();
          isTransferred.current = true;

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
                channelIndex
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
      } catch (err) {
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
      // Don't auto-terminate on fast refreshes unless unmounting.
      // Strict mode makes this tricky, we'll keep it simple:
      if (workerRef.current && !isTransferred.current) {
        // If we handled strict mode cleanly, we terminate. 
        // Re-rendering unmounts components, we will terminate here
        workerRef.current.terminate();
        workerRef.current = null;
      }
      observer.disconnect();
    };
  }, [disabled]); // init only once or if disabled toggles

  // Sync Config Updates
  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'SET_CONFIG',
        payload: {
          timeWindowMs,
          color,
          themeAxisColor: getComputedStyle(document.documentElement).getPropertyValue('--muted').trim() || '#aaaaaa',
          zoom: currentZoom,
          manualRange: autoScaledRange || currentManual,
          showGrid,
          channelIndex
        }
      });
    }
  }, [timeWindowMs, color, currentZoom, currentManual, autoScaledRange, showGrid, currentTheme]);

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

  // Auto-range adjusting logic based on absolute maximum of signal
  useEffect(() => {
    // We only want to AUTO EXPAND. We do not shrink if max < range.
    const absMax = Math.max(Math.abs(stats.min), Math.abs(stats.max));
    const currentR = parseFloat(rangeDisplay);

    // ONLY auto-scale if the user hasn't explicitly zoomed in or set a manual range
    if (!isNaN(currentR) && absMax > currentR && currentZoom === 1 && !currentManual) {
      const nextRange = getNextGoodRange(absMax);
      if (nextRange > currentR) {
        setAutoScaledRange(nextRange.toString());
      }
    }
  }, [stats.min, stats.max, rangeDisplay, currentZoom, currentManual]);

  return (
    <div className={`signal-chart-container ${disabled ? 'signal-chart-disabled' : ''}`}>
      <div className="chart-header">
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
            <ChartSpline size={32} strokeWidth={3} style={{ color: color }} className="mr-2 group-hover:scale-110 transition-transform" />
          </button>
          {graphNo}
          <span className="channel-color-dot" style={{ backgroundColor: color }}></span>
          {title}
        </h3>

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
                maxValue={30}
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

      <div className="chart-area" style={{ minHeight: 0, overflow: 'hidden', position: 'relative', margin: 0, padding: 0 }} ref={containerRef}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', margin: 0, padding: 0 }} />

        {/* Centered Static Labels Overlay */}
        <div style={{
          position: 'absolute',
          bottom: '10px',
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
      </div>
    </div>
  )
})

export default SignalChart
