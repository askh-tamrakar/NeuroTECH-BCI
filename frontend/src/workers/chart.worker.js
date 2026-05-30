/* eslint-disable no-restricted-globals */

// State
let canvas = null;
let ctx = null;
let width = 0;
let height = 0;

// Data Storage
// We keep a bounded buffer of points with time-based eviction.
// At 1000Hz, 30s = 30000 points. We keep 60s max to cover any time window.
let points = [];
const MAX_POINTS = 60000;
let channelIndex = -1; // To be set via INIT or SET_CONFIG

const broadcast = new BroadcastChannel('bci-data-stream');
broadcast.onmessage = (e) => {
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
let windows = []; // { id, start, end, type }
let config = {
    timeWindow: 5000, // ms
    yMin: 0,
    yMax: 100,
    zoom: 1,
    offset: 0,
    lineColor: 'var(--graph-line-1, #00ff00)',
    bgColor: 'transparent', // Use transparent to show CSS background or passed theme
    gridColor: 'var(--graph-grid, #333333)',
    textColor: 'var(--graph-text, #888888)',
    surface: 'var(--panel-bg, #1e1e1e)',
    themeAxisColor: 'var(--graph-text, #9ca3af)',
    themeColor: 'var(--graph-grid, #333)',
    windowStyles: {
        pending: { fill: 'rgba(245, 158, 11, 0.18)', stroke: '#f59e0b', text: '#f8fafc' },
        collected: { fill: 'rgba(56, 189, 248, 0.18)', stroke: '#38bdf8', text: '#f8fafc' },
        saved: { fill: 'rgba(16, 185, 129, 0.16)', stroke: '#10b981', text: '#f8fafc' },
        error: { fill: 'rgba(244, 63, 94, 0.16)', stroke: '#f43f5e', text: '#f8fafc' }
    },
    // Recorded-mode fields
    recordedMode: false,
    recordingStartMs: 0,   // absolute ms of recording start (for x-axis labels)
    sampleRate: 512,       // used for px-per-sample calculation
    manualRenderTime: null, // when set, getRenderNow() returns this instead of live clock
    previewPixelX: null,   // draw-mode hover preview pixel position (null = hidden)
    previewWindowMs: 900,  // draw-mode preview window duration (ms)
};

// Scanner State
let scannerX = null;
let scannerValue = null;
let envelopeState = 0;
const ENVELOPE_ALPHA = 0.05;

// Animation
let animationFrameId = null;

// Latency Compensation
let timeOffset = 0;
let isOffsetInitialized = false;

// Monotonicity Head
let lastTsHead = 0;

// --- Message Handler ---
self.onmessage = function (e) {
    const { type, payload, idPromise } = e.data;

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
        case 'UPDATE_WINDOWS':
            windows = payload;
            requestRender();
            break;
        case 'SET_CONFIG':
            config = { ...config, ...payload };
            if (payload.channelIndex !== undefined) channelIndex = payload.channelIndex;
            if (payload.displayMode !== undefined || payload.activeSensor !== undefined) {
                envelopeState = 0;
            }
            requestRender();
            break;
        case 'SET_SCANNER':
            scannerX = payload.x;
            scannerValue = payload.value;
            requestRender();
            break;
        case 'GET_SAMPLES':
            handleGetSamples(payload, idPromise);
            break;
        case 'CALC_SELECTION':
            handleCalcSelection(payload);
            break;
        case 'CLEAR_DATA':
            points = [];
            envelopeState = 0;
            config.manualRenderTime = null;
            requestRender();
            break;
        // --- Recorded-mode controls ---
        case 'SET_RENDER_TIME':
            // Jump the viewport to a specific absolute timestamp (ms)
            config.manualRenderTime = payload.ms;
            requestRender();
            break;
        case 'PAN_VIEW': {
            // Pan left/right by deltaPx pixels (positive = pan right = reveal earlier data)
            const { deltaPx } = payload;
            const leftMargin = 45;
            const drawWidth = width - leftMargin;
            const msPerPx = config.timeWindow / drawWidth;
            const deltaMs = deltaPx * msPerPx;
            if (config.manualRenderTime == null) {
                config.manualRenderTime = getRenderNow();
            }
            config.manualRenderTime += deltaMs;
            requestRender();
            break;
        }
        case 'ZOOM_Y': {
            // Zoom in/out on Y axis; factor > 1 = zoom in (shrink range)
            const { factor: yFactor } = payload;
            const midY = (config.yMin + config.yMax) / 2;
            const halfRange = (config.yMax - config.yMin) / 2;
            const newHalf = halfRange / yFactor;
            config.yMin = midY - newHalf;
            config.yMax = midY + newHalf;
            requestRender();
            break;
        }
        case 'ZOOM_X': {
            // Zoom in/out on X axis; factor > 1 = zoom in (shrink timeWindow)
            // Clamped: 3 s minimum, 20 s maximum
            const { factor: xFactor } = payload;
            const newTw = Math.min(20000, Math.max(3000, config.timeWindow / xFactor));
            config.timeWindow = newTw;
            requestRender();
            break;
        }
        case 'DRAW_PREVIEW':
            // Show/hide annotation preview rectangle at mouse position
            config.previewPixelX = payload.pixelX ?? null;
            if (payload.windowDurationMs != null) config.previewWindowMs = payload.windowDurationMs;
            requestRender();
            break;
    }
};

