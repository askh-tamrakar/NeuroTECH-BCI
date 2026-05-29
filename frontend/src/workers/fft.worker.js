import { getPowerSpectrum } from '../utils/fft';

const broadcast = new BroadcastChannel('bci-data-stream');

const FFT_WINDOW_SIZE = 1024; // Power of 2 required by FFT algorithm
const SAMPLE_RATE = 512;
let channelBuffers = {};
let throttleLastFired = 0;

broadcast.onmessage = (e) => {
    if (e.data.type === 'DATA_BATCH') {
        const samples = e.data.samples;
        if (!samples || samples.length === 0) return;

        // Extract channels from batch
        samples.forEach(sample => {
            if (!sample.channels) return;
            Object.keys(sample.channels).forEach(ch => {
                let val = sample.channels[ch];
                if (typeof val === 'object' && val !== null) {
                    // Use filtered if available for cleaner FFT, otherwise raw value
                    val = val.filtered !== undefined ? val.filtered : (val.value !== undefined ? val.value : 0);
                }
                
                if (typeof val !== 'number' || isNaN(val)) return;

                if (!channelBuffers[ch]) {
                    channelBuffers[ch] = [];
                }
                channelBuffers[ch].push(val);
                
                // Keep buffer size limited to avoid growing indefinitely
                if (channelBuffers[ch].length > FFT_WINDOW_SIZE * 2) {
                    channelBuffers[ch] = channelBuffers[ch].slice(channelBuffers[ch].length - FFT_WINDOW_SIZE);
                }
            });
        });

        // Throttle FFT computation to roughly ~15 times per second (66ms)
        const now = Date.now();
        if (now - throttleLastFired < 66) return;
        throttleLastFired = now;

        const results = {};
        
        // Compute FFT for each channel
        Object.keys(channelBuffers).forEach(ch => {
            const buffer = channelBuffers[ch];
            if (buffer.length >= FFT_WINDOW_SIZE) {
                // Take the most recent FFT_WINDOW_SIZE samples
                const recentSlice = buffer.slice(-FFT_WINDOW_SIZE);
                const spectrum = getPowerSpectrum(recentSlice, SAMPLE_RATE);
                results[ch] = spectrum;
            }
        });

        if (Object.keys(results).length > 0) {
            postMessage({ type: 'FFT_RESULT', payload: results });
        }
    }
};
