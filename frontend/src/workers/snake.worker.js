/* eslint-disable no-restricted-globals */

// --- Settings ---
let SETTINGS = {
    GRID_COLS: 20,
    GRID_ROWS: 20,
    TICK_INTERVAL: 200,
    INITIAL_LENGTH: 3,
    CANVAS_WIDTH: 800,
    CANVAS_HEIGHT: 376,
    ENABLE_GRID_LINES: true,
};

// --- Game State ---
let canvas = null;
let ctx = null;
let animationId = null;
let lastTime = 0;

let gameState = 'ready'; // 'ready', 'playing', 'paused', 'gameOver'
let score = 0;           // Total cells traversed without dying
let highScore = 0;
let foodEaten = 0;       // "Jump" counter (food eaten = growth events)
let bestFoodEaten = 0;
let cellsTraversed = 0;  // Running count of cells visited
let gridCols = 20;
let gridRows = 20;
let cellSize = 20;
let gridOffsetX = 0;
let gridOffsetY = 0;
let snake = [];
let direction = 'right';
let nextDirection = 'right';
let food = null;
let tickAccumulator = 0;
let tickInterval = 200;
let lastSentScore = 0;

// --- Theme Colors ---
let COLORS = {
    bg: '#ffffff',
    surface: '#f3f4f6',
    text: '#111827',
    primary: '#3b82f6',
    border: '#e5e7eb',
    muted: '#9ca3af',
    accent: '#3b82f6',
    snakeHead: '#22c55e',
    snakeBody: '#16a34a',
    foodColors: ['#ef4444', '#22c55e', '#eab308', '#3b82f6'],
    foodGlowColors: ['#fca5a5', '#86efac', '#fde68a', '#93c5fd'],
    overlay: 'rgba(0,0,0,0.3)',
};

// Dynamic colors based on theme
let CURRENT_COLORS = { ...COLORS };
let isNight = false;

// --- Initialization ---

function initGame() {
    gridCols = SETTINGS.GRID_COLS;
    gridRows = SETTINGS.GRID_ROWS;
    tickInterval = SETTINGS.TICK_INTERVAL;

    // Calculate cell size to fill entire canvas
    const maxCellW = Math.floor(SETTINGS.CANVAS_WIDTH / gridCols);
    const maxCellH = Math.floor(SETTINGS.CANVAS_HEIGHT / gridRows);
    cellSize = Math.min(maxCellW, maxCellH);

    // Full canvas: start from top-left, fill width, stretch rows
    const totalGridW = gridCols * cellSize;
    const totalGridH = gridRows * cellSize;
    gridOffsetX = 0;
    // Keep the grid starting from top, fill width entirely
    // If the grid is taller than canvas, reduce cell size
    if (totalGridH > SETTINGS.CANVAS_HEIGHT) {
        cellSize = Math.floor(SETTINGS.CANVAS_HEIGHT / gridRows);
        gridOffsetX = 0;
    }

    // Initialize snake
    const startX = Math.floor(gridCols / 2);
    const startY = Math.floor(gridRows / 2);
    snake = [];
    for (let i = 0; i < SETTINGS.INITIAL_LENGTH; i++) {
        snake.push({ x: startX - i, y: startY });
    }
    direction = 'right';
    nextDirection = 'right';
    foodEaten = 0;
    cellsTraversed = 0;
    score = 0;
    lastSentScore = 0;

    // Spawn first food
    spawnFood();
}

let foodColorIndex = 0;

function spawnFood() {
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    let pos;
    let attempts = 0;
    do {
        pos = {
            x: Math.floor(Math.random() * gridCols),
            y: Math.floor(Math.random() * gridRows)
        };
        attempts++;
    } while (occupied.has(`${pos.x},${pos.y}`) && attempts < 1000);
    food = pos;
    // Cycle through 4 food colors
    foodColorIndex = (foodColorIndex + 1) % 4;
}

