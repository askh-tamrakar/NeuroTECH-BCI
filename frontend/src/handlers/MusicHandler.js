/**
 * MusicHandler - Specialized handler for brain-responsive music playback.
 * 
 * Supports state-folder-based playback: loads tracks from organized folders
 * (calm/, focus/, stress/, relaxed/, drowsy/) and plays random tracks
 * based on detected mental state.
 */
class MusicHandler {
    constructor() {
        this.ctx = null;
        this.source = null;
        this.gainNode = null;
        this.filterNode = null;
        this.analyser = null;
        this.buffer = null;
        this.isPlaying = false;
        this.initialized = false;
        this.currentSourceUrl = null;
        this.currentState = null;
        this._generation = 0; // cancellation token for async playStateTrack

        // Minimum seconds a track must play before a state-driven switch is allowed.
        // Prevents rapid track-hopping during oscillating mind states.
        this._minTrackDurationMs = 8000;  // 8 seconds
        this._trackStartedAt = 0;

        // State folder track cache: { state: [url, ...] }
        this.stateTracks = {};
        this.baseAudioPath = '/Resources/audio/eeg_soundtrack';

        // State effects configuration
        this.effects = {
            'Focus': { filterType: 'highpass', frequency: 100, detune: 0, playbackRate: 1.05, volume: 0.3 },
            'Calm': { filterType: 'lowpass', frequency: 800, detune: 0, playbackRate: 0.95, volume: 0.2 },
            'Relaxed': { filterType: 'lowpass', frequency: 1200, detune: 0, playbackRate: 0.9, volume: 0.2 },
            'Stressed': { filterType: 'highpass', frequency: 1200, detune: 100, playbackRate: 1.1, volume: 0.25 },
            'Drowsy': { filterType: 'allpass', frequency: 1000, detune: 0, playbackRate: 1.15, volume: 0.4 },
            'Neutral': { filterType: 'allpass', frequency: 20000, detune: 0, playbackRate: 1.0, volume: 0.3 }
        };

        // Known tracks per state folder (static manifest to avoid directory listing)
        this._manifest = {
            calm: [
                'andriig-nature-calm-music-507173.mp3',
                'mandakimdk-xylophone-and-forest-307174.mp3',
            ],
            focus: [
                'kaden_cook-countdown-219722.mp3',
                'kandlaker-funk-rock-2-226325.mp3',
            ],
            stress: [
                'aberrantrealities-dark-desolation-ambience-219091.mp3',
            ],
            relaxed: [
                'krasnoshchok-background-music-soft-calm-404429.mp3',
            ],
            drowsy: [
                'meditativetiger-stress-melt-gentle-singing-bowl-waves-489168.mp3',
            ],
        };
    }

    async init() {
        if (this.initialized) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            
            // Setup nodes
            this.gainNode = this.ctx.createGain();
            this.filterNode = this.ctx.createBiquadFilter();
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            
            // Connect chain: Source -> Filter -> Gain -> Analyser -> Destination
            this.filterNode.connect(this.gainNode);
            this.gainNode.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
            
            this.initialized = true;

            // Build state track URLs from manifest
            for (const [folder, files] of Object.entries(this._manifest)) {
                this.stateTracks[folder] = files.map(f => `${this.baseAudioPath}/${folder}/${f}`);
            }
        } catch (e) {
            console.error('MusicHandler: AudioContext failed', e);
        }
    }

    async resume() {
        if (!this.initialized) await this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    async loadTrack(url) {
        if (!url) return;
        if (this.currentSourceUrl === url && this.buffer) return;

        await this.resume();
        this.currentSourceUrl = url;

        try {
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.buffer = await this.ctx.decodeAudioData(arrayBuffer);
        } catch (e) {
            console.error('MusicHandler: Failed to load track', e);
        }
    }

    /** Get tracks for a state folder name */
    getTracksForState(state) {
        const folderMap = {
            'Focus': 'focus', 'Calm': 'calm', 'Relaxed': 'relaxed',
            'Stressed': 'stress', 'Drowsy': 'drowsy', 'Neutral': 'calm',
        };
        const folder = folderMap[state] || 'calm';
        return this.stateTracks[folder] || [];
    }

    /** Load and play a random track from the given state folder */
    async playStateTrack(state, volume) {
        // Enforce minimum track duration — don't switch too soon
        if (this.isPlaying && this._trackStartedAt > 0) {
            const elapsed = Date.now() - this._trackStartedAt;
            if (elapsed < this._minTrackDurationMs) {
                // Still within min duration: just adjust volume/effects, no switch
                this.setStateVolume(volume);
                this.applyStateEffect(state);
                return;
            }
        }

        const tracks = this.getTracksForState(state);
        if (tracks.length === 0) return;

        const url = tracks[Math.floor(Math.random() * tracks.length)];

        // Stop current source without incrementing generation
        // (we want THIS call to proceed, not cancel itself)
        if (this.source) {
            try { this.source.stop(); } catch (_) {}
            this.source.disconnect();
            this.source = null;
        }
        this.isPlaying = false;

        // Claim a generation token — if stop() or another playStateTrack()
        // runs during the await below, _generation will change and we bail out
        const myGen = ++this._generation;

        await this.loadTrack(url);

        // Cancelled — stop() or another playStateTrack() was called while loading
        if (this._generation !== myGen) return;

        this.currentState = state;
        this._trackStartedAt = Date.now();

        if (this.buffer) {
            this.source = this.ctx.createBufferSource();
            this.source.buffer = this.buffer;
            this.source.loop = true;
            this.source.connect(this.filterNode);

            // Seek to random position
            const offset = Math.random() * this.buffer.duration;
            this.source.start(0, offset);
            this.isPlaying = true;

            // Apply volume based on stateLevel (0-100)
            const vol = typeof volume === 'number' ? Math.max(0, Math.min(1, volume / 100)) : 0.3;
            this.gainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
        }

        this.applyStateEffect(state);
    }

    /** Update volume based on state level (0-100) */
    setStateVolume(level) {
        if (!this.gainNode || !this.ctx) return;
        const vol = Math.max(0.05, Math.min(1, level / 100));
        this.gainNode.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.3);
    }

    play() {
        if (!this.buffer || this.isPlaying) return;
        
        this.source = this.ctx.createBufferSource();
        this.source.buffer = this.buffer;
        this.source.loop = true;
        this.source.connect(this.filterNode);
        this.source.start(0);
        this.isPlaying = true;
    }

    stop() {
        this._generation++; // cancel any in-flight async playStateTrack
        this._trackStartedAt = 0;
        if (this.source) {
            try { this.source.stop(); } catch (_) {}
            this.source.disconnect();
            this.source = null;
        }
        this.isPlaying = false;
    }

    applyStateEffect(state) {
        if (!this.initialized || !this.filterNode) return;
        
        const effect = this.effects[state] || this.effects['Neutral'];
        const now = this.ctx.currentTime;
        
        // Smooth transitions
        this.filterNode.type = effect.filterType;
        this.filterNode.frequency.setTargetAtTime(effect.frequency, now, 0.5);
        this.filterNode.detune.setTargetAtTime(effect.detune, now, 0.5);
        
        this.gainNode.gain.setTargetAtTime(effect.volume, now, 0.5);
        
        if (this.source) {
            this.source.playbackRate.setTargetAtTime(effect.playbackRate, now, 1.0);
        }
    }

    getFrequencyData() {
        if (!this.analyser) return new Uint8Array(0);
        const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }
}

export const musicHandler = new MusicHandler();
