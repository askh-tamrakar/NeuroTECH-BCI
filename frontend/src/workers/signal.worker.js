/* eslint-disable no-restricted-globals */

// State
let canvas = null;
let ctx = null;
let width = 0;
let height = 0;

// Data Storage
let points = [];
const MAX_POINTS = 50000;
let channelIndex = -1;

const broadcast = new BroadcastChannel('bci-data-stream');
broadcast.onmessage = (e) => {
    if (config.disabled) return;
    if (e.data.type === 'DATA_BATCH' && channelIndex !== -1) {
        const samples = e.data.samples;
        const newPoints = [];

        samples.forEach(s => {
            if (s.channels) {
                const chObj = s.channels[channelIndex] || s.channels[`ch${channelIndex}`] || s.channels[String(channelIndex)];
                const val = extractRawValue(chObj);
                newPoints.push({ time: s.timestamp, value: val });
            }
        });

        if (newPoints.length > 0) {
            addData(newPoints);
        }
    }
};

// Visual State
let config = {
    timeWindowMs: 10000,
    yMin: -1500,
    yMax: 1500,
    zoom: 1,
    manualRange: "",
    color: '#3b82f6',
    historyColor: '#3b82f64D',
    showGrid: true,
    channels: 1,
    themeAxisColor: '#aaaaaa',
    smoothing: false,
    disabled: false
};

let markedWindows = [];
let annotations = [];

let lastStatsTime = 0;
const STATS_INTERVAL = 250;

let timeOffset = 0;
let isOffsetInitialized = false;

let animationFrameId = null;
let envelopeState = 0;
const ENVELOPE_ALPHA = 0.05;

// EMA smoothing for EOG/EEG noise reduction
let emaState = null; // { chIdx: smoothedValue }
const EMA_ALPHA = 0.15; // lower = smoother

// Monotonicity Head to prevent "jitter" overlaps
let lastTsHead = 0;

const SCANNER_WIDTH_PX = 28; // Standardized "Brush" width for erasure

self.onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            init(payload);
            if (payload.channelIndex !== undefined) channelIndex = payload.channelIndex;
            break;
        case 'RESIZE':
            width = payload.width;
            height = payload.height;
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
                requestRender();
            }
            break;
        case 'ADD_DATA':
            addData(payload);
            break;
        case 'SET_CONFIG':
            config = { ...config, ...payload };
            if (payload.channelIndex !== undefined) channelIndex = payload.channelIndex;
            if (payload.displayMode !== undefined || payload.activeSensor !== undefined || payload.channelIndex !== undefined) {
                envelopeState = 0;
                emaState = null;  // Reset smoothing on sensor/mode switch
            }
            if (payload.color && !payload.historyColor) {
                config.historyColor = payload.color + '4D';
            }
            requestRender();
            break;
        case 'SET_WINDOWS':
            markedWindows = payload;
            requestRender();
            break;
        case 'SET_ANNOTATIONS':
            annotations = payload;
            requestRender();
            break;
        case 'CLEAR_DATA':
            points = [];
            envelopeState = 0;
            emaState = null;
            requestRender();
            break;
    }
};

function init(payload) {
    canvas = payload.canvas;
    ctx = canvas.getContext('2d', { alpha: true });
    width = payload.width;
    height = payload.height;
    if (payload.config) config = { ...config, ...payload.config };
    loop();
}

