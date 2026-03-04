class SoundHandler {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.initialized = false;
        this.enabled = true;
<<<<<<< HEAD
=======

        // Background Music
        this.bgmSource = null;
        this.bgmGain = null;
        this.bgmEnabled = false;
        this.bgmVolume = 0.1;
        this.bgmBuffer = null;
>>>>>>> extra-features
    }

    init() {
        if (this.initialized) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.value = 0.3; // Master volume
            this.masterGain.connect(this.ctx.destination);
<<<<<<< HEAD
=======

            this.bgmGain = this.ctx.createGain();
            this.bgmGain.gain.value = this.bgmVolume;
            this.bgmGain.connect(this.masterGain);

>>>>>>> extra-features
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

<<<<<<< HEAD
    playTone(freq, type, duration, volume = 0.5) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

=======
    playTone(freq, type, duration, volume = 0.5, delay = 0) {
        if (!this.enabled || !this.initialized) return;
        this.resume();

        const now = this.ctx.currentTime + delay;
>>>>>>> extra-features
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
<<<<<<< HEAD
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
=======
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(volume, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + duration);
>>>>>>> extra-features

        osc.connect(gain);
        gain.connect(this.masterGain);

<<<<<<< HEAD
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playClick() {
        // Soothing soft click (sine wave, quick decay)
=======
        osc.start(now);
        osc.stop(now + duration);
    }

    // --- GENERIC UI ---
    playClick() {
>>>>>>> extra-features
        this.playTone(600, 'sine', 0.1, 0.2);
    }

    playHover() {
<<<<<<< HEAD
        // Very subtle high pitch tick
        this.playTone(800, 'triangle', 0.05, 0.05);
    }

=======
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

>>>>>>> extra-features
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
<<<<<<< HEAD
            // Rising pitch (ON)
            oscillator.frequency.setValueAtTime(300, now);
            oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        } else {
            // Falling pitch (OFF)
=======
            oscillator.frequency.setValueAtTime(300, now);
            oscillator.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        } else {
>>>>>>> extra-features
            oscillator.frequency.setValueAtTime(600, now);
            oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.1);
        }

        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        oscillator.start(now);
        oscillator.stop(now + 0.1);
    }

<<<<<<< HEAD
    playSliderTick() {
        // Wooden/mechanical tick
        this.playTone(200, 'triangle', 0.03, 0.15);
    }

    playConnectionZap() {
        if (!this.enabled || !this.initialized) {
            this.init(); // Auto-init if needed
            if (!this.initialized) return;
        }
        this.resume();

        const now = this.ctx.currentTime;
        const mainGain = this.ctx.createGain();
        mainGain.connect(this.masterGain);

        // 1. The "Zap" (Sawtooth burst)
        const zapOsc = this.ctx.createOscillator();
        const zapGain = this.ctx.createGain();
        zapOsc.type = 'sawtooth';
        zapOsc.frequency.setValueAtTime(120, now);
        zapOsc.frequency.exponentialRampToValueAtTime(50, now + 0.15); // Quick drop

        // Jitter/Modulate the zap frequency for "sparking" effect
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        modulator.frequency.value = 50; // Fast rumble
        modGain.gain.value = 500; // Deep modulation
        modulator.connect(modGain);
        modGain.connect(zapOsc.frequency);
        modulator.start(now);
        modulator.stop(now + 0.2);

        zapGain.gain.setValueAtTime(0.4, now);
        zapGain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        zapOsc.connect(zapGain);
        zapGain.connect(mainGain);
        zapOsc.start(now);
        zapOsc.stop(now + 0.2);

        // 2. White Noise Burst (The "Frizz")
        const bufferSize = this.ctx.sampleRate * 0.2; // 0.2 seconds
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.3, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        // Highpass filter to keep only the "crackle"
        const highpass = this.ctx.createBiquadFilter();
        highpass.type = 'highpass';
        highpass.frequency.value = 1000;

        noise.connect(highpass);
        highpass.connect(noiseGain);
        noiseGain.connect(mainGain);
        noise.start(now);

        // 3. Electrical Hum (Mains hum connection)
        const humOsc = this.ctx.createOscillator();
        const humGain = this.ctx.createGain();
        humOsc.type = 'square';
        humOsc.frequency.setValueAtTime(55, now); // Between 50Hz and 60Hz
        humGain.gain.setValueAtTime(0.1, now);
        humGain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); // Longer tail

        humOsc.connect(humGain);
        humGain.connect(mainGain);
        humOsc.start(now);
        humOsc.stop(now + 0.3);
=======
    // --- DINO GAME ---
    playDinoJump() {
        // Upward sliding frequency
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

    playConnectionZap() {
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
>>>>>>> extra-features
    }
}

export const soundHandler = new SoundHandler();
