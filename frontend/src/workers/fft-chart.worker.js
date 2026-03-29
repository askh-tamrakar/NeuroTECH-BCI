/**
 * FFT Chart Worker
 * Handles FFT calculation and rendering in a separate thread.
 */

// Math Utilities for FFT
function reverseBits(x, bits) {
    let y = 0;
    for (let i = 0; i < bits; i++) {
        y = (y << 1) | (x & 1);
        x >>= 1;
    }
    return y;
}

function computeFFT(real, imag) {
    const N = real.length;
    const bits = Math.log2(N);
    if (bits % 1 !== 0) return;

    for (let i = 0; i < N; i++) {
        const j = reverseBits(i, bits);
        if (j > i) {
            let temp = real[i];
            real[i] = real[j];
            real[j] = temp;
            temp = imag[i];
            imag[i] = imag[j];
            imag[j] = temp;
        }
    }

    for (let size = 2; size <= N; size *= 2) {
        const halfSize = size / 2;
        const tabStep = N / size;
        for (let i = 0; i < N; i += size) {
            for (let j = i, k = 0; j < i + halfSize; j++, k += tabStep) {
                const t = -2 * Math.PI * k / N;
                const cosT = Math.cos(t);
                const sinT = Math.sin(t);
                const tr = cosT * real[j + halfSize] - sinT * imag[j + halfSize];
                const ti = sinT * real[j + halfSize] + cosT * imag[j + halfSize];
                real[j + halfSize] = real[j] - tr;
                imag[j + halfSize] = imag[j] - ti;
                real[j] += tr;
                imag[j] += ti;
            }
        }
    }
}

function getPowerSpectrum(signal, sampleRate) {
    if (!signal || signal.length < 4) return [];
    const N = Math.pow(2, Math.floor(Math.log2(signal.length)));
    const real = new Float64Array(N);
    const imag = new Float64Array(N);

    // Apply Hamming window and remove DC offset
    for (let i = 0; i < N; i++) {
        const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
        real[i] = signal[signal.length - N + i] * window;
    }

    let sum = 0;
    for (let i = 0; i < N; i++) sum += real[i];
    const mean = sum / N;
    for (let i = 0; i < N; i++) real[i] -= mean;

    computeFFT(real, imag);

    const spectrum = [];
    for (let i = 0; i < N / 2; i++) {
        const freq = (i * sampleRate) / N;
        const magnitude = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        const power = (magnitude * magnitude) / N;
        spectrum.push({ freq: Number(freq.toFixed(2)), power: power });
    }
    return spectrum;
}

function smoothSpectrumPoints(spectrum, radius = 3) {
    if (!Array.isArray(spectrum) || spectrum.length < 3) return spectrum;
    const safeRadius = Math.max(1, Math.min(radius, 12));
    return spectrum.map((point, index) => {
        let weightedPower = 0;
        let weightSum = 0;
        for (let offset = -safeRadius; offset <= safeRadius; offset += 1) {
            const neighbor = spectrum[index + offset];
            if (!neighbor) continue;
            const weight = safeRadius + 1 - Math.abs(offset);
            weightedPower += neighbor.power * weight;
            weightSum += weight;
        }
        return { ...point, power: weightSum > 0 ? weightedPower / weightSum : point.power };
    });
}

function formatPowerValue(val, options = {}) {
    if (val === 0) return options.includeUnit === false ? "0.0" : "0.0 µV²";
    const absolute = Math.abs(val);
    let formatted = "";
    if (absolute < 0.001) formatted = val.toExponential(1);
    else formatted = val.toFixed(options.decimals ?? 1);
    return options.includeUnit === false ? formatted : `${formatted} µV²`;
}

function formatAmplitudeValue(val, options = {}) {
    if (val === 0) return options.includeUnit === false ? "0.0" : "0.0 µV";
    const absolute = Math.abs(val);
    let formatted = "";
    if (absolute < 0.001) formatted = val.toExponential(1);
    else formatted = val.toFixed(options.decimals ?? 1);
    return options.includeUnit === false ? formatted : `${formatted} µV`;
}

