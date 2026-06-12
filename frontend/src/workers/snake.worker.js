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
let cellSize = 21;
let gridOffsetX = 0;
let gridOffsetY = 0;
let snake = [];
let direction = 'right';
let nextDirection = 'right';
let food = null;
let tickAccumulator = 0;
let tickInterval = 200;
let lastSentScore = 0;
let appleSprites = []; // Array of 5 ImageBitmaps (red, green, yellow, blue, purple)
let appleThemeIndex = 0; // Which apple to use based on theme

// Tail rattle burst state
let tailRattleActive = false;
let tailRattleStart = 0;
let nextRattleTime = 3000;

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

let CURRENT_COLORS = { ...COLORS };
let isNight = false;

// --- Initialization ---

function initGame() {
    gridCols = SETTINGS.GRID_COLS;
    gridRows = SETTINGS.GRID_ROWS;
    tickInterval = SETTINGS.TICK_INTERVAL;

    // Cell size from height (floor to fit within canvas), extend columns for slight overflow
    const EDGE_EXTRA = 8; // pixels to extend beyond left/right edges
    cellSize = Math.floor(SETTINGS.CANVAS_HEIGHT / SETTINGS.GRID_ROWS);
    gridCols = Math.floor((SETTINGS.CANVAS_WIDTH + EDGE_EXTRA * 2) / cellSize);
    gridRows = SETTINGS.GRID_ROWS;
    gridOffsetX = EDGE_EXTRA;
    gridOffsetY = 2;

    // Pick the right apple based on theme primary color hue
    appleThemeIndex = getAppleIndexForTheme(COLORS.primary);
    // Clamp to available sprites (in case purple apple is missing)
    if (appleSprites.length > 0) {
        appleThemeIndex = Math.min(appleThemeIndex, appleSprites.length - 1);
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

    // Reset rattle state
    tailRattleActive = false;
    tailRattleStart = 0;
    nextRattleTime = Date.now() + 2000 + Math.random() * 3000;
}

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
        // Single blink: LEFT→UP, RIGHT→UP, UP→RIGHT, DOWN→RIGHT
        if (gameState === 'ready' || gameState === 'gameOver') {
            resetGame();
            return;
        }
        if (gameState === 'playing') {
            const dirMap = { 'left': 'up', 'right': 'up', 'up': 'right', 'down': 'right' };
            const newDir = dirMap[direction];
            if (newDir !== getOppositeDirection(direction)) {
                nextDirection = newDir;
            }
        }
    } else if (action === 'pause') {
        // Double blink: LEFT→DOWN, RIGHT→DOWN, UP→LEFT, DOWN→LEFT
        if (gameState === 'playing') {
            const dirMap = { 'left': 'down', 'right': 'down', 'up': 'left', 'down': 'left' };
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

    // Wall wrap: snake comes from the opposite side instead of dying
    if (newHead.x < 0) newHead.x = gridCols - 1;
    else if (newHead.x >= gridCols) newHead.x = 0;
    if (newHead.y < 0) newHead.y = gridRows - 1;
    else if (newHead.y >= gridRows) newHead.y = 0;

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
    if (!food || !appleSprites.length) return;
    const fx = gridOffsetX + food.x * cellSize;
    const fy = gridOffsetY + food.y * cellSize;

    // Use the theme-selected apple sprite
    const sprite = appleSprites[appleThemeIndex];
    if (!sprite) return;

    // Draw apple sprite to fill the cell
    ctx.drawImage(sprite, fx, fy, cellSize, cellSize);
}

function drawSnake() {
    if (!snake.length) return;

    const primary = COLORS.primary;
    const dark = darkenColor(primary, 0.35);
    const faceColor = lightenColor(primary, 0.35); // brighter for head

    const tailLevel = foodEaten >= 16 ? 3 : foodEaten >= 10 ? 2 : foodEaten >= 4 ? 1 : 0;

    // Tail length: up to 6 cells for swing; only 2 when snake is short
    let tailLen = Math.min(6, snake.length - 1);
    if (snake.length <= 4) tailLen = 2;

    // 6 discrete taper levels: from paper-thin tip (25%) to near-full (95%)
    const taperSteps = [0.25, 0.35, 0.50, 0.65, 0.80, 0.95];

    // Tail rattle burst logic (only for snakes > 8 cells)
    const now = Date.now();
    if (snake.length > 8 && !tailRattleActive && now > nextRattleTime) {
        tailRattleActive = true;
        tailRattleStart = now;
        nextRattleTime = now + 2000 + Math.random() * 3000;
    }
    if (tailRattleActive && now - tailRattleStart > 400) {
        tailRattleActive = false;
    }

    // Draw body from tail (last) to neck (second from head)
    for (let i = snake.length - 1; i > 0; i--) {
        const seg = snake[i];
        const idxFromTail = snake.length - 1 - i;
        const isTail = idxFromTail < tailLen;

        // Tail rattle: rapid burst with decay, perpendicular to body direction
        let swayX = 0, swayY = 0;
        if (isTail && snake.length > 8 && tailRattleActive) {
            const elapsed = now - tailRattleStart;
            const fade = 1 - elapsed / 450;
            const rapid = Math.sin(now / 8 + idxFromTail * 2.2) * fade;
            // Hard shake: tip reaches neighbouring cells (~half cellSize)
            const strength = (1 - idxFromTail / tailLen) * (cellSize * 0.55);
            if (direction === 'left' || direction === 'right') {
                swayY = rapid * strength;
            } else {
                swayX = rapid * strength;
            }
        }
        const sx = gridOffsetX + seg.x * cellSize + swayX;
        const sy = gridOffsetY + seg.y * cellSize + swayY;

        if (isTail) {
            // 4-level taper: each tail segment has a distinct thickness
            const stepIdx = Math.min(idxFromTail, taperSteps.length - 1);
            const taperRatio = taperSteps[stepIdx];
            const margin = (cellSize * (1 - taperRatio)) / 2;
            const segPad = margin + 1;

            if (tailLevel >= 1) {
                drawTailSegment(sx, sy, idxFromTail, tailLevel, tailLen, dark, faceColor, primary, taperRatio, margin);
            } else {
                // Level 0: just the taper with body color
                ctx.fillStyle = primary;
                ctx.fillRect(sx + segPad, sy + segPad, cellSize - segPad * 2, cellSize - segPad * 2);
                ctx.strokeStyle = dark;
                ctx.lineWidth = 0.5;
                ctx.strokeRect(sx + segPad, sy + segPad, cellSize - segPad * 2, cellSize - segPad * 2);
            }
        } else {
            // Regular body segment — plain primary colour
            const bodyPad = Math.max(2, Math.floor(cellSize * 0.08));
            ctx.fillStyle = primary;
            ctx.fillRect(sx + bodyPad, sy + bodyPad, cellSize - bodyPad * 2, cellSize - bodyPad * 2);
            ctx.fillStyle = lightenColor(primary, 0.1);
            ctx.fillRect(sx + bodyPad, sy + bodyPad, cellSize - bodyPad * 2, Math.max(1, Math.floor(cellSize * 0.1)));
            ctx.strokeStyle = dark;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(sx + bodyPad, sy + bodyPad, cellSize - bodyPad * 2, cellSize - bodyPad * 2);
        }
    }

    // Draw head — brighter face colour
    const head = snake[0];
    const hx = gridOffsetX + head.x * cellSize;
    const hy = gridOffsetY + head.y * cellSize;
    const headPad = Math.max(1, Math.floor(cellSize * 0.06));

    ctx.fillStyle = faceColor;
    ctx.fillRect(hx + headPad, hy + headPad, cellSize - headPad * 2, cellSize - headPad * 2);
    ctx.strokeStyle = dark;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(hx + headPad, hy + headPad, cellSize - headPad * 2, cellSize - headPad * 2);
    ctx.fillStyle = lightenColor(primary, 0.5);
    ctx.fillRect(hx + headPad + 1, hy + headPad + 1, cellSize - headPad * 2 - 2, Math.max(1, Math.floor(cellSize * 0.1)));

    // Eyes
    const eyeSize = Math.max(2, Math.floor(cellSize * 0.15));
    const eyeOff = Math.floor(cellSize * 0.3);
    const cx = hx + cellSize / 2;
    const cy = hy + cellSize / 2;

    ctx.fillStyle = COLORS.bg;
    let e1x, e1y, e2x, e2y;
    switch (direction) {
        case 'right': e1x = cx + eyeOff; e1y = cy - eyeOff; e2x = cx + eyeOff; e2y = cy + eyeOff; break;
        case 'left':  e1x = cx - eyeOff; e1y = cy - eyeOff; e2x = cx - eyeOff; e2y = cy + eyeOff; break;
        case 'up':    e1x = cx - eyeOff; e1y = cy - eyeOff; e2x = cx + eyeOff; e2y = cy - eyeOff; break;
        case 'down':  e1x = cx - eyeOff; e1y = cy + eyeOff; e2x = cx + eyeOff; e2y = cy + eyeOff; break;
    }
    ctx.fillRect(e1x - eyeSize / 2, e1y - eyeSize / 2, eyeSize, eyeSize);
    ctx.fillRect(e2x - eyeSize / 2, e2y - eyeSize / 2, eyeSize, eyeSize);

    const pupilSize = Math.max(1, Math.floor(eyeSize * 0.5));
    ctx.fillStyle = dark;
    ctx.fillRect(e1x - pupilSize / 2, e1y - pupilSize / 2, pupilSize, pupilSize);
    ctx.fillRect(e2x - pupilSize / 2, e2y - pupilSize / 2, pupilSize, pupilSize);
}

function drawTailSegment(sx, sy, idxFromTail, tailLevel, tailLen, dark, light, bodyColor, taperRatio, margin) {
    const segPad = margin + 1;
    const segSize = cellSize - segPad * 2;
    const mid = cellSize / 2;

    // Tapered base (always drawn)
    ctx.fillStyle = bodyColor;
    ctx.fillRect(sx + segPad, sy + segPad, segSize, segSize);

    // Level-specific decorations
    if (tailLevel === 1) {
        // Level 1: subtle rattle rings (thin stripes)
        ctx.strokeStyle = dark;
        ctx.lineWidth = Math.max(1, Math.floor(cellSize * 0.04));
        ctx.strokeRect(sx + segPad + 1, sy + segPad + 1, segSize - 2, segSize - 2);
    } else if (tailLevel === 2) {
        // Level 2: alternating bands
        const stripeColor = idxFromTail % 2 === 0 ? light : dark;
        ctx.fillStyle = stripeColor;
        ctx.fillRect(sx + segPad + 1, sy + segPad + 1, segSize - 2, segSize - 2);
        // Rattle button at the very tip
        if (idxFromTail === 0) {
            ctx.strokeStyle = light;
            ctx.lineWidth = Math.max(1, Math.floor(cellSize * 0.06));
            ctx.strokeRect(sx + segPad + 2, sy + segPad + 2, segSize - 4, segSize - 4);
        }
    } else if (tailLevel === 3) {
        // Level 3: spiked tail
        const spikeColor = idxFromTail % 2 === 0 ? light : dark;
        ctx.fillStyle = spikeColor;
        ctx.fillRect(sx + segPad + 1, sy + segPad + 1, segSize - 2, segSize - 2);
        // Side spikes
        const spike = Math.max(2, Math.floor(cellSize * 0.1));
        ctx.fillStyle = dark;
        ctx.fillRect(sx + mid - spike / 2, sy, spike, spike);                     // top
        ctx.fillRect(sx + mid - spike / 2, sy + cellSize - spike, spike, spike);  // bottom
        if (idxFromTail === 0) {
            // Tip spike pointing outward
            ctx.fillRect(sx, sy + mid - spike / 2, spike, spike);                 // left
            ctx.fillRect(sx + cellSize - spike, sy + mid - spike / 2, spike, spike); // right
        }
    }
}

function lightenColor(color, amount) {
    if (color.startsWith('#')) color = hexToRgb(color);
    const r = Math.min(255, Math.round(color.r + (255 - color.r) * amount));
    const g = Math.min(255, Math.round(color.g + (255 - color.g) * amount));
    const b = Math.min(255, Math.round(color.b + (255 - color.b) * amount));
    return `rgb(${r},${g},${b})`;
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

function getAppleIndexForTheme(primaryColor) {
    // Match primary color hue to the closest apple (0=red, 1=green, 2=yellow, 3=blue, 4=purple)
    if (!primaryColor) return 3;
    let hex = primaryColor.trim();
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    const rgb = parseInt(hex, 16);
    if (isNaN(rgb)) return 3;
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = rgb & 0xff;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const range = max - min;
    if (range < 30) return isNight ? 2 : 3; // gray: yellow for dark, blue for light

    // Calculate hue (0-360)
    let hue = 0;
    if (max === r) {
        hue = 60 * ((g - b) / range);
    } else if (max === g) {
        hue = 60 * (2 + (b - r) / range);
    } else {
        hue = 60 * (4 + (r - g) / range);
    }
    if (hue < 0) hue += 360;

    // Map hue to apples (approximate ranges)
    // Red:    340-360, 0-20
    // Yellow: 30-70
    // Green:  80-160
    // Blue:   180-260
    // Purple: 270-330

    if (hue >= 340 || hue < 20)  return 0; // Red
    if (hue >= 20 && hue < 75)   return 2; // Yellow
    if (hue >= 75 && hue < 170)  return 1; // Green
    if (hue >= 170 && hue < 265) return 3; // Blue
    if (hue >= 265 && hue < 340) return 4; // Purple
    return 3; // fallback blue
}

function drawOverlay() {
    const width = SETTINGS.CANVAS_WIDTH;
    const height = SETTINGS.CANVAS_HEIGHT;

    if (gameState === 'ready') {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 38px sans-serif';
        ctx.fillStyle = COLORS.text;
        ctx.fillText('Blink to Start', (width / 2) - 18, (height / 2) - 32);
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

            // Load apple sprites if provided (red, green, yellow, blue)
            if (payload.appleSprites && payload.appleSprites.length >= 4) {
                appleSprites = payload.appleSprites;
            }

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
                // Re-evaluate apple for new theme
                appleThemeIndex = getAppleIndexForTheme(COLORS.primary);
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
