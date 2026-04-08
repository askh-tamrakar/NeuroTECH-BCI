/* eslint-disable no-restricted-globals */
import { io } from 'socket.io-client';
import { getSocketIoConnection } from '../utils/runtimeConnection';

let socket = null;
const broadcast = new BroadcastChannel('bci-data-stream');

// State for timestamp interpolation
let lastTs = 0;
let isPaused = false;

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
        const now = Date.now();

        // Wall-clock timestamp spreading:
        // The backend may send fewer samples per batch than the declared rate
        // (e.g. pull_sample + sleep on Windows yields ~2 samples per 33ms batch
        // instead of ~17 at 512Hz). If we space by 1/sampleRate, signal time
        // falls far behind wall-clock time and the chart appears frozen.
        //
        // Fix: spread samples evenly between lastTs and Date.now().
        // This keeps signal time == wall-clock time regardless of how many
        // samples arrive per batch.

        let batchStart;

        if (lastTs === 0) {
            // First batch — use declared rate for the initial spread
            const samplingRate = batchData.sample_rate || 512;
            batchStart = now - (totalSamples * (1000 / samplingRate));
        } else {
            batchStart = lastTs;
        }

        // Clamp the span so a reconnection gap doesn't stretch samples over seconds
        const MAX_SPAN_MS = 200;
        const rawSpan = now - batchStart;
        const span = Math.min(Math.max(rawSpan, 1), MAX_SPAN_MS);
        const adjustedStart = now - span;

        const timestampedSamples = samples.map((sample, idx) => {
            const ts = adjustedStart + ((idx + 1) / totalSamples) * span;
            return { ...sample, timestamp: ts };
        });

        lastTs = timestampedSamples[timestampedSamples.length - 1].timestamp;

        // Broadcast to chart/signal workers via BroadcastChannel (real-time)
        broadcast.postMessage({
            type: 'DATA_BATCH',
            streamName: batchData.stream_name,
            samples: timestampedSamples,
        });

        // Forward full batch to main thread immediately for recording
        self.postMessage({
            type: 'RECORD_BATCH',
            payload: { samples: timestampedSamples },
        });

        // Lightweight UI update
        const lastSample = timestampedSamples[timestampedSamples.length - 1];
        self.postMessage({
            type: 'UI_UPDATE',
            payload: {
                streamName: batchData.stream_name,
                lastSample: lastSample,
                sampleCount: totalSamples,
            },
        });
    });

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