// Worker State
let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let points = [];
let channelIndex = -1;
let animationFrameId = null;
let lastStatsTime = 0;
let hoverState = { active: false, x: 0 };
let lastCalculatedSpectrum = [];
let needsRecalculate = true;

const MAX_POINTS = 8192;
const STATS_INTERVAL = 200;
const DEFAULT_SAMPLE_RATE = 1000;
const MIN_FFT_SAMPLES = 256;

let config = {
    channelIndex: -1,
    color: '#3b82f6',
    freqMin: 1,
    freqMax: 50,
    zoom: 1,
    manualRange: '',
    sampleRate: DEFAULT_SAMPLE_RATE,
    disabled: false,
    unitMode: 'power',
    themeAxisColor: '#9ca3af',
    themeGridColor: 'rgba(255, 255, 255, 0.1)'
};

const broadcast = new BroadcastChannel('bci-data-stream');
broadcast.onmessage = (e) => {
    if (config.disabled || e.data.type !== 'DATA_BATCH' || channelIndex === -1) return;

    const newPoints = [];
    for (const sample of e.data.samples || []) {
        if (!sample.channels) continue;
        const chObj = sample.channels[channelIndex] || sample.channels[`ch${channelIndex}`] || sample.channels[String(channelIndex)];
        if (chObj === undefined) continue;
        const value = typeof chObj === 'number'
            ? chObj
            : (chObj.filtered ?? chObj.value ?? 0);
        if (Number.isFinite(value)) {
            newPoints.push({ time: sample.timestamp, value });
        }
    }

    if (newPoints.length) {
        addData(newPoints);
    }
};

self.onmessage = (e) => {
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
            }
            break;
        case 'SET_CONFIG':
            const oldFreqMin = config.freqMin;
            const oldFreqMax = config.freqMax;
            const oldUnitMode = config.unitMode;
            config = { ...config, ...payload };
            if (payload.channelIndex !== undefined) {
                if (channelIndex !== payload.channelIndex) {
                    points = [];
                    needsRecalculate = true;
                }
                channelIndex = payload.channelIndex;
            }
            if (config.freqMin !== oldFreqMin || config.freqMax !== oldFreqMax || config.unitMode !== oldUnitMode) {
                needsRecalculate = true;
            }
            break;
        case 'ADD_DATA':
            addData(payload);
            break;
        case 'GET_SAMPLES':
            handleGetSamples(payload, idPromise);
            break;
        case 'CLEAR_DATA':
            points = [];
            lastCalculatedSpectrum = [];
            needsRecalculate = true;
            break;
        case 'POINTER_MOVE':
            hoverState = { active: true, x: payload?.x ?? 0 };
            break;
        case 'POINTER_LEAVE':
            hoverState = { active: false, x: 0 };
            break;
    }
};

function init(payload) {
    canvas = payload.canvas;
    ctx = canvas.getContext('2d', { alpha: true });
    width = payload.width;
    height = payload.height;
    config = { ...config, ...(payload.config || {}) };
    channelIndex = config.channelIndex ?? channelIndex;
    loop();
}

function addData(newPoints) {
    if (!Array.isArray(newPoints) || newPoints.length === 0) return;
    points.push(...newPoints);
    if (points.length > MAX_POINTS) {
        points = points.slice(points.length - MAX_POINTS);
    }
    needsRecalculate = true;
}

function handleGetSamples(payload, idPromise) {
    const { start, end } = payload || {};
    const result = points.filter((point) => point.time >= start && point.time <= end);
    self.postMessage({
        type: 'GET_SAMPLES_RESULT',
        idPromise,
        payload: result
    });
}

function loop() {
    try {
        draw();
    } catch (error) {
        console.error('FFT chart worker draw error:', error);
    }
    animationFrameId = requestAnimationFrame(loop);
}

