/* eslint-disable no-restricted-globals */

// State
let activeSensor = 'EMG';
let activeChannelIndex = 0;
let targetLabel = 'Rock';
let mode = 'collection';
let autoLimit = 30;
let autoCalibrate = false;
let windowDuration = 1500;
let timeWindow = 5000;
const GAP_DURATION = 500;

let windowInterval = null;
let markedWindows = [];
let latestSignalTime = Date.now();
const MAX_WINDOWS = 2000;
const PREVIEW_POINTS = 72;

// --- Message Handler ---
self.onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            // Object.assign(self, payload) doesn't update top-level 'let' variables.
            if (payload.activeSensor !== undefined) activeSensor = payload.activeSensor;
            if (payload.activeChannelIndex !== undefined) activeChannelIndex = payload.activeChannelIndex;
            if (payload.targetLabel !== undefined) targetLabel = payload.targetLabel;
            if (payload.mode !== undefined) mode = payload.mode;
            if (payload.autoLimit !== undefined) autoLimit = payload.autoLimit;
            if (payload.autoCalibrate !== undefined) autoCalibrate = payload.autoCalibrate;
            if (payload.windowDuration !== undefined) windowDuration = payload.windowDuration;
            if (payload.timeWindow !== undefined) timeWindow = payload.timeWindow;

            if (payload.isCalibrating) {
                startAutoWindowing();
            }
            break;
        case 'UPDATE_STATE':
            if (payload.activeSensor !== undefined) activeSensor = payload.activeSensor;
            if (payload.activeChannelIndex !== undefined) activeChannelIndex = payload.activeChannelIndex;
            if (payload.targetLabel !== undefined) targetLabel = payload.targetLabel;
            if (payload.mode !== undefined) mode = payload.mode;
            if (payload.autoLimit !== undefined) autoLimit = payload.autoLimit;
            if (payload.autoCalibrate !== undefined) autoCalibrate = payload.autoCalibrate;
            if (payload.windowDuration !== undefined) windowDuration = payload.windowDuration;
            if (payload.timeWindow !== undefined) timeWindow = payload.timeWindow;
            break;
        case 'UPDATE_SIGNAL_TIME':
            latestSignalTime = payload;
            break;
        case 'START_WINDOWING':
            startAutoWindowing();
            break;
        case 'STOP_WINDOWING':
            if (windowInterval) {
                clearInterval(windowInterval);
                windowInterval = null;
            }
            break;
        case 'WINDOW_COLLECTED':
            handleWindowCollected(payload);
            break;
        case 'DELETE_WINDOW':
            markedWindows = markedWindows.filter(w => w.id !== payload);
            notifyWindowsUpdate();
            break;
        case 'CLEAR_ALL_WINDOWS':
            markedWindows = [];
            notifyWindowsUpdate();
            break;
        case 'GET_WINDOWS_FULL':
            self.postMessage({
                type: 'WINDOWS_FULL_RESULT',
                payload: {
                    requestId: payload?.requestId,
                    windows: getFullWindows(payload?.ids || []),
                }
            });
            break;
        case 'RESUME_NEXT_BATCH':
            startAutoWindowing();
            break;
    }
};

function startAutoWindowing() {
    if (windowInterval) clearInterval(windowInterval);

    const createNextWindow = () => {
        if (mode === 'recording') return; // Handled manually

        const currentBatchCount = markedWindows.filter(w =>
            w.label === targetLabel &&
            (w.status === 'pending' || w.status === 'collected')
        ).length;

        if (autoCalibrate && currentBatchCount >= autoLimit) {
            // Stop production interval once batch limit is reached
            if (windowInterval) {
                console.log(`[WindowWorker] Batch limit (${autoLimit}) reached. Stopping interval.`);
                clearInterval(windowInterval);
                windowInterval = null;
            }
            return;
        }

        const delayToCenter = Math.round(timeWindow / 2);
        const start = latestSignalTime + delayToCenter;
        const end = start + windowDuration;

        const labelForWindow = getLabelForWindow();

        const newWindow = {
            id: Math.random().toString(36).substr(2, 9),
            sensor: activeSensor,
            mode: mode === 'collection' ? 'collection' : 'test',
            startTime: start,
            endTime: end,
            label: labelForWindow,
            channel: activeChannelIndex,
            status: 'pending',
            samples: [],
            captureWindowMs: windowDuration
        };

        markedWindows = [...markedWindows, newWindow].slice(-MAX_WINDOWS);
        notifyWindowsUpdate();

        // Request samples from main thread (which gets them from chart worker)
        self.postMessage({
            type: 'REQUEST_SAMPLES',
            payload: {
                id: newWindow.id,
                start,
                end,
                delay: delayToCenter + windowDuration + 100
            }
        });
    };

    createNextWindow();
    windowInterval = setInterval(createNextWindow, windowDuration + GAP_DURATION);
}