function addData(newPoints) {
    if (!newPoints || newPoints.length === 0) return;

    // 1. Sort incoming batch just in case it's unordered
    newPoints.sort((a, b) => a.time - b.time);

    // 2. Detect BACKWARD timestamp jumps only.
    //    Forward jumps are handled naturally by point eviction.
    //    Backward jumps freeze the stream (monotonicity filter rejects all) — must reset.
    const newestIncoming = newPoints[newPoints.length - 1].time;
    if (lastTsHead > 0 && newestIncoming < lastTsHead - 1000) {
        // Backward jump: accept new timeline without clearing visible data
        lastTsHead = 0;
        isOffsetInitialized = false;
    }

    // 3. Filter out samples that overlap previously processed time (JITTER FIX)
    const filteredPoints = newPoints.filter(p => p.time > lastTsHead);
    if (filteredPoints.length === 0) return;

    // 4. Update the global timestamp head
    const newestSampleTime = filteredPoints[filteredPoints.length - 1].time;
    lastTsHead = newestSampleTime;

    // 5. Auto-Sync Clock: Estimate lag
    const sysTime = Date.now();
    const currentLag = sysTime - newestSampleTime;

    if (!isOffsetInitialized) {
        timeOffset = currentLag;
        isOffsetInitialized = true;
    } else {
        timeOffset = timeOffset * 0.98 + currentLag * 0.02;
    }

    const normalizedPoints = filteredPoints.map((point) => {
        const rawValue = typeof point?.value === 'number' ? point.value : 0;
        // EMA smoothing for noise reduction
        if (emaState === null) emaState = rawValue;
        emaState = EMA_ALPHA * rawValue + (1 - EMA_ALPHA) * emaState;
        return {
            ...point,
            value: rawValue,
            smooth: emaState,
            envelope: updateEnvelope(rawValue)
        };
    });

    points.push(...normalizedPoints);

    // Cleanup: Keep slightly more than one window for scanner consistency
    const cutoff = newestSampleTime - (config.timeWindowMs * 1.5);
    let cutIndex = -1;
    for (let i = 0; i < points.length; i++) {
        if (points[i].time >= cutoff) {
            cutIndex = i;
            break;
        }
    }
    if (cutIndex > 0) {
        points = points.slice(cutIndex);
    }
}

function extractRawValue(chObj) {
    let rawValue = 0;
    if (chObj !== undefined) {
        if (typeof chObj === 'number') rawValue = chObj;
        else rawValue = chObj.value ?? 0;
    }
    return rawValue;
}

function updateEnvelope(rawValue) {
    const absValue = Math.abs(rawValue);
    envelopeState += ENVELOPE_ALPHA * (absValue - envelopeState);
    return envelopeState;
}

function getPointValue(point) {
    if (config.activeSensor === 'EMG' && config.displayMode === 'envelope') {
        return point.envelope ?? Math.abs(point.value ?? 0);
    }
    // Use EMA-smoothed value when smoothing is enabled (reduces noise for EOG/EEG)
    if (config.smoothing && point.smooth !== undefined) {
        return point.smooth;
    }
    return point.value ?? 0;
}

function checkStats(nowTime) {
    if (nowTime - lastStatsTime > STATS_INTERVAL) {
        lastStatsTime = nowTime;
        let min = 0, max = 0, mean = 0;
        if (points.length > 0) {
            const latestTs = points[points.length - 1].time;
            const cutoff = latestTs - config.timeWindowMs;
            let sum = 0, count = 0;
            min = Number.POSITIVE_INFINITY;
            max = Number.NEGATIVE_INFINITY;
            for (let i = points.length - 1; i >= 0; i--) {
                const p = points[i];
                if (p.time < cutoff) break;
                const pointValue = getPointValue(p);
                sum += pointValue;
                if (pointValue < min) min = pointValue;
                if (pointValue > max) max = pointValue;
                count++;
            }
            if (count > 0) mean = sum / count;
            else { min = 0; max = 0; mean = 0; }
        }
        self.postMessage({ type: 'STATS', payload: { min, max, mean } });
    }
}

function loop() {
    try { draw(); } catch (e) { console.error("Signal Worker Draw Error:", e); }
    animationFrameId = requestAnimationFrame(loop);
}

function requestRender() { }