function draw() {
    if (!ctx || width <= 0 || height <= 0) return;

    ctx.clearRect(0, 0, width, height);

    const paddingLeft = 50;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 35;
    const drawWidth = Math.max(1, width - paddingLeft - paddingRight);
    const drawHeight = Math.max(1, height - paddingTop - paddingBottom);

    const freqMin = Math.max(0, parseFloat(config.freqMin) || 0);
    const freqMax = Math.max(freqMin + 1, parseFloat(config.freqMax) || 60);
    const sampleRate = Number(config.sampleRate) || DEFAULT_SAMPLE_RATE;

    const isAmplitudeMode = config.unitMode === 'amplitude';

    if (points.length < MIN_FFT_SAMPLES) {
        drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, 0, 1, isAmplitudeMode);
        postStats({ min: 0, max: 0, mean: 0 });
        return;
    }

    if (needsRecalculate || lastCalculatedSpectrum.length === 0) {
        let spectrum = getPowerSpectrum(points.map((point) => point.value), sampleRate)
            .filter((item) => item.freq >= freqMin && item.freq <= freqMax);

        if (isAmplitudeMode) {
            spectrum = spectrum.map(item => ({ ...item, power: Math.sqrt(item.power) }));
        }

        lastCalculatedSpectrum = smoothSpectrumPoints(spectrum, 4);
        needsRecalculate = false;
    }

    const spectrum = lastCalculatedSpectrum;

    if (!spectrum.length) {
        drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, 0, 1, isAmplitudeMode);
        postStats({ min: 0, max: 0, mean: 0 });
        return;
    }

    const powers = spectrum.map((item) => item.power);
    const rawMax = Math.max(...powers);
    const rawMin = Math.min(...powers);
    const rawMean = powers.reduce((sum, value) => sum + value, 0) / powers.length;

    const manualRange = parseFloat(config.manualRange);
    const zoom = Math.max(0.1, parseFloat(config.zoom) || 1);

    // Zoom/Range logic: manual range takes precedence and ignores zoom (matching signal charts)
    let yMax;
    if (manualRange > 0) {
        yMax = manualRange;
    } else {
        yMax = (rawMax * 1.15) / zoom;
        if (yMax < 1e-9) yMax = 1e-9;
    }
    const yMin = 0;

    drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, yMin, yMax, isAmplitudeMode);
    const plottedPoints = drawSpectrum(spectrum, drawWidth, drawHeight, paddingLeft, paddingTop, freqMin, freqMax, yMin, yMax);

    // Draw the Max Peak Marker if config allows (enabled by default)
    if (config.showMaxMarker !== false && spectrum.length > 0) {
        drawMaxMarker(plottedPoints, rawMax, paddingLeft, paddingTop, drawWidth, drawHeight, isAmplitudeMode);
    }

    drawHover(plottedPoints, drawWidth, drawHeight, paddingLeft, paddingTop, freqMin, freqMax, yMin, yMax, isAmplitudeMode);

    postStats({ min: rawMin, max: rawMax, mean: rawMean });
}

function drawSpectrum(spectrum, drawWidth, drawHeight, paddingLeft, paddingTop, freqMin, freqMax, yMin, yMax) {
    const freqRange = Math.max(1, freqMax - freqMin);
    const powerRange = Math.max(1e-9, yMax - yMin);
    const xForFreq = (freq) => paddingLeft + ((freq - freqMin) / freqRange) * drawWidth;
    const yForPower = (power) => paddingTop + drawHeight - ((power - yMin) / powerRange) * drawHeight;

    const plottedPoints = spectrum.map((point) => ({
        ...point,
        x: xForFreq(point.freq),
        y: yForPower(Math.min(point.power, yMax)),
    }));

    const lineColor = config.color || '#3b82f6';
    ctx.save();
    ctx.beginPath();
    ctx.rect(paddingLeft, paddingTop, drawWidth, drawHeight);
    ctx.clip();

    const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + drawHeight);
    gradient.addColorStop(0, `${lineColor}44`);
    gradient.addColorStop(1, `${lineColor}00`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(plottedPoints[0]?.x || paddingLeft, paddingTop + drawHeight);
    if (plottedPoints[0]) {
        ctx.lineTo(plottedPoints[0].x, plottedPoints[0].y);
    }
    drawSmoothPath(plottedPoints, false);
    ctx.lineTo(plottedPoints[plottedPoints.length - 1]?.x || paddingLeft + drawWidth, paddingTop + drawHeight);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3;
    ctx.shadowBlur = 4;
    ctx.shadowColor = lineColor;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    drawSmoothPath(plottedPoints, true);
    ctx.stroke();

    ctx.restore();
    return plottedPoints;
}

