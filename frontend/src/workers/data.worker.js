/* eslint-disable no-restricted-globals */
import { io } from 'socket.io-client';
import { getSocketIoConnection } from '../utils/runtimeConnection';

let socket = null;
const broadcast = new BroadcastChannel('bci-data-stream');

// State for timestamp interpolation (similar to what was in LiveView)
let lastTs = 0;
let isPaused = false;

// Throttling state for main-thread notifications
let pendingSamplesBuffer = [];
let lastStreamName = '';
let throttleTimeout = null;
const THROTTLE_MS = 50; // 20Hz updates for UI/Recording

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'CONNECT':
            connect(payload.url);
            break;
        case 'DISCONNECT':
            if (socket) {
                socket.disconnect();
                socket = null;
            }
            break;
        case 'SEND_MESSAGE':
            if (socket && socket.connected) {
                socket.emit('message', payload);
            }
            break;
        case 'SET_PAUSED':
            isPaused = payload;
            break;
    }
};

function connect(url) {
    if (socket) socket.disconnect();

    const { endpoint: defaultEndpoint, options } = getSocketIoConnection();
    const endpoint = url || defaultEndpoint;

    console.log(`[DataWorker] Connecting to ${endpoint}`);

    socket = io(endpoint, {
        timeout: 10000,
        ...options,
    });

    socket.on('connect', () => {
        self.postMessage({ type: 'STATUS', payload: 'connected' });
    });

    socket.on('disconnect', () => {
        self.postMessage({ type: 'STATUS', payload: 'disconnected' });
    });

    socket.on('connect_error', (err) => {
        self.postMessage({ type: 'STATUS', payload: 'error', error: err.message });
    });

    socket.on('bio_data_batch', (batchData) => {
        if (isPaused) return;
        if (!batchData || !batchData.samples || batchData.samples.length === 0) return;

        const samples = batchData.samples;
        const totalSamples = samples.length;
        const samplingRate = batchData.sample_rate || 1000;
        const sampleIntervalMs = 1000 / samplingRate;

        // We assume backend provides `sample.timestamp` in seconds (epoch) or relative time
        // The most robust way to ensure no backwards overlaps is to trust the sample count
        // and strictly increment by sampleIntervalMs from the last known valid timestamp.
        
        let batchStartTs = 0;
        
        if (lastTs === 0) {
             batchStartTs = Date.now() - (totalSamples * sampleIntervalMs);
        } else {
             // To prevent frontend clocks from drifting too far from reality,
             // slowly pull lastTs towards Date.now() if it drifts too far
             const now = Date.now();
             const expectedStart = now - (totalSamples * sampleIntervalMs);
             
             // If we are more than 500ms behind or somehow ahead of now, hard reset
             if (Math.abs(lastTs - expectedStart) > 500) {
                 batchStartTs = expectedStart;
             } else {
                 batchStartTs = lastTs; // Strict continuous sequence
             }
        }

        const interpolatedSamples = samples.map((sample, idx) => {
            const ts = batchStartTs + (idx * sampleIntervalMs);
            lastTs = ts + sampleIntervalMs;
            return {
                ...sample,
                timestamp: ts
            };
        });

        // Broadcast to all listening workers (SignalWorker, ChartWorker, etc.)
        // This remains REAL-TIME (no throttle) for smooth charts
        broadcast.postMessage({
            type: 'DATA_BATCH',
            streamName: batchData.stream_name,
            samples: interpolatedSamples
        });

        // Buffer for throttled main-thread updates
        bufferBatchForMainThread(interpolatedSamples, batchData.stream_name);
    });

    function bufferBatchForMainThread(samples, streamName) {
        pendingSamplesBuffer = pendingSamplesBuffer.concat(samples);
        lastStreamName = streamName;

        if (!throttleTimeout) {
            throttleTimeout = setTimeout(flushBufferToMainThread, THROTTLE_MS);
        }
    }

    function flushBufferToMainThread() {
        if (pendingSamplesBuffer.length === 0) {
            throttleTimeout = null;
            return;
        }

        const lastSample = pendingSamplesBuffer[pendingSamplesBuffer.length - 1];
        const totalCount = pendingSamplesBuffer.length;

        // Notify main thread for recording (full high-frequency array)
        self.postMessage({
            type: 'RECORD_BATCH',
            payload: {
                samples: pendingSamplesBuffer
            }
        });

        // Also notify main thread for UI elements (timer, stats, etc.)
        self.postMessage({
            type: 'UI_UPDATE',
            payload: {
                streamName: lastStreamName,
                lastSample: lastSample,
                sampleCount: totalCount
            }
        });

        pendingSamplesBuffer = [];
        throttleTimeout = null;
    }

    socket.on('bio_event', (eventData) => {
        self.postMessage({ type: 'EVENT', payload: eventData });
    });

    socket.on('emg_prediction', (data) => {
        self.postMessage({ type: 'EVENT', payload: { type: 'emg_prediction', ...data } });
    });

    socket.on('config_updated', (data) => {
        self.postMessage({ type: 'CONFIG', payload: data.config });
    });
}