function resetGame() {
    gameState = 'playing';
    initGame();
    tickAccumulator = 0;
    self.postMessage({ type: 'STATE_UPDATE', payload: 'playing' });
    self.postMessage({ type: 'SCORE_UPDATE', score: score });
    self.postMessage({ type: 'OBSTACLE_CLEARED', obstaclesPassed: 0 });
}

// --- Input Handling ---

function handleInput(action, payload) {
    if (action === 'start') {
        if (gameState === 'ready' || gameState === 'gameOver') {
            resetGame();
        }
        return;
    }

    if (action === 'jump') {
        // Single blink → Turn RIGHT (clockwise)
        if (gameState === 'ready' || gameState === 'gameOver') {
            resetGame();
            return;
        }
        if (gameState === 'playing') {
            const dirMap = { 'up': 'right', 'right': 'down', 'down': 'left', 'left': 'up' };
            const newDir = dirMap[direction];
            // Prevent 180° reversal
            if (newDir !== getOppositeDirection(direction)) {
                nextDirection = newDir;
            }
        }
    } else if (action === 'pause') {
        // Double blink → Turn LEFT (counter-clockwise)
        if (gameState === 'playing') {
            const dirMap = { 'up': 'left', 'left': 'down', 'down': 'right', 'right': 'up' };
            const newDir = dirMap[direction];
            if (newDir !== getOppositeDirection(direction)) {
                nextDirection = newDir;
            }
        } else if (gameState === 'paused') {
            gameState = 'playing';
            self.postMessage({ type: 'STATE_UPDATE', payload: 'playing' });
        }
    } else if (action === 'reset') {
        gameState = 'ready';
        initGame();
        tickAccumulator = 0;
    } else if (action === 'setDirection') {
        // Arrow key direction control (absolute direction)
        const dir = payload?.direction;
        if (dir && ['up', 'down', 'left', 'right'].includes(dir)) {
            // Arrow keys also start the game when ready/gameOver
            if (gameState === 'ready' || gameState === 'gameOver') {
                resetGame();
                // Set initial direction based on arrow key
                direction = dir;
                nextDirection = dir;
            } else if (gameState === 'playing') {
                // Prevent 180° reversal
                if (dir !== getOppositeDirection(direction)) {
                    nextDirection = dir;
                }
            }
        }
    }
}

function getOppositeDirection(dir) {
    const opposites = { 'up': 'down', 'down': 'up', 'left': 'right', 'right': 'left' };
    return opposites[dir];
}

// --- Game Logic ---

function moveSnake() {
    if (gameState !== 'playing') return;

    // Apply queued direction
    direction = nextDirection;

    // Calculate new head position
    const head = snake[0];
    let newHead = { x: head.x, y: head.y };
    switch (direction) {
        case 'up': newHead.y -= 1; break;
        case 'down': newHead.y += 1; break;
        case 'left': newHead.x -= 1; break;
        case 'right': newHead.x += 1; break;
    }

    // Check wall collision
    if (newHead.x < 0 || newHead.x >= gridCols || newHead.y < 0 || newHead.y >= gridRows) {
        gameOver();
        return;
    }

    // Check self collision (skip tail since it will move if no food eaten)
    const willEat = food && newHead.x === food.x && newHead.y === food.y;
    const checkSegments = willEat ? snake : snake.slice(0, -1);
    for (const segment of checkSegments) {
        if (segment.x === newHead.x && segment.y === newHead.y) {
            gameOver();
            return;
        }
    }

    // Move snake: add new head
    snake.unshift(newHead);

    // Increment cells traversed (score = cells survived without dying)
    cellsTraversed++;
    score = cellsTraversed;

    // Check food
    if (willEat) {
        foodEaten++;
        spawnFood();
        self.postMessage({ type: 'OBSTACLE_CLEARED', obstaclesPassed: foodEaten });
    } else {
        snake.pop();
    }

    // Always update score (cells traversed)
    if (score !== lastSentScore) {
        lastSentScore = score;
        self.postMessage({ type: 'SCORE_UPDATE', score: score });
    }
}

