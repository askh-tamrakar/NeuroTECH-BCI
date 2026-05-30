import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const WorkerTimeSeriesChart = forwardRef(({
    className,
    config = {},
    timeWindow = 5000,
    activeSensor,
    displayMode = 'raw',
    activeChannelIndex,
    channelIndex,
    onWindowSelect,
    noBorder = false,
    recordedMode = false,
    drawModeEnabled = false,
    windowDurationMs = 900, // passed from capture size for draw-mode preview
}, ref) => {

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);

    // Selection State (draw mode)
    const isDragging = useRef(false);
    const startX = useRef(0);

    // Pan drag state (recorded mode)
    const isPanning = useRef(false);
    const panLastX = useRef(0);

    // Mouse position tracking for scroll zone detection
    const mousePos = useRef({ x: 0, y: 0 });

    // ID counter for async requests
    const requestIdCounter = useRef(0);
    const pendingRequests = useRef(new Map());

    // Transfer state to prevent double-transfer in StrictMode
    const isTransferred = useRef(false);
    const workerCleanupTimerRef = useRef(null);
    const resizeRafRef = useRef(null);
    const resizeTimeoutRef = useRef(null);
    const initRafRef = useRef(null);

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

    // Initialize Worker
    useEffect(() => {
        if (!canvasRef.current) return;

        // Cancel pending cleanup (Strict Mode "remount")
        if (workerCleanupTimerRef.current) {
            clearTimeout(workerCleanupTimerRef.current);
            workerCleanupTimerRef.current = null;
        }

        const bindWorkerMessages = (worker) => {
            worker.onmessage = (e) => {
                const { type, idPromise, payload } = e.data;
                if (type === 'GET_SAMPLES_RESULT') {
                    if (pendingRequests.current.has(idPromise)) {
                        const resolve = pendingRequests.current.get(idPromise);
                        pendingRequests.current.delete(idPromise);
                        resolve(payload);
                    }
                } else if (type === 'SELECTION_RESULT') {
                    if (onWindowSelect) {
                        onWindowSelect(payload.start, payload.end);
                    }
                }
            };
        };

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
                    const worker = new Worker(new URL('../../workers/chart.worker.js', import.meta.url), { type: 'module' });
                    workerRef.current = worker;
                    bindWorkerMessages(worker);

                    if (!isTransferred.current) {
                        const offscreen = canvasRef.current.transferControlToOffscreen();
                        isTransferred.current = true;

                        const initPayload = {
                            canvas: offscreen,
                            width,
                            height,
                            config: {
                                timeWindow,
                                channelIndex,
                                activeSensor,
                                displayMode,
                                ...config
                            }
                        };
                        worker.postMessage({ type: 'INIT', payload: initPayload }, [offscreen]);
                    }
                } catch (err) {
                    console.error("Failed to transfer canvas or init worker:", err);
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
            // DELAYED CLEANUP
            workerCleanupTimerRef.current = setTimeout(() => {
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }
                observer.disconnect();
                // We can't reset isTransferred since canvas is dead.
            }, 200); // 200ms buffer
        };
    }, [config, timeWindow, onWindowSelect, activeSensor, displayMode]); // Add deps to ensure listener updates


    const handleMouseMove = (e) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const localX = e.clientX - rect.left;
        const localY = e.clientY - rect.top;
        mousePos.current = { x: localX, y: localY };

        // Continuous pan in recorded mode
        if (recordedMode && !drawModeEnabled && isPanning.current && workerRef.current) {
            const dx = e.clientX - panLastX.current;
            panLastX.current = e.clientX;
            if (dx !== 0) {
                workerRef.current.postMessage({ type: 'PAN_VIEW', payload: { deltaPx: -dx } });
            }
        }

        // Draw-mode: send preview position to worker
        if (recordedMode && drawModeEnabled && workerRef.current) {
            workerRef.current.postMessage({
                type: 'DRAW_PREVIEW',
                payload: { pixelX: localX, windowDurationMs }
            });
        }
    };

    const handleMouseDown = (e) => {
        if (recordedMode && !drawModeEnabled) {
            // Pan mode
            isPanning.current = true;
            panLastX.current = e.clientX;
            return;
        }
        // Draw-mode window selection (live mode or draw mode enabled)
        if (!onWindowSelect) return;
        if (recordedMode && !drawModeEnabled) return;
        isDragging.current = true;
        const rect = containerRef.current.getBoundingClientRect();
        startX.current = e.clientX - rect.left;
    };

    const handleMouseUp = (e) => {
        if (isPanning.current) {
            isPanning.current = false;
            return;
        }
        if (!isDragging.current) return;
        isDragging.current = false;
        const rect = containerRef.current.getBoundingClientRect();
        const endX = e.clientX - rect.left;

        const dist = Math.abs(endX - startX.current);
        if (dist > 10 && workerRef.current) {
            workerRef.current.postMessage({
                type: 'CALC_SELECTION',
                payload: { x1: startX.current, x2: endX }
            });
        }
    };

    const handleMouseLeave = () => {
        isDragging.current = false;
        isPanning.current = false;
        // Clear draw preview
        if (recordedMode && drawModeEnabled && workerRef.current) {
            workerRef.current.postMessage({ type: 'DRAW_PREVIEW', payload: { pixelX: null } });
        }
    };

    const handleWheel = (e) => {
        if (!workerRef.current) return;
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { y } = mousePos.current;
        const zoomIn = e.deltaY < 0;

        // Bottom 12% = X timeline zone → X zoom (time window, recorded mode only)
        // Else → Y zoom
        if (recordedMode && y > rect.height * 0.88) {
            const factor = zoomIn ? 1.3 : 0.77;
            workerRef.current.postMessage({ type: 'ZOOM_X', payload: { factor } });
        } else {
            const factor = zoomIn ? 1.25 : 0.8;
            workerRef.current.postMessage({ type: 'ZOOM_Y', payload: { factor } });
        }
    };

    // Sync Config Updates
    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({
                type: 'SET_CONFIG',
                payload: { timeWindow, channelIndex, activeSensor, displayMode, ...config }
            });
        }
    }, [config, timeWindow, activeSensor, displayMode, channelIndex]);

    // Expose API
    useImperativeHandle(ref, () => ({

        addData: (points) => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'ADD_DATA', payload: points });
            }
        },

        updateWindows: (windows) => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'UPDATE_WINDOWS', payload: windows });
            }
        },

        setScanner: (x, value) => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'SET_SCANNER', payload: { x, value } });
            }
        },

        clearData: () => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'CLEAR_DATA' });
            }
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
        },

        setRenderTime: (ms) => {
            if (workerRef.current) {
                workerRef.current.postMessage({ type: 'SET_RENDER_TIME', payload: { ms } });
            }
        },

    }));

    // Attach non-passive wheel listener so preventDefault() works
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.addEventListener('wheel', handleWheel, { passive: false });
        return () => el.removeEventListener('wheel', handleWheel);
    }); // no deps — handleWheel uses closure over workerRef / mousePos

    return (
        <div
            ref={containerRef}
            className={`w-full h-full relative ${className}`}
            style={{
                ...(noBorder ? { border: 'none', borderRadius: 0, boxShadow: 'none' } : {}),
                cursor: recordedMode
                    ? (drawModeEnabled
                        // Circle + plus SVG cursor (32×32, hotspot 16,16)
                        ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Ccircle cx='16' cy='16' r='9' fill='none' stroke='%23f59e0b' stroke-width='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='30' stroke='%23f59e0b' stroke-width='2'/%3E%3Cline x1='2' y1='16' x2='30' y2='16' stroke='%23f59e0b' stroke-width='2'/%3E%3C/svg%3E") 16 16, crosshair`
                        : 'grab')
                    : 'default',
            }}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
});

export default WorkerTimeSeriesChart;
