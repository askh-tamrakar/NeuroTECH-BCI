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
            samples: []
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
    // Merge updates to preserve label, sensor, channel etc.
    markedWindows = markedWindows.map(w => w.id === collectedWindow.id ? { ...w, ...collectedWindow } : w);
    notifyWindowsUpdate();

    // Check if we should auto-append in the main thread/where API lives
    if (autoCalibrate && collectedWindow.status === 'collected' && collectedWindow.label === targetLabel) {
        const readyBatchCount = markedWindows.filter(w => w.status === 'collected' && w.label === targetLabel).length;
        if (readyBatchCount >= autoLimit) {
            self.postMessage({ type: 'TRIGGER_AUTO_APPEND' });
        }
    }
}

function notifyWindowsUpdate() {
    self.postMessage({
        type: 'WINDOWS_UPDATED',
        payload: markedWindows
    });
}
