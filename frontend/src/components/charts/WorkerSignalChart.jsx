import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState } from 'react';
import { ChartSpline, ZoomIn, ArrowUpDown, ArrowDown, ArrowUp, Sigma, Clock, Minus, Plus } from 'lucide-react';
import ElasticSlider from '../ui/ElasticSlider';
import '../../styles/live/SignalChart.css';

const DEFAULT_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#06d6a0'
];

const WorkerSignalChart = forwardRef(({
    className,
    graphNo,
    title,
    color = '#3b82f6',
    timeWindowMs = 10000,
    channelLabelPrefix = 'Ch',
    height = 300,
    yDomainProp = [-1500, 1500],
    showGrid = true,
    disabled = false,
    currentZoom = 1,
    currentManual = "",
    onZoomChange = null,
    onRangeChange = null,
    onTimeWindowChange = null,
    onColorChange = null,
    byChannel,
    channelColors,
    scannerX,
    annotations,
    tickCount, // ignored by worker but kept for prop matching
    curveType, // ignored by worker but kept for prop matching
}, ref) => {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);
    const isTransferred = useRef(false);

    const [stats, setStats] = useState({ min: 0, max: 0, mean: 0 });

    // Compute config for the worker
    const yMin = yDomainProp[0] || -1500;
    const yMax = yDomainProp[1] || 1500;

    useEffect(() => {
        if (!canvasRef.current || disabled) return;

        if (!workerRef.current) {
            if (!canvasRef.current.transferControlToOffscreen) {
                console.error("OffscreenCanvas not supported!");
                return;
            }

            try {
                const worker = new Worker(new URL('../../workers/live-chart.worker.js', import.meta.url), { type: 'module' });
                workerRef.current = worker;

                if (!isTransferred.current) {
                    const offscreen = canvasRef.current.transferControlToOffscreen();
                    isTransferred.current = true;

                    const initPayload = {
                        canvas: offscreen,
                        width: containerRef.current.clientWidth || 800,
                        height: containerRef.current.clientHeight || height,
                        config: {
                            timeWindow: timeWindowMs,
                            yMin,
                            yMax,
                            zoom: currentZoom,
                            lineColor: color,
                            showGrid
                        }
                    };
                    worker.postMessage({ type: 'INIT', payload: initPayload }, [offscreen]);

                    worker.onmessage = (e) => {
                        if (e.data.type === 'STATS') {
                            setStats(e.data.payload);
                        }
                    };
                }
            } catch (err) {
                console.error("Failed to transfer canvas or init worker:", err);
            }
        } else {
            // Just reattach the listener in case of re-render
            workerRef.current.onmessage = (e) => {
                if (e.data.type === 'STATS') {
                    setStats(e.data.payload);
                }
            };
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
        if (containerRef.current) observer.observe(containerRef.current);

        return () => {
            // Do not terminate worker immediately on strict-mode unmount, let it persist.
            // If we genuinely unmount, the parent components will usually be destroyed.
            observer.disconnect();
        };
    }, [disabled]); // Init only once or when enabled status changes

    // Update Worker Config when props change
    useEffect(() => {
        if (workerRef.current && !disabled) {
            workerRef.current.postMessage({
                type: 'SET_CONFIG',
                payload: {
                    timeWindow: timeWindowMs,
                    yMin,
                    yMax,
                    zoom: currentZoom,
                    lineColor: color,
                    showGrid
                }
            });
        }
    }, [timeWindowMs, yMin, yMax, currentZoom, color, showGrid, disabled]);

    // Send Sweep Data to Worker
    useEffect(() => {
        if (workerRef.current && !disabled && byChannel) {
            workerRef.current.postMessage({
                type: 'DRAW_SWEEP',
                payload: {
                    active: byChannel.active,
                    history: byChannel.history,
                    activeColor: channelColors?.active || color,
                    historyColor: channelColors?.history || color + '4D',
                    scannerX,
                    annotations
                }
            });
        }
    }, [byChannel, channelColors, scannerX, annotations, disabled]);

    useImperativeHandle(ref, () => ({
        clearData: () => {
            if (workerRef.current && !disabled) {
                workerRef.current.postMessage({ type: 'CLEAR_DATA' });
            }
        }
    }));

    return (
        <div className={`signal-chart-container ${disabled ? 'signal-chart-disabled' : ''}`}>
            <div className="chart-header">
                <h3 className="chart-title" style={{ position: 'relative' }}>
                    <button
                        onClick={(e) => {
                            e.preventDefault();
                            if (onColorChange) {
                                const currentIndex = DEFAULT_PALETTE.indexOf(color);
                                const nextIndex = (currentIndex + 1) % DEFAULT_PALETTE.length;
                                onColorChange(DEFAULT_PALETTE[nextIndex === -1 ? 0 : nextIndex]);
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
                        +/-{Math.abs(currentManual ? parseFloat(currentManual) : (yDomainProp ? yDomainProp[1] / currentZoom : 1500 / currentZoom)).toFixed(0)} uV
                    </div>
                </div>

                <div className="chart-stats">
                    <div className="stat-item">
                        <span className="stat-label-chart"><ArrowDown size={18} /> Min</span>
                        <span className="stat-value">{stats.min === Infinity ? '0.00' : stats.min.toFixed(2)}</span>
                    </div>
                    <div className="stat-separator"></div>
                    <div className="stat-item">
                        <span className="stat-label-chart"><ArrowUp size={18} /> Max</span>
                        <span className="stat-value">{stats.max === -Infinity ? '0.00' : stats.max.toFixed(2)}</span>
                    </div>
                    <div className="stat-separator"></div>
                    <div className="stat-item">
                        <span className="stat-label-chart"><Sigma size={18} /> Mean</span>
                        <span className="stat-value">{isNaN(stats.mean) ? '0.00' : stats.mean.toFixed(2)}</span>
                    </div>
                </div>
            </div>

            <div className="chart-area" style={{ height: height }}>
                <div ref={containerRef} className={`w-full h-full relative ${className || ''}`}>
                    <canvas ref={canvasRef} className="block w-full h-full" />
                </div>
            </div>
        </div>
    );
});

export default WorkerSignalChart;
