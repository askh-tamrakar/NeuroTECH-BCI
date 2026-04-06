import React, { useEffect, useRef } from 'react';

export default function SSVEPStimulus({ configs, brightness, refreshRate, running, protocolMode, trials, onProtocolUpdate, onProtocolFinished }) {
    const canvasRef = useRef(null);
    const workerRef = useRef(null);
    const containerRef = useRef(null);
    const workerCleanupTimerRef = useRef(null);
    const [canvasResetKey, setCanvasResetKey] = React.useState(0);

    // Initialize Worker
    useEffect(() => {
        if (!canvasRef.current) return;

        // Cancel any pending cleanup (StrictMode handling)
        if (workerCleanupTimerRef.current) {
            clearTimeout(workerCleanupTimerRef.current);
            workerCleanupTimerRef.current = null;
        }

        let worker = workerRef.current;

        if (!worker) {
            try {
                // Adjusting Vite import meta URL relative to this file
                worker = new Worker(new URL('../../../workers/ssvep.worker.js', import.meta.url), { type: 'module' });
                workerRef.current = worker;

                const offscreen = canvasRef.current.transferControlToOffscreen();

                worker.postMessage({
                    type: 'INIT',
                    payload: {
                        canvas: offscreen,
                        configs,
                        brightness,
                        refreshRate,
                        width: containerRef.current.clientWidth,
                        height: containerRef.current.clientHeight
                    }
                }, [offscreen]);

                worker.onmessage = (e) => {
                    const { type, state, trialIdx } = e.data;
                    if (type === 'PROTOCOL_UPDATE') {
                        onProtocolUpdate(state, trialIdx);
                    } else if (type === 'PROTOCOL_FINISHED') {
                        onProtocolFinished();
                    }
                };

                const resizeObserver = new ResizeObserver(entries => {
                    if (entries[0] && workerRef.current) {
                        const { width, height } = entries[0].contentRect;
                        workerRef.current.postMessage({ type: 'RESIZE', payload: { width, height } });
                    }
                });
                resizeObserver.observe(containerRef.current);
                worker.resizeObserver = resizeObserver; // Attach for cleanup
            } catch (err) {
                console.warn("[SSVEPStimulus] Canvas transfer failed or Worker init error:", err);
                // If it fails, we might need to reset the canvas element to try again on next render
                // setCanvasResetKey(prev => prev + 1);
            }
        }

        return () => {
            // Delay cleanup to allow for StrictMode remount re-use
            workerCleanupTimerRef.current = setTimeout(() => {
                if (workerRef.current) {
                    workerRef.current.terminate();
                    workerRef.current.resizeObserver?.disconnect();
                    workerRef.current = null;
                }
            }, 100);
        };
    }, [canvasResetKey]);

    // Sync Props to Worker
    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'UPDATE_CONFIGS', payload: { configs } });
        }
    }, [configs]);

    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'UPDATE_BRIGHTNESS', payload: { brightness } });
        }
    }, [brightness]);

    useEffect(() => {
        if (workerRef.current) {
            workerRef.current.postMessage({ type: 'UPDATE_REFRESH_RATE', payload: { refreshRate } });
        }
    }, [refreshRate]);

    useEffect(() => {
        if (!workerRef.current) return;

        if (running) {
            if (protocolMode) {
                workerRef.current.postMessage({ type: 'PROTOCOL_START', payload: { trials } });
            } else {
                workerRef.current.postMessage({ type: 'START' });
            }
        } else {
            workerRef.current.postMessage({ type: 'STOP' });
        }
    }, [running, protocolMode, trials]);

    return (
        <div ref={containerRef} className="flex-grow w-full relative bg-black overflow-hidden">
            <canvas
                key={canvasResetKey}
                ref={canvasRef}
                className="w-full h-full block"
                style={{ imageRendering: 'pixelated' }}
            />
        </div>
    );
}