function drawSmoothPath(plottedPoints, moveToStart = true) {
    if (!plottedPoints.length) return;
    if (plottedPoints.length === 1) {
        if (moveToStart) ctx.moveTo(plottedPoints[0].x, plottedPoints[0].y);
        else ctx.lineTo(plottedPoints[0].x, plottedPoints[0].y);
        return;
    }

    if (moveToStart) ctx.moveTo(plottedPoints[0].x, plottedPoints[0].y);
    for (let index = 0; index < plottedPoints.length - 1; index += 1) {
        const current = plottedPoints[index];
        const next = plottedPoints[index + 1];
        const controlX = (current.x + next.x) / 2;
        const controlY = (current.y + next.y) / 2;
        ctx.quadraticCurveTo(current.x, current.y, controlX, controlY);
    }
    const last = plottedPoints[plottedPoints.length - 1];
    ctx.lineTo(last.x, last.y);
}

function drawHover(plottedPoints, drawWidth, drawHeight, paddingLeft, paddingTop, freqMin, freqMax, yMin, yMax, isAmplitudeMode) {
    if (!hoverState.active || !plottedPoints.length) return;

    const clampedX = Math.max(paddingLeft, Math.min(paddingLeft + drawWidth, hoverState.x));
    const nearest = plottedPoints.reduce((best, point) => {
        if (!best) return point;
        return Math.abs(point.x - clampedX) < Math.abs(best.x - clampedX) ? point : best;
    }, null);

    if (!nearest) return;

    ctx.save();
    ctx.strokeStyle = config.color || '#3b82f6';
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nearest.x, paddingTop);
    ctx.lineTo(nearest.x, paddingTop + drawHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = config.color || '#3b82f6';
    ctx.beginPath();
    ctx.arc(nearest.x, nearest.y, 5, 0, Math.PI * 2);
    ctx.fill();

    const titleText = `${nearest.freq.toFixed(2)} Hz`;
    const bodyText = isAmplitudeMode ? `Amplitude: ${formatAmplitudeValue(nearest.power)}` : `Power: ${formatPowerValue(nearest.power)}`;
    ctx.font = 'bold 13px Inter, sans-serif';
    const boxWidth = Math.max(ctx.measureText(titleText).width, ctx.measureText(bodyText).width) + 24;
    const boxHeight = 52;
    const boxX = Math.min(Math.max(paddingLeft + 10, nearest.x + 16), paddingLeft + drawWidth - boxWidth - 8);
    const boxY = Math.max(paddingTop + 8, nearest.y - boxHeight - 12);

    ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
    ctx.strokeStyle = config.color || '#3b82f6';
    ctx.lineWidth = 1.5;
    roundRect(boxX, boxY, boxWidth, boxHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(titleText, boxX + 12, boxY + 10);
    ctx.fillStyle = config.color || '#3b82f6';
    ctx.font = '12px Inter, sans-serif';
    ctx.fillText(bodyText, boxX + 12, boxY + 30);
    ctx.restore();
}

function drawMaxMarker(plottedPoints, rawMax, paddingLeft, paddingTop, drawWidth, drawHeight, isAmplitudeMode) {
    if (!plottedPoints.length) return;

    // Find the point that matches the rawMax
    const peak = plottedPoints.find(p => p.power === rawMax);
    if (!peak) return;

    const lineColor = config.color || '#3b82f6';
    const textColor = config.themeAxisColor || '#9ca3af';

    ctx.save();

    // 1. Draw vertical indicator line (subtle dashed line)
    ctx.strokeStyle = lineColor;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(peak.x, paddingTop);
    ctx.lineTo(peak.x, paddingTop + drawHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1.0;

    // 2. Draw the Peak Point (prominent circle)
    ctx.fillStyle = lineColor;
    ctx.shadowBlur = 8;
    ctx.shadowColor = lineColor;
    ctx.beginPath();
    ctx.arc(peak.x, peak.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Add a little white center for better visibility
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(peak.x, peak.y, 2, 0, Math.PI * 2);
    ctx.fill();

    // 3. Draw Peak Label
    ctx.fillStyle = lineColor;
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const freqText = `${peak.freq.toFixed(1)} Hz`;
    const valText = isAmplitudeMode ? formatAmplitudeValue(peak.power) : formatPowerValue(peak.power);
    const fullText = `Peak: ${freqText} (${valText})`;

    // Safety check for label position
    let labelY = peak.y - 12;
    if (labelY < paddingTop + 20) labelY = peak.y + 25; // Flip to bottom if too high

    // Small translucent box behind label for readability
    const metrics = ctx.measureText(fullText);
    const boxW = metrics.width + 12;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
    ctx.roundRect(peak.x - boxW / 2, labelY - 14, boxW, 18, 4);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.fillText(fullText, peak.x, labelY);

    ctx.restore();
}

function drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, yMin, yMax, isAmplitudeMode) {
    const textColor = config.themeAxisColor || '#9ca3af';
    const freqRange = Math.max(1, freqMax - freqMin);
    const powerRange = Math.max(1e-9, yMax - yMin);

    ctx.save();
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 1;

    // Y Grid & Labels
    const yTicks = 5;
    ctx.font = 'bold 11px Inter, sans-serif'; // Bolder and larger font
    ctx.fillStyle = textColor;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let i = 0; i <= yTicks; i++) {
        const norm = i / yTicks;
        const y = paddingTop + norm * drawHeight;
        const val = yMax - norm * powerRange;

        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + drawWidth, y);
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#555555';
        if (config.themeAxisColor) ctx.strokeStyle = config.themeAxisColor;
        ctx.globalAlpha = 0.45;
        ctx.stroke();

        ctx.globalAlpha = 1.0;
        // Removed inline units as requested
        const label = isAmplitudeMode ? formatAmplitudeValue(val, { includeUnit: false }) : formatPowerValue(val, { includeUnit: false });
        ctx.fillText(label, paddingLeft - 15, y);
    }

    // Top-Right Unit Badge
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.globalAlpha = 0.8;
    ctx.fillText(isAmplitudeMode ? 'Unit: µV' : 'Unit: µV²', paddingLeft + drawWidth + 10, paddingTop + 18);

    // Horizontal Baseline (Zero Line) - Dashed again as requested
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = config.themeAxisColor || '#aaaaaa';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, paddingTop + drawHeight);
    ctx.lineTo(paddingLeft + drawWidth, paddingTop + drawHeight);
    ctx.stroke();

    // X Labels - Granular step of 2 units (Hz)
    ctx.globalAlpha = 1.0;
    ctx.textBaseline = 'bottom';
    ctx.font = 'bold 11px Inter, sans-serif';

    const parity = Math.round(freqMin) % 2;

    for (let freq = Math.ceil(freqMin); freq <= freqMax; freq++) {
        if (Math.round(freq) % 2 !== parity) continue;

        const norm = (freq - freqMin) / freqRange;
        if (norm < 0 || norm > 1) continue;

        const x = paddingLeft + norm * drawWidth;

        if (norm < 0.05) ctx.textAlign = 'left';
        else if (norm > 0.95) ctx.textAlign = 'right';
        else ctx.textAlign = 'center';

        ctx.fillText(`${Math.round(freq)}Hz`, x, height - 10);
    }
    ctx.restore();
}

function roundRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function postStats(stats) {
    const now = performance.now();
    if (now - lastStatsTime < STATS_INTERVAL) return;
    lastStatsTime = now;
    self.postMessage({ type: 'STATS', payload: stats });
}