function draw() {
    if (!ctx || width === 0 || height === 0) return;
    ctx.clearRect(0, 0, width, height);

    const nowSys = Date.now();
    let yMin = config.yMin;
    let yMax = config.yMax;

    if (config.manualRange && config.manualRange !== "" && !isNaN(parseFloat(config.manualRange))) {
        const r = parseFloat(config.manualRange);
        yMin = -r; yMax = r;
    } else {
        const span = (config.yMax - config.yMin) / config.zoom;
        const mid = (config.yMax + config.yMin) / 2;
        yMin = mid - span / 2;
        yMax = mid + span / 2;
    }

    const timeWindow = config.timeWindowMs;
    // JITTER FIX: Render time is derived from the static monotonic head
    const latestTs = lastTsHead || nowSys;
    const rangeStart = latestTs - timeWindow;

    if (points.length > 0) {
        let maxInView = -Infinity, minInView = Infinity;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].time < rangeStart) break;
            const v = getPointValue(points[i]);
            if (v > maxInView) maxInView = v;
            if (v < minInView) minInView = v;
        }
        if (maxInView > yMax || minInView < yMin) {
            // ECG: fixed scale — skip worker-side auto-expand (spikes would blow up Y axis)
            if (config.activeSensor !== 'ECG') {
                const maxAbs = Math.max(Math.abs(maxInView), Math.abs(minInView));
                const getNiceBound = (val) => {
                    if (val <= 0) return 1;
                    if (val < 1e-10) return 1e-10;
                    const mag = Math.pow(10, Math.floor(Math.log10(val)));
                    const norm = val / mag;
                    if (norm <= 1) return 1 * mag;
                    if (norm <= 2) return 2 * mag;
                    if (norm <= 5) return 5 * mag;
                    return 10 * mag;
                };
                const niceBound = getNiceBound(maxAbs);
                yMax = niceBound; yMin = -niceBound;
            }
        }
    }

    const yRange = yMax - yMin || 1;
    const paddingY = height * 0.1;
    const availH = height - 2 * paddingY;
    const valToPy = (val) => height - (paddingY + ((val - yMin) / yRange) * availH);

    ctx.font = '10px sans-serif';
    const textW1 = ctx.measureText(yMax.toFixed(0)).width;
    const textW2 = ctx.measureText(yMin.toFixed(0)).width;
    const pL = 10 + Math.max(textW1, textW2) + 12;
    const plW = width - pL;

    if (config.showGrid) drawGrid(yMin, yMax, valToPy, pL);

    // Baseline
    ctx.strokeStyle = config.themeAxisColor || '#aaaaaa';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    const zeroY = valToPy(0);
    ctx.moveTo(pL, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1.0;

    if (points.length === 0) return;
    checkStats(nowSys);

    const scannerPos = latestTs % timeWindow;
    const scannerPx = pL + (scannerPos / timeWindow) * plW;
    const cycleStartTs = latestTs - scannerPos;
    const timeToPx = (t_abs) => pL + ((t_abs % timeWindow) / timeWindow) * plW;

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    const drawSegment = (startIdx, endIdx, color, thickness, glow = false) => {
        if (startIdx > endIdx || startIdx < 0 || endIdx >= points.length) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 6; }
        else { ctx.shadowBlur = 0; }
        ctx.beginPath();
        let lastPx = -1;
        for (let i = startIdx; i <= endIdx; i++) {
            const p = points[i];
            const px = timeToPx(p.time);
            const py = valToPy(getPointValue(p));
            if (i === startIdx || Math.abs(px - lastPx) > plW * 0.5) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
            lastPx = px;
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
    };

    const erasureTimeMs = (SCANNER_WIDTH_PX / plW) * timeWindow;
    const historyEndTs = cycleStartTs - erasureTimeMs;

    let splitIndex = 0;
    for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].time < cycleStartTs) { splitIndex = i + 1; break; }
    }
    
    // Find point where history actually ends (before erasure gap)
    let historyEndIndex = splitIndex - 1;
    for (let i = splitIndex - 1; i >= 0; i--) {
        if (points[i].time < historyEndTs) { historyEndIndex = i; break; }
    }

    let startIndex = 0;
    for (let i = historyEndIndex; i >= 0; i--) {
        if (points[i].time < rangeStart) { startIndex = i + 1; break; }
    }

    // Modern Scan Line Erasure: Active "L-R Brush"
    // 1. Draw Older History (faint)
    ctx.globalAlpha = 0.6;
    drawSegment(startIndex, historyEndIndex, config.historyColor, 3.0, false);
    
    // 2. Draw Current New Signal (Bright + Glow)
    ctx.globalAlpha = 1.0;
    drawSegment(splitIndex, points.length - 1, config.color, 3.0, true);

    if (markedWindows.length > 0) {
        markedWindows.forEach(win => {
            if (latestTs - win.endTime < timeWindow * 1.5) {
                const px1 = pL + ((win.startTime % timeWindow) / timeWindow) * plW;
                const px2 = pL + ((win.endTime % timeWindow) / timeWindow) * plW;
                let wFunc = px2 - px1;
                if (wFunc < 0) wFunc += plW;
                const getWColor = (s, m) => m ? 'rgba(239, 68, 68, 0.35)' : (s === 'correct' ? 'rgba(16, 185, 129, 0.35)' : 'rgba(245, 158, 11, 0.35)');
                ctx.fillStyle = getWColor(win.status, win.isMissedActual);
                ctx.fillRect(px1, 0, wFunc, height);
                ctx.strokeStyle = win.isMissedActual ? '#ef4444' : (win.status === 'correct' ? '#10b981' : '#f59e0b');
                ctx.lineWidth = 2;
                ctx.strokeRect(px1, 0, wFunc, height);
            }
        });
    }

    if (annotations.length > 0) {
        annotations.forEach(ann => {
            if (latestTs - ann.x < timeWindow * 1.5) {
                const px = pL + ((ann.x % timeWindow) / timeWindow) * plW;
                // Blink dots: use fixed Y position (80% from top) if ann.y not set, instead of wiggling signal value
                const py = ann.y !== undefined ? valToPy(ann.y) : valToPy(yMax * 0.8);
                ctx.fillStyle = ann.color || "red";
                ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
            }
        });
    }

    // 3. Scanner Line (Wiper)
    // Draw a "Wiper Block" instead of just a dashed line to act as a physical eraser
    const wiperGradient = ctx.createLinearGradient(scannerPx - 2, 0, scannerPx + SCANNER_WIDTH_PX, 0);
    wiperGradient.addColorStop(0, config.color);
    wiperGradient.addColorStop(0.1, config.color);
    wiperGradient.addColorStop(0.3, 'rgba(0, 0, 0, 0)'); // Fades into the blank erasure zone

    ctx.strokeStyle = wiperGradient;
    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    ctx.moveTo(scannerPx, 0);
    ctx.lineTo(scannerPx, height);
    ctx.stroke();

    // Pulse at lead
    if (points.length > 0) {
        const py = valToPy(getPointValue(points[points.length - 1]));
        ctx.fillStyle = config.color; 
        ctx.shadowColor = config.color; 
        ctx.shadowBlur = 12;
        ctx.beginPath(); 
        ctx.arc(scannerPx, py, 5, 0, Math.PI * 2); 
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1.0;
}

