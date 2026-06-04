class SoundHandler {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.initialized = false;
        this.enabled = true;

        // Background Music
        this.bgmSource = null;
        this.bgmGain = null;
        this.bgmEnabled = false;
        this.bgmVolume = 0.1;
        this.bgmBuffer = null;

        // --- ROCKY TRAINING SOUND ---
        this.rockySource = null;
        this.rockyGain = null;
        this.rockyFilter = null;
        this.rockyBuffer = null;
    }

    init() {
        if (this.initialized) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3; // Master volume
            this.masterGain.connect(this.ctx.destination);

            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = this.bgmVolume;
            this.bgmGain.connect(this.masterGain);

            this.initialized = true;
            console.log('SoundHandler initialized');
        } catch (e) {
            console.error('Web Audio API not supported', e);
        }
    }

    // Ensure context is running (needed for Chrome autoplay policy)
    async resume() {
        if (!this.initialized) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    playTone(freq, type, duration, volume = 0.5, delay = 0) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime + delay;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start(now);
        osc.stop(now + duration);
    }

    // --- GENERIC UI ---
    playClick() {
        this.playTone(600, 'sine', 0.1, 0.2);
    }

    playHover() {
        this.playTone(800, 'triangle', 0.05, 0.05);
    }

    playSuccess() {
        if (!this.enabled || !this.initialized) {
            this.init();
            if (!this.initialized) return;
        }
        this.resume();

        const now = this.ctx.currentTime;
        this.playTone(400, 'sine', 0.1, 0.2, 0);
        this.playTone(600, 'sine', 0.2, 0.2, 0.1);
    }

    playToggle(isOn) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime;
        const oscillator = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(this.masterGain);

        oscillator.type = 'sine';

        if (isOn) {
            oscillator.frequency.setValueAtTime(300, now);
            oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        } else {
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        }

        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        oscillator.start(now);
        oscillator.stop(now + 0.1);
    }

    // --- DINO GAME ---
    playDinoJump() {
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        this.playTone(150, 'square', 0.15, 0.1);
        const now = this.ctx.currentTime;
        // Frequency ramp for that "jump" feel
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playDinoDead() {
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        // Dramatic low frequency drop + noise
        const now = this.ctx.currentTime;
        this.playTone(100, 'sawtooth', 0.5, 0.3);

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.5);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.5);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);
    }

    playDinoPause() {
        this.playTone(440, 'sine', 0.1, 0.2, 0);
        this.playTone(330, 'sine', 0.1, 0.2, 0.05);
    }

    // --- SNAKE GAME ---
    playSnakeEat() {
        // Quick chomp sound
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.05);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.15);
    }

    playSnakeDead() {
        // Descending hiss
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.5);

        // Final thud
        this.playTone(60, 'sine', 0.15, 0.3, 0.45);
    }

    playSnakeStart() {
        // Rising rattle start
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        const now = this.ctx.currentTime;
        // Short rattle burst
        for (let i = 0; i < 3; i++) {
            const t = now + i * 0.08;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200 + i * 100, t);
            gain.gain.setValueAtTime(0.06, t);
            gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(t);
            osc.stop(t + 0.06);
        }
    }

    // --- RPS GAME ---
    playRPSStart() {
        // Trumpet-like flourish
        this.playTone(440, 'sawtooth', 0.2, 0.1, 0);
        this.playTone(554, 'sawtooth', 0.2, 0.1, 0.1);
        this.playTone(659, 'sawtooth', 0.4, 0.1, 0.2);
    }

    playRPSMove() {
        // Fast technical blurp
        this.playTone(800, 'square', 0.05, 0.1);
    }

    playRPSWarp() {
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        // Liquid switch sound
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.exponentialRampToValueAtTime(400, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playRPSWin() {
        this.playTone(523.25, 'sine', 0.1, 0.2, 0); // C5
        this.playTone(659.25, 'sine', 0.1, 0.2, 0.1); // E5
        this.playTone(783.99, 'sine', 0.3, 0.2, 0.2); // G5
    }

    playRPSLose() {
        this.playTone(392, 'square', 0.2, 0.1, 0); // G4
        this.playTone(311.13, 'square', 0.2, 0.1, 0.15); // Eb4
        this.playTone(261.63, 'square', 0.5, 0.1, 0.3); // C4
    }

    // --- ML TRAINING ---
    playMLTrain() {
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        // Ascending technical Arpeggio
        const now = this.ctx.currentTime;
        [440, 523, 659, 880].forEach((f, i) => {
            this.playTone(f, 'sine', 0.15, 0.1, i * 0.1);
        });
    }

    playMLSwitch() {
        // Mechanical click-clunck
        this.playTone(400, 'triangle', 0.05, 0.2, 0);
        this.playTone(200, 'triangle', 0.05, 0.2, 0.05);
    }

    playMLTreeStep() {
        // Digital blip
        this.playTone(1200, 'sine', 0.03, 0.05);
    }

    playSliderTick() {
        // Very short, subtle technical tick
        this.playTone(800, 'sine', 0.015, 0.03);
    }

    // --- ROCKY TRAINING SOUND ---
    async loadRockyBuffer() {
        if (!this.initialized) this.init();
        if (!this.ctx) return null;
        if (this.rockyBuffer) return this.rockyBuffer;

        try {
            console.log('Fetching Rocky Sound from /Resources/Sliding Rock.mp3');
            const response = await fetch('/Resources/Sliding Rock.mp3');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const arrayBuffer = await response.arrayBuffer();
            this.rockyBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log('Rocky buffer decoded successfully');
            return this.rockyBuffer;
        } catch (e) {
            console.warn('Failed to load rocky audio file. Falling back to procedural noise.', e);
            return null;
        }
    }

    async startRockySliding(volume = 0.4) {
        if (!this.enabled || !this.initialized) return;
        await this.resume();
        if (this.rockySource) return;

        // Ensure file-based buffer is loaded
        let buffer = this.rockyBuffer;
        if (!buffer) {
            buffer = await this.loadRockyBuffer();
        }

        if (!buffer) {
            console.warn('Rocky training sound not available (file missing/failed to load)');
            return;
        }

        this.rockySource = this.ctx.createBufferSource();
        this.rockySource.buffer = buffer;
        this.rockySource.loop = true;

        // Use the 3-4s segment requested by the user
        this.rockySource.loopStart = 3.0;
        this.rockySource.loopEnd = 4.0;

        this.rockyFilter = this.ctx.createBiquadFilter();
        this.rockyFilter.type = 'lowpass';
        this.rockyFilter.frequency.setValueAtTime(600, this.ctx.currentTime);
        this.rockyFilter.Q.setValueAtTime(1.5, this.ctx.currentTime);

        this.rockyGain = this.ctx.createGain();
        this.rockyGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this.rockyGain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.4);

        this.rockySource.connect(this.rockyFilter);
        this.rockyFilter.connect(this.rockyGain);
        this.rockyGain.connect(this.masterGain);

        // Start with the correct 3s offset
        this.rockySource.start(0, 3.0);

        // Subtle modulation for extra "visceral" grit
        this._rockyModulator = setInterval(() => {
            if (this.rockyFilter && this.ctx) {
                const freq = 500 + Math.random() * 300;
                this.rockyFilter.frequency.setTargetAtTime(freq, this.ctx.currentTime, 0.1);
            }
        }, 150);
    }

    stopRockySliding() {
        if (this._rockyModulator) clearInterval(this._rockyModulator);
        if (this.rockyGain && this.ctx) {
            this.rockyGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
            const source = this.rockySource;
            setTimeout(() => {
                try { if (source) source.stop(); } catch (e) { }
            }, 400);
        }
        this.rockySource = null;
        this.rockyGain = null;
        this.rockyFilter = null;
    }

    playConnectionZap() {
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        // Electric zap sound
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    // --- DATA COLLECTION ---
    playDataSave() {
        // Success melody with a technical edge
        this.playTone(600, 'sine', 0.1, 0.2, 0);
        this.playTone(900, 'sine', 0.2, 0.2, 0.05);
    }

    playDataCollect() {
        // Quick "pop"
        this.playTone(1000, 'sine', 0.03, 0.1);
    }

    playDataFetch() {
        if (!this.enabled || !this.initialized) { this.init(); if (!this.initialized || !this.ctx) return; }
        this.resume();
        // High to low data-fetching sound
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2000, now);
        osc.frequency.linearRampToValueAtTime(1000, now + 0.1);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.connect(gain);
        gain.connect(this.masterGain);
        osc.start(now);
        osc.stop(now + 0.1);
    }

    playSettingSwitch() {
        this.playTone(800, 'sine', 0.05, 0.1);
    }

    // --- BACKGROUND MUSIC ---
    async loadBackgroundMusic(source) {
        if (!source) return;
        await this.resume();

        try {
            let arrayBuffer;

            if (source.startsWith('data:') || (source.length > 200 && !source.includes('/'))) {
                // Legacy base64 support
                console.log('Detected base64 BGM source');
                const base64Data = source.split(',')[1] || source;
                const binaryString = window.atob(base64Data);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }
                arrayBuffer = bytes.buffer;
            } else {
                // Support both relative and absolute URLs
                console.log('Fetching BGM from URL:', source);
                const response = await fetch(source);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for ${source}`);
                }
                const contentType = response.headers.get('Content-Type');
                console.log('BGM fetch status:', response.status, 'Type:', contentType);

                arrayBuffer = await response.arrayBuffer();
                console.log('BGM buffer size:', arrayBuffer.byteLength, 'bytes');

                if (arrayBuffer.byteLength === 0) {
                    throw new Error('Fetched BGM buffer is empty (0 bytes)');
                }
            }

            try {
                this.bgmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                console.log('BGM decoded successfully');
            } catch (decodeError) {
                console.error('Audio decoding failed. This usually means the file format is unsupported or the file is corrupted.', decodeError);
                throw decodeError;
            }

            if (this.bgmEnabled) {
                this.startBackgroundMusic();
            }
        } catch (e) {
            console.error('Failed to load BGM:', e);
        }
    }

    startBackgroundMusic() {
        if (!this.initialized) this.init();
        this.bgmEnabled = true;

        if (this.bgmSource) {
            this.bgmSource.stop();
        }

        if (!this.bgmBuffer) return;

        this.bgmSource = this.ctx.createBufferSource();
        this.bgmSource.buffer = this.bgmBuffer;
        this.bgmSource.loop = true;
        this.bgmSource.connect(this.bgmGain);
        this.bgmSource.start(0);
    }

    stopBackgroundMusic() {
        this.bgmEnabled = false;
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource = null;
        }
    }

    setBgmVolume(volume) {
        // Safety check for non-finite values
        const vol = isFinite(volume) ? volume : 0.3;
        this.bgmVolume = vol;
        if (this.bgmGain) {
            this.bgmGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
        }
    }
}

export const soundHandler = new SoundHandler();