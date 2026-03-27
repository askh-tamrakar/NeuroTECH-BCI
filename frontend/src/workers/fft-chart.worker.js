/* eslint-disable no-restricted-globals */
import { getPowerSpectrum } from '../utils/fft';
import { formatPowerValue, smoothSpectrumPoints } from '../utils/spectrumFormat';

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;
let points = [];
let channelIndex = -1;
let animationFrameId = null;
let lastStatsTime = 0;
let hoverState = { active: false, x: 0 };

const MAX_POINTS = 8192;
const STATS_INTERVAL = 200;
const DEFAULT_SAMPLE_RATE = 1000;
const MIN_FFT_SAMPLES = 128;

let config = {
    channelIndex: -1,
    color: '#3b82f6',
    themeAxisColor: '#9ca3af',
    freqMin: 1,
    freqMax: 50,
    zoom: 1,
    manualRange: '',
    sampleRate: DEFAULT_SAMPLE_RATE,
    disabled: false,
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
            config = { ...config, ...payload };
            if (payload.channelIndex !== undefined) channelIndex = payload.channelIndex;
            break;
        case 'ADD_DATA':
            addData(payload);
            break;
        case 'GET_SAMPLES':
            handleGetSamples(payload, idPromise);
            break;
        case 'CLEAR_DATA':
            points = [];
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

    const paddingLeft = 52;
    const paddingRight = 14;
    const paddingTop = 18;
    const paddingBottom = 30;
    const drawWidth = Math.max(1, width - paddingLeft - paddingRight);
    const drawHeight = Math.max(1, height - paddingTop - paddingBottom);

    const freqMin = Math.max(0, Number(config.freqMin) || 0);
    const freqMax = Math.max(freqMin + 1, Number(config.freqMax) || 50);
    const sampleRate = Number(config.sampleRate) || DEFAULT_SAMPLE_RATE;

    drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, 0, 1);

    if (points.length < MIN_FFT_SAMPLES) {
        postStats({ min: 0, max: 0, mean: 0 });
        return;
    }

    const spectrum = smoothSpectrumPoints(
        getPowerSpectrum(points.map((point) => point.value), sampleRate)
            .filter((item) => item.freq >= freqMin && item.freq <= freqMax),
        4
    );

    if (!spectrum.length) {
        postStats({ min: 0, max: 0, mean: 0 });
        return;
    }

    const powers = spectrum.map((item) => item.power);
    const rawMin = Math.min(...powers);
    const rawMax = Math.max(...powers);
    const rawMean = powers.reduce((sum, value) => sum + value, 0) / powers.length;

    const manualRange = Number(config.manualRange);
    const autoMax = rawMax > 0 ? rawMax * 1.1 : 1;
    const yMax = Number.isFinite(manualRange) && manualRange > 0
        ? manualRange
        : Math.max(autoMax / Math.max(1, Number(config.zoom) || 1), autoMax * 0.05);
    const yMin = 0;

    drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, yMin, yMax);
    const plottedPoints = drawSpectrum(spectrum, drawWidth, drawHeight, paddingLeft, paddingTop, freqMin, freqMax, yMin, yMax);
    drawHover(plottedPoints, drawWidth, drawHeight, paddingLeft, paddingTop, freqMin, freqMax, yMin, yMax);
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

    ctx.save();
    ctx.beginPath();
    ctx.rect(paddingLeft, paddingTop, drawWidth, drawHeight);
    ctx.clip();

    const gradient = ctx.createLinearGradient(0, paddingTop, 0, paddingTop + drawHeight);
    gradient.addColorStop(0, `${config.color}33`);
    gradient.addColorStop(1, `${config.color}00`);

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

    ctx.strokeStyle = config.color;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = config.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    drawSmoothPath(plottedPoints, true);
    ctx.stroke();

    const lastPoint = plottedPoints[plottedPoints.length - 1];
    if (lastPoint) {
        ctx.fillStyle = config.color;
        ctx.beginPath();
        ctx.arc(lastPoint.x, lastPoint.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
    return plottedPoints;
}

function drawSmoothPath(plottedPoints, moveToStart = true) {
    if (!plottedPoints.length) return;
    if (plottedPoints.length === 1) {
        if (moveToStart) {
            ctx.moveTo(plottedPoints[0].x, plottedPoints[0].y);
        } else {
            ctx.lineTo(plottedPoints[0].x, plottedPoints[0].y);
        }
        return;
    }

    if (moveToStart) {
        ctx.moveTo(plottedPoints[0].x, plottedPoints[0].y);
    }
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

function drawHover(plottedPoints, drawWidth, drawHeight, paddingLeft, paddingTop) {
    if (!hoverState.active || !plottedPoints.length) return;

    const clampedX = Math.max(paddingLeft, Math.min(paddingLeft + drawWidth, hoverState.x));
    const nearest = plottedPoints.reduce((best, point) => {
        if (!best) return point;
        return Math.abs(point.x - clampedX) < Math.abs(best.x - clampedX) ? point : best;
    }, null);

    if (!nearest) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(nearest.x, paddingTop);
    ctx.lineTo(nearest.x, paddingTop + drawHeight);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = config.color;
    ctx.beginPath();
    ctx.arc(nearest.x, nearest.y, 5, 0, Math.PI * 2);
    ctx.fill();

    const title = `${nearest.freq.toFixed(2)} Hz`;
    const body = `Power: ${formatPowerValue(nearest.power)}`;
    ctx.font = 'bold 14px sans-serif';
    const boxWidth = Math.max(ctx.measureText(title).width, ctx.measureText(body).width) + 24;
    const boxHeight = 56;
    const boxX = Math.min(Math.max(paddingLeft + 10, nearest.x + 16), paddingLeft + drawWidth - boxWidth - 8);
    const boxY = Math.max(paddingTop + 8, nearest.y - boxHeight - 12);

    ctx.fillStyle = '#111111';
    ctx.strokeStyle = config.color;
    ctx.lineWidth = 1.5;
    roundRect(boxX, boxY, boxWidth, boxHeight, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#f5f5f5';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, boxX + 12, boxY + 10);

    ctx.fillStyle = config.color;
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText(body, boxX + 12, boxY + 30);
    ctx.restore();
}

function drawGrid(drawWidth, drawHeight, paddingLeft, paddingTop, paddingBottom, freqMin, freqMax, yMin, yMax) {
    const axisColor = config.themeAxisColor || '#9ca3af';
    const powerRange = Math.max(1e-9, yMax - yMin);
    const freqRange = Math.max(1, freqMax - freqMin);

    ctx.save();
    ctx.strokeStyle = axisColor;
    ctx.fillStyle = axisColor;
    ctx.font = '10px sans-serif';
    ctx.globalAlpha = 0.32;

    for (let i = 0; i < 6; i++) {
        const norm = i / 5;
        const y = paddingTop + norm * drawHeight;
        const value = yMax - norm * powerRange;

        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(paddingLeft, y);
        ctx.lineTo(paddingLeft + drawWidth, y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.globalAlpha = 0.85;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(formatPowerValue(value, { decimals: 1, includeUnit: false }), paddingLeft - 8, y);
        ctx.globalAlpha = 0.32;
    }

    for (let i = 0; i < 6; i++) {
        const norm = i / 5;
        const x = paddingLeft + norm * drawWidth;
        const freq = freqMin + norm * freqRange;

        ctx.globalAlpha = 0.78;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(`${Math.round(freq)}Hz`, x, height - paddingBottom + 8);
        ctx.globalAlpha = 0.32;
    }

    ctx.globalAlpha = 1;
    ctx.restore();
}

function roundRect(x, y, widthValue, heightValue, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + widthValue, y, x + widthValue, y + heightValue, radius);
    ctx.arcTo(x + widthValue, y + heightValue, x, y + heightValue, radius);
    ctx.arcTo(x, y + heightValue, x, y, radius);
    ctx.arcTo(x, y, x + widthValue, y, radius);
    ctx.closePath();
}

function postStats(stats) {
    const now = Date.now();
    if (now - lastStatsTime < STATS_INTERVAL) return;
    lastStatsTime = now;
    self.postMessage({ type: 'STATS', payload: stats });
}