function handleCalcSelection(payload) {
    const { x1, x2 } = payload;
    if (points.length === 0) return;

    const now = getRenderNow();
    const timeWindow = config.timeWindow;
    const centerTimeOffset = timeWindow / 2;

    const leftMargin = 50;
    const drawWidth = width - leftMargin;

    const pxToTime = (px) => {
        const x_rel_ms = ((px - leftMargin) / drawWidth) * timeWindow; // 0 to timeWindow
        const age = centerTimeOffset - x_rel_ms;
        return now - age;
    };

    const t1 = pxToTime(x1);
    const t2 = pxToTime(x2);

    self.postMessage({
        type: 'SELECTION_RESULT',
        payload: {
            start: Math.min(t1, t2),
            end: Math.max(t1, t2)
        }
    });
}

function getRenderNow() {
    if (config.recordedMode && config.manualRenderTime != null) {
        return config.manualRenderTime;
    }
    if (lastTsHead > 0) {
        return lastTsHead;
    }
    return Date.now() - (config.offset || 0) - timeOffset;
}

function init(payload) {
    canvas = payload.canvas;
    ctx = canvas.getContext('2d', { alpha: true }); // Enable transparency for blending
    width = payload.width;
    height = payload.height;

    // Apply init config
    if (payload.config) config = { ...config, ...payload.config };

    loop();
}

function addData(newPoints) {
    if (!newPoints || newPoints.length === 0) return;

    // 1. Sort incoming batch
    newPoints.sort((a, b) => a.time - b.time);

    // 2. Detect BACKWARD timestamp jumps only.
    //    Forward jumps are handled naturally by time-based eviction.
    //    Backward jumps (new data older than head) freeze the stream because
    //    the monotonicity filter rejects everything — we must reset.
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
        return {
            ...point,
            value: rawValue,
            envelope: updateEnvelope(rawValue)
        };
    });

    points.push(...normalizedPoints);
    
    if (!config.recordedMode) {
        // Time-based eviction: keep 3x the visible time window (live mode only).
        // Recorded mode keeps all loaded points for panning.
        const maxAge = (config.timeWindow || 5000) * 3;
        const cutoffTime = lastTsHead - maxAge;
        let cutIdx = 0;
        for (let i = 0; i < points.length; i++) {
            if (points[i].time >= cutoffTime) {
                cutIdx = i;
                break;
            }
        }
        if (cutIdx > 0) {
            points = points.slice(cutIdx);
        }
        // Hard cap as safety net
        if (points.length > MAX_POINTS) {
            points = points.slice(points.length - MAX_POINTS);
        }
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
    return point.value ?? 0;
}

function handleGetSamples(payload, idPromise) {
    const { start, end } = payload;
    const result = points
        .filter(p => p.time >= start && p.time <= end)
        .map((point) => ({ time: point.time, value: point.value }));
    self.postMessage({
        type: 'GET_SAMPLES_RESULT',
        idPromise,
        payload: result
    });
}

// --- Rendering ---

function loop(timestamp) {
    try {
        draw();
    } catch (e) {
        if (!self.__hasLoggedDrawError) {
            console.error("Worker Draw Error (throttled):", e);
            self.__hasLoggedDrawError = true;
        }
    }
    animationFrameId = requestAnimationFrame(loop);
}

