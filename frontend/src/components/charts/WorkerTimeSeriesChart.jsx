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
    noBorder = false
}, ref) => {

    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);

    // Selection State
    const isDragging = useRef(false);
    const startX = useRef(0);

    // ID counter for async requests
    const requestIdCounter = useRef(0);
    const pendingRequests = useRef(new Map());

    // Transfer state to prevent double-transfer in StrictMode
    const isTransferred = useRef(false);
    const workerCleanupTimerRef = useRef(null);

    // Initialize Worker
    useEffect(() => {
        if (!canvasRef.current) return;

        // Cancel pending cleanup (Strict Mode "remount")
        if (workerCleanupTimerRef.current) {
            clearTimeout(workerCleanupTimerRef.current);
            workerCleanupTimerRef.current = null;
        }

        if (!workerRef.current) {
            // Check for OffscreenCanvas support
            if (!canvasRef.current.transferControlToOffscreen) {
                console.error("OffscreenCanvas not supported!");
                return;
            }

            try {
                // Create Worker
                const worker = new Worker(new URL('../../workers/chart.worker.js', import.meta.url), { type: 'module' });
                workerRef.current = worker;


                if (!isTransferred.current) {
                    const offscreen = canvasRef.current.transferControlToOffscreen();
                    isTransferred.current = true;

                    const initPayload = {
                        canvas: offscreen,
                        width: containerRef.current.clientWidth,
                        height: containerRef.current.clientHeight,
                        config: {
                            timeWindow,
                            channelIndex,
                            activeSensor,
                            displayMode,
                            ...config
                        }
                    };
                    worker.postMessage({ type: 'INIT', payload: initPayload }, [offscreen]);

                    // Handle Responses
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
                }
            } catch (err) {
                console.error("Failed to transfer canvas or init worker:", err);
            }
        } else {
            const worker = workerRef.current;
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
        }

        // Resize Observer
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

        return () => {
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


    const handleMouseDown = (e) => {
        if (!onWindowSelect) return;
        isDragging.current = true;
        const rect = containerRef.current.getBoundingClientRect();
        startX.current = e.clientX - rect.left;
    };

    const handleMouseUp = (e) => {
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
        }

    }));

    return (
        <div
            ref={containerRef}
            className={`w-full h-full relative ${className}`}
            style={noBorder ? { border: 'none', borderRadius: 0, boxShadow: 'none' } : {}}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
        >
            <canvas ref={canvasRef} className="block w-full h-full" />
        </div>
    );
});

export default WorkerTimeSeriesChart;
