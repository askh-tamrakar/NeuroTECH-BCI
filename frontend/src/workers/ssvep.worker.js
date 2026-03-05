/**
 * SSVEP High-Performance Flicker Worker
 * Bypasses main thread for jitter-free animation
 */

let canvas = null;
let ctx = null;
let configs = [];
let brightness = 1.0;
let refreshRate = 60;
let running = false;
let protocolMode = false;
let protocolState = 'IDLE';
let currentTrialIdx = -1;
let trials = [];

let startTime = 0;
let frameCount = 0;
let lastStateChange = 0;

const COLORS = {
    ON: (alpha) => `rgba(245, 245, 245, ${alpha})`,
    OFF: 'rgb(5, 5, 5)',
    CUE: 'rgb(245, 245, 245)',
    DIM: 'rgb(40, 40, 40)',
    BLACK: 'rgb(0, 0, 0)',
    BORDER: '#333333',
    TARGET_BORDER: '#ffffff'
};

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            canvas = payload.canvas;
            ctx = canvas.getContext('2d', { alpha: false });
            configs = payload.configs;
            brightness = payload.brightness;
            refreshRate = payload.refreshRate;
            console.log('[SSVEP Worker] Initialized');
            break;

        case 'UPDATE_CONFIGS':
            configs = payload.configs;
            break;

        case 'UPDATE_BRIGHTNESS':
            brightness = payload.brightness;
            break;

        case 'UPDATE_REFRESH_RATE':
            refreshRate = payload.refreshRate;
            break;

        case 'START':
            running = true;
            startTime = performance.now();
            frameCount = 0;
            animate();
            break;

        case 'STOP':
            running = false;
            break;

        case 'PROTOCOL_START':
            trials = payload.trials;
            currentTrialIdx = 0;
            protocolMode = true;
            protocolState = 'REST';
            lastStateChange = performance.now();
            running = true;
            startTime = performance.now();
            frameCount = 0;
            animate();
            break;

        case 'RESIZE':
            if (canvas) {
                canvas.width = payload.width;
                canvas.height = payload.height;
            }
            break;
    }
};

function animate() {
    if (!running) {
        // Clear canvas to black when stopped
        if (ctx) {
            ctx.fillStyle = '#000000';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return;
    }

    const now = performance.now();
    const elapsed = now - startTime;
    frameCount++;

    updateProtocolState(now);
    render(elapsed);

    requestAnimationFrame(animate);
}

function updateProtocolState(now) {
    if (!protocolMode) return;

    const stateElapsed = now - lastStateChange;
    const DURATIONS = {
        CUE: 2000,
        STIM: 5000,
        REST: 2000
    };

    if (protocolState === 'REST' && stateElapsed > DURATIONS.REST) {
        protocolState = 'CUE';
        lastStateChange = now;
        self.postMessage({ type: 'PROTOCOL_UPDATE', state: 'CUE' });
    } else if (protocolState === 'CUE' && stateElapsed > DURATIONS.CUE) {
        protocolState = 'STIM';
        lastStateChange = now;
        self.postMessage({ type: 'PROTOCOL_UPDATE', state: 'STIM' });
    } else if (protocolState === 'STIM' && stateElapsed > DURATIONS.STIM) {
        if (currentTrialIdx < trials.length - 1) {
            currentTrialIdx++;
            protocolState = 'REST';
            lastStateChange = now;
            self.postMessage({ type: 'PROTOCOL_UPDATE', state: 'REST', trialIdx: currentTrialIdx });
        } else {
            protocolMode = false;
            running = false;
            self.postMessage({ type: 'PROTOCOL_FINISHED' });
        }
    }
}

function render(elapsed) {
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const padding = 40;
    const cols = 3;
    const rows = 2;
    const gridW = (w - (cols + 1) * padding) / cols;
    const gridH = (h - (rows + 1) * padding) / rows;

    const isFlickering = (!protocolMode) || (protocolMode && protocolState === 'STIM');

    // Clear background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    configs.forEach((cfg, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = padding + col * (gridW + padding);
        const y = padding + row * (gridH + padding);

        let isOn = false;
        if (isFlickering && cfg.enabled) {
            const hz = Number(cfg.freq) || 1;
            // Frame-accurate flicker using sine wave over frame count
            // This aligns better with monitor refresh cycles
            isOn = Math.sin(2 * Math.PI * hz * (frameCount / refreshRate)) > 0;

            ctx.fillStyle = isOn ? COLORS.ON(brightness) : COLORS.OFF;
            ctx.fillRect(x, y, gridW, gridH);
        } else {
            if (protocolMode && protocolState === 'CUE') {
                const isTarget = trials[currentTrialIdx] === cfg.id;
                ctx.fillStyle = isTarget ? COLORS.CUE : COLORS.DIM;
                ctx.fillRect(x, y, gridW, gridH);

                if (isTarget) {
                    ctx.strokeStyle = COLORS.TARGET_BORDER;
                    ctx.lineWidth = 4;
                    ctx.strokeRect(x, y, gridW, gridH);
                }
            } else {
                ctx.fillStyle = COLORS.DIM;
                ctx.fillRect(x, y, gridW, gridH);
            }
        }

        // Fixation Cross & Labels
        const labelText = cfg.label || `Target ${idx + 1}`;
        const keyText = cfg.mappedKey !== 'None' ? cfg.mappedKey : '-';

        ctx.fillStyle = isOn && isFlickering && cfg.enabled ? '#000000' : '#ffffff';

        ctx.textAlign = 'center';

        // Draw mapped key (large)
        ctx.font = 'bold 50px sans-serif';
        ctx.textBaseline = 'middle';
        ctx.fillText(keyText, x + gridW / 2, y + gridH / 2 + 10);

        // Draw label (small, top)
        ctx.font = 'bold 16px sans-serif';
        ctx.textBaseline = 'top';
        ctx.globalAlpha = 0.5;
        ctx.fillText(labelText, x + gridW / 2, y + 20);
        ctx.globalAlpha = 1.0;
    });

    // Photodiode Marker (Bottom Left)
    const pdSize = 64;
    if (isFlickering) {
        const isWhite = frameCount % 2 === 0;
        ctx.fillStyle = isWhite ? '#ffffff' : '#000000';
    } else {
        ctx.fillStyle = '#000000';
    }
    ctx.fillRect(0, h - pdSize, pdSize, pdSize);
}
