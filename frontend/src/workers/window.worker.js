/* eslint-disable no-restricted-globals */

// State
let activeSensor = 'EMG';
let activeChannelIndex = 0;
let targetLabel = 'Rock';
let mode = 'collection';
let autoLimit = 30;
let autoCalibrate = false;
let batchSize = 5;
let numBatches = 6;
let windowDuration = 1500;
let timeWindow = 5000;
let isCalibrationMode = false;
let calibrationPerClassLimit = 5;
const GAP_DURATION = 500;
const COUNTABLE_STATUSES = new Set(['pending', 'recording', 'collected', 'saved', 'correct']);
let currentBatchIndex = 0;

let windowTimer = null;
let markedWindows = [];
let deletedWindowIds = new Set();
let latestSignalTime = Date.now();
let prevSignalTime = 0; // Track previous signal time for jump detection
const MAX_WINDOWS = 2000;
const PREVIEW_POINTS = 72;

// Pending collection queue: windows waiting for signal time to pass their endTime
let pendingCollections = [];

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
            if (payload.batchSize !== undefined) batchSize = payload.batchSize;
            if (payload.numBatches !== undefined) numBatches = payload.numBatches;
            if (payload.windowDuration !== undefined) windowDuration = payload.windowDuration;
            if (payload.timeWindow !== undefined) timeWindow = payload.timeWindow;
            if (payload.isCalibrationMode !== undefined) isCalibrationMode = payload.isCalibrationMode;
            if (payload.calibrationPerClassLimit !== undefined) calibrationPerClassLimit = payload.calibrationPerClassLimit;

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
            if (payload.batchSize !== undefined) batchSize = payload.batchSize;
            if (payload.numBatches !== undefined) numBatches = payload.numBatches;
            if (payload.windowDuration !== undefined) windowDuration = payload.windowDuration;
            if (payload.timeWindow !== undefined) timeWindow = payload.timeWindow;
            if (payload.isCalibrationMode !== undefined) isCalibrationMode = payload.isCalibrationMode;
            if (payload.calibrationPerClassLimit !== undefined) calibrationPerClassLimit = payload.calibrationPerClassLimit;
            break;
        case 'UPDATE_SIGNAL_TIME':
            prevSignalTime = latestSignalTime;
            latestSignalTime = payload;
            
            // Detect large timestamp jumps (>3s) — invalidate stale pending collections
            if (prevSignalTime > 0 && Math.abs(latestSignalTime - prevSignalTime) > 3000) {
                pendingCollections = [];
            }
            
            // Signal-time-based collection: check if any pending windows are ready
            checkPendingCollections();
            break;
        case 'START_WINDOWING':
            if (payload?.label !== undefined) targetLabel = payload.label;
            startAutoWindowing(payload || {});
            break;
        case 'STOP_WINDOWING':
            stopAutoWindowing(true); // explicit stop: cancel all pending windows
            notifyWindowsUpdate(); // push updated error statuses immediately
            break;
        case 'WINDOW_COLLECTED':
            handleWindowCollected(payload);
            break;
        case 'BATCH_WINDOW_COLLECTED':
            // Accept an array of {id, status, features, predictedLabel, windows_saved} updates
            // and apply them all at once — one notifyWindowsUpdate() at the end
            if (Array.isArray(payload)) {
                payload.forEach(item => {
                    if (deletedWindowIds.has(item.id)) return;
                    const existingIdx = markedWindows.findIndex(w => w.id === item.id);
                    if (existingIdx !== -1) {
                        markedWindows = markedWindows.map((w, i) =>
                            i === existingIdx ? { ...w, ...item } : w
                        );
                    }
                });
                notifyWindowsUpdate();
            }
            break;
        case 'DELETE_WINDOW':
            deletedWindowIds.add(payload);
            markedWindows = markedWindows.filter(w => w.id !== payload);
            notifyWindowsUpdate();
            break;
        case 'CLEAR_ALL_WINDOWS':
            markedWindows.forEach((window) => deletedWindowIds.add(window.id));
            markedWindows = [];
            pendingCollections = [];
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
            startAutoWindowing(payload || {});
            break;
    }
};