function drawGrid(yMin, yMax, valToPy, pL) {
    ctx.strokeStyle = config.themeGridColor || config.themeAxisColor || '#aaaaaa';
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    const plW = width - pL;
    const paddingY = height * 0.1;
    const availH = height - 2 * paddingY;
    const tickCount = 7;

    ctx.beginPath();
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < tickCount; i++) {
        const norm = i / (tickCount - 1);
        const y = paddingY + norm * availH;
        const val = yMax - norm * (yMax - yMin);

        ctx.beginPath();
        ctx.moveTo(pL, y); ctx.lineTo(width, y);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#555555'; // Use a solid, visible gray if theme colors are too faint
        if (config.themeAxisColor) ctx.strokeStyle = config.themeAxisColor;
        ctx.globalAlpha = 0.45; // Subtle but definite
        ctx.stroke();

        ctx.fillStyle = config.themeAxisColor || '#9ca3af';
        ctx.globalAlpha = 1.0;
        ctx.fillText(val.toFixed(1), 10, y);
    }

    const timeTotal = config.timeWindowMs / 1000;

    // Dynamic tick step based on the total time window
    let tickStep = 2; // Default
    if (timeTotal <= 2) tickStep = 0.2;
    else if (timeTotal <= 5) tickStep = 0.5;
    else if (timeTotal <= 15) tickStep = 1;
    else if (timeTotal <= 30) tickStep = 2;
    else tickStep = 5;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Using a more robust loop for float-based steps
    for (let s = 0; s <= timeTotal + 0.001; s += tickStep) {
        // Fix potential floating point issues for the label text
        const labelText = s % 1 === 0 ? `${s}s` : `${s.toFixed(1)}s`;
        const x_px = pL + (s / timeTotal) * plW;

        ctx.fillStyle = config.themeAxisColor || '#9ca3af';
        ctx.globalAlpha = 1.0;

        if (s === 0) ctx.textAlign = 'left';
        else if (s >= timeTotal - 0.001) ctx.textAlign = 'right';
        else ctx.textAlign = 'center';

        ctx.fillText(labelText, x_px, height - 20);


    }
    ctx.setLineDash([]); ctx.globalAlpha = 1.0;
}
