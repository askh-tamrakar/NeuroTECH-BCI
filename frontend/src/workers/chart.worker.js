/* eslint-disable no-restricted-globals */

// State
let canvas = null;
let ctx = null;
let width = 0;
let height = 0;

// Data Storage
// We keep a large buffer of points. 
// points: { time: number, value: number, future: number|undef }[]
let points = [];
const MAX_POINTS = 50000; // Keep enough history

// Visual State
let windows = []; // { id, start, end, type }
let config = {
    timeWindow: 5000, // ms
    yMin: 0,
    yMax: 100,
    zoom: 1,
    offset: 0,
    lineColor: '#00ff00',
    bgColor: 'transparent', // Use transparent to show CSS background or passed theme
    gridColor: '#333333',
    textColor: '#888888',
    surface: '#1e1e1e'
};

// Scanner State
let scannerX = null;
let scannerValue = null;

// Animation
// Animation
let animationFrameId = null;

// Latency Compensation
let timeOffset = 0;
let isOffsetInitialized = false;

// --- Message Handler ---
self.onmessage = function (e) {
    const { type, payload, idPromise } = e.data;

    switch (type) {
        case 'INIT':
            init(payload);
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
            requestRender();
            break;
    }
};

function handleCalcSelection(payload) {
    const { x1, x2 } = payload;
    if (points.length === 0) return;

    // Use wall-clock time adjusted by latency
    const now = Date.now() - (config.offset || 0) - timeOffset;
    const timeWindow = config.timeWindow;
    const centerTimeOffset = timeWindow / 2;

    // x_px = ( (centerTimeOffset - (now - t_ms)) / timeWindow ) * width
    // x_px / width = (centerTimeOffset - now + t_ms) / timeWindow
    // (x_px / width) * timeWindow = centerTimeOffset - now + t_ms
    // t_ms = (x_px / width) * timeWindow - centerTimeOffset + now

    // Simplification from draw(): 
    // x_ms = centerTimeOffset - age
    // age = centerTimeOffset - x_ms
    // t_ms = now - age = now - (centerTimeOffset - x_ms)
    // x_ms is relative time in window [0, timeWindow] ? No.
    // Let's reverse properly:

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

    // Auto-Sync Clock: Estimate lag between System Time and Data Time
    const latestDataTime = newPoints[newPoints.length - 1].time;
    const sysTime = Date.now();
    const currentLag = sysTime - latestDataTime;

    if (!isOffsetInitialized) {
        timeOffset = currentLag;
        isOffsetInitialized = true;
    } else {
        // Smooth adaptation (EMA)
        timeOffset = timeOffset * 0.98 + currentLag * 0.02;
    }

    points.push(...newPoints);
    if (points.length > MAX_POINTS) {
        points = points.slice(points.length - MAX_POINTS);
    }
}