function gameOver() {
    gameState = 'gameOver';
    if (score > highScore) {
        highScore = score;
        self.postMessage({ type: 'HIGHSCORE_UPDATE', highScore });
    }
    if (foodEaten > bestFoodEaten) {
        bestFoodEaten = foodEaten;
    }
    self.postMessage({ type: 'GAME_OVER', score });
}

// --- Update ---

function update(deltaTime) {
    if (gameState === 'playing') {
        tickAccumulator += deltaTime;
        while (tickAccumulator >= tickInterval) {
            tickAccumulator -= tickInterval;
            moveSnake();
        }
    }
}

// --- Drawing ---

function drawGrid() {
    const gridColor = COLORS.border;
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 0.5;
    ctx.globalAlpha = 0.3;

    for (let x = 0; x <= gridCols; x++) {
        ctx.beginPath();
        ctx.moveTo(gridOffsetX + x * cellSize, gridOffsetY);
        ctx.lineTo(gridOffsetX + x * cellSize, gridOffsetY + gridRows * cellSize);
        ctx.stroke();
    }
    for (let y = 0; y <= gridRows; y++) {
        ctx.beginPath();
        ctx.moveTo(gridOffsetX, gridOffsetY + y * cellSize);
        ctx.lineTo(gridOffsetX + gridCols * cellSize, gridOffsetY + y * cellSize);
        ctx.stroke();
    }
    ctx.globalAlpha = 1.0;
}

function drawFood() {
    if (!food) return;
    const fx = gridOffsetX + food.x * cellSize;
    const fy = gridOffsetY + food.y * cellSize;
    const pad = Math.max(1, Math.floor(cellSize * 0.15));

    // Get the 4 food colors cycling
    const foodColors = COLORS.foodColors || ['#ef4444', '#22c55e', '#eab308', '#3b82f6'];
    const foodGlowColors = COLORS.foodGlowColors || ['#fca5a5', '#86efac', '#fde68a', '#93c5fd'];
    const colorIdx = foodColorIndex % 4;

    // Food glow
    ctx.fillStyle = foodGlowColors[colorIdx];
    ctx.globalAlpha = 0.3;
    ctx.fillRect(fx - pad, fy - pad, cellSize + pad * 2, cellSize + pad * 2);
    ctx.globalAlpha = 1.0;

    // Food block (diamond/apple shape using 4 triangles)
    ctx.fillStyle = foodColors[colorIdx];
    const cx = fx + cellSize / 2;
    const cy = fy + cellSize / 2;
    const r = cellSize / 2 - pad;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);           // top
    ctx.lineTo(cx + r, cy);           // right
    ctx.lineTo(cx, cy + r);           // bottom
    ctx.lineTo(cx - r, cy);           // left
    ctx.closePath();
    ctx.fill();

    // Stem (small line on top)
    ctx.strokeStyle = foodColors[colorIdx];
    ctx.lineWidth = Math.max(1, Math.floor(cellSize * 0.08));
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy - r - pad * 1.5);
    ctx.stroke();
}

