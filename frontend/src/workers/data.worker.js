/* eslint-disable no-restricted-globals */
import { io } from 'socket.io-client';

let socket = null;
const broadcast = new BroadcastChannel('bci-data-stream');

// State for timestamp interpolation (similar to what was in LiveView)
let lastTs = 0;

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
    }
};

function connect(url) {
    if (socket) socket.disconnect();

    console.log(`[DataWorker] Connecting to ${url}`);

    socket = io(url, {
        reconnection: true,
        timeout: 10000,
        transports: ['websocket', 'polling']
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
        if (!batchData || !batchData.samples || batchData.samples.length === 0) return;

        const samples = batchData.samples;
        const totalSamples = samples.length;
        const samplingRate = batchData.sample_rate || 250;
        const sampleIntervalMs = 1000 / samplingRate;

        // Linear interpolation for timestamps to ensure smoothness
        let endTs = Date.now();
        if (lastTs === 0) lastTs = endTs - (totalSamples * sampleIntervalMs);

        const targetStartTs = Math.max(lastTs, endTs - (totalSamples * sampleIntervalMs));
        const actualBatchDuration = endTs - targetStartTs;
        const interval = totalSamples > 0 ? actualBatchDuration / totalSamples : sampleIntervalMs;

        const interpolatedSamples = samples.map((sample, idx) => {
            const ts = targetStartTs + (idx * interval);
            lastTs = ts + interval;
            return {
                ...sample,
                timestamp: ts
            };
        });

        // Broadcast to all listening workers (SignalWorker, ChartWorker, etc.)
        broadcast.postMessage({
            type: 'DATA_BATCH',
            streamName: batchData.stream_name,
            samples: interpolatedSamples
        });

        // Also notify main thread for UI elements (timer, etc.) but with reduced frequency if needed
        // For now, send every batch but the main thread can choose to throttle its UI update
        self.postMessage({
            type: 'UI_UPDATE',
            payload: {
                streamName: batchData.stream_name,
                lastSample: interpolatedSamples[interpolatedSamples.length - 1],
                sampleCount: interpolatedSamples.length
            }
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
