/* eslint-disable no-restricted-globals */

// State
let canvas = null;
let ctx = null;
let width = 0;
let height = 0;

// Data Storage
// points: { time: number, value: number }[]
let points = [];
const MAX_POINTS = 50000;
let channelIndex = -1; // To be set via INIT or SET_CONFIG

const broadcast = new BroadcastChannel('bci-data-stream');
broadcast.onmessage = (e) => {
    if (e.data.type === 'DATA_BATCH' && channelIndex !== -1) {
        const samples = e.data.samples;
        const newPoints = [];

        samples.forEach(s => {
            if (s.channels) {
                const chObj = s.channels[channelIndex] || s.channels[`ch${channelIndex}`] || s.channels[String(channelIndex)];
                let val = 0;
                if (chObj !== undefined) {
                    if (typeof chObj === 'number') val = chObj;
                    else val = chObj.value ?? 0;
                }
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
    manualRange: "", // If set, overrides yMin/yMax
    color: '#3b82f6',
    historyColor: '#3b82f64D',
    showGrid: true,
    channels: 1,
    themeAxisColor: '#aaaaaa' // New config default
};

let markedWindows = [];
let annotations = []; // e.g. blinks

// Worker-to-Main communication
let lastStatsTime = 0;
const STATS_INTERVAL = 250;

// Auto-Sync Clock (optional latency compensation)
let timeOffset = 0;
let isOffsetInitialized = false;

let animationFrameId = null;

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

            // Generate history color automatically if color changed
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

    const latestDataTime = newPoints[newPoints.length - 1].time;
    const sysTime = Date.now();
    const currentLag = sysTime - latestDataTime;

    if (!isOffsetInitialized) {
        timeOffset = currentLag;
        isOffsetInitialized = true;
    } else {
        timeOffset = timeOffset * 0.98 + currentLag * 0.02; // EMA smoothing
    }

    // Append and sort (normally they arrive sorted)
    points.push(...newPoints);

    // Cull old data (keep 1.5x timeWindow history just in case, plus we need history for sweep)
    // We only visually display up to 1x timeWindow, so keeping 1.2x is safe
    const cutoff = latestDataTime - (config.timeWindowMs * 1.5);

    // Quick prune if too large
    // Find the first index >= cutoff
    let cutIndex = 0;
    for (let i = 0; i < points.length; i++) {
        if (points[i].time >= cutoff) {
            cutIndex = i;
            break;
        }
    }

    if (cutIndex > 0) {
        // Fast array slice
        points = points.slice(cutIndex);
    }
}

// Stats reporting loop
function checkStats(nowTime) {
    if (nowTime - lastStatsTime > STATS_INTERVAL) {
        lastStatsTime = nowTime;

        let min = 0, max = 0, mean = 0;

        // Calculate stats for visible active window
        if (points.length > 0) {
            const latestTs = points[points.length - 1].time;
            const cutoff = latestTs - config.timeWindowMs;

            let sum = 0;
            let count = 0;
            min = Number.POSITIVE_INFINITY;
            max = Number.NEGATIVE_INFINITY;

            for (let i = points.length - 1; i >= 0; i--) {
                const p = points[i];
                if (p.time < cutoff) break;

                sum += p.value;
                if (p.value < min) min = p.value;
                if (p.value > max) max = p.value;
                count++;
            }

            if (count > 0) {
                mean = sum / count;
            } else {
                min = 0; max = 0; mean = 0;
            }
        }

        self.postMessage({
            type: 'STATS',
            payload: { min, max, mean }
        });
    }
}

function loop() {
    try {
        draw();
    } catch (e) {
        console.error("Signal Worker Draw Error:", e);
    }
    animationFrameId = requestAnimationFrame(loop);
}

function requestRender() {
    // Relying on loop
}

function draw() {
    if (!ctx || width === 0 || height === 0) return;

    // Clear transparent
    ctx.clearRect(0, 0, width, height);

    const nowSys = Date.now();

    // 1. Grid
    // Wait to draw grid until we have final Y range
    let yMin = config.yMin;
    let yMax = config.yMax;

    if (config.manualRange && config.manualRange !== "" && !isNaN(parseFloat(config.manualRange))) {
        const r = parseFloat(config.manualRange);
        yMin = -r;
        yMax = r;
    } else {
        const span = (config.yMax - config.yMin) / config.zoom;
        const mid = (config.yMax + config.yMin) / 2;
        yMin = mid - span / 2;
        yMax = mid + span / 2;
    }

    const timeWindow = config.timeWindowMs;
    const latestTs = points.length > 0 ? points[points.length - 1].time : nowSys;
    const rangeStart = latestTs - timeWindow;

    // Auto-scaling logic (check if points in window exceed default current bounds)
    if (points.length > 0) {
        let maxInView = -Infinity;
        let minInView = Infinity;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].time < rangeStart) break;
            if (points[i].value > maxInView) maxInView = points[i].value;
            if (points[i].value < minInView) minInView = points[i].value;
        }

        if (maxInView > yMax || minInView < yMin) {
            const maxAbs = Math.max(Math.abs(maxInView), Math.abs(minInView));

            // Find a "nice" upper bound for graph scaling (e.g., 1, 2, 5, 10, 20, 50...)
            const getNiceBound = (val) => {
                if (val <= 0) return 1;
                // Special edge cases for extremely small JS signals
                if (val < 1e-10) return 1e-10;
                const mag = Math.pow(10, Math.floor(Math.log10(val)));
                const norm = val / mag;
                if (norm <= 1) return 1 * mag;
                if (norm <= 2) return 2 * mag;
                if (norm <= 5) return 5 * mag;
                return 10 * mag;
            };

            const niceBound = getNiceBound(maxAbs);
            // In asymmetric situations, symmetric is always safer visually
            yMax = niceBound;
            yMin = -niceBound;
        }
    }

    const yRange = yMax - yMin || 1;
    const paddingY = height * 0.1;
    const availH = height - 2 * paddingY;

    const valToPy = (val) => {
        const norm = (val - yMin) / yRange;
        return height - (paddingY + norm * availH);
    };

    // Calculate padding for Y-axis labels dynamically
    ctx.font = '10px sans-serif';
    const textW1 = ctx.measureText(yMax.toFixed(0)).width;
    const textW2 = ctx.measureText(yMin.toFixed(0)).width;
    const pL = 10 + Math.max(textW1, textW2) + 12; // margin + max text width + gap
    const plW = width - pL;

    // Now safe to draw grid with final yMin / yMax
    if (config.showGrid) {
        drawGrid(yMin, yMax, valToPy, pL);
    }

    // Zero/Center Reference Line (X-axis)
    ctx.strokeStyle = config.themeAxisColor || '#aaaaaa';
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2; // bit bolder
    ctx.setLineDash([5, 5]); // dashed
    ctx.beginPath();
    const zeroY = valToPy(0);
    ctx.moveTo(pL, zeroY);
    ctx.lineTo(width, zeroY);
    ctx.stroke();
    // Reset defaults
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.globalAlpha = 1.0;

    if (points.length === 0) return;

    // Reporting stats independently of rendering rate
    checkStats(nowSys);



    const scannerPos = latestTs % timeWindow;
    const scannerPx = pL + (scannerPos / timeWindow) * plW;
    const cycleStartTs = latestTs - scannerPos;

    // Split into HISTORY (left of scanner) and ACTIVE (right of scanner)

    // Center logic X:
    const timeToPx = (t_abs) => pL + ((t_abs % timeWindow) / timeWindow) * plW;

    // Find active points and history points
    // History points: time > rangeStart AND time < cycleStartTs
    // Active points: time >= cycleStartTs AND time <= latestTs

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Helper to draw a segment array
    const drawSegment = (startIdx, endIdx, color, thickness, glow = false) => {
        if (startIdx > endIdx || startIdx < 0 || endIdx >= points.length) return;

        ctx.strokeStyle = color;
        ctx.lineWidth = thickness;

        if (glow) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
        } else {
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();

        let lastPx = -1;

        for (let i = startIdx; i <= endIdx; i++) {
            const p = points[i];
            const px = timeToPx(p.time);
            const py = valToPy(p.value);

            // Break path if we jump across the boundary (wrap-around)
            // or if it's the first point
            if (i === startIdx || Math.abs(px - lastPx) > plW * 0.5) {
                ctx.moveTo(px, py);
            } else {
                ctx.lineTo(px, py);
            }
            lastPx = px;
        }
        ctx.stroke();

        // Reset shadow
        ctx.shadowBlur = 0;
    };

    // Find the split index
    let splitIndex = 0;
    for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].time < cycleStartTs) {
            splitIndex = i + 1;
            break;
        }
    }

    let startIndex = 0;
    for (let i = splitIndex - 1; i >= 0; i--) {
        if (points[i].time < rangeStart) {
            startIndex = i + 1;
            break;
        }
    }

    // Draw History Line (faded, but highly visible)
    ctx.globalAlpha = 0.8;
    drawSegment(startIndex, splitIndex - 1, config.historyColor, 3, false);
    ctx.globalAlpha = 1.0;

    // Draw Active Line
    drawSegment(splitIndex, points.length - 1, config.color, 3, true);

    // Reference Areas (Marked Windows)
    if (markedWindows.length > 0) {
        markedWindows.forEach(win => {
            const getWindowColor = (status, isMissed) => {
                if (isMissed) return 'rgba(239, 68, 68, 0.35)'; // Red
                if (status === 'correct') return 'rgba(16, 185, 129, 0.35)'; // Green
                if (status === 'incorrect') return 'rgba(245, 158, 11, 0.35)'; // Orange
                return 'rgba(156, 163, 175, 0.25)'; // Gray
            };
            const getStrokeColor = (status, isMissed) => {
                if (isMissed) return '#ef4444';
                if (status === 'correct') return '#10b981';
                if (status === 'incorrect') return '#f59e0b';
                return '#9ca3af';
            };

            const xOrig1 = win.startTime % timeWindow;
            const xOrig2 = win.endTime % timeWindow;

            // To be precise we should only draw if the window is within rangeStart to latestTs
            // but for simplicity we'll just check if it's recent
            if (latestTs - win.endTime < timeWindow * 1.5) {
                const px1 = pL + (xOrig1 / timeWindow) * plW;
                const px2 = pL + (xOrig2 / timeWindow) * plW;

                let wFunc = px2 - px1;
                // handle wrap around slightly
                if (wFunc < 0) wFunc += plW;

                ctx.fillStyle = getWindowColor(win.status, win.isMissedActual);
                ctx.fillRect(px1, 0, wFunc, height);

                ctx.strokeStyle = getStrokeColor(win.status, win.isMissedActual);
                ctx.globalAlpha = 0.8; // More opaque border
                ctx.lineWidth = 2; // Thicker border
                ctx.strokeRect(px1, 0, wFunc, height);
                ctx.globalAlpha = 1.0;

                if (win.label) {
                    ctx.fillStyle = '#9ca3af'; // var(--muted)
                    ctx.font = '10px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(win.label, px1 + wFunc / 2, Math.max(0, paddingY - 12));
                }
            }
        });
    }

    // Annotations (Blinks)
    if (annotations.length > 0) {
        annotations.forEach(ann => {
            if (latestTs - ann.x < timeWindow * 1.5) {
                const px = pL + ((ann.x % timeWindow) / timeWindow) * plW;
                const annY = ann.y !== undefined ? ann.y : (points.length > 0 ? points[points.length - 1].value : 0);
                const py = valToPy(annY);

                ctx.fillStyle = ann.color || "red";
                ctx.beginPath();
                ctx.arc(px, py, 6, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.stroke();

                if (ann.label) {
                    ctx.fillStyle = ann.color || "red";
                    ctx.font = 'bold 12px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(ann.label, px, py - 10);
                }
            }
        });
    }

    // Zero/Center Reference Line has been moved before drawing signal

    // Scanner Line and Pointer
    ctx.strokeStyle = config.color; // var(--accent)
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(scannerPx, 0);
    ctx.lineTo(scannerPx, height);
    ctx.stroke();

    // Pointer (Glow dot at current value)
    if (points.length > 0) {
        const latestVal = points[points.length - 1].value;
        const py = valToPy(latestVal);
        ctx.fillStyle = config.color;

        ctx.shadowColor = config.color;
        ctx.shadowBlur = 8;

        ctx.beginPath();
        ctx.arc(scannerPx, py, 4, 0, Math.PI * 2);
        ctx.fill();

        // Reset shadow
        ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1.0;
}

function drawGrid(yMin, yMax, valToPy, pL) {
    ctx.strokeStyle = config.themeAxisColor || '#aaaaaa';
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);

    // Ticks: let's do ~7 lines
    const tickCount = 7;
    const paddingY = height * 0.1;
    const availH = height - 2 * paddingY;

    ctx.beginPath();
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < tickCount; i++) {
        const norm = i / (tickCount - 1);
        const y = paddingY + norm * availH;

        // Y-axis label
        const val = yMax - norm * (yMax - yMin);
        const textStr = val.toFixed(0);

        ctx.moveTo(pL, y);
        ctx.lineTo(width, y);

        ctx.fillStyle = config.themeAxisColor || '#9ca3af';
        ctx.globalAlpha = 0.8;
        ctx.fillText(textStr, 10, y);
        ctx.globalAlpha = 0.3;
    }
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;
}