function drawSnake() {
    if (!snake.length) return;

    // Use theme primary color for snake
    const headColor = COLORS.primary;
    const bodyColor = COLORS.primary;

    // Draw body (tail to head-1)
    for (let i = snake.length - 1; i > 0; i--) {
        const seg = snake[i];
        const sx = gridOffsetX + seg.x * cellSize;
        const sy = gridOffsetY + seg.y * cellSize;
        const pad = Math.max(1, Math.floor(cellSize * 0.1));

        // Body gradient: darker towards tail
        const t = i / snake.length;
        ctx.fillStyle = lerpColor(bodyColor, headColor, 1 - t * 0.3);
        ctx.fillRect(sx + pad, sy + pad, cellSize - pad * 2, cellSize - pad * 2);

        // Subtle border
        ctx.strokeStyle = darkenColor(COLORS.primary, 0.4);
        ctx.lineWidth = 0.5;
        ctx.strokeRect(sx + pad, sy + pad, cellSize - pad * 2, cellSize - pad * 2);
    }

    // Draw head
    const head = snake[0];
    const hx = gridOffsetX + head.x * cellSize;
    const hy = gridOffsetY + head.y * cellSize;
    const pad = Math.max(1, Math.floor(cellSize * 0.08));

    ctx.fillStyle = headColor;
    ctx.fillRect(hx + pad, hy + pad, cellSize - pad * 2, cellSize - pad * 2);

    // Head border
    ctx.strokeStyle = COLORS.bg;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hx + pad, hy + pad, cellSize - pad * 2, cellSize - pad * 2);

    // Eyes (based on direction)
    const eyeSize = Math.max(2, Math.floor(cellSize * 0.15));
    const eyeOff = Math.floor(cellSize * 0.3);
    const eyeColor = COLORS.bg;

    ctx.fillStyle = eyeColor;
    let eye1x, eye1y, eye2x, eye2y;
    const cx = hx + cellSize / 2;
    const cy = hy + cellSize / 2;

    switch (direction) {
        case 'right':
            eye1x = cx + eyeOff; eye1y = cy - eyeOff;
            eye2x = cx + eyeOff; eye2y = cy + eyeOff;
            break;
        case 'left':
            eye1x = cx - eyeOff; eye1y = cy - eyeOff;
            eye2x = cx - eyeOff; eye2y = cy + eyeOff;
            break;
        case 'up':
            eye1x = cx - eyeOff; eye1y = cy - eyeOff;
            eye2x = cx + eyeOff; eye2y = cy - eyeOff;
            break;
        case 'down':
            eye1x = cx - eyeOff; eye1y = cy + eyeOff;
            eye2x = cx + eyeOff; eye2y = cy + eyeOff;
            break;
    }

    ctx.fillRect(eye1x - eyeSize / 2, eye1y - eyeSize / 2, eyeSize, eyeSize);
    ctx.fillRect(eye2x - eyeSize / 2, eye2y - eyeSize / 2, eyeSize, eyeSize);

    // Pupils
    const pupilSize = Math.max(1, Math.floor(eyeSize * 0.5));
    ctx.fillStyle = darkenColor(COLORS.primary, 0.3);
    ctx.fillRect(eye1x - pupilSize / 2, eye1y - pupilSize / 2, pupilSize, pupilSize);
    ctx.fillRect(eye2x - pupilSize / 2, eye2y - pupilSize / 2, pupilSize, pupilSize);
}

function lerpColor(c1, c2, t) {
    // Simple hex color lerp
    if (c1.startsWith('#')) c1 = hexToRgb(c1);
    if (c2.startsWith('#')) c2 = hexToRgb(c2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `rgb(${r},${g},${b})`;
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
}

function darkenColor(color, amount) {
    if (color.startsWith('#')) color = hexToRgb(color);
    const r = Math.round(color.r * (1 - amount));
    const g = Math.round(color.g * (1 - amount));
    const b = Math.round(color.b * (1 - amount));
    return `rgb(${r},${g},${b})`;
}

function drawOverlay() {
    const width = SETTINGS.CANVAS_WIDTH;
    const height = SETTINGS.CANVAS_HEIGHT;

    if (gameState === 'ready') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px sans-serif';
        ctx.fillStyle = COLORS.text;
        ctx.fillText('Blink or Arrow Keys to Start!', width / 2, height / 2 - 30);

        ctx.font = '16px sans-serif';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText('Single Blink = Turn Right  •  Double Blink = Turn Left', width / 2, height / 2 + 10);

        ctx.font = '14px sans-serif';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText('Arrow Keys = Direction', width / 2, height / 2 + 40);
    } else if (gameState === 'paused') {
        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = COLORS.primary;
        ctx.fillText('PAUSED', width / 2, height / 2 - 20);

        ctx.font = '24px sans-serif';
        ctx.fillStyle = COLORS.text;
        ctx.fillText('Double Blink to resume', width / 2, height / 2 + 20);
    } else if (gameState === 'gameOver') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillStyle = COLORS.primary;
        ctx.fillText('GAME OVER!', width / 2, height / 2 - 30);

        ctx.font = '24px sans-serif';
        ctx.fillStyle = COLORS.text;
        ctx.fillText('Blink to restart', width / 2, height / 2 + 10);
    }
}



