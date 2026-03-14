// SignalChart.jsx
import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react'
import { ChartSpline, ZoomIn, ArrowUpDown, ArrowDown, ArrowUp, Sigma, Clock, Minus, Plus, Activity } from 'lucide-react'
import ElasticSlider from '../ui/ElasticSlider'
import { useTheme } from '../../contexts/ThemeContext'
import '../../styles/live/SignalChart.css'

const DEFAULT_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#06d6a0'
]

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
  disabled = false,
  channelIndex = -1
}, ref) => {

  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const workerRef = useRef(null)
  const isTransferred = useRef(false)

  const [stats, setStats] = useState({ min: 0, max: 0, mean: 0 })
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
                manualRange: currentManual,
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
          manualRange: currentManual,
          showGrid,
          channelIndex
        }
      });
    }
  }, [timeWindowMs, color, currentZoom, currentManual, showGrid, currentTheme]);

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

  const yDomainRaw = parseFloat(currentManual);
  let rangeDisplay = isNaN(yDomainRaw) ? (1500 / currentZoom).toFixed(0) : yDomainRaw.toFixed(0);

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

        <div className="channel-controls">
          <div className="time-window-control">
            <span className="control-label"><Clock size={24} /> Time</span>
            <div className="w-64">
              <ElasticSlider
                defaultValue={(timeWindowMs || 10000) / 1000}
                startingValue={1}
                maxValue={30}
                stepSize={1}
                isStepped={true}
                onChange={(val) => onTimeWindowChange && onTimeWindowChange(val * 1000)}
                leftIcon={<Minus size={18} className="text-muted" />}
                rightIcon={<Plus size={18} className="text-muted" />}
                className="w-full h-6"
              />
            </div>
          </div>

          <div className="zoom-controls">
            <span className="control-label flex items-center gap-1"><ZoomIn size={24} /> ZOOM</span>
            {[1, 2, 3, 5, 10, 25, 50].map(z => (
              <button
                key={z}
                onClick={() => onZoomChange && onZoomChange(z)}
                className={`zoom-btn ${currentZoom === z && !currentManual ? 'active' : 'inactive'}`}
              >
                {z}x
              </button>
            ))}
          </div>

          <div className="separator-small"></div>

          <div className="range-input-container">
            <span className="control-label flex items-center gap-1"><ArrowUpDown size={24} /> RANGE</span>
            <input
              type="number"
              placeholder="+/-"
              value={currentManual}
              onChange={(e) => onRangeChange && onRangeChange(e.target.value)}
              className="range-input"
            />
          </div>

          <div className="separator-small"></div>

          <div className="range-display">
            +/-{rangeDisplay} uV
          </div>
        </div>

        <div className="chart-stats">
          <div className="stat-item">
            <span className="stat-label-chart"><ArrowDown size={18} /> Min</span>
            <span className="stat-value">{stats.min.toFixed(2)}</span>
          </div>
          <div className="stat-separator"></div>
          <div className="stat-item">
            <span className="stat-label-chart"><ArrowUp size={18} /> Max</span>
            <span className="stat-value">{stats.max.toFixed(2)}</span>
          </div>
          <div className="stat-separator"></div>
          <div className="stat-item">
            <span className="stat-label-chart"><Sigma size={18} /> Mean</span>
            <span className="stat-value">{stats.mean.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="chart-area" style={{ minHeight: 0, overflow: 'hidden', position: 'relative' }} ref={containerRef}>
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />

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
