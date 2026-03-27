import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

const WorkerFFTChart = forwardRef(({
    className,
    config = {},
    channelIndex,
    onStatsChange
}, ref) => {
    const containerRef = useRef(null);
    const canvasRef = useRef(null);
    const workerRef = useRef(null);
    const isTransferred = useRef(false);
    const workerCleanupTimerRef = useRef(null);
    const requestIdCounter = useRef(0);
    const pendingRequests = useRef(new Map());

    useEffect(() => {
        if (!canvasRef.current) return;

        if (workerCleanupTimerRef.current) {
            clearTimeout(workerCleanupTimerRef.current);
            workerCleanupTimerRef.current = null;
        }

        if (!workerRef.current) {
            if (!canvasRef.current.transferControlToOffscreen) {
                console.error("OffscreenCanvas not supported!");
                return;
            }

            try {
                const worker = new Worker(new URL('../../workers/fft-chart.worker.js', import.meta.url), { type: 'module' });
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
                            config: { channelIndex, ...config }
                        }
                    }, [offscreen]);

                    worker.onmessage = (e) => {
                        const { type, payload, idPromise } = e.data;
                        if (type === 'STATS' && onStatsChange) {
                            onStatsChange(payload);
                        } else if (type === 'GET_SAMPLES_RESULT' && pendingRequests.current.has(idPromise)) {
                            const resolve = pendingRequests.current.get(idPromise);
                            pendingRequests.current.delete(idPromise);
                            resolve(payload);
                        }
                    };
                }
            } catch (err) {
                console.error("Failed to init FFT worker:", err);
            }
        } else {
            const worker = workerRef.current;
            worker.onmessage = (e) => {
                const { type, payload, idPromise } = e.data;
                if (type === 'STATS' && onStatsChange) {
                    onStatsChange(payload);
                } else if (type === 'GET_SAMPLES_RESULT' && pendingRequests.current.has(idPromise)) {
                    const resolve = pendingRequests.current.get(idPromise);
                    pendingRequests.current.delete(idPromise);
                    resolve(payload);
                }
            };
        }

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

        return () => {
            workerCleanupTimerRef.current = setTimeout(() => {
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current = null;
                }
                observer.disconnect();
            }, 200);
        };
    }, [config, channelIndex, onStatsChange]);

    useEffect(() => {
        workerRef.current?.postMessage({
            type: 'SET_CONFIG',
            payload: { channelIndex, ...config }
        });
    }, [config, channelIndex]);

    useImperativeHandle(ref, () => ({
        addData: (points) => {
            workerRef.current?.postMessage({ type: 'ADD_DATA', payload: points });
        },
        updateWindows: () => {
            // FFT mode is visualization-only for now; exposing a no-op keeps the
            // imperative API compatible with WorkerTimeSeriesChart.
        },
        setScanner: () => {
            // No scanner concept in the FFT chart yet, but callers may still
            // expect the method to exist on the shared chart ref.
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
            ref={containerRef}
            className={`w-full h-full relative ${className || ''}`}
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
    );
});

export default WorkerFFTChart;