function getLabelForWindow() {
    if (mode === 'test') {
        const LABELS = {
            'EMG': ['Rock', 'Paper', 'Scissors', 'Rest'],
            'EOG': ['SingleBlink', 'DoubleBlink', 'Rest']
        };
        const options = LABELS[activeSensor] || ['Rest'];
        return options[Math.floor(Math.random() * options.length)];
    }
    return targetLabel;
}

function handleWindowCollected(collectedWindow) {
    const nextWindow = mergeWindow(collectedWindow);
    const existingIndex = markedWindows.findIndex((window) => window.id === nextWindow.id);

    if (existingIndex === -1) {
        markedWindows = [...markedWindows, nextWindow].slice(-MAX_WINDOWS);
    } else {
        markedWindows = markedWindows.map((window, index) => (
            index === existingIndex ? nextWindow : window
        ));
    }

    notifyWindowsUpdate();

    // Check if we should auto-append in the main thread/where API lives
    if (autoCalibrate && nextWindow.status === 'collected' && nextWindow.label === targetLabel) {
        const readyBatchCount = markedWindows.filter(w => w.status === 'collected' && w.label === targetLabel).length;
        if (readyBatchCount >= autoLimit) {
            self.postMessage({ type: 'TRIGGER_AUTO_APPEND' });
        }
    }
}

let updateThrottleTimeout = null;
const UPDATE_THROTTLE_MS = 100; // 10Hz

function notifyWindowsUpdate() {
    if (updateThrottleTimeout) return;

    updateThrottleTimeout = setTimeout(() => {
        self.postMessage({
            type: 'WINDOWS_UPDATED',
            payload: markedWindows.map(toWindowSummary)
        });
        updateThrottleTimeout = null;
    }, UPDATE_THROTTLE_MS);
}

function mergeWindow(collectedWindow) {
    const existing = markedWindows.find((window) => window.id === collectedWindow.id) || {};
    const merged = {
        ...existing,
        ...collectedWindow,
    };

    if (collectedWindow.sampleMode === 'preview') {
        if (Array.isArray(collectedWindow.samples)) {
            merged.previewSamples = collectedWindow.samples.slice();
        }
        if (!Array.isArray(merged.samples) && Array.isArray(existing.samples)) {
            merged.samples = existing.samples;
        }
    } else if (Array.isArray(collectedWindow.samples)) {
        merged.samples = collectedWindow.samples.slice();
        merged.previewSamples = downsampleSamples(collectedWindow.samples);
    }

    if (!Array.isArray(merged.previewSamples)) {
        merged.previewSamples = downsampleSamples(merged.samples || []);
    }

    if (Array.isArray(collectedWindow.timestamps) && collectedWindow.sampleMode !== 'preview') {
        merged.timestamps = collectedWindow.timestamps.slice();
    }

    return merged;
}

function toWindowSummary(window) {
    const {
        samples,
        timestamps,
        previewSamples,
        ...rest
    } = window;

    return {
        ...rest,
        samples: Array.isArray(previewSamples) ? previewSamples.slice() : downsampleSamples(samples || []),
    };
}

function getFullWindows(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
        return markedWindows.map(cloneWindow);
    }
    const idSet = new Set(ids);
    return markedWindows.filter((window) => idSet.has(window.id)).map(cloneWindow);
}

function cloneWindow(window) {
    return {
        ...window,
        samples: Array.isArray(window.samples) ? window.samples.slice() : [],
        timestamps: Array.isArray(window.timestamps) ? window.timestamps.slice() : [],
        previewSamples: Array.isArray(window.previewSamples) ? window.previewSamples.slice() : [],
    };
}

function downsampleSamples(samples, maxPoints = PREVIEW_POINTS) {
    if (!Array.isArray(samples) || samples.length === 0) return [];
    if (samples.length <= maxPoints) return samples.slice();
    if (maxPoints <= 1) return [Number(samples[0] || 0)];

    const lastIndex = samples.length - 1;
    return Array.from({ length: maxPoints }, (_, index) => {
        const sourceIndex = Math.round((index / (maxPoints - 1)) * lastIndex);
        return Number(samples[sourceIndex] || 0);
    });
}
