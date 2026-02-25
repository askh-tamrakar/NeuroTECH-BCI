/* eslint-disable no-restricted-globals */

let canvas = null;
let ctx = null;
let width = 0;
let height = 0;

let activePoints = [];
let historyPoints = [];
let activeColor = '#3b82f6';
let historyColor = '#3b82f64D';
let scannerX = null;
let annotations = [];

let config = {
    timeWindow: 10000,
    yMin: -1500,
    yMax: 1500,
    zoom: 1,
    lineColor: '#3b82f6',
    bgColor: 'transparent',
    gridColor: '#333333',
    textColor: '#888888',
    showGrid: true
};

let frameCount = 0;

self.onmessage = function (e) {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            canvas = payload.canvas;
            ctx = canvas.getContext('2d', { alpha: true });
            width = payload.width;
            height = payload.height;
            if (payload.config) config = { ...config, ...payload.config };
            break;
        case 'RESIZE':
            width = payload.width;
            height = payload.height;
            if (canvas) {
                canvas.width = width;
                canvas.height = height;
                draw();
            }
            break;
        case 'SET_CONFIG':
            config = { ...config, ...payload };
            draw();
            break;
        case 'DRAW_SWEEP':
            activePoints = payload.active || [];
            historyPoints = payload.history || [];
            activeColor = payload.activeColor || config.lineColor;
            historyColor = payload.historyColor || config.lineColor + '4D';
            scannerX = payload.scannerX;
            annotations = payload.annotations || [];
            draw(); // Synchronous draw instead of loop
            break;
        case 'CLEAR_DATA':
            activePoints = [];
            historyPoints = [];
            draw();
            break;
    }
};

function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    if (config.bgColor && config.bgColor !== 'transparent') {
        ctx.fillStyle = config.bgColor;
        ctx.fillRect(0, 0, width, height);
    }

    const timeWindow = config.timeWindow;
    const timeToPx = (t_mod) => (t_mod / timeWindow) * width;

    const yMin = config.yMin / (config.zoom || 1);
    const yMax = config.yMax / (config.zoom || 1);
    const yRange = yMax - yMin || 1;
    const padY = height * 0.1; 
    const availH = height - 2 * padY;

    const valToPy = (val) => {
        const norm = (val - yMin) / yRange;
        return height - (padY + norm * availH);
    };

    if (config.showGrid !== false) drawStaticGrid(timeWindow, yMin, yMax, yRange);

    // Draw History Line
    if (historyPoints.length > 0) {
        ctx.strokeStyle = historyColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(timeToPx(historyPoints[0].time), valToPy(historyPoints[0].value));
        for (let i = 1; i < historyPoints.length; i++) {
            ctx.lineTo(timeToPx(historyPoints[i].time), valToPy(historyPoints[i].value));
        }
        ctx.stroke();
    }

    // Draw Active Line (Neon Glow)
    if (activePoints.length > 0) {
        ctx.strokeStyle = activeColor;
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 8;
        ctx.shadowColor = activeColor;

        ctx.beginPath();
        ctx.moveTo(timeToPx(activePoints[0].time), valToPy(activePoints[0].value));
        for (let i = 1; i < activePoints.length; i++) {
            ctx.lineTo(timeToPx(activePoints[i].time), valToPy(activePoints[i].value));
        }
        ctx.stroke();
    }
    ctx.shadowBlur = 0; // Reset

    // Scanner line
    if (scannerX !== null) {
        const px = timeToPx(scannerX);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, 0);
        ctx.lineTo(px, height);
        ctx.stroke();

        // Current Value Dot at scanner tip
        if (activePoints.length > 0) {
            const lastPt = activePoints[activePoints.length - 1];
            const y_px = valToPy(lastPt.value);
            ctx.fillStyle = activeColor;
            ctx.shadowBlur = 10;
            ctx.shadowColor = activeColor;
            ctx.beginPath();
            ctx.arc(px, y_px, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    // Annotations
    annotations.forEach(ann => {
        const px = timeToPx(ann.x);
        const py = valToPy(ann.y || 0);

        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = ann.color || '#ef4444';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();

        ctx.fillStyle = ann.color || '#ef4444';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(ann.label || 'BLINK', px, py - 10);
    });

    computeAndSendStats();
}

function computeAndSendStats() {
    let minVis = Infinity, maxVis = -Infinity, sumVis = 0, countVis = 0;
    const allPts = [...historyPoints, ...activePoints];
    allPts.forEach(p => {
        if (p.value < minVis) minVis = p.value;
        if (p.value > maxVis) maxVis = p.value;
        sumVis += p.value;
        countVis++;
    });

    frameCount++;
    if (frameCount % 10 === 0 && countVis > 0) {
        self.postMessage({
            type: 'STATS',
            payload: { min: minVis, max: maxVis, mean: sumVis / countVis }
        });
    }
}

function drawStaticGrid(timeWindow, yMin, yMax, yRange) {
    ctx.strokeStyle = config.gridColor || 'rgba(51, 51, 51, 0.3)';
    ctx.lineWidth = 1;
    ctx.font = '10px monospace';
    ctx.fillStyle = config.textColor || '#888';
    
    ctx.beginPath();
    ctx.setLineDash([3, 3]);

    const numXDivs = 10;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= numXDivs; i++) {
        const ratio = i / numXDivs;
        const x_px = ratio * width;
        const time_val = (ratio * timeWindow)/1000;
        
        ctx.moveTo(x_px, 0);
        ctx.lineTo(x_px, height);
        ctx.fillText(time_val.toFixed(1) + 's', x_px, height - 12);
    }

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    for (let i = 0; i <= 5; i++) {
        const norm = i / 5;
        const val = yMin + norm * yRange;
        const y = height - (height * 0.1 + norm * (height * 0.8));

        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.fillText(Math.round(val), 2, y - 2);
    }
    
    ctx.stroke();
    ctx.setLineDash([]);
}
