import React, { useEffect, useRef, useImperativeHandle, forwardRef, useState, useMemo } from 'react';
import {
    SlidersHorizontal, ZoomIn,
    ArrowUpDown, ChevronUp, ChevronDown, ChartSpline, Sigma, ArrowUp, ArrowDown
} from 'lucide-react';
import { formatAmplitudeValue } from '../../utils/spectrumFormat';
import RangeSlider from '../ui/inputs/RangeSlider';
import '../../styles/live/SignalChart.css';

const DEFAULT_PALETTE = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
    '#06b6d4', '#f97316', '#06d6a0'
];

const getPrevGoodRange = (val) => {
    if (val <= 1) return 1;
    const target = val * 0.98;
    let power = Math.floor(Math.log10(target));
    let fraction = target / Math.pow(10, power);
    if (fraction < 1.0) { power -= 1; fraction = target / Math.pow(10, power); }
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
    const padded = val * 1.02;
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
    return parseFloat((niceFraction * Math.pow(10, power)).toPrecision(15));
};

const WorkerFFTChart = forwardRef(({
    className,
    config = {},
    channelIndex,
    onStatsChange,
    graphNo,
    title,
    color,
    onColorChange,
    titleAddon,
    frequencyFrom: initialFreqFrom,
    frequencyTo: initialFreqTo,
    onApplyFilters,
    onZoomChange,
    onRangeChange,
    rangeDisplay: forceRangeDisplay,
    headerMiddle,
    disabled = false,
    noBorder = false
}, ref) => {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);
    const isTransferred = useRef(false);
    const workerCleanupTimerRef = useRef(null);
    const resizeRafRef = useRef(null);
    const resizeTimeoutRef = useRef(null);
    const initRafRef = useRef(null);
    const requestIdCounter = useRef(0);
    const pendingRequests = useRef(new Map());

    const [stats, setStats] = useState({ min: 0, max: 0, mean: 0 });
    const [frequencyFrom, setFrequencyFrom] = useState(initialFreqFrom || "");
    const [frequencyTo, setFrequencyTo] = useState(initialFreqTo || "");
    const statsRef = useRef({ min: 0, max: 0, mean: 0 });
    const onStatsChangeRef = useRef(onStatsChange);
    onStatsChangeRef.current = onStatsChange;

    useEffect(() => {
        setFrequencyFrom(initialFreqFrom ?? "");
    }, [initialFreqFrom]);

    useEffect(() => {
        setFrequencyTo(initialFreqTo ?? "");
    }, [initialFreqTo]);

    const handleApplyFilters = () => {
        if (onApplyFilters) {
            onApplyFilters({ frequencyFrom, frequencyTo });
        }
    };

    const currentManual = config.manualRange;
    const currentZoom = config.zoom || 1;
    const baseZoomRange = 150 / currentZoom;
    const manualRangeVal = currentManual ? parseFloat(currentManual) : null;

    // Snap-to-max logic: Choose the max between requested zoom/manual and the current signal max (rounded up)
    const roundedMax = Math.ceil((stats.max || 0) / 5) * 5;
    const effectiveRange = Math.max(manualRangeVal || baseZoomRange, roundedMax || 0);

    const rangeDisplay = forceRangeDisplay || effectiveRange.toString();

    const scheduleResizeSync = () => {
        const width = containerRef.current?.clientWidth || 0;
        const height = containerRef.current?.clientHeight || 0;
        if (!workerRef.current || !width || !height) return;

        workerRef.current.postMessage({
            type: 'RESIZE',
            payload: { width, height }
        });

        if (resizeRafRef.current) cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = requestAnimationFrame(() => {
            const nextWidth = containerRef.current?.clientWidth || 0;
            const nextHeight = containerRef.current?.clientHeight || 0;
            if (workerRef.current && nextWidth && nextHeight) {
                workerRef.current.postMessage({
                    type: 'RESIZE',
                    payload: { width: nextWidth, height: nextHeight }
                });
            }
        });

        if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = setTimeout(() => {
            const nextWidth = containerRef.current?.clientWidth || 0;
            const nextHeight = containerRef.current?.clientHeight || 0;
            if (workerRef.current && nextWidth && nextHeight) {
                workerRef.current.postMessage({
                    type: 'RESIZE',
                    payload: { width: nextWidth, height: nextHeight }
                });
            }
        }, 120);
    };

    useEffect(() => {
        if (!canvasRef.current) return;

        if (workerCleanupTimerRef.current) {
            clearTimeout(workerCleanupTimerRef.current);
            workerCleanupTimerRef.current = null;
        }

        const bindWorkerMessages = (worker) => {
            worker.onmessage = (e) => {
                const { type, payload, idPromise } = e.data;
                if (type === 'STATS') {
                    // Guard: only update if values actually changed to prevent render loops
                    const prev = statsRef.current;
                    if (prev.min !== payload.min || prev.max !== payload.max || prev.mean !== payload.mean) {
                        statsRef.current = payload;
                        setStats(payload);
                        onStatsChangeRef.current?.(payload);
                    }
                } else if (type === 'GET_SAMPLES_RESULT' && pendingRequests.current.has(idPromise)) {
                    const resolve = pendingRequests.current.get(idPromise);
                    pendingRequests.current.delete(idPromise);
                    resolve(payload);
                }
            };
        };

        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const { width, height } = entry.contentRect;
                workerRef.current?.postMessage({
                    type: 'RESIZE',
                    payload: { width, height }
                });
            }
        });
        observer.observe(containerRef.current);

        const initWhenSized = () => {
            const width = containerRef.current?.clientWidth || 0;
            const height = containerRef.current?.clientHeight || 0;

            if (!width || !height) {
                initRafRef.current = requestAnimationFrame(initWhenSized);
                return;
            }

            if (!workerRef.current) {
                if (!canvasRef.current.transferControlToOffscreen) {
                    console.error("OffscreenCanvas not supported!");
                    return;
                }

                try {
                    const worker = new Worker(new URL('../../workers/fft-chart.worker.js', import.meta.url), { type: 'module' });
                    workerRef.current = worker;
                    bindWorkerMessages(worker);

                    if (!isTransferred.current) {
                        const offscreen = canvasRef.current.transferControlToOffscreen();
                        isTransferred.current = true;

                        worker.postMessage({
                            type: 'INIT',
                            payload: {
                                canvas: offscreen,
                                width,
                                height,
                                config: {
                                    channelIndex,
                                    color,
                                    freqMin: Number(frequencyFrom),
                                    freqMax: Number(frequencyTo),
                                    manualRange: effectiveRange.toString(),
                                    ...config
                                }
                            }
                        }, [offscreen]);
                    }
                } catch (err) {
                    console.error("Failed to init FFT worker:", err);
                }
            } else {
                bindWorkerMessages(workerRef.current);
            }

            scheduleResizeSync();
        };

        initWhenSized();

        return () => {
            if (initRafRef.current) {
                cancelAnimationFrame(initRafRef.current);
                initRafRef.current = null;
            }
            if (resizeRafRef.current) {
                cancelAnimationFrame(resizeRafRef.current);
                resizeRafRef.current = null;
            }
            if (resizeTimeoutRef.current) {
                clearTimeout(resizeTimeoutRef.current);
                resizeTimeoutRef.current = null;
            }
            workerCleanupTimerRef.current = setTimeout(() => {
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }
                observer.disconnect();
            }, 200);
        };
    }, [channelIndex]);  // Only recreate worker when channel changes, not on every config object

    const lastConfigPayloadRef = useRef('');

    useEffect(() => {
        // Extract theme colors from DOM since worker cannot access CSS variables
        const style = getComputedStyle(document.documentElement);
        const gridColor = style.getPropertyValue('--graph-grid').trim() || 'rgba(255, 255, 255, 0.1)';
        const textColor = style.getPropertyValue('--graph-text').trim() || '#9ca3af';

        const payload = {
            ...config,
            channelIndex,
            color: color || '#3b82f6',
            freqMin: parseFloat(frequencyFrom) || 0,
            freqMax: parseFloat(frequencyTo) || 60,
            zoom: parseFloat(currentZoom) || 1,
            manualRange: currentManual || "",
            themeAxisColor: textColor,
            themeGridColor: gridColor
        };

        // Guard: skip SET_CONFIG if payload hasn't changed since last send
        const payloadKey = JSON.stringify(payload);
        if (payloadKey === lastConfigPayloadRef.current) return;
        lastConfigPayloadRef.current = payloadKey;

        workerRef.current?.postMessage({
            type: 'SET_CONFIG',
            payload
        });
    }, [config, channelIndex, color, frequencyFrom, frequencyTo, currentZoom, currentManual]);

    useImperativeHandle(ref, () => ({
        addData: (points) => {
            workerRef.current?.postMessage({ type: 'ADD_DATA', payload: points });
        },
        clearData: () => {
            workerRef.current?.postMessage({ type: 'CLEAR_DATA' });
        },
        getSamples: (start, end) => {
            return new Promise((resolve) => {
                if (!workerRef.current) {
                    resolve([]);
                    return;
                }
                const id = requestIdCounter.current++;
                pendingRequests.current.set(id, resolve);
                workerRef.current.postMessage({
                    type: 'GET_SAMPLES',
                    idPromise: id,
                    payload: { start, end }
                });
            });
        }
    }));

    return (
        <div
            className={`signal-chart-container ${disabled ? 'signal-chart-disabled' : ''} ${noBorder ? 'no-border' : ''}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                overflow: 'hidden',
                ...(noBorder ? { border: 'none', borderRadius: 0, boxShadow: 'none' } : {})
            }}>
            <div className="chart-header" style={{ height: 'var(--chart-header-height, 48px)', flex: 'none' }}>
                {/* Left: Title and Color */}
                <div className="flex items-center gap-4 min-w-0">
                    <h3 className="chart-title" style={{ position: 'relative' }}>
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                const currentColor = color;
                                const currentIndex = DEFAULT_PALETTE.indexOf(currentColor);
                                const nextIndex = (currentIndex + 1) % DEFAULT_PALETTE.length;
                                onColorChange && onColorChange(DEFAULT_PALETTE[nextIndex === -1 ? 0 : nextIndex]);
                            }}
                            className="p-1 hover:bg-muted/10 rounded-full transition-colors cursor-pointer group flex items-center shrink-0"
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
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 text-muted shrink-0">
                            <SlidersHorizontal size={18} />
                            <span className="text-xs font-bold uppercase tracking-wider text-muted/80">Freq</span>
                        </div>
                        <div className="w-60 h-10 flex items-center px-2">
                            <RangeSlider
                                min={0}
                                max={50}
                                step={1}
                                minValue={Number(frequencyFrom)}
                                maxValue={Number(frequencyTo)}
                                color={color || '#3b82f6'}
                                labelSuffix="Hz"
                                onChange={({ min: fMin, max: fMax }) => {
                                    setFrequencyFrom(fMin);
                                    setFrequencyTo(fMax);
                                }}
                                onFinalChange={({ min: fMin, max: fMax }) => {
                                    if (onApplyFilters) {
                                        onApplyFilters({ frequencyFrom: fMin, frequencyTo: fMax });
                                    }
                                }}
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
                                placeholder={Math.round(150 / currentZoom).toString()}
                                onChange={(e) => onRangeChange && onRangeChange(e.target.value)}
                                className="w-14 bg-transparent px-0 py-1 text-[16px] font-mono font-bold text-primary focus:outline-none text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <div className="text-[16px] font-bold text-muted pointer-events-none pr-2">uV</div>
                            <div className="flex flex-col border-l border-border h-full">
                                <button
                                    onClick={() => {
                                        const val = parseFloat(currentManual) || Math.round(150 / currentZoom);
                                        onRangeChange && onRangeChange(getNextGoodRange(val).toString());
                                    }}
                                    className="flex-1 flex items-center justify-center px-1.5 hover:bg-muted/10 text-muted hover:text-text transition-colors border-b border-border outline-none focus:outline-none"
                                >
                                    <ChevronUp size={14} strokeWidth={4} />
                                </button>
                                <button
                                    onClick={() => {
                                        const val = parseFloat(currentManual) || Math.round(150 / currentZoom);
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
            <div
                ref={containerRef}
                className="flex-grow relative h-full w-full"
                style={{ minHeight: 0 }}
                onMouseMove={(event) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    if (!rect) return;
                    workerRef.current?.postMessage({
                        type: 'POINTER_MOVE',
                        payload: { x: event.clientX - rect.left }
                    });
                }}
                onMouseLeave={() => {
                    workerRef.current?.postMessage({ type: 'POINTER_LEAVE' });
                }}
            >
                <canvas ref={canvasRef} className="block w-full h-full" />
            </div>
        </div>
    );
});

export default WorkerFFTChart;