function handleGetSamples(payload, idPromise) {
    const { start, end } = payload;
    const result = points.filter(p => p.time >= start && p.time <= end);
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

    if (config.bgColor && config.bgColor !== 'transparent') {
        ctx.fillStyle = config.bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    if (points.length === 0) {
        // Draw placeholder grid
        drawGrid(Date.now(), config.timeWindow, config.timeWindow / 2);
        return;
    }

    // Use wall-clock time adjusted by auto-latency compensation
    const now = Date.now() - (config.offset || 0) - timeOffset;
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

            let fill = 'rgba(255, 255, 255, 0.05)';
            let stroke = 'rgba(255, 255, 255, 0.2)';

            if (win.status === 'collected') {
                fill = 'rgba(16, 185, 129, 0.15)'; // Green-500
                stroke = '#10b981';
            } else if (win.status === 'pending') {
                fill = 'rgba(245, 158, 11, 0.15)'; // Amber-500
                stroke = '#f59e0b';
            } else if (win.status === 'recording') {
                fill = 'rgba(59, 130, 246, 0.15)'; // Blue-500
                stroke = '#3b82f6';
            } else if (win.status === 'saved') {
                fill = 'rgba(124, 58, 237, 0.15)'; // Violet-600
                stroke = '#7c3aed';
            } else if (win.status === 'error') {
                fill = 'rgba(156, 163, 175, 0.15)'; // Gray-400
                stroke = '#9ca3af';
            }

            ctx.fillStyle = fill;

            // Constrain windows to the grid area (looks cleaner/"smaller")
            const yTop = padY;
            const hRegion = availH;

            ctx.fillRect(px1, yTop, wFunc, hRegion);

            ctx.strokeStyle = stroke;
            ctx.lineWidth = 1;
            ctx.strokeRect(px1, yTop, wFunc, hRegion);

            // Label
            if (win.label) {
                ctx.save();
                ctx.fillStyle = stroke;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const centerX = px1 + wFunc / 2;
                const centerY = yTop + hRegion / 2;

                // Dynamic font size for long words
                const fontSize = win.label.length > 10 ? 24 : 32;
                ctx.font = `bold ${fontSize}px sans-serif`;

                // Draw label at center of the window
                ctx.fillText(win.label, centerX, centerY);
                ctx.restore();
            }
        }
    });

    // --- Icon Definitions Removed ---


    // Draw Signal with Neon Glow and Smoothing
    ctx.strokeStyle = config.lineColor;
    ctx.lineWidth = 3;

    // Neon Glow
    ctx.shadowBlur = 6;
    ctx.shadowColor = config.lineColor;

    ctx.beginPath();

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
                const interpVal = pPast.value + (pFut.value - pPast.value) * ratio;

                startX = timeToPx(centerTimeOffset); // Exact center
                startY = valToPy(interpVal);
            } else {
                // Just start at the latest point (visual lag, but honest)
                const age = now - points[i].time;
                startX = timeToPx(centerTimeOffset - age);
                startY = valToPy(points[i].value);
            }

            ctx.moveTo(startX, startY);

            // Draw line backwards
            for (let j = i; j >= 0; j--) {
                const p = points[j];
                const age = now - p.time;
                const x_ms = centerTimeOffset - age;

                if (x_ms < -200) break; // Optimization

                const x = timeToPx(x_ms);
                const y = valToPy(p.value);

                ctx.lineTo(x, y);
            }
        }
    }
    ctx.stroke();

    // Reset shadow for other elements
    ctx.shadowBlur = 0;

    // Draw Cursor (Center)
    const centerPx = timeToPx(centerTimeOffset);

    // 1. Vertical Line (0 x-axis line bold dash)
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2; // Bold
    ctx.setLineDash([8, 8]); // Dash
    ctx.beginPath();
    ctx.moveTo(centerPx, 0);
    ctx.lineTo(centerPx, height);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash

    // 2. Current Value Dot
    if (points.length > 0) {
        const lastVal = points[points.length - 1].value;
        const y_px = valToPy(lastVal);

        ctx.fillStyle = config.lineColor;
        ctx.shadowBlur = 10; // Neon glow
        ctx.shadowColor = config.lineColor;
        ctx.beginPath();
        ctx.arc(centerPx, y_px, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0; // Reset
    }

    ctx.restore(); // Restore clip

    // Scanner
    if (scannerX !== null && scannerValue !== null) {
        // scannerX is timestamp?
        // In old chart it was passed as prop `scannerX={hoverX}`.
        // If we don't handle hover logic in worker yet, this might be unused.
        // Skipping for now unless requested.
    }
}

function drawGrid(now, timeWindow, centerTimeOffset, leftMargin, padY, availH) {
    // We get leftMargin from parameters, fallback if undefined (like empty grid)
    leftMargin = leftMargin;
    const drawWidth = width - leftMargin;
    const timeToPx = (t_rel_ms) => leftMargin + (t_rel_ms / timeWindow) * drawWidth;

    ctx.globalpha = 0.3;
    ctx.lineWidth = 1;
    ctx.font = '13px monospace'; // increased font
    ctx.fillStyle = config.themeColor || '#888';

    // Horizontal (Value) - Y-Axis Labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const yMin = config.yMin;
    const yMax = config.yMax;
    const yRange = yMax - yMin || 1;

    for (let i = 0; i <= 5; i++) {
        const norm = i / 5;
        const val = yMin + norm * yRange;
        // If padY/availH not passed, recalculate
        const currentPadY = padY !== undefined ? padY : height * 0.1;
        const currentAvailH = availH !== undefined ? availH : height - 2 * currentPadY;
        const y = height - (currentPadY + norm * currentAvailH);

        // Draw text label
        ctx.fillText(Math.round(val), leftMargin - 10, y);

        // Draw horizontal grid lines (Y-axis lines) with dashed theme color
        ctx.strokeStyle = config.themeColor || config.gridColor || '#333';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(leftMargin, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Draw horizontal axis (X-axis) at y=0, starting after labels 
    const currentPadY = padY !== undefined ? padY : height * 0.1;
    const currentAvailH = availH !== undefined ? availH : height - 2 * currentPadY;
    const zeroY = height - (currentPadY + ((0 - yMin) / yRange) * currentAvailH);
    if (zeroY >= currentPadY && zeroY <= height - currentPadY) {
        ctx.strokeStyle = config.themeColor;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.moveTo(leftMargin, zeroY);
        ctx.lineTo(width, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Vertical (Time)Grid - Only Draw Labels
    ctx.fillStyle = config.themeColor || '#888';
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
        const diff = (t_abs - now) / 1000;
        const label = diff > 0 ? `+${diff.toFixed(0)}s` : `${diff.toFixed(0)}s`;

        ctx.fillText(label, x_px, height - 12);
    }
}