function startAutoWindowing(options = {}) {
    stopAutoWindowing(true); // starting fresh: discard any stale pending from previous run

    const desiredBatchSize = Math.max(1, Number(options.batchSize || batchSize || 1));
    currentBatchIndex = autoCalibrate ? Math.max(1, Number(options.batchIndex || currentBatchIndex || 1)) : 0;
    const cadenceMs = windowDuration + GAP_DURATION;

    const createNextWindow = () => {
        if (mode === 'recording') return; // Handled manually

        const currentBatchCount = autoCalibrate
            ? markedWindows.filter((window) =>
                Number(window.batchIndex || 0) === currentBatchIndex && COUNTABLE_STATUSES.has(window.status)
            ).length
            : isCalibrationMode
                ? markedWindows.filter((window) =>
                    window.label === targetLabel && COUNTABLE_STATUSES.has(window.status)
                ).length
                : markedWindows.filter((window) => COUNTABLE_STATUSES.has(window.status)).length;

        if (autoCalibrate && currentBatchCount >= desiredBatchSize) {
            self.postMessage({
                type: 'BATCH_PRODUCTION_COMPLETE',
                payload: {
                    batchIndex: currentBatchIndex,
                    batchSize: desiredBatchSize,
                    totalBatches: numBatches,
                }
            });
            stopAutoWindowing();
            return;
        }
        const effectiveLimit = isCalibrationMode ? calibrationPerClassLimit : autoLimit;
        if (!autoCalibrate && currentBatchCount >= effectiveLimit) {
            stopAutoWindowing();
            return;
        }

        const delayToCenter = Math.round(timeWindow / 2);
        const start = latestSignalTime + delayToCenter;
        const end = start + windowDuration;

        const labelForWindow = getLabelForWindow();

        const newWindow = {
            id: Math.random().toString(36).substr(2, 9),
            createdAtMs: Date.now(),
            sensor: activeSensor,
            mode: mode === 'collection' ? 'collection' : 'test',
            startTime: start,
            endTime: end,
            label: labelForWindow,
            channel: activeChannelIndex,
            status: 'pending',
            samples: [],
            captureWindowMs: windowDuration,
            batchIndex: currentBatchIndex
        };

        deletedWindowIds.delete(newWindow.id);
        markedWindows = [...markedWindows, newWindow].slice(-MAX_WINDOWS);
        notifyWindowsUpdate();

        // Queue for signal-time-based collection instead of wall-clock setTimeout.
        // The window will be collected when latestSignalTime passes endTime + buffer.
        pendingCollections.push({
            id: newWindow.id,
            start,
            end,
            createdAt: Date.now()
        });

        windowTimer = setTimeout(createNextWindow, cadenceMs);
    };

    createNextWindow();
}

function stopAutoWindowing(cancelPending = false) {
    if (windowTimer) {
        clearTimeout(windowTimer);
        windowTimer = null;
    }
    // cancelPending=true: explicit user stop or starting a fresh run.
    //   Wipe pendingCollections so stale windows don't inflate the count on
    //   resume and map them to error so the produced count stays consistent.
    // cancelPending=false (default): auto-stop because count reached the limit.
    //   The windows that were already scheduled MUST be allowed to finish
    //   collection — do NOT clear pendingCollections or mark them error.
    if (cancelPending) {
        pendingCollections = [];
        markedWindows = markedWindows.map(w =>
            (w.status === 'pending' || w.status === 'recording')
                ? { ...w, status: 'error' }
                : w
        );
    }
}

// Signal-time-based collection: fires REQUEST_SAMPLES only when the
// data stream has actually advanced past the window's endTime.
// This replaces the old wall-clock setTimeout approach that would fire
// before data had actually arrived (causing "error" status windows).
function checkPendingCollections() {
    if (pendingCollections.length === 0) return;
    
    const COLLECTION_BUFFER_MS = 200; // Wait 200ms past endTime for safety
    const STALE_TIMEOUT_MS = 30000;   // Expire after 30s wall-clock to avoid leaks
    const now = Date.now();
    
    const ready = [];
    const remaining = [];
    
    for (const pc of pendingCollections) {
        if (deletedWindowIds.has(pc.id)) continue; // Skip deleted
        
        if (latestSignalTime >= pc.end + COLLECTION_BUFFER_MS) {
            ready.push(pc);
        } else if (now - pc.createdAt > STALE_TIMEOUT_MS) {
            // Timed out — mark as error
            self.postMessage({
                type: 'REQUEST_SAMPLES',
                payload: { id: pc.id, start: pc.start, end: pc.end, delay: 0 }
            });
        } else {
            remaining.push(pc);
        }
    }
    
    pendingCollections = remaining;
    
    for (const pc of ready) {
        self.postMessage({
            type: 'REQUEST_SAMPLES',
            payload: { id: pc.id, start: pc.start, end: pc.end, delay: 0 }
        });
    }
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
    if (deletedWindowIds.has(collectedWindow.id)) {
        return;
    }
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
const UPDATE_THROTTLE_MS = 300; // ~3Hz — reduces main-thread React reconciliation burden
const DISPLAY_WINDOW_TAIL = 300; // only last N windows sent; older ones only live in worker

function notifyWindowsUpdate() {
    if (updateThrottleTimeout) return;

    updateThrottleTimeout = setTimeout(() => {
        // Compute counts in the worker so the main thread never needs to filter a large array
        const producedCount = markedWindows.filter(
            w => w.status === 'collected' || w.status === 'saved' || w.status === 'correct'
        ).length;

        self.postMessage({
            type: 'WINDOWS_UPDATED',
            payload: {
                windows: markedWindows.slice(-DISPLAY_WINDOW_TAIL).map(toWindowSummary),
                counts: {
                    produced: producedCount,
                    total: markedWindows.length,
                },
            },
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
