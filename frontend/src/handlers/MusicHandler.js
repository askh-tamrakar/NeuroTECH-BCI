/**
 * MusicHandler - Specialized handler for brain-responsive music playback.
 * 
 * This handler manages background music with dynamic audio filters
 * that react to mental states (Focus, Calm, Stress, Drowsy).
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
        
        // State effects configuration
        this.effects = {
            'Focus': { filterType: 'highpass', frequency: 100, detune: 0, playbackRate: 1.05, volume: 0.3 },
            'Calm': { filterType: 'lowpass', frequency: 800, detune: 0, playbackRate: 0.95, volume: 0.2 },
            'Relax': { filterType: 'lowpass', frequency: 1200, detune: 0, playbackRate: 0.9, volume: 0.2 },
            'Stress': { filterType: 'highpass', frequency: 1200, detune: 100, playbackRate: 1.1, volume: 0.25 },
            'Drowsy': { filterType: 'allpass', frequency: 1000, detune: 0, playbackRate: 1.15, volume: 0.4 },
            'Neutral': { filterType: 'allpass', frequency: 20000, detune: 0, playbackRate: 1.0, volume: 0.3 }
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
            console.log('MusicHandler initialized');
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
            console.log('MusicHandler: Track loaded');
        } catch (e) {
            console.error('MusicHandler: Failed to load track', e);
        }
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
        if (this.source) {
            this.source.stop();
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