function requestRender() {
    // No-op if looping
}

function draw() {
    if (!ctx) return;

    // 1. Clear - USE THEME BG
    ctx.clearRect(0, 0, width, height); // Clear valid transparency

    // Removed default solid background drawing
    // We let the CSS background from SignalChart.css handle it or the global CSS.

    if (points.length === 0) {
        // In recorded mode use a fixed anchor (recordingStartMs + half-window) so the
        // empty grid does not auto-scroll with the wall clock.
        const emptyNow = config.recordedMode
            ? (config.recordingStartMs || 0) + config.timeWindow / 2
            : Date.now();
        drawGrid(emptyNow, config.timeWindow, config.timeWindow / 2, 45);
        return;
    }

    const now = getRenderNow();
    const timeWindow = config.timeWindow;
    const centerTimeOffset = timeWindow / 2;

    const leftMargin = 45;
    const drawWidth = width - leftMargin;
    const timeToPx = (t_rel_ms) => leftMargin + (t_rel_ms / timeWindow) * drawWidth;

    const yMin = config.yMin;
    const yMax = config.yMax;
    const yRange = yMax - yMin || 1;
    const padY = height * 0.1;
    const availH = height - 2 * padY;

    const valToPy = (val) => {
        const norm = (val - yMin) / yRange;
        return height - (padY + norm * availH);
    };

    // Draw Grid (Background)
    drawGrid(now, timeWindow, centerTimeOffset, leftMargin, padY, availH);

    // Context save and clip to prevent drawing over left margin
    ctx.save();
    ctx.beginPath();
    ctx.rect(leftMargin, 0, drawWidth, height);
    ctx.clip();

    // Draw Windows (Behind Signal)
    windows.forEach(win => {
        // win: { startTime, endTime, status, label... }
        // Ensure we use correct keys. CalibrationView sends: startTime, endTime.
        // wait, message payload might differ?
        // Let's check CalibrationView: updateWindows(markedWindows)
        // newWindow = { startTime, endTime ... }

        const start = win.startTime || win.start;
        const end = win.endTime || win.end;

        if (!start || !end) return;

        const ageStart = now - start;
        const ageEnd = now - end;


        const x_start_ms = centerTimeOffset - ageStart;
        const x_end_ms = centerTimeOffset - ageEnd;

        const px1 = timeToPx(x_start_ms);
        const px2 = timeToPx(x_end_ms);
        const wFunc = px2 - px1;

        if (px2 > 0 && px1 < width) {
            // "Collected" window = Green
            // "Pending" = Yellow/Orange
            // "Saved" = Red/Blue
            // "Error" = Gray

            const styleKey = (win.status === 'recording' || win.status === 'pending')
                ? 'pending'
                : (win.status === 'collected')
                    ? 'collected'
                    : (win.status === 'saved' || win.status === 'correct' || win.status === 'incorrect')
                        ? 'saved'
                        : 'error';
            const windowStyle = config.windowStyles?.[styleKey] || config.windowStyles?.pending || {};

            const fill = windowStyle.fill || 'rgba(255, 255, 255, 0.08)';
            const stroke = windowStyle.stroke || '#ffffff';

            ctx.fillStyle = fill;

            // Constrain windows to the grid area (looks cleaner/"smaller")
            const yTop = padY;
            const hRegion = availH;

            ctx.fillRect(px1, yTop, wFunc, hRegion);

            ctx.strokeStyle = stroke;
            ctx.lineWidth = 2; // Thicker border
            ctx.strokeRect(px1, yTop, wFunc, hRegion);

            // Label
            if (win.label) {
                ctx.save();
                ctx.fillStyle = windowStyle.text || '#ffffff';
                ctx.globalAlpha = 0.9;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const centerX = px1 + wFunc / 2;
                const centerY = yTop + hRegion / 2;

                const fontSize = win.label.length > 10 ? 16 : 20;
                ctx.font = `bold ${fontSize}px sans-serif`;
                if (Math.abs(wFunc) > 50) {
                    ctx.fillText(win.label, centerX, centerY);
                }
                ctx.restore();
            }
        }
    });

    // --- Icon Definitions Removed ---


    // Draw Signal with Neon Glow and Smoothing
    ctx.strokeStyle = config.lineColor;
    ctx.lineWidth = 3; // 

    // Neon Glow - Stronger
    ctx.shadowBlur = 8;
    ctx.shadowColor = config.lineColor;

    // Compute whether to show individual point markers (plus+circle)
    // Only when pixel-per-sample > 5 to avoid canvas overload at high density
    const pxPerSample = (drawWidth / config.timeWindow) * (1000 / Math.max(1, config.sampleRate || 512));
    const showPointMarkers = config.recordedMode && pxPerSample > 5;

    ctx.beginPath();

    let cursorValue = null;
    if (points.length > 0) {
        // Find the newest point that is NOT in the future relative to 'now'
        let i = points.length - 1;
        while (i >= 0 && points[i].time > now) {
            i--;
        }

        // i is the index of the latest point <= now.
        // If i < points.length - 1, we have a future point [i+1] to interpolate with.

        let startX, startY;

        if (i >= 0) {
            if (i < points.length - 1) {
                // Interpolate to hit the cursor line exactly
                const pPast = points[i];
                const pFut = points[i + 1];

                const totalT = pFut.time - pPast.time;
                const ratio = totalT !== 0 ? (now - pPast.time) / totalT : 0;
                const interpPast = getPointValue(pPast);
                const interpFuture = getPointValue(pFut);
                const interpVal = interpPast + (interpFuture - interpPast) * ratio;

                startX = timeToPx(centerTimeOffset); // Exact center
                startY = valToPy(interpVal);
                cursorValue = interpVal;
            } else {
                // Just start at the latest point (visual lag, but honest)
                const age = now - points[i].time;
                startX = timeToPx(centerTimeOffset - age);
                startY = valToPy(getPointValue(points[i]));
                cursorValue = getPointValue(points[i]);
            }

            if (!showPointMarkers) {
                ctx.moveTo(startX, startY);
            }

            // Draw line backwards, detecting large gaps to avoid straight-line artifacts
            let prevTime = (i < points.length - 1) ? now : points[i].time;
            for (let j = i; j >= 0; j--) {
                const p = points[j];
                const age = now - p.time;
                const x_ms = centerTimeOffset - age;

                if (x_ms < -200) break; // Optimization

                const x = timeToPx(x_ms);
                const y = valToPy(getPointValue(p));

                if (showPointMarkers) {
                    // Plus+circle marker: circle with arms extending slightly beyond its edge
                    const r = 4;
                    const arm = r + 2;
                    ctx.save();
                    ctx.fillStyle = config.lineColor;
                    ctx.strokeStyle = config.lineColor;
                    ctx.lineWidth = 1.5;
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = config.lineColor;
                    // Circle
                    ctx.beginPath();
                    ctx.arc(x, y, r, 0, Math.PI * 2);
                    ctx.stroke();
                    // Horizontal arm
                    ctx.beginPath();
                    ctx.moveTo(x - arm, y);
                    ctx.lineTo(x + arm, y);
                    ctx.stroke();
                    // Vertical arm
                    ctx.beginPath();
                    ctx.moveTo(x, y - arm);
                    ctx.lineTo(x, y + arm);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    // Gap detection: only break the path on genuine data loss (>200ms gap)
                    const timeDelta = prevTime - p.time;
                    if (timeDelta > 200 && j < i) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                prevTime = p.time;
            }
        }
    }
    if (!showPointMarkers) ctx.stroke();

    // Reset shadow for other elements
    ctx.shadowBlur = 0;

    // Draw Cursor (Center) — live mode only, not in recorded mode
    const centerPx = timeToPx(centerTimeOffset);

    if (!config.recordedMode) {
        // 1. Vertical Line
        ctx.strokeStyle = 'var(--text-secondary, #ffffff)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(centerPx, 0);
        ctx.lineTo(centerPx, height);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Current Value Dot
        if (points.length > 0) {
            const y_px = valToPy(cursorValue ?? getPointValue(points[points.length - 1]));
            ctx.fillStyle = config.lineColor;
            ctx.shadowBlur = 10;
            ctx.shadowColor = config.lineColor;
            ctx.beginPath();
            ctx.arc(centerPx, y_px, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    ctx.restore(); // Restore clip

    // Draw annotation preview window (draw mode hover) — outside clip so it spans full height
    if (config.recordedMode && config.previewPixelX != null) {
        const leftM = 45;
        const dw = width - leftM;
        const halfPx = (config.previewWindowMs / 2 / config.timeWindow) * dw;
        const px1 = Math.max(leftM, config.previewPixelX - halfPx);
        const px2 = Math.min(width, config.previewPixelX + halfPx);
        const pY = height * 0.1;
        const aH = height - 2 * pY;
        ctx.save();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.fillRect(px1, pY, px2 - px1, aH);
        ctx.strokeRect(px1, pY, px2 - px1, aH);
        ctx.setLineDash([]);
        ctx.restore();
    }
}

function drawGrid(now, timeWindow, centerTimeOffset, leftMargin, padY, availH) {
    // We get leftMargin from parameters, fallback if undefined (like empty grid)
    leftMargin = leftMargin;
    const drawWidth = width - leftMargin;
    const timeToPx = (t_rel_ms) => leftMargin + (t_rel_ms / timeWindow) * drawWidth;

    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.font = '10px sans-serif'; // decreased font size to match live graph
    ctx.fillStyle = config.themeAxisColor || config.themeColor || '#888';

    // Horizontal (Value) - Y-Axis Labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yMin = config.yMin;
    const yMax = config.yMax;
    const yRange = yMax - yMin || 1;

    // Ticks: let's do ~7 lines to match Live Graph
    const tickCount = 7;

    for (let i = 0; i < tickCount; i++) {
        const norm = i / (tickCount - 1);
        const val = yMax - norm * yRange; // Top to bottom

        // If padY/availH not passed, recalculate
        const currentPadY = padY !== undefined ? padY : height * 0.1;
        const currentAvailH = availH !== undefined ? availH : height - 2 * currentPadY;
        const y = currentPadY + norm * currentAvailH;

        // Draw text label
        // Use text baseline mapping to match Live Graph
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = config.themeAxisColor || '#9ca3af';
        ctx.fillText(Math.round(val), leftMargin - 10, y);
        ctx.globalAlpha = 0.3;

        // Draw horizontal grid lines (Y-axis lines) with dashed theme color
        ctx.strokeStyle = config.themeAxisColor || config.themeColor || config.gridColor || '#333';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw horizontal axis (X-axis) at y=0
    const currentPadY = padY !== undefined ? padY : height * 0.1;
    const currentAvailH = availH !== undefined ? availH : height - 2 * currentPadY;
    const zeroY = height - (currentPadY + ((0 - yMin) / yRange) * currentAvailH);
    if (zeroY >= currentPadY && zeroY <= height - currentPadY) {
        ctx.strokeStyle = config.themeAxisColor || config.themeColor || '#aaaaaa';
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 2; // Match the thick zero line of Live Graph
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(leftMargin, zeroY);
        ctx.lineTo(width, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.3;
    }

    // Vertical (Time)Grid - Only Draw Labels
    ctx.fillStyle = config.themeAxisColor || config.themeColor || '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const startSec = Math.floor((now - centerTimeOffset) / 1000);
    const endSec = Math.floor((now + centerTimeOffset) / 1000);

    for (let s = startSec; s <= endSec; s++) {
        const t_abs = s * 1000;
        const age = now - t_abs; // positive if past
        const x_ms = centerTimeOffset - age;
        const x_px = timeToPx(x_ms);

        if (x_px < leftMargin) continue;

        // Draw Label Only
        let label;
        if (config.recordedMode && config.recordingStartMs) {
            // Show HH:MM:SS offset from recording start
            const offsetSec = Math.max(0, (t_abs - config.recordingStartMs) / 1000);
            const hh = Math.floor(offsetSec / 3600);
            const mm = Math.floor((offsetSec % 3600) / 60);
            const ss = Math.floor(offsetSec % 60);
            label = hh > 0
                ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
                : `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
        } else {
            const diff = (t_abs - now) / 1000;
            label = diff > 0 ? `+${diff.toFixed(2)}s` : `${diff.toFixed(2)}s`;
        }

        ctx.globalAlpha = 0.8;
        ctx.fillText(label, x_px, height - 12);
        ctx.globalAlpha = 0.3;
    }

    ctx.globalAlpha = 1.0;
}