function draw() {
    if (!ctx) return;

    try {
        const width = SETTINGS.CANVAS_WIDTH;
        const height = SETTINGS.CANVAS_HEIGHT;

        // Clear
        ctx.clearRect(0, 0, width, height);

        // Background — full canvas IS the play area
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, width, height);

        // Grid lines
        if (SETTINGS.ENABLE_GRID_LINES && cellSize >= 12) {
            drawGrid();
        }

        // Food
        drawFood();

        // Snake
        drawSnake();

        // Overlay (ready/paused/game over)
        drawOverlay();
    } catch (err) {
        console.error("[Snake Worker] Draw Error:", err);
    }
}

// --- Main Loop ---

function loop() {
    const now = Date.now();
    const deltaTime = now - lastTime;
    lastTime = now;

    update(deltaTime);
    draw();

    animationId = requestAnimationFrame(loop);
}

// --- Messaging ---

self.onmessage = (e) => {
    const { type, payload } = e.data;

    switch (type) {
        case 'INIT':
            canvas = payload.canvas;
            ctx = canvas.getContext('2d');
            Object.assign(SETTINGS, payload.settings);
            canvas.width = SETTINGS.CANVAS_WIDTH;
            canvas.height = SETTINGS.CANVAS_HEIGHT;

            if (payload.theme) {
                Object.assign(COLORS, payload.theme);
            }
            highScore = payload.highScore || 0;
            bestFoodEaten = payload.bestFoodEaten || 0;

            // Detect night theme
            if (payload.theme && payload.theme.bg) {
                isNight = isDarkColor(payload.theme.bg);
            }

            initGame();
            lastTime = Date.now();
            loop();
            break;

        case 'THEME_UPDATE':
            if (payload) {
                Object.assign(COLORS, payload);
                if (payload.bg) {
                    isNight = isDarkColor(payload.bg);
                }
            }
            break;

        case 'SETTINGS':
            Object.assign(SETTINGS, payload);
            if (payload.highScore !== undefined) highScore = payload.highScore;
            if (payload.bestFoodEaten !== undefined) bestFoodEaten = payload.bestFoodEaten;
            if (payload.GRID_COLS || payload.GRID_ROWS) {
                initGame();
            }
            break;

        case 'RESIZE':
            if (canvas && payload.width && payload.height) {
                canvas.width = payload.width;
                canvas.height = payload.height;
                SETTINGS.CANVAS_WIDTH = payload.width;
                SETTINGS.CANVAS_HEIGHT = payload.height;
                // Recalculate grid layout
                initGame();
                draw();
            }
            break;

        case 'INPUT':
            if (payload.action === 'setDirection') {
                handleInput(payload.action, payload);
            } else {
                handleInput(payload.action);
            }
            break;

        case 'RESET_SCORE':
            highScore = 0;
            bestFoodEaten = 0;
            break;
    }
};

function isDarkColor(color) {
    if (!color) return false;
    let hex = color.trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const rgb = parseInt(hex, 16);
    if (isNaN(rgb)) return false;
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;
    return (r * 0.299 + g * 0.587 + b * 0.114) < 128;
}
